#!/usr/bin/env node
// dsh-mcp-manager install.mjs — the single cross-platform installer core.
// Runs on Windows / macOS / Linux with any Node.js >= 18 (no dependencies).
//
// install.ps1 (Windows) and install.sh (macOS / Linux) are thin wrappers that
// just forward their arguments to this file.
//
// What it does (idempotent — safe to run repeatedly):
//   1. copy this package to        <dshHome>/local-packages/dsh-mcp-manager
//      (source of record, kept outside node_modules so DSH upgrades never touch it)
//   2. copy it to                  <dshHome>/profiles/node_modules/dsh-mcp-manager
//      (a PLAIN copy on purpose — a symlink would make Node ESM resolve the
//       plugin's realpath where @deepseek-ai/dsh-tools cannot be found)
//   3. append the loader row (`id: mcp-manager`) to
//      <dshHome>/profiles/<profile>/cordis.patch.yml
//      (idempotent; keeps the patch a valid top-level YAML array)
//
//   --repair  additionally bumps the loader row's config.version to force an
//             HMR re-apply, then polls POST /dsh-mcp-manager/api until it
//             answers {ok:true} (default 30 s).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PKG_NAME = 'dsh-mcp-manager'
const LOADER_ID = 'mcp-manager'
const DEFAULT_PROFILE = 'web'
const DEFAULT_PORT = 3080
const REPAIR_TIMEOUT_MS = 30000

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const log = (msg) => console.log(msg)
const warn = (msg) => console.warn('[警告] ' + msg)
const fail = (msg) => { console.error('[错误] ' + msg); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
    return AbortSignal.timeout(ms)
  const ac = new AbortController()
  setTimeout(() => ac.abort(), ms)
  return ac.signal
}

// Recursive copy that skips heavyweight / irrelevant dirs (node_modules, .git).
// The destination is wiped first so stale files never survive an upgrade.
function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (p) => {
      const base = path.basename(p)
      return base !== 'node_modules' && base !== '.git'
    },
  })
}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    dshHome: process.env.DSH_HOME || null,
    profile: DEFAULT_PROFILE,
    port: DEFAULT_PORT,
    repair: false,
    skipPatch: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      i++
      if (i >= argv.length) fail('缺少参数值: ' + a + '（用 --help 查看用法）')
      return argv[i]
    }
    switch (a) {
      case '--dsh-home': opts.dshHome = next(); break
      case '--profile': opts.profile = next(); break
      case '--port':
        opts.port = parseInt(next(), 10)
        if (Number.isNaN(opts.port)) fail('--port 需为数字')
        break
      case '--repair': opts.repair = true; break
      case '--skip-patch': opts.skipPatch = true; break
      case '-h':
      case '--help': opts.help = true; break
      default: fail('未知参数: ' + a + '（用 --help 查看用法）')
    }
  }
  if (!opts.dshHome) opts.dshHome = path.join(os.homedir(), '.dsh')
  return opts
}

function printUsage() {
  log(`dsh-mcp-manager 安装脚本（跨平台：Windows / macOS / Linux，需要 Node.js >= 18）

用法:
  node install.mjs [选项]

选项:
  --dsh-home <path>   DSH 主目录（含 profiles/、settings.yaml 的目录）。
                      默认取 $DSH_HOME 环境变量，否则 ~/.dsh
  --profile <name>    要安装到的 profile 名（默认 ${DEFAULT_PROFILE}）
  --port <n>          修复模式下探测 API 的端口，即 DSH Web 端口（默认 ${DEFAULT_PORT}）
  --repair            修复模式：重新部署 + 递增 loader 行 config.version 触发
                      HMR 重应用 + 轮询 API 直到返回 {ok:true}
  --skip-patch        只复制包文件，不修改 cordis.patch.yml
  -h, --help          显示本帮助

示例:
  node install.mjs
  node install.mjs --dsh-home D:\\path\\.dsh --profile web
  node install.mjs --repair --port 3080`)
}

// ---------------------------------------------------------------------------
// loader-row patch editing (line based, keeps the patch a valid YAML array)
// ---------------------------------------------------------------------------
// IMPORTANT: in the DSH loader patch dialect (applyEntryPatches), a plain
// `- id: x` row is an OVERRIDE of an already-existing entry and is SKIPPED with
// a warning when no such entry exists — it can never ADD a new plugin. Adding
// entries requires the `insert` form (same shape the plugin itself uses for
// MCP server rows). This is the whole plugin's loader row:
//
//   - insert:
//       - id: mcp-manager
//         name: dsh-mcp-manager
//         config:
//           version: 1
function toLoaderBlock(version) {
  return [
    '- insert:',
    '    - id: ' + LOADER_ID,
    '      name: ' + PKG_NAME,
    '      config:',
    '        version: ' + version,
  ].join('\n')
}

const LOADER_BLOCK = toLoaderBlock(1)

const reLoaderChild = () => new RegExp("^(\\s+)- id:\\s*'?" + LOADER_ID + "'?\\s*$")
const reLoaderPlain = () => new RegExp("^- id:\\s*'?" + LOADER_ID + "'?\\s*$")

// Find the loader entry: either inside a top-level `- insert:` block (current
// form) or as a legacy plain top-level row (old form, converted on write).
// Returns the whole owning block's line range plus its form.
function findLoaderEntry(content) {
  const lines = content.split(/\r?\n/)
  const n = lines.length
  for (let i = 0; i < n; i++) {
    if (/^- insert:/.test(lines[i])) {
      let end = i + 1
      while (end < n && !/^- /.test(lines[end])) end++
      if (lines.slice(i, end).some((l) => reLoaderChild().test(l)))
        return { start: i, end, lines: lines.slice(i, end), form: 'insert' }
      continue
    }
    if (reLoaderPlain().test(lines[i])) {
      let end = i + 1
      while (end < n && !/^- /.test(lines[end])) end++
      return { start: i, end, lines: lines.slice(i, end), form: 'plain' }
    }
  }
  return null
}

function versionOf(lines) {
  for (const line of lines) {
    const m = line.match(/^(\s*)version:\s*(\d+)\s*$/)
    if (m) return parseInt(m[2], 10)
  }
  return 1
}

// Bump config.version in place; inserts `version: 1` when missing. Returns the
// new version number.
function bumpVersion(lines) {
  let configIdx = -1
  let configIndent = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)config:\s*$/)
    if (m) { configIdx = i; configIndent = m[1].length; break }
  }
  if (configIdx < 0) {
    lines.push('  config:', '    version: 2')
    return 2
  }
  for (let i = configIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^-\s/.test(line)) break // next top-level entry
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.match(/^\s*/)[0].length
    if (indent <= configIndent) break // config block ended
    const m = line.match(/^(\s*)version:\s*(\d+)\s*$/)
    if (m) {
      const v = parseInt(m[2], 10) + 1
      lines[i] = m[1] + 'version: ' + v
      return v
    }
  }
  lines.splice(configIdx + 1, 0, ' '.repeat(configIndent + 2) + 'version: 1')
  return 1
}

function appendLoaderBlock(content, block) {
  if (/^\[\]\s*$/m.test(content)) return content.replace(/^\[\]\s*$/m, block + '\n')
  let c = content
  if (!c.trim()) return block + '\n'
  if (!/\n$/.test(c)) c += '\n'
  return c + block + '\n'
}

function replaceLines(content, start, end, newLines) {
  const all = content.split(/\r?\n/)
  all.splice(start, end - start, ...newLines)
  return all.join('\n')
}

// Ensure the loader entry exists (append the `insert` block if missing) and
// optionally bump its config.version. A legacy plain `- id: mcp-manager` row is
// converted to the working insert form on the fly. Returns the resulting
// version for reporting.
function patchLoader(patchPath, bump) {
  let content = ''
  if (fs.existsSync(patchPath)) content = fs.readFileSync(patchPath, 'utf8')

  const entry = findLoaderEntry(content)
  if (entry) {
    if (entry.form === 'plain') {
      // Legacy row that the DSH loader silently skips — convert it to an
      // insert block (bumping when asked) so the plugin actually mounts.
      const v = bump ? versionOf(entry.lines) + 1 : versionOf(entry.lines)
      content = replaceLines(content, entry.start, entry.end, toLoaderBlock(v).split('\n'))
      fs.mkdirSync(path.dirname(patchPath), { recursive: true })
      fs.writeFileSync(patchPath, content, 'utf8')
      return v
    }
    if (bump) {
      const lines = entry.lines.slice()
      const v = bumpVersion(lines)
      content = replaceLines(content, entry.start, entry.end, lines)
      fs.mkdirSync(path.dirname(patchPath), { recursive: true })
      fs.writeFileSync(patchPath, content, 'utf8')
      return v
    }
    return versionOf(entry.lines)
  }

  const updated = appendLoaderBlock(content, LOADER_BLOCK)
  fs.mkdirSync(path.dirname(patchPath), { recursive: true })
  fs.writeFileSync(patchPath, updated, 'utf8')
  return 1
}

// ---------------------------------------------------------------------------
// --repair: poll the plugin API until it answers {ok:true}
// ---------------------------------------------------------------------------
async function pollApi(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/dsh-mcp-manager/api`
  const deadline = Date.now() + timeoutMs
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager' },
        body: JSON.stringify({ op: 'mcpm-list', args: {} }),
        signal: timeoutSignal(2000),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data && data.ok) return true
      }
    } catch (e) { /* DSH not answering yet */ }
    if (attempt === 1 || attempt % 5 === 0)
      log(`    已等待 ${Math.round((Date.now() - (deadline - timeoutMs)) / 1000)} 秒…（${attempt} 次探测）`)
    await sleep(1000)
  }
  return false
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { printUsage(); return }

  // Sanity-check the shipped artifacts we are about to deploy.
  for (const f of ['package.json', 'lib/index.js', 'lib/client.js']) {
    if (!fs.existsSync(path.join(SCRIPT_DIR, f)))
      fail(`未找到 ${f}：请确认从 dsh-mcp-manager 包目录运行，或先执行 npm run build`)
  }

  const dshHome = opts.dshHome
  const localPkg = path.join(dshHome, 'local-packages', PKG_NAME)
  const deployDir = path.join(dshHome, 'profiles', 'node_modules', PKG_NAME)
  const profileDir = path.join(dshHome, 'profiles', opts.profile)
  const projectPatch = path.join(profileDir, 'cordis.patch.yml')

  // When run through npx (npm cache or a `node_modules` install), the package
  // lives in a temp directory — everything still works (the source is copied
  // from SCRIPT_DIR), we just say so for clarity.
  const runViaNpx = /node_modules[\\/]/.test(SCRIPT_DIR)

  log(`操作系统: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}`)
  if (runViaNpx) log('运行来源: npx（npm 缓存 / GitHub 直拉的临时安装）')
  log(`DSH 主目录: ${dshHome}`)
  log(`profile: ${opts.profile}`)
  if (!fs.existsSync(path.join(dshHome, 'profiles')))
    warn(`未在 ${dshHome} 下找到 profiles 目录，可能不是正确的 DSH 主目录；如需指定请用 --dsh-home`)
  log('')

  log('1/3 复制包到 local-packages（真源，DSH 升级不会动它）…')
  try {
    copyDir(SCRIPT_DIR, localPkg)
  } catch (e) {
    fail(`复制到 local-packages 失败：${e.message}（DSH 正在运行？请先退出 DSH 再重试）`)
  }
  log('    → ' + localPkg)

  log('2/3 复制包到 profiles/node_modules（普通复制，不用软链接）…')
  try {
    copyDir(SCRIPT_DIR, deployDir)
  } catch (e) {
    fail(`复制到 profiles/node_modules 失败：${e.message}（DSH 正在运行？请先退出 DSH 再重试）`)
  }
  log('    → ' + deployDir)

  let version = null
  if (opts.skipPatch) {
    log('3/3 已跳过补丁修改（--skip-patch）')
  } else {
    log('3/3 更新 loader 行 → ' + projectPatch)
    version = patchLoader(projectPatch, opts.repair)
    log(`    loader 行已就绪：id=${LOADER_ID}, config.version=${version}` +
        (opts.repair ? '（已递增，触发 HMR 重应用）' : '（幂等，重复运行不会重复添加）'))
  }

  if (opts.repair) {
    log('修复模式：轮询 API 等待插件重新加载（默认 30 秒）…')
    const ok = await pollApi(opts.port, REPAIR_TIMEOUT_MS)
    if (!ok) {
      warn(`30 秒内 POST http://127.0.0.1:${opts.port}/dsh-mcp-manager/api 未返回 {ok:true}`)
      warn('请重启一次 DSH（loader 会在启动时重新导入），然后打开 设置 → MCP 管理 验证。')
      process.exit(1)
    }
    log('API 已恢复：{ok:true}，插件已重新加载。')
  }

  log('')
  log('✔ 安装完成。')
  if (!opts.repair)
    log('  请重启 DSH，然后打开 设置 → MCP 管理（4 个 mcp_manager_* 工具将在重启后注册）。')
  else
    log('  打开 设置 → MCP 管理 即可使用。')
}

main().catch((e) => { console.error(e); process.exit(1) })

#!/usr/bin/env node
// dsh-mcp-manager uninstall.mjs — cross-platform uninstaller core
// (Windows / macOS / Linux, Node.js >= 18, no dependencies).
//
// uninstall.ps1 (Windows) and uninstall.sh (macOS / Linux) are thin wrappers.
//
// What it removes:
//   1. <dshHome>/local-packages/dsh-mcp-manager        (true source)
//   2. <dshHome>/profiles/node_modules/dsh-mcp-manager  (deployed copy)
//   3. the loader row (`id: mcp-manager`) from
//      <dshHome>/profiles/<profile>/cordis.patch.yml
//      (other entries are left untouched; the patch stays a valid YAML array)
//
// Then restart DSH. Idempotent — safe to run repeatedly.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PKG_NAME = 'dsh-mcp-manager'
const LOADER_ID = 'mcp-manager'
const DEFAULT_PROFILE = 'web'

const log = (msg) => console.log(msg)
const warn = (msg) => console.warn('[警告] ' + msg)
const fail = (msg) => { console.error('[错误] ' + msg); process.exit(1) }

function parseArgs(argv) {
  const opts = {
    dshHome: process.env.DSH_HOME || null,
    profile: DEFAULT_PROFILE,
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
      case '-h':
      case '--help': opts.help = true; break
      default: fail('未知参数: ' + a + '（用 --help 查看用法）')
    }
  }
  if (!opts.dshHome) opts.dshHome = path.join(os.homedir(), '.dsh')
  return opts
}

function printUsage() {
  log(`dsh-mcp-manager 卸载脚本（跨平台：Windows / macOS / Linux）

用法:
  node uninstall.mjs [选项]

选项:
  --dsh-home <path>   DSH 主目录。默认取 $DSH_HOME 环境变量，否则 ~/.dsh
  --profile <name>    安装时使用的 profile 名（默认 ${DEFAULT_PROFILE}）
  -h, --help          显示本帮助

示例:
  node uninstall.mjs
  node uninstall.mjs --dsh-home D:\\path\\.dsh --profile web`)
}

// Remove the loader entry from the patch, then re-normalise so the file stays a
// valid top-level YAML array (empty/comments-only → `[]`), mirroring the
// plugin's own joinLines() behaviour. Handles both the current `- insert:`
// block form and the legacy plain `- id: mcp-manager` row.
function removeLoader(patchPath) {
  if (!fs.existsSync(patchPath)) return false
  const lines = fs.readFileSync(patchPath, 'utf8').split(/\r?\n/)
  const n = lines.length
  const reChild = () => new RegExp("^(\\s+)- id:\\s*'?" + LOADER_ID + "'?\\s*$")
  const rePlain = () => new RegExp("^- id:\\s*'?" + LOADER_ID + "'?\\s*$")
  const out = []
  let removed = false
  let i = 0
  while (i < n) {
    const line = lines[i]
    if (/^- insert:/.test(line)) {
      let end = i + 1
      while (end < n && !/^- /.test(lines[end])) end++
      const block = lines.slice(i, end)
      if (block.some((l) => reChild().test(l))) {
        removed = true // drop the whole block
      } else {
        out.push(...block)
      }
      i = end
      continue
    }
    if (rePlain().test(line)) {
      removed = true
      i++
      continue
    }
    out.push(line)
    i++
  }
  if (!removed) return false

  let res = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n')
  if (!res.trim()) res = '[]\n'
  else if (!/^- /m.test(res) && !/^\[\]\s*$/m.test(res)) res = res.replace(/\n*$/, '\n[]\n')
  fs.writeFileSync(patchPath, res, 'utf8')
  return true
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { printUsage(); return }

  const dshHome = opts.dshHome
  const localPkg = path.join(dshHome, 'local-packages', PKG_NAME)
  const deployDir = path.join(dshHome, 'profiles', 'node_modules', PKG_NAME)
  const projectPatch = path.join(dshHome, 'profiles', opts.profile, 'cordis.patch.yml')

  log(`操作系统: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}`)
  log(`DSH 主目录: ${dshHome}`)
  log(`profile: ${opts.profile}`)
  log('')

  let anything = false

  if (fs.existsSync(localPkg)) {
    fs.rmSync(localPkg, { recursive: true, force: true })
    log('已删除 local-packages 真源: ' + localPkg)
    anything = true
  } else {
    log('跳过（不存在）: ' + localPkg)
  }

  if (fs.existsSync(deployDir)) {
    fs.rmSync(deployDir, { recursive: true, force: true })
    log('已删除部署副本: ' + deployDir)
    anything = true
  } else {
    log('跳过（不存在）: ' + deployDir)
  }

  if (removeLoader(projectPatch)) {
    log('已从补丁中移除 loader 行: ' + projectPatch)
    anything = true
  } else {
    log('跳过（无 loader 行）: ' + projectPatch)
  }

  log('')
  if (!anything) {
    warn('未发现 dsh-mcp-manager 的安装痕迹（可能 DSH 主目录不对？用 --dsh-home 指定）')
    return
  }
  log('✔ 卸载完成。请重启 DSH 使设置页与 mcp_manager_* 工具下线。')
}

main()

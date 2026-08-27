# Skills 管理模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 dsh-mcp-manager 增加设置页「Skills 管理」分区：按层级分组列出 DSH 全部技能，可对任意层级技能启用/禁用（即时生效，无需重启）。

**Architecture:** 宿主半（src/index.ts）在现有 `/dsh-mcp-manager/api` handler 中新增 `skill-list` / `skill-toggle` 两个 op。禁用通过 `ctx.skills.registerProvider()` 注册一个 **rank-0 覆盖 provider**（比项目级 100 还低，全层级可禁用），状态持久化到 `<profile>/dsh-skill-manager.json`，启动/目录变更时惰性恢复。客户端半（lib/client.js）注册第二个 `settings.section`「Skills 管理」，复用现有 mcpm CSS 与 apiCall 通道。

**Tech Stack:** TypeScript（tsc → lib/）、Cordis `ctx.skills`（@deepseek-ai/dsh-skill 0.1.1-rc.2）、window.__ModuleLoader__ 客户端 bundle、node:test（fake ctx 集成测试）。

**Spec:** 本文件即 spec（设计已在会话中经用户批准：并入现有插件；仅列表/查看+启用/禁用+搜索/筛选；不做 SKILL.md 增删改、不做模型工具、不做独立 HTTP API、不做导出导入；先开发后发布）。

## Global Constraints

- `src/index.ts` 经 `tsc -p tsconfig.json`（`npm run build`）编译为 `lib/index.js`，lib 是发布产物；tsconfig `include: ["src"]`、`strict: true`、`noEmitOnError: true`。
- 不新建 HTTP 路由：复用 `/dsh-mcp-manager/api` + 既有三层 CSRF 闸门（POST-only / `x-dsh-plugin` 头 / Origin 校验）。
- 不改 SKILL.md 文件；不新增模型工具；不新增 npm 依赖（用 `ctx.skills` 服务，仅加 `'skills'` 到 inject）。
- 宿主代码改动生效需**重启 dsh 进程**（loader 重导入需要 entry name/inject/group 变化；本次 inject 加 `'skills'` 会触发重导入，但保险起见部署后仍重启验证）。客户端改动硬刷新即可。
- API 响应统一 `{ ok, error? }` 形状，op 经现有 `handlers` 表分发。
- 技能层级按 `source` 字段分组：`project-dsh`/`project-agents`→项目级；`runtime`→运行时；`custom`→自定义；`user-dsh`/`user-agents`→用户级；`bundled`→内置；其余（插件 provider 自带，如 superpowers-dsh）→插件自带。
- 禁用状态持久化：`<profileDir>/dsh-skill-manager.json`，形状 `{ version: 1, disabledSkills: string[] }`；写入走 `withWriteLock` + `sandboxPolicy danger-full-access`（与 patch 写入一致）。
- 覆盖 provider 名常量 `'dsh-mcp-manager-override'`；被我们禁用的技能其 summary 的 `provider` 为覆盖名、`invocation.modelInvocable === false`、`source` 保留原值。
- 技能名校验复用官方语法 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`。

---

### Task 1: 测试骨架 + 失败测试（node:test fake ctx）

**Files:**
- Create: `tests/skills.test.mjs`
- Modify: `package.json`（加 `"test"` script）

**Interfaces:**
- Consumes: 编译产物 `lib/index.js` 的 default 导出 `{ name, inject, apply }`。
- Produces: `makeSkills()` fake skills 服务（seed/snapshot/get/registerProvider）、`makeCtx(home, skills, files?)` fake Cordis ctx、`call(route, payload, headers?)` handler 调用辅助——Task 2 实现必须让这些测试通过。

- [ ] **Step 1: 写测试文件 `tests/skills.test.mjs`**

```js
// tests/skills.test.mjs — fake-ctx integration tests for the Skills 管理 ops.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import plugin from '../lib/index.js'

const OVERRIDE = 'dsh-mcp-manager-override'

// Fake `ctx.skills` service: a name→definition map plus a live provider whose
// candidates always win (models the real registry's rank-0 override behavior).
function makeSkills() {
  const skills = new Map()
  let provider = null
  return {
    seed(name, def) {
      skills.set(name, { description: '', source: 'plugin-x', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true }, ...def, name })
    },
    async snapshot() {
      const merged = new Map(skills)
      if (provider) {
        const out = await provider.list({})
        const cands = Array.isArray(out) ? out : out.candidates
        for (const c of cands) merged.set(c.name, (await provider.get(c, {})) || c)
      }
      return {
        skills: [...merged.values()]
          .map((s) => ({ name: s.name, description: s.description, whenToUse: s.whenToUse, invocation: s.invocation, source: s.source, provider: s.provider, path: s.path }))
          .sort((a, b) => (a.name < b.name ? -1 : 1)),
        complete: true,
      }
    },
    async get(name) {
      const over = provider ? await provider.get({ name }, {}) : undefined
      return over || skills.get(name)
    },
    registerProvider(create) {
      provider = create({ signal: { aborted: false, addEventListener() {} }, invalidate() {} })
    },
  }
}

// Fake Cordis ctx exposing exactly the surfaces the plugin touches.
function makeCtx(home, skills, files) {
  files = files || new Map()
  if (!files.has(join(home, 'settings.yaml'))) files.set(join(home, 'settings.yaml'), '')
  if (!files.has(join(home, 'profiles', 'web', 'cordis.patch.yml'))) files.set(join(home, 'profiles', 'web', 'cordis.patch.yml'), '')
  let route = null
  const listeners = new Map()
  const ctx = {
    timer: {},
    timeout: () => Promise.resolve(),
    settings: { prepareDocument: async () => join(home, 'settings.yaml') },
    sandboxPolicy: { resolve: async () => ({}) },
    tools: { register() {}, schemas: () => [] },
    webServer: { register(r) { route = r; return () => {} } },
    fs: {
      async resolve(p) { return p },
      async stat(p) { return files.has(p) ? { isFile: () => true, isDirectory: () => false } : undefined },
      async readText(p) {
        if (!files.has(p)) { const e = new Error('not found'); e.code = 'FS_NOT_FOUND'; throw e }
        return files.get(p)
      },
      async writeText(p, c) { files.set(p, String(c)) },
      async listDir() { return [] },
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') d() },
    on(ev, cb) { listeners.set(ev, cb) },
    events: { dispatch: () => [] },
    get() { return undefined },
    skills,
    _files: files,
    _route: () => route,
  }
  return ctx
}

function call(route, payload, headers = {}) {
  const body = JSON.stringify(payload)
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager', ...headers },
    on(ev, cb) { if (ev === 'data') cb(body); if (ev === 'end') cb() },
  }
  const res = { status: 200, bodyText: '', writeHead(c) { this.status = c }, end(b) { this.bodyText = b || '' } }
  const p = route.handler(req, res)
  return (p ? Promise.resolve(p) : Promise.resolve()).then(() => ({ status: res.status, json: res.bodyText ? JSON.parse(res.bodyText) : null }))
}

test('skill-list returns seeded skills sorted with invocation/source', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skills = makeSkills()
  skills.seed('writing-plans', { description: 'Plan docs', source: 'superpowers', provider: 'superpowers' })
  skills.seed('brainstorming', { description: 'Idea design', source: 'superpowers', provider: 'superpowers' })
  const ctx = makeCtx(home, skills)
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'skill-list', args: {} })
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.skills.map((s) => s.name), ['brainstorming', 'writing-plans'])
  assert.equal(r.json.skills[0].invocation.modelInvocable, true)
  assert.equal(r.json.skills[0].source, 'superpowers')
})

test('skill-toggle disables (override provider), re-enables, persists, restores after restart', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skills = makeSkills()
  skills.seed('writing-plans', { description: 'Plan docs', source: 'superpowers', provider: 'superpowers' })
  let ctx = makeCtx(home, skills)
  plugin.apply(ctx)
  let r = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: false } })
  assert.equal(r.json.ok, true)
  r = await call(ctx._route(), { op: 'skill-list', args: {} })
  const disabled = r.json.skills.find((s) => s.name === 'writing-plans')
  assert.equal(disabled.provider, OVERRIDE)
  assert.equal(disabled.invocation.modelInvocable, false)
  const stateFile = join(home, 'profiles', 'web', 'dsh-skill-manager.json')
  assert.ok(ctx._files.get(stateFile).includes('writing-plans'))

  r = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: true } })
  assert.equal(r.json.ok, true)
  r = await call(ctx._route(), { op: 'skill-list', args: {} })
  const enabled = r.json.skills.find((s) => s.name === 'writing-plans')
  assert.equal(enabled.provider, 'superpowers')
  assert.equal(enabled.invocation.modelInvocable, true)

  // disable again, then simulate a restart with a fresh ctx sharing the same files
  await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: false } })
  const files = ctx._files
  ctx = makeCtx(home, skills, files)
  plugin.apply(ctx)
  r = await call(ctx._route(), { op: 'skill-list', args: {} })
  const restored = r.json.skills.find((s) => s.name === 'writing-plans')
  assert.equal(restored.provider, OVERRIDE)
  assert.equal(restored.invocation.modelInvocable, false)
})

test('skill-toggle on a missing skill returns an error', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const ctx = makeCtx(home, makeSkills())
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'no-such-skill', enabled: false } })
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /技能不存在/)
})

test('api route still enforces the CSRF gate for skill ops', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const ctx = makeCtx(home, makeSkills())
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'skill-list', args: {} }, { 'x-dsh-plugin': 'wrong' })
  assert.equal(r.status, 403)
})
```

- [ ] **Step 2: 加 test script**

`package.json` scripts 增加：
```json
"test": "npm run build && node --test tests/"
```

- [ ] **Step 3: 运行确认失败（RED）**

```bash
npm test
```
预期：`skill-list returns seeded skills…` 失败（handler 返回 `未知操作: skill-list`）——因为 op 还没实现。

- [ ] **Step 4: Commit**

```bash
git add tests/skills.test.mjs package.json
git commit -m "test: fake-ctx integration tests for skill-list / skill-toggle ops (red)"
```

---

### Task 2: 宿主半实现——类型、rank-0 覆盖 provider、持久化、两个 op

**Files:**
- Modify: `src/index.ts`（类型区、DshContext、inject、apply 内新增 skill 逻辑、handlers 表）

**Interfaces:**
- Consumes: `ctx.skills`（@deepseek-ai/dsh-skill 服务：`registerProvider(create)` / `snapshot(options?)` / `get(name, options?)`）、既有 `withWriteLock`、`ensurePaths()`、`message()`、`fs`/`sandboxPolicy`。
- Produces: `handlers['skill-list']`、`handlers['skill-toggle']`；测试只通过 API 调用，不直接依赖内部函数名。

- [ ] **Step 1: 类型区加 Skill 接口**（在 `interface DshContext` 之前）

```ts
// ---------- Skills management types (minimal surface of ctx.skills) ----------
interface SkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}
interface SkillSummary {
  name: string
  description: string
  whenToUse?: string
  invocation: SkillInvocation
  source: string
  provider: string
  resourceBase?: unknown
  path?: string
}
interface SkillDefinition extends SkillSummary {
  content: string
  metadata?: unknown
}
interface SkillProviderControl {
  signal: { aborted: boolean; addEventListener(type: string, fn: () => void, opts?: unknown): void }
  invalidate(): void
}
interface SkillService {
  registerProvider(create: (control: SkillProviderControl) => {
    name: string
    list(options?: unknown): Promise<SkillSummary[] | { candidates: SkillSummary[]; complete: boolean }>
    get(candidate: SkillSummary, options?: unknown): Promise<SkillDefinition | undefined>
  }): unknown
  snapshot(options?: unknown): Promise<{ skills: SkillSummary[]; complete: boolean }>
  get(name: string, options?: unknown): Promise<SkillDefinition | undefined>
}
```

- [ ] **Step 2: DshContext 加 `skills`、inject 加 `'skills'`**

`interface DshContext extends Context` 内加一行 `skills: SkillService`；`inject` 数组改为：
```ts
inject: ['timer', 'fs', 'settings', 'sandboxPolicy', 'webServer', 'tools', 'skills'],
```

- [ ] **Step 3: apply 内（`withWriteLock` 之后）插入 skill 管理逻辑**

```ts
// ---------- skills management: list + enable/disable (rank-0 override provider) ----------
const OVERRIDE_PROVIDER = 'dsh-mcp-manager-override'
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const overrideSkills = new Map<string, SkillDefinition>()
let skillProviderControl: SkillProviderControl | null = null

const statePath = async () => {
  const p = await ensurePaths()
  const s = p.profileDir.indexOf('\\') >= 0 ? '\\' : '/'
  return p.profileDir + s + 'dsh-skill-manager.json'
}
async function readState(): Promise<string[]> {
  try {
    const raw = await fs.readText(await fs.resolve(await statePath()))
    const data = JSON.parse(raw)
    return Array.isArray(data.disabledSkills) ? data.disabledSkills.filter((n: unknown): n is string => typeof n === 'string') : []
  } catch (e) {
    return []
  }
}
async function saveState(names: string[]): Promise<void> {
  const policy = await sandboxPolicy.resolve({ mode: 'danger-full-access' })
  await fs.writeText(await fs.resolve(await statePath()), JSON.stringify({ version: 1, disabledSkills: names }, null, 2), undefined, undefined, policy)
}

const overrideProvider = {
  name: OVERRIDE_PROVIDER,
  async list() {
    return [...overrideSkills.values()].map((d) => ({
      name: d.name,
      description: d.description,
      ...(d.whenToUse !== undefined ? { whenToUse: d.whenToUse } : {}),
      invocation: d.invocation,
      source: d.source,
      provider: OVERRIDE_PROVIDER,
      rank: 0,
      ...(d.path !== undefined ? { path: d.path } : {}),
      locator: d.name,
    }))
  },
  async get(candidate: SkillSummary) {
    return overrideSkills.get(candidate.name)
  },
}
try {
  ctx.skills.registerProvider((control) => {
    skillProviderControl = control
    return overrideProvider
  })
} catch (e) {
  console.error('[dsh-mcp-manager] skills override provider registration failed:', message(e))
}

// Persisted disables are re-applied lazily (providers may still be starting up);
// the skills/change event re-runs this whenever the catalog changes.
async function ensureRestored(): Promise<void> {
  let changed = false
  for (const name of await readState()) {
    if (overrideSkills.has(name)) continue
    const def = await ctx.skills.get(name)
    if (!def) continue
    overrideSkills.set(name, { ...def, provider: OVERRIDE_PROVIDER, invocation: { modelInvocable: false, userInvocable: false } })
    changed = true
  }
  if (changed && skillProviderControl) skillProviderControl.invalidate()
}
ctx.on('skills/change', () => { void ensureRestored() })

async function skillList() {
  await ensureRestored()
  const snap = await ctx.skills.snapshot({})
  return { ok: true, skills: snap.skills, complete: snap.complete !== false }
}
async function skillToggle(args: { name?: string; enabled?: boolean }) {
  const name = String(args.name || '').trim()
  if (!name) return { ok: false, error: '技能名不能为空' }
  if (!SKILL_NAME_RE.test(name)) return { ok: false, error: '技能名格式非法（需 kebab-case）' }
  await ensureRestored()
  const enabled = args.enabled !== false
  return withWriteLock(async () => {
    if (enabled) {
      if (overrideSkills.delete(name)) {
        await saveState([...overrideSkills.keys()])
        skillProviderControl?.invalidate()
      }
    } else {
      if (!overrideSkills.has(name)) {
        const def = await ctx.skills.get(name)
        if (!def) return { ok: false, error: '技能不存在: ' + name }
        overrideSkills.set(name, { ...def, provider: OVERRIDE_PROVIDER, invocation: { modelInvocable: false, userInvocable: false } })
        await saveState([...overrideSkills.keys()])
        skillProviderControl?.invalidate()
      }
    }
    return { ok: true }
  })
}
```

- [ ] **Step 4: handlers 表加两个 op**（`mcpm-import` 之后）

```ts
'skill-list': skillList,
'skill-toggle': skillToggle,
```

- [ ] **Step 5: 构建并跑测试（GREEN）**

```bash
npm test
```
预期：4 个测试全过。

- [ ] **Step 6: Commit**

```bash
git add src/index.ts package.json tests/skills.test.mjs
git commit -m "feat: skill-list / skill-toggle ops with rank-0 override provider (all levels disablable)"
```

---

### Task 3: 客户端半——「Skills 管理」设置页分区

**Files:**
- Modify: `lib/client.js`（CSS 常量、apply 内新增 SkillPage 组件与 section 注册）

**Interfaces:**
- Consumes: `apiCall(op, args)`（既有）、`ctx.slots` / `slots.inject('settings.section', ...)`、React。
- Produces: 新 section `{ name: 'settings.section', id: 'skill-manager', order: 17, label: 'Skills 管理' }`。

- [ ] **Step 1: CSS 常量追加两行**（在 `CSS` 字符串末尾 `'.mcpm-dialog-actions{...}'` 之后）

```js
'.skm-search{font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;width:100%;box-sizing:border-box}' +
'.skm-group-title{font-size:12px;font-weight:600;opacity:.85;margin-top:4px;padding-bottom:2px;border-bottom:1px solid rgba(128,128,128,.25)}'
```

- [ ] **Step 2: apply 内（`MCPPage` 定义之后、section 注册之前）插入 SkillPage**

```js
// Grouping: built-in providers are "filesystem" (project/user/custom/bundled
// roots) and "runtime" (register()); any other provider name means a
// plugin-provided skill (e.g. superpowers-dsh). skmLevelOf is mutually exclusive.
function skmLevelOf(s) {
  if (s.source === 'project-dsh' || s.source === 'project-agents') return '项目级'
  if (s.source === 'runtime') return '运行时'
  if (s.source === 'user-dsh' || s.source === 'user-agents') return '用户级'
  if (s.source === 'bundled') return '内置'
  if (s.source === 'custom' && s.provider === 'filesystem') return '自定义'
  return '插件自带'
}
const SKM_GROUPS = ['项目级', '运行时', '自定义', '用户级', '内置', '插件自带']
function SkillPage() {
  const [state, setState] = React.useState({ loading: true, error: null, skills: [] })
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState(null)
  const [msg, setMsg] = React.useState(null)
  const refresh = () => {
    apiCall('skill-list', {}).then((res) => {
      setState({ loading: false, error: res && res.ok ? null : ((res && res.error) || '加载失败'), skills: (res && res.skills) || [] })
    }).catch((e) => setState({ loading: false, error: String((e && e.message) || e), skills: [] }))
  }
  React.useEffect(() => { refresh() }, [])
  React.useEffect(() => ctx.interval(() => refresh(), 5000), [])
  React.useEffect(() => { if (!msg) return; return ctx.timeout(() => setMsg(null), 3000) }, [msg])
  const toggle = (skill) => {
    const enabled = skill.provider === 'dsh-mcp-manager-override'
    setBusy(skill.name)
    apiCall('skill-toggle', { name: skill.name, enabled }).then((res) => {
      if (res && res.ok) { setMsg({ kind: 'ok', text: (enabled ? '已启用 ' : '已禁用 ') + skill.name }); refresh() }
      else setMsg({ kind: 'err', text: (res && res.error) || '操作失败' })
    }).catch((e) => setMsg({ kind: 'err', text: String((e && e.message) || e) })).then(() => setBusy(null))
  }
  const query = q.trim().toLowerCase()
  const visible = state.skills.filter((s) => !query || (s.name + ' ' + (s.description || '')).toLowerCase().includes(query))
  return React.createElement('div', { className: 'mcpm-wrap' },
    React.createElement('h2', null, 'Skills 管理'),
    React.createElement('div', { className: 'mcpm-sub' }, '查看与启停 DSH 技能（按层级分组，禁用即时生效，无需重启）'),
    msg && React.createElement('div', { className: 'mcpm-msg ' + msg.kind }, msg.text),
    React.createElement('input', { className: 'skm-search', placeholder: '搜索技能名称或描述…', value: q, onChange: (e) => setQ(e.target.value) }),
    state.loading ? React.createElement('div', { className: 'mcpm-sub' }, '加载中…') :
    state.error ? React.createElement('div', { className: 'mcpm-msg err' }, state.error) :
    SKM_GROUPS.map((key) => {
      const items = visible.filter((s) => skmLevelOf(s) === key)
      if (!items.length) return null
      const rows = items.map((s) => {
        const overridden = s.provider === 'dsh-mcp-manager-override'
        const available = !!(s.invocation && s.invocation.modelInvocable)
        return React.createElement('div', { className: 'mcpm-row', key: s.name },
          React.createElement('div', { className: 'mcpm-row-head' },
            React.createElement('span', { className: 'mcpm-name' }, s.name),
            React.createElement('span', { className: 'mcpm-chip ' + (available ? 'on' : 'off') }, available ? '可用' : '禁用'),
            overridden && React.createElement('span', { className: 'mcpm-chip warn' }, '手动禁用'),
            React.createElement('span', { className: 'mcpm-chip live' }, s.provider)),
          React.createElement('div', { className: 'mcpm-sub' }, s.description || ''),
          React.createElement('div', { className: 'mcpm-row-actions' },
            React.createElement('button', { className: 'mcpm-btn', disabled: busy === s.name, onClick: () => toggle(s) }, overridden ? '启用' : '禁用')))
      })
      return React.createElement(React.Fragment, { key },
        React.createElement('div', { className: 'skm-group-title' }, key + '（' + items.length + '）'),
        rows)
    }))
}
```

- [ ] **Step 3: section 注册（`mcp-manager` 的 slots.inject 之后）**

```js
slots.inject('settings.section', () => slots.register(
  { name: 'settings.section', id: 'skill-manager', order: 17, label: 'Skills 管理' },
  () => React.createElement(SkillPage)
))
```

- [ ] **Step 4: 语法检查**

```bash
node --check lib/client.js
```
预期：无输出（通过）。

- [ ] **Step 5: Commit**

```bash
git add lib/client.js
git commit -m "feat: 'Skills 管理' settings section (level-grouped list, search, enable/disable)"
```

---

### Task 4: 部署到本机并真机验证

**Files:** 无（部署拷贝）。

- [ ] **Step 1: 构建并把 lib 部署到已安装位置**

```bash
npm run build
Copy-Item lib\index.js "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-mcp-manager\lib\index.js" -Force
Copy-Item lib\client.js "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-mcp-manager\lib\client.js" -Force
```
（若 local-packages 也有副本，一并更新。）

- [ ] **Step 2: 请用户重启 dsh web 进程**（host 代码变更；inject 加了 `'skills'` 会触发 loader 重导入，但按既有经验必须完整重启）

- [ ] **Step 3: API 验证**（带闸门头）

```bash
curl -s -X POST http://127.0.0.1:3080/dsh-mcp-manager/api -H "content-type: application/json" -H "x-dsh-plugin: dsh-mcp-manager" -d '{"op":"skill-list","args":{}}'
```
预期：`{"ok":true,"skills":[...],"complete":true}`，其中应包含 superpowers-dsh 的 14 个技能（source `superpowers`、provider `superpowers`）。

```bash
curl -s -X POST http://127.0.0.1:3080/dsh-mcp-manager/api -H "content-type: application/json" -H "x-dsh-plugin: dsh-mcp-manager" -d '{"op":"skill-toggle","args":{"name":"writing-plans","enabled":false}}'
```
预期：`{"ok":true}`；再次 skill-list 该技能 provider 变为 `dsh-mcp-manager-override`、`modelInvocable:false`；再 toggle `enabled:true` 恢复。

- [ ] **Step 4: UI 验证**：浏览器 Ctrl+Shift+R 硬刷新 → 设置 → Skills 管理：层级分组、搜索、开关均正常；`dsh-skill-manager.json` 出现在 profiles/web 下。

---

### Task 5: 收尾（git 状态确认 + 总结）

- [ ] **Step 1: 全量测试**

```bash
npm test
```
预期：全过。

- [ ] **Step 2: git 状态与提交确认**

```bash
git status --short
git log --oneline -3
```
预期：仅本次功能相关提交；工作区干净。

- [ ] **Step 3: 总结交付**（功能清单、部署位置、重启要求、发布待用户指令——README/版本号不动）

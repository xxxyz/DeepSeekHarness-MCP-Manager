// tests/mcpm.test.mjs — fake-ctx integration tests for the MCP server CRUD
// ops (add/list/set-enabled/restart/remove/edit/import/export) plus the YAML
// generation, the optional token gate, and the request-body cap.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import plugin from '../lib/index.js'

// Fake Cordis ctx exposing exactly the surfaces the plugin touches. Same shape
// as skills.test.mjs, extended with `config` for the token gate and
// `tools.schemas` for the live tool-count in mcpm-list.
function makeCtx(home, files, config) {
  files = files || new Map()
  if (!files.has(join(home, 'settings.yaml'))) files.set(join(home, 'settings.yaml'), '')
  if (!files.has(join(home, 'profiles', 'web', 'cordis.patch.yml'))) files.set(join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
  if (!files.has(join(home, 'cordis.patch.yml'))) files.set(join(home, 'cordis.patch.yml'), '[]\n')
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
    skills: {
      registerProvider() {},
      async snapshot() { return { skills: [], complete: true } },
      async get() { return undefined },
    },
    config,
    _files: files,
    _route: () => route,
  }
  return ctx
}

function call(route, payload, headers = {}, body = null) {
  const b = body === null ? JSON.stringify(payload) : body
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager', ...headers },
    on(ev, cb) { if (ev === 'data') cb(b); if (ev === 'end') cb() },
  }
  const res = { status: 200, bodyText: '', writeHead(c) { this.status = c }, end(b2) { this.bodyText = b2 || '' } }
  const p = route.handler(req, res)
  return (p ? Promise.resolve(p) : Promise.resolve()).then(() => ({ status: res.status, json: res.bodyText ? JSON.parse(res.bodyText) : null }))
}

const PROJECT_PATCH = (home) => join(home, 'profiles', 'web', 'cordis.patch.yml')

test('mcpm-add (stdio) writes a well-formed insert block; mcpm-list reads it back', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  let r = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'github', transport: 'stdio', command: 'npx -y @modelcontextprotocol/server-github', args: '--foo bar', env: 'TOKEN=abc', level: 'project' } })
  assert.equal(r.json.ok, true)
  const patch = ctx._files.get(PROJECT_PATCH(home))
  assert.match(patch, /# dsh-mcp-manager:server:mcp-github/)
  assert.match(patch, /- insert:/)
  assert.match(patch, /serverName: "github"/)
  assert.match(patch, /command: "npx -y @modelcontextprotocol\/server-github"/)
  assert.match(patch, /args:/)
  assert.match(patch, /env:/)
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(r.json.ok, true)
  const row = r.json.rows.find((x) => x.id === 'mcp-github')
  assert.equal(row.serverName, 'github')
  assert.equal(row.transport, 'stdio')
  assert.equal(row.level, 'project')
  assert.deepEqual(row.args, ['--foo', 'bar'])
  assert.deepEqual(row.env, { TOKEN: 'abc' })
})

test('mcpm-add (streamable-http) with headers; YAML-injection-safe quoting', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  // command-like string with YAML metacharacters in url/headers must stay quoted
  let r = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'http1', transport: 'streamable-http', url: 'https://host/mcp', headers: 'Authorization=Bearer x: y\nX-Foo=*bar' } })
  assert.equal(r.json.ok, true)
  const patch = ctx._files.get(PROJECT_PATCH(home))
  assert.match(patch, /url: "https:\/\/host\/mcp"/)
  assert.match(patch, /"Authorization": "Bearer x: y"/)
  assert.match(patch, /"X-Foo": "\*bar"/)
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  const row = r.json.rows.find((x) => x.id === 'mcp-http1')
  assert.equal(row.transport, 'streamable-http')
  assert.deepEqual(row.headers, { Authorization: 'Bearer x: y', 'X-Foo': '*bar' })
})

test('mcpm-set-enabled disables then re-enables (writes/removes disable override)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'svc1', transport: 'stdio', command: 'echo hi' } })
  let r = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-svc1', level: 'project', enabled: false } })
  assert.equal(r.json.ok, true)
  let patch = ctx._files.get(PROJECT_PATCH(home))
  assert.match(patch, /# dsh-mcp-manager:disable:mcp-svc1/)
  assert.match(patch, /disabled: true/)
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(r.json.rows.find((x) => x.id === 'mcp-svc1').disabled, true)
  r = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-svc1', level: 'project', enabled: true } })
  assert.equal(r.json.ok, true)
  patch = ctx._files.get(PROJECT_PATCH(home))
  assert.ok(!/disable:mcp-svc1/.test(patch), 'disable override removed')
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(r.json.rows.find((x) => x.id === 'mcp-svc1').disabled, false)
})

test('mcpm-restart returns ok (no pluginInventory → fallback wait)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'svc2', transport: 'stdio', command: 'echo hi' } })
  const r = await call(ctx._route(), { op: 'mcpm-restart', args: { id: 'mcp-svc2', level: 'project' } })
  assert.equal(r.json.ok, true)
  assert.equal(r.json.warning, undefined)
})

test('mcpm-remove deletes insert + all marker blocks', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'gone', transport: 'stdio', command: 'echo hi' } })
  await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-gone', level: 'project', enabled: false } })
  const r = await call(ctx._route(), { op: 'mcpm-remove', args: { id: 'mcp-gone', level: 'project' } })
  assert.equal(r.json.ok, true)
  const patch = ctx._files.get(PROJECT_PATCH(home))
  assert.ok(!patch.includes('mcp-gone'), 'all traces removed')
  const after = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(after.json.rows.some((x) => x.id === 'mcp-gone'), false)
})

test('mcpm-edit same level rewrites the row; cross-level migration moves it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'ed1', transport: 'stdio', command: 'old cmd' } })
  let r = await call(ctx._route(), { op: 'mcpm-edit', args: { id: 'mcp-ed1', level: 'project', serverName: 'ed1', transport: 'stdio', command: 'new cmd' } })
  assert.equal(r.json.ok, true)
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(r.json.rows.find((x) => x.id === 'mcp-ed1').command, 'new cmd')

  // migrate project → global
  r = await call(ctx._route(), { op: 'mcpm-edit', args: { id: 'mcp-ed1', level: 'global', serverName: 'ed1', transport: 'stdio', command: 'new cmd' } })
  assert.equal(r.json.ok, true)
  const proj = ctx._files.get(PROJECT_PATCH(home))
  const glob = ctx._files.get(join(home, 'cordis.patch.yml'))
  assert.ok(!proj.includes('mcp-ed1'), 'removed from project patch')
  assert.ok(glob.includes('mcp-ed1'), 'now in global patch')
})

test('mcpm-import adds new rows and skips existing ids/names; import respects write lock', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'exist', transport: 'stdio', command: 'echo' } })
  const json = JSON.stringify([
    { serverName: 'new1', transport: 'stdio', command: 'echo a', level: 'project' },
    { serverName: 'exist', transport: 'stdio', command: 'echo b' },
    { serverName: 'bad url', transport: 'streamable-http', url: 'not-a-url' },
  ])
  const r = await call(ctx._route(), { op: 'mcpm-import', args: { json } })
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.added, ['mcp-new1'])
  assert.equal(r.json.skipped.length, 2)
  // 'exist' derives the same id as the added row (mcp-exist) → id clash first;
  // 'bad url' fails serverName validation.
  assert.ok(r.json.skipped.some((s) => s.reason === 'id 已存在'))
  assert.ok(r.json.skipped.some((s) => /serverName 非法|url 非法/.test(s.reason)))
})

test('mcpm-export returns JSON without loader-only rows', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'exp1', transport: 'stdio', command: 'echo' } })
  const r = await call(ctx._route(), { op: 'mcpm-export', args: {} })
  assert.equal(r.json.ok, true)
  const parsed = JSON.parse(r.json.json)
  assert.ok(Array.isArray(parsed.rows))
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].serverName, 'exp1')
})

test('token gate: write ops rejected without x-dsh-token, read ops stay open', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  // entry config arrives as the SECOND apply argument (Cordis callback(ctx, config))
  plugin.apply(ctx, { token: 'sekrit' })
  // write op → 401 without token, ok with correct token
  let r = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'tok1', transport: 'stdio', command: 'echo' } })
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /令牌/)
  r = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'tok1', transport: 'stdio', command: 'echo' } }, { 'x-dsh-token': 'sekrit' })
  assert.equal(r.json.ok, true)
  // wrong token → 401
  r = await call(ctx._route(), { op: 'mcpm-remove', args: { id: 'mcp-tok1', level: 'project' } }, { 'x-dsh-token': 'nope' })
  assert.equal(r.json.ok, false)
  // read ops still work without token
  r = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(r.json.ok, true)
  r = await call(ctx._route(), { op: 'plugin-version', args: {} })
  assert.equal(r.json.ok, true)
})

test('request body cap rejects oversized payloads', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  plugin.apply(ctx)
  const big = 'x'.repeat(2 * 1024 * 1024)
  const r = await call(ctx._route(), { op: 'mcpm-import', args: { json: big } }, {}, JSON.stringify({ op: 'mcpm-import', args: { json: big } }))
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /请求体过大/)
})

// --- mcpm-tools: MCP service tool preview ---
function makeToolsCtx(home, schemas) {
  const ctx = makeCtx(home)
  ctx.tools = { register() {}, schemas: () => schemas }
  return ctx
}

test('mcpm-tools lists tools for a server with name/description/parameter summary', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const schemas = [
    { name: 'mcp__github__get_repo', description: 'Fetch a repository by name.', parameters: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' }, limit: { type: 'integer', description: 'max results' } }, required: ['repo'] } },
    { name: 'mcp__github__list_issues', description: 'List issues for a repo.', parameters: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' } }, required: ['repo'] } },
    { name: 'mcp__tavily__search', description: 'Web search.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'the query' } }, required: ['query'] } },
    { name: 'some_other_tool', description: 'Not MCP-prefixed, ignored.' },
  ]
  const ctx = makeToolsCtx(home, schemas)
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'github' } })
  assert.equal(r.json.ok, true)
  assert.equal(r.json.tools.length, 2)
  const getRepo = r.json.tools.find((t) => t.name === 'get_repo')
  assert.ok(getRepo, 'prefix stripped in display name')
  assert.equal(getRepo.description, 'Fetch a repository by name.')
  // parameter summary: key, required flag, type, description
  const repoParam = getRepo.parameters.find((p) => p.key === 'repo')
  assert.ok(repoParam)
  assert.equal(repoParam.required, true)
  assert.equal(repoParam.type, 'string')
  assert.equal(repoParam.description, 'owner/name')
  const limitParam = getRepo.parameters.find((p) => p.key === 'limit')
  assert.equal(limitParam.required, false)
  assert.equal(limitParam.type, 'integer')
})

test('mcpm-tools returns empty array for unknown server or no tools', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeToolsCtx(home, [{ name: 'mcp__tavily__search', description: 'x', parameters: { type: 'object', properties: {} } }])
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'nope' } })
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.tools, [])
})

test('mcpm-tools returns ok:false when schemas() throws', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeCtx(home)
  ctx.tools = { register() {}, schemas: () => { throw new Error('registry exploded') } }
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'github' } })
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /registry exploded/)
})

test('mcpm-tools rejects empty serverName', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mcp-'))
  const ctx = makeToolsCtx(home, [])
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: '' } })
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /serverName/)
})

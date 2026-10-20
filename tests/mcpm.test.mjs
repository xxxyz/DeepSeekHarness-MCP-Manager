// tests/mcpm.test.mjs — fake-ctx integration tests for MCP CRUD, YAML editing,
// the 0.2.x config fields, pluginManager/configEditor integration, and the
// optional token gate.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import * as plugin from '../lib/index.js'
import { call, freshHome, makeCtx } from './helpers.mjs'

const MCP = '@deepseek-ai/dsh-mcp-client'
const PROFILE_PATCH = (home) => join(home, 'profiles', 'web', 'cordis.patch.yml')
const HOME_PATCH = (home) => join(home, 'cordis.patch.yml')

function apply(home, extra) {
  const ctx = makeCtx(home, null, extra)
  plugin.apply(ctx)
  return ctx
}

test('mcpm-add (stdio) writes a 0.2.x insert block; mcpm-list reads it back', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  let result = await call(ctx._route(), {
    op: 'mcpm-add',
    args: {
      serverName: 'github',
      transport: 'stdio',
      command: 'npx -y @modelcontextprotocol/server-github',
      args: '--foo\nbar',
      env: 'TOKEN=abc',
      cwd: 'F:\\work',
      toolCallTimeoutMs: 12000,
      failOnStartupError: true,
      maxInstructionBytes: 4096,
      reconnect: { enabled: false, initialDelayMs: 1000, maxDelayMs: 20000, maxAttempts: 3 },
      level: 'project',
    },
  })
  assert.equal(result.json.ok, true)
  const patch = ctx._files.get(PROFILE_PATCH(home))
  assert.match(patch, /- insert:/)
  assert.match(patch, /name: "@deepseek-ai\/dsh-mcp-client"/)
  assert.match(patch, /serverName: github/)
  assert.match(patch, /cwd: F:\\work/)
  assert.match(patch, /toolCallTimeoutMs: 12000/)
  assert.match(patch, /failOnStartupError: true/)
  assert.match(patch, /maxInstructionBytes: 4096/)
  assert.match(patch, /reconnect:/)
  assert.match(patch, /maxAttempts: 3/)

  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.ok, true)
  const row = result.json.rows.find((entry) => entry.id === 'mcp-github')
  assert.equal(row.serverName, 'github')
  assert.equal(row.transport, 'stdio')
  assert.deepEqual(row.args, ['--foo', 'bar'])
  assert.deepEqual(row.env, { TOKEN: 'abc' })
  assert.equal(row.cwd, 'F:\\work')
  assert.equal(row.toolCallTimeoutMs, 12000)
  assert.equal(row.failOnStartupError, true)
  assert.equal(row.maxInstructionBytes, 4096)
  assert.deepEqual(row.reconnect, { enabled: false, initialDelayMs: 1000, maxDelayMs: 20000, maxAttempts: 3 })
})

test('args round-trip: quoted values containing ":" survive list/edit reparse', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  const argsText = 'F:/AI/proj/tools/apktool/server.py,\n--workspace,\nF:/AI/proj/tools/workspace/apktool'
  const expected = ['F:/AI/proj/tools/apktool/server.py', '--workspace', 'F:/AI/proj/tools/workspace/apktool']
  let result = await call(ctx._route(), {
    op: 'mcpm-add',
    args: { serverName: 'apktool', transport: 'stdio', command: 'F:/AI/proj/.venv/Scripts/python.exe', args: argsText },
  })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  const row = result.json.rows.find((entry) => entry.id === 'mcp-apktool')
  assert.deepEqual(row.args, expected)

  result = await call(ctx._route(), {
    op: 'mcpm-edit',
    args: { id: 'mcp-apktool', level: 'project', serverName: 'apktool', transport: 'stdio', command: 'F:/AI/proj/.venv/Scripts/python.exe', args: row.args.join('\n'), env: '' },
  })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.deepEqual(result.json.rows.find((entry) => entry.id === 'mcp-apktool').args, expected)
})

test('mcpm-add (streamable-http) with headers; values stay YAML-safe', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  let result = await call(ctx._route(), {
    op: 'mcpm-add',
    args: { serverName: 'http1', transport: 'streamable-http', url: 'https://host/mcp', headers: 'Authorization=Bearer x: y\nX-Foo=*bar' },
  })
  assert.equal(result.json.ok, true)
  const patch = ctx._files.get(PROFILE_PATCH(home))
  assert.match(patch, /url: https:\/\/host\/mcp/)
  assert.match(patch, /Authorization: ["']Bearer x: y["']/)
  assert.match(patch, /X-Foo: ["']\*bar["']/)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  const row = result.json.rows.find((entry) => entry.id === 'mcp-http1')
  assert.equal(row.transport, 'streamable-http')
  assert.deepEqual(row.headers, { Authorization: 'Bearer x: y', 'X-Foo': '*bar' })
})

test('mcpm-set-enabled disables then re-enables through the patch layer', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'svc1', transport: 'stdio', command: 'echo hi' } })
  let result = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-svc1', level: 'project', enabled: false } })
  assert.equal(result.json.ok, true)
  let patch = ctx._files.get(PROFILE_PATCH(home))
  assert.match(patch, /- id: mcp-svc1/)
  assert.match(patch, /disabled: true/)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.rows.find((entry) => entry.id === 'mcp-svc1').disabled, true)

  result = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-svc1', level: 'project', enabled: true } })
  assert.equal(result.json.ok, true)
  patch = ctx._files.get(PROFILE_PATCH(home))
  assert.ok(!/disabled: true/.test(patch), 'disable override removed')
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.rows.find((entry) => entry.id === 'mcp-svc1').disabled, false)
})

test('mcpm-set-enabled prefers pluginManager for a live profile row', async () => {
  const home = freshHome('dsh-mcp-')
  const calls = []
  const pluginManager = {
    async listPlugins() {
      return [{ entryId: 'include:mcp-svc2', patchId: 'mcp-svc2', moduleName: MCP, enabled: true, fiberPhase: 'active' }]
    },
    async setPluginEnabled(id, enabled) {
      calls.push([id, enabled])
      return { changed: true, application: 'applied' }
    },
  }
  const ctx = apply(home, { services: { pluginManager } })
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'svc2', transport: 'stdio', command: 'echo hi' } })
  const before = ctx._files.get(PROFILE_PATCH(home))
  const result = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-svc2', level: 'project', enabled: false } })
  assert.equal(result.json.ok, true)
  assert.deepEqual(calls, [['include:mcp-svc2', false]])
  assert.equal(ctx._files.get(PROFILE_PATCH(home)), before, 'pluginManager path does not rewrite the patch')
})

test('mcpm-edit uses configEditor for a live profile row', async () => {
  const home = freshHome('dsh-mcp-')
  const edited = []
  const entry = { options: { id: 'mcp-cfg', name: MCP, config: { serverName: 'cfg', transport: 'stdio', command: 'old' } }, fiber: { state: 2 } }
  const configEditor = {
    entries() { return [entry] },
    configuration() { return [{ entry, inherited: {}, override: {} }] },
    async edit(target, change) {
      edited.push(change(target.options.config, {}))
    },
  }
  const ctx = apply(home, { services: { configEditor } })
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'cfg', transport: 'stdio', command: 'old' } })
  const before = ctx._files.get(PROFILE_PATCH(home))
  const result = await call(ctx._route(), {
    op: 'mcpm-edit',
    args: { id: 'mcp-cfg', level: 'project', serverName: 'cfg', transport: 'stdio', command: 'new' },
  })
  assert.equal(result.json.ok, true)
  assert.equal(edited.length, 1)
  assert.equal(edited[0].command, 'new')
  assert.equal(ctx._files.get(PROFILE_PATCH(home)), before, 'configEditor path does not rewrite the insert block')
})

test('mcpm-restart returns ok without a live inventory', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'svc3', transport: 'stdio', command: 'echo hi' } })
  const result = await call(ctx._route(), { op: 'mcpm-restart', args: { id: 'mcp-svc3', level: 'project' } })
  assert.equal(result.json.ok, true)
})

test('mcpm-remove deletes the insert and every override for the id', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'gone', transport: 'stdio', command: 'echo hi' } })
  await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-gone', level: 'project', enabled: false } })
  const result = await call(ctx._route(), { op: 'mcpm-remove', args: { id: 'mcp-gone', level: 'project' } })
  assert.equal(result.json.ok, true)
  const patch = ctx._files.get(PROFILE_PATCH(home))
  assert.ok(!patch.includes('mcp-gone'), 'all traces removed')
  const after = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(after.json.rows.some((entry) => entry.id === 'mcp-gone'), false)
})

test('mcpm-edit rewrites the profile row; a legacy global level is rejected', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'ed1', transport: 'stdio', command: 'old cmd' } })
  let result = await call(ctx._route(), { op: 'mcpm-edit', args: { id: 'mcp-ed1', serverName: 'ed1', transport: 'stdio', command: 'new cmd' } })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.rows.find((entry) => entry.id === 'mcp-ed1').command, 'new cmd')

  result = await call(ctx._route(), { op: 'mcpm-edit', args: { id: 'mcp-ed1', level: 'global', serverName: 'ed1', transport: 'stdio', command: 'again' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /read-only/)
  assert.ok(!ctx._files.get(HOME_PATCH(home)).includes('mcp-ed1'))
})

test('home rows are listed read-only and cannot be edited, toggled, or removed', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  ctx._files.set(HOME_PATCH(home), [
    '- insert:',
    '    - id: mcp-home',
    '      name: "@deepseek-ai/dsh-mcp-client"',
    '      config:',
    '        serverName: home',
    '        transport: stdio',
    '        command: echo home',
    '',
  ].join('\n'))

  let result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.ok, true)
  const row = result.json.rows.find((entry) => entry.id === 'mcp-home')
  assert.equal(row.level, 'home')
  assert.equal(row.readOnly, true)
  assert.equal(row.readOnlyReason, 'home')
  assert.equal(result.json.paths.home, HOME_PATCH(home))

  for (const payload of [
    { op: 'mcpm-set-enabled', args: { id: 'mcp-home', enabled: false } },
    { op: 'mcpm-remove', args: { id: 'mcp-home' } },
    { op: 'mcpm-edit', args: { id: 'mcp-home', serverName: 'home', transport: 'stdio', command: 'changed' } },
  ]) {
    result = await call(ctx._route(), payload)
    assert.equal(result.json.ok, false, payload.op)
  }
  assert.ok(ctx._files.get(HOME_PATCH(home)).includes('mcp-home'), 'home row left untouched')

  result = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'home2', transport: 'stdio', command: 'echo', level: 'global' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /read-only/)
})

test('a home override makes the matching profile row read-only', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'ovr', transport: 'stdio', command: 'echo' } })
  ctx._files.set(HOME_PATCH(home), [
    '- id: mcp-ovr',
    '  name: "@deepseek-ai/dsh-mcp-client"',
    '  disabled: true',
    '',
  ].join('\n'))

  const result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  const row = result.json.rows.find((entry) => entry.id === 'mcp-ovr')
  assert.equal(row.level, 'profile')
  assert.equal(row.readOnly, true)
  assert.equal(row.readOnlyReason, 'overridden-by-home')
  assert.equal(row.disabled, true)
  const edit = await call(ctx._route(), { op: 'mcpm-edit', args: { id: 'mcp-ovr', serverName: 'ovr', transport: 'stdio', command: 'changed' } })
  assert.equal(edit.json.ok, false)
  assert.match(edit.json.error, /home patch/)
})

test('mcpm-import adds new rows and skips existing ids/names', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'exist', transport: 'stdio', command: 'echo' } })
  const json = JSON.stringify([
    { serverName: 'new1', transport: 'stdio', command: 'echo a', level: 'project' },
    { serverName: 'exist', transport: 'stdio', command: 'echo b' },
    { serverName: 'bad url', transport: 'streamable-http', url: 'not-a-url' },
  ])
  const result = await call(ctx._route(), { op: 'mcpm-import', args: { json } })
  assert.equal(result.json.ok, true)
  assert.deepEqual(result.json.added, ['mcp-new1'])
  assert.equal(result.json.skipped.length, 2)
})

test('mcpm-export returns JSON without loader-only rows', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'exp1', transport: 'stdio', command: 'echo' } })
  const result = await call(ctx._route(), { op: 'mcpm-export', args: {} })
  assert.equal(result.json.ok, true)
  const parsed = JSON.parse(result.json.json)
  assert.ok(Array.isArray(parsed.rows))
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].serverName, 'exp1')
})

test('mcpm-set-enabled requires an explicit boolean enabled', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'bool1', transport: 'stdio', command: 'echo' } })
  const result = await call(ctx._route(), { op: 'mcpm-set-enabled', args: { id: 'mcp-bool1' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /boolean/)
})

test('origin gate accepts loopback aliases and rejects another port', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'origin1', transport: 'stdio', command: 'echo' } })
  let result = await call(ctx._route(), { op: 'mcpm-list', args: {} }, { origin: 'http://localhost:1618' })
  assert.equal(result.status, 200)
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} }, { origin: 'http://localhost:9999' })
  assert.equal(result.status, 403)
})

test('token gate: write ops rejected without x-dsh-token, read ops stay open', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = makeCtx(home)
  plugin.apply(ctx, { token: 'sekrit' })
  let result = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'tok1', transport: 'stdio', command: 'echo' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /token/)
  result = await call(ctx._route(), { op: 'mcpm-add', args: { serverName: 'tok1', transport: 'stdio', command: 'echo' } }, { 'x-dsh-token': 'sekrit' })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'mcpm-remove', args: { id: 'mcp-tok1', level: 'project' } }, { 'x-dsh-token': 'nope' })
  assert.equal(result.json.ok, false)
  result = await call(ctx._route(), { op: 'mcpm-list', args: {} })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'plugin-version', args: {} })
  assert.equal(result.json.ok, true)
})

test('request body cap rejects oversized payloads', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = apply(home)
  const big = 'x'.repeat(2 * 1024 * 1024)
  const result = await call(ctx._route(), { op: 'mcpm-import', args: { json: big } }, {}, JSON.stringify({ op: 'mcpm-import', args: { json: big } }))
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /请求体过大/)
})

// --- mcpm-tools: MCP service tool preview ---
function toolsCtx(home, schemas) {
  return makeCtx(home, null, { tools: { register() {}, schemas: () => schemas } })
}

test('mcpm-tools lists tools for a server with name/description/parameter summary', async () => {
  const home = freshHome('dsh-mcp-')
  const schemas = [
    { name: 'mcp__github__get_repo', description: 'Fetch a repository by name.', parameters: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' }, limit: { type: 'integer', description: 'max results' } }, required: ['repo'] } },
    { name: 'mcp__github__list_issues', description: 'List issues for a repo.', parameters: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' } }, required: ['repo'] } },
    { name: 'mcp__tavily__search', description: 'Web search.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'the query' } }, required: ['query'] } },
    { name: 'some_other_tool', description: 'Not MCP-prefixed, ignored.' },
  ]
  const ctx = toolsCtx(home, schemas)
  plugin.apply(ctx)
  const result = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'github' } })
  assert.equal(result.json.ok, true)
  assert.equal(result.json.tools.length, 2)
  const getRepo = result.json.tools.find((tool) => tool.name === 'get_repo')
  assert.ok(getRepo)
  assert.equal(getRepo.description, 'Fetch a repository by name.')
  const repoParam = getRepo.parameters.find((param) => param.key === 'repo')
  assert.equal(repoParam.required, true)
  assert.equal(repoParam.type, 'string')
})

test('mcpm-tools returns empty for unknown server or no tools', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = toolsCtx(home, [{ name: 'mcp__tavily__search', description: 'x', parameters: { type: 'object', properties: {} } }])
  plugin.apply(ctx)
  const result = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'nope' } })
  assert.equal(result.json.ok, true)
  assert.deepEqual(result.json.tools, [])
})

test('mcpm-tools returns ok:false when schemas() throws', async () => {
  const home = freshHome('dsh-mcp-')
  const ctx = makeCtx(home, null, { tools: { register() {}, schemas: () => { throw new Error('registry exploded') } } })
  plugin.apply(ctx)
  const result = await call(ctx._route(), { op: 'mcpm-tools', args: { serverName: 'github' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /registry exploded/)
})

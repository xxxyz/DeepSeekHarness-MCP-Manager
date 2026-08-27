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
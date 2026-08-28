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

// ---------- user-level filesystem skills (~/.dsh/skills) ----------

const USER_SKILL_MD = [
  '---',
  'name: checking-dsh-plugin-updates',
  'description: 检查 DSH 插件更新并列出可用升级',
  'whenToUse: Use when asked to check for DSH plugin updates',
  'user-invocable: true',
  '---',
  '',
  '# body',
].join('\n')

test('skill-list merges user-level filesystem skills with source user-dsh', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skillsDir = join(home, 'user-skills')
  const files = new Map()
  files.set(join(skillsDir, 'checking-dsh-plugin-updates', 'SKILL.md'), USER_SKILL_MD)
  const skills = makeSkills()
  skills.seed('brainstorming', { description: 'Idea design', source: 'superpowers', provider: 'superpowers' })
  const ctx = makeCtx(home, skills, files)
  ctx.fs.listDir = async (p) => (p === skillsDir ? [{ name: 'checking-dsh-plugin-updates' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    assert.equal(r.json.ok, true)
    const user = r.json.skills.find((s) => s.name === 'checking-dsh-plugin-updates')
    assert.ok(user, 'user skill listed')
    assert.equal(user.source, 'user-dsh')
    assert.match(user.description, /插件更新/)
    assert.equal(user.whenToUse, 'Use when asked to check for DSH plugin updates')
    assert.equal(user.invocation.modelInvocable, true)
    assert.equal(user.invocation.userInvocable, true)
    assert.equal(r.json.skills.length, 2)
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})

test('skill-toggle disables and re-enables a user-level filesystem skill', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skillsDir = join(home, 'user-skills')
  const md = '---\nname: my-user-skill\ndescription: A user skill\n---\nbody'
  const files = new Map()
  files.set(join(skillsDir, 'my-user-skill', 'SKILL.md'), md)
  const ctx = makeCtx(home, makeSkills(), files)
  ctx.fs.listDir = async (p) => (p === skillsDir ? [{ name: 'my-user-skill' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    let r = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'my-user-skill', enabled: false } })
    assert.equal(r.json.ok, true)
    r = await call(ctx._route(), { op: 'skill-list', args: {} })
    const rows = r.json.skills.filter((s) => s.name === 'my-user-skill')
    assert.equal(rows.length, 1, 'exactly one row while disabled (scan deduped against override)')
    assert.equal(rows[0].provider, OVERRIDE)
    assert.equal(rows[0].invocation.modelInvocable, false)
    assert.equal(rows[0].invocation.userInvocable, false)
    const stateFile = join(home, 'profiles', 'web', 'dsh-skill-manager.json')
    assert.ok(ctx._files.get(stateFile).includes('my-user-skill'))

    r = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'my-user-skill', enabled: true } })
    assert.equal(r.json.ok, true)
    r = await call(ctx._route(), { op: 'skill-list', args: {} })
    const enabled = r.json.skills.find((s) => s.name === 'my-user-skill')
    assert.equal(enabled.source, 'user-dsh')
    assert.equal(enabled.invocation.modelInvocable, true)

    // disable again, then simulate a restart with a fresh ctx + fresh skills
    // service sharing the same files: ensureRestored must synthesize the
    // override from the scan (ctx.skills.get cannot see the scoped layer)
    await call(ctx._route(), { op: 'skill-toggle', args: { name: 'my-user-skill', enabled: false } })
    const files = ctx._files
    const listDir = ctx.fs.listDir
    const ctx2 = makeCtx(home, makeSkills(), files)
    ctx2.fs.listDir = listDir
    plugin.apply(ctx2)
    r = await call(ctx2._route(), { op: 'skill-list', args: {} })
    const restored = r.json.skills.find((s) => s.name === 'my-user-skill')
    assert.ok(restored, 'user skill still listed after restart')
    assert.equal(restored.provider, OVERRIDE)
    assert.equal(restored.invocation.modelInvocable, false)
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})

test('user-skills scan mirrors official registry: frontmatter name+description required', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skillsDir = join(home, 'user-skills')
  const files = new Map()
  files.set(join(skillsDir, 'no-name-dir', 'SKILL.md'), '---\ndescription: has description but no name\n---\nbody')
  files.set(join(skillsDir, 'no-description', 'SKILL.md'), '---\nname: no-description\n---\nbody')
  files.set(join(skillsDir, 'Bad_Name', 'SKILL.md'), '---\nname: Bad_Name\ndescription: non kebab name\n---\nbody')
  const ctx = makeCtx(home, makeSkills(), files)
  ctx.fs.listDir = async (p) => (p === skillsDir ? [{ name: 'no-name-dir' }, { name: 'no-description' }, { name: 'Bad_Name' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    const names = r.json.skills.map((s) => s.name)
    // The real dsh-skill-filesystem ignores any entry whose frontmatter lacks
    // name OR description (no dir-name fallback) — the page must not list
    // skills the / menu cannot see.
    assert.ok(!names.includes('no-name-dir'), 'missing frontmatter name → skipped (no dir fallback)')
    assert.ok(!names.includes('no-description'), 'missing description → skipped')
    assert.ok(!names.includes('Bad_Name'), 'non-kebab name → skipped')
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})

test('skill-list includes flat .md files in the user skills root (official parity)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const skillsDir = join(home, 'user-skills')
  const files = new Map()
  files.set(
    join(skillsDir, 'flat-skill.md'),
    '---\nname: flat-skill\ndescription: A flat markdown skill\ndisable-model-invocation: true\n---\nbody',
  )
  files.set(join(skillsDir, 'inv-off', 'SKILL.md'), '---\nname: inv-off\ndescription: hidden from user menu\nuser-invocable: false\n---\nbody')
  // official provider REJECTS the legacy camelCase keys outright → entry skipped
  files.set(join(skillsDir, 'legacy', 'SKILL.md'), '---\nname: legacy\ndescription: camel key\nuserInvocable: false\n---\nbody')
  // official boolean grammar: true/1/yes/on vs false/0/no/off — anything else skips the entry
  files.set(join(skillsDir, 'bad-bool', 'SKILL.md'), '---\nname: bad-bool\ndescription: bad boolean\nuser-invocable: maybe\n---\nbody')
  const ctx = makeCtx(home, makeSkills(), files)
  ctx.fs.listDir = async (p) => (p === skillsDir ? [{ name: 'flat-skill.md' }, { name: 'inv-off' }, { name: 'legacy' }, { name: 'bad-bool' }, { name: '.system' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    const row = r.json.skills.find((s) => s.name === 'flat-skill')
    assert.ok(row, 'flat .md skill listed')
    assert.equal(row.source, 'user-dsh')
    assert.equal(row.provider, 'filesystem')
    assert.equal(row.description, 'A flat markdown skill')
    assert.equal(row.invocation.modelInvocable, false, 'disable-model-invocation honored')
    assert.equal(row.invocation.userInvocable, true)
    const invOff = r.json.skills.find((s) => s.name === 'inv-off')
    assert.ok(invOff, 'user-invocable: false skill listed')
    assert.equal(invOff.invocation.userInvocable, false)
    const names = r.json.skills.map((s) => s.name)
    assert.ok(!names.includes('legacy'), 'camelCase userInvocable key rejected (official parity)')
    assert.ok(!names.includes('bad-bool'), 'invalid boolean value skipped (official parity)')
    assert.ok(!names.includes('.system'), '.system entries skipped')
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})
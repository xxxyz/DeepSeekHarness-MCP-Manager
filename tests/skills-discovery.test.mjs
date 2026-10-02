// tests/skills-discovery.test.mjs — regression tests for workspace/project skill
// discovery: cwd-scoped snapshots, extra roots, and YAML frontmatter parsing.
//
// These three failures shipped together in 2.2.7 and made the Skills page show
// "no skills for this workspace" on a real deployment:
//   1. skill-list only asked ctx.skills.snapshot({}), which is cwd-less and
//      therefore never includes <project>/.dsh/skills or <project>/.agents/skills;
//   2. the only extra root scanned was the DSH home guessed from
//      settings.prepareDocument(), which degenerates to the profile directory —
//      so both the user skills folder and every workspace were missed;
//   3. the hand-rolled frontmatter reader returned the literal "|" for a block
//      scalar, so every long description rendered as "|".
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import plugin from '../lib/index.js'

// Hermetic environment, as in skills.test.mjs: the host's own DSH_* variables
// point at the real DSH home / workspace and would otherwise leak into the scan.
const HOST_ENV = ['DSH_HOME', 'DSH_PROFILE_DIR', 'DSH_PROFILE', 'DSH_CWD', 'DSH_WORKSPACE', 'DSH_WORKSPACE_DIR', 'DSH_PROJECT_DIR']
test.beforeEach(() => {
  for (const key of HOST_ENV) delete process.env[key]
})
test.after(() => {
  for (const key of HOST_ENV) delete process.env[key]
})

function makeSkills(seeded = []) {
  const seen = []
  const skills = new Map()
  for (const def of seeded) skills.set(def.name, def)
  return {
    calls: seen,
    async snapshot(options) {
      seen.push(options)
      return { skills: [...skills.values()], complete: true }
    },
    async get(name) { return skills.get(name) },
    registerProvider() {},
  }
}

function makeCtx(home, skills, files = new Map()) {
  if (!files.has(join(home, 'settings.yaml'))) files.set(join(home, 'settings.yaml'), '')
  if (!files.has(join(home, 'profiles', 'web', 'cordis.patch.yml'))) files.set(join(home, 'profiles', 'web', 'cordis.patch.yml'), '')
  let route = null
  return {
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
    on() {},
    events: { dispatch: () => [] },
    get() { return undefined },
    skills,
    _files: files,
    _route: () => route,
  }
}

async function call(route, payload) {
  const body = JSON.stringify(payload)
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager' },
    on(ev, cb) { if (ev === 'data') cb(body); if (ev === 'end') cb() },
  }
  const res = { status: 200, bodyText: '', writeHead(c) { this.status = c }, end(b) { this.bodyText = b || '' } }
  await (route.handler(req, res) || Promise.resolve())
  return { status: res.status, json: res.bodyText ? JSON.parse(res.bodyText) : null }
}

// A SKILL.md whose description is a YAML block scalar — the shape that produced "|".
const BLOCK_SCALAR_SKILL = [
  '---',
  'name: block-scalar-skill',
  'description: |',
  '  跨版本符号迁移与二进制差分。',
  '  第二行说明也要保留。',
  'whenToUse: use when migrating symbols across builds',
  '---',
  '',
  '# body',
].join('\n')

test('skill-list asks for the project roots by passing each known workspace root as cwd', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-ws-'))
  const skills = makeSkills([{ name: 'seeded', description: 'seeded skill', source: 'plugin-x', provider: 'plugin-x', invocation: { modelInvocable: true, userInvocable: true } }])
  const ctx = makeCtx(home, skills)
  const previous = process.env.DSH_CWD
  process.env.DSH_CWD = workspace
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    assert.equal(r.json.ok, true)
    const cwds = skills.calls.map((o) => o && o.cwd)
    assert.ok(cwds.includes(undefined), 'the global (cwd-less) snapshot is still taken')
    assert.ok(cwds.includes(workspace), `a snapshot was taken with cwd=${workspace} (got ${JSON.stringify(cwds)})`)
  } finally {
    if (previous === undefined) delete process.env.DSH_CWD
    else process.env.DSH_CWD = previous
  }
})

test('workspace skills are listed from <root>/.agents/skills and <root>/.dsh/skills with full block-scalar descriptions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-ws-'))
  // real directory trees: the scan prefers Node fs and falls back to ctx.fs
  mkdirSync(join(workspace, '.agents', 'skills', 'block-scalar-skill'), { recursive: true })
  writeFileSync(join(workspace, '.agents', 'skills', 'block-scalar-skill', 'SKILL.md'), BLOCK_SCALAR_SKILL)
  mkdirSync(join(workspace, '.dsh', 'skills', 'project-local-skill'), { recursive: true })
  writeFileSync(join(workspace, '.dsh', 'skills', 'project-local-skill', 'SKILL.md'), '---\nname: project-local-skill\ndescription: A project-local skill\n---\nbody')

  const ctx = makeCtx(home, makeSkills())
  const previous = process.env.DSH_CWD
  process.env.DSH_CWD = workspace
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    assert.equal(r.json.ok, true)

    const blockScalar = r.json.skills.find((s) => s.name === 'block-scalar-skill')
    assert.ok(blockScalar, 'skill from <root>/.agents/skills is listed')
    assert.notEqual(blockScalar.description, '|', 'block scalar must not collapse to "|"')
    assert.match(blockScalar.description, /跨版本符号迁移与二进制差分/)
    assert.match(blockScalar.description, /第二行说明也要保留/)
    assert.equal(blockScalar.whenToUse, 'use when migrating symbols across builds')

    const local = r.json.skills.find((s) => s.name === 'project-local-skill')
    assert.ok(local, 'skill from <root>/.dsh/skills is listed')
    assert.equal(local.description, 'A project-local skill')
  } finally {
    if (previous === undefined) delete process.env.DSH_CWD
    else process.env.DSH_CWD = previous
  }
})

test('an empty DSH_HOME does not break the DSH home derivation (profile dir is used instead)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-skm-'))
  const profileDir = join(home, 'profiles', 'desktop')
  mkdirSync(profileDir, { recursive: true })
  const skillsDir = join(home, 'skills')
  mkdirSync(join(skillsDir, 'user-skill-from-home'), { recursive: true })
  writeFileSync(join(skillsDir, 'user-skill-from-home', 'SKILL.md'), '---\nname: user-skill-from-home\ndescription: Found through the profile-derived home\n---\nbody')

  const ctx = makeCtx(home, makeSkills())
  const previousHome = process.env.DSH_HOME
  const previousProfileDir = process.env.DSH_PROFILE_DIR
  process.env.DSH_HOME = ''
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    plugin.apply(ctx)
    const r = await call(ctx._route(), { op: 'skill-list', args: {} })
    assert.equal(r.json.ok, true)
    assert.ok(r.json.skills.some((s) => s.name === 'user-skill-from-home'), 'user skills are found even with an empty $DSH_HOME')
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousProfileDir === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfileDir
  }
})

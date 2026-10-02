// tests/skills-authoring.test.mjs — create a custom skill and copy skills that
// other coding tools installed on this machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import plugin from '../lib/index.js'

const HOST_ENV = ['DSH_HOME', 'DSH_PROFILE_DIR', 'DSH_PROFILE', 'DSH_CWD', 'DSH_WORKSPACE', 'DSH_WORKSPACE_DIR', 'DSH_PROJECT_DIR']
test.beforeEach(() => {
  for (const key of HOST_ENV) delete process.env[key]
})
test.after(() => {
  for (const key of HOST_ENV) delete process.env[key]
})

function makeCtx(home, files = new Map()) {
  if (!files.has(join(home, 'settings.yaml'))) files.set(join(home, 'settings.yaml'), '')
  if (!files.has(join(home, 'profiles', 'web', 'cordis.patch.yml'))) files.set(join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
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
      async readText(p) { if (!files.has(p)) throw new Error('not found'); return files.get(p) },
      async writeText(p, c) { files.set(p, String(c)) },
      async listDir() { return [] },
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') d() },
    on() {},
    events: { dispatch: () => [] },
    get() { return undefined },
    skills: {
      registerProvider() {},
      async snapshot() { return { skills: [], complete: true } },
      async get() { return undefined },
    },
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

/** A DSH home on disk plus one "other tool" skill to copy. */
function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-authoring-'))
  const dshHome = join(home, '.dsh')
  mkdirSync(join(dshHome, 'profiles', 'desktop'), { recursive: true })
  process.env.DSH_HOME = dshHome
  process.env.DSH_PROFILE_DIR = join(dshHome, 'profiles', 'desktop')
  return { home, dshHome }
}

test('skill-create writes a user-level skill with valid frontmatter and refuses duplicates', async () => {
  const { dshHome } = makeHome()
  const ctx = makeCtx(dshHome)
  plugin.apply(ctx)

  const created = await call(ctx._route(), {
    op: 'skill-create',
    args: { scope: 'user', name: 'my-custom-skill', description: 'Do the custom thing', content: '# Steps\n\n1. do it' },
  })
  assert.equal(created.json.ok, true, JSON.stringify(created.json))
  assert.equal(created.json.path, join(dshHome, 'skills', 'my-custom-skill', 'SKILL.md'))
  const raw = readFileSync(created.json.path, 'utf8')
  assert.match(raw, /^---\nname: my-custom-skill\n/)
  assert.match(raw, /description: Do the custom thing/)
  assert.match(raw, /# Steps/)

  // the same name is refused instead of silently overwriting
  const again = await call(ctx._route(), {
    op: 'skill-create',
    args: { scope: 'user', name: 'my-custom-skill', description: 'again', content: 'x' },
  })
  assert.equal(again.json.ok, false)
  assert.match(again.json.error, /已存在/)

  // bad names and empty fields are rejected
  for (const bad of [
    { name: 'Bad_Name', description: 'd', content: 'c' },
    { name: 'ok-name', description: '', content: 'c' },
    { name: 'ok-name', description: 'd', content: '   ' },
  ]) {
    const r = await call(ctx._route(), { op: 'skill-create', args: { scope: 'user', ...bad } })
    assert.equal(r.json.ok, false, JSON.stringify(bad))
  }
})

test('skill-create honours the project scope and blocks path traversal in the name', async () => {
  const { dshHome, home } = makeHome()
  const workspace = join(home, 'workspace')
  mkdirSync(workspace, { recursive: true })
  const ctx = makeCtx(dshHome)
  plugin.apply(ctx)

  const r = await call(ctx._route(), {
    op: 'skill-create',
    args: { scope: 'project', cwd: workspace, name: 'project-skill', description: 'Project scoped', content: 'body' },
  })
  assert.equal(r.json.ok, true, JSON.stringify(r.json))
  assert.equal(r.json.path, join(workspace, '.dsh', 'skills', 'project-skill', 'SKILL.md'))
  assert.ok(existsSync(r.json.path))

  const escape = await call(ctx._route(), {
    op: 'skill-create',
    args: { scope: 'project', cwd: workspace, name: '../../evil', description: 'nope', content: 'body' },
  })
  assert.equal(escape.json.ok, false, 'traversal name rejected')
  assert.ok(!existsSync(join(home, 'evil')), 'nothing written outside the skill root')
})

test('skill-sources lists skills other tools installed, and skill-import copies them', async () => {
  const { home, dshHome } = makeHome()
  // ~/.claude/skills/review-helper/SKILL.md — a directory bundle with a companion file
  const claudeSkill = join(dshHome, '.claude', 'skills', 'review-helper')
  mkdirSync(join(claudeSkill, 'references'), { recursive: true })
  writeFileSync(join(claudeSkill, 'SKILL.md'), '---\nname: review-helper\ndescription: |\n  Helps review diffs.\n  Second line.\n---\nbody\n')
  writeFileSync(join(claudeSkill, 'references', 'notes.md'), 'notes\n')
  // ~/.agents/skills/one-pager.md — a flat markdown skill
  mkdirSync(join(dshHome, '.agents', 'skills'), { recursive: true })
  writeFileSync(join(dshHome, '.agents', 'skills', 'one-pager.md'), '---\nname: one-pager\ndescription: A flat skill\n---\nbody\n')

  const ctx = makeCtx(dshHome)
  plugin.apply(ctx)

  const found = await call(ctx._route(), { op: 'skill-sources', args: {} })
  assert.equal(found.json.ok, true, JSON.stringify(found.json))
  const ids = found.json.sources.map((s) => s.id)
  assert.ok(ids.includes('claude-code'), 'claude-code source detected: ' + ids.join(','))
  assert.ok(ids.includes('agents'), 'agents source detected')
  assert.equal(found.json.total, 2)
  const claude = found.json.sources.find((s) => s.id === 'claude-code').skills[0]
  assert.equal(claude.name, 'review-helper')
  assert.match(claude.description, /Helps review diffs\./)
  assert.equal(claude.path, claudeSkill, 'a directory bundle is identified by its directory, not by its SKILL.md')
  const flat = found.json.sources.find((s) => s.id === 'agents').skills[0]
  assert.equal(flat.path, join(dshHome, '.agents', 'skills', 'one-pager.md'), 'a flat skill is identified by its file')

  // import both, then a second pass must skip the collisions
  const sourcePaths = found.json.sources.flatMap((s) => s.skills.map((k) => k.path))
  const imported = await call(ctx._route(), { op: 'skill-import', args: { items: sourcePaths, scope: 'user', onConflict: 'skip' } })
  assert.equal(imported.json.ok, true, JSON.stringify(imported.json))
  assert.deepEqual(imported.json.imported.map((x) => x.name).sort(), ['one-pager', 'review-helper'])
  assert.equal(readFileSync(join(dshHome, 'skills', 'review-helper', 'SKILL.md'), 'utf8').includes('Helps review diffs.'), true)
  assert.equal(readFileSync(join(dshHome, 'skills', 'review-helper', 'references', 'notes.md'), 'utf8'), 'notes\n', 'companion files copied')
  assert.ok(existsSync(join(dshHome, 'skills', 'one-pager.md')), 'flat skill copied as a file')

  const again = await call(ctx._route(), { op: 'skill-import', args: { items: sourcePaths, scope: 'user', onConflict: 'skip' } })
  assert.equal(again.json.imported.length, 0)
  assert.equal(again.json.skipped.length, 2)

  const renamed = await call(ctx._route(), { op: 'skill-import', args: { items: [claude.path], scope: 'user', onConflict: 'rename' } })
  assert.equal(renamed.json.ok, true)
  assert.ok(existsSync(join(dshHome, 'skills', 'review-helper-2', 'SKILL.md')), 'rename policy writes a copy')
})

test('skill-import rejects paths that were not found by the scan', async () => {
  const { home, dshHome } = makeHome()
  mkdirSync(home, { recursive: true })
  const ctx = makeCtx(dshHome)
  plugin.apply(ctx)
  const r = await call(ctx._route(), { op: 'skill-import', args: { items: [join(home, 'not', 'scanned', 'SKILL.md')], scope: 'user' } })
  assert.equal(r.json.ok, true)
  assert.equal(r.json.imported.length, 0)
  assert.equal(r.json.skipped.length, 1)
  assert.match(r.json.skipped[0].reason, /未在已扫描的来源中找到/)
})

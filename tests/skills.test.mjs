// tests/skills.test.mjs — fake-ctx integration tests for skill listing,
// global override persistence, and (0.2.x) user/preset-scope toggling.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import * as plugin from '../lib/index.js'
import { call, freshHome, makeCtx } from './helpers.mjs'

const OVERRIDE = 'dsh-mcp-manager-override'

// Fake ctx.skills: a name→definition map plus a live provider whose candidates
// always win (models the real registry's rank-0 override behavior).
function makeSkills() {
  const skills = new Map()
  let provider = null
  return {
    seed(name, def) {
      skills.set(name, {
        description: '',
        source: 'plugin-x',
        provider: 'filesystem',
        invocation: { modelInvocable: true, userInvocable: true },
        ...def,
        name,
      })
    },
    async snapshot() {
      const merged = new Map(skills)
      if (provider) {
        const output = await provider.list({})
        const candidates = Array.isArray(output) ? output : output.candidates
        for (const candidate of candidates) merged.set(candidate.name, (await provider.get(candidate, {})) || candidate)
      }
      return {
        skills: [...merged.values()]
          .map((skill) => ({
            name: skill.name,
            description: skill.description,
            whenToUse: skill.whenToUse,
            invocation: skill.invocation,
            source: skill.source,
            provider: skill.provider,
            path: skill.path,
          }))
          .sort((a, b) => (a.name < b.name ? -1 : 1)),
        complete: true,
      }
    },
    async get(name) {
      const overridden = provider ? await provider.get({ name }, {}) : undefined
      return overridden || skills.get(name)
    },
    registerProvider(create) {
      provider = create({ signal: { aborted: false, addEventListener() {} }, invalidate() {} })
    },
  }
}

function apply(home, skills, files) {
  const ctx = makeCtx(home, files, { skills })
  plugin.apply(ctx)
  return ctx
}

test('skill-list returns seeded skills sorted with invocation/source', async () => {
  const home = freshHome('dsh-skm-')
  const skills = makeSkills()
  skills.seed('writing-plans', { description: 'Plan docs', source: 'superpowers', provider: 'superpowers' })
  skills.seed('brainstorming', { description: 'Idea design', source: 'superpowers', provider: 'superpowers' })
  const ctx = apply(home, skills)
  const result = await call(ctx._route(), { op: 'skill-list', args: {} })
  assert.equal(result.json.ok, true)
  assert.deepEqual(result.json.skills.map((entry) => entry.name), ['brainstorming', 'writing-plans'])
  assert.equal(result.json.skills[0].invocation.modelInvocable, true)
  assert.equal(result.json.skills[0].source, 'superpowers')
  assert.equal(result.json.skills[0].disabled, false)
})

test('skill-toggle disables through the override provider, re-enables, persists, restores after restart', async () => {
  const home = freshHome('dsh-skm-')
  const skills = makeSkills()
  skills.seed('writing-plans', { description: 'Plan docs', source: 'superpowers', provider: 'superpowers' })
  let ctx = apply(home, skills)
  let result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: false } })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'skill-list', args: {} })
  const disabled = result.json.skills.find((entry) => entry.name === 'writing-plans')
  assert.equal(disabled.provider, OVERRIDE)
  assert.equal(disabled.disabled, true)
  assert.equal(disabled.invocation.modelInvocable, false)
  const stateFile = join(home, 'profiles', 'web', 'dsh-skill-manager.json')
  assert.ok(ctx._files.get(stateFile).includes('writing-plans'))

  result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: true } })
  assert.equal(result.json.ok, true)
  result = await call(ctx._route(), { op: 'skill-list', args: {} })
  const enabled = result.json.skills.find((entry) => entry.name === 'writing-plans')
  assert.equal(enabled.provider, 'superpowers')
  assert.equal(enabled.disabled, false)

  await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans', enabled: false } })
  const files = ctx._files
  ctx = apply(home, skills, files)
  result = await call(ctx._route(), { op: 'skill-list', args: {} })
  const restored = result.json.skills.find((entry) => entry.name === 'writing-plans')
  assert.equal(restored.provider, OVERRIDE)
  assert.equal(restored.disabled, true)
})

test('skill-toggle requires an explicit boolean enabled', async () => {
  const home = freshHome('dsh-skm-')
  const ctx = apply(home, makeSkills())
  const result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'writing-plans' } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /boolean/)
})

test('skill-toggle on a missing skill returns an error', async () => {
  const home = freshHome('dsh-skm-')
  const ctx = apply(home, makeSkills())
  const result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'no-such-skill', enabled: false } })
  assert.equal(result.json.ok, false)
  assert.match(result.json.error, /skill not found/)
})

test('api route still enforces the CSRF gate for skill ops', async () => {
  const home = freshHome('dsh-skm-')
  const ctx = apply(home, makeSkills())
  const result = await call(ctx._route(), { op: 'skill-list', args: {} }, { 'x-dsh-plugin': 'wrong' })
  assert.equal(result.status, 403)
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
  const home = freshHome('dsh-skm-')
  const skillsDir = join(home, 'user-skills')
  const files = new Map()
  files.set(join(skillsDir, 'checking-dsh-plugin-updates', 'SKILL.md'), USER_SKILL_MD)
  const skills = makeSkills()
  skills.seed('brainstorming', { description: 'Idea design', source: 'superpowers', provider: 'superpowers' })
  const ctx = makeCtx(home, files, { skills })
  ctx.fs.listDir = async (path) => (path === skillsDir ? [{ name: 'checking-dsh-plugin-updates' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    const result = await call(ctx._route(), { op: 'skill-list', args: {} })
    assert.equal(result.json.ok, true)
    const user = result.json.skills.find((entry) => entry.name === 'checking-dsh-plugin-updates')
    assert.ok(user, 'user skill listed')
    assert.equal(user.source, 'user-dsh')
    assert.equal(user.userLevel, true)
    assert.equal(user.disabled, false)
    assert.match(user.description, /插件更新/)
    assert.equal(user.whenToUse, 'Use when asked to check for DSH plugin updates')
    assert.equal(user.invocation.modelInvocable, true)
    assert.equal(result.json.skills.length, 2)
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})

test('skill-toggle can disable and re-enable a user-level filesystem skill', async () => {
  const home = freshHome('dsh-skm-')
  const skillsDir = join(home, 'user-skills')
  const skillMdPath = join(skillsDir, 'my-user-skill', 'SKILL.md')
  const files = new Map([[skillMdPath, '---\nname: my-user-skill\ndescription: A user skill\n---\nbody']])
  const ctx = makeCtx(home, files, { skills: makeSkills() })
  ctx.fs.listDir = async (path) => (path === skillsDir ? [{ name: 'my-user-skill' }] : [])
  process.env.DSH_MCP_MANAGER_SKILLS_DIR = skillsDir
  try {
    plugin.apply(ctx)
    let result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'my-user-skill', enabled: false } })
    assert.equal(result.json.ok, true)
    result = await call(ctx._route(), { op: 'skill-list', args: {} })
    let user = result.json.skills.find((entry) => entry.name === 'my-user-skill')
    assert.equal(user.disabled, true)
    assert.equal(user.provider, OVERRIDE)
    // The SKILL.md is never rewritten: the state file owns the change.
    assert.equal(ctx._files.get(skillMdPath), '---\nname: my-user-skill\ndescription: A user skill\n---\nbody')

    result = await call(ctx._route(), { op: 'skill-toggle', args: { name: 'my-user-skill', enabled: true } })
    assert.equal(result.json.ok, true)
    result = await call(ctx._route(), { op: 'skill-list', args: {} })
    user = result.json.skills.find((entry) => entry.name === 'my-user-skill')
    assert.equal(user.disabled, false)
  } finally {
    delete process.env.DSH_MCP_MANAGER_SKILLS_DIR
  }
})

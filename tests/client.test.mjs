// tests/client.test.mjs — load the browser bundle the way dsh-client-modules
// does, verify its registration contract and render-smoke both Settings pages.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CLIENT = readFileSync(join(ROOT, '..', 'lib', 'client.js'), 'utf8')

function loadClient() {
  let loaded = null
  const document = {
    head: { appendChild() {} },
    querySelector() { return null },
    querySelectorAll() { return [] },
    createElement() { return { dataset: {}, textContent: '' } },
  }
  const sandbox = {
    window: {
      __ModuleLoader__: { load(options) { loaded = options } },
      localStorage: { getItem() { return '' }, setItem() {}, removeItem() {} },
    },
    document,
    navigator: { clipboard: null },
    console,
    fetch: async () => ({ json: async () => ({ ok: false, error: 'offline' }) }),
    Promise,
    URL,
    setTimeout,
    clearTimeout,
    require: (name) => {
      if (name === 'react') return React
      throw new Error('unexpected require: ' + name)
    },
  }
  vm.runInNewContext(CLIENT, sandbox)
  assert.ok(loaded, 'client bundle must call window.__ModuleLoader__.load')
  return loaded
}

function makeClientCtx() {
  const registrations = new Map()
  const dictionaries = {}
  const t = (key) => key
  const slots = {
    inject(_name, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.set(options.id, { options, component })
      return () => {}
    },
  }
  const locale = {
    bind: () => t,
    register(namespace, dicts) {
      dictionaries[namespace] = dicts
      return () => {}
    },
    subscribe: () => () => {},
  }
  const ctx = {
    locale,
    slots,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    interval: () => () => {},
    timeout: () => () => {},
  }
  return { ctx, registrations, dictionaries, t }
}

test('browser module id is the package name and exports apply/inject', () => {
  const loaded = loadClient()
  assert.equal(loaded.id, '@xxxyz/dsh-mcp-manager')
  const exports = loaded.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  assert.deepEqual(Array.from(exports.inject), ['slots', 'locale', 'timer'])
  assert.equal(typeof exports.apply, 'function')
})

test('apply registers both settings sections with localized labels', () => {
  const loaded = loadClient()
  const exports = loaded.factory(() => React)
  const { ctx, registrations, dictionaries } = makeClientCtx()
  exports.apply(ctx)
  assert.equal(registrations.size, 2)
  const mcp = registrations.get('mcp-manager')
  const skills = registrations.get('skill-manager')
  assert.equal(mcp.options.order, 16)
  assert.equal(skills.options.order, 17)
  assert.equal(mcp.options.locale, 'dsh.mcpManager')
  assert.equal(mcp.options.label(), 'mcpNav')
  assert.equal(skills.options.label(), 'skillNav')

  const dicts = dictionaries['dsh.mcpManager']
  assert.ok(dicts)
  assert.deepEqual(Object.keys(dicts).sort(), ['en', 'zh'])
  const zhKeys = Object.keys(dicts.zh).sort()
  const enKeys = Object.keys(dicts.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'both dictionaries carry the same keys')
  for (const key of zhKeys) {
    assert.equal(typeof dicts.zh[key], 'string', `zh.${key} must be a string`)
    assert.equal(typeof dicts.en[key], 'string', `en.${key} must be a string`)
  }
})

test('both pages render without throwing and use the shared layout classes', () => {
  const loaded = loadClient()
  const exports = loaded.factory(() => React)
  const { ctx, registrations, t } = makeClientCtx()
  exports.apply(ctx)

  const mcpHtml = renderToStaticMarkup(React.createElement(registrations.get('mcp-manager').component, { t, close() {} }))
  assert.match(mcpHtml, /class="mcpm-page"/)
  assert.match(mcpHtml, /class="mcpm-search"/)
  assert.match(mcpHtml, /class="mcpm-toolbar"/)
  assert.match(mcpHtml, /mcpm-btn primary/)

  const skillHtml = renderToStaticMarkup(React.createElement(registrations.get('skill-manager').component, { t, close() {} }))
  assert.match(skillHtml, /class="mcpm-page"/)
  assert.match(skillHtml, /class="mcpm-search"/)
})

test('client source keeps the theme-token and safety conventions', () => {
  assert.ok(CLIENT.includes('--dsw-alias-'), 'styles use the shared alias tokens')
  assert.ok(CLIENT.includes('tag.dataset.pluginCss'), 'styles are tagged for disposal/reload')
  assert.ok(!CLIENT.includes('dangerouslySetInnerHTML'), 'no raw HTML injection')
  assert.ok(!CLIENT.includes('document.body.appendChild'), 'never appends a second application')
  assert.ok(!CLIENT.includes('@deepseek-ai/dsh-client-ui-primitives'), 'no untyped Harness primitive imports')
  assert.ok(!CLIENT.includes('levelProject') && !CLIENT.includes('levelGlobal'), 'no project/global level UI')
  assert.ok(!CLIENT.includes("setField('level')") && !CLIENT.includes('form.level'), 'the add form no longer exposes a level')
  assert.ok(CLIENT.includes('readOnlyReason'), 'home/overridden rows are distinguished')
  assert.ok(CLIENT.includes('.mcpm-skill-name{font-weight:400}'), 'skill names use the command-row weight')
  assert.ok(CLIENT.includes("'mcpm-name mcpm-skill-name'"), 'the Skills page applies the command-row weight')
})

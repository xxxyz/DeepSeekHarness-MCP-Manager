// Regression test for the cordis.patch.yml double-mount guard.
//
// The guard is a `!!js` disabled expression evaluated by the Cordis loader at
// entry activation. `Entry.disabled` is an UNCACHED getter that re-evaluates
// the expression, so the guard must NEVER read `e.disabled` of its own entry
// (that re-enters the very same expression → infinite recursion → "Maximum
// call stack size exceeded" at boot). The correct short-circuit order is:
//
//   e.options.id !== 'dsh-mcp-manager'      // skip our own row
//   && (name matches)                       // skip every unrelated entry
//   && !e.disabled                          // only a matching legacy row
//
// The first version of this guard had `!e.disabled` FIRST and crashed the
// whole plugin tree on restart (2026-08-27, stack-overflow during boot).
// These tests keep the order honest: entries whose `disabled` getter throws
// prove the expression never touches them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const patchText = readFileSync(join(ROOT, '..', 'cordis.patch.yml'), 'utf8')

// Extract the !!js expression verbatim so the test tracks the real patch.
const m = patchText.match(/disabled: !!js "([^"]+)"/)
assert.ok(m, 'cordis.patch.yml must declare the disabled !!js guard')
const EXPR = m[1]

// Evaluate the guard expression against a fake loader context.
// An entry whose `disabled` getter throws proves the expression short-circuits
// before touching it — exactly how the real boot failed when it didn't.
function evaluateGuard(entries) {
  const ctx = { loader: { entries: () => entries } }
  // eslint-disable-next-line no-new-func
  return new Function('ctx', `return (${EXPR})`)(ctx)
}

const REENTRANT = () => {
  throw new Error('RE-ENTRANT: guard touched a disabled getter it must not read')
}
const self = () => ({ options: { id: 'dsh-mcp-manager', name: '@xxxyz/dsh-mcp-manager' }, get disabled() { return REENTRANT() } })
const legacyRow = (enabled) => ({ options: { id: 'mcp-manager', name: 'dsh-mcp-manager' }, disabled: !enabled })
const unrelated = (name, id) => ({ options: { id, name }, get disabled() { return REENTRANT() } })

test('guard: no other mount → NOT disabled (mounts normally)', () => {
  assert.equal(evaluateGuard([self()]), false)
})

test('guard: enabled legacy row → disabled (backs off, prevents double mount)', () => {
  assert.equal(evaluateGuard([self(), legacyRow(true)]), true)
})

test('guard: disabled legacy row → NOT disabled (new row may take over)', () => {
  assert.equal(evaluateGuard([self(), legacyRow(false)]), false)
})

test('guard: only unrelated bundles (better-sidebar) → NOT disabled', () => {
  // better-sidebar has its own !!js guard; our expression must never read its
  // disabled getter (a re-entrant guard there would also recurse).
  assert.equal(evaluateGuard([self(), unrelated('dsh-better-sidebar', 'better-sidebar')]), false)
})

test('guard: never reads self.disabled (no re-entrant recursion)', () => {
  // self() already throws on .disabled; if the expression order regresses
  // (e.g. `!e.disabled` moved first), this call throws instead of returning.
  assert.doesNotThrow(() => evaluateGuard([self()]))
})

test('guard: mixed tree (legacy + unrelated) reads only the legacy row', () => {
  // legacy enabled + unrelated throwing getters → true, and no throw.
  assert.equal(
    evaluateGuard([self(), legacyRow(true), unrelated('dsh-better-sidebar', 'better-sidebar'), unrelated('superpowers-dsh', 'superpowers-dsh')]),
    true
  )
})

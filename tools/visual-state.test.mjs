// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/visual-state.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { DEFAULT_VISUAL_STATE: defaults, applyVisualPatch: patch } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test('partial visual update preserves independent state, and returned state is immutable', () => {
  const state = patch(defaults, { ledMask: 1, powered: true })
  assert.equal(state.display, '12345678'); assert.equal(state.ledColor, 'blue')
  assert.equal(patch(state, { powered: false }).ledMask, 1)
  assert.ok(Object.isFrozen(state)); assert.equal(defaults.powered, false)
})
test('display pads blank positions without truncating or inventing unsupported glyphs', () => {
  assert.equal(patch(defaults, { display: '12-3' }).display, '12-3    ')
  assert.equal(patch(defaults, { display: '' }).display, '        ')
  for (const display of ['123456789', '12:30', 'ABC', null]) assert.throws(() => patch(defaults, { display }))
})
test('LED masks reject overflow, fractional and coerced input', () => {
  for (const ledMask of [0, 1, 128, 255]) assert.equal(patch(defaults, { ledMask }).ledMask, ledMask)
  for (const ledMask of [-1, 256, 0.5, NaN, '1']) assert.throws(() => patch(defaults, { ledMask }))
})
test('color and power validation cannot silently change hardware-facing meaning', () => {
  for (const ledColor of ['blue', 'red', 'green']) assert.equal(patch(defaults, { ledColor }).ledColor, ledColor)
  assert.throws(() => patch(defaults, { ledColor: 'rgb' }))
  assert.throws(() => patch(defaults, { powered: 'false' }))
})

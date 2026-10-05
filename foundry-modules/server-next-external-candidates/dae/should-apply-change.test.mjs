import { legacyNextInputPath } from '../../../tests/helpers/legacy-next-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { patchShouldApplyChange } from './phase-patch.mjs';

// Interface fixtures execute the installed exact Core and dnd5e methods rather
// than replacing the native shouldApplyChange semantics with an invented stub.
const read = p => fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
// Read immutable release input; installing the local candidate must not turn
// the tests into a second application of an already-applied patch.
const archive = legacyNextInputPath(fileURLToPath(new URL('../../../.local/next-finish-20261002/dae-upstream/dae-v14.0.14.zip', import.meta.url)));
const bytes = fs.readFileSync(archive);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '82118247402d56da085144db0cd96cb6d61a79e2c88a72218111705ce2cc37de');
const dae = execFileSync('python', ['-c', 'import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("dae/module/dae.js"))', archive]).toString('utf8').replaceAll('\r\n', '\n');
const core = read('F:/FoundryLab/foundry-v14/app/14.368/public/scripts/foundry.mjs');
const system = read('F:/FoundryLab/foundry-v14/data/server-next/Data/systems/dnd5e/dnd5e.mjs');
function method(source, anchor) {
  const start = source.indexOf(anchor), end = source.indexOf('\n  }', start);
  if (start < 0 || end < 0) throw new Error('Exact method anchor missing');
  return source.slice(start, end + 4);
}
function harness({ phase = 'initial', specPhase, stamped = false, conditional = true,
  suppressed = false, type = 'add', disabled = false, atl = false } = {}) {
  const patched = patchShouldApplyChange(dae);
  const start = patched.indexOf('export function effectivePhase(');
  const end = patched.indexOf('export function daeApplyActiveEffects(', start);
  const key = atl ? 'ATL.dimLight' : 'system.attributes.ac.bonus';
  const context = { disableEffects: disabled, ValidSpec: { actorSpecs: { union: { allSpecsObj: {
    ...(specPhase ? { [key]: { phase: specPhase } } : {})
  } } } }, CONFIG: { ActiveEffect: { changeTypes: { add: {}, rule: { skipConditions: true } } } } };
  vm.createContext(context);
  vm.runInContext(`class CoreEffect { ${method(core, '  shouldApplyChange(change, options) {')} }
    class SystemEffect extends CoreEffect { ${method(system, '  shouldApplyChange(change, options={}) {')} }
    ${patched.slice(start, end).replaceAll('export function', 'function')}
    this.Effect = SystemEffect; this.subject = daeShouldApplyChange;`, context);
  const effect = new context.Effect();
  effect.flags = { dae: { phaseStamped: stamped } };
  let evaluations = 0;
  effect.system = { evaluateCondition: data => { evaluations++; effect.isSuppressed = suppressed; } };
  effect.isSuppressed = false;
  let conditionChecks = 0;
  const change = { key, phase, type, value: '+1', conditions: { check: () => { conditionChecks++; return conditional; } } };
  let calls = 0, lastOptions;
  const data = { actorAttribute: 42 };
  const run = applicationPhase => context.subject.call(effect, (c, o) => {
    calls++; lastOptions = o; return effect.shouldApplyChange(c, o);
  }, change, { phase: applicationPhase, replacementData: data });
  return { run, change, data, counts: () => ({ calls, evaluations, conditionChecks, lastOptions }) };
}

test('eligible AC change delegates once and obtains native applied marker', () => {
  const h = harness(); assert.equal(h.run('initial'), true); assert.equal(h.change.applied, true);
  assert.equal(h.counts().calls, 1); assert.equal(h.counts().conditionChecks, 1);
  assert.equal(h.counts().lastOptions.replacementData, h.data);
});
test('native false change condition rejects the formerly incorrectly accepted change', () => {
  const h = harness({ conditional: false }); assert.equal(h.run('initial'), false);
  assert.equal(h.change.applied, undefined); assert.equal(h.counts().conditionChecks, 1);
});
test('native effect-level suppression rejects the change', () => {
  const h = harness({ suppressed: true }); assert.equal(h.run('initial'), false);
  assert.equal(h.change.applied, undefined); assert.equal(h.counts().evaluations, 1);
});
test('wrong real phase is rejected before native evaluation', () => {
  const h = harness(); assert.equal(h.run('final'), false); assert.equal(h.counts().calls, 0);
  assert.equal(h.counts().evaluations, 0); assert.equal(h.change.applied, undefined);
});
test('legacy derived-key phase correction keeps current replacement data and stored phase', () => {
  const h = harness({ specPhase: 'final' }); assert.equal(h.run('initial'), false);
  assert.equal(h.run('final'), true); assert.equal(h.counts().calls, 1);
  assert.equal(h.counts().lastOptions.phase, 'initial'); assert.equal(h.change.phase, 'initial');
  assert.equal(h.change.applied, true); assert.equal(h.counts().lastOptions.replacementData, h.data);
});
test('phase-stamped initial choice remains initial despite derived-key spec', () => {
  const h = harness({ specPhase: 'final', stamped: true }); assert.equal(h.run('final'), false);
  assert.equal(h.run('initial'), true); assert.equal(h.counts().calls, 1);
});
test('explicit non-default stored phase wins over spec', () => {
  const h = harness({ phase: 'final', specPhase: 'initial' }); assert.equal(h.run('initial'), false);
  assert.equal(h.run('final'), true); assert.equal(h.counts().lastOptions.phase, 'final');
});
test('native skipConditions behavior is preserved', () => {
  const h = harness({ conditional: false, type: 'rule' }); assert.equal(h.run('initial'), true);
  assert.equal(h.counts().conditionChecks, 0); assert.equal(h.change.applied, true);
});
test('disabled-effects and ATL branches retain direct native delegation', () => {
  for (const options of [{ disabled: true }, { atl: true }]) {
    const h = harness(options); assert.equal(h.run('initial'), true); assert.equal(h.counts().calls, 1);
  }
});

import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { workflowFingerprints } from '../bundle-identity';
import { CF_EXPECTED_VERSION } from '../cf-fixture.mjs';
import { runCfHarness } from '../cf-runtime.mjs';

const ts = createRequire(resolve(import.meta.dir, '../../../.local/midi-qol/source/package.json'))('typescript');
const source = `class Workflow {
  #item;
  async setupTemplateCleanup() { return this.#item; }
  async WorkflowState_RollFinished() { return 1; }
  get item() { throw new Error("Getter must not execute during hashing"); }
  get activity() { return this.#item?.system.activities; }
}
class ChildWorkflow extends Workflow { async WorkflowState_RollFinished() { return 2; } }
class DamageApplicationElementMidi { buildTargetListEntry(list, entry) { return entry; } }
class MidiActiveEffect {
  _initializeSource(data) { return { ...data, marker: "local.8" }; }
  clone(data, context) { return data; }
}`;
const hash = (fn: Function) => createHash('sha256').update(Function.prototype.toString.call(fn)).digest('hex');
const initializeSourceMethod = '  _initializeSource(data) { return { ...data, marker: "local.8" }; }\n';

const runtimeGlobalNames = ['game', 'location', 'MidiQOL', 'CONFIG', '__CF_BUILD__'];
const originalRuntimeGlobals = new Map<string, PropertyDescriptor | undefined>();
function setRuntimeGlobal(name: string, value: unknown) {
  if (!originalRuntimeGlobals.has(name)) originalRuntimeGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, enumerable: true, writable: true, value });
}
function restoreRuntimeGlobals() {
  for (const [name, descriptor] of originalRuntimeGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originalRuntimeGlobals.clear();
}
afterEach(restoreRuntimeGlobals);

function installRuntime(documentClass: any) {
  const { Workflow, DamageApplicationElementMidi } = new Function(`${source}; return { Workflow, DamageApplicationElementMidi };`)();
  setRuntimeGlobal('__CF_BUILD__', { ...workflowFingerprints(source, ts), candidateVersion: CF_EXPECTED_VERSION });
  setRuntimeGlobal('MidiQOL', { Workflow, ChatClasses: { DamageApplicationElementMidi } });
  setRuntimeGlobal('CONFIG', { ActiveEffect: { documentClass } });
  setRuntimeGlobal('game', {
    user: { isGM: true }, world: { id: 'cor-cotn' }, release: { version: '14.368' }, system: { version: '6.0.2' },
    modules: { get: () => ({ active: true, version: '14.6.0-beta.4338eeab.local.7' }) },
    macros: { filter: () => { throw new Error('Runtime fingerprint gate was bypassed.'); } },
  });
  setRuntimeGlobal('location', { origin: 'http://127.0.0.1:30002' });
}

test('compiled method/accessor spans match native Function#toString without evaluating getters or child overrides', () => {
  const Workflow = new Function(`${source}; return Workflow;`)();
  const result = workflowFingerprints(source, ts);
  expect(result.methods.setupTemplateCleanup).toBe(hash(Workflow.prototype.setupTemplateCleanup));
  expect(result.methods.WorkflowState_RollFinished).toBe(hash(Workflow.prototype.WorkflowState_RollFinished));
  expect(result.accessors.item).toBe(hash(Object.getOwnPropertyDescriptor(Workflow.prototype, 'item')!.get!));
  expect(result.accessors.activity).toBe(hash(Object.getOwnPropertyDescriptor(Workflow.prototype, 'activity')!.get!));
  const Renderer = new Function(`${source}; return DamageApplicationElementMidi;`)();
  expect(result.components.damageTargetEntry).toBe(hash(Renderer.prototype.buildTargetListEntry));
  const Effect = new Function(`${source}; return MidiActiveEffect;`)();
  expect(result.components.enchantmentClone).toBe(hash(Effect.prototype.clone));
  expect(result.components.activeEffectInitializeSource).toBe(hash(Effect.prototype._initializeSource));
});

test('getter changes affect accessor identity even when both cleanup methods are unchanged', () => {
  const before = workflowFingerprints(source, ts);
  const after = workflowFingerprints(source.replace('throw new Error("Getter must not execute during hashing")', 'return this.#item'), ts);
  expect(after.methods).toEqual(before.methods);
  expect(after.accessors.item).not.toBe(before.accessors.item);
});

test('missing getter or ambiguous Workflow classes cannot produce a candidate identity', () => {
  expect(() => workflowFingerprints(source.replace('get item()', 'get different()'), ts)).toThrow('getter item');
  expect(() => workflowFingerprints(`${source}\nclass Other { setupTemplateCleanup() {} }`, ts)).toThrow('one compiled Workflow class');
});

test('rendering changes require a different component identity even if all Workflow hashes are unchanged', () => {
  const before = workflowFingerprints(source, ts);
  const after = workflowFingerprints(source.replace('return entry;', 'return undefined;'), ts);
  expect(after.methods).toEqual(before.methods);
  expect(after.accessors).toEqual(before.accessors);
  expect(after.components.damageTargetEntry).not.toBe(before.components.damageTargetEntry);
});

test('enchantment clone changes distinguish local.7 from earlier five-method identities', () => {
  const before = workflowFingerprints(source, ts);
  const after = workflowFingerprints(source.replace('return data;', 'return { ...data };'), ts);
  expect(after.methods).toEqual(before.methods);
  expect(after.accessors).toEqual(before.accessors);
  expect(after.components.damageTargetEntry).toBe(before.components.damageTargetEntry);
  expect(after.components.enchantmentClone).not.toBe(before.components.enchantmentClone);
  expect(() => workflowFingerprints(source.replace('clone(data, context)', 'other(data, context)'), ts)).toThrow('method clone');
});

test('local.7 runtime without the candidate _initializeSource override is rejected', async () => {
  const local7Bundle = source.replace(initializeSourceMethod, '');
  expect(() => workflowFingerprints(local7Bundle, ts)).toThrow('method _initializeSource');

  const local7Effect = new Function(`${local7Bundle}; return MidiActiveEffect;`)();
  installRuntime(local7Effect);
  await expect(runCfHarness()).rejects.toThrow('Missing runtime ActiveEffect._initializeSource fingerprint.');

  class PreviousActiveEffect { _initializeSource(data: unknown) { return data; } }
  Object.setPrototypeOf(local7Effect.prototype, PreviousActiveEffect.prototype);
  installRuntime(local7Effect);
  await expect(runCfHarness()).rejects.toThrow('Loaded ActiveEffect._initializeSource does not match');
});

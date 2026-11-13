import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { expiryUpstream, patchActivityTemplateExpiry, readPinnedExpirySource } from './activity-template-expiry.mjs';

const sourceRoot = process.env.SYSTEM_RUNTIME_SOURCE_ROOT
  ?? (process.env.FVTT_REFERENCE_CACHE_ROOT && join(process.env.FVTT_REFERENCE_CACHE_ROOT, 'dnd5e/6.0.6/repo'));
assert(sourceRoot, 'Set SYSTEM_RUNTIME_SOURCE_ROOT to the pinned dnd5e 6.0.6 checkout');
const coreRoot = process.env.SYSTEM_EXPIRY_CORE_ROOT;
if (!coreRoot) throw new Error('Set SYSTEM_EXPIRY_CORE_ROOT to a Core app root with the locked ActiveEffect source');
const original = (await readPinnedExpirySource(sourceRoot)).replaceAll('\r\n', '\n');
const model = (await readFile(join(sourceRoot, expiryUpstream.modelPath), 'utf8')).replaceAll('\r\n', '\n');
const core = (await readFile(join(coreRoot, expiryUpstream.corePath), 'utf8')).replaceAll('\r\n', '\n');
const enchantment = (await readFile(join(sourceRoot, expiryUpstream.enchantmentModelPath), 'utf8')).replaceAll('\r\n', '\n');
assert.equal(createHash('sha256').update(model).digest('hex'), expiryUpstream.modelSha256Lf);
assert.equal(createHash('sha256').update(core).digest('hex'), expiryUpstream.coreSourceSha256Lf);
assert.equal(createHash('sha256').update(enchantment).digest('hex'), expiryUpstream.enchantmentModelSha256Lf);
const candidate = process.env.SYSTEM_EXPIRY_TEST_ORIGINAL === '1' ? original : patchActivityTemplateExpiry(original);

function member(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing actual source member ${signature}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed actual source member ${signature}`);
}

function runtime(systemSource) {
  const context = vm.createContext({});
  vm.runInContext(`
    class ParentModel { prepareBaseData() {} }
    class SourceModel extends ParentModel {
      #conditionSuppressed = null;
      constructor(parent, item) { super(); this.parent = parent; this.item = item; }
      ${member(model, '  prepareBaseData() {')}
      ${member(model, '  get isOnActivity() {')}
      ${member(model, '  get isSuppressed() {')}
    }
    class CoreEffect {
      constructor(options) {
        Object.assign(this, options);
        this.system = new SourceModel(this, options.hostItem);
        this._source = {disabled: this.disabled, transfer: this.transfer};
      }
      getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; }
      ${member(core, '  get isSuppressed() {')}
      ${member(core, '  get active() {')}
      ${member(core, '  get isTemporary() {')}
      ${member(core, '  get isExpiryTrackable() {')}
    }
    globalThis.Effect = class Effect extends CoreEffect {
      ${member(systemSource, '  get isExpiryTrackable() {')}
    };`, context);
  return function make({onActivity=false, item=false, disabled=false, transfer=false,
    persisted=true, inCompendium=false, isEmbedded=true, duration={value: 1, expiry: 'turnStart', expired: false},
    temporaryFlag=false, referenceId='effect'}={}) {
    const effect = new context.Effect({_id: 'effect', disabled, transfer, persisted, inCompendium, isEmbedded,
      duration, start: {time: 0}, flags: {dnd5e: {isTemporary: temporaryFlag}},
      hostItem: item ? {system: {activities: {contents: onActivity ? [{effects: [{_id: referenceId}]}] : []}}} : null});
    effect.system.prepareBaseData();
    return effect;
  };
}

const make = runtime(candidate);

test('source transform refuses another upstream input and normalizes only CRLF before patching', () => {
  assert.throws(() => patchActivityTemplateExpiry(original + '\n'), /does not match the pinned/);
  assert.equal(patchActivityTemplateExpiry(original.replaceAll('\n', '\r\n')), patchActivityTemplateExpiry(original));
});

test('actual model keeps source flags but prepares activity profiles as enabled and non-transfer', () => {
  const effect = make({item: true, onActivity: true, disabled: true, transfer: true});
  assert.equal(effect.system.isOnActivity, true);
  assert.equal(effect._source.disabled, true);
  assert.equal(effect._source.transfer, true);
  assert.equal(effect.disabled, false);
  assert.equal(effect.transfer, false);
  assert.equal(effect.active, true);
});

test('original getter reproduces expiry registration of the prepared activity template', () => {
  const originalMake = runtime(original);
  assert.equal(originalMake({item: true, onActivity: true, disabled: true, transfer: true}).isExpiryTrackable, true);
});

for (const [label, value, units] of [['Aim', 1, 'turns'], ['Berserk', 99, 'rounds']]) {
  test(`${label} activity template cannot enter the expiry registry`, () => {
    const effect = make({item: true, onActivity: true, disabled: true, transfer: true,
      duration: {value, units, expiry: 'turnStart', expired: false}});
    assert.equal(effect.isExpiryTrackable, false);
  });
}

test('Actor-applied copy is not on an Item activity and keeps normal expiry registration', () => {
  const effect = make();
  assert.equal(effect.system.isOnActivity, false);
  assert.equal(effect.isExpiryTrackable, true);
});

test('disabled Actor-applied effect stays outside expiry registration', () => {
  assert.equal(make({disabled: true}).isExpiryTrackable, false);
});

test('a disabled non-activity Item effect keeps its native disabled eligibility', () => {
  const effect = make({item: true, disabled: true, transfer: true});
  assert.equal(effect.system.isOnActivity, false);
  assert.equal(effect.disabled, true);
  assert.equal(effect.isExpiryTrackable, false);
});

test('ordinary active Item effect keeps native expiry registration', () => {
  assert.equal(make({item: true, transfer: true}).isExpiryTrackable, true);
});

test('an unrelated activity reference does not exclude an ordinary Item effect', () => {
  const effect = make({item: true, onActivity: true, referenceId: 'another', transfer: true});
  assert.equal(effect.system.isOnActivity, false);
  assert.equal(effect.isExpiryTrackable, true);
});

test('applied enchantment without an activity-profile reference keeps native eligibility', () => {
  const actualAppliedGetter = vm.runInNewContext(`Object.getOwnPropertyDescriptor(class {
    ${member(enchantment, '  get isApplied() {')}
  }.prototype, 'isApplied').get`);
  const effect = make({item: true, transfer: true});
  assert.equal(actualAppliedGetter.call(effect.system), true);
  assert.equal(effect.system.isOnActivity, false);
  assert.equal(effect.isExpiryTrackable, true);
  const profile = make({item: true, onActivity: true, transfer: true, disabled: true});
  assert.equal(actualAppliedGetter.call(profile.system), false);
  assert.equal(profile.system.isOnActivity, true);
});

test('Actor-applied effect cannot be mistaken for a transferred Item enchantment', () => {
  const actualAppliedGetter = vm.runInNewContext(`Object.getOwnPropertyDescriptor(class {
    ${member(enchantment, '  get isApplied() {')}
  }.prototype, 'isApplied').get`);
  const effect = make();
  assert.equal(actualAppliedGetter.call(effect.system), false);
  assert.equal(effect.isExpiryTrackable, true);
});

test('existing dnd5e temporary flag exclusion remains intact', () => {
  assert.equal(make({temporaryFlag: true}).isExpiryTrackable, false);
});

test('Core exclusions for expired, indefinite, unsaved, compendium and detached effects remain intact', () => {
  for (const options of [
    {duration: {value: 1, expiry: 'turnStart', expired: true}},
    {duration: {value: Infinity, expiry: null, expired: false}},
    {persisted: false}, {inCompendium: true}, {isEmbedded: false}
  ]) assert.equal(make(options).isExpiryTrackable, false);
});

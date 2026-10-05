import { legacyNextInputPath } from '../../../../tests/helpers/legacy-next-inputs.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readPinnedDnd5eSource } from './pinned-dnd5e-source.mjs';

// Executes extracted pinned methods with capture-only document storage. No browser,
// DB, service, hook registration or persistent creation is involved.
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const sourceRoot = legacyNextInputPath(resolve(root, '.local/midi-qol/source'));
const ts = createRequire(resolve(sourceRoot, 'package.json'))('typescript');
const app = 'F:/FoundryLab/foundry-v14/app/14.368';
const pinned = (path, expected) => {
  const bytes = readFileSync(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Source drift: ${path}`);
  return bytes.toString('utf8');
};
const core = pinned(`${app}/common/abstract/document.mjs`, '303e6bc84fbaa7d564dab144b1f59fd0a1f6584a14e872b293e74358ed9b49dc');
const system = readPinnedDnd5eSource().toString('utf8');
const candidatePath = resolve(sourceRoot, 'src/module/patching.ts');
const candidateBytes = readFileSync(candidatePath);
const candidateSha256 = createHash('sha256').update(candidateBytes).digest('hex');
assert.ok([
  '584d5dfeb475024e585dcb773099cec1691b682de8c677ef5eef5100cf759ced', // local.7
  'c18d410986152cff6e7ecf233959541b64c8b83edb0c6e26a9a2988fb0ff09c4', // local.8
].includes(candidateSha256), `Source drift: ${candidatePath} (${candidateSha256})`);
const candidate = candidateBytes.toString('utf8');
function method(text, className, name, kind = ts.ScriptKind.JS) {
  const ast = ts.createSourceFile('source', text, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  const visit = node => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name?.text === className) {
      hits.push(...node.members.filter(m => ts.isMethodDeclaration(m) && m.name?.getText(ast) === name));
    }
    node.forEachChild(visit);
  };
  visit(ast);
  assert.equal(hits.length, 1, `${className}.${name} must resolve uniquely`);
  return hits[0].getText(ast);
}
const { mergeObject, setProperty } = await import(pathToFileURL(`${app}/common/utils/helpers.mjs`).href);
const { default: DataModel } = await import(pathToFileURL(`${app}/common/abstract/data.mjs`).href);
let serial = 0;
const foundry = { abstract: { DataModel }, utils: { mergeObject, setProperty, randomID: () => `new${String(++serial).padStart(13, '0')}` } };
const CONFIG = { statusEffects: Array.from({length: 9}, (_, i) => ({id: `extra-${i}`})) };
const game = {system: {version: '6.0.2'}};
class CaptureParent { _initializeSource(data) { return data; } }
const Migration = new Function('CaptureParent', 'foundry', 'CONFIG',
  `return class Migration extends CaptureParent { ${method(system, 'ActiveEffect5e', '_initializeSource')} }`)(CaptureParent, foundry, CONFIG);
class CaptureDocument extends Migration {
  constructor(data, context = {}) {
    super();
    this.data = this._initializeSource(structuredClone(data), context);
    this.context = context;
    this.parent = context.parent;
    this.pack = context.pack;
  }
  get type() { return this.data.type; }
  toObject() { return structuredClone(this.data); }
  static create(data, context) { return {savedData: structuredClone(data), context}; }
}
const NativeClone = new Function('CaptureDocument', 'mergeObject',
  `return class NativeClone extends CaptureDocument {
    #discardInvalidEmbedded() { throw new Error('Embedded-discard path is outside this probe'); }
    ${method(core, 'Document', 'clone')}
  }`)(CaptureDocument, mergeObject);
const compiled = ts.transpileModule(`class Patched extends NativeClone {
  ${method(candidate, 'MidiActiveEffect', 'clone', ts.ScriptKind.TS)}
}`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
const Patched = new Function('NativeClone', 'foundry', 'game', `${compiled}; return Patched;`)(NativeClone, foundry, game);
const raw = { _id: 'profile000000001', name: 'Magic weapon', type: 'enchantment', statuses: [],
  flags: {dnd5e: {}}, system: {changes: [{key: 'system.magicalBonus', value: 1, type: 'upgrade'}], origin: {}}, transfer: false };
const changes = {'flags.dnd5e': {enchantmentProfile: raw._id, dependentOn: 'Actor.fixture.ActiveEffect.focus'},
  system: {origin: {activity: 'Actor.fixture.Item.spell.Activity.enchant', message: 'ChatMessage.fixture', profile: raw._id}}, transfer: true};
const observations = [];
const original = new NativeClone(raw).clone(changes).toObject();
assert.equal(original.type, 'condition');
assert.equal(original.system.type, undefined);
assert.equal(original._id, undefined);
observations.push('unpatched-reproduces-condition-migration');
const source = new Patched(raw, {parent: {id: 'weapon'}, pack: 'example'});
const beforeSource = source.toObject();
const beforeChanges = structuredClone(changes);
const ctx = {};
const fixed = source.clone(changes, ctx).toObject();
assert.equal(fixed.type, 'enchantment');
assert.match(fixed._id, /^new\d{13}$/);
assert.notEqual(fixed._id, raw._id);
assert.deepEqual(fixed.system.changes, raw.system.changes);
assert.deepEqual(fixed.system.origin, changes.system.origin);
assert.equal(fixed.flags.dnd5e.dependentOn, changes['flags.dnd5e'].dependentOn);
assert.equal(fixed.flags.dnd5e.enchantmentProfile, raw._id);
assert.equal(fixed.transfer, true);
assert.deepEqual(source.toObject(), beforeSource);
assert.deepEqual(changes, beforeChanges);
assert.deepEqual(ctx, {});
assert.notEqual(source.clone(changes).toObject()._id, fixed._id);
observations.push('patched-retains-enchantment-data-and-independent-id');
const nested = source.clone({flags: {dnd5e: {enchantmentProfile: raw._id}}}).toObject();
assert.equal(nested.type, 'enchantment');
observations.push('nested-and-dotted-native-profile-flags');
for (const context of [{keepId: true}, {keepId: false}, {save: false}, {save: true}, {parent: null}]) {
  const patchedResult = source.clone(changes, context);
  const nativeResult = new NativeClone(raw, {parent: {id: 'weapon'}, pack: 'example'}).clone(changes, context);
  assert.deepEqual(patchedResult.toObject?.() ?? patchedResult, nativeResult.toObject?.() ?? nativeResult);
  assert.deepEqual(patchedResult.context, nativeResult.context);
}
observations.push('explicit-clone-contexts-preserve-native-behavior');
for (const data of [{}, {name: 'Copy'}, {...changes, type: 'base'}]) {
  assert.deepEqual(source.clone(data).toObject(), new NativeClone(raw).clone(data).toObject());
}
for (const type of ['base', 'condition']) {
  const input = {...raw, type, system: {...raw.system, type: 'poisoned'}};
  assert.deepEqual(new Patched(input).clone(changes).toObject(), new NativeClone(input).clone(changes).toObject());
}
observations.push('unrelated-clones-and-requested-types-unchanged');
for (const version of ['5.3.3', '7.0.0']) {
  game.system.version = version;
  assert.deepEqual(source.clone(changes).toObject(), new NativeClone(raw).clone(changes).toObject());
}
game.system.version = '6.0.2';
observations.push('versions-outside-major-six-unchanged');
CONFIG.statusEffects.push({_id: 'status0000000001', id: 'poisoned'});
const legitimate = new Patched({...raw, _id: 'status0000000001', type: 'base', statuses: ['poisoned']}).toObject();
assert.equal(legitimate.type, 'condition');
assert.equal(legitimate.system.type, 'poisoned');
observations.push('legitimate-defined-status-migration-retained');
console.log(JSON.stringify({observations, negativeControl: original, fixed,
  scope: 'Pinned native Document.clone, dnd5e source migration and candidate clone method; capture-only storage, not browser or full ActiveEffect schema validation.'}));

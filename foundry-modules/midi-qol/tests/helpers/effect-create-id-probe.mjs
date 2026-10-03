import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINNED_DND5E_SHA256, readPinnedDnd5eSource } from './pinned-dnd5e-source.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const lockPath = resolve(root, 'foundry-modules/midi-qol/upstream.lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
assert.equal(lock.commit, '4338eeab85041cd71b76ede36818e2265cbf06ae');
assert.equal(lock.candidateVersion, '14.6.0-beta.4338eeab.local.9');

const patchingPatch = lock.patches.find(({path}) => path === 'patches/0004-dnd5e6-enchantment-clone-id.patch');
const creationPatch = lock.patches.find(({path}) => path === 'patches/0005-dnd5e6-idless-effect-create.patch');
assert.ok(patchingPatch && creationPatch, 'locked clone and id-less creation patches must both be present');
const patchBytes = patchPath => readFileSync(resolve(root, 'foundry-modules/midi-qol', patchPath));
const assertPatchHash = (entry, bytes) => {
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), entry.sha256, `${entry.path} hash drifted`);
};
const patchingPatchBytes = patchBytes(patchingPatch.path);
const creationPatchBytes = patchBytes(creationPatch.path);
assertPatchHash(patchingPatch, patchingPatchBytes);
assertPatchHash(creationPatch, creationPatchBytes);

const sourceRoot = resolve(root, '.local/midi-qol/source');
const upstreamPatching = execFileSync('git', [
  '-C', sourceRoot, 'show', `${lock.commit}:src/module/patching.ts`,
], {encoding: 'utf8', timeout: 15_000});

// Apply the locked class patches to a temporary copy of the exact upstream file. This
// exercises the shipped patch hunk, including its ordering after the enchantment patch.
const patchRoot = mkdtempSync(resolve(tmpdir(), 'midi-qol-effect-create-'));
let candidateSource;
try {
  execFileSync('git', ['init', '--quiet', patchRoot], {encoding: 'utf8', timeout: 15_000});
  const patchingPath = resolve(patchRoot, 'src/module/patching.ts');
  mkdirSync(dirname(patchingPath), {recursive: true});
  writeFileSync(patchingPath, upstreamPatching);
  for (const entry of [patchingPatch, creationPatch]) {
    execFileSync('git', ['-C', patchRoot, 'apply', resolve(root, 'foundry-modules/midi-qol', entry.path)], {
      encoding: 'utf8', timeout: 15_000,
    });
  }
  candidateSource = readFileSync(patchingPath, 'utf8');
} finally {
  rmSync(patchRoot, {recursive: true, force: true});
}

const ts = createRequire(resolve(sourceRoot, 'package.json'))('typescript');
function method(text, className, name, scriptKind) {
  const ast = ts.createSourceFile('source', text, ts.ScriptTarget.Latest, true, scriptKind);
  const hits = [];
  const visit = node => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name?.text === className) {
      hits.push(...node.members.filter(member => ts.isMethodDeclaration(member) && member.name?.getText(ast) === name));
    }
    node.forEachChild(visit);
  };
  visit(ast);
  assert.equal(hits.length, 1, `${className}.${name} must resolve uniquely`);
  return hits[0].getText(ast);
}

const app = 'F:/FoundryLab/foundry-v14/app/14.368';
const systemSource = readPinnedDnd5eSource().toString('utf8');
const systemSha256 = createHash('sha256').update(systemSource).digest('hex');
assert.equal(systemSha256, PINNED_DND5E_SHA256,
  `Pinned dnd5e 6.0.2 source changed: ${systemSha256}`);
const backendSource = readFileSync(`${app}/client/data/client-backend.mjs`, 'utf8');
const cleanCall = 'createData = documentClass.cleanData(createData, {';
const constructCall = 'doc = new documentClass(foundry.utils.deepClone(createData), {parent, pack, creation: true, clean: {';
const cleanIndex = backendSource.indexOf(cleanCall);
const constructIndex = backendSource.indexOf(constructCall, cleanIndex);
assert.ok(cleanIndex >= 0 && constructIndex > cleanIndex,
  'Pinned Foundry create path must clean data before construction with creation:true');

const {mergeObject, setProperty} = await import(pathToFileURL(`${app}/common/utils/helpers.mjs`).href);
const {default: DataModel} = await import(pathToFileURL(`${app}/common/abstract/data.mjs`).href);
const {default: ActiveEffectTypeDataModel} = await import(pathToFileURL(`${app}/common/data/active-effect.mjs`).href);
globalThis.foundry = {abstract: {DataModel}};
const cleanedSystem = ActiveEffectTypeDataModel.cleanData({type: 'base', changes: []}, {partial: true});
assert.deepEqual(cleanedSystem, {changes: []}, 'Foundry BaseEffectData cleaning must drop unsupported system.type');

let idSequence = 0;
const foundry = {
  abstract: {DataModel},
  utils: {
    mergeObject,
    setProperty,
    randomID: () => `fresh${String(++idSequence).padStart(11, '0')}`,
  },
};
const game = {system: {version: '6.0.2'}};
const CONFIG = {statusEffects: [{id: 'extra'}]};
class CaptureParent {
  _initializeSource(data) { return data; }
}
const Dnd5eActiveEffect = new Function('CaptureParent', 'foundry', 'CONFIG',
  `return class ActiveEffect5e extends CaptureParent {\n${method(systemSource, 'ActiveEffect5e', '_initializeSource', ts.ScriptKind.JS)}\n}`
)(CaptureParent, foundry, CONFIG);
const midiMethod = method(candidateSource, 'MidiActiveEffect', '_initializeSource', ts.ScriptKind.TS);
const idAssignmentIndex = midiMethod.indexOf('_id: foundry.utils.randomID()');
const superIndex = midiMethod.indexOf('super._initializeSource');
assert.ok(idAssignmentIndex >= 0 && superIndex > idAssignmentIndex,
  'the fresh ID must be assigned in the Midi override before dnd5e super migration');
const compiled = ts.transpileModule(`class PatchedActiveEffect extends Dnd5eActiveEffect {\n${midiMethod}\n}`, {
  compilerOptions: {target: ts.ScriptTarget.ES2022}, reportDiagnostics: true,
});
const diagnostics = compiled.diagnostics ?? [];
assert.equal(diagnostics.length, 0, diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
const PatchedActiveEffect = new Function('Dnd5eActiveEffect', 'foundry', 'game',
  `${compiled.outputText}; return PatchedActiveEffect;`)(Dnd5eActiveEffect, foundry, game);

const cleanedInput = {type: 'base', system: structuredClone(cleanedSystem)};
const negativeControl = new Dnd5eActiveEffect()._initializeSource(structuredClone(cleanedInput), {creation: true});
assert.equal(negativeControl.type, 'condition');
assert.equal(negativeControl.system.type, undefined);

const ordinaryInput = structuredClone(cleanedInput);
CONFIG.statusEffects = [{id: 'extra'}];
const ordinary = new PatchedActiveEffect()._initializeSource(ordinaryInput, {creation: true});
assert.equal(ordinary.type, 'base');
assert.equal(ordinary.system.type, undefined);
assert.match(ordinary._id, /^fresh\d{11}$/);
assert.equal(ordinaryInput._id, undefined, 'the input object must not receive the generated ID');

const modelSource = structuredClone(cleanedInput);
const model = Object.create(DataModel.prototype);
model.toObject = () => structuredClone(modelSource);
const modelResult = new PatchedActiveEffect()._initializeSource(model, {creation: true});
assert.equal(modelResult.type, 'base');
assert.equal(modelResult.system.type, undefined);
assert.match(modelResult._id, /^fresh\d{11}$/);
assert.equal(modelSource._id, undefined, 'the model source must not receive the generated ID');

const explicitId = 'explicit000000001';
const explicit = new PatchedActiveEffect()._initializeSource({
  _id: explicitId, type: 'base', system: structuredClone(cleanedSystem),
}, {creation: true});
assert.equal(explicit.type, 'base');
assert.equal(explicit._id, explicitId);

const statusId = 'status-poison-0001';
CONFIG.statusEffects = [{_id: statusId, id: 'poison'}];
const status = new PatchedActiveEffect()._initializeSource({
  _id: statusId, type: 'base', statuses: ['poison'], system: structuredClone(cleanedSystem),
}, {creation: true});
assert.equal(status.type, 'condition');
assert.equal(status.system.type, 'poison');
assert.equal(status._id, statusId);

const condition = new PatchedActiveEffect()._initializeSource({
  type: 'condition', system: {type: 'poison', changes: []},
}, {creation: true});
assert.equal(condition.type, 'condition');
assert.equal(condition._id, undefined);
assert.equal(condition.system.type, 'poison');

CONFIG.statusEffects = [{id: 'extra'}];
const nonCreation = new PatchedActiveEffect()._initializeSource(structuredClone(cleanedInput), {});
assert.equal(nonCreation.type, 'condition');
assert.equal(nonCreation._id, undefined);

game.system.version = '5.3.3';
const oldSystem = new PatchedActiveEffect()._initializeSource(structuredClone(cleanedInput), {creation: true});
assert.equal(oldSystem.type, 'condition');
assert.equal(oldSystem._id, undefined);
game.system.version = '6.0.2';

console.log(JSON.stringify({
  systemSha256,
  candidateVersion: lock.candidateVersion,
  candidatePatchingSha256: createHash('sha256').update(candidateSource).digest('hex'),
  cleanCreatePath: {cleanedBeforeConstruct: cleanIndex >= 0 && constructIndex > cleanIndex, creationOption: true},
  cleanedBaseEffectSystem: cleanedSystem,
  observations: [
    'pinned-dnd5e-core-reproduces-idless-status-migration-after-BaseEffectData-cleaning',
    'dnd6-created-idless-base-gets-fresh-id-before-super-migration',
    'DataModel-and-plain-object-inputs-are-both-covered',
    'explicit-document-id-is-preserved',
    'explicit-status-id-still-migrates-to-condition',
    'explicit-condition-data-is-untouched',
    'non-creation-and-non-dnd6-paths-remain-upstream',
  ],
  scope: 'Pinned Foundry 14.368 BaseEffectData cleaning, ClientDatabaseBackend create ordering, exact dnd5e 6.0.2 ActiveEffect5e._initializeSource, and the locked Midi source patches; temporary source only, no browser or database.',
}));

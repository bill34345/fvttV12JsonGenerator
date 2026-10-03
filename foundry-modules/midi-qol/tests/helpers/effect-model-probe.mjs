import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PINNED_DND5E_SHA256, readPinnedDnd5eSource } from './pinned-dnd5e-source.mjs';

// Offline only: imports common data helpers, not main.js, a database or a browser.
const app = 'F:/FoundryLab/foundry-v14/app/14.368';
const source = readPinnedDnd5eSource().toString('utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (hash !== PINNED_DND5E_SHA256) {
  throw new Error(`Pinned dnd5e 6.0.2 source changed: ${hash}`);
}
const backendPath = `${app}/client/data/client-backend.mjs`;
const clientBackend = readFileSync(backendPath, 'utf8');
const cleanCall = 'createData = documentClass.cleanData(createData, {';
const constructCall = 'doc = new documentClass(foundry.utils.deepClone(createData), {parent, pack, creation: true, clean: {';
const cleanIndex = clientBackend.indexOf(cleanCall);
const constructIndex = clientBackend.indexOf(constructCall, cleanIndex);
const activeEffectSchema = readFileSync(`${app}/common/documents/active-effect.mjs`, 'utf8');
if (cleanIndex < 0 || constructIndex <= cleanIndex
  || !activeEffectSchema.includes('_id: new fields.DocumentIdField()')) {
  throw new Error('Pinned Foundry client create path no longer cleans ActiveEffect data before construction with an _id schema field.');
}
const { mergeObject, setProperty } = await import(pathToFileURL(`${app}/common/utils/helpers.mjs`).href);
const { default: DataModel } = await import(pathToFileURL(`${app}/common/abstract/data.mjs`).href);
const { default: ActiveEffectTypeDataModel } = await import(pathToFileURL(`${app}/common/data/active-effect.mjs`).href);
const fields = await import(pathToFileURL(`${app}/common/data/fields.mjs`).href);
// Foundry's common data error formatting expects its array convenience method.
Array.prototype.filterJoin ??= function(separator) { return this.filter(Boolean).join(separator); };
globalThis.foundry = { abstract: { DataModel, Document: class FoundryDocument {} } };
const core = new ActiveEffectTypeDataModel({ type: 'base', changes: [] });
const cleanedLocal2System = ActiveEffectTypeDataModel.cleanData({ type: 'base', changes: [] }, { partial: true });
const freshId = 'a1b2c3d4e5f6g7h8';
const cleanedFreshId = new fields.DocumentIdField().clean(freshId, { partial: true });
if (cleanedFreshId !== freshId) throw new Error(`Foundry DocumentIdField stripped a valid fresh ActiveEffect _id: ${cleanedFreshId}`);
const classStart = source.indexOf('class ActiveEffect5e ');
const start = source.indexOf('  _initializeSource(data, options={}) {', classStart);
const end = source.indexOf('\n  }\n', start) + 5;
if (classStart < 0 || start < classStart || end <= start) throw new Error('Locked ActiveEffect5e migration not found.');
const method = source.slice(start, end);
class CaptureParent { _initializeSource(data) { return data; } }
const foundry = { abstract: { DataModel }, utils: { mergeObject, setProperty } };
const CONFIG = { statusEffects: [] };
const Probe = new Function('CaptureParent', 'foundry', 'CONFIG', `return class Probe extends CaptureParent {\n${method}\n}`)(CaptureParent, foundry, CONFIG);
const cases = [
  ['local1-with-idless-status', { type: 'base' }, [{ id: 'extra' }]],
  ['local2-with-idless-status', { type: 'base', system: { type: 'base', changes: [] } }, [{ id: 'extra' }]],
  ['local2-after-core-clean-with-idless-status', { type: 'base', system: structuredClone(cleanedLocal2System) }, [{ id: 'extra' }]],
  ['local3-fresh-id-control', { _id: freshId, type: 'base', system: { changes: [] } }, [{ id: 'extra' }]],
  ['fully-identified-statuses-control', { type: 'base', system: { changes: [] } }, [{ id: 'extra', _id: 'status0000000001' }]],
  ['legitimate-status-migration', { _id: 'status0000000001', type: 'base', statuses: ['poisoned'] }, [{ id: 'poisoned', _id: 'status0000000001' }]],
];
const observations = cases.map(([name, data, statuses]) => {
  CONFIG.statusEffects = statuses;
  const migrated = new Probe()._initializeSource(structuredClone(data), {});
  return { name, type: migrated.type, systemType: migrated.system?.type ?? null, id: migrated._id ?? null };
});
console.log(JSON.stringify({ systemSha256: hash, coreSchemaFields: Object.keys(ActiveEffectTypeDataModel.schema.fields),
  coreCleaned: core.toObject(), local2CoreCleanedSystem: cleanedLocal2System, coreInvalid: core.invalid,
  clientBackendProof: { cleansBeforeConstructor: cleanIndex >= 0 && constructIndex > cleanIndex,
    activeEffectHasIdField: activeEffectSchema.includes('_id: new fields.DocumentIdField()'),
    documentIdFieldPreserved: cleanedFreshId === freshId },
  observations,
  scope: 'Real Foundry core ActiveEffect system model and DocumentIdField cleaning plus captured real dnd5e migration input. Client method order and schema are source-checked; no live client or status registry was exercised.' }));

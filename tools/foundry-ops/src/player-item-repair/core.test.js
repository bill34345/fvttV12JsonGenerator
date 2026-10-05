import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { TARGETS, DIAGNOSTIC, canonical, origins, sourceHints, identityKeys, topLevelItem, selectOrigin, projectRepair, brokenGrants, assertFresh, assertUnchanged } from './core.mjs';
const actorId = TARGETS[0].actorId;
const itemId = TARGETS[0].itemIds[0];
const from = 'Actor.syntheticActor.Item.syntheticFeature';
const to = 'Compendium.dnd5e.test.Item.syntheticFeature';
const source = () => ({ _id: itemId, name: 'Synthetic class', type: 'class', _stats: { modifiedTime: 5, compendiumSource: 'Item.canonicalClass' }, system: { levels: 4, advancement: { grant: { _id: 'grant', type: 'ItemGrant', level: 2, title: 'Keep title', configuration: { items: [{ uuid: from, optional: false }], optional: true }, value: { added: { existingFeature: 'old-origin' } } } } }, effects: [{ _id: 'existingEffect', disabled: true }], flags: { custom: { preserve: true } } });
const mapping = () => ({ advancementId: 'grant', index: 0, from, to, provenance: [to], contentReviewed: true, evidence: 'synthetic-reviewed-source' });
describe('ServerNext allowlisted ItemGrant repair', () => {
  test('only the proved transient Sea Elf change ID is normalized, never mechanical fields or document IDs', () => {
    const item = { _id: 'Oqs0HDVs0QOmvzb9', type: 'race', effects: [{ _id: 'SIoBMgJ64YgbJ1eS', system: { changes: [{ _id: '1111111111111111', key: 'swim', value: '@walk', priority: 4 }] } }] };
    const loadedAgain = structuredClone(item); loadedAgain.effects[0].system.changes[0]._id = '2222222222222222';
    expect(() => assertUnchanged(item, loadedAgain)).not.toThrow();
    expect(canonical({ items: [item] })).toEqual(canonical({ items: [loadedAgain] }));
    expect(item.effects[0].system.changes[0]._id).toBe('1111111111111111');
    for (const change of [doc => doc.effects[0].system.changes[0].value = '99', doc => doc.effects[0]._id = 'otherEffect', doc => doc._id = 'otherItem', doc => doc.effects[0].system.changes.push({ value: 'other' })]) {
      const altered = structuredClone(item); change(altered);
      expect(() => assertUnchanged(altered, item)).toThrow('Unexpected');
    }
    const unrelated = { ...item, _id: 'unrelatedItem' };
    expect(canonical(unrelated).effects[0].system.changes[0]._id).toBe('1111111111111111');
  });
  test('changes only the reviewed reference and leaves input, choice, level and grant history intact', () => {
    const original = source(); const before = structuredClone(original);
    const result = projectRepair(actorId, original, [mapping()]);
    const expected = structuredClone(before); expected.system.advancement.grant.configuration.items[0].uuid = to;
    expect(original).toEqual(before); expect(result.candidate).toEqual(expected);
    expect(Object.keys(result.changes)).toEqual(['_id', 'system.advancement.grant.configuration.items']);
  });
  test('selects provenance even when an unrelated candidate has the same name', () => {
    const found = selectOrigin({ name: 'Feature', _stats: { compendiumSource: to } }, [{ uuid: 'Item.sameName', name: 'Feature', documentName: 'Item' }, { uuid: to, name: 'Translated feature', documentName: 'Item' }]);
    expect(found.uuid).toBe(to);
  });
  test('name-only candidate is refused', () => expect(() => selectOrigin({ name: 'Feature' }, [{ uuid: to, name: 'Feature', documentName: 'Item' }])).toThrow('name matching forbidden'));
  test('unresolved provenance is refused', () => expect(() => selectOrigin({ _stats: { compendiumSource: to } }, [])).toThrow('No resolvable'));
  test('conflicting source markers are not guessed', () => expect(() => selectOrigin({ _stats: { compendiumSource: to }, flags: { core: { sourceId: 'Item.other' } } }, [{ uuid: to, documentName: 'Item' }, { uuid: 'Item.other', documentName: 'Item' }])).toThrow('Ambiguous'));
  test('requires source and explicit content review', () => {
    expect(() => projectRepair(actorId, source(), [{ ...mapping(), contentReviewed: false }])).toThrow('Missing reviewed');
    expect(() => projectRepair(actorId, source(), [{ ...mapping(), provenance: [] }])).toThrow('Missing reviewed');
  });
  test('retained test copy and unknown actors cannot be repaired', () => {
    expect(() => projectRepair(DIAGNOSTIC.actorId, { ...source(), _id: DIAGNOSTIC.itemIds[0] }, [mapping()])).toThrow('allowlist');
    expect(() => projectRepair('unrelated', source(), [mapping()])).toThrow('allowlist');
  });
  test('stale data and repeated projection cannot overwrite current data', () => {
    expect(() => assertFresh('changed', 'approved')).toThrow('changed');
    const repaired = projectRepair(actorId, source(), [mapping()]).candidate;
    expect(() => projectRepair(actorId, repaired, [mapping()])).toThrow('Stale');
  });
  test('refuses partial repair and duplicate mappings', () => {
    const doc = source(); doc.system.advancement.grant.configuration.items.push({ uuid: 'Actor.other.Item.other' });
    expect(() => projectRepair(actorId, doc, [mapping()])).toThrow('Unresolved');
    expect(() => projectRepair(actorId, source(), [mapping(), mapping()])).toThrow('Duplicate');
  });
  test('rejects embedded destinations and wrong advancement types', () => {
    expect(topLevelItem('Compendium.pkg.pack.Actor.actor.Item.item')).toBe(false);
    expect(topLevelItem('Actor.actor.Item.item')).toBe(false);
    expect(() => projectRepair(actorId, source(), [{ ...mapping(), to: from }])).toThrow('destination');
    const doc = source(); doc.system.advancement.grant.type = 'ItemChoice';
    expect(() => projectRepair(actorId, doc, [mapping()])).toThrow('Not an ItemGrant');
  });
  test('unrelated data or source provenance changes fail verification; expected metadata is allowed', () => {
    const before = source(); const timestamps = structuredClone(before); timestamps._stats.modifiedTime = 6;
    expect(() => assertUnchanged(timestamps, before)).not.toThrow();
    const altered = structuredClone(before); altered.system.levels = 5;
    expect(() => assertUnchanged(altered, before)).toThrow('Unexpected');
    const differentOrigin = structuredClone(before); differentOrigin._stats.compendiumSource = 'Item.different';
    expect(() => assertUnchanged(differentOrigin, before)).toThrow('Unexpected');
  });
  test('diagnostic preserves order and rejects implicit legacy migration', () => {
    expect(brokenGrants(source()).map(x => x.uuid)).toEqual([from]);
    expect(origins({ _stats: { compendiumSource: to }, flags: { core: { sourceId: to } } })).toEqual([to]);
    expect(() => brokenGrants({ system: { advancement: [] } })).toThrow('legacy');
  });
  test('source hints include bounded importer identities without unrelated flags or descriptions', () => {
    const hints = sourceHints({ flags: { plutonium: { page: 'classFeature', source: 'XPHB', hash: 'encoded-id', ignoredSecret: 'omit' }, unrelated: { secret: 'omit' } }, system: { source: { book: 'Synthetic', page: 7 }, description: { value: 'Do not export' } } });
    expect(hints.plutonium).toEqual({ page: 'classFeature', source: 'XPHB', hash: 'encoded-id' });
    expect(JSON.stringify(hints)).not.toContain('omit');
    expect(JSON.stringify(hints)).not.toContain('Do not export');
  });
  test('importer identity requires the complete tuple and differentiates editions', () => {
    const base = { type: 'feat', flags: { plutonium: { page: 'classFeature', source: 'XPHB', hash: 'feature-identifier' } } };
    expect(identityKeys(base)).toHaveLength(1);
    expect(identityKeys({ ...base, flags: { plutonium: { page: 'classFeature', source: 'PHB', hash: 'feature-identifier' } } })).not.toEqual(identityKeys(base));
    expect(identityKeys({ name: 'Same Name', flags: { plutonium: { source: 'XPHB' } } })).toEqual([]);
  });
  test('Chinese importer namespace is read explicitly and never overwrites a conflicting English identity', () => {
    const source = { type: 'feat', flags: { 'plutonium-cn': { page: 'classFeature', source: 'BOOK', hash: 'chinese-key', propDroppable: 'classFeature' }, plutonium: { page: 'classFeature', source: 'OTHER', hash: 'english-key' }, 'scene-packer': { sourceId: 'Item.oldSource', hash: 'packer-hash' } } };
    expect(sourceHints(source).plutoniumCN.hash).toBe('chinese-key');
    expect(sourceHints(source).plutonium.hash).toBe('english-key');
    expect(identityKeys(source).filter(k => k.startsWith('plutonium-cn:'))).toHaveLength(1);
    expect(identityKeys(source).filter(k => k.startsWith('plutonium:'))).toHaveLength(1);
    expect(origins(source)).toEqual(['Item.oldSource']);
    expect(sourceHints(source).scenePacker).toEqual({ sourceId: 'Item.oldSource', hash: 'packer-hash' });
  });
});

describe('inspection Macro integration without a real world', () => {
  async function command() {
    const result = await Bun.build({ entrypoints: [fileURLToPath(new URL('./runtime.mjs', import.meta.url))], target: 'browser', format: 'esm' });
    expect(result.success).toBe(true);
    return new (Object.getPrototypeOf(async function() {}).constructor)('game', 'location', 'foundry', 'CONFIG', 'fromUuid', 'saveDataToFile', 'crypto', await result.outputs[0].text());
  }
  test('wrong port is rejected before any UI or data operation', async () => {
    const execute = await command();
    await expect(execute({}, { hostname: '127.0.0.1', port: '30001' }, {}, {}, null, null, crypto)).rejects.toThrow('Wrong target');
  });
  test('inspection fallback reads all targets without writes; approved build refuses stale fixtures before any write', async () => {
    let writes = 0;
    const actors = new Map();
    for (const target of [...TARGETS, DIAGNOSTIC]) {
      const data = { _id: target.actorId, name: 'Synthetic only', system: { attributes: { hp: { value: 17 } } }, items: target.itemIds.map(id => ({ ...source(), _id: id })) };
      actors.set(target.actorId, { id: target.actorId, name: data.name, toObject: () => structuredClone(data), items: { _source: data.items, invalidDocumentIds: new Set(target.itemIds), getInvalid: () => { throw new Error('synthetic invalid document'); } }, updateEmbeddedDocuments: () => { writes++; throw new Error('unexpected write'); } });
    }
    const referent = { _id: 'syntheticFeature', name: 'Originless feature', type: 'feat', system: { identifier: 'feature', description: { value: 'Private full text not to export' } }, flags: { 'plutonium-cn': { page: 'feat', source: 'BOOK', hash: 'feature-book' } } };
    actors.set('syntheticActor', { toObject: () => ({ items: [referent] }), items: { _source: [referent] } });
    const before = JSON.stringify([...actors.values()].map(a => a.toObject()));
    const actions = ['inspect', 'apply', 'close'];
    const panels = [];
    const game = { version: '14.368', world: { id: 'cor-cotn' }, system: { id: 'dnd5e', version: '6.0.2' }, user: { isGM: true }, actors, folders: new Map(), items: [{ uuid: 'Item.provenanceSource', documentName: 'Item', toObject: () => ({ ...referent, _id: 'provenanceSource' }) }, { uuid: 'Item.sameNameWrongSource', documentName: 'Item', toObject: () => ({ ...referent, flags: {}, system: { identifier: 'different' } }) }], macros: { filter: () => [{ getFlag: () => null, setFlag: () => { writes++; } }] } };
    const foundry = { applications: { api: { DialogV2: { wait: async config => { panels.push(config.content); return actions.shift(); } } } } };
    await (await command())(game, { hostname: '127.0.0.1', port: '30002' }, foundry, {}, async () => { throw new Error('unexpected lookup'); }, () => { writes++; }, crypto);
    expect(panels[1]).toContain('WORLD_CANDIDATES_REQUIRE_REVIEW');
    expect(panels[1]).toContain('Item.provenanceSource');
    expect(panels[1]).not.toContain('Item.sameNameWrongSource');
    expect(panels[1]).not.toContain('Private full text not to export');
    expect(panels[1]).toContain('raw-source-only');
    expect(panels[2]).toContain('Reviewed recovery receipt does not match');
    expect(writes).toBe(0);
    expect(JSON.stringify([...actors.values()].map(a => a.toObject()))).toBe(before);
  });
});

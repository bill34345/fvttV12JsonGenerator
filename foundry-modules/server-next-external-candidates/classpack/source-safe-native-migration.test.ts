import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSourcePreservingMigration, prepareSourcePreservingMigration, migrateSourcePreservingPack } from './source-safe-native-migration.mjs';

// The pinned Foundry Core 14.368 common helpers are pure JS and load without a service.
const coreRoot = 'F:/FoundryLab/foundry-v14/app/14.368/common';
if (!existsSync(`${coreRoot}/utils/helpers.mjs`)) throw new Error(`Pinned Foundry Core helpers unavailable: ${coreRoot}`);
const { mergeObject } = await import(pathToFileURL(`${coreRoot}/utils/helpers.mjs`).href);
const { ForcedReplacement, ForcedDeletion } = await import(pathToFileURL(`${coreRoot}/data/operators.mjs`).href);

type SourceAdvancement = { _id: string; [key: string]: unknown };
type SourceEffect = { _id: string; name?: string };
type SourceItem = {
  _id: string;
  name: string;
  type: string;
  _stats: { systemVersion: string };
  system: {
    source: { rules: string; book?: string };
    advancement: SourceAdvancement[] | Record<string, SourceAdvancement>;
    description: { value: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type SourceDocument = {
  _id: string;
  name: string;
  type: string;
  _stats: { systemVersion: string };
  system: {
    source: { rules: string; book?: string };
    details?: { biography: { value: string } };
    advancement?: SourceAdvancement[] | Record<string, SourceAdvancement>;
    [key: string]: unknown;
  };
  items: SourceItem[];
  effects: SourceEffect[];
  [key: string]: unknown;
};

function requirePresent<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing test fixture value: ${label}`);
  return value;
}

const actorSource = (): SourceDocument => ({
  _id: 'actor1', name: 'Original monster', type: 'npc', _stats: { systemVersion: '3.3.0' },
  system: { source: { rules: '2024', book: 'Original' }, details: { biography: { value: 'Source prose' } } },
  items: [{ _id: 'item1', name: 'Original claw', type: 'weapon', _stats: { systemVersion: '3.3.0' },
    system: { source: { rules: '2024', book: 'Original' }, advancement: [{ _id: 'grant1' }],
      description: { value: 'Original attack text' } } }], effects: [],
});

describe('classpack source-safe native migration', () => {
  test('retains old Actor and embedded Item authored 2024 rules and source fields through native delta', () => {
    const source = actorSource();
    const update = { 'system.source.rules': '2014', items: [{ _id: 'item1',
      'system.source.rules': '2014', 'system.advancement': ForcedReplacement.create({ grant1: { _id: 'grant1' } }),
      'system.description.value': 'Original attack text' }] };
    const { projectedSource, audit } = buildSourcePreservingMigration(source, update, mergeObject);
    expect(projectedSource.system.source).toEqual(source.system.source);
    const projectedItem = requirePresent(projectedSource.items[0], 'projected embedded item');
    const sourceItem = requirePresent(source.items[0], 'source embedded item');
    expect(projectedItem.system.source).toEqual(sourceItem.system.source);
    expect(projectedItem.system.advancement).toEqual({ grant1: { _id: 'grant1' } });
    expect(projectedItem.system.description.value).toBe('Original attack text');
    expect(projectedSource._id).toBe('actor1');
    expect(projectedItem.name).toBe('Original claw');
    expect(audit.preservedRules.map((entry: any) => entry.path)).toEqual(['actor1', 'actor1.items.item1']);
    expect(source.system.source.rules).toBe('2024');
  });

  test('retains explicit top-level Item rules and rejects identity changes', () => {
    const item = requirePresent(actorSource().items[0], 'top-level Item source');
    const { projectedSource } = buildSourcePreservingMigration(item,
      { 'system.source.rules': '2014', 'system.advancement': ForcedReplacement.create({ grant1: { _id: 'grant1' } }) }, mergeObject);
    expect(projectedSource.system.source.rules).toBe('2024');
    expect(projectedSource.system.advancement).toEqual({ grant1: { _id: 'grant1' } });
    expect(() => buildSourcePreservingMigration(item, { name: 'Other' }, mergeObject)).toThrow('ID or name changed');
    expect(() => buildSourcePreservingMigration(actorSource(), { items: [{ _id: 'new' }] }, mergeObject))
      .toThrow('native update added unreviewed ID new');
    expect(() => buildSourcePreservingMigration(actorSource(), { effects: [{ _id: 'new' }] }, mergeObject))
      .toThrow('native update added unreviewed ID new');
    expect(buildSourcePreservingMigration(item, { 'flags.dnd5e.old': new ForcedDeletion() }, mergeObject)
      .projectedSource._id).toBe('item1');
  });

  function packFixture({ persistedRules = '2024', updateFails = false,
    dropAdvancement = false, dropEffect = false, candidateDropsEffect = false,
    candidateInvalid = false } = {}) {
    let backend = actorSource();
    backend.effects.push({ _id: 'effect1', name: 'Original glow' });
    const calls: string[] = [];
    const document = {
      id: 'actor1', uuid: 'Compendium.classpack.monsterspack.Actor.actor1',
      toObject: () => structuredClone(backend),
      validate: () => true,
      async update(source: SourceDocument, options: Record<string, unknown>) {
        calls.push(`update:${JSON.stringify(options)}`);
        if (updateFails) throw new Error('write failed');
        backend = structuredClone(source);
        backend.system.source.rules = persistedRules;
        if (dropAdvancement) requirePresent(backend.items[0], 'backend embedded item').system.advancement = {};
        if (dropEffect) backend.effects = [];
      },
      async deleteEmbeddedDocuments(type: string, ids: string[]) {
        calls.push(`delete:${type}:${ids.join(',')}`);
        backend.effects = backend.effects.filter(effect => !ids.includes(effect._id));
      },
    };
    const pack = {
      collection: 'classpack.monsterspack', documentName: 'Actor', locked: true,
      async configure({ locked }: { locked: boolean }) { this.locked = locked; calls.push(`lock:${locked}`); },
      async getDocuments(query?: { _id?: string }) { calls.push(query ? `read:${query._id}` : 'read:all'); return [document]; },
      documentClass: class {
        validationFailures = { fields: null, joint: null };
        constructor(public source: any, options: any) { expect(options).toEqual({ pack: 'classpack.monsterspack' }); }
        validate(options: any) { expect(options).toEqual({ strict: true, dropInvalidEmbedded: false }); return true; }
        get items() { return candidateInvalid ? { invalidDocumentIds: new Set(['item1']) } : []; }
        toObject() { const source = structuredClone(this.source); if (candidateDropsEffect) source.effects = []; return source; }
      },
    };
    const migrations = {
      async getMigrationData() { return { iconMap: {} }; },
      migrateActorData(_doc: any, source: any, _data: any, flags: any, options: any) {
        expect(source._stats.systemVersion).toBe('3.3.0');
        expect(flags.bypassVersionCheck).toBe(false);
        expect(options.actorUuid).toBe(document.uuid);
        return { 'system.source.rules': '2014', items: [{ _id: 'item1', 'system.source.rules': '2014' }] };
      },
      migrateItemData() { throw new Error('not an Item pack'); },
    };
    return { pack, migrations, foundry: { utils: { mergeObject } }, calls };
  }

  type Fixture = ReturnType<typeof packFixture>;
  type TestMigrationHelpers = {
    getMigrationData?: () => Promise<unknown>;
    migrateActorData: (...args: unknown[]) => unknown;
    migrateItemData: (...args: unknown[]) => unknown;
  };
  type TestMigrationOptions = {
    foundry: { utils: { mergeObject: typeof mergeObject } };
    migrations: TestMigrationHelpers;
    removedDuplicateEffects?: string[];
    legacyAdvancementArrayUuids?: string[];
  };
  type TestPrepareOptions = Omit<TestMigrationOptions, 'legacyAdvancementArrayUuids'> & {
    legacyAdvancementArrays?: boolean;
  };
  type TestMigrationPack = {
    documentName: string;
    collection: string;
    documentClass: new (source: unknown, options: unknown) => {
      validate: (options?: unknown) => boolean;
      toObject: () => Record<string, unknown>;
      items?: unknown;
    };
  };
  type PlannedSource = { system: Record<string, unknown>; [key: string]: unknown };
  type CompletedMigration = { removedDuplicateEffects: string[]; [key: string]: unknown };
  const migratePack = migrateSourcePreservingPack as unknown as (
    pack: Fixture['pack'], options: TestMigrationOptions,
  ) => Promise<{ collection: string; completed: CompletedMigration[] }>;
  const prepareMigration = prepareSourcePreservingMigration as unknown as (
    document: object, pack: TestMigrationPack, migrationData: unknown, options: TestPrepareOptions,
  ) => { projectedSource: PlannedSource; wireSource: PlannedSource };

  test('writes full source and verifies an independent backend reread', async () => {
    const fixture = packFixture();
    const result = await migratePack(fixture.pack, { foundry: fixture.foundry, migrations: fixture.migrations });
    expect(result.completed).toHaveLength(1);
    expect(fixture.calls).toEqual(['lock:false', 'read:all',
      'update:{"diff":false,"recursive":false,"render":false}', 'read:actor1', 'lock:true']);
    expect(fixture.pack.locked).toBe(true);
  });

  test('partial persistence fails with document ID and restores pack lock', async () => {
    const fixture = packFixture({ persistedRules: '2014' });
    await expect(migratePack(fixture.pack, { foundry: fixture.foundry, migrations: fixture.migrations }))
      .rejects.toThrow('classpack.monsterspack document actor1: actor1 backend authored rules differ');
    expect(fixture.pack.locked).toBe(true);
    expect(fixture.calls.at(-1)).toBe('lock:true');
    expect(fixture.calls.filter(call => call.startsWith('update:'))).toHaveLength(1);
  });

  test('backend loss of Advancement or effect fails after the full-source update', async () => {
    for (const options of [{ dropAdvancement: true }, { dropEffect: true }]) {
      const fixture = packFixture(options);
      await expect(migratePack(fixture.pack, { foundry: fixture.foundry, migrations: fixture.migrations }))
        .rejects.toThrow('IDs or names differ from projection');
      expect(fixture.pack.locked).toBe(true);
    }
  });

  test('candidate normalization loss fails before the first write', () => {
    const fixture = packFixture({ candidateDropsEffect: true });
    const document = { id: 'actor1', uuid: 'Compendium.classpack.monsterspack.Actor.actor1',
      toObject: () => ({ ...actorSource(), effects: [{ _id: 'effect1', name: 'Original glow' }] }) };
    expect(() => prepareMigration(document, fixture.pack, {},
      { foundry: fixture.foundry, migrations: fixture.migrations })).toThrow('IDs or names differ from projection');
    expect(fixture.calls.some(call => call.startsWith('update:'))).toBe(false);
  });

  test('candidate invalid embedded collection fails before the first write', () => {
    const fixture = packFixture({ candidateInvalid: true });
    const document = { id: 'actor1', uuid: 'Compendium.classpack.monsterspack.Actor.actor1', toObject: actorSource };
    expect(() => prepareMigration(document, fixture.pack, {},
      { foundry: fixture.foundry, migrations: fixture.migrations })).toThrow('invalidDocumentIds');
    expect(fixture.calls.some(call => call.startsWith('update:'))).toBe(false);
  });

  test('approved duplicate parent effect uses normal deletion and backend confirmation', async () => {
    const fixture = packFixture();
    const uuid = 'Compendium.classpack.monsterspack.Actor.actor1.ActiveEffect.effect1';
    const result = await migratePack(fixture.pack,
      { foundry: fixture.foundry, migrations: fixture.migrations, removedDuplicateEffects: [uuid] });
    const completed = requirePresent(result.completed[0], 'duplicate-effect migration receipt');
    expect(completed.removedDuplicateEffects).toEqual(['effect1']);
    expect(fixture.calls).toContain('delete:ActiveEffect:effect1');
    expect(fixture.calls.indexOf('delete:ActiveEffect:effect1')).toBeLessThan(fixture.calls.indexOf('read:actor1'));
  });

  test('write failure stops without replay and restores lock', async () => {
    const fixture = packFixture({ updateFails: true });
    await expect(migratePack(fixture.pack, { foundry: fixture.foundry, migrations: fixture.migrations }))
      .rejects.toThrow('classpack.monsterspack document actor1: write failed');
    expect(fixture.pack.locked).toBe(true);
    expect(fixture.calls.some(call => call.startsWith('read:actor1'))).toBe(false);
    expect(fixture.calls.filter(call => call.startsWith('update:'))).toHaveLength(1);
  });

  test('reviewed class array wire input roundtrips into the same dnd5e6 advancement map', () => {
    const source: any = { _id: 'ranger1', name: 'Original ranger', type: 'class',
      system: { source: { rules: '2014' }, advancement: { grant1: { _id: 'grant1', type: 'ItemGrant' } } } };
    const document = { id: source._id, uuid: 'Compendium.classpack.classes-new.Item.ranger1', toObject: () => structuredClone(source) };
    const pack = { documentName: 'Item', collection: 'classpack.classes-new', documentClass: class {
      source: any;
      constructor(value: any) {
        expect(Array.isArray(value.system.advancement)).toBe(true);
        this.source = structuredClone(value);
        this.source.system.advancement = Object.fromEntries(value.system.advancement.map((entry: any) => [entry._id, entry]));
      }
      validate() { return true; }
      toObject() { return this.source; }
    } };
    const options = { foundry: { utils: { mergeObject } }, migrations: { migrateItemData: () => ({}), migrateActorData() {} }, legacyAdvancementArrays: true };
    const result = prepareMigration(document, pack, {}, options);
    expect(result.projectedSource).toEqual(source);
    expect(result.wireSource.system.advancement).toEqual(Object.values(source.system.advancement));
    expect(source.system.advancement).toEqual({ grant1: { _id: 'grant1', type: 'ItemGrant' } });
    source.type = 'feat';
    expect(() => prepareMigration(document, pack, {}, options)).toThrow('explicitly reviewed 2014 class/subclass');
  });
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(join(import.meta.dir, 'next-migration.mjs'), 'utf8');
const names = [
  'rtable', 'moditems', 'loots', 'extra-ability', 'class-table', 'classes-new',
  'class-abilityphb', 'new-icon', 'racial-traits', 'races', 'itempack',
  'spell-table', 'feats-all', 'subclass', 'BackgroundList', 'BackgroundFeature',
  'monsterspack', 'races-item', 'summons', 'monster', 'macro',
];
const actors = new Set(['monsterspack', 'summons', 'monster']);
const journals = new Set(['class-table', 'races', 'spell-table']);

type BaselineRecord = {
  key: string;
  kind: string;
  rootId: string;
  id: string;
  name: string | null;
  textSha256: string;
  textFieldPaths: string[];
  advancementIds: string[];
  activeUuids: Array<[string, string]>;
  sourceRules?: string | null;
  canonicalTextSha256?: string;
  canonicalTextFieldPaths?: string[];
  detachedFromParent?: boolean;
  [key: string]: unknown;
};
type BaselinePack = { name: string; type: string; records: BaselineRecord[] };
type TestDocument = {
  uuid: string;
  id: string;
  name?: string;
  effects: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  pages: unknown[];
  results: unknown[];
  validate: () => boolean;
  toObject: () => Record<string, unknown>;
};
type TestPack = {
  metadata: { packageName: string; name: string };
  collection: string;
  documentName: string;
  locked: boolean;
  getDocuments: () => Promise<TestDocument[]>;
  configure: (options: { locked: boolean }) => Promise<void>;
};

function requirePresent<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing test fixture value: ${label}`);
  return value;
}

function setup(options: { core?: string; dnd5e?: string; dae?: string; midi?: string; migrationFails?: boolean;
  invalidDocument?: boolean; migrationPause?: Promise<void> } = {}) {
  const callbacks = new Map<string, () => void>();
  const settings = new Map<string, unknown>();
  const migrations: Array<{ collection: string; options: unknown }> = [];
  const calls: string[] = [];
  const textSha256 = createHash('sha256').update('[]').digest('hex');
  const baseline: { moduleId: string; upstreamVersion: string; packs: BaselinePack[] } = {
    moduleId: 'dnd5e_classpack', upstreamVersion: '4.3.4', packs: names.map(name => {
    const type = actors.has(name) ? 'Actor' : journals.has(name) ? 'JournalEntry'
      : name === 'rtable' ? 'RollTable' : name === 'macro' ? 'Macro' : 'Item';
    const prefix = { Actor: '!actors!', Item: '!items!', JournalEntry: '!journal!', RollTable: '!tables!', Macro: '!macros!' }[type];
    return { name, type, records: [{ key: `${prefix}abc`, kind: prefix, rootId: 'abc', id: 'abc', name: null,
      textSha256, textFieldPaths: [] as string[], advancementIds: [], activeUuids: [] }] };
    }) };
  let baselineText = `${JSON.stringify(baseline)}\n`;
  const sourceBaselineSha256 = createHash('sha256').update(baselineText).digest('hex');
  const module = { version: '4.3.4-next.1', flags: { classpackV14: { dataMigrationComplete: true },
    classpackNext: { sourceBaselineSha256, runtimeSha256: createHash('sha256').update(source).digest('hex') } }, api: null as unknown };
  const modules = new Map<string, unknown>([['dnd5e_classpack', module]]);
  if (options.dae) modules.set('dae', { active: true, version: options.dae });
  if (options.midi) modules.set('midi-qol', { active: true, version: options.midi });
  const packs: TestPack[] = names.map<TestPack>(name => {
    const documentName = actors.has(name) ? 'Actor' : journals.has(name) ? 'JournalEntry'
      : name === 'rtable' ? 'RollTable' : name === 'macro' ? 'Macro' : 'Item';
    const document: TestDocument = { uuid: `Compendium.dnd5e_classpack.${name}.${documentName}.abc`,
      id: 'abc', effects: [], items: [], pages: [], results: [],
      validate: () => !options.invalidDocument,
      toObject: () => ({ effects: [], items: [], _stats: { systemVersion: '5.3.3' } }) };
    return { metadata: { packageName: 'dnd5e_classpack', name }, collection: `dnd5e_classpack.${name}`,
      documentName, locked: true, async getDocuments() { return [document]; },
      async configure({ locked }: { locked: boolean }) { this.locked = locked; calls.push(`${name}:${locked}`); } };
  });
  const game = {
    version: options.core ?? '14.368', system: { id: 'dnd5e', version: options.dnd5e ?? '6.0.5', flags: { needsMigrationVersion: '6.0.0' } },
    modules: { get: (id: string) => modules.get(id) }, packs: { filter: (fn: (pack: object) => boolean) => packs.filter(fn) },
    user: { id: 'gm1', isActiveGM: true }, world: { flags: { dnd5e: { version: '6.0.5' } } },
    settings: {
      register: (ns: string, key: string, value: unknown) => { calls.push(`register:${ns}.${key}`); },
      get: (ns: string, key: string) => settings.get(`${ns}.${key}`),
      set: async (ns: string, key: string, value: unknown) => { settings.set(`${ns}.${key}`, value); calls.push(`set:${ns}.${key}`); },
    },
    dnd5e: { migrations: { getMigrationData: async () => ({}), migrateCompendium: async (pack: { collection: string }, config: unknown) => {
      migrations.push({ collection: pack.collection, options: config });
      if (options.migrationPause) await options.migrationPause;
      if (options.migrationFails) throw new Error('synthetic strict migration failure');
    } } },
  };
  const context = vm.createContext({
    classpackSourceInterop: { assertValid: () => true, diagnostic: () => ({ failures: [], pending: 0 }) },
    prepareSourcePreservingMigration: () => ({ projectedSource: {}, audit: { preservedRules: [] } }),
    migrateSourcePreservingPack: async (pack: { collection: string }) => {
      await game.dnd5e.migrations.migrateCompendium(pack, { bypassVersionCheck: false, strict: true });
      return { collection: pack.collection, completed: [{ preservedRules: [] }] };
    },
    game, console: { info: () => {} }, setTimeout, Date, crypto: webcrypto, TextEncoder,
    fetch: async (url: string) => ({ ok: true, text: async () => url.endsWith('next-migration.mjs') ? source : baselineText }),
    foundry: { utils: { isNewerVersion: (left: string, right: string) => {
      if (right == null) return true;
      const a = left.split('.').map(Number), b = right.split('.').map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
      }
      return false;
    }, diffObject: () => ({}) } },
    Hooks: { once: (name: string, fn: () => void) => callbacks.set(name, fn), callAll: (name: string) => calls.push(`hook:${name}`) },
  });
  vm.runInContext(`${source}\nglobalThis.testInternals={assertMigrationRuntime,migrateDaeDocuments,advancementIds,activeUuids,sourceTextFields,canonicalSourceTextFields,assertSourceMigrationSemantics};`, context);
  callbacks.get('init')?.();
  callbacks.get('ready')?.();
  const api = module.api as { inventory: () => Promise<unknown>; preflight: () => Promise<Record<string, unknown>>; migrate: () => Promise<Record<string, unknown>>; confirmRecovery: (input: object) => Promise<Record<string, any>> };
  const rebase = () => {
    baselineText = `${JSON.stringify(baseline)}\n`;
    module.flags.classpackNext.sourceBaselineSha256 = createHash('sha256').update(baselineText).digest('hex');
  };
  const reload = () => {
    vm.runInContext(`(function(){${source}\n})();`, context);
    callbacks.get('init')?.(); callbacks.get('ready')?.();
    return module.api as typeof api;
  };
  return { api, game, module, packs, migrations, settings, calls, baseline, rebase, reload, testInternals: context.testInternals as {
    assertMigrationRuntime: () => void;
    migrateDaeDocuments: (pack: object, migration: object) => Promise<number>;
    advancementIds: (value: object) => string[];
    activeUuids: (value: object) => Array<[string, string]>;
    sourceTextFields: (value: object) => Array<[string, string]>;
    canonicalSourceTextFields: (value: object, kind: string) => Array<[string, string]>;
    assertSourceMigrationSemantics: (before: object, after: object, label: string) => void;
  } };
}

describe('ServerNext classpack migration contract', () => {
  test('recovery validates sources, preserves the original FAILED receipt and prevents pack replay', async () => {
    const fixture = setup();
    await fixture.api.migrate();
    const failed = { ...(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt') as object), status: 'FAILED',
      failingPack: 'post-migration-identity-validation', error: 'Lost original authored effect' } as any;
    fixture.settings.set('dnd5e_classpack.nextMigrationReceipt', failed);
    const before = JSON.stringify(failed);
    const result = await fixture.api.confirmRecovery({ failedRunId: failed.runId,
      expectedFailedReceiptSha256: createHash('sha256').update(before).digest('hex'),
      restoredUuid: 'Compendium.dnd5e_classpack.summons.Actor.4XOCbibDwZcdgbhV.ActiveEffect.dnd5einvisible00' });
    expect(result.recovery.status).toBe('COMPLETE');
    expect(result.recovery.migrationReplayed).toBe(false);
    expect(JSON.stringify(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt'))).toBe(before);
    expect(fixture.migrations).toHaveLength(16);
    expect((await fixture.api.migrate()).migrationSkipped).toBe(true);
    expect(fixture.migrations).toHaveLength(16);
  });

  test('recovery refuses unfinished packs without writing a recovery receipt', async () => {
    const fixture = setup();
    const failed = { status: 'FAILED', runId: 'partial', failingPack: 'post-migration-identity-validation', completedPacks: [] };
    fixture.settings.set('dnd5e_classpack.nextMigrationReceipt', failed);
    await expect(fixture.api.confirmRecovery({ failedRunId: 'partial',
      expectedFailedReceiptSha256: createHash('sha256').update(JSON.stringify(failed)).digest('hex'),
      restoredUuid: 'Compendium.dnd5e_classpack.summons.Actor.4XOCbibDwZcdgbhV.ActiveEffect.dnd5einvisible00' })).rejects.toThrow('unfinished packs');
    expect(fixture.settings.has('dnd5e_classpack.nextMigrationRecoveryReceipt')).toBe(false);
    expect(fixture.migrations).toHaveLength(0);
  });
  test('per-document persistence rejects changed grant targets or embedded source prose', () => {
    const { assertSourceMigrationSemantics } = setup().testInternals;
    const before = { _id: 'actor', items: [{ _id: 'feat', system: {
      description: { value: '<p>Original rule.</p>' },
      advancement: { grant: { _id: 'grant', configuration: { items: [{ uuid: 'Compendium.source.Item.real' }] } } },
    } }] };
    const after = structuredClone(before);
    expect(() => assertSourceMigrationSemantics(before, after, 'actor')).not.toThrow();
    const migratedItem = requirePresent(after.items[0], 'semantic-check embedded item');
    const grantItem = requirePresent(migratedItem.system.advancement.grant.configuration.items[0], 'semantic-check grant');
    grantItem.uuid = 'Compendium.source.Item.wrong';
    expect(() => assertSourceMigrationSemantics(before, after, 'actor')).toThrow('active grants/spells differ');
    grantItem.uuid = 'Compendium.source.Item.real';
    migratedItem.system.description.value = '<p>Changed rule.</p>';
    expect(() => assertSourceMigrationSemantics(before, after, 'actor')).toThrow('source prose differs');
  });
  test('ready registers an API but never changes packs or world settings', () => {
    const fixture = setup();
    expect(fixture.calls).toEqual(['register:dnd5e_classpack.nextMigrationReceipt', 'register:dnd5e_classpack.nextMigrationRecoveryReceipt']);
    expect(fixture.migrations).toHaveLength(0);
    expect(fixture.settings.size).toBe(0);
    expect(fixture.packs.every(pack => pack.locked)).toBe(true);
  });

  test('old dnd5e5 marker cannot skip strict Actor/Item migration; target receipt makes retry read-only', async () => {
    const fixture = setup();
    const first = await fixture.api.migrate();
    expect(first.packCount).toBe(21);
    expect(first.migrationSkipped).toBe(false);
    expect(fixture.migrations).toHaveLength(16);
    expect(fixture.migrations.every(call => JSON.stringify(call.options) === '{"bypassVersionCheck":false,"strict":true}')).toBe(true);
    expect(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt')).toMatchObject({
      status: 'COMPLETE', revision: 4, core: '14.368', dnd5e: '6.0.5', moduleVersion: '4.3.4-next.1',
    });
    const second = await fixture.api.migrate();
    expect(second.migrationSkipped).toBe(true);
    expect(fixture.migrations).toHaveLength(16);
    expect(fixture.calls.filter(call => call.startsWith('set:'))).toHaveLength(23);
  });

  test('exact target guard rejects old Core, system and mismatched active automation dependencies', () => {
    for (const options of [
      { core: '14.364' }, { dnd5e: '5.3.3' }, { dae: '14.0.12' }, { midi: '14.0.11' },
    ]) expect(() => setup(options).testInternals.assertMigrationRuntime()).toThrow();
    expect(() => setup({ dae: '14.0.14+servernext.1', midi: '14.6.0-beta.4338eeab.local.10' })
      .testInternals.assertMigrationRuntime()).not.toThrow();
  });

  test('strict migration errors propagate without a false completed receipt', async () => {
    const fixture = setup({ migrationFails: true });
    await expect(fixture.api.migrate()).rejects.toThrow('synthetic strict migration failure');
    expect(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt')).toMatchObject({
      status: 'FAILED', failingPack: 'dnd5e_classpack.BackgroundFeature', completedPacks: [],
    });
    await expect(fixture.api.migrate()).rejects.toThrow('receipt is FAILED');
    expect(fixture.migrations).toHaveLength(1);
    expect(fixture.calls.some(call => call.startsWith('hook:dnd5eClasspackNextMigrated'))).toBe(false);
  });

  test('read-only strict schema preflight covers all documents before any pack write', async () => {
    const valid = setup();
    const report = await valid.api.preflight();
    expect(report.validatedDocuments).toBe(21);
    expect(valid.migrations).toHaveLength(0);
    expect(valid.settings.size).toBe(0);
    const invalid = setup({ invalidDocument: true });
    await expect(invalid.api.migrate()).rejects.toThrow('schema preflight failed');
    expect(invalid.migrations).toHaveLength(0);
    expect(invalid.settings.size).toBe(0);
    const missing = setup();
    requirePresent(missing.packs[0], 'first missing-document pack').getDocuments = async () => [];
    await expect(missing.api.migrate()).rejects.toThrow('loaded document IDs/count differ');
    expect(missing.migrations).toHaveLength(0);
    expect(missing.settings.size).toBe(0);
    const redirected = setup();
    const firstPack = requirePresent(redirected.packs[0], 'first redirected pack');
    const originalDocuments = firstPack.getDocuments;
    firstPack.getDocuments = async () => {
      const documents = await originalDocuments();
      const firstDocument = requirePresent(documents[0], 'redirected source document');
      firstDocument.toObject = () => ({ system: { activities: { cast: { spell: { uuid: 'Compendium.other.pack.Item.wrong' } } } } });
      return documents;
    };
    await expect(redirected.api.migrate()).rejects.toThrow('active UUID references differ');
    expect(redirected.migrations).toHaveLength(0);
  });

  test('source/runtime hash drift refuses preflight and a changed build cannot replay a completed receipt', async () => {
    const stale = setup();
    stale.module.flags.classpackNext.runtimeSha256 = '0'.repeat(64);
    await expect(stale.api.preflight()).rejects.toThrow('runtime source differs');
    expect(stale.settings.size).toBe(0);
    const changed = setup();
    await changed.api.migrate();
    changed.module.version = '4.3.4-next.2';
    await expect(changed.api.migrate()).rejects.toThrow('receipt is COMPLETE');
    expect(changed.migrations).toHaveLength(16);
  });

  test('authored 2024 rules cannot be silently reset by native old-version migration', async () => {
    const fixture = setup();
    const expected = requirePresent(fixture.baseline.packs.find(pack => pack.name === 'new-icon')?.records[0],
      'new-icon source baseline record');
    Object.assign(expected, { sourceRules: '2024' });
    const [documentValue] = await requirePresent(fixture.packs.find(pack => pack.metadata.name === 'new-icon'),
      'new-icon test pack').getDocuments();
    const document = requirePresent(documentValue, 'new-icon test document');
    const sourceData: any = { system: { source: { rules: '2024' } }, _stats: { systemVersion: '4.3.4' } };
    Object.assign(document, { toObject: () => sourceData });
    fixture.rebase();
    expect((await fixture.api.preflight()).ok).toBe(true);
    sourceData._stats.systemVersion = '3.3.0';
    expect((await fixture.api.preflight()).authored2024NativeConflictsProtected).toBe(1);
    delete sourceData._stats.systemVersion;
    expect((await fixture.api.preflight()).authored2024NativeConflictsProtected).toBe(1);
    sourceData.system.source.rules = '2014';
    await expect(fixture.api.preflight()).rejects.toThrow('authored rules edition differs');
    expect(fixture.migrations).toHaveLength(0);
    expect(fixture.settings.size).toBe(0);
  });

  test('real model empty text defaults preserve every authored path and reject authored changes', async () => {
    const fixture = setup();
    const pack = fixture.packs.find(entry => entry.metadata.name === 'BackgroundFeature')!;
    const [documentValue] = await pack.getDocuments();
    const document = requirePresent(documentValue, 'background feature test document');
    const original = { system: { description: { value: '<p>Original ship repair rule.</p>', chat: '' },
      activities: { dnd5eactivity000: { description: { chatFlavor: '' } } } } };
    const expected = requirePresent(fixture.baseline.packs.find(entry => entry.name === 'BackgroundFeature')?.records[0],
      'background feature source baseline record');
    const fields = fixture.testInternals.sourceTextFields(original);
    expected.textFieldPaths = fields.map(([path]) => path);
    expected.textSha256 = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    fixture.rebase();
    const loaded = structuredClone(original) as any;
    const activity = loaded.system.activities.dnd5eactivity000;
    activity.description.value = '';
    activity.effectConditionText = '';
    activity.useConditionText = '';
    activity.midiProperties = { triggeredActivityConditionText: '' };
    activity.overTimeProperties = { preRemoveConditionText: '', postRemoveConditionText: '' };
    Object.assign(document, { toObject: () => loaded });
    expect((await fixture.api.preflight()).ok).toBe(true);
    activity.description.value = 'Unexpected new rule';
    await expect(fixture.api.preflight()).rejects.toThrow('source text differs');
    activity.description.value = '';
    loaded.system.description.value = '<p>Changed ship repair rule.</p>';
    await expect(fixture.api.preflight()).rejects.toThrow('source text differs');
    loaded.system.description.value = original.system.description.value;
    delete loaded.system.description.chat;
    await expect(fixture.api.preflight()).rejects.toThrow('source text differs');
    expect(fixture.settings.size).toBe(0);
    expect(fixture.migrations).toHaveLength(0);
  });

  test('a second same-client migration cannot start during an owned run', async () => {
    let release!: () => void;
    const pause = new Promise<void>(resolve => { release = resolve; });
    const fixture = setup({ migrationPause: pause });
    const running = fixture.api.migrate();
    for (let attempt = 0; attempt < 100 && fixture.migrations.length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    expect(fixture.migrations).toHaveLength(1);
    await expect(fixture.api.migrate()).rejects.toThrow('already running');
    release();
    await running;
  });

  test('DAE per-pack operation restores original lock on failure', async () => {
    const fixture = setup();
    const pack = fixture.packs.find(pack => pack.documentName === 'Actor')!;
    await expect(fixture.testInternals.migrateDaeDocuments(pack, {
      async migrateActor() { throw new Error('synthetic DAE failure'); },
    })).rejects.toThrow('synthetic DAE failure');
    expect(pack.locked).toBe(true);
    expect(fixture.calls.slice(-2)).toEqual([`${pack.metadata.name}:false`, `${pack.metadata.name}:true`]);
  });

  test('the exact dnd5e6 array-to-ID-map migration preserves advancement identity, text and grants', () => {
    const fixture = setup();
    const advancement = { _id: 'vjFrZtzEk1WzB23Z', type: 'ItemGrant',
      configuration: { items: [{ uuid: 'Compendium.dnd5e_classpack.new-icon.Item.YBMBbBku5PW3IuGc' }] },
      description: { value: 'Original source grant' } };
    const old = { system: { advancement: [advancement] } };
    // Exact release-6.0.5 advancement.mjs migrateStorage shape.
    const loaded = { system: { advancement: { [advancement._id]: advancement } } };
    expect(fixture.testInternals.advancementIds(old)).toEqual([advancement._id]);
    expect(fixture.testInternals.advancementIds(loaded)).toEqual([advancement._id]);
    expect(fixture.testInternals.activeUuids(loaded)).toEqual(fixture.testInternals.activeUuids(old));
    expect(fixture.testInternals.sourceTextFields(loaded)).toEqual(fixture.testInternals.sourceTextFields(old));
    expect(() => fixture.testInternals.advancementIds({ system: { advancement: { wrong: advancement } } })).toThrow();
  });

  test('precise native text serialization preserves table rules, void HTML and condition expressions', () => {
    const { canonicalSourceTextFields, activeUuids } = setup().testInternals;
    expect(canonicalSourceTextFields({ text: '<p>Original rule.<br />Second line.</p>' }, '!tables.results!'))
      .toEqual(canonicalSourceTextFields({ description: '<p>Original rule.<br>Second line.</p>' }, '!tables.results!'));
    expect(canonicalSourceTextFields({ text: 'Changed rule' }, '!tables.results!'))
      .not.toEqual(canonicalSourceTextFields({ description: 'Original rule' }, '!tables.results!'));
    const condition = (value: string) => ({ system: { activities: { action: { useConditionText: value } } } });
    expect(canonicalSourceTextFields(condition('reaction === "isHit" '), '!items!'))
      .toEqual(canonicalSourceTextFields(condition('reaction === "isHit"'), '!items!'));
    expect(canonicalSourceTextFields(condition('reaction === "isMiss"'), '!items!'))
      .not.toEqual(canonicalSourceTextFields(condition('reaction === "isHit"'), '!items!'));
    expect(activeUuids({ system: { activities: { summon: { profiles: [{ uuid: '' }] } } } })).toEqual([]);
    expect(activeUuids({ system: { activities: { summon: { profiles: [{ uuid: 'Actor.real' }] } } } })).toHaveLength(1);
  });

  test('detached physical effects stay detached; a valid child or authored source name cannot be lost', async () => {
    const fixture = setup();
    const expected = fixture.baseline.packs.find(entry => entry.name === 'new-icon')!;
    const detached = { key: '!items.effects!abc.orphan', kind: '!items.effects!', rootId: 'abc', id: 'orphan',
      name: 'Old orphan', textSha256: createHash('sha256').update('[]').digest('hex'), textFieldPaths: [], advancementIds: [], activeUuids: [], detachedFromParent: true };
    expected.records.push(detached);
    fixture.rebase();
    expect((await fixture.api.preflight()).detachedSourceRecordsVerified).toBe(1);
    detached.detachedFromParent = false;
    fixture.rebase();
    await expect(fixture.api.preflight()).rejects.toThrow('embedded document missing');
    expected.records.pop();
    const record = requirePresent(expected.records[0], 'new-icon source baseline record');
    record.name = 'Authored name';
    const [documentValue] = await requirePresent(fixture.packs.find(pack => pack.metadata.name === 'new-icon'),
      'new-icon test pack').getDocuments();
    const document = requirePresent(documentValue, 'new-icon test document');
    Object.assign(document, { name: 'Unidentified display', toObject: () => ({ name: 'Authored name' }) });
    fixture.rebase();
    expect((await fixture.api.preflight()).ok).toBe(true);
    Object.assign(document, { toObject: () => ({ name: 'Changed authored name' }) });
    await expect(fixture.api.preflight()).rejects.toThrow('source name differs');
  });

  test('a completed exact duplicate-effect deletion survives a fresh runtime without replay', async () => {
    const fixture = setup();
    const pack = fixture.packs.find(entry => entry.metadata.name === 'monster')!;
    const [documentValue] = await pack.getDocuments();
    const document = requirePresent(documentValue, 'monster test document');
    const effect = { id: 'duplicate', uuid: `${document.uuid}.ActiveEffect.duplicate`, name: 'Same source effect',
      validate: () => true, toObject: () => ({ name: 'Same source effect' }) };
    (document.effects as unknown[]).push(effect);
    document.toObject = () => ({ effects: [{ _id: 'duplicate', origin: 'Actor.abc.Item.item' }],
      items: [{ _id: 'item', effects: [{ _id: 'transferred', transfer: true }] }], _stats: { systemVersion: '2.9.0' } });
    const expected = fixture.baseline.packs.find(entry => entry.name === 'monster')!;
    expected.records.push({ key: '!actors.effects!abc.duplicate', kind: '!actors.effects!', rootId: 'abc', id: 'duplicate',
      name: effect.name, textSha256: createHash('sha256').update('[]').digest('hex'), textFieldPaths: [], advancementIds: [], activeUuids: [] });
    fixture.rebase();
    const migrateNative = fixture.game.dnd5e.migrations.migrateCompendium;
    fixture.game.dnd5e.migrations.migrateCompendium = async (input, config) => {
      await migrateNative(input, config);
      if (input.collection === pack.collection) document.effects.splice(0);
    };
    await fixture.api.migrate();
    expect(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt')).toMatchObject({ status: 'COMPLETE',
      removedDuplicateEffects: [effect.uuid] });
    const fresh = fixture.reload();
    expect((await fresh.preflight()).removedDuplicateRecordsVerified).toBe(1);
    expect((await fresh.migrate()).migrationSkipped).toBe(true);
    expect(fixture.migrations).toHaveLength(16);
    const receipt = fixture.settings.get('dnd5e_classpack.nextMigrationReceipt') as { removedDuplicateEffects: string[] };
    receipt.removedDuplicateEffects = [];
    await expect(fresh.preflight()).rejects.toThrow('embedded document missing');
  });

  test('a failed former owner cannot overwrite another client run receipt', async () => {
    const fixture = setup();
    fixture.game.dnd5e.migrations.migrateCompendium = async () => {
      fixture.settings.set('dnd5e_classpack.nextMigrationReceipt', { runId: 'other-client', status: 'IN_PROGRESS' });
      throw new Error('lost ownership during operation');
    };
    await expect(fixture.api.migrate()).rejects.toThrow('failure receipt could not be verified');
    expect(fixture.settings.get('dnd5e_classpack.nextMigrationReceipt')).toEqual({ runId: 'other-client', status: 'IN_PROGRESS' });
  });
});

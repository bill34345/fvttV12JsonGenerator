import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { RESOLVER_MODULE_ID } from '../../../core/spell-resolution';
import { buildSpellResolverPackage } from '../../../../scripts/buildSpellResolver';
import {
  EXACT_DND5E_VERSION,
  EXACT_FOUNDRY_VERSION,
  evaluateRuntimeCompatibility,
  createFoundryAdapter,
  registerResolverLifecycle,
  type ResolverFoundryAdapter,
} from '../foundry-adapter';
import { RESOLVER_SETTING_DEFINITIONS, registerResolverSettings } from '../settings';
import { buildResolverSettingsContext, parseResolverSettingsForm, rebuildResolverIndexFromSettings } from '../settings-app';
import { ITEM_INDEX_FIELDS } from '../source-index';

const moduleRoot = resolve(import.meta.dir, '..');

describe('Foundry companion module contract', () => {
  test('declares only the exact verified runtime and required assets', async () => {
    const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, any>;
    expect(manifest.id).toBe(RESOLVER_MODULE_ID);
    expect(manifest.compatibility).toEqual({ minimum: '14.364', verified: '14.364', maximum: '14.364' });
    expect(manifest.esmodules).toEqual(['scripts/index.js']);
    expect(manifest.styles).toEqual([{ src: 'styles/resolver.css' }]);
    expect(manifest.languages).toEqual([
      { lang: 'en', name: 'English', path: 'lang/en.json' },
      { lang: 'zh-CN', name: '简体中文', path: 'lang/zh-CN.json' },
    ]);
    expect(manifest.relationships).toEqual({
      systems: [{ id: 'dnd5e', type: 'system', compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' } }],
    });
    expect(manifest.socket).toBe(false);
    expect(manifest.scripts ?? []).toEqual([]);
    expect(JSON.stringify(manifest).toLowerCase()).not.toMatch(/midi|dae|times.?up|item.?macro|socketlib|macro/);
  });

  test('English and Chinese full-document drift copy requires Rebuild Index before retry', async () => {
    const [en, zh] = await Promise.all([
      readFile(resolve(moduleRoot, 'lang/en.json'), 'utf8').then((value) => JSON.parse(value) as Record<string, string>),
      readFile(resolve(moduleRoot, 'lang/zh-CN.json'), 'utf8').then((value) => JSON.parse(value) as Record<string, string>),
    ]);
    expect(en['FVTTJSONSPELL.Review.RebuildIndex']).toMatch(/rebuild.+index.+retry/i);
    expect(en['FVTTJSONSPELL.Finding.INVALID_SELECTED_SPELL_DOCUMENT']).toMatch(/rebuild.+index.+retry/i);
    expect(en['FVTTJSONSPELL.Finding.INVALID_SELECTED_SPELL_DOCUMENT']).not.toMatch(/select it again/i);
    expect(zh['FVTTJSONSPELL.Review.RebuildIndex']).toMatch(/重建.+索引.+重试/);
    expect(zh['FVTTJSONSPELL.Finding.INVALID_SELECTED_SPELL_DOCUMENT']).toMatch(/重建.+索引.+重试/);
    expect(zh['FVTTJSONSPELL.Finding.INVALID_SELECTED_SPELL_DOCUMENT']).not.toMatch(/重新选择/);
  });

  test('registers stable settings and exact lifecycle hooks', async () => {
    const adapter = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' });
    registerResolverSettings(adapter);
    expect(adapter.settings).toEqual(RESOLVER_SETTING_DEFINITIONS);
    expect(adapter.settings.map((setting) => [setting.key, setting.scope, setting.config, setting.type, setting.default])).toEqual([
      ['sourcePriority', 'world', false, Array, [{ packageId: 'dnd-players-handbook' }, { packageId: 'dnd5e', packId: 'spells24' }]],
      ['savedMappings', 'world', false, Object, {}],
      ['debugLogging', 'client', true, Boolean, false],
      ['indexMetadata', 'world', false, Object, {}],
    ]);
    expect(adapter.settings.filter((setting) => setting.type === Array || setting.type === Object)
      .every((setting) => setting.config === false)).toBe(true);
    expect(adapter.settings.find((setting) => setting.key === 'debugLogging')).toMatchObject({
      config: true,
      type: Boolean,
    });

    registerResolverLifecycle(adapter);
    expect([...adapter.hooks.keys()]).toEqual(['init', 'ready']);
    await adapter.hooks.get('init')!();
    expect(adapter.settings).toHaveLength(8);
    expect(adapter.menus).toHaveLength(2);
    expect(adapter.menus[1]).toMatchObject({ key: 'resolverSettings', restricted: true });
    await adapter.hooks.get('ready')!();
    expect(adapter.api?.compatibility.supported).toBe(true);
    expect(adapter.api?.canMutate).toBe(true);
    expect(adapter.indexCalls).toBe(1);
  });

  test('GM settings submenu preserves ordered package/pack structure, exposes counts, debug, and rebuild', () => {
    const sourceIndex = {
      sourcePackages: [{ packageId: 'dnd5e', version: '5.3.3' }, { packageId: 'extra-spells', version: '1.2.0' }, { packageId: 'zero-spells', version: '1.0.0' }],
      sourcePacks: [
        { collection: 'dnd5e.spells24', packageId: 'dnd5e', packageVersion: '5.3.3', packId: 'spells24' },
        { collection: 'extra-spells.spells', packageId: 'extra-spells', packageVersion: '1.2.0', packId: 'spells' },
        { collection: 'zero-spells.empty', packageId: 'zero-spells', packageVersion: '1.0.0', packId: 'empty' },
      ],
      candidates: [
        { packageId: 'dnd5e', packId: 'spells24', rules: '2024' },
        { packageId: 'dnd5e', packId: 'spells24', rules: '2014' },
        { packageId: 'extra-spells', packId: 'spells', rules: undefined },
      ],
      diagnostics: [], candidateMetadataHash: 'a'.repeat(64), sourceInventoryHash: 'b'.repeat(64),
    } as any;
    expect(buildResolverSettingsContext({
      sourcePriority: [{ packageId: 'extra-spells', packId: 'spells' }, { packageId: 'dnd5e' }],
      debugLogging: true,
      runtime: { compatibility: { supported: true }, canMutate: true, sourceIndex, rebuildSourceIndex: async () => sourceIndex } as any,
    })).toMatchObject({
      priority: [
        { index: 0, packageId: 'extra-spells', packId: 'spells' },
        { index: 1, packageId: 'dnd5e', packId: '' },
      ],
      packages: [
        { packageId: 'dnd5e', version: '5.3.3', spellCount: 2, rules2024Count: 1, rules2014Count: 1, unknownRulesCount: 0 },
        { packageId: 'extra-spells', version: '1.2.0', spellCount: 1, rules2024Count: 0, rules2014Count: 0, unknownRulesCount: 1 },
        { packageId: 'zero-spells', version: '1.0.0', spellCount: 0, rules2024Count: 0, rules2014Count: 0, unknownRulesCount: 0 },
      ],
      packs: [
        { collection: 'dnd5e.spells24', packageId: 'dnd5e', packageVersion: '5.3.3', packId: 'spells24', spellCount: 2, rules2024Count: 1, rules2014Count: 1, unknownRulesCount: 0 },
        { collection: 'extra-spells.spells', packageId: 'extra-spells', packageVersion: '1.2.0', packId: 'spells', spellCount: 1, rules2024Count: 0, rules2014Count: 0, unknownRulesCount: 1 },
        { collection: 'zero-spells.empty', packageId: 'zero-spells', packageVersion: '1.0.0', packId: 'empty', spellCount: 0, rules2024Count: 0, rules2014Count: 0, unknownRulesCount: 0 },
      ],
      debugLogging: true,
      canRebuild: true,
    });
    expect(parseResolverSettingsForm({
      'priority.0.packageId': ' extra-spells ', 'priority.0.packId': ' spells ',
      'priority.1.packageId': 'dnd5e', 'priority.1.packId': '', debugLogging: 'on',
    })).toEqual({
      sourcePriority: [{ packageId: 'extra-spells', packId: 'spells' }, { packageId: 'dnd5e' }],
      debugLogging: true,
    });
    expect(() => parseResolverSettingsForm({ 'priority.0.packageId': '', 'priority.0.packId': 'spells' }))
      .toThrow(/package/i);
  });

  test('manual rebuild fails closed atomically, remains retryable, and a later success restores mutation', async () => {
    const adapter = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' });
    registerResolverLifecycle(adapter);
    await adapter.hooks.get('ready')!();
    const oldIndex = adapter.api.sourceIndex;
    expect(adapter.api.canMutate).toBe(true);

    adapter.throwList = true;
    await expect(adapter.api.rebuildSourceIndex()).rejects.toThrow(/list failed/i);
    expect({ canMutate: adapter.api.canMutate, sourceIndex: adapter.api.sourceIndex, diagnostics: adapter.api.diagnostics })
      .toEqual({ canMutate: false, sourceIndex: oldIndex, diagnostics: [expect.objectContaining({ code: 'SOURCE_INDEX_FAILED' })] });
    expect(typeof adapter.api.rebuildSourceIndex).toBe('function');
    expect(buildResolverSettingsContext({ sourcePriority: [], debugLogging: false, runtime: adapter.api }))
      .toMatchObject({
        rebuildFailed: true, canRebuild: true,
        sourceDiagnostics: [{ code: 'SOURCE_INDEX_FAILED', pack: '', path: '', blocking: true }],
      });

    const notifications: any[] = [];
    const failed = await rebuildResolverIndexFromSettings(
      adapter.api,
      (level, message) => notifications.push([level, message]),
      (key) => `localized:${key}`,
    );
    expect(failed).toBe(false);
    expect(notifications.at(-1)).toEqual(['error', 'localized:FVTTJSONSPELL.Settings.RebuildFailed']);

    adapter.throwList = false;
    const recovered = await rebuildResolverIndexFromSettings(
      adapter.api,
      (level, message) => notifications.push([level, message]),
      (key) => `localized:${key}`,
    );
    expect(recovered).toBe(true);
    expect(adapter.api.canMutate).toBe(true);
    expect(adapter.api.diagnostics).toEqual([]);
    expect(notifications.at(-1)).toEqual(['info', 'localized:FVTTJSONSPELL.Settings.RebuildComplete']);
  });

  test('debug logging uses the adapter seam and emits only safe index summaries when enabled', async () => {
    const quiet = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' });
    registerResolverLifecycle(quiet);
    await quiet.hooks.get('ready')!();
    expect(quiet.debugCalls).toEqual([]);
    quiet.throwList = true;
    await expect(quiet.api.rebuildSourceIndex()).rejects.toThrow(/list failed/i);
    expect(quiet.debugCalls).toEqual([]);

    const verbose = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' }, true);
    verbose.debugLogging = true;
    registerResolverLifecycle(verbose);
    await verbose.hooks.get('ready')!();
    expect(verbose.debugCalls).toHaveLength(1);
    expect(verbose.debugCalls[0]).toMatchObject({
      event: 'source-index-rebuilt',
      details: {
        candidateCount: 0, sourcePackageCount: 1, sourcePackCount: 1,
        diagnostics: [{ code: 'PACK_INDEX_FAILED', pack: 'broken.spells', path: '/', blocking: true }],
      },
    });
    expect(JSON.stringify(verbose.debugCalls)).not.toContain('index unavailable');

    verbose.throwList = true;
    await expect(verbose.api.rebuildSourceIndex()).rejects.toThrow(/list failed/i);
    expect(verbose.debugCalls.at(-1)).toMatchObject({
      event: 'source-index-rebuild-failed',
      details: { diagnostics: [{ code: 'SOURCE_INDEX_FAILED', pack: '', path: '', blocking: true }] },
    });
    expect(JSON.stringify(verbose.debugCalls)).not.toContain('list failed');
  });

  test('a metadata persistence failure also disables mutation until retry succeeds', async () => {
    const adapter = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' });
    registerResolverLifecycle(adapter);
    await adapter.hooks.get('ready')!();
    const oldIndex = adapter.api.sourceIndex;
    adapter.throwPersist = true;
    await expect(adapter.api.rebuildSourceIndex()).rejects.toThrow(/persist failed/i);
    expect(adapter.api.canMutate).toBe(false);
    expect(adapter.api.sourceIndex).toBe(oldIndex);
    expect(adapter.api.diagnostics).toMatchObject([{ code: 'SOURCE_INDEX_FAILED' }]);
    adapter.throwPersist = false;
    await adapter.api.rebuildSourceIndex();
    expect(adapter.api.canMutate).toBe(true);
  });

  test('a partial index with blocking diagnostics is reported as blocked, never complete', async () => {
    const notifications: any[] = [];
    const partial = {
      candidates: [], sourcePackages: [], sourcePacks: [], candidateMetadataHash: 'a'.repeat(64), sourceInventoryHash: 'b'.repeat(64),
      diagnostics: [{ code: 'PACK_INDEX_FAILED', pack: 'broken.spells', path: '/', message: 'failed', blocking: true }],
    } as any;
    const result = await rebuildResolverIndexFromSettings(
      { compatibility: { supported: true }, canMutate: false, diagnostics: partial.diagnostics, sourceIndex: partial, rebuildSourceIndex: async () => partial } as any,
      (level, message) => notifications.push([level, message]),
      (key) => `localized:${key}`,
    );
    expect(result).toBe(false);
    expect(notifications).toEqual([['error', 'localized:FVTTJSONSPELL.Settings.RebuildBlocked']]);
    expect(notifications.flat()).not.toContain('localized:FVTTJSONSPELL.Settings.RebuildComplete');
    expect(buildResolverSettingsContext({
      sourcePriority: [], debugLogging: false,
      runtime: { compatibility: { supported: true }, canMutate: false, diagnostics: partial.diagnostics, sourceIndex: partial, rebuildSourceIndex: async () => partial } as any,
    })).toMatchObject({ rebuildBlocked: true, canRebuild: true });
  });

  test('registers the restricted submenu with a real public ApplicationV2 subclass', () => {
    class ApplicationV2 {}
    const menus: any[] = [];
    const restoreFoundry = installGlobal('foundry', {
      applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (Base: any) => class extends Base {} } },
    });
    const restoreGame = installGlobal('game', {
      settings: { registerMenu: (...args: any[]) => menus.push(args) },
    });
    try {
      createFoundryAdapter().registerSettingsMenu({
        key: 'resolverSettings', name: 'name', label: 'label', hint: 'hint', icon: 'icon', restricted: true,
      });
      expect(menus).toHaveLength(1);
      expect(menus[0]!.slice(0, 2)).toEqual([RESOLVER_MODULE_ID, 'resolverSettings']);
      expect(menus[0]![2]).toMatchObject({ restricted: true });
      expect(menus[0]![2].type.prototype).toBeInstanceOf(ApplicationV2);
    } finally {
      restoreGame();
      restoreFoundry();
    }
  });

  test.each([
    [{ foundry: '14.363', dnd5e: '5.3.3' }, 'UNSUPPORTED_FOUNDRY_VERSION'],
    [{ foundry: '14.365', dnd5e: '5.3.3' }, 'UNSUPPORTED_FOUNDRY_VERSION'],
    [{ foundry: '14.364', dnd5e: '5.3.2' }, 'UNSUPPORTED_DND5E_VERSION'],
    [{ foundry: '14.364', dnd5e: '5.4.0' }, 'UNSUPPORTED_DND5E_VERSION'],
    [{ foundry: '', dnd5e: '5.3.3' }, 'MISSING_RUNTIME_VERSION'],
    [{ foundry: '14.364', dnd5e: '' }, 'MISSING_RUNTIME_VERSION'],
  ] as const)('fails closed for runtime %j', async (versions, code) => {
    expect(evaluateRuntimeCompatibility(versions)).toMatchObject({ supported: false, diagnostics: [{ code }] });
    const adapter = new FakeRuntimeAdapter(versions);
    registerResolverLifecycle(adapter);
    await adapter.hooks.get('ready')!();
    expect(adapter.api?.canMutate).toBe(false);
    expect(adapter.indexCalls).toBe(0);
  });

  test('exposes a partial diagnostic index but prohibits mutation when an eligible pack fails', async () => {
    const adapter = new FakeRuntimeAdapter({ foundry: '14.364', dnd5e: '5.3.3' }, true);
    registerResolverLifecycle(adapter);
    await adapter.hooks.get('ready')!();
    expect(adapter.api?.sourceIndex?.candidates).toEqual([]);
    expect(adapter.api?.diagnostics).toMatchObject([{ code: 'PACK_INDEX_FAILED', blocking: true }]);
    expect(adapter.api?.canMutate).toBe(false);
  });

  test('adapts the exact v14 pack, index, version, and document APIs without leaking them into core', async () => {
    const indexCalls: string[][] = [];
    const fullDocumentCalls: string[] = [];
    const runtimePacks = [
      runtimePack('dnd5e.spells24', 'system', 'dnd5e', 'spells24', true, indexCalls),
      runtimePack('options.spells', 'module', 'options', 'spells', true, indexCalls),
      runtimePack('disabled.spells', 'module', 'disabled', 'spells', true, indexCalls),
      runtimePack('dnd5e.rules', 'system', 'dnd5e', 'rules', true, indexCalls, 'JournalEntry'),
    ];
    const packCollection = Object.assign(runtimePacks, {
      get: (id: string) => runtimePacks.find((pack) => pack.collection === id),
    });
    const restoreGame = installGlobal('game', {
      version: '14.364',
      system: { id: 'dnd5e', version: '5.3.3' },
      world: { id: 'world-id', version: '1.0.0' },
      user: { isGM: true },
      packs: packCollection,
      modules: { get: (id: string) => ({ active: id === 'options', version: id === 'options' ? '1.4.0' : '1.0.0' }) },
    });
    const restoreFoundry = installGlobal('foundry', {
      utils: { fromUuid: async (uuid: string) => { fullDocumentCalls.push(uuid); return { uuid }; } },
    });
    try {
      const adapter = createFoundryAdapter();
      expect(adapter.getRuntimeVersions()).toEqual({ foundry: '14.364', dnd5e: '5.3.3' });
      const refs = await adapter.listEnabledReadableItemPacks();
      expect(refs.map((ref) => [ref.collection, ref.packageVersion, ref.enabled])).toEqual([
        ['dnd5e.spells24', '5.3.3', true],
        ['options.spells', '1.4.0', true],
        ['disabled.spells', '1.0.0', false],
      ]);
      await adapter.getItemIndex(refs[0]!, [...ITEM_INDEX_FIELDS]);
      expect(indexCalls).toEqual([[...ITEM_INDEX_FIELDS]]);
      await adapter.getItemDocument('Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa');
      expect(fullDocumentCalls).toEqual(['Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa']);
    } finally {
      restoreFoundry();
      restoreGame();
    }
  });

  test('builds byte-identical installable ZIPs without browser-incompatible or local material', async () => {
    const first = await buildSpellResolverPackage();
    const firstBytes = await readFile(first.zipPath);
    const second = await buildSpellResolverPackage();
    const secondBytes = await readFile(second.zipPath);
    const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

    expect(sha(secondBytes)).toBe(sha(firstBytes));
    expect(second.archiveEntries).toEqual([
      'lang/en.json',
      'lang/zh-CN.json',
      'module.json',
      'scripts/index.js',
      'styles/resolver.css',
      'templates/report.hbs',
      'templates/review.hbs',
      'templates/settings.hbs',
    ]);
    expect(await readFile(resolve(second.outputDir, 'templates/review.hbs'), 'utf8')).toContain('{{{content}}}');
    expect(await readFile(resolve(second.outputDir, 'templates/report.hbs'), 'utf8')).toContain('{{{content}}}');
    expect(await readFile(resolve(second.outputDir, 'templates/settings.hbs'), 'utf8')).toContain('data-action="rebuildIndex"');
    expect(await readFile(resolve(second.outputDir, 'styles/resolver.css'), 'utf8'))
      .toMatch(/status-icon--hydrated[\s\S]*color:\s*var\(--color-level-success/);
    expect(second.archiveEntries[0]).not.toContain(RESOLVER_MODULE_ID);
    const bundle = await readFile(resolve(second.outputDir, 'scripts/index.js'), 'utf8');
    expect(bundle).not.toMatch(/node:crypto|sourceMappingURL|I:\\|\.local[\\/]|rat-warlock|OPENAI_API_KEY/i);
    expect(firstBytes.includes(Buffer.from('module.json'))).toBe(true);
    expect(await readFile(resolve(moduleRoot, '../../..', '.gitignore'), 'utf8')).toMatch(/^dist$/m);
  }, 20_000);
});

class FakeRuntimeAdapter implements ResolverFoundryAdapter {
  readonly settings: any[] = [];
  readonly menus: any[] = [];
  readonly hooks = new Map<'init' | 'ready', () => void | Promise<void>>();
  indexCalls = 0;
  api: any;
  throwList = false;
  throwPersist = false;
  debugLogging = false;
  readonly debugCalls: Array<{ event: string; details: unknown }> = [];

  constructor(
    private readonly versions: { foundry: string; dnd5e: string },
    private readonly failPack = false,
  ) {}

  getRuntimeVersions() { return this.versions; }
  async listEnabledReadableItemPacks() {
    if (this.throwList) throw new Error('list failed');
    this.indexCalls++;
    return this.failPack ? [{
      collection: 'broken.spells', packageId: 'broken', packageVersion: '1.0.0', packId: 'spells',
      documentName: 'Item', enabled: true, readable: true,
    }] : [];
  }
  async getItemIndex() { if (this.failPack) throw new Error('index unavailable'); return []; }
  async getItemDocument() { return null; }
  registerSetting(definition: any) { this.settings.push(definition); }
  registerSettingsMenu(definition: any) { this.menus.push(definition); }
  getSetting(key: any) { return key === 'debugLogging' ? this.debugLogging : {}; }
  async setSetting() { if (this.throwPersist) throw new Error('persist failed'); }
  canPersistWorldSettings() { return true; }
  once(hook: 'init' | 'ready', callback: () => void | Promise<void>) { this.hooks.set(hook, callback); }
  exposeApi(api: unknown) { this.api = api; }
  logDebug(event: string, details: unknown) { this.debugCalls.push({ event, details }); }
}

function runtimePack(
  collection: string,
  packageType: 'system' | 'module' | 'world',
  packageName: string,
  name: string,
  visible: boolean,
  calls: string[][],
  documentName = 'Item',
) {
  return {
    collection,
    documentName,
    visible,
    metadata: { name, packageType, packageName, type: documentName, flags: {} },
    async getIndex({ fields }: { fields: string[] }) { calls.push(fields); return { contents: [] }; },
  };
}

function installGlobal(name: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

expect(EXACT_FOUNDRY_VERSION).toBe('14.364');
expect(EXACT_DND5E_VERSION).toBe('5.3.3');

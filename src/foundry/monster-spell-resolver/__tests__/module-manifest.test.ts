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
    await adapter.hooks.get('ready')!();
    expect(adapter.api?.compatibility.supported).toBe(true);
    expect(adapter.api?.canMutate).toBe(true);
    expect(adapter.indexCalls).toBe(1);
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
    ]);
    expect(second.archiveEntries[0]).not.toContain(RESOLVER_MODULE_ID);
    const bundle = await readFile(resolve(second.outputDir, 'scripts/index.js'), 'utf8');
    expect(bundle).not.toMatch(/node:crypto|sourceMappingURL|I:\\|\.local[\\/]|rat-warlock|OPENAI_API_KEY/i);
    expect(firstBytes.includes(Buffer.from('module.json'))).toBe(true);
    expect(await readFile(resolve(moduleRoot, '../../..', '.gitignore'), 'utf8')).toMatch(/^dist$/m);
  });
});

class FakeRuntimeAdapter implements ResolverFoundryAdapter {
  readonly settings: any[] = [];
  readonly hooks = new Map<'init' | 'ready', () => void | Promise<void>>();
  indexCalls = 0;
  api: any;

  constructor(
    private readonly versions: { foundry: string; dnd5e: string },
    private readonly failPack = false,
  ) {}

  getRuntimeVersions() { return this.versions; }
  async listEnabledReadableItemPacks() {
    this.indexCalls++;
    return this.failPack ? [{
      collection: 'broken.spells', packageId: 'broken', packageVersion: '1.0.0', packId: 'spells',
      documentName: 'Item', enabled: true, readable: true,
    }] : [];
  }
  async getItemIndex() { if (this.failPack) throw new Error('index unavailable'); return []; }
  async getItemDocument() { return null; }
  registerSetting(definition: any) { this.settings.push(definition); }
  getSetting() { return {}; }
  async setSetting() {}
  canPersistWorldSettings() { return true; }
  once(hook: 'init' | 'ready', callback: () => void | Promise<void>) { this.hooks.set(hook, callback); }
  exposeApi(api: unknown) { this.api = api; }
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

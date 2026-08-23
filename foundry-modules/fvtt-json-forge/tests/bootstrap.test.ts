import { describe, expect, test } from 'bun:test';
import { initializeForgeModule } from '../src/index';
import { clearApiKey, readClientSettings, saveClientSettings } from '../src/settings';

describe('FVTT JSON Forge bootstrap and client settings', () => {
  test('registers a restricted real ApplicationV2 subclass and a GM-only API', () => {
    class ApplicationV2 {}
    const hooks = new Map<string, () => void>();
    const menus: Array<Record<string, unknown>> = [];
    const module = { api: undefined as unknown };
    const environment = {
      Hooks: { once: (name: string, callback: () => void) => hooks.set(name, callback) },
      foundry: {
        applications: {
          api: {
            ApplicationV2,
            HandlebarsApplicationMixin: (Base: any) => class extends Base {},
          },
        },
      },
      game: {
        version: '14.364',
        system: { id: 'dnd5e', version: '5.3.3' },
        user: { isGM: true },
        modules: { get: (id: string) => id === 'fvtt-json-forge' ? module : undefined },
        settings: { registerMenu: (_id: string, _key: string, definition: Record<string, unknown>) => menus.push(definition) },
      },
      ui: { notifications: { warn: () => undefined } },
      console: { error: () => undefined },
    };

    initializeForgeModule(environment);
    hooks.get('init')?.();
    hooks.get('ready')?.();

    expect(menus).toHaveLength(1);
    expect(menus[0]?.restricted).toBe(true);
    expect((menus[0]?.type as any).prototype).toBeInstanceOf(ApplicationV2);
    expect(module.api).toBeDefined();
  });

  test('keeps AI credentials in client storage only and clears them explicitly', () => {
    const values = new Map<string, string>();
    const storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as Storage;

    const saved = saveClientSettings({ endpoint: 'https://example.test/v1', model: 'extractor', reviewModel: 'reviewer', apiKey: 'secret-key', persistApiKey: true }, storage);
    expect(saved.apiKey).toBe('secret-key');
    expect(saved.persistApiKey).toBe(true);
    expect(readClientSettings(storage).apiKey).toBe('secret-key');
    expect(JSON.parse(values.get('fvtt-json-forge.client-settings')!).apiKey).toBe('secret-key');

    expect(clearApiKey(storage).apiKey).toBe('');
    expect(clearApiKey(storage).persistApiKey).toBe(false);
    expect(readClientSettings(storage).apiKey).toBe('');
    expect(readClientSettings(undefined)).toMatchObject({ endpoint: '', model: '', reviewModel: '', apiKey: '', persistApiKey: false });
  });

  test('does not persist an API Key unless the user opts in, and fails closed for legacy records', () => {
    const values = new Map<string, string>();
    const storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as Storage;

    const transient = saveClientSettings({ endpoint: 'https://example.test/v1', model: 'extractor', apiKey: 'transient-key' }, storage);
    expect(transient.apiKey).toBe('transient-key');
    expect(transient.persistApiKey).toBe(false);
    expect(JSON.parse(values.get('fvtt-json-forge.client-settings')!).apiKey).toBe('');
    expect(readClientSettings(storage).apiKey).toBe('');

    values.set('fvtt-json-forge.client-settings', JSON.stringify({ endpoint: 'https://example.test/v1', model: 'extractor', apiKey: 'legacy-key' }));
    expect(readClientSettings(storage)).toMatchObject({ apiKey: '', persistApiKey: false });
  });

  test('retries menu registration at ready when ApplicationV2 was unavailable during init', () => {
    class ApplicationV2 {}
    const callbacks = new Map<string, Array<() => void>>();
    const menus: Array<Record<string, unknown>> = [];
    const module = { api: undefined as unknown };
    const environment: any = {
      Hooks: { once: (name: string, callback: () => void) => callbacks.set(name, [...(callbacks.get(name) ?? []), callback]) },
      foundry: {},
      game: {
        version: '14.364',
        system: { id: 'dnd5e', version: '5.3.3' },
        user: { isGM: true },
        modules: { get: (id: string) => id === 'fvtt-json-forge' ? module : undefined },
        settings: { registerMenu: (_id: string, _key: string, definition: Record<string, unknown>) => menus.push(definition) },
      },
      ui: { notifications: { warn: () => undefined } },
      console: { error: () => undefined },
    };

    initializeForgeModule(environment);
    callbacks.get('init')?.forEach((callback) => callback());
    environment.foundry.applications = {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      },
    };
    callbacks.get('ready')?.forEach((callback) => callback());

    expect(menus).toHaveLength(1);
    expect(module.api).toBeDefined();
  });
});

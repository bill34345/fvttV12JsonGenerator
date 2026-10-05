import { afterEach, describe, expect, test } from 'bun:test';
import {
  clientSettingsProfileId,
  clearAllForgeSessionApiKeys,
  isForgeSessionConnectionReady,
  markForgeSessionConnectionTested,
  readForgeSessionSettings,
  saveForgeSessionSettings,
  subscribeForgeSessionSettings,
} from '../src/settings';

describe('Forge page connection session', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
  });

  test('keeps an unpersisted key available to the page while omitting it from storage and refresh state', () => {
    const storage = makeStorage();
    installStorage(storage);

    const saved = saveForgeSessionSettings({
      providerId: 'custom', endpoint: 'https://provider.example/v1', protocol: 'openai-chat',
      model: 'extractor', apiKey: 'page-only-key', persistApiKey: false,
    });
    expect(saved.apiKey).toBe('page-only-key');
    expect(readForgeSessionSettings().apiKey).toBe('page-only-key');
    expect(JSON.parse(storage.getItem('fvtt-json-forge.client-settings')!).apiKey).toBe('');

    // A new browser-page session reads storage again and cannot recover the
    // transient key. The storage object swap models a page refresh without
    // touching the user's saved profile data.
    installStorage(undefined as any);
    expect(readForgeSessionSettings().apiKey).toBe('');
  });

  test('loads only the matching saved profile key after a provider change', () => {
    const storage = makeStorage();
    installStorage(storage);
    const openAi = { providerId: 'openai' as const, endpoint: 'https://api.openai.com/v1', protocol: 'openai-responses' as const, region: '' };
    const deepSeek = { providerId: 'deepseek' as const, endpoint: 'https://api.deepseek.com', protocol: 'openai-responses' as const, region: '' };

    saveForgeSessionSettings({ ...openAi, model: 'gpt-4.1-mini', apiKey: 'openai-key', persistApiKey: true });
    saveForgeSessionSettings({ ...deepSeek, model: 'deepseek-flash', apiKey: 'deepseek-key', persistApiKey: true });
    expect(readForgeSessionSettings().apiKey).toBe('deepseek-key');

    const returned = saveForgeSessionSettings({ ...openAi, model: 'gpt-4.1-mini' });
    expect(returned.apiKey).toBe('openai-key');
    expect(returned.apiKey).not.toBe('deepseek-key');
    const stored = JSON.parse(storage.getItem('fvtt-json-forge.client-settings')!);
    expect(stored.savedApiKeys[clientSettingsProfileId(openAi)]).toBe('openai-key');
    expect(stored.savedApiKeys[clientSettingsProfileId(deepSeek)]).toBe('deepseek-key');
  });

  test('binds readiness to the exact current connection and notifies subscribers', () => {
    const storage = makeStorage();
    installStorage(storage);
    const events: number[] = [];
    const unsubscribe = subscribeForgeSessionSettings(() => events.push(1));
    saveForgeSessionSettings({ providerId: 'custom', endpoint: 'https://provider.example/v1', protocol: 'openai-chat', model: 'extractor', apiKey: 'key' });
    markForgeSessionConnectionTested();
    expect(isForgeSessionConnectionReady()).toBe(true);

    saveForgeSessionSettings({ model: 'new-extractor' });
    expect(isForgeSessionConnectionReady()).toBe(false);
    markForgeSessionConnectionTested();
    expect(isForgeSessionConnectionReady()).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(3);
    unsubscribe();
  });

  test('does not force a loopback session to DeepSeek when the saved choice is explicit', () => {
    const storage = makeStorage();
    storage.setItem('fvtt-json-forge.client-settings', JSON.stringify({
      providerId: 'custom', endpoint: 'https://gateway.example/v1', protocol: 'openai-chat',
      model: 'gateway-model', apiKey: 'saved-key', persistApiKey: true,
      savedApiKeys: { 'custom||https://gateway.example/v1|openai-chat': 'saved-key' },
    }));
    installStorage(storage);
    expect(readForgeSessionSettings()).toMatchObject({ providerId: 'custom', model: 'gateway-model', apiKey: 'saved-key' });
  });

  test('clears every saved profile key through the session facade', () => {
    const storage = makeStorage();
    installStorage(storage);
    saveForgeSessionSettings({ providerId: 'openai', endpoint: 'https://api.openai.com/v1', protocol: 'openai-responses', model: 'gpt-4.1-mini', apiKey: 'openai-key', persistApiKey: true });
    saveForgeSessionSettings({ providerId: 'deepseek', endpoint: 'https://api.deepseek.com', protocol: 'openai-responses', model: 'deepseek-flash', apiKey: 'deepseek-key', persistApiKey: true });
    expect(Object.keys(readForgeSessionSettings().savedApiKeys)).toHaveLength(2);
    const cleared = clearAllForgeSessionApiKeys();
    expect(cleared.apiKey).toBe('');
    expect(cleared.savedApiKeys).toEqual({});
    expect(JSON.parse(storage.getItem('fvtt-json-forge.client-settings')!).savedApiKeys).toEqual({});
  });
});

function installStorage(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
}

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
}

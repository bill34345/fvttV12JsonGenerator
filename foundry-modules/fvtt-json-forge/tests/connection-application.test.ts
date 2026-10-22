import { afterEach, describe, expect, test } from 'bun:test';
import {
  createForgeConnectionApplicationClass,
  type ForgeConnectionApplicationServices,
} from '../src/connectionApplication';
import {
  isForgeSessionConnectionReady,
  markForgeSessionConnectionTested,
  readForgeSessionSettings,
  saveForgeSessionSettings,
} from '../src/settings';

describe('Forge Connection ApplicationV2', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
  });

  test('tests a draft, then marks the exact saved configuration ready', async () => {
    installStorage(makeStorage());
    let calls = 0;
    const { application, root, notifications } = makeApplication({
      testForgeProviderConnection: async (input) => {
        calls += 1;
        return {
          status: 'connected', providerId: input.providerId ?? 'custom', protocol: input.protocol ?? 'openai-chat',
          model: input.model ?? '', models: ['extractor'], capabilities: {} as any,
          message: 'connection ok',
        };
      },
    });
    fillDraft(root);

    await (application as any).testConnection(root);
    expect(calls).toBe(1);
    expect(isForgeSessionConnectionReady()).toBe(false);
    expect(root.status.textContent).toMatch(/保存/u);

    root.save.onclick?.();
    expect(readForgeSessionSettings().apiKey).toBe('draft-key');
    expect(isForgeSessionConnectionReady()).toBe(true);
    expect(notifications.infos).toContain('Forge AI 连接配置已保存。');
  });

  test('shows correction off by default and saves an explicit opt-in without requesting a model', () => {
    installStorage(makeStorage());
    let calls = 0;
    const { application, root } = makeApplication({ testForgeProviderConnection: async () => {
      calls += 1;
      throw new Error('Saving a preference must not call the provider.');
    } });
    expect(root.autoCorrect.checked).toBe(false);
    fillDraft(root);
    root.autoCorrect.checked = true;
    root.autoCorrect.onchange?.();
    root.save.onclick?.();
    expect(calls).toBe(0);
    expect(readForgeSessionSettings().autoCorrect).toBe(true);
    application._onRender({}, {});
    expect(root.autoCorrect.checked).toBe(true);

    root.autoCorrect.checked = false;
    root.autoCorrect.onchange?.();
    root.save.onclick?.();
    expect(readForgeSessionSettings().autoCorrect).toBe(false);
    expect(calls).toBe(0);
  });

  test('does not reuse a draft connection proof after the correction preference changes', async () => {
    installStorage(makeStorage());
    const { application, root } = makeApplication({ testForgeProviderConnection: async input => ({
      status: 'connected', providerId: input.providerId ?? 'custom', protocol: input.protocol ?? 'openai-chat',
      model: input.model ?? '', models: [], capabilities: {} as any, message: 'ok',
    }) });
    fillDraft(root);
    await (application as any).testConnection(root);
    root.autoCorrect.checked = true;
    root.autoCorrect.onchange?.();
    root.save.onclick?.();
    expect(readForgeSessionSettings().autoCorrect).toBe(true);
    expect(isForgeSessionConnectionReady()).toBe(false);
  });

  test('does not keep a previous ready state after a failed retry', async () => {
    installStorage(makeStorage());
    saveForgeSessionSettings({ providerId: 'custom', endpoint: 'https://provider.example/v1', protocol: 'openai-chat', model: 'extractor', apiKey: 'key' });
    const { application, root } = makeApplication({
      testForgeProviderConnection: async () => ({
        status: 'authentication', providerId: 'custom', protocol: 'openai-chat', model: 'extractor', models: [], capabilities: {} as any, message: 'bad key',
      }),
    });
    root.apiKey.value = 'key';
    root.endpoint.value = 'https://provider.example/v1';
    root.provider.value = 'custom';
    root.protocol.value = 'openai-chat';
    root.model.value = 'extractor';

    // Seed a valid ready state, then verify a failed re-probe clears it.
    markForgeSessionConnectionTested();
    expect(isForgeSessionConnectionReady()).toBe(true);
    await (application as any).testConnection(root);
    expect(isForgeSessionConnectionReady()).toBe(false);
    expect(root.status.textContent).toContain('bad key');
  });

  test('enforces GM and exact Foundry runtime before testing', async () => {
    installStorage(makeStorage());
    let calls = 0;
    const services: Partial<ForgeConnectionApplicationServices> = {
      testForgeProviderConnection: async () => {
        calls += 1;
        return { status: 'connected', providerId: 'custom', protocol: 'openai-chat', model: 'extractor', models: [], capabilities: {} as any, message: 'ok' };
      },
    };
    const { application, root, game } = makeApplication(services);
    fillDraft(root);
    game.user.isGM = false;
    await (application as any).testConnection(root);
    expect(calls).toBe(0);
    expect(root.status.textContent).toMatch(/GM/u);

    game.user.isGM = true;
    game.version = '14.365';
    await (application as any).testConnection(root);
    expect(calls).toBe(0);
    expect(root.status.textContent).toMatch(/14\.364/u);
  });

  test('opens a provider endpoint override without retaining its old profile key', () => {
    installStorage(makeStorage());
    const { root } = makeApplication();
    root.provider.value = 'openai';
    root.endpoint.value = 'https://api.openai.com/v1';
    root.endpoint.dataset.forgeEndpointOverride = 'false';
    root.endpoint.readOnly = true;
    root.apiKey.value = 'old-profile-key';

    root.toggleEndpoint.onclick?.();
    expect(root.endpoint.dataset.forgeEndpointOverride).toBe('true');
    expect(root.endpoint.readOnly).toBe(false);
    expect(root.apiKey.value).toBe('');

    root.endpoint.value = 'https://gateway.example/v1';
    root.apiKey.value = 'gateway-key';
    root.toggleEndpoint.onclick?.();
    expect(root.endpoint.dataset.forgeEndpointOverride).toBe('false');
    expect(root.endpoint.readOnly).toBe(true);
    expect(root.endpoint.value).toBe('https://api.openai.com/v1');
    expect(root.apiKey.value).toBe('');
  });

  test('disables connection fields while testing and restores them when closed', async () => {
    installStorage(makeStorage());
    let release!: () => void;
    const started = new Promise<void>((resolve) => { release = resolve; });
    const { application, root } = makeApplication({
      testForgeProviderConnection: async () => {
        await started;
        return { status: 'connected', providerId: 'custom', protocol: 'openai-chat', model: 'extractor', models: [], capabilities: {} as any, message: 'ok' };
      },
    });
    fillDraft(root);
    const pending = (application as any).testConnection(root);
    await Promise.resolve();
    expect(root.model.disabled).toBe(true);
    expect(root.apiKey.disabled).toBe(true);
    expect(root.autoCorrect.disabled).toBe(true);
    await application.close();
    expect((application as any).testing).toBe(false);
    expect(root.model.disabled).toBe(false);
    expect(root.autoCorrect.disabled).toBe(false);
    release();
    await pending;
  });
});

function makeApplication(services: Partial<ForgeConnectionApplicationServices> = {}) {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: true } };
  const foundry = {
    applications: {
      api: {
        ApplicationV2: class { async close(): Promise<void> { return undefined; } },
        HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      },
    },
  };
  const Application = createForgeConnectionApplicationClass({
    game,
    foundry,
    services,
    ui: { notifications: {
      error: (message: string) => notifications.errors.push(message),
      info: (message: string) => notifications.infos.push(message),
    } },
  });
  const application: any = new Application();
  const root = new FakeRoot();
  application.element = root;
  application._onRender({}, {});
  return { application, root, game, notifications };
}

function fillDraft(root: FakeRoot): void {
  root.provider.value = 'custom';
  root.endpoint.value = 'https://provider.example/v1';
  root.protocol.value = 'openai-chat';
  root.authScheme.value = 'bearer';
  root.region.value = '';
  root.reasoning.value = 'auto';
  root.structuredOutput.value = 'prompt_fallback';
  root.model.value = 'extractor';
  root.reviewModel.value = '';
  root.apiKey.value = 'draft-key';
  root.persistApiKey.checked = false;
  root.useSeparateReviewModel.checked = false;
}

class FakeRoot {
  provider = control('openai', 'select'); endpoint = control('', 'url'); protocol = control('openai-responses', 'select'); authScheme = control('bearer', 'select'); region = control('', 'select'); reasoning = control('auto', 'select'); structuredOutput = control('json_schema', 'select');
  model = control(''); reviewModel = control(''); apiKey = control('', 'password'); persistApiKey = control('', 'checkbox'); useSeparateReviewModel = control('', 'checkbox'); autoCorrect = control('', 'checkbox');
  test = control(''); save = control(''); toggleKey = control(''); toggleEndpoint = control(''); clearKey = control(''); clearAllKeys = control('');
  summary = control(''); status = control(''); docs = control(''); reviewField = control(''); modelOptions = control('');

  querySelector(selector: string): any {
    return ({
      '[name="provider"]': this.provider, '[name="endpoint"]': this.endpoint, '[name="protocol"]': this.protocol, '[name="authScheme"]': this.authScheme,
      '[name="region"]': this.region, '[name="reasoning"]': this.reasoning, '[name="structuredOutput"]': this.structuredOutput,
      '[name="model"]': this.model, '[name="reviewModel"]': this.reviewModel, '[name="apiKey"]': this.apiKey,
      '[name="persistApiKey"]': this.persistApiKey, '[name="useSeparateReviewModel"]': this.useSeparateReviewModel,
      '[name="autoCorrect"]': this.autoCorrect,
      '[data-action="test-connection"]': this.test, '[data-action="save"]': this.save, '[data-action="toggle-key"]': this.toggleKey,
      '[data-action="toggle-endpoint"]': this.toggleEndpoint, '[data-action="clear-key"]': this.clearKey, '[data-action="clear-all-keys"]': this.clearAllKeys,
      '[data-connection-summary]': this.summary, '[data-connection-status]': this.status, '[data-provider-docs]': this.docs,
      '[data-review-model-field]': this.reviewField, '[data-model-options]': this.modelOptions,
    } as Record<string, any>)[selector] ?? null;
  }
}

function control(value: string, type = 'text'): any {
  return { value, type, tagName: type === 'select' ? 'SELECT' : 'INPUT', checked: false, disabled: false, hidden: false, readOnly: false, textContent: '', innerHTML: '', dataset: {}, onclick: undefined, onchange: undefined, oninput: undefined, setAttribute: () => undefined };
}

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

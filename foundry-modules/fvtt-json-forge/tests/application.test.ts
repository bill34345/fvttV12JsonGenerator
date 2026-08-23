import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import type { ForgeActorResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeActorApplicationClass, type ForgeApplicationServices } from '../src/application';
import { ForgeTemporaryActorCleanupError, type ForgeActorCreateResult } from '../src/runtime';

const NIGHTGAUNT_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');

describe('Forge Actor Application lifecycle', () => {
  test('does not let a stale generation repopulate the preview after source input changes', async () => {
    const accepted = await makeAcceptedResponse();
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<ForgeActorResponse>();
    const services: Partial<ForgeApplicationServices> = {
      convertFinalActorSource: async () => {
        firstStarted.resolve();
        return releaseFirst.promise;
      },
    };
    const { application, root } = makeApplication(services);

    const pending = (application as any).generate(root);
    await firstStarted.promise;
    root.source.value = 'new source';
    root.source.oninput?.();
    releaseFirst.resolve(accepted);
    await pending;

    expect((application as any).response).toBeUndefined();
    expect(root.preview.hidden).toBe(true);
    expect(root.create.disabled).toBe(true);
    expect(root.generate.disabled).toBe(false);
    expect(root.cancel.disabled).toBe(true);
  });

  test('renders AI stage transitions before the Intake promise completes', async () => {
    const emitted = deferred<void>();
    const release = deferred<any>();
    const services: Partial<ForgeApplicationServices> = {
      convertRawActorSourceWithAi: async (input) => {
        input.onStage?.({ stage: 'discover', status: 'running' });
        emitted.resolve();
        return release.promise;
      },
    };
    const { application, root } = makeApplication(services);
    root.mode.value = 'ai';
    root.endpoint.value = 'https://provider.example/v1';
    root.model.value = 'extractor';
    root.apiKey.value = 'transient-key';

    const pending = (application as any).generate(root);
    await emitted.promise;
    expect(root.stages.innerHTML).toContain('discover：running');
    release.resolve({ status: 'needs_review', findings: [], stages: [{ stage: 'discover', status: 'completed' }] });
    await pending;
  });

  test('enforces one generation job across separate Forge Application instances', async () => {
    const accepted = await makeAcceptedResponse();
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<ForgeActorResponse>();
    let calls = 0;
    const services: Partial<ForgeApplicationServices> = {
      convertFinalActorSource: async () => {
        calls += 1;
        firstStarted.resolve();
        return releaseFirst.promise;
      },
    };
    const first = makeApplication(services);
    const second = makeApplication(services);

    const pending = (first.application as any).generate(first.root);
    await firstStarted.promise;
    await (second.application as any).generate(second.root);

    expect(calls).toBe(1);
    expect(second.notifications.errors).toEqual([expect.stringMatching(/已有 Forge Actor 生成任务/u)]);
    (first.application as any).cancel();
    releaseFirst.resolve(accepted);
    await pending;
  });

  test('updates create availability when GM authority or the exact runtime changes', async () => {
    const accepted = await makeAcceptedResponse();
    const { application, root, game, hooks } = makeApplication();
    (application as any).response = accepted;
    (application as any).renderResult(root);
    expect(root.create.disabled).toBe(false);

    game.user.isGM = false;
    hooks.emit('updateUser');
    expect(root.create.disabled).toBe(true);

    game.user.isGM = true;
    hooks.emit('updateUser');
    expect(root.create.disabled).toBe(false);

    game.version = '14.365';
    hooks.emit('updateSetting');
    expect(root.create.disabled).toBe(true);
  });

  test('world submission is a short non-cancellable commit interval', async () => {
    const accepted = await makeAcceptedResponse();
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const services: Partial<ForgeApplicationServices> = {
      createAcceptedForgeActor: async (input): Promise<ForgeActorCreateResult> => {
        createStarted.resolve();
        await releaseCreate.promise;
        return {
          status: 'created',
          actor: {} as any,
          uuid: 'Actor.application-test',
          sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as any,
          artifactHash: 'a'.repeat(64) as any,
        };
      },
    };
    const { application, root } = makeApplication(services);
    (application as any).response = accepted;
    (application as any).renderResult(root);
    expect(root.create.disabled).toBe(false);

    const pending = (application as any).create();
    await createStarted.promise;
    expect(root.status.textContent).toBe('状态：正在提交并重新读取核对（不可取消）。');
    expect(root.generate.disabled).toBe(true);
    expect(root.create.disabled).toBe(true);
    expect(root.cancel.disabled).toBe(true);
    expect(root.source.disabled).toBe(true);
    expect(root.displayName.disabled).toBe(true);
    expect(root.mode.disabled).toBe(true);
    (application as any).cancel();
    releaseCreate.resolve();
    await pending;

    expect((application as any).creating).toBe(false);
    expect((application as any).response).toBe(accepted);
    expect(root.status.textContent).toBe('状态：accepted');
    expect(root.generate.disabled).toBe(false);
    expect(root.create.disabled).toBe(false);
    expect(root.cancel.disabled).toBe(true);
    expect(root.source.disabled).toBe(false);
    expect(root.displayName.disabled).toBe(false);
    expect(root.mode.disabled).toBe(false);
  });

  test('guards browser page teardown while a world creation is active', async () => {
    const accepted = await makeAcceptedResponse();
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const services: Partial<ForgeApplicationServices> = {
      createAcceptedForgeActor: async (): Promise<ForgeActorCreateResult> => {
        createStarted.resolve();
        await releaseCreate.promise;
        return {
          status: 'created',
          actor: {} as any,
          uuid: 'Actor.page-guard-test',
          sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as any,
          artifactHash: 'a'.repeat(64) as any,
        };
      },
    };
    const { application, root, browserWindow } = makeApplication(services);
    (application as any).response = accepted;
    (application as any).renderResult(root);

    const pending = (application as any).create();
    await createStarted.promise;
    const event = { prevented: false, returnValue: undefined as unknown, preventDefault() { this.prevented = true; } };
    browserWindow.emit('beforeunload', event);
    expect(event.prevented).toBe(true);
    expect(event.returnValue).toBe('');

    releaseCreate.resolve();
    await pending;
  });

  test('shows a cleanup failure after a world readback failure', async () => {
    const accepted = await makeAcceptedResponse();
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const services: Partial<ForgeApplicationServices> = {
      createAcceptedForgeActor: async () => {
        createStarted.resolve();
        await releaseCreate.promise;
        throw new ForgeTemporaryActorCleanupError('Actor.cleanup-failed', new Error('fake delete failed'));
      },
    };
    const { application, root, notifications } = makeApplication(services);
    (application as any).response = accepted;
    (application as any).renderResult(root);

    const pending = (application as any).create();
    await createStarted.promise;
    releaseCreate.resolve();
    await pending;

    expect(notifications.errors).toHaveLength(1);
    expect(notifications.errors[0]).toMatch(/Actor\.cleanup-failed.*may remain in the world/u);
    expect((application as any).response).toBe(accepted);
    expect(root.create.disabled).toBe(false);
  });

  test('does not persist an API Key when HTTPS validation rejects the endpoint', async () => {
    const storage = makeStorage();
    const originalStorage = (globalThis as any).localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      const { application, root } = makeApplication();
      root.mode.value = 'ai';
      root.endpoint.value = 'http://insecure.example/v1';
      root.model.value = 'extractor';
      root.apiKey.value = 'should-not-persist';
      root.persistApiKey.checked = true;
      await (application as any).generate(root);
      expect(storage.getItem('fvtt-json-forge.client-settings')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
    }
  });

  test('keeps AI needs-review output non-applyable at the status, button, and create action boundaries', async () => {
    const accepted = await makeAcceptedResponse();
    let createCalls = 0;
    const services: Partial<ForgeApplicationServices> = {
      createBrowserAiProvider: () => ({
        providerName: 'unused-application-provider',
        extractionModel: 'unused',
        reviewModel: 'unused',
        discover: async () => { throw new Error('Application test provider should not run discovery.'); },
        extract: async () => { throw new Error('Application test provider should not run extraction.'); },
        review: async () => { throw new Error('Application test provider should not run review.'); },
        repair: async () => { throw new Error('Application test provider should not run repair.'); },
      }),
      convertRawActorSourceWithAi: async () => ({
        status: 'needs_review',
        response: accepted,
        findings: [],
        stages: [],
      }),
      createAcceptedForgeActor: async (): Promise<ForgeActorCreateResult> => {
        createCalls += 1;
        throw new Error('AI needs-review output reached world creation.');
      },
    };
    const { application, root } = makeApplication(services);
    root.mode.value = 'ai';
    root.source.value = 'one raw Actor source';
    root.endpoint.value = 'https://provider.example/v1';
    root.model.value = 'extractor';
    root.apiKey.value = 'transient-test-key';

    await (application as any).generate(root);

    expect((application as any).intake?.status).toBe('needs_review');
    expect((application as any).response).toBe(accepted);
    expect(root.status.textContent).toBe('状态：needs_review');
    expect(root.create.disabled).toBe(true);
    await (application as any).create();
    expect(createCalls).toBe(0);
  });

  test('rejects an injected accepted AI intake that still contains a blocking finding', async () => {
    const accepted = await makeAcceptedResponse();
    let createCalls = 0;
    const services: Partial<ForgeApplicationServices> = {
      createBrowserAiProvider: () => ({}) as any,
      convertRawActorSourceWithAi: async () => ({
        status: 'accepted',
        response: accepted,
        findings: [{
          id: 'stale-blocker',
          code: 'SOURCE_HASH_MISMATCH',
          path: '/source/sha256',
          message: 'Injected blocking finding.',
          blocking: true,
          origin: 'evidence',
        }],
        stages: [],
      }),
      createAcceptedForgeActor: async (): Promise<ForgeActorCreateResult> => {
        createCalls += 1;
        throw new Error('Blocking AI finding reached world creation.');
      },
    };
    const { application, root } = makeApplication(services);
    root.mode.value = 'ai';
    root.source.value = 'one raw Actor source';
    root.endpoint.value = 'https://provider.example/v1';
    root.model.value = 'extractor';
    root.apiKey.value = 'transient-test-key';

    await (application as any).generate(root);

    expect((application as any).intake?.status).toBe('accepted');
    expect(root.create.disabled).toBe(true);
    await (application as any).create();
    expect(createCalls).toBe(0);
  });
});

async function makeAcceptedResponse(): Promise<ForgeActorResponse> {
  const response = await convertFinalActorSource(buildForgeActorRequest({
    content: NIGHTGAUNT_SOURCE,
    displayName: 'Application Test Actor',
    requestId: 'application-test',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  if (!('result' in response) || response.result.status !== 'accepted') {
    throw new Error(`Expected accepted response fixture: ${JSON.stringify(response)}`);
  }
  return response;
}

function makeApplication(services: Partial<ForgeApplicationServices> = {}): {
  application: any;
  root: FakeRoot;
  notifications: { errors: string[]; infos: string[] };
  game: any;
  hooks: FakeHooks;
  browserWindow: FakeEventTarget;
} {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    user: { isGM: true },
  };
  const hooks = new FakeHooks();
  const browserWindow = new FakeEventTarget();
  const environment = {
    game,
    hooks,
    window: browserWindow,
    foundry: {
      applications: {
        api: {
          ApplicationV2: class {
            async close(): Promise<void> { return undefined; }
          },
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
        },
      },
    },
    ui: {
      notifications: {
        error: (message: string) => notifications.errors.push(message),
        info: (message: string) => notifications.infos.push(message),
      },
    },
    services,
  };
  const Application = createForgeActorApplicationClass(environment);
  const application: any = new Application();
  const root = new FakeRoot();
  application.element = root;
  (globalThis as any).document = { activeElement: null };
  application._onRender({}, {});
  return { application, root, notifications, game, hooks, browserWindow };
}

class FakeHooks {
  private nextId = 0;
  private readonly callbacks = new Map<string, Map<number, (...args: any[]) => void>>();

  public on(event: string, callback: (...args: any[]) => void): number {
    const id = ++this.nextId;
    const entries = this.callbacks.get(event) ?? new Map<number, (...args: any[]) => void>();
    entries.set(id, callback);
    this.callbacks.set(event, entries);
    return id;
  }

  public off(event: string, id: unknown): void {
    if (typeof id === 'number') this.callbacks.get(event)?.delete(id);
  }

  public emit(event: string, ...args: any[]): void {
    for (const callback of this.callbacks.get(event)?.values() ?? []) callback(...args);
  }
}

class FakeEventTarget {
  private readonly callbacks = new Map<string, Set<(event: any) => void>>();

  public addEventListener(event: string, callback: (event: any) => void): void {
    const entries = this.callbacks.get(event) ?? new Set<(event: any) => void>();
    entries.add(callback);
    this.callbacks.set(event, entries);
  }

  public removeEventListener(event: string, callback: (event: any) => void): void {
    this.callbacks.get(event)?.delete(callback);
  }

  public emit(event: string, value: any): void {
    for (const callback of this.callbacks.get(event) ?? []) callback(value);
  }
}

class FakeRoot {
  readonly mode = control('structured', 'select');
  readonly aiSettings = control('');
  readonly source = control('old source', 'textarea');
  readonly displayName = control('Application Test Actor');
  readonly endpoint = control('');
  readonly model = control('');
  readonly reviewModel = control('');
  readonly apiKey = control('', 'password');
  readonly persistApiKey = control('', 'checkbox');
  readonly generate = control('');
  readonly cancel = control('');
  readonly clear = control('');
  readonly clearKey = control('');
  readonly create = control('');
  readonly status = control('');
  readonly stages = control('');
  readonly diagnostics = control('');
  readonly diagnosticList = control('');
  readonly preview = control('');
  readonly previewText = control('');
  readonly json = control('');
  readonly intakeEvidence = control('');
  readonly finalSource = control('');

  querySelector(selector: string): any {
    return ({
      '[name="mode"]': this.mode,
      '[data-ai-settings]': this.aiSettings,
      '[name="source"]': this.source,
      '[name="displayName"]': this.displayName,
      '[name="endpoint"]': this.endpoint,
      '[name="model"]': this.model,
      '[name="reviewModel"]': this.reviewModel,
      '[name="apiKey"]': this.apiKey,
      '[name="persistApiKey"]': this.persistApiKey,
      '[data-action="generate"]': this.generate,
      '[data-action="cancel"]': this.cancel,
      '[data-action="clear"]': this.clear,
      '[data-action="clear-key"]': this.clearKey,
      '[data-action="create"]': this.create,
      '[data-status]': this.status,
      '[data-stages]': this.stages,
      '[data-diagnostics]': this.diagnostics,
      '[data-diagnostic-list]': this.diagnosticList,
      '[data-preview]': this.preview,
      '[data-preview-text]': this.previewText,
      '[data-json]': this.json,
      '[data-intake-evidence]': this.intakeEvidence,
      '[data-final-source]': this.finalSource,
    } as Record<string, any>)[selector] ?? null;
  }
}

function control(value: string, type = 'button'): any {
  return { value, type, checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', onclick: undefined, onchange: undefined, oninput: undefined };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
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

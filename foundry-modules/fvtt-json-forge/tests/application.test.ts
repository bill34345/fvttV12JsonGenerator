import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import type { ForgeActorResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeActorApplicationClass, type ForgeApplicationServices } from '../src/application';
import { ForgeTemporaryActorCleanupError, type ForgeActorCreateResult } from '../src/runtime';
import { CLIENT_STORAGE_KEY, markForgeSessionConnectionTested, saveForgeSessionSettings } from '../src/settings';

const NIGHTGAUNT_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');

describe('Forge Actor Application lifecycle', () => {
  test('actor delivery: legacy structured preview remains creatable with findings and after editing the next source',async()=>{
    const response:any=await makeAcceptedResponse();delete response.result.artifactHash;
    response.result.status='needs_review';response.result.verification.status='needs_review';
    response.result.diagnostics=[{code:'CONTENT_ISSUE',severity:'warning',stage:'semantic',path:'actor',message:'A field needs attention.'}];
    let creates=0;const x=makeApplication({createAcceptedForgeActor:(async({response:current}:any)=>{
      creates++;expect(current).toEqual(response);return {status:'created',actor:{} as any,uuid:'Actor.saved',sourceId:current.result!.sourceIdentity.sourceId,artifactHash:'a'.repeat(64)};
    }) as any});
    try{
      x.application.response=response;x.application.renderResult(x.root);expect(x.root.create.disabled).toBe(false);
      x.root.source.value='next source';x.application.invalidateWorkspaceCandidate();
      expect(x.application.response).toEqual(response);expect(x.root.create.disabled).toBe(false);
      await x.application.create();expect(creates).toBe(1);
    }finally{await x.application.close();}
  });

  test('shared credential and probe notifications preserve the current structured preview', async () => {
    saveForgeSessionSettings({ providerId: 'custom', endpoint: 'https://provider.example/v1', protocol: 'openai-chat',
      model: 'extract', apiKey: 'page-key' });
    const { application, root } = makeApplication();
    (application as any).response = await makeAcceptedResponse();
    (application as any).renderResult(root);
    expect(root.create.disabled).toBe(false);
    markForgeSessionConnectionTested();
    saveForgeSessionSettings({ apiKey: '' });
    expect((application as any).response).toBeDefined();
    expect(root.create.disabled).toBe(false);
    saveForgeSessionSettings({ model: 'changed-model' });
    expect((application as any).response).toBeDefined();
    expect(root.create.disabled).toBe(false);
    await application.close();
  });
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

  test('loads Markdown or TXT into the source and retains the existing preview', async () => {
    const accepted = await makeAcceptedResponse();
    const { application, root } = makeApplication();
    (application as any).response = accepted;
    (application as any).renderResult(root);
    expect(root.preview.hidden).toBe(false);

    root.displayName.value = '';
    root.sourceFile.files = [sourceFile('nightgaunt.md', NIGHTGAUNT_SOURCE)];
    await root.sourceFile.onchange?.();

    expect(root.source.value).toBe(NIGHTGAUNT_SOURCE);
    expect(root.displayName.value).toBe('nightgaunt');
    expect((application as any).response).toBeDefined();
    expect(root.preview.hidden).toBe(false);
    expect(root.status.textContent).toMatch(/已读取 nightgaunt\.md/u);
    expect(root.error.hidden).toBe(true);
  });

  test('reports an unsupported source file while retaining the existing Actor', async () => {
    const accepted = await makeAcceptedResponse();
    const { application, root, notifications } = makeApplication();
    (application as any).response = accepted;
    (application as any).renderResult(root);
    root.sourceFile.files = [sourceFile('not-a-source.json', '{}', 'application/json')];
    await root.sourceFile.onchange?.();

    expect((application as any).response).toBeDefined();
    expect(root.preview.hidden).toBe(false);
    expect(root.status.textContent).toBe('状态：文件读取失败，请重新选择来源文件。');
    expect(root.error.hidden).toBe(false);
    expect(notifications.errors).toContainEqual(expect.stringMatching(/Markdown.*TXT/u));
  });

  test('does not let a pending file read overwrite a later edit', async () => {
    const accepted = await makeAcceptedResponse();
    const releaseFile = deferred<string>();
    const { application, root } = makeApplication();
    (application as any).response = accepted;
    (application as any).renderResult(root);
    root.displayName.value = '';
    root.sourceFile.files = [{
      name: 'stale.md', type: 'text/markdown', size: 1,
      text: () => releaseFile.promise,
    }];
    const pending = root.sourceFile.onchange?.();
    expect((application as any).readingFile).toBe(true);

    root.displayName.value = 'Manual name';
    root.displayName.oninput?.();
    expect((application as any).readingFile).toBe(false);
    expect(root.generate.disabled).toBe(false);
    releaseFile.resolve('stale source');
    await pending;

    expect(root.source.value).toBe('old source');
    expect(root.displayName.value).toBe('Manual name');
    expect((application as any).response).toBeDefined();
  });

  test('redirects legacy AI mode before any Provider request', async () => {
    await withForgeSessionSettings(async () => {
      let calls = 0;
      const services: Partial<ForgeApplicationServices> = {
        createBrowserAiProvider: (() => { calls += 1; throw new Error('Legacy AI provider must not run.'); }) as any,
        convertRawActorSourceWithAi: (async () => { calls += 1; throw new Error('Legacy AI intake must not run.'); }) as any,
      };
      const { application, root } = makeApplication(services);
      root.mode.value = 'ai';
      await (application as any).generate(root);
      expect(calls).toBe(0);
      expect((application as any).response).toBeUndefined();
    });
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
    let opened = 0;
    const services: Partial<ForgeApplicationServices> = {
      createAcceptedForgeActor: async (input): Promise<ForgeActorCreateResult> => {
        createStarted.resolve();
        await releaseCreate.promise;
        return {
          status: 'created',
          actor: { sheet: { render: async () => { opened += 1; } } } as any,
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
    expect(root.status.textContent).toBe('状态：Actor 已创建并完成回读核对，可打开角色卡。');
    expect(root.generate.disabled).toBe(false);
    expect(root.create.disabled).toBe(false);
    expect(root.cancel.disabled).toBe(true);
    expect(root.source.disabled).toBe(false);
    expect(root.displayName.disabled).toBe(false);
    expect(root.mode.disabled).toBe(false);
    expect(root.createdDocument.hidden).toBe(false);
    expect(root.openCreated.disabled).toBe(false);
    await root.openCreated.onclick?.();
    expect(opened).toBe(1);
  });

  test('standard Actor creation displays returned content differences without losing the created result',async()=>{
    const accepted=await makeAcceptedResponse();
    const {application,root}=makeApplication({createAcceptedForgeActor:async()=>({status:'created',actor:{} as any,
      uuid:'Actor.warning-example',sourceId:'actor:v1:123e4567-e89b-42d3-a456-426614174000' as any,artifactHash:'a'.repeat(64) as any,
      readbackWarnings:['Spear：远射程生成值60，Foundry未保留。']})});
    (application as any).response=accepted;await (application as any).create();
    expect(root.status.textContent).toContain('已保留');
    expect(root.diagnosticList.innerHTML).toContain('远射程生成值60');
    expect(root.createdSummary.textContent).toContain('Foundry未保留');
    expect(root.createdDocument.hidden).toBe(false);
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

  test('does not persist an API Key from the standard import form', async () => {
    const storage = makeStorage();
    const originalStorage = (globalThis as any).localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      const { application, root } = makeApplication();
      root.source.value = NIGHTGAUNT_SOURCE;
      root.apiKey.value = 'should-not-persist';
      root.persistApiKey.checked = true;
      await (application as any).generate(root);
      expect(storage.getItem('fvtt-json-forge.client-settings')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
    }
  });

  test('blocks legacy AI mode before intake or world creation', async () => {
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
    await withForgeSessionSettings(async () => {
      const { application, root } = makeApplication(services);
      root.mode.value = 'ai';
      root.source.value = 'one raw Actor source';
      await (application as any).generate(root);

      expect((application as any).intake).toBeUndefined();
      expect((application as any).response).toBeUndefined();
      expect(root.create.disabled).toBe(true);
      await (application as any).create();
      expect(createCalls).toBe(0);
    });
  });

  test('does not consume an injected legacy AI result with blocking findings', async () => {
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
    await withForgeSessionSettings(async () => {
      const { application, root } = makeApplication(services);
      root.mode.value = 'ai';
      root.source.value = 'one raw Actor source';

      await (application as any).generate(root);

      expect((application as any).intake).toBeUndefined();
      expect(root.create.disabled).toBe(true);
      await (application as any).create();
      expect(createCalls).toBe(0);
    });
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
  readonly sourceFile = control('', 'file');
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
  readonly error = control('');
  readonly createdDocument = control('');
  readonly createdSummary = control('');
  readonly openCreated = control('');

  querySelector(selector: string): any {
    return ({
      '[name="mode"]': this.mode,
      '[data-ai-settings]': this.aiSettings,
      '[name="source"]': this.source,
      '[name="sourceFile"]': this.sourceFile,
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
      '[data-error]': this.error,
      '[data-created-document]': this.createdDocument,
      '[data-created-summary]': this.createdSummary,
      '[data-action="open-created"]': this.openCreated,
    } as Record<string, any>)[selector] ?? null;
  }
}

function control(value: string, type = 'button'): any {
  return { value, type, checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', onclick: undefined, onchange: undefined, oninput: undefined };
}

function sourceFile(name: string, text: string, type = 'text/markdown'): any {
  return { name, type, size: new TextEncoder().encode(text).byteLength, text: async () => text };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function withForgeSessionSettings(callback: () => Promise<void>): Promise<void> {
  const originalStorage = (globalThis as any).localStorage;
  const storage = makeStorage();
  storage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({
    endpoint: 'https://provider.example/v1',
    model: 'extractor',
    apiKey: 'session-test-key',
    persistApiKey: true,
  }));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    await callback();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  }
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

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildForgeItemRequest, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import type { ForgeItemRequest, ForgeItemResponse, ForgeItemSourceId } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  createForgeItemApplicationClass,
  type ForgeItemApplicationServices,
} from '../src/itemApplication';
import type { ForgeItemCreateResult } from '../src/itemRuntime';

const SHIELD_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md'), 'utf8');
const JEWEL_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md'), 'utf8');
let accepted: ForgeItemResponse;
let needsReview: ForgeItemResponse;

beforeAll(async () => {
  accepted = await makeResponse(SHIELD_SOURCE, 'accepted-item-app');
  needsReview = await makeResponse(JEWEL_SOURCE, 'review-item-app');
  if (!('result' in accepted) || accepted.result.status !== 'accepted') throw new Error('Expected accepted Item fixture.');
  if (!('result' in needsReview) || needsReview.result.status !== 'needs_review') throw new Error('Expected needs-review Item fixture.');
});

describe('Forge Item ApplicationV2', () => {
  test('generates a safe preview and creates only the current accepted snapshot', async () => {
    let createCalls = 0;
    const { application, root, notifications } = makeApplication({
      convertFinalItemSource: async (request) => bindResponse(accepted, request),
      createAcceptedForgeItem: async (): Promise<ForgeItemCreateResult> => {
        createCalls += 1;
        return itemCreateResult('created');
      },
    });
    await (application as any).generate(root);
    expect(root.source.value).toMatch(/forge-source-id:\s*item:v1:[0-9a-f-]{36}/u);
    expect((application as any).response?.result?.status).toBe('accepted');
    expect((application as any).response?.result?.sourceIdentity.sourceId).toBe(
      root.source.value.match(/forge-source-id:\s*(item:v1:[0-9a-f-]{36})/u)?.[1],
    );
    expect(root.status.textContent).toBe('状态：accepted');
    expect(root.preview.hidden).toBe(false);
    expect(root.previewText.textContent).toContain('Shield of the Cavalier');
    expect(root.json.textContent).toContain('Protective Field');
    expect(root.create.disabled).toBe(false);

    await (application as any).create();
    expect(createCalls).toBe(1);
    expect(notifications.infos[0]).toMatch(/创建并重新读取核对成功/u);
  });

  test('invalidates immediately and prevents an old Promise from backfilling the preview', async () => {
    const pending = deferred<ForgeItemResponse>();
    const { application, root } = makeApplication({ convertFinalItemSource: async (request) => bindResponse(await pending.promise, request) });
    const generation = (application as any).generate(root);
    root.source.value = `${root.source.value}\nchanged`;
    root.source.oninput?.();
    expect((application as any).response).toBeUndefined();
    expect(root.create.disabled).toBe(true);
    pending.resolve(accepted);
    await generation;
    expect((application as any).response).toBeUndefined();
    expect(root.preview.hidden).toBe(true);
  });

  test('invalidates on display-name and mode changes', async () => {
    const { application, root } = makeApplication({ convertFinalItemSource: async (request) => bindResponse(accepted, request) });
    await (application as any).generate(root);
    expect(root.create.disabled).toBe(false);
    root.displayName.value = 'Renamed';
    root.displayName.oninput?.();
    expect((application as any).response).toBeUndefined();
    await (application as any).generate(root);
    root.mode.value = 'unsupported';
    root.mode.onchange?.();
    expect((application as any).response).toBeUndefined();
    expect(root.create.disabled).toBe(true);
  });

  test('revalidates GM and exact runtime on every render and click', async () => {
    let createCalls = 0;
    const { application, root, game, hooks } = makeApplication({
      convertFinalItemSource: async (request) => bindResponse(accepted, request),
      createAcceptedForgeItem: async () => {
        createCalls += 1;
        return itemCreateResult('created');
      },
    });
    await (application as any).generate(root);
    expect(root.create.disabled).toBe(false);
    game.user.isGM = false;
    hooks.emit('updateUser');
    expect(root.create.disabled).toBe(true);
    await (application as any).create();
    expect(createCalls).toBe(0);

    game.user.isGM = true;
    game.version = '14.365';
    hooks.emit('updateSetting');
    expect(root.create.disabled).toBe(true);
    await (application as any).create();
    expect(createCalls).toBe(0);

    game.version = '14.364';
    hooks.emit('updateSetting');
    expect(root.create.disabled).toBe(false);
  });

  test('keeps preview visible and locks source/generate/create/cancel during non-cancellable submit', async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const { application, root, browserWindow } = makeApplication({
      convertFinalItemSource: async (request) => bindResponse(accepted, request),
      createAcceptedForgeItem: async () => {
        started.resolve();
        await release.promise;
        return itemCreateResult('created');
      },
    });
    await (application as any).generate(root);
    const pending = (application as any).create();
    await started.promise;
    expect(root.status.textContent).toBe('状态：正在提交并重新读取核对（不可取消）。');
    expect(root.preview.hidden).toBe(false);
    expect(root.source.disabled).toBe(true);
    expect(root.displayName.disabled).toBe(true);
    expect(root.mode.disabled).toBe(true);
    expect(root.generate.disabled).toBe(true);
    expect(root.cancel.disabled).toBe(true);
    expect(root.create.disabled).toBe(true);
    (application as any).cancel();

    const event = { prevented: false, returnValue: undefined as unknown, preventDefault() { this.prevented = true; } };
    browserWindow.emit('beforeunload', event);
    expect(event.prevented).toBe(true);
    expect(await application.close()).toBe(application);

    release.resolve();
    await pending;
    expect(root.status.textContent).toBe('状态：accepted');
    expect(root.create.disabled).toBe(false);
  });

  test('keeps needs_review, failed, and decoder-invalid responses at zero world writes', async () => {
    let createCalls = 0;
    const services = {
      createAcceptedForgeItem: async () => {
        createCalls += 1;
        return itemCreateResult('created');
      },
    };
    for (const response of [needsReview, failedResponse(), invalidAcceptedResponse()]) {
      const { application, root } = makeApplication({ ...services, convertFinalItemSource: async (request) => bindResponse(response, request) });
      await (application as any).generate(root);
      expect(root.create.disabled).toBe(true);
      await (application as any).create();
    }
    expect(createCalls).toBe(0);
  });

  test('rejects an otherwise accepted response bound to another request/source identity', async () => {
    const { application, root, notifications } = makeApplication({ convertFinalItemSource: async () => accepted });
    await (application as any).generate(root);
    expect((application as any).response).toBeUndefined();
    expect(root.create.disabled).toBe(true);
    expect(notifications.errors).toContainEqual(expect.stringMatching(/requestId|source identity/u));
  });
});

async function makeResponse(content: string, requestId: string): Promise<ForgeItemResponse> {
  return convertFinalItemSource(buildForgeItemRequest({
    content,
    sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId,
    displayName: 'Item Application Test',
    requestId,
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
}

function failedResponse(): ForgeItemResponse {
  if (!('result' in accepted) || accepted.result.status !== 'accepted') throw new Error('Missing accepted fixture.');
  const { artifact: _artifact, artifactHash: _artifactHash, ...base } = accepted.result;
  return {
    protocolVersion: 1,
    requestId: 'failed-app',
    result: {
      ...base,
      status: 'failed',
      diagnostics: [{ code: 'FAILED', severity: 'error', stage: 'semantic', path: 'item', message: 'Failed.' }],
      verification: { status: 'failed', mechanicsCoverage: [] },
    },
  };
}

function invalidAcceptedResponse(): ForgeItemResponse {
  if (!('result' in accepted) || accepted.result.status !== 'accepted') throw new Error('Missing accepted fixture.');
  return {
    ...accepted,
    result: {
      ...accepted.result,
      itemDocument: { ...accepted.result.itemDocument, cachePath: 'C:\\secret' } as any,
    },
  };
}

function itemCreateResult(status: 'created' | 'existing'): ForgeItemCreateResult {
  return {
    status,
    item: {} as any,
    uuid: 'Item.application-test',
    sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId,
    artifactHash: 'a'.repeat(64) as any,
  };
}

function bindResponse(response: ForgeItemResponse, request: ForgeItemRequest): ForgeItemResponse {
  if (!('result' in response)) return { ...response, requestId: request.requestId };
  return {
    ...response,
    requestId: request.requestId,
    result: {
      ...response.result,
      sourceIdentity: {
        sourceId: request.source.sourceId,
        sourceHash: request.source.utf8Sha256,
      },
    },
  } as ForgeItemResponse;
}

function makeApplication(services: Partial<ForgeItemApplicationServices> = {}) {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    user: { isGM: true },
  };
  const hooks = new FakeHooks();
  const browserWindow = new FakeEventTarget();
  const foundry = {
    applications: {
      api: {
        ApplicationV2: class { async close(): Promise<void> { return undefined; } },
        HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      },
    },
  };
  const Application = createForgeItemApplicationClass({
    game,
    hooks,
    window: browserWindow,
    foundry,
    services,
    ui: {
      notifications: {
        error: (message: string) => notifications.errors.push(message),
        info: (message: string) => notifications.infos.push(message),
      },
    },
  });
  const application: any = new Application();
  const root = new FakeRoot();
  application.element = root;
  application._onRender({}, {});
  return { application, root, game, hooks, browserWindow, notifications };
}

class FakeHooks {
  private nextId = 0;
  private readonly callbacks = new Map<string, Map<number, (...args: any[]) => void>>();
  public on(event: string, callback: (...args: any[]) => void): number {
    const id = ++this.nextId;
    const entries = this.callbacks.get(event) ?? new Map();
    entries.set(id, callback);
    this.callbacks.set(event, entries);
    return id;
  }
  public off(event: string, id: unknown): void { if (typeof id === 'number') this.callbacks.get(event)?.delete(id); }
  public emit(event: string): void { for (const callback of this.callbacks.get(event)?.values() ?? []) callback(); }
}

class FakeEventTarget {
  private readonly callbacks = new Map<string, Set<(event: any) => void>>();
  public addEventListener(event: string, callback: (event: any) => void): void {
    const entries = this.callbacks.get(event) ?? new Set();
    entries.add(callback);
    this.callbacks.set(event, entries);
  }
  public removeEventListener(event: string, callback: (event: any) => void): void { this.callbacks.get(event)?.delete(callback); }
  public emit(event: string, value: any): void { for (const callback of this.callbacks.get(event) ?? []) callback(value); }
}

class FakeRoot {
  readonly mode = control('structured');
  readonly source = control(SHIELD_SOURCE);
  readonly displayName = control('Item Application Test');
  readonly generate = control('');
  readonly cancel = control('');
  readonly clear = control('');
  readonly create = control('');
  readonly status = control('');
  readonly diagnostics = control('');
  readonly diagnosticList = control('');
  readonly preview = control('');
  readonly previewText = control('');
  readonly json = control('');
  readonly finalSource = control('');

  querySelector(selector: string): any {
    return ({
      '[name="mode"]': this.mode,
      '[name="source"]': this.source,
      '[name="displayName"]': this.displayName,
      '[data-action="generate"]': this.generate,
      '[data-action="cancel"]': this.cancel,
      '[data-action="clear"]': this.clear,
      '[data-action="create"]': this.create,
      '[data-status]': this.status,
      '[data-diagnostics]': this.diagnostics,
      '[data-diagnostic-list]': this.diagnosticList,
      '[data-preview]': this.preview,
      '[data-preview-text]': this.previewText,
      '[data-json]': this.json,
      '[data-final-source]': this.finalSource,
    } as Record<string, any>)[selector] ?? null;
  }
}

function control(value: string): any {
  return { value, disabled: false, hidden: false, textContent: '', innerHTML: '', onclick: undefined, onchange: undefined, oninput: undefined };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

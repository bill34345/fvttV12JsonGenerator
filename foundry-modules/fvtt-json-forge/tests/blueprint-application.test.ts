import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import {
  ManagedForgeSourceLibrary,
  MemoryForgeSourceLibraryStore,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';
import {
  parseCreatureBlueprintSource,
  renderCreatureBlueprintSource,
} from '@fvtt-json-generator/forge-browser-runtime/creature-blueprint';
import type { ForgeActorResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeActorApplicationClass, type ForgeApplicationServices } from '../src/application';
import { createBlueprintComponent } from '../src/creatureBlueprintEditor';

const NIGHTGAUNT_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');

describe('Forge Actor blueprint authoring', () => {
  test('uses the formal source generator without invoking AI', async () => {
    const accepted = await makeAcceptedResponse();
    let aiCalls = 0;
    let capturedSource = '';
    const application = makeApplication({
      convertFinalActorSource: async (request) => {
        capturedSource = request.source.content;
        return accepted;
      },
      convertRawActorSourceWithAi: async () => {
        aiCalls += 1;
        throw new Error('blueprint mode must not call AI');
      },
    });
    const { root } = application;

    root.displayName.value = '蓝石守卫';
    root.displayName.oninput?.();
    await (application.application as any).generate(root);

    expect(aiCalls).toBe(0);
    expect(capturedSource).toContain('# forge-creature-blueprint-v1:');
    expect(capturedSource).toContain('forge-source-id: actor:v1:');
    expect((application.application as any).blueprintGenerationSnapshot).toBe(capturedSource);
  });

  test('saves and reloads source only, with no historical response restored', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const sourceLibrary = new ManagedForgeSourceLibrary(store);
    const application = makeApplication({}, sourceLibrary);
    const { root } = application;

    await new Promise((resolve) => setTimeout(resolve, 0));
    await (application.application as any).refreshBlueprintLibrary(root, false);
    root.blueprintAlignment.value = 'unaligned';
    root.blueprintAlignment.oninput?.();
    root.displayName.value = '来源库守卫';
    root.displayName.oninput?.();
    await (application.application as any).saveBlueprintToLibrary(root);
    const saved = await sourceLibrary.load();
    expect(saved.sources).toHaveLength(1);
    expect(saved.reviews).toHaveLength(0);
    const savedBlueprint = parseCreatureBlueprintSource(saved.sources[0]!.rawSource);
    expect(savedBlueprint.name).toBe('来源库守卫');

    await (application.application as any).clear(root);
    root.librarySelect.value = saved.sources[0]!.id;
    await (application.application as any).loadBlueprintFromLibrary(root);

    expect(root.displayName.value).toBe('来源库守卫');
    expect(root.blueprintAlignment.value).toBe('unaligned');
    expect(root.blueprintSource.value).toBe(saved.sources[0]!.rawSource);
    expect((application.application as any).response).toBeUndefined();
    expect(root.create.disabled).toBe(true);
  });

  test('derives a distinct source identity and keeps cumulative lineage changes', () => {
    const application = makeApplication();
    const { root } = application;
    const parent = (application.application as any).blueprintCore;
    root.variantName.value = '精英守卫';
    root.variantName.oninput?.();
    (application.application as any).deriveBlueprint(root);

    const derived = (application.application as any).blueprintCore;
    expect(derived.sourceId).not.toBe(parent.sourceId);
    expect(derived.lineage.parentSourceId).toBe(parent.sourceId);

    root.blueprintHp.value = '55';
    root.blueprintHp.oninput?.();
    const current = parseCreatureBlueprintSource(root.blueprintSource.value);
    expect(current.lineage?.changes.some((change: { path: string }) => change.path === '/hp')).toBe(true);
  });

  test('invalidates a pending result when the draft changes', async () => {
    const accepted = await makeAcceptedResponse();
    const started = deferred<void>();
    const release = deferred<ForgeActorResponse>();
    const application = makeApplication({
      convertFinalActorSource: async () => {
        started.resolve();
        return release.promise;
      },
    });
    const { root } = application;
    const pending = (application.application as any).generate(root);
    await started.promise;
    root.displayName.value = '编辑后的守卫';
    root.displayName.oninput?.();
    release.resolve(accepted);
    await pending;

    expect((application.application as any).response).toBeUndefined();
    expect(root.create.disabled).toBe(true);
    expect(root.displayName.value).toBe('编辑后的守卫');
  });

  test('does not mutate a library outside the current GM/runtime scope', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const sourceLibrary = new ManagedForgeSourceLibrary(store);
    const application = makeApplication({}, sourceLibrary);
    application.game.user.isGM = false;

    await (application.application as any).saveBlueprintToLibrary(application.root);

    expect((await sourceLibrary.load()).revision).toBe(0);
    expect(application.notifications.errors).toHaveLength(1);
  });

  test('blocks an unsupported blueprint enum before formal generation', async () => {
    let generationCalls = 0;
    const application = makeApplication({
      convertFinalActorSource: async () => {
        generationCalls += 1;
        throw new Error('invalid blueprint should not reach conversion');
      },
    });
    application.root.blueprintType.value = 'not-a-creature-type';
    application.root.blueprintType.oninput?.();

    await (application.application as any).generate(application.root);

    expect(generationCalls).toBe(0);
    expect(application.notifications.errors).toHaveLength(1);
  });

  test('reopened variants keep component and HP lineage changes', async () => {
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const application = makeApplication({}, sourceLibrary);
    const { root } = application;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await (application.application as any).refreshBlueprintLibrary(root, false);
    root.variantName.value = '组件精英';
    (application.application as any).deriveBlueprint(root);
    const save = createBlueprintComponent('save');
    save.name = '冰霜爆发';
    save.ability = 'dex';
    save.dc = '12';
    save.range = '30';
    save.damageFormula = '1d6';
    save.damageType = 'cold';
    (application.application as any).blueprintDraft.components.push(save);
    (application.application as any).invalidateCurrentPreview(root);
    await (application.application as any).saveBlueprintToLibrary(root);
    const saved = await sourceLibrary.load();
    root.blueprintSource.value = '';
    await (application.application as any).clear(root);
    root.librarySelect.value = saved.sources[0]!.id;
    await (application.application as any).loadBlueprintFromLibrary(root);
    root.blueprintHp.value = '77';
    root.blueprintHp.oninput?.();

    const reopened = parseCreatureBlueprintSource(root.blueprintSource.value);
    const paths = reopened.lineage?.changes.map((change) => change.path) ?? [];
    expect(paths).toContain('/hp');
    expect(paths).toContain('/components');
  });

  test('keeps fresh derive controls visible and updates displayed lineage after edits', () => {
    const application = makeApplication();
    const { root } = application;
    expect(root.variant.hidden).toBe(false);
    expect(root.parent.hidden).toBe(true);

    root.variantName.value = '派生守卫';
    (application.application as any).deriveBlueprint(root);
    expect(root.parent.hidden).toBe(false);
    expect(root.diff.hidden).toBe(false);

    root.blueprintHp.value = '66';
    root.blueprintHp.oninput?.();
    expect(root.diff.textContent).toContain('/hp');
  });

  test('clear keeps a fresh blueprint source identity and structured mode can re-enter blueprint mode', async () => {
    let generatedSource = '';
    const application = makeApplication({
      convertFinalActorSource: async (request) => {
        generatedSource = request.source.content;
        return makeAcceptedResponse();
      },
    });
    const { root } = application;
    (application.application as any).clear(root);
    root.displayName.value = '清除后守卫';
    root.blueprintType.value = 'humanoid';
    root.blueprintAlignment.value = 'neutral';
    root.blueprintAc.value = '14';
    root.blueprintHp.value = '22';
    root.blueprintSpeed.value = '30';
    root.blueprintCr.value = '1/4';
    root.blueprintStr.value = '12';
    root.blueprintDex.value = '12';
    root.blueprintCon.value = '12';
    root.blueprintInt.value = '10';
    root.blueprintWis.value = '10';
    root.blueprintCha.value = '10';
    root.displayName.oninput?.();
    await (application.application as any).generate(root);
    expect(generatedSource).toContain('清除后守卫');

    const structured = makeApplication({}, undefined, 'structured');
    (structured.application as any).clear(structured.root);
    expect((structured.application as any).blueprintCore).toBeUndefined();
    structured.root.mode.value = 'blueprint';
    structured.root.mode.onchange?.();
    expect((structured.application as any).blueprintCore).toBeDefined();
  });
});

async function makeAcceptedResponse(): Promise<ForgeActorResponse> {
  const response = await convertFinalActorSource(buildForgeActorRequest({
    content: NIGHTGAUNT_SOURCE,
    displayName: 'Blueprint Application Test Actor',
    requestId: 'blueprint-application-test',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Expected accepted fixture.');
  return response;
}

function makeApplication(
  services: Partial<ForgeApplicationServices> = {},
  sourceLibrary?: ManagedForgeSourceLibrary,
  initialMode: 'structured' | 'blueprint' | 'ai' = 'blueprint',
): { application: any; root: BlueprintRoot; game: any; notifications: { errors: string[]; infos: string[] } } {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    world: { id: 'blueprint-test-world' },
    user: { id: 'blueprint-test-user', isGM: true },
  };
  const root = new BlueprintRoot(initialMode);
  const environment = {
    game,
    sourceLibrary,
    foundry: {
      applications: {
        api: {
          ApplicationV2: class { async close(): Promise<void> { return undefined; } },
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
        },
      },
    },
    ui: { notifications: {
      error: (message: string) => notifications.errors.push(message),
      info: (message: string) => notifications.infos.push(message),
    } },
    services,
  };
  const Application = createForgeActorApplicationClass(environment);
  const application: any = new Application();
  application.element = root;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null } });
  application._onRender({}, {});
  return { application, root, game, notifications };
}

class BlueprintRoot {
  readonly mode: any;
  readonly aiSettings = control('');
  readonly source = control('');
  readonly displayName = control('');
  readonly endpoint = control('');
  readonly model = control('');
  readonly reviewModel = control('');
  readonly apiKey = control('', 'password');
  readonly persistApiKey = control('', 'checkbox');
  readonly blueprintSize = control('medium', 'select');
  readonly blueprintType = control('humanoid', 'select');
  readonly blueprintAlignment = control('neutral', 'select');
  readonly blueprintAc = control('', 'number');
  readonly blueprintHp = control('', 'number');
  readonly blueprintSpeed = control('', 'number');
  readonly blueprintCr = control('', 'number');
  readonly blueprintStr = control('', 'number');
  readonly blueprintDex = control('', 'number');
  readonly blueprintCon = control('', 'number');
  readonly blueprintInt = control('', 'number');
  readonly blueprintWis = control('', 'number');
  readonly blueprintCha = control('', 'number');
  readonly variantName = control('');
  readonly librarySearch = control('');
  readonly librarySelect = control('', 'select');
  readonly blueprintSource = control('', 'textarea');
  readonly libraryStatus = control('');
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
  readonly blueprintEditor = control('');
  readonly variant = control('');
  readonly parent = control('');
  readonly diff = control('');

  constructor(mode: 'structured' | 'blueprint' | 'ai' = 'blueprint') {
    this.mode = control(mode, 'select');
  }

  querySelector(selector: string): any {
    const map: Record<string, any> = {
      '[name="mode"]': this.mode,
      '[data-ai-settings]': this.aiSettings,
      '[name="source"]': this.source,
      '[name="displayName"]': this.displayName,
      '[name="endpoint"]': this.endpoint,
      '[name="model"]': this.model,
      '[name="reviewModel"]': this.reviewModel,
      '[name="apiKey"]': this.apiKey,
      '[name="persistApiKey"]': this.persistApiKey,
      '[name="blueprintSize"]': this.blueprintSize,
      '[name="blueprintType"]': this.blueprintType,
      '[name="blueprintAlignment"]': this.blueprintAlignment,
      '[name="blueprintArmorClass"]': this.blueprintAc,
      '[name="blueprintHitPoints"]': this.blueprintHp,
      '[name="blueprintSpeed"]': this.blueprintSpeed,
      '[name="blueprintCr"]': this.blueprintCr,
      '[name="blueprintScore-str"]': this.blueprintStr,
      '[name="blueprintScore-dex"]': this.blueprintDex,
      '[name="blueprintScore-con"]': this.blueprintCon,
      '[name="blueprintScore-int"]': this.blueprintInt,
      '[name="blueprintScore-wis"]': this.blueprintWis,
      '[name="blueprintScore-cha"]': this.blueprintCha,
      '[name="blueprintVariantName"]': this.variantName,
      '[name="blueprintLibrarySearch"]': this.librarySearch,
      '[name="blueprintLibrarySelect"]': this.librarySelect,
      '[data-blueprint-editor]': this.blueprintEditor,
      '[data-blueprint-variant]': this.variant,
      '[data-blueprint-parent]': this.parent,
      '[data-blueprint-diff]': this.diff,
      '[data-blueprint-source]': this.blueprintSource,
      '[data-blueprint-library-status]': this.libraryStatus,
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
    };
    return map[selector] ?? null;
  }
}

function control(value: string, type = 'text'): any {
  return { value, type, checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', onclick: undefined, onchange: undefined, oninput: undefined };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

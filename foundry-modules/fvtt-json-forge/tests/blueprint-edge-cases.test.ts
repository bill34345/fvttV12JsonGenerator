import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import {
  ManagedForgeSourceLibrary,
  MemoryForgeSourceLibraryStore,
  type ForgeSourceLibraryStore,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { createCreatureBlueprint, parseCreatureBlueprintSource } from '@fvtt-json-generator/forge-browser-runtime/creature-blueprint';
import type { ForgeActorResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeActorApplicationClass, type ForgeApplicationServices } from '../src/application';

const TEMPLATE = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-actor.hbs', 'utf8');
const NIGHTGAUNT_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');

describe('Forge blueprint edge cases', () => {
  test('explains an unavailable variant editor after blueprint initialization fails', () => {
    let attempts = 0;
    const context = makeApplication({
      createCreatureBlueprint: () => {
        if (++attempts === 1) throw new Error('simulated initialization failure');
        return createCreatureBlueprint();
      },
    });
    try {
      const { root } = context;
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      (root.querySelector('[data-blueprint-tab="variant"]') as HTMLButtonElement).click();
      const panel = root.querySelector('[data-blueprint-panel="variant"]') as HTMLElement;
      const empty = root.querySelector('[data-blueprint-variant-empty]') as HTMLElement;
      const controls = root.querySelector('[data-blueprint-variant]') as HTMLElement;
      expect(panel.hidden).toBe(false);
      expect(empty.hidden).toBe(false);
      expect(empty.textContent).toContain('未能初始化');
      expect(controls.hidden).toBe(true);

      (root.querySelector('[data-action="clear"]') as HTMLButtonElement).click();
      expect(empty.hidden).toBe(true);
      expect(controls.hidden).toBe(false);
      expect(panel.hidden).toBe(false);
    } finally {
      context.cleanup();
    }
  });

  test('keeps the 2024 preview independent of editor tabs and retains the generated candidate while editing', async () => {
    const context = makeApplication({ convertFinalActorSource: async () => acceptedResponse() });
    try {
      const { root, dom, application } = context;
      const workspace = root.querySelector('.forge-workbench-grid') as HTMLElement;
      const previewPane = root.querySelector('[data-preview-pane]') as HTMLElement;
      const statblock = root.querySelector('[data-statblock]') as HTMLElement;
      const compatibilitySelect = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement;
      expect(compatibilitySelect.closest('label')?.hidden).toBe(true);
      expect(compatibilitySelect.tabIndex).toBe(-1);
      expect(root.querySelector('[data-blueprint-library-cards]')?.getAttribute('role')).toBe('group');
      expect(previewPane.parentElement).toBe(workspace);
      expect(previewPane.contains(root.querySelector<HTMLElement>('[data-blueprint-tabs]'))).toBe(false);
      expect(previewPane.contains(root.querySelector<HTMLElement>('[data-action="create"]'))).toBe(false);

      setValue(context, '[name="mode"]', 'blueprint', 'change');
      expect(previewPane.hidden).toBe(false);
      expect(statblock.querySelector('.forge-statblock--draft')).not.toBeNull();
      const firstDraft = statblock.innerHTML;
      const abilitiesTab = root.querySelector('[data-blueprint-tab="abilities"]') as HTMLButtonElement;
      abilitiesTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect((root.querySelector('[data-blueprint-tab="variant"]') as HTMLElement).getAttribute('aria-selected')).toBe('true');
      expect((root.querySelector('[data-blueprint-panel="basic"]') as HTMLElement).hidden).toBe(true);
      expect((root.querySelector('[data-blueprint-panel="variant"]') as HTMLElement).hidden).toBe(false);
      expect(root.querySelector('[data-statblock]')).toBe(statblock);
      expect(statblock.innerHTML).toBe(firstDraft);

      await (application as any).generate(root);
      expect(statblock.querySelector('.forge-statblock--draft')).toBeNull();
      expect((root.querySelector('[data-preview-badge]') as HTMLElement).textContent).toBe('验证通过');
      expect((root.querySelector('[data-action="create"]') as HTMLButtonElement).disabled).toBe(false);
      const response = (application as any).response;
      const generatedPreview = statblock.innerHTML;
      setValue(context, '[name="blueprintHitPoints"]', '42', 'input');
      expect((root.querySelector('[name="blueprintHitPoints"]') as HTMLInputElement).value).toBe('42');
      expect((application as any).response).toBe(response);
      expect(statblock.querySelector('.forge-statblock--draft')).toBeNull();
      expect(statblock.innerHTML).toBe(generatedPreview);
      expect((root.querySelector('[data-preview-badge]') as HTMLElement).textContent).toBe('验证通过');
      expect((root.querySelector('[data-action="create"]') as HTMLButtonElement).disabled).toBe(false);
    } finally {
      context.cleanup();
    }
  });

  test('restores blueprint library controls after successful or failed world creation', async () => {
    for (const fails of [false, true]) {
      const context = makeApplication({
        convertFinalActorSource: async () => acceptedResponse(),
        createAcceptedForgeActor: async () => {
          if (fails) throw new Error('simulated world write failure');
          return { status: 'created', uuid: 'Actor.test' } as any;
        },
      });
      try {
        const { root, application } = context;
        setValue(context, '[name="mode"]', 'blueprint', 'change');
        await (application as any).generate(root);
        const search = root.querySelector('[name="blueprintLibrarySearch"]') as HTMLInputElement;
        const select = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement;
        expect(search.disabled).toBe(false);
        expect(select.disabled).toBe(false);

        const creating = (application as any).create() as Promise<void>;
        expect(search.disabled).toBe(true);
        expect(select.disabled).toBe(true);
        await creating;
        expect(search.disabled).toBe(false);
        expect(select.disabled).toBe(false);
      } finally {
        context.cleanup();
      }
    }
  });

  test('creates the selected generated artifact after an unrelated DOM edit without changing that artifact', async () => {
    let createCalls = 0;
    let createdResponse: ForgeActorResponse | undefined;
    const context = makeApplication({
      convertFinalActorSource: async () => acceptedResponse(),
      createAcceptedForgeActor: async ({ response }) => {
        createCalls += 1;
        createdResponse = response;
        return { status: 'created', uuid: 'Actor.selected-candidate' } as any;
      },
    });
    try {
      const { root, application } = context;
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      await (application as any).generate(root);
      expect((application as any).response).toBeDefined();
      const selectedResponse = (application as any).response as ForgeActorResponse;
      if (!('result' in selectedResponse)) throw new Error('Missing selected Actor result.');
      const selectedArtifact = structuredClone(selectedResponse.result.artifact);
      expect((root.querySelector('[data-action="create"]') as HTMLButtonElement).disabled).toBe(false);

      // Simulate a browser or automation write that changes the control but
      // does not dispatch the event used by the normal UI path.
      (root.querySelector('[name="blueprintHitPoints"]') as HTMLInputElement).value = '77';
      await (application as any).create();

      expect(createCalls).toBe(1);
      expect(createdResponse).toBe(selectedResponse);
      if (!createdResponse || !('result' in createdResponse)) throw new Error('Missing created Actor result.');
      expect(createdResponse.result.artifact).toEqual(selectedArtifact);
      expect((application as any).response).toBe(selectedResponse);
      expect((root.querySelector('[name="blueprintHitPoints"]') as HTMLInputElement).value).toBe('77');
      expect(context.notifications.errors).toEqual([]);
    } finally {
      context.cleanup();
    }
  });

  test('preserves unsaved structured and blueprint names across a mode round trip', () => {
    const context = makeApplication();
    try {
      const { root } = context;
      setValue(context, '[name="displayName"]', '未保存的规范名称', 'input');
      setValue(context, '[name="source"]', '未保存的规范来源', 'input');

      setValue(context, '[name="mode"]', 'blueprint', 'change');
      setValue(context, '[name="displayName"]', '未保存的蓝图名称', 'input');
      setValue(context, '[name="mode"]', 'structured', 'change');

      expect((root.querySelector('[name="displayName"]') as HTMLInputElement).value).toBe('未保存的规范名称');
      expect((root.querySelector('[name="source"]') as HTMLTextAreaElement).value).toBe('未保存的规范来源');

      setValue(context, '[name="mode"]', 'blueprint', 'change');
      expect((root.querySelector('[name="displayName"]') as HTMLInputElement).value).toBe('未保存的蓝图名称');
    } finally {
      context.cleanup();
    }
  });

  test('restores the active mode and drafts after a real template rerender', () => {
    const context = makeApplication();
    try {
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      setValue(context, '[name="displayName"]', '重绘蓝图', 'input');
      (context.root.querySelector('[data-blueprint-tab="review"]') as HTMLButtonElement).click();
      const replacement = context.dom.window.document.createElement('div');
      replacement.innerHTML = TEMPLATE;
      const nextRoot = replacement.querySelector('form') as HTMLFormElement;
      context.root.replaceWith(nextRoot);
      context.application.element = nextRoot;
      context.application._onRender({}, {});
      expect((nextRoot.querySelector('[name="mode"]') as HTMLSelectElement).value).toBe('blueprint');
      expect((nextRoot.querySelector('[name="displayName"]') as HTMLInputElement).value).toBe('重绘蓝图');
      expect((nextRoot.querySelector('[data-blueprint-tab="review"]') as HTMLElement).getAttribute('aria-selected')).toBe('true');
      expect(nextRoot.querySelector('[data-preview-pane]')?.parentElement).toBe(nextRoot.querySelector('.forge-workbench-grid') as HTMLElement);

      setValue({ ...context, root: nextRoot }, '[name="mode"]', 'structured', 'change');
      setValue({ ...context, root: nextRoot }, '[name="displayName"]', '重绘规范', 'input');
      setValue({ ...context, root: nextRoot }, '[name="source"]', '规范来源', 'input');
      const second = context.dom.window.document.createElement('div');
      second.innerHTML = TEMPLATE;
      const finalRoot = second.querySelector('form') as HTMLFormElement;
      nextRoot.replaceWith(finalRoot);
      context.application.element = finalRoot;
      context.application._onRender({}, {});
      expect((finalRoot.querySelector('[name="mode"]') as HTMLSelectElement).value).toBe('structured');
      expect((finalRoot.querySelector('[name="displayName"]') as HTMLInputElement).value).toBe('重绘规范');
      expect((finalRoot.querySelector('[name="source"]') as HTMLTextAreaElement).value).toBe('规范来源');
    } finally {
      context.cleanup();
    }
  });

  test('keeps fresh derive controls visible while hiding only absent parent details', () => {
    const context = makeApplication();
    try {
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      expect((context.root.querySelector('[data-blueprint-variant]') as HTMLElement).hidden).toBe(false);
      expect((context.root.querySelector('[data-blueprint-parent]') as HTMLElement).hidden).toBe(true);
      expect((context.root.querySelector('[data-action="blueprint-derive"]') as HTMLButtonElement).hidden).toBe(false);
    } finally {
      context.cleanup();
    }
  });

  test('preserves component input identity and caret during ordinary edits', () => {
    const context = makeApplication();
    try {
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      const input = context.root.querySelector('[data-blueprint-field="name"]') as HTMLInputElement;
      input.focus();
      input.value = 'Spear captain';
      input.setSelectionRange(5, 5);
      input.dispatchEvent(new context.dom.window.Event('input', { bubbles: true }));

      expect(context.dom.window.document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(5);
      expect(context.root.querySelector('[data-blueprint-field="name"]')).toBe(input);
    } finally {
      context.cleanup();
    }
  });

  test('clears cached canonical source after an invalid draft edit', async () => {
    const context = makeApplication({ convertFinalActorSource: async () => acceptedResponse() });
    try {
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      await (context.application as any).generate(context.root);
      expect((context.application as any).blueprintSource).not.toBe('');

      setValue(context, '[name="blueprintType"]', 'invalid-type', 'input');

      expect((context.application as any).blueprintSource).toBe('');
      expect((context.root.querySelector('[data-blueprint-source]') as HTMLTextAreaElement).value).toBe('');
    } finally {
      context.cleanup();
    }
  });

  test('reopens a derived component replacement and accepts a further edit', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const sourceLibrary = new ManagedForgeSourceLibrary(store);
    const context = makeApplication({}, sourceLibrary);
    try {
      const { root, application } = context;
      setValue(context, '[name="mode"]', 'blueprint', 'change');
      setValue(context, '[name="blueprintVariantName"]', '派生守卫', 'input');
      (root.querySelector('[data-action="blueprint-derive"]') as HTMLButtonElement).click();

      const derived = (application as any).blueprintCore;
      const parentSourceId = derived.lineage.parentSourceId;
      const originalId = (application as any).blueprintDraft.components[0].id as string;

      // Remove the inherited attack, add a save, then add and remove another
      // attack. The final one-component result is a same-index replacement.
      (root.querySelector(`[data-blueprint-remove="${originalId}"]`) as HTMLButtonElement).click();
      (root.querySelector('[data-action="blueprint-add-save"]') as HTMLButtonElement).click();
      const saveId = (application as any).blueprintDraft.components[0].id as string;
      setComponentValue(context, saveId, 'name', '寒霜爆发');
      setComponentValue(context, saveId, 'ability', 'dex', 'change');
      setComponentValue(context, saveId, 'dc', '12');
      setComponentValue(context, saveId, 'range', '30');
      setComponentValue(context, saveId, 'damageFormula', '1d6');
      setComponentValue(context, saveId, 'damageType', 'cold');
      (root.querySelector('[data-action="blueprint-add-attack"]') as HTMLButtonElement).click();
      const temporaryAttackId = (application as any).blueprintDraft.components.at(-1).id as string;
      (root.querySelector(`[data-blueprint-remove="${temporaryAttackId}"]`) as HTMLButtonElement).click();

      await (application as any).refreshBlueprintLibrary(root, false);
      await (application as any).saveBlueprintToLibrary(root);
      const saved = await sourceLibrary.load();
      expect(saved.sources).toHaveLength(1);
      const savedBlueprint = parseCreatureBlueprintSource(saved.sources[0]!.rawSource);
      expect(savedBlueprint.lineage?.parentSourceId).toBe(parentSourceId);
      expect(savedBlueprint.components).toEqual([expect.objectContaining({
        type: 'save',
        name: '寒霜爆发',
        ability: 'dex',
        dc: 12,
      })]);

      (application as any).clear(root);
      const select = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement;
      select.value = saved.sources[0]!.id;
      await (application as any).loadBlueprintFromLibrary(root);
      setValue(context, '[name="blueprintHitPoints"]', '77', 'input');

      let reconstructionError = '';
      try {
        (application as any).toCoreBlueprint(root);
      } catch (error) {
        reconstructionError = error instanceof Error ? error.message : String(error);
      }
      expect(reconstructionError).toBe('');
      const reopened = parseCreatureBlueprintSource((root.querySelector('[data-blueprint-source]') as HTMLTextAreaElement).value);
      expect(reopened.lineage?.parentSourceId).toBe(parentSourceId);
      expect(reopened.lineage?.changes.some((change) => change.path === '/hp')).toBe(true);
      expect(reopened.components[0]).toEqual(expect.objectContaining({ type: 'save', name: '寒霜爆发' }));
    } finally {
      context.cleanup();
    }
  });

  test('rejects a delayed save when the current GM user changes scope', async () => {
    await expectScopeMutation('user');
  });

  test('rejects a delayed save when the current world changes scope', async () => {
    await expectScopeMutation('world');
  });
});

async function expectScopeMutation(scope: 'user' | 'world'): Promise<void> {
  let context: ReturnType<typeof makeApplication> | undefined;
  const store = new ScopeMutatingStore(() => {
    if (!context) throw new Error('test context was not initialized');
    if (scope === 'user') context.game.user.id = 'other-gm';
    else context.game.world.id = 'other-world';
  });
  const sourceLibrary = new ManagedForgeSourceLibrary(store);
  context = makeApplication({}, sourceLibrary);
  try {
    setValue(context, '[name="mode"]', 'blueprint', 'change');
    await (context.application as any).saveBlueprintToLibrary(context.root);

    expect((await sourceLibrary.load()).revision).toBe(0);
    expect(context.notifications.errors).toHaveLength(1);
  } finally {
    context.cleanup();
  }
}

class ScopeMutatingStore implements ForgeSourceLibraryStore {
  private readonly memory = new MemoryForgeSourceLibraryStore();

  constructor(private readonly mutateBeforeCommit: () => void) {}

  load(): Promise<Readonly<Awaited<ReturnType<MemoryForgeSourceLibraryStore['load']>>>> {
    return this.memory.load();
  }

  async replace(
    expectedRevision: number,
    next: Parameters<ForgeSourceLibraryStore['replace']>[1],
    beforeCommit?: Parameters<ForgeSourceLibraryStore['replace']>[2],
  ): Promise<void> {
    this.mutateBeforeCommit();
    beforeCommit?.();
    await this.memory.replace(expectedRevision, next);
  }

  subscribe(listener: () => void): () => void {
    return this.memory.subscribe(listener);
  }
}

type TestContext = ReturnType<typeof makeApplication>;

function makeApplication(
  services: Partial<ForgeApplicationServices> = {},
  sourceLibrary?: ManagedForgeSourceLibrary,
): {
  application: any;
  root: HTMLFormElement;
  dom: JSDOM;
  game: { version: string; system: { id: string; version: string }; world: { id: string }; user: { id: string; isGM: boolean } };
  notifications: { errors: string[]; infos: string[] };
  cleanup: () => void;
} {
  const dom = new JSDOM(TEMPLATE, { url: 'https://forge.test/' });
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    world: { id: 'blueprint-edge-world' },
    user: { id: 'blueprint-edge-user', isGM: true },
  };
  const environment = {
    game,
    sourceLibrary,
    window: dom.window,
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
  const root = dom.window.document.querySelector('form') as HTMLFormElement;
  application.element = root;
  application._onRender({}, {});
  return {
    application,
    root,
    dom,
    game,
    notifications,
    cleanup: () => {
      if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
      else delete (globalThis as any).document;
      dom.window.close();
    },
  };
}

function setValue(
  context: TestContext,
  selector: string,
  value: string,
  event: 'input' | 'change',
): void {
  const element = context.root.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!element) throw new Error(`Missing ${selector}`);
  element.value = value;
  element.dispatchEvent(new context.dom.window.Event(event, { bubbles: true }));
}

function setComponentValue(
  context: TestContext,
  componentId: string,
  field: string,
  value: string,
  event: 'input' | 'change' = 'input',
): void {
  const article = context.root.querySelector(`[data-blueprint-component="${componentId}"]`);
  const element = article?.querySelector(`[data-blueprint-field="${field}"]`) as HTMLInputElement | HTMLSelectElement | null;
  if (!element) throw new Error(`Missing component ${componentId}/${field}`);
  element.value = value;
  element.dispatchEvent(new context.dom.window.Event(event, { bubbles: true }));
}

let accepted: Promise<ForgeActorResponse> | undefined;

function acceptedResponse(): Promise<ForgeActorResponse> {
  accepted ??= convertFinalActorSource(buildForgeActorRequest({
    content: NIGHTGAUNT_SOURCE,
    displayName: 'Blueprint edge test actor',
    requestId: 'blueprint-edge-test',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  return accepted;
}

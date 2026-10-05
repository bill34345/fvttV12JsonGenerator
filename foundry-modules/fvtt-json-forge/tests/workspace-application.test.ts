import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';
import { convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { ManagedForgeSourceLibrary, MemoryForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { ManagedForgeBatchQueue, MemoryForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import { createForgeWorkspaceApplicationClass, type ForgeWorkspaceEnvironment } from '../src/workspaceApplication';
import { saveForgeSessionSettings } from '../src/settings';

const source = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');
const template = (name: string, context: object) => Handlebars.compile(readFileSync(`foundry-modules/fvtt-json-forge/src/templates/${name}.hbs`, 'utf8'))(context);

describe('unified Forge workspace using its actual templates', () => {
  test('uses one native application and preserves independent blueprint, source and AI drafts', async () => {
    const c = await makeWorkspace();
    try {
      expect(c.nativeWindows()).toBe(1);
      expect(c.formal().hidden).toBe(false);
      expect(c.intake().hidden).toBe(true);
      c.edit(c.formal(), 'displayName', '手写蓝图');
      c.edit(c.formal(), 'blueprintHitPoints', '42');
      c.app.selectMode('structured');
      c.edit(c.formal(), 'source', source);
      c.edit(c.formal(), 'displayName', '标准资料');
      c.app.selectMode('ai');
      c.edit(c.intake(), 'source', '复杂的施法与传奇说明，保留原文');
      c.edit(c.intake(), 'displayName', 'AI 草稿');
      c.app.selectMode('blueprint');
      expect(c.value(c.formal(), 'displayName')).toBe('手写蓝图');
      expect(c.value(c.formal(), 'blueprintHitPoints')).toBe('42');
      c.app.selectMode('structured');
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('标准资料');
      c.app.selectMode('ai');
      expect(c.value(c.intake(), 'source')).toContain('复杂的施法与传奇说明');
      expect(c.nativeWindows()).toBe(1);
    } finally { await c.cleanup(); }
  });

  test('revokes a generated candidate on mode switch and rejects silent source changes', async () => {
    let creates = 0;
    const c = await makeWorkspace({ actor: { services: { createAcceptedForgeActor: async () => {
      creates++; return { status: 'created', uuid: 'Actor.test' } as any;
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      await c.app.formal.generate(c.formal());
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      const input = c.formal().querySelector('[name="source"]') as HTMLTextAreaElement;
      input.value += '\n# additional source';
      await c.app.formal.create();
      expect(creates).toBe(0);
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
      c.edit(c.formal(), 'source', source); await c.app.formal.generate(c.formal());
      c.app.selectMode('ai'); c.app.selectMode('structured');
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
      expect(c.value(c.formal(), 'source')).toBe(source);
    } finally { await c.cleanup(); }
  });

  test('a suspended generation cannot restore its old accepted result', async () => {
    let resolve!: (value: any) => void;
    let request: any;
    const pending = new Promise<any>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { convertFinalActorSource: async value => {
      request = value; return pending;
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      const generating = c.app.formal.generate(c.formal());
      expect(request).toBeDefined();
      c.app.selectMode('ai');
      resolve(await convertFinalActorSource(request)); await generating;
      c.app.selectMode('structured');
      expect(c.app.formal.response).toBeUndefined();
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('locks switching and close through the world commit and readback interval', async () => {
    let resolve!: (value: any) => void;
    const pending = new Promise<any>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { createAcceptedForgeActor: () => pending } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      await c.app.formal.generate(c.formal());
      const creating = c.app.formal.create();
      await c.render();
      expect(c.app.selectMode('ai')).toBe(false);
      expect(c.root.querySelector<HTMLButtonElement>('[data-forge-mode="ai"]')!.disabled).toBe(true);
      await c.app.close(); expect(c.closed()).toBe(0);
      resolve({ status: 'created', uuid: 'Actor.test', actor: { sheet: { render() {} } } });
      await creating;
      expect(c.root.querySelector('[data-workspace-stage="created"]')?.getAttribute('aria-current')).toBe('step');
      expect(c.button(c.formal(), 'open-created').disabled).toBe(false);
      expect(c.app.selectMode('ai')).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('rerender keeps drafts and connection invalidation reaches the new DOM without adding hooks', async () => {
    const c = await makeWorkspace();
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      c.edit(c.formal(), 'displayName', '重绘来源');
      await c.app.formal.generate(c.formal());
      const hookCount = c.hooks.size;
      await c.render();
      expect(c.hooks.size).toBe(hookCount);
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('重绘来源');
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      saveForgeSessionSettings({ model: 'different-test-model' });
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
    } finally { await c.cleanup(); }
    expect(c.hooks.size).toBe(0);
  });

  test('Item workspace keeps its own object kind and never exposes blueprint or encounter routes', async () => {
    const c = await makeWorkspace({ directoryKind: 'Item' });
    try {
      expect(c.root.querySelector('[data-forge-mode="blueprint"]')).toBeNull();
      expect(c.root.querySelector('[data-workspace-encounter]')).toBeNull();
      expect(c.app.selectMode('blueprint')).toBe(false);
      expect(c.value(c.intake(), 'mode')).toBe('ai-item');
      expect(c.app.selectMode('structured')).toBe(true);
      expect(c.intake().hidden).toBe(true);
      expect(c.formal().querySelector('[data-blueprint-editor]')).toBeNull();
    } finally { await c.cleanup(); }
  });

  test('a file that finishes after rerender populates the current pane and survives another rerender', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('structured');
      const file = { name: 'retained.md', type: 'text/markdown', size: 20, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.app.formal.readSourceFile(c.formal(), { files: [file] });
      await c.render(); resolve(source); await reading;
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('retained');
      await c.render();
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('retained');
    } finally { await c.cleanup(); }
  });

  test('a generation that finishes after rerender updates the visible result and controls', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { convertFinalActorSource: async request => {
      await pending; return convertFinalActorSource(request);
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      const generating = c.app.formal.generate(c.formal());
      const previous = c.formal();
      await c.render(); expect(c.formal()).not.toBe(previous);
      resolve(); await generating;
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      expect(c.button(c.formal(), 'generate').disabled).toBe(false);
      expect(c.button(c.formal(), 'cancel').disabled).toBe(true);
      expect(c.formal().querySelector('[data-preview]')?.hasAttribute('hidden')).toBe(false);
    } finally { await c.cleanup(); }
  });

  test('Intake remount restores its session binding and a pending file writes the current source', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('ai');
      saveForgeSessionSettings({ model: 'fixture-intake-model' });
      const file = { name: 'intake.txt', type: 'text/plain', size: 30, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.app.intake.readSourceFile(c.intake(), { files: [file] });
      await c.render();
      expect((c.intake() as any).__forgeSessionSettings.model).toBe('fixture-intake-model');
      resolve('保留复杂能力的原文'); await reading;
      expect(c.value(c.intake(), 'source')).toBe('保留复杂能力的原文');
      expect(c.value(c.intake(), 'displayName')).toBe('intake');
    } finally { await c.cleanup(); }
  });
});

async function makeWorkspace(overrides: Partial<ForgeWorkspaceEnvironment> = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  const root = dom.window.document.createElement('div'); dom.window.document.body.append(root);
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  let windows = 0, closes = 0;
  const hooks = new Map<number, (...args: any[]) => void>(); let nextHook = 0;
  const notifications: string[] = [];
  class Application {
    element = root;
    constructor(..._args: any[]) { windows++; }
    async close() { closes++; return this; }
  }
  const library = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
  const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
  const kind = overrides.directoryKind ?? 'Actor';
  const Class = createForgeWorkspaceApplicationClass({
    game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' }, user: { id: 'gm', isGM: true }, world: { id: 'fixture-world' } },
    ui: { notifications: { error: (text: string) => notifications.push(text), info() {} } },
    window: dom.window as any,
    hooks: { on: (_event, fn) => { hooks.set(++nextHook, fn); return nextHook; }, off: (_event, id) => { hooks.delete(id as number); } },
    foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (Base: any) => Base } } },
    ...overrides,
    directoryKind: kind,
    actor: { sourceLibrary: library, ...overrides.actor },
    intake: { sourceLibrary: library, batchQueue, ...overrides.intake },
  });
  const app = new Class();
  const render = async () => {
    const context = await app._prepareContext();
    root.innerHTML = template('forge-workspace', context) + template(kind === 'Actor' ? 'forge-actor' : 'forge-item', context) + template('forge-intake', context);
    app._onRender(context, {});
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await render();
  return { app, root, hooks, notifications, render,
    nativeWindows: () => windows, closed: () => closes,
    formal: () => root.querySelector<HTMLElement>('[data-forge-pane="formal"]')!,
    intake: () => root.querySelector<HTMLElement>('[data-forge-pane="intake"]')!,
    value: (pane: HTMLElement, name: string) => (pane.querySelector(`[name="${name}"]`) as HTMLInputElement).value,
    button: (pane: HTMLElement, action: string) => pane.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!,
    edit: (pane: HTMLElement, name: string, value: string) => {
      const input = pane.querySelector(`[name="${name}"]`) as HTMLInputElement;
      input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    cleanup: async () => { try { await app.close(); } finally { library.close(); batchQueue.close(); dom.window.close(); (globalThis as any).document = previousDocument; } },
  };
}

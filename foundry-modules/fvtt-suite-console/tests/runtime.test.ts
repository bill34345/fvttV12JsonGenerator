import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { HandbookContent } from '@fvtt-json-generator/suite-handbook';
import { createSuiteHandbook, MODULE_ID, SUPPORTED_CORE, WINDOW_ID } from '../src/runtime';

const content: HandbookContent = {
  schemaVersion: 1,
  entries: [{
    id: 'example', entryId: 'example', ownerDirectory: 'foundry-modules/example', foundryModuleId: 'example',
    category: 'play', title: '示例工具', summary: '只读说明', when: '准备游戏时',
    requires: ['核对版本'], steps: [{ title: '运行', text: '复制后自行运行', command: 'bun run example' }],
    outputs: ['说明'], limits: ['不会自动运行'], keywords: ['示例'], sources: ['docs/example.md'], watch: ['foundry-modules/example/'],
  }],
  reviews: { example: { fingerprint: 'abc', reviewedOn: '2026-10-11', note: '已核对' } },
  sources: { 'docs/example.md': '# 只读原文' },
};

const openDocuments: JSDOM[] = [];
afterEach(() => { for (const dom of openDocuments.splice(0)) dom.window.close(); });

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Only the lifecycle used here, in Core 14.368 order (application.mjs render/close). */
function fixture() {
  const dom = new JSDOM('<!doctype html><title>World title</title><body class="theme-light"></body>', {
    url: 'https://world.invalid/game#scene',
  });
  openDocuments.push(dom);
  const document = dom.window.document;
  const state = { isGM: true, coreVersion: SUPPORTED_CORE };
  const menus: Array<{ id: string; key: string; config: Record<string, unknown> }> = [];
  const warnings: string[] = [];
  const lifecycle: string[] = [];
  const closeAfterPreClose = deferred();
  let holdClose = false;
  let constructed = 0;

  class ApplicationV2 {
    readonly id = WINDOW_ID;
    element!: HTMLElement;
    rendered = false;
    maximizeCount = 0;
    frontCount = 0;
    #serial: Promise<unknown> = Promise.resolve();

    constructor(_options: Record<string, unknown> = {}) { constructed++; }
    _canRender(_options: unknown): boolean | void {}
    async _renderHTML(_context: unknown, _options: unknown): Promise<unknown> { return undefined; }
    _replaceHTML(_result: unknown, _content: HTMLElement, _options: unknown): void {}
    async _onRender(_context: unknown, _options: unknown): Promise<void> {}
    async _preClose(_options: unknown): Promise<void> {}
    _onClose(_options: unknown): void {}
    async maximize(): Promise<void> { this.maximizeCount++; }
    bringToFront(): void { this.frontCount++; }

    // Core queues render and close on the same semaphore. A thrown _canRender warns and returns this.
    render(options: Record<string, unknown> = {}): Promise<this> {
      const work = this.#serial.then(async () => {
        lifecycle.push('canRender');
        if (!this.rendered && !options.force) return this;
        try { if (this._canRender(options) === false) return this; }
        catch (error) { warnings.push((error as Error).message); return this; }
        if (!this.rendered) {
          this.element = document.createElement('div');
          this.element.className = 'window-app';
          const inner = document.createElement('section');
          inner.className = 'window-content';
          this.element.append(inner);
          document.body.append(this.element);
          lifecycle.push('frame');
        }
        const contentElement = this.element.querySelector<HTMLElement>('.window-content')!;
        const context = {};
        const result = await this._renderHTML(context, options);
        lifecycle.push('renderHTML');
        this._replaceHTML(result, contentElement, options);
        lifecycle.push('replaceHTML');
        this.rendered = true;
        await this._onRender(context, options);
        lifecycle.push('onRender');
        return this;
      });
      this.#serial = work;
      return work;
    }

    close(options: Record<string, unknown> = {}): Promise<this> {
      const work = this.#serial.then(async () => {
        if (!this.rendered) return this;
        await this._preClose(options);
        lifecycle.push('preClose');
        if (holdClose) await closeAfterPreClose.promise;
        this.element.remove();
        this.rendered = false;
        lifecycle.push('removed');
        this._onClose(options); // Core does not await this callback.
        lifecycle.push('onClose');
        return this;
      });
      this.#serial = work;
      return work;
    }
  }

  const suite = createSuiteHandbook({
    ApplicationV2,
    state: () => state,
    registerMenu: (id, key, config) => { menus.push({ id, key, config }); },
  }, content, '0123456789abcdef');
  return {
    dom, document, state, menus, warnings, lifecycle, suite, ApplicationV2,
    get constructed() { return constructed; },
    holdClose() { holdClose = true; },
    releaseClose() { closeAfterPreClose.resolve(); },
    application() { return new suite.Application() as ApplicationV2 & InstanceType<typeof suite.Application>; },
  };
}

test('init bootstrap registers only the menu and exposes a read-only API', async () => {
  const f = fixture();
  const globals = globalThis as unknown as Record<string, unknown>;
  const names = ['Hooks', 'game', 'foundry', '__SUITE_HANDBOOK_CONTENT__', '__SUITE_HANDBOOK_DIGEST__'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globals, name)]));
  const writes: string[] = [];
  const module: { api?: typeof f.suite.api } = {};
  const modules = new Map<string, { api?: typeof f.suite.api; active?: boolean; version?: string }>([
    [MODULE_ID, module], ['example', { active: true, version: '2.4.0' }],
  ]);
  let init: (() => void) | undefined;
  try {
    globals.Hooks = { once(event: string, callback: () => void) { expect(event).toBe('init'); init = callback; } };
    globals.foundry = { applications: { api: { ApplicationV2: f.ApplicationV2 } } };
    globals.game = {
      version: SUPPORTED_CORE, user: { isGM: true }, modules,
      settings: {
        registerMenu(id: string, key: string, config: Record<string, unknown>) { f.menus.push({ id, key, config }); },
        set() { writes.push('settings.set'); },
      },
      actors: { create() { writes.push('actors.create'); } },
      items: { create() { writes.push('items.create'); } },
      scenes: { update() { writes.push('scenes.update'); } },
    };
    globals.__SUITE_HANDBOOK_CONTENT__ = content;
    globals.__SUITE_HANDBOOK_DIGEST__ = '0123456789abcdef';
    await import('../src/index');
    expect(init).toBeDefined();
    init!();
    expect(f.menus).toHaveLength(1);
    expect(f.menus[0]).toMatchObject({ id: MODULE_ID, key: 'handbook', config: { restricted: true } });
    expect(module.api?.moduleId).toBe(MODULE_ID);
    expect(module.api?.apiVersion).toBe(1);
    expect(module.api?.version).toBe('0.3.0');
    await module.api!.openHelp({ entryId: 'example' });
    expect(f.document.querySelector('h1')?.textContent).toBe('示例工具');
    expect(f.document.querySelector('.module-state-detail')?.textContent).toContain('已安装 · 已启用');
    expect(f.document.querySelector('.module-state-detail')?.textContent).toContain('2.4.0');
    modules.set('example', { active: false, version: '2.4.0' });
    f.document.querySelector<HTMLButtonElement>('[data-modules-refresh]')!.click();
    expect(f.document.querySelector('.module-state-detail')?.textContent).toContain('未启用');
    modules.delete('example');
    f.document.querySelector<HTMLButtonElement>('[data-modules-refresh]')!.click();
    expect(f.document.querySelector('.module-state-detail')?.textContent).toContain('未安装');
    await module.api!.closeHelp();
    expect(writes).toEqual([]);
  } finally {
    for (const name of names) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globals, name, descriptor);
      else delete globals[name];
    }
  }
});

test('registers one restricted menu; registering never constructs or opens an application', () => {
  const f = fixture();
  f.suite.register();
  expect(f.menus).toHaveLength(1);
  expect(f.menus[0]).toMatchObject({ id: MODULE_ID, key: 'handbook', config: { restricted: true, type: f.suite.Application } });
  expect(f.constructed).toBe(0);
  expect(f.document.querySelector('.window-app')).toBeNull();
  expect(Object.isFrozen(f.suite.api)).toBe(true);
});

test('API and direct menu render reject non-GM and wrong Core before frame creation', async () => {
  const f = fixture();
  f.suite.register();
  for (const denied of [{ isGM: false, coreVersion: SUPPORTED_CORE }, { isGM: true, coreVersion: '14.367' }]) {
    Object.assign(f.state, denied);
    await expect(f.suite.api.openHelp()).rejects.toThrow();
    await expect(f.suite.api.closeHelp()).rejects.toThrow();
    const menu = new (f.menus[0]!.config.type as typeof f.suite.Application)();
    expect(await menu.render({ force: true })).toBe(menu);
    expect(menu.rendered).toBe(false);
    expect(f.document.querySelector('.window-app')).toBeNull();
  }
  expect(f.warnings).toHaveLength(2);
  expect(f.lifecycle).not.toContain('frame');
});

test('one application is reused, focuses on reopen, and releases old reader on rerender and close', async () => {
  const f = fixture();
  await f.suite.api.openHelp({ entryId: 'example', section: 'steps' });
  const app = f.application();
  expect(f.constructed).toBe(1);
  expect(app.id).toBe(WINDOW_ID);
  expect(f.document.activeElement).toBe(app.element.querySelector('[data-handbook-section="steps"]'));
  expect(f.lifecycle.slice(0, 5)).toEqual(['canRender', 'frame', 'renderHTML', 'replaceHTML', 'onRender']);
  const firstRoot = app.element.querySelector<HTMLElement>('.suite-handbook-host')!;
  const oldGuide = firstRoot.querySelector<HTMLButtonElement>('[data-route="guide"]')!;
  await f.suite.api.openHelp();
  expect(f.application()).toBe(app);
  expect(f.constructed).toBe(1);
  expect(app.maximizeCount).toBe(2);
  expect(app.frontCount).toBe(2);

  await app.render({ force: true });
  const secondRoot = app.element.querySelector<HTMLElement>('.suite-handbook-host')!;
  expect(secondRoot).not.toBe(firstRoot);
  oldGuide.click();
  expect(secondRoot.querySelector('h1')?.textContent).toBe('示例工具');
  await f.suite.api.closeHelp();
  expect(app.rendered).toBe(false);
  expect(f.document.querySelector('.window-app')).toBeNull();
  await f.suite.api.openHelp();
  expect(f.application()).toBe(app);
  expect(app.rendered).toBe(true);
  expect(app.element.querySelector('h1')?.textContent).toBe('示例工具');
});

test('theme and navigation stay inside the window; copy succeeds or falls back to selection', async () => {
  const f = fixture();
  const before = { url: f.dom.window.location.href, title: f.document.title, storage: f.dom.window.localStorage.length };
  await f.suite.api.openHelp({ entryId: 'example' });
  const app = f.application();
  let root = app.element.querySelector<HTMLElement>('.suite-handbook-host')!;
  expect(root.dataset.handbookTheme).toBe('light');
  root.querySelector<HTMLButtonElement>('[data-theme-toggle]')!.click();
  expect(root.dataset.handbookTheme).toBe('dark');
  expect(f.document.body.classList.contains('theme-light')).toBe(true);
  root.querySelector<HTMLButtonElement>('[data-route="guide"]')!.click();
  expect(root.querySelector('h1')?.textContent).toContain('先选择入口');
  await f.suite.api.openHelp({ entryId: 'example' });
  root = app.element.querySelector<HTMLElement>('.suite-handbook-host')!;

  const copied: string[] = [];
  Object.defineProperty(f.dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  root.querySelector<HTMLButtonElement>('[data-copy]')!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(copied).toEqual(['bun run example']);
  expect(root.querySelector('[data-copy]')?.textContent).toBe('已复制');
  Object.defineProperty(f.dom.window.navigator, 'clipboard', { configurable: true, value: undefined });
  await f.suite.api.openHelp({ entryId: 'example' });
  root = app.element.querySelector<HTMLElement>('.suite-handbook-host')!;
  root.querySelector<HTMLButtonElement>('[data-copy]')!.click();
  expect(root.querySelector('[data-copy]')?.textContent).toBe('已选中，请按 Ctrl+C');
  expect(f.dom.window.getSelection()?.toString()).toBe('bun run example');
  expect(f.dom.window.location.href).toBe(before.url);
  expect(f.document.title).toBe(before.title);
  expect(f.dom.window.localStorage.length).toBe(before.storage);
});

test('preClose disposes before removal, so late clipboard completion cannot update the closing reader', async () => {
  const f = fixture();
  const pending = deferred();
  Object.defineProperty(f.dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: () => pending.promise } });
  await f.suite.api.openHelp({ entryId: 'example' });
  const app = f.application();
  const oldButton = app.element.querySelector<HTMLButtonElement>('[data-copy]')!;
  oldButton.click();
  f.holdClose();
  const closing = f.suite.api.closeHelp();
  // The test double holds after awaited _preClose and before DOM removal, as Core does.
  while (!f.lifecycle.includes('preClose')) await Promise.resolve();
  expect(app.element.isConnected).toBe(true);
  pending.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(oldButton.textContent).toBe('复制命令');
  expect(app.element.querySelector('[data-announcement]')?.textContent).toBe('');
  f.releaseClose();
  await closing;
  expect(f.lifecycle.slice(-3)).toEqual(['preClose', 'removed', 'onClose']);
});

async function expectOpenQueuedBehindClose(closeThroughApi: boolean) {
  const f = fixture();
  await f.suite.api.openHelp();
  const app = f.application();
  f.holdClose();
  const closing = closeThroughApi ? f.suite.api.closeHelp() : app.close();
  while (!f.lifecycle.includes('preClose')) await Promise.resolve();
  // Core has awaited _preClose but still reports the old frame as rendered.
  expect(app.rendered).toBe(true);
  expect(app.element.isConnected).toBe(true);
  const opening = f.suite.api.openHelp({ entryId: 'example' });
  f.releaseClose();
  await Promise.all([closing, opening]);
  expect(app.rendered).toBe(true);
  expect(app.element.isConnected).toBe(true);
  expect(app.element.querySelector('h1')?.textContent).toBe('示例工具');
  expect(f.application()).toBe(app);
  expect(f.constructed).toBe(1);
  expect(f.lifecycle.slice(-8)).toEqual(['preClose', 'removed', 'onClose', 'canRender', 'frame', 'renderHTML', 'replaceHTML', 'onRender']);
  // A live reader still responds after the close/open handoff.
  app.element.querySelector<HTMLButtonElement>('[data-route="guide"]')!.click();
  expect(app.element.querySelector('h1')?.textContent).toContain('先选择入口');
}

test('API close followed by open during awaited preClose leaves one working window', async () => {
  await expectOpenQueuedBehindClose(true);
});

test('direct application close followed by API open during awaited preClose leaves one working window', async () => {
  await expectOpenQueuedBehindClose(false);
});

test('Foundry guide and updates explain module updates without standalone master-file advice', async () => {
  const f = fixture();
  await f.suite.api.openHelp();
  const root = f.application().element.querySelector<HTMLElement>('.suite-handbook-host')!;
  root.querySelector<HTMLButtonElement>('[data-route="guide"]')!.click();
  expect(root.textContent).toContain('以 GM 身份进入世界');
  expect(root.textContent).toContain('取得新版模块后按正常安装流程更新');
  expect(root.textContent).not.toContain('master 工作区');
  expect(root.textContent).not.toContain('双击项目根目录');
  root.querySelector<HTMLButtonElement>('[data-route="updates"]')!.click();
  expect(root.textContent).toContain('取得新版手册模块后按正常安装流程更新');
  expect(root.textContent).not.toContain('master 工作区');
  expect(root.textContent).not.toContain('双击项目根目录');
});

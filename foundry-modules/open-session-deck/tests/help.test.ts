import { afterEach, describe, expect, test } from 'bun:test';
import manual from '../docs/manual.json';
import { DeckHelp } from '../src/help.ts';

const originalGame = Object.getOwnPropertyDescriptor(globalThis, 'game');
const originalFoundry = Object.getOwnPropertyDescriptor(globalThis, 'foundry');

afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, 'game', originalGame); else delete (globalThis as any).game;
  if (originalFoundry) Object.defineProperty(globalThis, 'foundry', originalFoundry); else delete (globalThis as any).foundry;
});

function fixture(module?: { active?: boolean; api?: any }) {
  const nodes: any[] = [];
  const calls: string[] = [];
  const doc: any = {
    createElement(tag: string) {
      const node: any = {
        tag, ownerDocument: doc, children: [], className: '', textContent: '',
        append(child: any) { this.children.push(child); },
        replaceChildren(...children: any[]) { this.children = children; },
      };
      nodes.push(node);
      return node;
    },
  };
  const apps: any[] = [];
  let beforeRender = () => {};
  class ApplicationV2 {
    element = { ownerDocument: doc };
    rendered = false;
    minimized = false;
    front = false;
    content: any;
    constructor() { apps.push(this); }
    async render() {
      beforeRender();
      // Core catches _canRender errors and returns the application unchanged.
      try { (this as any)._canRender(); } catch { return this; }
      const content = doc.createElement('section');
      (this as any)._replaceHTML(await (this as any)._renderHTML(), content);
      this.content = content;
      this.rendered = true;
      calls.push('render');
      return this;
    }
    async close() { this.rendered = false; }
    async maximize() { this.minimized = false; calls.push('maximize'); }
    bringToFront() { this.front = true; calls.push('front'); }
  }
  let lookups = 0;
  const gameFixture: any = {
    user: { isGM: true },
    modules: { get: (id: string) => { expect(id).toBe('fvtt-suite-console'); lookups += 1; return module; } },
    settings: { set: () => { calls.push('setting-write'); throw new Error('setting write'); } },
  };
  Object.assign(globalThis, { game: gameFixture, foundry: { applications: { api: { ApplicationV2 } } } });
  return { apps, calls, gameFixture, lookups: () => lookups, nodes, onBeforeRender: (callback: () => void) => { beforeRender = callback; } };
}

function allText(node: any): string {
  return [node.textContent ?? '', ...(node.children ?? []).map(allText)].join('\n');
}

describe('Deck help routing', () => {
  test('uses the active Suite API with exact ABI and Deck entry, without opening any Deck surface', async () => {
    const opened: unknown[] = [];
    const state = fixture({ active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, openHelp: async (request: unknown) => opened.push(request) } });
    const help = new DeckHelp();
    await help.open();
    expect(opened).toEqual([{ entryId: 'open-session-deck' }]);
    expect(state.apps).toHaveLength(0);
    expect(state.calls).toEqual([]);
  });

  test.each([
    ['missing', undefined],
    ['inactive', { active: false, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, openHelp: async () => {} } }],
    ['foreign API', { active: true, api: { moduleId: 'other', apiVersion: 1, openHelp: async () => {} } }],
    ['unknown ABI', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 2, openHelp: async () => {} } }],
    ['missing method', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1 } }],
    ['Suite rejection', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, openHelp: async () => { throw new Error('Suite unavailable'); } } }],
  ])('%s uses a single bundled read-only fallback', async (_name, module) => {
    const state = fixture(module);
    const help = new DeckHelp();
    await Promise.all([help.open(), help.open()]);
    expect(state.apps).toHaveLength(1);
    expect(state.calls).toEqual(['render', 'maximize', 'front']);
    const text = allText(state.apps[0].content);
    expect(text).toContain(manual.title);
    expect(text).toContain(manual.summary);
    expect(text).toContain(manual.when);
    for (const step of manual.steps) {
      expect(text).toContain(step.title);
      expect(text).toContain(step.text);
    }
    for (const value of [...manual.requires, ...manual.outputs, ...manual.limits]) expect(text).toContain(value);
    await state.apps[0].close();
    await help.open();
    expect(state.apps).toHaveLength(1);
    expect(state.calls).toEqual(['render', 'maximize', 'front', 'render', 'maximize', 'front']);
  });

  test('rejects players before Suite lookup, fallback creation or settings access', () => {
    const state = fixture();
    state.gameFixture.user.isGM = false;
    const help = new DeckHelp();
    expect(() => help.open()).toThrow('GMs only');
    expect(state.lookups()).toBe(0);
    expect(state.apps).toHaveLength(0);
    expect(state.calls).toEqual([]);
  });

  test('reopens a minimized, covered fallback using the same instance and brings it forward', async () => {
    const state = fixture();
    const help = new DeckHelp();
    await help.open();
    const app = state.apps[0];
    app.minimized = true;
    app.front = false;
    await help.open();
    expect(state.apps).toHaveLength(1);
    expect(app.minimized).toBeFalse();
    expect(app.front).toBeTrue();
    expect(state.calls).toEqual(['render', 'maximize', 'front', 'render', 'maximize', 'front']);
  });

  test('rechecks GM after Core has swallowed a denied render', async () => {
    const state = fixture();
    const help = new DeckHelp();
    state.onBeforeRender(() => { state.gameFixture.user.isGM = false; });
    await expect(help.open()).rejects.toThrow('GMs only');
    expect(state.apps).toHaveLength(1);
    expect(state.calls).toEqual([]);
  });
});

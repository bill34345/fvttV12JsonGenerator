import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import manual from '../docs/manual.json';
import { TokenSyncHelp, type TokenSyncHelpEnvironment } from '../src/help.ts';

function fixture(suite?: ReturnType<TokenSyncHelpEnvironment['suiteModule']>, isGM = true) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const apps: ApplicationV2[] = [];
  const calls: string[] = [];
  const suiteCalls: unknown[][] = [];
  let lookups = 0;
  if (typeof suite?.api?.openHelp === 'function') {
    const method = suite.api.openHelp;
    suite.api.openHelp = function (this: unknown, ...args: unknown[]) {
      suiteCalls.push(args);
      return method.apply(this, args);
    };
  }
  class ApplicationV2 {
    element = doc.createElement('div');
    content = doc.createElement('section');
    minimized = false;
    front = false;
    constructor() { apps.push(this); }
    async render() {
      (this as any)._replaceHTML(await (this as any)._renderHTML(), this.content);
      calls.push('render');
      return this;
    }
    async close() { this.content.replaceChildren(); }
    async maximize() { this.minimized = false; calls.push('maximize'); }
    bringToFront() { this.front = true; calls.push('front'); }
  }
  const environment: TokenSyncHelpEnvironment = {
    isGM: () => isGM,
    suiteModule: () => { lookups++; return suite; },
    applicationV2: () => ApplicationV2,
  };
  return { environment, apps, calls, suiteCalls, lookups: () => lookups, close: () => dom.window.close() };
}

describe('TokenSync optional read-only help', () => {
  test('GM routes to the exact active Suite ABI and entry without creating a fallback', async () => {
    const opened: unknown[] = [];
    const api = { moduleId: 'fvtt-suite-console', apiVersion: 1, async openHelp(request: unknown) {
      expect(this).toBe(api);
      opened.push(request);
    } };
    const state = fixture({ active: true, api });
    try {
      await new TokenSyncHelp(state.environment).open();
      expect(opened).toEqual([{ entryId: manual.id }]);
      expect(state.apps).toHaveLength(0);
      expect(state.calls).toEqual([]);
    } finally { state.close(); }
  });

  test.each([
    ['missing', undefined],
    ['inactive', { active: false, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, openHelp() { throw new Error('must not call'); } } }],
    ['foreign API', { active: true, api: { moduleId: 'other', apiVersion: 1, openHelp() { throw new Error('must not call'); } } }],
    ['unknown ABI', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 2, openHelp() { throw new Error('must not call'); } } }],
    ['missing method', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1 } }],
    ['Suite failure', { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, async openHelp() { throw new Error('unavailable'); } } }],
  ])('%s uses the complete same-source bundled manual', async (_name, suite) => {
    const state = fixture(suite);
    try {
      const help = new TokenSyncHelp(state.environment);
      await Promise.all([help.open(), help.open()]);
      expect(state.apps).toHaveLength(1);
      expect(state.suiteCalls).toHaveLength(_name === 'Suite failure' ? 1 : 0);
      expect(state.calls).toEqual(['render', 'maximize', 'front']);
      const root = state.apps[0]!.content;
      const text = root.textContent;
      for (const value of [manual.title, manual.summary, manual.when, ...manual.requires,
        ...manual.steps.flatMap(step => [step.title, step.text]), ...manual.outputs, ...manual.limits]) {
        expect(text).toContain(value);
      }
      expect(root.querySelector('form, button, input, script')).toBeNull();
      const app = state.apps[0]!;
      app.minimized = true;
      app.front = false;
      await help.open();
      expect(state.apps).toHaveLength(1);
      expect(app.minimized).toBeFalse();
      expect(app.front).toBeTrue();
      await app.close();
      await help.open();
      expect(state.apps).toHaveLength(1);
      expect(app.content.textContent).toContain(manual.title);
    } finally { state.close(); }
  });

  test('players read the fallback without looking up or invoking the GM-only Suite', async () => {
    const state = fixture({ active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1,
      openHelp() { throw new Error('GM interface must not be called'); } } }, false);
    try {
      await new TokenSyncHelp(state.environment).open();
      expect(state.lookups()).toBe(0);
      expect(state.apps).toHaveLength(1);
      expect(state.apps[0]!.content.textContent).toContain(manual.title);
    } finally { state.close(); }
  });

  test('concurrent opens share one Suite request and a later open is fresh', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    const state = fixture({ active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1,
      async openHelp() { requests++; await gate; } } });
    try {
      const help = new TokenSyncHelp(state.environment);
      const first = help.open();
      const second = help.open();
      expect(first).toBe(second);
      expect(requests).toBe(1);
      release();
      await Promise.all([first, second]);
      await help.open();
      expect(requests).toBe(2);
      expect(state.apps).toHaveLength(0);
    } finally { release(); state.close(); }
  });

  test('missing ApplicationV2 reports a real failure and permits a later retry', async () => {
    const state = fixture();
    let available = false;
    const environment = { ...state.environment, applicationV2: () => available ? state.environment.applicationV2() : undefined };
    try {
      const help = new TokenSyncHelp(environment);
      await expect(help.open()).rejects.toThrow('ApplicationV2 is unavailable');
      available = true;
      await help.open();
      expect(state.apps).toHaveLength(1);
    } finally { state.close(); }
  });
});

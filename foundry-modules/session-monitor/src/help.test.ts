import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import manual from '../docs/manual.json';
import { MonitorHelp, type MonitorHelpEnvironment } from './help';
import { SessionMonitorRuntime } from './runtime';
import { MemorySessionStore } from './storage';

function fixture(suite?: ReturnType<MonitorHelpEnvironment['suiteModule']>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const apps: ApplicationV2[] = [];
  const calls: string[] = [];
  let isGM = true;
  let lookups = 0;
  let beforeRender = () => {};
  class ApplicationV2 {
    element = doc.createElement('div');
    content = doc.createElement('section');
    minimized = false;
    front = false;
    constructor() { apps.push(this); }
    async render() {
      beforeRender();
      // Core catches a denied _canRender and returns the unrendered instance.
      try { (this as any)._canRender(); } catch { return this; }
      (this as any)._replaceHTML(await (this as any)._renderHTML(), this.content);
      calls.push('render');
      return this;
    }
    async close() { this.content.replaceChildren(); }
    async maximize() { this.minimized = false; calls.push('maximize'); }
    bringToFront() { this.front = true; calls.push('front'); }
  }
  const environment: MonitorHelpEnvironment = {
    isGM: () => isGM,
    suiteModule: () => { lookups++; return suite; },
    applicationV2: () => ApplicationV2,
  };
  return { environment, apps, calls, lookups: () => lookups, setGM: (value: boolean) => { isGM = value; },
    beforeRender: (fn: () => void) => { beforeRender = fn; }, close: () => dom.window.close() };
}

describe('Monitor read-only help', () => {
  test('routes to the handbook entry, which differs from the runtime module ID', async () => {
    const requests: unknown[] = [];
    const state = fixture({ active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1,
      openHelp: async (request: unknown) => requests.push(request) } });
    try {
      await new MonitorHelp(state.environment).open();
      expect(requests).toEqual([{ entryId: 'session-monitor' }]);
      expect(state.apps).toHaveLength(0);
    } finally { state.close(); }
  });

  test.each(['missing', 'inactive', 'foreign', 'unsupported', 'missing-method', 'failed'])('%s Suite keeps the independent manual available', async (mode) => {
    let suiteCalls = 0;
    const api: any = { moduleId: mode === 'foreign' ? 'other' : 'fvtt-suite-console', apiVersion: mode === 'unsupported' ? 2 : 1,
      async openHelp() { suiteCalls++; throw new Error('Suite cannot open'); } };
    if (mode === 'missing-method') delete api.openHelp;
    const state = fixture(mode === 'missing' ? undefined : { active: mode !== 'inactive', api });
    try {
      const help = new MonitorHelp(state.environment);
      await Promise.all([help.open(), help.open()]);
      expect(suiteCalls).toBe(mode === 'failed' ? 1 : 0);
      expect(state.apps).toHaveLength(1);
      expect(state.calls).toEqual(['render', 'maximize', 'front']);
      const app = state.apps[0]!;
      for (const value of [manual.title, manual.summary, manual.when, ...manual.requires,
        ...manual.steps.flatMap(step => [step.title, step.text]), ...manual.outputs, ...manual.limits]) {
        expect(app.content.textContent).toContain(value);
      }
      expect(app.content.querySelector('form, button, input, script')).toBeNull();
      app.minimized = true;
      app.front = false;
      await help.open();
      expect(app.minimized).toBeFalse();
      expect(app.front).toBeTrue();
      await app.close();
      await help.open();
      expect(state.apps).toHaveLength(1);
      expect(app.content.textContent).toContain(manual.title);
    } finally { state.close(); }
  });

  test('rejects a player before Suite access or fallback creation', () => {
    const state = fixture();
    try {
      state.setGM(false);
      expect(() => new MonitorHelp(state.environment).open()).toThrow('GMs only');
      expect(state.lookups()).toBe(0);
      expect(state.apps).toHaveLength(0);
    } finally { state.close(); }
  });

  test('does not report a successful open if Core swallows a permission-denied render', async () => {
    const state = fixture();
    try {
      state.beforeRender(() => state.setGM(false));
      await expect(new MonitorHelp(state.environment).open()).rejects.toThrow('GMs only');
      expect(state.calls).toEqual([]);
    } finally { state.close(); }
  });

  test('rechecks permission after a pending Suite rejection before opening a fallback', async () => {
    let reject!: (reason: unknown) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const state = fixture({ active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1, openHelp: () => pending } });
    try {
      const opening = new MonitorHelp(state.environment).open();
      state.setGM(false);
      reject(new Error('Suite closed'));
      await expect(opening).rejects.toThrow('GMs only');
      expect(state.apps).toHaveLength(0);
    } finally { state.close(); }
  });

  test('the idle monitor panel opens help without starting capture or changing settings', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const requests: unknown[] = [];
    const writes: unknown[] = [];
    const store = new MemorySessionStore();
    let opened!: () => void;
    const complete = new Promise<void>(resolve => { opened = resolve; });
    const globals: any = {
      document: dom.window.document, window: dom.window,
      game: { user: { isGM: true }, world: { id: 'synthetic' },
        settings: { set: (...args: unknown[]) => writes.push(args) },
        modules: new Map([['fvtt-suite-console', { active: true, api: {
          moduleId: 'fvtt-suite-console', apiVersion: 1,
          async openHelp(request: unknown) { requests.push(request); opened(); },
        } }]]),
      },
    };
    try {
      const runtime = new SessionMonitorRuntime(globals, store);
      await runtime.initialize();
      const button = dom.window.document.querySelector<HTMLButtonElement>('[data-action="help"]');
      expect(button).not.toBeNull();
      expect(button!.type).toBe('button');
      expect(button!.disabled).toBeFalse();
      button!.click();
      await complete;
      expect(requests).toEqual([{ entryId: 'session-monitor' }]);
      expect(runtime.getStatus().state).toBe('idle');
      expect(store.sessions.size).toBe(0);
      expect(writes).toEqual([]);
    } finally { dom.window.close(); }
  });
});

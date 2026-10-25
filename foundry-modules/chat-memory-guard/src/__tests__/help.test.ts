import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { ChatGuardHelp, type ChatGuardHelpEnvironment } from '../help';
import { createSettingsApplicationClass } from '../settings';
import manual from '../../docs/manual.json';

function fixture(isGM: boolean, suite?: ReturnType<ChatGuardHelpEnvironment['suiteModule']>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const apps: ApplicationV2[] = [];
  let lookups = 0;
  class ApplicationV2 {
    element = dom.window.document.createElement('div');
    content = dom.window.document.createElement('section');
    minimized = false;
    front = false;
    renders = 0;
    constructor() { apps.push(this); }
    async render() { (this as any)._replaceHTML(await (this as any)._renderHTML(), this.content); this.renders++; return this; }
    async close() { this.content.replaceChildren(); }
    async maximize() { this.minimized = false; }
    bringToFront() { this.front = true; }
  }
  const environment: ChatGuardHelpEnvironment = { isGM: () => isGM,
    suiteModule: () => { lookups++; return suite; }, applicationV2: () => ApplicationV2 };
  return { dom, apps, environment, ApplicationV2, lookups: () => lookups, close: () => dom.window.close() };
}

describe('Chat Guard read-only help', () => {
  test('GM opens the exact unified entry without creating an independent window', async () => {
    const requests: unknown[] = [];
    const h = fixture(true, { active: true, api: { moduleId: 'fvtt-suite-console', apiVersion: 1,
      openHelp: async (request: unknown) => requests.push(request) } });
    try {
      await new ChatGuardHelp(h.environment).open();
      expect(requests).toEqual([{ entryId: 'chat-memory-guard' }]);
      expect(h.apps).toHaveLength(0);
    } finally { h.close(); }
  });

  test.each(['missing', 'inactive', 'foreign', 'unsupported', 'failed'])('%s Suite preserves independent same-source reading', async mode => {
    let calls = 0;
    const h = fixture(true, mode === 'missing' ? undefined : { active: mode !== 'inactive',
      api: { moduleId: mode === 'foreign' ? 'other' : 'fvtt-suite-console', apiVersion: mode === 'unsupported' ? 2 : 1,
        async openHelp() { calls++; throw new Error('unavailable'); } } });
    try {
      const help = new ChatGuardHelp(h.environment);
      await Promise.all([help.open(), help.open()]);
      expect(calls).toBe(mode === 'failed' ? 1 : 0);
      expect(h.apps).toHaveLength(1);
      const app = h.apps[0]!;
      expect(app.renders).toBe(1);
      for (const value of [manual.title, manual.summary, ...manual.steps.flatMap(step => [step.title, step.text]), ...manual.limits]) {
        expect(app.content.textContent).toContain(value);
      }
      expect(app.content.querySelector('pre code')!.textContent).toBe('bun run test:chat-memory-guard');
      expect(app.content.querySelector('button, form, input, script')).toBeNull();
      app.minimized = true;
      app.front = false;
      await help.open();
      expect(app.minimized).toBeFalse();
      expect(app.front).toBeTrue();
      await app.close();
      await help.open();
      expect(h.apps).toHaveLength(1);
      expect(app.content.textContent).toContain(manual.title);
    } finally { h.close(); }
  });

  test('players read the bundled manual without invoking the GM-only Suite', async () => {
    const h = fixture(false);
    try {
      await new ChatGuardHelp(h.environment).open();
      expect(h.lookups()).toBe(0);
      expect(h.apps).toHaveLength(1);
      expect(h.apps[0]!.content.textContent).toContain(manual.summary);
    } finally { h.close(); }
  });

  test('the player settings help button stays outside the disabled world fieldset and never saves the form', async () => {
    const h = fixture(false);
    const originals = new Map(['foundry', 'game', 'ui'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const writes: unknown[] = [];
    const errors: unknown[] = [];
    Object.assign(globalThis, {
      foundry: { applications: { api: { ApplicationV2: h.ApplicationV2, HandlebarsApplicationMixin: (Base: any) => class extends Base {} } } },
      game: { user: { isGM: false }, modules: { get() { throw new Error('player must not access Suite'); } },
        settings: { set: (...args: unknown[]) => writes.push(args), get() { throw new Error('help must not read settings'); } } },
      ui: { notifications: { error: (message: unknown) => errors.push(message) } },
    });
    try {
      const template = await readFile(new URL('../templates/settings.hbs', import.meta.url), 'utf8');
      h.dom.window.document.body.innerHTML = `<form>${template}</form>`;
      const Application = createSettingsApplicationClass();
      const form = h.dom.window.document.querySelector('form')!;
      const button = form.querySelector<HTMLButtonElement>('[data-action="openHelp"]')!;
      let submits = 0;
      let opening: Promise<void> | undefined;
      form.addEventListener('submit', event => { event.preventDefault(); submits++; });
      button.addEventListener('click', event => { opening = Application.DEFAULT_OPTIONS.actions.openHelp(event); });
      expect(button.type).toBe('button');
      expect(button.closest('fieldset')).toBeNull();
      button.click();
      await opening;
      expect(h.apps).toHaveLength(1);
      expect(submits).toBe(0);
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      h.close();
    }
  });
});

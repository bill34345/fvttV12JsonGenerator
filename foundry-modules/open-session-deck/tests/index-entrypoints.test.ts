import { expect, test } from 'bun:test';
import { DeckController } from '../src/controller.ts';

test('hotkey and Token control report failed opening without an unhandled promise', async () => {
  const keys = ['CONFIG', 'Hooks', 'canvas', 'foundry', 'game', 'ui', 'window'] as const;
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalStart = DeckController.prototype.start;
  const originalOpenLastMode = DeckController.prototype.openLastMode;
  const once = new Map<string, () => void>();
  const on = new Map<string, (...args: any[]) => void>();
  const errors: string[] = [];
  let hotkey: any;
  try {
    class ApplicationV2 { rendered = false; element = {}; }
    DeckController.prototype.start = async () => {};
    DeckController.prototype.openLastMode = async () => { throw new Error('open failed'); };
    Object.assign(globalThis, {
      CONFIG: {}, canvas: {}, window: { addEventListener: () => {} },
      foundry: { applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (Base: any) => Base } } },
      Hooks: {
        once: (name: string, callback: () => void) => { once.set(name, callback); },
        on: (name: string, callback: (...args: any[]) => void) => { on.set(name, callback); },
      },
      game: {
        user: { isGM: true }, modules: { get: () => ({}) },
        settings: { register: () => {} }, keybindings: { register: (_id: string, _key: string, config: any) => { hotkey = config; } },
        i18n: { localize: (key: string) => key },
      },
      ui: { notifications: { error: (message: string) => errors.push(message) } },
    });
    await import('../src/index.ts');
    once.get('init')!();
    once.get('ready')!();
    expect(hotkey.onDown()).toBeTrue();
    await Promise.resolve();
    const controls: any = { tokens: { tools: {} } };
    on.get('getSceneControlButtons')!(controls);
    controls.tokens.tools.openSessionDeck.onChange();
    await Promise.resolve();
    expect(errors).toEqual([
      'OSD.Notifications.ActionFailed: Error: open failed',
      'OSD.Notifications.ActionFailed: Error: open failed',
    ]);
  } finally {
    DeckController.prototype.start = originalStart;
    DeckController.prototype.openLastMode = originalOpenLastMode;
    for (const key of keys) {
      const descriptor = originals.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});

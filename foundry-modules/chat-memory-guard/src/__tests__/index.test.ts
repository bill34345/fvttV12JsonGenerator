import { describe, expect, test } from 'bun:test';
import { bootstrapChatMemoryGuard, initializeChatMemoryGuard } from '../index';

describe('module initialization', () => {
  test('registers init before the Foundry game global exists and resolves game lazily', () => {
    const once = new Map<string, Function>();
    const registrations: unknown[][] = [];
    const globals: any = {
      Hooks: { once: (name: string, callback: Function) => once.set(name, callback) },
    };

    expect(bootstrapChatMemoryGuard(globals)).toBe(true);
    expect(once.has('init')).toBe(true);
    expect(once.has('ready')).toBe(true);

    globals.game = {
      settings: {
        register: (...args: unknown[]) => registrations.push(args),
        registerMenu: (...args: unknown[]) => registrations.push(args),
      },
    };
    const previousFoundry = (globalThis as any).foundry;
    (globalThis as any).foundry = {
      applications: {
        api: {
          ApplicationV2: class {},
          HandlebarsApplicationMixin: (Base: any) => Base,
        },
      },
    };
    try {
      once.get('init')?.();
      expect(registrations.length).toBe(3);
    } finally {
      (globalThis as any).foundry = previousFoundry;
    }
  });

  test('registers settings at init and starts one runtime at ready', () => {
    const once = new Map<string, Function>();
    const registrations: unknown[][] = [];
    let started = 0;
    let refreshed = 0;
    const module = {};
    initializeChatMemoryGuard({
      hooks: { once: (name: string, callback: Function) => once.set(name, callback) },
      game: {
        settings: {
          register: (...args: unknown[]) => registrations.push(args),
          registerMenu: (...args: unknown[]) => registrations.push(args),
        },
        modules: { get: () => module },
      },
      createSettingsApplication: () => class {},
      createRuntime: () => ({
        start: () => { started++; },
        refresh: async () => { refreshed++; },
        getStats: () => ({ renderedMessages: 0 }),
      }),
    });
    once.get('init')?.();
    expect(registrations.length).toBe(3);
    once.get('ready')?.();
    expect(started).toBe(1);
    expect((module as any).api.getStats()).toEqual({ renderedMessages: 0 });
    expect(Object.keys((module as any).api)).toEqual(['getStats']);
    const firstSetting = registrations[0]?.[2] as { onChange?: () => void };
    firstSetting.onChange?.();
    expect(refreshed).toBe(1);
  });
});

import { describe, expect, test } from 'bun:test';

import { migrationConflictsResolved, registerBloodHunterRuntime } from '../src/runtime.ts';

describe('browser runtime bootstrap', () => {
  test('enables conflict continuation only after every row is explicitly kept or overwritten', () => {
    const plan = {
      conflicts: [
        { itemId: 'item-a', path: 'system.activities' },
        { itemId: 'item-a', path: 'effects' },
      ],
    } as any;
    expect(migrationConflictsResolved(plan, {})).toBe(false);
    expect(migrationConflictsResolved(plan, { 'item-a:system.activities': 'Keep' })).toBe(false);
    expect(migrationConflictsResolved(plan, {
      'item-a:system.activities': 'Keep',
      'item-a:effects': 'Cancel',
    })).toBe(false);
    expect(migrationConflictsResolved(plan, {
      'item-a:system.activities': 'Keep',
      'item-a:effects': 'Overwrite',
    })).toBe(true);
  });

  test('registers a restricted ApplicationV2 GM menu on init and never scans Actors on ready', async () => {
    class FakeApplicationV2 {
      static DEFAULT_OPTIONS = {};
      async close(): Promise<void> {}
    }
    const onceCalls: Array<{ event: string; callback: () => void }> = [];
    let actorsTouched = false;
    const menus: Array<Record<string, unknown>> = [];
    const root = {
      Hooks: { once: (event: string, callback: () => void) => { onceCalls.push({ event, callback }); } },
      foundry: { applications: { api: { ApplicationV2: FakeApplicationV2 } } },
      game: {
        settings: { registerMenu: (_moduleId: string, _key: string, options: Record<string, unknown>) => menus.push(options) },
        get actors() { actorsTouched = true; throw new Error('ready-time Actor scan is forbidden'); },
      },
    } as Record<string, any>;

    registerBloodHunterRuntime(root);
    expect(onceCalls.map((entry) => entry.event)).toEqual(['init']);
    expect(actorsTouched).toBe(false);
    onceCalls[0]!.callback();
    expect(actorsTouched).toBe(false);
    expect(menus).toHaveLength(1);
    expect(menus[0]!.name).toBe('血猎手 2024：角色迁移');
    expect(menus[0]!.restricted).toBe(true);
    const menuType = menus[0]!.type as { prototype: unknown; DEFAULT_OPTIONS: Record<string, unknown> };
    expect(menuType.prototype).toBeInstanceOf(FakeApplicationV2);
    expect(menuType.DEFAULT_OPTIONS).toMatchObject({
      id: 'fvtt-blood-hunter-2024-migration',
      window: { title: '血猎手 2024：角色迁移', resizable: true },
      position: { width: 720, height: 'auto' },
    });
    expect(typeof (menuType.prototype as { _renderHTML?: unknown })._renderHTML).toBe('function');
    expect(typeof (menuType.prototype as { _replaceHTML?: unknown })._replaceHTML).toBe('function');
  });

  test('fails closed without making init fatal when ApplicationV2 or menu registration is unavailable', () => {
    const onceCalls: Array<() => void> = [];
    const errors: unknown[][] = [];
    const root = {
      Hooks: { once: (_event: string, callback: () => void) => { onceCalls.push(callback); } },
      console: { error: (...args: unknown[]) => errors.push(args) },
      game: { settings: { registerMenu: () => { throw new Error('must not register without a valid ApplicationV2'); } } },
    } as Record<string, any>;

    registerBloodHunterRuntime(root);
    expect(onceCalls).toHaveLength(1);
    expect(() => onceCalls[0]!()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(String(errors[0]![0])).toContain('ApplicationV2 was unavailable');
  });
});

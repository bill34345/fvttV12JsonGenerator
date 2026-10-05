import { afterAll, describe, expect, test } from 'bun:test';

const ownedGlobalNames = ['Element', 'HTMLElement', 'Hooks', 'CONFIG', 'game', 'canvas', 'ui', 'TokenDocument'] as const;
const originalGlobalDescriptors = new Map(ownedGlobalNames.map(name =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const));

afterAll(() => {
  for (const [name, descriptor] of originalGlobalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originalGlobalDescriptors.clear();
});

const hooks = new Map<string, (...args: any[]) => any>();
const errors: string[] = [];
const warnings: string[] = [];

class ElementStub {
  dataset: Record<string, string> = {};
  classList = { contains: (_name: string) => false };
  listeners = new Map<string, (event: any) => void>();
  tray?: ElementStub;
  movementTray?: ElementStub;
  querySelector(selector: string) {
    if (selector === 'div.status-effects') return this.tray ?? null;
    if (selector === 'div.palette[data-palette="movementActions"]') return this.movementTray ?? null;
    return null;
  }
  closest(selector: string) { return ['[data-status-id]', '[data-movement-action]'].includes(selector) ? this : null; }
  contains(_element: ElementStub) { return true; }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, listener); }
  dispatch(type: string, target: ElementStub, button: number) {
    let blocked = false;
    this.listeners.get(type)?.({
      type, button, currentTarget: this, target,
      preventDefault() { blocked = true; },
      stopImmediatePropagation() { blocked = true; },
    });
    return blocked;
  }
}

Object.assign(globalThis, {
  Element: ElementStub, HTMLElement: ElementStub,
  Hooks: { on: (name: string, fn: any) => hooks.set(name, fn), once: (name: string, fn: any) => hooks.set(name, fn) },
  CONFIG: {
    statusEffects: {
      exhaustion: { id: 'exhaustion', _id: 'dnd5eexhaustion' },
      poisoned: { id: 'poisoned', _id: 'dnd5epoisoned' },
    },
    DND5E: { conditionTypes: { exhaustion: { levels: 6 }, poisoned: {} } },
    Token: { movement: { actions: { fly: {} } } },
  },
  game: {
    user: { id: 'local' },
    modules: { get: () => null },
    settings: { get: () => true, register: () => undefined, set: async () => undefined },
    i18n: { localize: (key: string) => key },
  },
  canvas: { tokens: { controlled: [] as any[] }, scene: {} },
  ui: { notifications: { error: (message: string) => errors.push(message), warn: (message: string) => warnings.push(message) } },
});

await import('../src/index.ts');

function makeActor(id: string, level: number, editable = true) {
  const effects = new Map<string, any>();
  if (level) effects.set('dnd5eexhaustion', { system: { type: 'exhaustion', level } });
  const calls: Array<{ id: string; options: any }> = [];
  return {
    uuid: `Actor.${id}`, effects, calls, statuses: new Set<string>(),
    canUserModify: () => editable,
    async toggleStatusEffect(statusId: string, options: any) {
      calls.push({ id: statusId, options });
      if (statusId === 'exhaustion') {
        const now = effects.get('dnd5eexhaustion')?.system.level ?? 0;
        const next = Math.min(6, now + options.levels);
        if (next < 0) throw new Error('negative level at zero');
        if (next === 0) effects.delete('dnd5eexhaustion');
        else effects.set('dnd5eexhaustion', { system: { type: 'exhaustion', level: next } });
      } else if (options.active) this.statuses.add(statusId);
      else this.statuses.delete(statusId);
    },
  };
}

function setup(first: any, second: any) {
  const tokens = [first, second].map((actor, i) => ({
    name: String(i), actor,
    document: { uuid: `Scene.test.Token.${i}`, id: String(i), actor },
  }));
  (globalThis as any).canvas.tokens.controlled = tokens;
  const root = new ElementStub();
  const tray = new ElementStub();
  const movementTray = new ElementStub();
  root.tray = tray;
  root.movementTray = movementTray;
  hooks.get('renderTokenHUD')?.({ object: tokens[0], document: tokens[0]!.document, actor: first }, root);
  const icon = new ElementStub();
  icon.dataset.statusId = 'exhaustion';
  return { tray, movementTray, icon, tokens };
}

async function settled() { await Bun.sleep(0); await Bun.sleep(0); }

describe('native HUD capture for graded conditions', () => {
  test('rapid left clicks serialize one level per click on every selected Actor', async () => {
    const first = makeActor('first', 1);
    const second = makeActor('second', 3);
    const { tray, icon } = setup(first, second);
    expect(tray.dispatch('click', icon, 0)).toBe(true);
    expect(tray.dispatch('click', icon, 0)).toBe(true);
    await settled();
    expect([first, second].map((actor) => actor.effects.get('dnd5eexhaustion').system.level)).toEqual([3, 5]);
    expect([first.calls.length, second.calls.length]).toEqual([2, 2]);
  });

  test('contextmenu plus auxclick from one right gesture decrements once', async () => {
    const first = makeActor('right-first', 2);
    const second = makeActor('right-second', 4);
    const { tray, icon } = setup(first, second);
    expect(tray.dispatch('auxclick', icon, 1)).toBe(false);
    tray.dispatch('pointerdown', icon, 2);
    expect(tray.dispatch('contextmenu', icon, 2)).toBe(true);
    expect(tray.dispatch('auxclick', icon, 2)).toBe(true);
    await settled();
    expect([first, second].map((actor) => actor.effects.get('dnd5eexhaustion').system.level)).toEqual([1, 3]);
    tray.dispatch('pointerdown', icon, 2);
    tray.dispatch('auxclick', icon, 2);
    tray.dispatch('contextmenu', icon, 2);
    await settled();
    expect(first.effects.has('dnd5eexhaustion')).toBe(false);
    expect(second.effects.get('dnd5eexhaustion').system.level).toBe(2);
  });

  test('rejects uneditable selections before writes and ignores a changed local user', async () => {
    const first = makeActor('guard-first', 2);
    const second = makeActor('guard-second', 3, false);
    const { tray, icon } = setup(first, second);
    expect(tray.dispatch('click', icon, 0)).toBe(true);
    await settled();
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
    second.canUserModify = () => true;
    tray.dispatch('click', icon, 0);
    (globalThis as any).game.user.id = 'other-client';
    await settled();
    expect(first.calls).toEqual([]);
    (globalThis as any).game.user.id = 'local';
  });

  test('ordinary status keeps its existing hook path and programmatic effect updates do not sync', async () => {
    const first = makeActor('binary-first', 0);
    const second = makeActor('binary-second', 0);
    const { tray, icon } = setup(first, second);
    icon.dataset.statusId = 'poisoned';
    expect(tray.dispatch('click', icon, 0)).toBe(false);
    const effect = { target: first, parent: first, statuses: new Set(['poisoned']) };
    hooks.get('preCreateActiveEffect')?.(effect, {}, {}, 'local');
    hooks.get('createActiveEffect')?.(effect, {}, 'local');
    await settled();
    expect(second.calls).toEqual([{ id: 'poisoned', options: { active: true, overlay: false } }]);
    const before = second.calls.length;
    hooks.get('createActiveEffect')?.(effect, {}, 'other-client');
    hooks.get('updateActiveEffect')?.(effect, {}, {}, 'local');
    await settled();
    expect(second.calls).toHaveLength(before);
    expect(errors).toEqual([]);
  });

  test('movement still updates only selected TokenDocument movementAction fields', async () => {
    const first = makeActor('move-first', 0);
    const second = makeActor('move-second', 0);
    const { movementTray, tokens } = setup(first, second);
    const action = new ElementStub();
    action.dataset.movementAction = 'fly';
    const calls: any[] = [];
    (globalThis as any).TokenDocument = {
      updateDocuments: async (updates: any[], options: any) => { calls.push({ updates, options }); },
    };
    expect(movementTray.dispatch('click', action, 0)).toBe(false);
    expect(hooks.get('preUpdateToken')?.(tokens[0]!.document, { movementAction: 'fly' }, {}, 'local')).toBe(false);
    await settled();
    expect(calls).toHaveLength(1);
    expect(calls[0].updates).toEqual([{ _id: '0', movementAction: 'fly' }, { _id: '1', movementAction: 'fly' }]);
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual([]);
  });
});

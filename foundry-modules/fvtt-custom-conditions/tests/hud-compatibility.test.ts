import { describe, expect, test } from 'bun:test';
import {
  buildConditionFlag,
  CUSTOM_CONDITION_IDS,
  createConditionInstance,
  projectedConditionStatusId,
} from '@fvtt-json-generator/contracts/conditions';
import { decorateConditionHud } from '../src/hud.ts';
import { registerConditionMappings, ConditionRuntime } from '../src/runtime.ts';

function conditionEffect(conditionId: 'dazed' | 'shocked' | 'burning' | 'jinxed' | 'valor', formula?: string, disabled = false): any {
  const instance = createConditionInstance(conditionId, conditionId === 'burning'
    ? { formula: formula ?? '1d6', damageType: 'fire' } : formula ? { formula } : {});
  return {
    id: `${conditionId}-${formula ?? 'plain'}`,
    name: conditionId,
    disabled,
    statuses: conditionId === 'dazed' ? ['dazed'] : conditionId === 'shocked' ? ['shocked', 'dazed', 'defenseless'] : [conditionId],
    flags: buildConditionFlag(instance),
  };
}

function actor(id: string, effects: any[] = []): any {
  const data: any = { id, uuid: `Actor.${id}`, name: id, documentName: 'Actor', effects, flags: {} };
  return {
    ...data,
    async createEmbeddedDocuments(_type: string, entries: any[]) {
      const created = entries.map((entry, index) => ({ ...structuredClone(entry), id: `${id}-created-${index}`, parent: this }));
      data.effects.push(...created);
      this.effects = data.effects;
      return created;
    },
    async updateEmbeddedDocuments(_type: string, updates: any[]) {
      for (const update of updates) Object.assign(data.effects.find((entry: any) => entry.id === update._id) ?? {}, update);
      return data.effects;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      data.effects = data.effects.filter((entry: any) => !ids.includes(entry.id));
      this.effects = data.effects;
      return [];
    },
  };
}

function globalsFor(options: { user?: any; activeGM?: any; statuses?: any[]; hooks?: any; modules?: any } = {}): any {
  const user = options.user ?? { id: 'gm', isGM: true, active: true };
  const activeGM = options.activeGM ?? user;
  const hooks = options.hooks ?? { on: () => 'hook', off: () => {} };
  return {
    game: {
      user,
      users: { activeGM },
      i18n: { localize: (key: string) => key },
      modules: { get: (id: string) => options.modules?.[id] },
    },
    CONFIG: { statusEffects: options.statuses ?? [], DND5E: { conditionEffects: { noMovement: new Set(), halfMovement: new Set() } } },
    Hooks: hooks,
    ui: { notifications: { warn: () => {} } },
    console: { error: () => {} },
  };
}

function hudAction(statusId: string): any {
  return { name: statusId.split('.').at(-1), system: { actionType: 'condition', actionId: statusId }, tooltip: 'before' };
}

function createFoundryHooksClass(): any {
  return class FoundryHooks {
    static callbacks = new Map<string, Array<(...args: any[]) => void>>();

    static on(name: string, callback: (...args: any[]) => void): (...args: any[]) => void {
      const callbacks = this.callbacks.get(name) ?? [];
      callbacks.push(callback);
      this.callbacks.set(name, callbacks);
      return callback;
    }

    static callAll(name: string, ...args: any[]): void {
      for (const callback of this.callbacks.get(name) ?? []) callback(...args);
    }
  };
}

describe('Custom Conditions TAH compatibility', () => {
  test('registers a separate Custom Dazed status and projects new Dazed/Shocked tags through the shared ID helper', async () => {
    const foreign = { id: 'dazed', name: 'Foreign Dazed', reference: 'other-module' };
    const globals = globalsFor({ statuses: [foreign] });
    registerConditionMappings(globals);

    const custom = globals.CONFIG.statusEffects.find((entry: any) => entry.id === projectedConditionStatusId('dazed'));
    expect(globals.CONFIG.statusEffects.find((entry: any) => entry.id === 'dazed')).toBe(foreign);
    // The namespace keeps this separate from foreign Dazed; the HUD shows a plain title.
    expect(custom).toMatchObject({
      id: 'fvtt-custom-conditions.dazed',
      name: 'Dazed',
      hud: false,
      img: 'modules/fvtt-custom-conditions/icons/dazed.svg',
      flags: { 'fvtt-custom-conditions': { owned: true } },
    });

    const target = actor('target');
    const runtime = new ConditionRuntime(globals, () => true);
    const dazed = await runtime.apply(target, 'dazed', {});
    const shocked = await runtime.apply(actor('shocked-target'), 'shocked', {});
    expect(dazed.statuses).toEqual([projectedConditionStatusId('dazed')]);
    expect(dazed.flags['fvtt-custom-conditions'].condition.conditionId).toBe('dazed');
    expect(shocked.statuses).toEqual(['shocked', 'dazed', 'defenseless'].map((id) => projectedConditionStatusId(id as 'shocked' | 'dazed' | 'defenseless')));
    expect(shocked.flags['fvtt-custom-conditions'].condition.conditionId).toBe('shocked');
  });

  test('registers a distinct Custom Burning HUD action without changing native Burning, and projects new effects', async () => {
    const native = { id: 'burning', label: 'Native Burning', img: 'systems/dnd5e/icons/svg/statuses/burning.svg' };
    const globals = globalsFor({ statuses: [native] });
    globals.game.i18n.localize = (key: string) => key === 'FVTTCONDITIONS.Condition.burning.StatusName' || key === 'FVTTCONDITIONS.Condition.burning.Name' ? '灼烧' : key;
    registerConditionMappings(globals);

    expect(globals.CONFIG.statusEffects.find((status: any) => status.id === 'burning')).toBe(native);
    const custom = globals.CONFIG.statusEffects.find((status: any) => status.id === projectedConditionStatusId('burning'));
    expect(custom).toMatchObject({
      id: 'fvtt-custom-conditions.burning', name: '灼烧', hud: false,
      img: 'modules/fvtt-custom-conditions/icons/burning.svg',
      flags: { 'fvtt-custom-conditions': { owned: true } },
    });
    const target = actor('burning-target');
    const runtime = new ConditionRuntime(globals, () => true);
    const created = await runtime.apply(target, 'burning', { formula: '1d6', damageType: 'fire' });
    expect(created.statuses).toEqual([projectedConditionStatusId('burning')]);
    expect(created.flags['fvtt-custom-conditions'].condition).toMatchObject({
      conditionId: 'burning', params: { formula: '1d6', damageType: 'fire' },
    });
    expect(native).toEqual({ id: 'burning', label: 'Native Burning', img: 'systems/dnd5e/icons/svg/statuses/burning.svg' });
    // Installed TAH D&D5e 2.1.1 enumerates CONFIG.statusEffects by ID and
    // does not filter on hud; Foundry's native Token HUD does use hud:false.
    const tahActions = globals.CONFIG.statusEffects.filter((status: any) => status.id !== '')
      .map((status: any) => hudAction(status.id));
    expect(tahActions.map((action: any) => action.system.actionId)).toContain(projectedConditionStatusId('burning'));
    custom.hud = true;
    registerConditionMappings(globals);
    expect(custom.hud).toBe(false);
    expect(globals.CONFIG.statusEffects.find((status: any) => status.id === 'burning')).toBe(native);
  });

  test('registers all 19 separate owned HUD statuses while leaving bare native IDs untouched', () => {
    const native = ['bleeding', 'burning', 'dazed'].map((id) => ({ id, name: `Native ${id}` }));
    const globals = globalsFor({ statuses: native });
    globals.game.i18n.localize = (key: string) => key === 'FVTTCONDITIONS.Condition.bleeding.Name' ? '流血' : key;
    registerConditionMappings(globals);
    for (const conditionId of CUSTOM_CONDITION_IDS) {
      const own = globals.CONFIG.statusEffects.find((entry: any) => entry.id === projectedConditionStatusId(conditionId));
      expect(own).toMatchObject({ hud: false, flags: { 'fvtt-custom-conditions': { owned: true } } });
    }
    expect(globals.CONFIG.statusEffects.filter((entry: any) => entry.flags?.['fvtt-custom-conditions']?.owned)).toHaveLength(19);
    expect(globals.CONFIG.statusEffects.filter((entry: any) => native.includes(entry))).toEqual(native);
    expect(globals.CONFIG.statusEffects.find((entry: any) => entry.id === projectedConditionStatusId('bleeding')).name).toBe('流血');
  });

  test('all five parameterized HUD actions open the pinned Actor manager and never apply defaults', async () => {
    const parameterized = ['bleeding', 'burning', 'frozen', 'jinxed', 'valor'] as const;
    for (const conditionId of parameterized) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const target = actor(`hud-${conditionId}`);
      const unrelated = actor('targeted-elsewhere');
      const opened: any[] = [];
      const applied: any[] = [];
      const globals = globalsFor({ hooks, modules: {
        'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
        'fvtt-custom-conditions': { api: {
          openManager: async (context: any) => { opened.push(context); },
          apply: (...args: any[]) => { applied.push(args); },
        } },
      } });
      globals.game.user.targets = new Set([{ actor: unrelated }]);
      registerConditionMappings(globals);
      const host: any = {
        hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
        addRollHandlerExtender(extender: any) { this.extender = extender; },
      };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = hudAction(projectedConditionStatusId(conditionId));
      expect(host.extender.prehandleActionEvent()).toBe(true);
      await Promise.resolve();
      expect(opened).toEqual([{ actor: target, conditionId }]);
      expect(applied).toEqual([]);
    }
  });

  test('all 14 parameterless HUD actions apply through the CC API, never a native toggle', async () => {
    const parameterized = new Set(['bleeding', 'burning', 'frozen', 'jinxed', 'valor']);
    const staticIds = CUSTOM_CONDITION_IDS.filter((id) => !parameterized.has(id));
    expect(staticIds).toHaveLength(14);
    for (const conditionId of staticIds) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const target = actor(`hud-${conditionId}`);
      const calls: any[] = [];
      const api = {
        list: () => [],
        apply: async (...args: any[]) => { calls.push(args); },
        setEnabled: async () => { throw new Error('unexpected toggle'); },
      };
      const globals = globalsFor({ hooks, modules: {
        'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
        'fvtt-custom-conditions': { api },
      } });
      registerConditionMappings(globals);
      const host: any = {
        hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
        addRollHandlerExtender(extender: any) { this.extender = extender; },
      };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = hudAction(projectedConditionStatusId(conditionId));
      expect(host.extender.prehandleActionEvent()).toBe(true);
      await Bun.sleep(0);
      expect(calls).toEqual([[target, conditionId, {}]]);
      for (const native of ['bleeding', 'burning', 'dazed']) {
        host.extender.action = hudAction(native);
        expect(host.extender.prehandleActionEvent()).toBe(false);
      }
      expect(calls).toHaveLength(1);
    }
  });

  test('marks namespaced Burning active for legacy flagged effects, never for native unflagged Burning', () => {
    const globals = globalsFor({ statuses: [{ id: 'burning', label: 'Native Burning' }] });
    registerConditionMappings(globals);
    const legacy = actor('legacy-burning', [conditionEffect('burning')]);
    legacy.effects[0].name = '燃烧';
    globals.game.i18n.localize = (key: string) => key === 'FVTTCONDITIONS.Condition.burning.Name' ? '灼烧' : key;
    const runtime = new ConditionRuntime(globals, () => true);
    expect(runtime.list(legacy).map((entry) => entry.instance.conditionId)).toEqual(['burning']);
    expect(runtime.list(legacy)[0]?.name).toBe('灼烧');
    legacy.effects[0].name = '烈焰烙印';
    expect(runtime.list(legacy)[0]?.name).toBe('烈焰烙印');
    expect(legacy.effects[0].statuses).toEqual(['burning']);
    const ownedAction = hudAction(projectedConditionStatusId('burning'));
    decorateConditionHud({ groups: [{ actions: [ownedAction] }] }, globals, { actor: legacy, token: { actor: legacy } });
    expect(ownedAction.cssClass).toContain('active');
    expect(ownedAction.tooltip.content).toContain('1d6');
    expect(ownedAction.tooltip.content).toContain('fire');

    const native = actor('native-burning', [{ id: 'native', statuses: ['burning'], flags: {}, disabled: false }]);
    const inactiveAction = hudAction(projectedConditionStatusId('burning'));
    const nativeAction = hudAction('burning');
    decorateConditionHud({ groups: [{ actions: [inactiveAction, nativeAction] }] }, globals, { actor: native, token: { actor: native } });
    expect(inactiveAction.cssClass).not.toContain('active');
    expect(nativeAction.tooltip).toBe('before');
    expect(nativeAction.cssClass).toBeUndefined();
    legacy.effects[0].disabled = true;
    decorateConditionHud({ groups: [{ actions: [ownedAction] }] }, globals, { actor: legacy, token: { actor: legacy } });
    expect(ownedAction.cssClass).not.toContain('active');
    legacy.effects[0].disabled = false;
    decorateConditionHud({ groups: [{ actions: [ownedAction] }] }, globals, { actor: legacy, token: { actor: legacy } });
    expect(ownedAction.cssClass).toContain('active');
    legacy.effects.length = 0;
    decorateConditionHud({ groups: [{ actions: [ownedAction] }] }, globals, { actor: legacy, token: { actor: legacy } });
    expect(ownedAction.cssClass).not.toContain('active');
  });

  test('continues reading legacy owned Dazed/Shocked flags without rewriting any legacy or foreign effect', () => {
    const legacyDazed = conditionEffect('dazed');
    const legacyShocked = conditionEffect('shocked');
    const foreign = { id: 'foreign-dazed', statuses: ['dazed'], name: 'Foreign Dazed', flags: {} };
    const target = actor('legacy', [legacyDazed, legacyShocked, foreign]);
    const before = structuredClone(target.effects.map((effect: any) => effect.statuses));
    const runtime = new ConditionRuntime(globalsFor(), () => true);

    expect(runtime.list(target).map((entry) => entry.instance.conditionId)).toEqual(['dazed', 'shocked']);
    expect(target.effects.map((effect: any) => effect.statuses)).toEqual(before);

    const globals = globalsFor();
    registerConditionMappings(globals);
    const customAction = hudAction(projectedConditionStatusId('dazed'));
    decorateConditionHud({ groups: [{ actions: [customAction] }] }, globals, {
      actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }],
    });
    expect(customAction.cssClass).toContain('active');

    const foreignOnly = actor('foreign-only', [{ id: 'foreign', statuses: ['dazed'], flags: {}, disabled: false }]);
    const inactiveCustomAction = hudAction(projectedConditionStatusId('dazed'));
    decorateConditionHud({ groups: [{ actions: [inactiveCustomAction] }] }, globals, {
      actor: foreignOnly, token: { actor: foreignOnly }, actors: [foreignOnly], tokens: [{ actor: foreignOnly }],
    });
    expect(inactiveCustomAction.cssClass).not.toContain('active');
  });

  test('marks direct and composite child statuses active from enabled flags, then clears stale classes', () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const target = actor('composite', [conditionEffect('shocked')]);
    const ids = ['shocked', 'dazed', 'defenseless'] as const;
    const actions = ids.map((id) => hudAction(projectedConditionStatusId(id)));
    const hud = { groups: [{ actions }] };
    const manager = { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] };
    decorateConditionHud(hud, globals, manager);
    for (const action of actions) expect(action.cssClass).toContain('active');
    target.effects[0].disabled = true;
    decorateConditionHud(hud, globals, manager);
    for (const action of actions) expect(action.cssClass).not.toContain('active');
    target.effects[0].disabled = false;
    target.effects[0].isSuppressed = true;
    decorateConditionHud(hud, globals, manager);
    for (const action of actions) expect(action.cssClass).not.toContain('active');
    target.effects[0].isSuppressed = false;
    decorateConditionHud(hud, globals, manager);
    for (const action of actions) expect(action.cssClass).toContain('active');
    target.effects.length = 0;
    decorateConditionHud(hud, globals, manager);
    for (const action of actions) expect(action.cssClass).not.toContain('active');
  });

  test('a composite-only child click warns about the actual source instead of applying a duplicate', async () => {
    const hooks = createFoundryHooksClass();
    class FakeRollHandlerExtender {}
    const target = actor('composite-only', [conditionEffect('shocked')]);
    const calls: any[] = [];
    const warnings: string[] = [];
    const globals = globalsFor({ hooks, modules: {
      'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
      'fvtt-custom-conditions': { api: {
        list: () => [], apply: async (...args: any[]) => { calls.push(args); }, setEnabled: async () => {},
      } },
    } });
    globals.ui.notifications.warn = (message: string) => warnings.push(message);
    registerConditionMappings(globals);
    const host: any = {
      hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
      addRollHandlerExtender(extender: any) { this.extender = extender; },
    };
    hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
    host.extender.action = hudAction(projectedConditionStatusId('dazed'));
    expect(host.extender.prehandleActionEvent()).toBe(true);
    await Bun.sleep(0);
    expect(calls).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('Shocked')]);
  });

  test('routes only the namespaced click to the exact selected Actor through the public CC API', async () => {
    const hooks = createFoundryHooksClass();
    class FakeRollHandlerExtender {}
    const target = actor('synthetic-target');
    const worldActor = actor('base-world-actor');
    const calls: any[] = [];
    const api = {
      list: () => [],
      apply: async (...args: any[]) => { calls.push(['apply', ...args]); },
      remove: async (...args: any[]) => { calls.push(['remove', ...args]); },
      setEnabled: async (...args: any[]) => { calls.push(['setEnabled', ...args]); },
    };
    const globals = globalsFor({
      hooks,
      modules: {
        'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
        'fvtt-custom-conditions': { api },
      },
    });
    registerConditionMappings(globals);
    const rollHandler = {
      hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
      addRollHandlerExtender(extender: any) { this.extender = extender; },
      extender: undefined as any,
    };
    hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(rollHandler);
    rollHandler.extender.action = { system: { actionType: 'condition', actionId: projectedConditionStatusId('dazed') } };
    expect(rollHandler.extender.hudManager).toBe(rollHandler.hudManager);
    expect(rollHandler.extender.prehandleActionEvent({}, 'unused', 'public')).toBe(true);
    await Promise.resolve();
    expect(calls).toEqual([['apply', target, 'dazed', {}]]);
    expect(calls[0]?.[1]).not.toBe(worldActor);

    rollHandler.extender.action = { system: { actionType: 'condition', actionId: 'dazed' } };
    expect(rollHandler.extender.prehandleActionEvent({}, 'unused', 'public')).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test('consumes only owned Custom Burning clicks and opens its manager for the exact HUD Actor', async () => {
    const hooks = createFoundryHooksClass();
    class FakeRollHandlerExtender {}
    const target = actor('hud-actor');
    const unrelated = actor('targeted-elsewhere');
    const opened: any[] = [];
    const applied: any[] = [];
    const globals = globalsFor({
      hooks,
      modules: {
        'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
        'fvtt-custom-conditions': { api: {
          openManager: async (context: any) => { opened.push(context); },
          apply: (...args: any[]) => { applied.push(args); },
        } },
      },
    });
    globals.game.user.targets = new Set([{ actor: unrelated }]);
    registerConditionMappings(globals);
    const host: any = {
      hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
      addRollHandlerExtender(extender: any) { this.extender = extender; },
    };
    hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
    host.extender.action = hudAction(projectedConditionStatusId('burning'));
    expect(host.extender.prehandleActionEvent()).toBe(true);
    await Promise.resolve();
    expect(opened).toEqual([{ actor: target, conditionId: 'burning' }]);
    expect(applied).toEqual([]);
    host.extender.action = hudAction('burning');
    expect(host.extender.prehandleActionEvent()).toBe(false);
    expect(opened).toHaveLength(1);
    const registered = globals.CONFIG.statusEffects.find((entry: any) => entry.id === projectedConditionStatusId('burning'));
    registered.flags['fvtt-custom-conditions'].owned = false;
    host.extender.action = hudAction(projectedConditionStatusId('burning'));
    expect(host.extender.prehandleActionEvent()).toBe(false);
  });

  test('consumes Custom Burning clicks for non-GM or ambiguous HUD selection without applying a parameterless effect', () => {
    for (const [isGM, multiple] of [[false, false], [true, true]] as const) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const target = actor('hud-actor');
      const opened: any[] = [];
      const warnings: string[] = [];
      const user = { id: isGM ? 'gm' : 'player', isGM, active: true };
      const globals = globalsFor({
        user, activeGM: { id: 'gm', isGM: true, active: true }, hooks,
        modules: {
          'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
          'fvtt-custom-conditions': { api: { openManager: (...args: any[]) => opened.push(args) } },
        },
      });
      globals.ui.notifications.warn = (message: string) => warnings.push(message);
      registerConditionMappings(globals);
      const host: any = {
        hudManager: multiple
          ? { actor: null, token: null, actors: [target, actor('other')], tokens: [{}, {}] }
          : { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
        addRollHandlerExtender(extender: any) { this.extender = extender; },
      };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = hudAction(projectedConditionStatusId('burning'));
      expect(host.extender.prehandleActionEvent()).toBe(true);
      expect(opened).toEqual([]);
      expect(warnings).toHaveLength(1);
    }
  });

  test('disables one enabled Dazed, reenables a disabled instance, and consumes ambiguous/non-GM clicks safely', async () => {
    async function clickWith(entries: any[], manager: any, isGM = true) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const target = actor('target');
      const calls: any[] = [];
      const warnings: string[] = [];
      let refreshes = 0;
      const api = {
        list: () => entries,
        apply: async (...args: any[]) => { calls.push(['apply', ...args]); },
        remove: async (...args: any[]) => { calls.push(['remove', ...args]); },
        setEnabled: async (...args: any[]) => {
          calls.push(['setEnabled', ...args]);
          const effect = conditionEffect('dazed');
          effect.parent = args[0];
          hooks.callAll('updateActiveEffect', effect);
        },
      };
      const user = { id: isGM ? 'gm' : 'player', isGM, active: true };
      const globals = globalsFor({
        user,
        activeGM: { id: 'gm', isGM: true, active: true },
        hooks,
        modules: {
          'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
          'fvtt-custom-conditions': { api },
        },
      });
      globals.ui.notifications.warn = (message: string) => warnings.push(message);
      globals.game.tokenActionHud = { isControlledActor: (candidate: any) => candidate === target };
      hooks.on('forceUpdateTokenActionHud', () => { refreshes += 1; });
      registerConditionMappings(globals);
      const host: any = { hudManager: manager(target), addRollHandlerExtender(extender: any) { this.extender = extender; } };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = { system: { actionType: 'condition', actionId: projectedConditionStatusId('dazed') } };
      expect(host.extender.prehandleActionEvent({}, 'unused', 'public')).toBe(true);
      await Promise.resolve();
      return { calls, warnings, refreshes };
    }

    const enabled = await clickWith([{ id: 'active', disabled: false, instance: { conditionId: 'dazed' } }], (target: any) => ({ actor: target, token: { actor: target } }));
    expect(enabled.calls).toEqual([['setEnabled', expect.anything(), 'active', false]]);
    expect(enabled.refreshes).toBe(1);
    const disabled = await clickWith([{ id: 'disabled', disabled: true, instance: { conditionId: 'dazed' } }], (target: any) => ({ actor: target, token: { actor: target } }));
    expect(disabled.calls).toEqual([['setEnabled', expect.anything(), 'disabled', true]]);
    expect(disabled.refreshes).toBe(1);
    const ambiguous = await clickWith([], () => ({ actor: null, token: null, actors: [actor('one'), actor('two')], tokens: [{}, {}] }));
    expect(ambiguous.calls).toEqual([]);
    const nonGM = await clickWith([], (target: any) => ({ actor: target, token: { actor: target } }), false);
    expect(nonGM.calls).toEqual([]);
    const duplicates = await clickWith([
      { id: 'source-a', disabled: false, instance: { conditionId: 'dazed' } },
      { id: 'source-b', disabled: false, instance: { conditionId: 'dazed' } },
    ], (target: any) => ({ actor: target, token: { actor: target } }));
    expect(duplicates.calls).toEqual([]);
    expect(duplicates.warnings).toContain('Multiple Custom Dazed instances found. Manage them in the Custom Conditions panel.');
  });

  test('routes only owned Shocked through the public API, preserving foreign effects and toggling the same composite effect', async () => {
    const hooks = createFoundryHooksClass();
    class FakeRollHandlerExtender {}
    const foreign = { id: 'foreign-shocked', statuses: ['shocked'], flags: {}, disabled: false };
    const target = actor('shocked-target', [foreign]);
    const runtime = new ConditionRuntime(globalsFor(), () => true);
    const calls: any[] = [];
    let pending: Promise<unknown> = Promise.resolve();
    const api = {
      list: (selected: any) => runtime.list(selected),
      apply: (...args: any[]) => {
        calls.push(['apply', ...args]);
        pending = runtime.apply(args[0], args[1], args[2]);
        return pending;
      },
      setEnabled: (...args: any[]) => {
        calls.push(['setEnabled', ...args]);
        pending = runtime.setEnabled(args[0], args[1], args[2]);
        return pending;
      },
    };
    const globals = globalsFor({
      hooks,
      modules: {
        'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
        'fvtt-custom-conditions': { api },
      },
    });
    registerConditionMappings(globals);
    const warnings: string[] = [];
    globals.ui.notifications.warn = (message: string) => warnings.push(message);
    const host: any = {
      hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
      addRollHandlerExtender(extender: any) { this.extender = extender; },
    };
    hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
    const click = async (statusId: string): Promise<boolean> => {
      host.extender.action = { system: { actionType: 'condition', actionId: statusId } };
      const consumed = host.extender.prehandleActionEvent();
      await pending;
      return consumed;
    };

    expect(await click(projectedConditionStatusId('shocked'))).toBe(true);
    expect(calls).toEqual([['apply', target, 'shocked', {}]]);
    expect(target.effects).toHaveLength(2);
    const custom = target.effects[1];
    expect(custom.statuses).toEqual(['shocked', 'dazed', 'defenseless'].map((id) => projectedConditionStatusId(id as 'shocked' | 'dazed' | 'defenseless')));
    expect(custom.flags['fvtt-custom-conditions'].condition.conditionId).toBe('shocked');
    expect(target.effects[0]).toBe(foreign);

    expect(await click(projectedConditionStatusId('shocked'))).toBe(true);
    expect(calls[1]).toEqual(['setEnabled', target, custom.id, false]);
    expect(custom.disabled).toBe(true);
    expect(await click(projectedConditionStatusId('shocked'))).toBe(true);
    expect(calls[2]).toEqual(['setEnabled', target, custom.id, true]);
    expect(custom.disabled).toBe(false);
    expect(target.effects).toHaveLength(2);
    expect(target.effects[0]).toBe(foreign);

    expect(await click('dazed')).toBe(false);
    expect(await click('sickened')).toBe(false);
    expect(calls).toHaveLength(3);
    const shockedStatus = globals.CONFIG.statusEffects.find((status: any) => status.id === projectedConditionStatusId('shocked'));
    shockedStatus.flags['fvtt-custom-conditions'].owned = false;
    expect(await click(projectedConditionStatusId('shocked'))).toBe(false);
    expect(calls).toHaveLength(3);
    shockedStatus.flags['fvtt-custom-conditions'].owned = true;

    target.effects.push({ ...conditionEffect('shocked'), origin: 'Item.other-source' });
    expect(await click(projectedConditionStatusId('shocked'))).toBe(true);
    expect(calls).toHaveLength(3);
    expect(warnings).toContain('Multiple Custom Shocked instances found. Manage them in the Custom Conditions panel.');
  });

  test('serializes rapid parameterless clicks before reading the next state', async () => {
    for (const conditionId of ['dazed', 'shocked', 'addled'] as const) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const target = actor(`${conditionId}-target`);
      const entries: any[] = [];
      const calls: string[] = [];
      let releaseFirstWrite!: () => void;
      const firstWrite = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
      const api = {
        list: () => entries,
        apply: async () => {
          calls.push('apply');
          await firstWrite;
          entries.push({ id: 'owned', disabled: false, instance: { conditionId } });
        },
        setEnabled: async (_actor: any, _id: string, enabled: boolean) => {
          calls.push('setEnabled');
          entries[0].disabled = !enabled;
        },
      };
      const globals = globalsFor({
        hooks,
        modules: {
          'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
          'fvtt-custom-conditions': { api },
        },
      });
      registerConditionMappings(globals);
      const host: any = {
        hudManager: { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
        addRollHandlerExtender(extender: any) { this.extender = extender; },
      };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = { system: { actionType: 'condition', actionId: projectedConditionStatusId(conditionId) } };

      expect(host.extender.prehandleActionEvent()).toBe(true);
      expect(host.extender.prehandleActionEvent()).toBe(true);
      await Promise.resolve();
      expect(calls).toEqual(['apply']);
      expect(entries).toHaveLength(0);

      releaseFirstWrite();
      await Bun.sleep(0);
      expect(calls).toEqual(['apply', 'setEnabled']);
      expect(entries).toMatchObject([{ id: 'owned', disabled: true, instance: { conditionId } }]);
    }
  });

  test('consumes Shocked clicks without fall-through when the GM or selected Actor is unsafe', () => {
    for (const [isGM, multiple] of [[false, false], [true, true]] as const) {
      const hooks = createFoundryHooksClass();
      class FakeRollHandlerExtender {}
      const user = { id: isGM ? 'gm' : 'player', isGM, active: true };
      const calls: any[] = [];
      const globals = globalsFor({
        user, activeGM: { id: 'gm', isGM: true, active: true }, hooks,
        modules: {
          'token-action-hud-core': { api: { RollHandlerExtender: FakeRollHandlerExtender } },
          'fvtt-custom-conditions': { api: { list: () => [], apply: () => calls.push('apply'), setEnabled: () => calls.push('setEnabled') } },
        },
      });
      registerConditionMappings(globals);
      const target = actor('target');
      const host: any = {
        hudManager: multiple
          ? { actor: null, token: null, actors: [target, actor('other')], tokens: [{}, {}] }
          : { actor: target, token: { actor: target }, actors: [target], tokens: [{ actor: target }] },
        addRollHandlerExtender(extender: any) { this.extender = extender; },
      };
      hooks.callbacks.get('tokenActionHudCoreAddRollHandlerExtenders')![0]!(host);
      host.extender.action = { system: { actionType: 'condition', actionId: projectedConditionStatusId('shocked') } };
      expect(host.extender.prehandleActionEvent()).toBe(true);
      expect(calls).toEqual([]);
    }
  });

  test('refreshes TAH only for relevant owned effect updates on its controlled Actor', () => {
    const hooks = createFoundryHooksClass();
    const target = actor('controlled');
    const other = actor('other');
    const globals = globalsFor({ hooks });
    let refreshes = 0;
    globals.game.tokenActionHud = { isControlledActor: (candidate: any) => candidate === target };
    hooks.on('forceUpdateTokenActionHud', () => { refreshes += 1; });
    registerConditionMappings(globals);

    hooks.callAll('updateActiveEffect', { parent: target, flags: {} });
    hooks.callAll('updateActiveEffect', {
      parent: target,
      flags: buildConditionFlag(createConditionInstance('sickened', {})),
    });
    const uncontrolledJinxed = conditionEffect('jinxed', '1d6');
    uncontrolledJinxed.parent = other;
    hooks.callAll('updateActiveEffect', uncontrolledJinxed);
    expect(refreshes).toBe(1);

    const controlledJinxed = conditionEffect('jinxed', '2d6');
    controlledJinxed.parent = target;
    hooks.callAll('updateActiveEffect', controlledJinxed);
    expect(refreshes).toBe(2);
    hooks.callAll('createActiveEffect', controlledJinxed);
    hooks.callAll('deleteActiveEffect', controlledJinxed);
    expect(refreshes).toBe(4);
  });

  test('keeps a disabled dice condition disabled when its formula is edited', async () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const disabledEffect = conditionEffect('jinxed', '1d6', true);
    const target = actor('disabled-jinxed', [disabledEffect]);
    const runtime = new ConditionRuntime(globals, () => true);

    await runtime.update(target, disabledEffect.id, 'jinxed', { formula: '1d4' });

    expect(target.effects[0]?.disabled).toBe(true);
    expect(target.effects[0]?.flags['fvtt-custom-conditions'].condition).toMatchObject({
      conditionId: 'jinxed', enabled: false, params: { formula: '1d4' },
    });
    const action = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [action] }] }, globals, {
      actor: target, token: { actor: target }, setting: { tooltips: 'full' },
    });
    expect(action.info1).toBeUndefined();
  });

  test('shows safe formula badges for enabled Jinxed/Valor on the selected token Actor only', () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const baseActor = actor('base', [conditionEffect('jinxed', '1d4')]);
    globals.game.actors = { get: () => baseActor };
    const linkedActor = actor('linked', [conditionEffect('jinxed', '1d6'), conditionEffect('valor', '1d4')]);
    const linkedJinxed = hudAction(projectedConditionStatusId('jinxed'));
    const linkedValor = hudAction(projectedConditionStatusId('valor'));
    decorateConditionHud({ groups: [{ actions: [linkedJinxed, linkedValor] }] }, globals, {
      actor: linkedActor, token: { actor: linkedActor }, actors: [linkedActor], tokens: [{ actor: linkedActor }], setting: { tooltips: 'full' },
    });
    expect(linkedJinxed.info1).toMatchObject({ title: '', class: 'fvtt-custom-conditions-dice-face' });
    expect(linkedJinxed.info1.icon).toContain('aria-label="Jinxed: 1d6">6</span>');
    expect(linkedValor.info1.icon).toContain('aria-label="Valor: 1d4">4</span>');
    expect(linkedJinxed.tooltip.content).toContain('Jinxed:</strong> 1d6');
    expect(linkedValor.tooltip.content).toContain('Valor:</strong> 1d4');
    expect(linkedJinxed.tooltip.content).toMatch(/<section class="description"><p>.*<\/p><p class="fvtt-custom-conditions-formula"><strong>Jinxed:<\/strong> 1d6<\/p><\/section><\/section>$/);

    const syntheticActor = actor('synthetic', [conditionEffect('jinxed', '2d6 + 3')]);
    const unlinkedAction = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [unlinkedAction] }] }, globals, {
      actor: null, token: { actor: syntheticActor }, actors: [syntheticActor], tokens: [{ actor: syntheticActor }], setting: { tooltips: 'full' },
    });
    expect(unlinkedAction.info1.icon).toContain('2d6+3</span>');
    expect(unlinkedAction.tooltip.content).toContain('Jinxed:</strong> 2d6 + 3');
    expect(unlinkedAction.tooltip.content).not.toContain('1d4');
    expect(unlinkedAction.info1.icon).not.toContain('aria-label="Jinxed: 1d4"');

    const nameOnlyAction = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [nameOnlyAction] }] }, globals, {
      actor: linkedActor, token: { actor: linkedActor }, setting: { tooltips: 'nameOnly' },
    });
    expect(nameOnlyAction.tooltip).toEqual({ content: 'jinxed' });
    expect(nameOnlyAction.info1.title).toBe('');
    expect(nameOnlyAction.info1.icon).toContain('aria-label="Jinxed: 1d6"');
  });

  test('fills TAH Core empty info1 slots and refreshes the same selected Actor after a formula edit', async () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const baseActor = actor('base', [conditionEffect('jinxed', '1d4')]);
    const selected = actor('selected', [conditionEffect('jinxed', '1d6'), conditionEffect('valor', '1d4')]);
    const manager = {
      actor: baseActor, token: { actor: selected }, actors: [selected], tokens: [{ actor: selected }],
      setting: { tooltips: 'full' },
    };
    const jinxed = { ...hudAction(projectedConditionStatusId('jinxed')), info1: {} };
    const valor = { ...hudAction(projectedConditionStatusId('valor')), info1: {} };
    const hud = { groups: [{ actions: [jinxed, valor] }] };

    decorateConditionHud(hud, globals, manager);
    expect(jinxed.info1.icon).toContain('aria-label="Jinxed: 1d6">6</span>');
    expect(valor.info1.icon).toContain('aria-label="Valor: 1d4">4</span>');
    expect(jinxed.tooltip.content).toContain('Jinxed:</strong> 1d6');
    expect(valor.tooltip.content).toContain('Valor:</strong> 1d4');

    const runtime = new ConditionRuntime(globals, () => true);
    await runtime.update(selected, selected.effects[0].id, 'jinxed', { formula: '1d4' });
    decorateConditionHud(hud, globals, manager);
    expect(jinxed.info1.icon).toContain('aria-label="Jinxed: 1d4">4</span>');
    expect(jinxed.info1.icon).not.toContain('1d6');
    expect(jinxed.tooltip.content).toContain('Jinxed:</strong> 1d4');

    selected.effects[0].disabled = true;
    decorateConditionHud(hud, globals, manager);
    expect(jinxed.info1).toBeUndefined();
  });

  test('preserves occupied TAH info1 and keeps dice badges silent in each tooltip mode', () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const selected = actor('selected', [conditionEffect('jinxed', '1d6')]);
    const foreignInfo = { icon: '<span>foreign</span>', title: 'foreign', class: 'foreign-badge' };
    const action = { ...hudAction(projectedConditionStatusId('jinxed')), info1: foreignInfo };
    const hud = { groups: [{ actions: [action] }] };
    const manager = { actor: selected, token: { actor: selected }, setting: { tooltips: 'full' } };

    decorateConditionHud(hud, globals, manager);
    expect(action.info1).toBe(foreignInfo);
    expect(action.tooltip.content).toContain('Jinxed:</strong> 1d6');
    manager.setting.tooltips = 'nameOnly';
    decorateConditionHud(hud, globals, manager);
    expect(action.info1).toBe(foreignInfo);
    expect(action.tooltip).toEqual({ content: 'jinxed' });
    manager.setting.tooltips = 'none';
    decorateConditionHud(hud, globals, manager);
    expect(action.info1).toBe(foreignInfo);
    expect(action.tooltip).toBeNull();

    const own = { ...hudAction(projectedConditionStatusId('jinxed')), info1: {} };
    decorateConditionHud({ groups: [{ actions: [own] }] }, globals, manager);
    expect(own.info1.title).toBe('');
    expect(own.tooltip).toBeNull();
    manager.setting.tooltips = 'nameOnly';
    decorateConditionHud({ groups: [{ actions: [own] }] }, globals, manager);
    expect(own.info1.title).toBe('');
    expect(own.tooltip).toEqual({ content: 'jinxed' });

    const ambiguous = { ...hudAction(projectedConditionStatusId('jinxed')), info1: {} };
    decorateConditionHud({ groups: [{ actions: [ambiguous] }] }, globals, {
      actor: null, token: null, actors: [selected, actor('other')], tokens: [{}, {}], setting: { tooltips: 'full' },
    });
    expect(ambiguous.info1).toEqual({});
  });

  test('omits disabled, absent, invalid, overlong, and multiselect badges without changing tooltip modes', () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const noEffect = hudAction(projectedConditionStatusId('jinxed'));
    const disabled = hudAction(projectedConditionStatusId('jinxed'));
    const invalid = hudAction(projectedConditionStatusId('jinxed'));
    const tooLong = hudAction(projectedConditionStatusId('valor'));
    const hostileFlag = (id: string, conditionId: string, formula: string) => ({
      id,
      disabled: false,
      flags: { 'fvtt-custom-conditions': { condition: {
        schemaVersion: 1, instanceId: `test-${id}`, conditionId, enabled: true, params: { formula },
      } } },
    });
    const actorWithout = actor('without');
    const actorDisabled = actor('disabled', [conditionEffect('jinxed', '1d6', true)]);
    const actorInvalid = actor('invalid', [hostileFlag('invalid', 'jinxed', '<img src=x onerror=alert(1)>')]);
    const actorLong = actor('too-long', [hostileFlag('too-long', 'valor', '1d6+'.repeat(60))]);
    for (const [action, selected] of [[noEffect, actorWithout], [disabled, actorDisabled], [invalid, actorInvalid], [tooLong, actorLong]] as const) {
      decorateConditionHud({ groups: [{ actions: [action] }] }, globals, { actor: selected, token: { actor: selected }, setting: { tooltips: 'none' } });
      expect(action.info1).toBeUndefined();
      expect(action.tooltip).toBeNull();
    }
    const hostileAction = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [hostileAction] }] }, globals, {
      actor: actorInvalid, token: { actor: actorInvalid }, setting: { tooltips: 'full' },
    });
    expect(hostileAction.info1).toBeUndefined();
    expect(hostileAction.tooltip.content).not.toContain('<img src=x onerror=alert(1)>');

    const longFormula = '2d6' + '+1'.repeat(55);
    const longActor = actor('long-valid', [conditionEffect('jinxed', longFormula)]);
    const longAction = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [longAction] }] }, globals, { actor: longActor, token: { actor: longActor }, setting: { tooltips: 'none' } });
    const visibleLongBadge = />([^<]*)<\/span>/.exec(longAction.info1.icon)?.[1] ?? '';
    expect(visibleLongBadge.length).toBeLessThanOrEqual(12);
    expect(visibleLongBadge.endsWith('…')).toBe(true);
    expect(longAction.info1.icon).toContain(`aria-label="Jinxed: ${longFormula}"`);
    expect(longAction.info1.title).toBe('');
    expect(longAction.tooltip).toBeNull();

    const ambiguous = hudAction(projectedConditionStatusId('jinxed'));
    decorateConditionHud({ groups: [{ actions: [ambiguous] }] }, globals, {
      actor: null, token: null, actors: [actor('one'), actor('two')], tokens: [{}, {}], setting: { tooltips: 'full' },
    });
    expect(ambiguous.info1).toBeUndefined();
  });
});

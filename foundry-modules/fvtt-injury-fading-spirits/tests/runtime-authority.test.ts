import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { InjuryFadingRuntime, publicApi } from '../src/runtime.ts';
import { createActorModuleState } from '../src/state.ts';

const original = new Map<string, unknown>();
let handlers: string[];
let actor: any;
let writes: Record<string, unknown>[];

beforeEach(() => {
  for (const key of ['game', 'Hooks', 'ui', 'fromUuid']) original.set(key, (globalThis as any)[key]);
  handlers = [];
  writes = [];
  const state = createActorModuleState(10, 10);
  state.injury.stacks = 2;
  actor = {
    id: 'hero', uuid: 'Actor.hero', type: 'character', documentName: 'Actor',
    system: { attributes: { hp: { value: 10, max: 10 } } }, flags: { [MODULE_ID]: state }, _stats: { modifiedTime: 100 },
    async update(changes: Record<string, unknown>) {
      writes.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        if (path === `flags.${MODULE_ID}.schemaVersion`) (this.flags[MODULE_ID] ??= {}).schemaVersion = value;
        if (path === `flags.${MODULE_ID}.fadingSpirits`) (this.flags[MODULE_ID] ??= {}).fadingSpirits = structuredClone(value);
      }
    },
  };
  (globalThis as any).Hooks = { on: (name: string) => { handlers.push(name); } };
  (globalThis as any).game = {
    version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
    user: { id: 'gm', active: true, isGM: true }, users: { activeGM: { id: 'gm' } },
    modules: new Map(), settings: { register() {} },
    i18n: { localize: (key: string) => key },
  };
  (globalThis as any).ui = { notifications: { error() {}, warn() {} } };
  (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
});

afterEach(() => { for (const [key, value] of original) (globalThis as any)[key] = value; original.clear(); });

describe('Fading Spirits owns resurrection without injury automation', () => {
  test('registers only resurrection UI hooks and works without Custom Conditions', async () => {
    const runtime = new InjuryFadingRuntime();
    runtime.initialize();
    await runtime.onReady();
    expect(runtime.supported).toBe(true);
    expect(handlers).toContain('preUpdateActor');
    expect(handlers).toContain('updateActor');
    expect(handlers).not.toContain('dnd5e.rollDeathSave');
    expect(handlers).not.toContain('dnd5e.restCompleted');
    expect(handlers).not.toContain('renderTokenHUD');
    await runtime.beginDeathEpisode(actor, 'episode-1');
    expect(actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId).toBe('episode-1');
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
    expect(writes[0]).not.toHaveProperty(`flags.${MODULE_ID}`);
    expect(writes[0]![`flags.${MODULE_ID}.fadingSpirits`]).toBeDefined();
    await runtime.beginDeathEpisode(actor, 'episode-1');
    expect(writes).toHaveLength(1);
  });

  test('fails closed for non-active GM and unsupported runtime', async () => {
    const runtime = new InjuryFadingRuntime();
    await runtime.onReady();
    (globalThis as any).game.users.activeGM = { id: 'another-gm' };
    await expect(runtime.beginDeathEpisode(actor, 'episode-2')).rejects.toThrow('active GM');
    expect(writes).toHaveLength(0);
    (globalThis as any).game.users.activeGM = { id: 'gm' };
    (globalThis as any).game.system.version = '6.0.4';
    await runtime.onReady();
    expect(runtime.supported).toBe(false);
    await expect(runtime.beginDeathEpisode(actor, 'episode-2')).rejects.toThrow('active GM');
  });

  test('legacy injury API delegates only to Custom Conditions public API', async () => {
    await expect(publicApi.setInjury(actor, 1, 'test')).rejects.toThrow('unavailable');
    const calls: unknown[][] = [];
    (globalThis as any).game.modules.set('fvtt-custom-conditions', { active: true, api: { injury: {
      getState: () => ({ ...actor.flags[MODULE_ID].injury, stacks: 1 }),
      setStacks: async (...args: unknown[]) => { calls.push(args); },
      withSuppressed: async (_actor: any, _reason: string, callback: () => unknown) => callback(),
    } } });
    await publicApi.setInjury(actor, 3, 'legacy-caller');
    expect(calls).toEqual([[actor, 3, 'legacy-caller']]);
    expect(publicApi.getState(actor).injury.stacks).toBe(1);
    expect(await publicApi.withInjurySuppressed(actor, 'ritual', async () => 7)).toBe(7);
  });

  test('without Custom Conditions, two separate deaths reset only current resurrection locks', async () => {
    const runtime = new InjuryFadingRuntime();
    await runtime.onReady();
    const change = { system: { attributes: { hp: { value: 0 } } } };
    runtime.onPreUpdateActor(actor, change);
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.onUpdateActor(actor, change);
    const first = actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId;
    expect(first).toBe('death:Actor.hero:101');
    actor.flags[MODULE_ID].fadingSpirits.resurrectionConsumedForCurrentDeath = true;
    actor.flags[MODULE_ID].fadingSpirits.successfulReturns = 1;
    runtime.onPreUpdateActor(actor, { 'system.attributes.hp.value': 1 });
    actor.system.attributes.hp.value = 1;
    actor._stats.modifiedTime = 102;
    await runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 1 });
    runtime.onPreUpdateActor(actor, change);
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 103;
    await runtime.onUpdateActor(actor, change);
    expect(actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId).toBe('death:Actor.hero:103');
    expect(actor.flags[MODULE_ID].fadingSpirits.resurrectionConsumedForCurrentDeath).toBe(false);
    expect(actor.flags[MODULE_ID].fadingSpirits.successfulReturns).toBe(1);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
  });

  test('a fresh Actor can start an independent IFS death episode without an injury subtree', async () => {
    delete actor.flags[MODULE_ID];
    const runtime = new InjuryFadingRuntime();
    await runtime.onReady();
    const change = { 'system.attributes.hp.value': 0 };
    runtime.onPreUpdateActor(actor, change);
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.onUpdateActor(actor, change);
    expect(actor.flags[MODULE_ID].schemaVersion).toBe(1);
    expect(actor.flags[MODULE_ID].injury).toBeUndefined();
    expect(actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId).toBe('death:Actor.hero:101');
    runtime.onPreUpdateActor(actor, { 'system.attributes.hp.value': 5 });
    actor.system.attributes.hp.value = 5;
    await runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 5 });
    expect(actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId).toBe('death:Actor.hero:101');
  });

  test('resurrection state remains readable when CC injury state is malformed', async () => {
    actor.flags[MODULE_ID].fadingSpirits.successfulReturns = 3;
    (globalThis as any).game.modules.set('fvtt-custom-conditions', { active: true, api: { injury: {
      getState: () => { throw new Error('broken CC injury'); }, isEnabled: () => true,
    } } });
    expect(publicApi.getResurrectionState(actor).successfulReturns).toBe(3);
    await expect(new InjuryFadingRuntime().onReady()).resolves.toBeUndefined();
    expect(() => publicApi.getState(actor)).toThrow('broken CC injury');
  });
});

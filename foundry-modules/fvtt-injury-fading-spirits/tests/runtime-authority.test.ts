import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { InjuryFadingRuntime, publicApi } from '../src/runtime.ts';
import { readActorState, writeActorState } from '../src/persistence.ts';
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
  test('admits the exact 14.368/6.0.6 candidate and rejects future or crossed pairs', async () => {
    for (const [core, system, supported] of [
      ['14.368', '6.0.6', true],
      ['14.364', '6.0.6', false],
      ['14.368', '6.0.7', false],
    ] as const) {
      (globalThis as any).game.version = core;
      (globalThis as any).game.system.version = system;
      const runtime = new InjuryFadingRuntime();
      await runtime.onReady();
      expect(runtime.supported).toBe(supported);
    }
  });
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

  test('death episode refuses to replace valid legacy history with stripped extension fields', async () => {
    actor.flags[MODULE_ID].fadingSpirits.attemptHistory = [{
      id: 'older-return', mode: 'normal', dc: 12, contributionSuccesses: 1,
      contributionFailures: 0, result: 'success', at: 12, gmId: 'prior-gm',
      legacySource: { page: 'old-campaign', keep: true },
    }];
    actor.flags[MODULE_ID].fadingSpirits.futureObject = { keep: 'Core object merge preserves this sibling' };
    const original = structuredClone(actor.flags[MODULE_ID]);
    const runtime = new InjuryFadingRuntime();
    await runtime.onReady();
    await expect(runtime.beginDeathEpisode(actor, 'new-death')).rejects.toThrow('attemptHistory');
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID]).toEqual(original);
  });

  test('ritual write refuses unknown historical array entries instead of silently filtering them', async () => {
    actor.flags[MODULE_ID].fadingSpirits.attemptHistory = [
      { id: 'old-mode', mode: 'legacy-rite', result: 'failure', at: 5, note: 'retain source' },
    ];
    const original = structuredClone(actor.flags[MODULE_ID]);
    const state = readActorState(actor);
    state.fadingSpirits.successfulReturns += 1;
    await expect(writeActorState(actor, state, 'ritual:old-mode')).rejects.toThrow('attemptHistory');
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID]).toEqual(original);
  });

  test('ritual write refuses contributor array extensions that parsing would strip', async () => {
    actor.flags[MODULE_ID].fadingSpirits.pendingRitual = {
      id: 'old-ritual', mode: 'normal', startedAt: 1, gmId: 'prior-gm',
      resolutionStartedAt: null, resolutionStartedBy: null, resolutionToken: null,
      contributors: [{ actorUuid: 'Actor.ally', check: 'prc', ability: 'wis', dc: 15,
        advantageMode: 'normal', requestMessageId: null, legacyPromise: 'keep' }],
    };
    const original = structuredClone(actor.flags[MODULE_ID]);
    const state = readActorState(actor);
    state.fadingSpirits.pendingRitual = null;
    await expect(writeActorState(actor, state, 'ritual:old-ritual:resolve')).rejects.toThrow('pendingRitual');
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID]).toEqual(original);
  });

  test('valid older pending ritual and contributor may gain known defaults without refusal', async () => {
    actor.flags[MODULE_ID].fadingSpirits.pendingRitual = {
      id: 'older-ritual', mode: 'normal', startedAt: 1, gmId: 'prior-gm',
      contributors: [{ actorUuid: 'Actor.ally', check: 'prc', dc: 15 }],
    };
    const state = readActorState(actor);
    state.fadingSpirits.successfulReturns += 1;
    await expect(writeActorState(actor, state, 'older-ritual:progress')).resolves.toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].fadingSpirits.pendingRitual).toMatchObject({
      id: 'older-ritual', mode: 'normal', startedAt: 1, gmId: 'prior-gm',
      contributors: [{ actorUuid: 'Actor.ally', check: 'prc', dc: 15 }],
    });
  });

  test('valid older history and resolution claim may gain known defaults without refusal', async () => {
    actor.flags[MODULE_ID].fadingSpirits.attemptHistory = [
      { id: 'older-attempt', mode: 'rapid', result: 'failure', at: 3 },
    ];
    actor.flags[MODULE_ID].fadingSpirits.resolutionInProgress = {
      id: 'older-claim', mode: 'rapid', startedAt: 4, startedBy: 'prior-gm',
    };
    const state = readActorState(actor);
    state.fadingSpirits.permanentDcPenalty += 1;
    await expect(writeActorState(actor, state, 'older-claim:progress')).resolves.toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory[0]).toMatchObject({
      id: 'older-attempt', mode: 'rapid', result: 'failure', at: 3,
    });
    expect(actor.flags[MODULE_ID].fadingSpirits.resolutionInProgress).toMatchObject({
      id: 'older-claim', mode: 'rapid', startedAt: 4, startedBy: 'prior-gm',
    });
  });

  test('stale schema-1 proposal cannot overwrite current unrecognized whole fading payload', async () => {
    for (const unknown of [['legacy', { keep: true }], 'legacy resurrection bytes']) {
      const proposal = createActorModuleState(10, 10);
      actor.flags[MODULE_ID].fadingSpirits = structuredClone(unknown);
      const original = structuredClone(actor.flags[MODULE_ID]);
      await expect(writeActorState(actor, proposal, 'stale:fading')).rejects.toThrow('fadingSpirits');
      expect(writes).toHaveLength(0);
      expect(actor.flags[MODULE_ID]).toEqual(original);
    }
  });

  test('stale schema-1 proposal cannot replace a current future version with missing fading subtree', async () => {
    const proposal = createActorModuleState(10, 10);
    actor.flags[MODULE_ID] = { schemaVersion: 2, futureObject: { keep: true } };
    const original = structuredClone(actor.flags[MODULE_ID]);
    await expect(writeActorState(actor, proposal, 'stale:future')).rejects.toThrow('schema');
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID]).toEqual(original);
  });

  test('absent, null, and empty legacy fading payloads remain initializable', async () => {
    for (const legacy of [undefined, null, {}]) {
      writes = [];
      actor.flags[MODULE_ID] = { schemaVersion: 1, ...(legacy === undefined ? {} : { fadingSpirits: legacy }) };
      await expect(writeActorState(actor, createActorModuleState(10, 10), 'initialize:legacy')).resolves.toBeUndefined();
      expect(writes).toHaveLength(1);
      expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory).toEqual([]);
    }
  });
});

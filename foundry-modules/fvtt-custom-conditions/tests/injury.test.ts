import { describe, expect, test } from 'bun:test';
import { InjuryRuntime, injurySupported, readInjury, transitionInjury, applyNineteenCritical } from '../src/injury.ts';
import { ConditionRuntime } from '../src/runtime.ts';

const CC = 'fvtt-custom-conditions';
const IFS = 'fvtt-injury-fading-spirits';

function fixture(input: { legacy?: boolean; stacks?: number; ifs?: boolean; oldWriter?: boolean } = {}) {
  const settings = new Map<string, unknown>([[`${CC}.injuryEnabled`, true], [`${CC}.injuryManageNpcs`, false], [`${CC}.injurySettingsImported`, true]]);
  const modules = new Map<string, any>();
  const begin: string[] = [];
  if (input.ifs) modules.set(IFS, { active: true, api: input.oldWriter ? {} : {
    injuryOwner: CC, beginDeathEpisode: async (_actor: any, id: string) => { begin.push(id); },
  } });
  const effects: any[] = [];
  const writes: any[] = [];
  const hookMap = new Map<string, any>();
  const documentListeners = new Map<string, any>();
  const sockets = new Map<string, any>();
  const emits: any[] = [];
  const globals: any = {
    game: {
      version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
      user: { id: 'gm', active: true, isGM: true },
      users: { activeGM: { id: 'gm' }, get: (id: string) => ({ id, active: id !== 'inactive' }) },
      modules, actors: [], messages: new Map(),
      settings: { get: (module: string, key: string) => settings.get(`${module}.${key}`),
        set: async (module: string, key: string, value: unknown) => { settings.set(`${module}.${key}`, value); } },
      socket: { on: (key: string, fn: any) => { sockets.set(key, fn); },
        emit: (_key: string, payload: any) => { emits.push(payload); } },
    },
    Hooks: { on: (key: string, fn: any) => { hookMap.set(key, fn); return key; }, off() {} },
    document: { addEventListener: (name: string, fn: any) => { documentListeners.set(name, fn); }, removeEventListener() {} },
    CONFIG: { statusEffects: [] }, CONST: { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 2 } },
    ui: { notifications: { error() {} } }, console: { error() {} },
  };
  const initial = {
    stacks: input.stacks ?? 0,
    episode: { id: null, open: false, openedAt: null },
    lastObservedHp: 10, lastObservedMax: 10,
    suppressNextRecovery: null, processedTransactionIds: [],
  };
  const actor: any = {
    id: 'a', uuid: 'Actor.a', name: 'Hero', documentName: 'Actor', type: 'character', pack: null,
    flags: input.legacy ? { [IFS]: { schemaVersion: 1, injury: structuredClone(initial), fadingSpirits: { successfulReturns: 4 }, unknown: { retained: 1 } } } : {},
    system: { attributes: { hp: { value: 10, max: 10 }, death: { failure: 0 } } },
    _stats: { modifiedTime: 100 }, effects,
    async update(changes: any) {
      writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) {
        if (path === `flags.${CC}.injury`) (this.flags[CC] ??= {}).injury = structuredClone(value);
        if (path === 'system.attributes.death.failure') this.system.attributes.death.failure = value;
      }
      this._stats.modifiedTime += 1;
    },
    async updateEmbeddedDocuments(_name: string, updates: any[]) {
      for (const update of updates) {
        const target = effects.find((entry) => entry.id === update._id);
        if (!target) continue;
        const { statuses: _statuses, flags: _flags, ...fields } = update;
        Object.assign(target, structuredClone(fields));
        if (update.statuses) target.statuses = new Set(update.statuses);
        if (update.flags?.[CC]) (target.flags[CC] ??= {}), Object.assign(target.flags[CC], update.flags[CC]);
        if (update[`flags.${CC}.injuryProjection`] !== undefined) (target.flags[CC] ??= {}).injuryProjection = update[`flags.${CC}.injuryProjection`];
        if (update[`flags.${CC}.stacks`] !== undefined) (target.flags[CC] ??= {}).stacks = update[`flags.${CC}.stacks`];
        if (update[`flags.${IFS}.injuryProjection`] !== undefined) (target.flags[IFS] ??= {}).injuryProjection = update[`flags.${IFS}.injuryProjection`];
      }
    },
    async createEmbeddedDocuments(_name: string, values: any[]) {
      for (const value of values) effects.push({ ...structuredClone(value), id: `effect-${effects.length + 1}`, statuses: new Set(value.statuses) });
    },
    async deleteEmbeddedDocuments(_name: string, ids: string[]) { for (const id of ids) effects.splice(effects.findIndex((effect) => effect.id === id), 1); },
    testUserPermission: (user: any) => user.id !== 'visitor',
  };
  globals.game.actors = [actor];
  globals.fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
  const runtime = new InjuryRuntime(globals, () => globals.game.user.id === globals.game.users.activeGM.id);
  runtime.start();
  return { runtime, actor, effects, writes, globals, settings, hookMap, documentListeners, sockets, begin, emits };
}

function hpEvent(actor: any, oldHp: number, newHp: number, modified: number) {
  return { event: { type: 'documentUpdate', documentType: 'Actor' }, document: actor, documentUuid: actor.uuid,
    before: { system: { attributes: { hp: { value: oldHp, max: 10 } } } },
    after: { system: { attributes: { hp: { value: newHp, max: 10 } } } },
    changes: { system: { attributes: { hp: { value: newHp } } } }, capturedModifiedTime: modified, userId: 'player' };
}

describe('Custom Conditions injury ownership', () => {
  test.each([['14.364', '5.3.3'], ['14.368', '6.0.5']])('uses captured prepared HP for nullable source maxima on %s/%s', async (core, system) => {
    const { runtime, actor, globals } = fixture();
    globals.game.version = core; globals.game.system.version = system;
    actor.system.attributes.hp.max = 20;
    await runtime.setStacks(actor, 1, 'setup');
    const event = (before: number, after: number, revision: number): any => {
      const context: any = hpEvent(actor, before, after, revision);
      context.before.system.attributes.hp.max = null; context.after.system.attributes.hp.max = null;
      context.preparedHp = { before: { value: before, max: 20 }, after: { value: after, max: 20 } };
      return context;
    };
    actor.system.attributes.hp.value = 0; actor._stats.modifiedTime = 200;
    await runtime.handleEvent(event(10, 0, 200));
    expect(actor.system.attributes.death.failure).toBe(1);
    actor.system.attributes.hp.value = 5; actor._stats.modifiedTime = 210;
    await runtime.handleEvent(event(0, 5, 210));
    expect(readInjury(actor).stacks).toBe(2);
    expect(readInjury(actor).lastObservedMax).toBe(20);
    actor.system.attributes.hp.value = 20; actor._stats.modifiedTime = 220;
    await runtime.handleEvent(event(5, 20, 220));
    expect(readInjury(actor).stacks).toBe(0);
  });

  test('does not coerce a null source maximum to zero when prepared HP was not captured', async () => {
    const { runtime, actor, writes } = fixture();
    const context: any = hpEvent(actor, 10, 0, 201);
    context.before.system.attributes.hp.max = null; context.after.system.attributes.hp.max = null;
    actor.system.attributes.hp.value = 0; actor._stats.modifiedTime = 201;
    await runtime.handleEvent(context);
    expect(writes).toHaveLength(0);
    expect(actor.flags[CC]).toBeUndefined();
  });

  test('runs the injury episode without Fading Spirits installed', async () => {
    const { runtime, actor, globals } = fixture();
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    expect(readInjury(actor).episode.open).toBeTrue();
    actor.system.attributes.hp.value = 5;
    actor._stats.modifiedTime = 103;
    await runtime.handleEvent(hpEvent(actor, 0, 5, 103));
    expect(readInjury(actor).stacks).toBe(1);
    expect(globals.game.modules.has(IFS)).toBeFalse();
  });

  test('accepts an IFS Actor that contains only resurrection state and preserves it on first HP transition', async () => {
    const { runtime, actor } = fixture();
    actor.flags[IFS] = { schemaVersion: 1, fadingSpirits: { successfulReturns: 2 }, otherLegacy: { keep: true } };
    const original = structuredClone(actor.flags[IFS]);
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    expect(readInjury(actor).episode.open).toBeTrue();
    expect(actor.flags[IFS]).toEqual(original);
  });

  test('migrates a legal legacy state with readback, reuses its AE ID, and preserves legacy flags and foreign effect fields', async () => {
    const { runtime, actor, effects } = fixture({ legacy: true, stacks: 2 });
    effects.push({ id: 'old', name: 'Mixed', origin: 'foreign', changes: [{ key: 'foreign' }],
      statuses: new Set(['fvtt-injury', 'poisoned']), flags: { [IFS]: { injuryProjection: true }, foreign: { keep: true } } });
    const original = structuredClone(actor.flags[IFS]);
    const state = await runtime.migrate(actor);
    expect(state.stacks).toBe(2);
    await runtime.reconcileActors();
    expect(actor.flags[IFS]).toEqual(original);
    expect(effects).toHaveLength(1);
    expect(effects[0].id).toBe('old');
    expect(effects[0].origin).toBe('foreign');
    expect(effects[0].changes).toEqual([{ key: 'foreign' }]);
    expect(effects[0].flags.foreign).toEqual({ keep: true });
    expect(effects[0].flags[CC].injuryProjection).toBe(true);
    expect(effects[0].flags[IFS].injuryProjection).toBe(false);
  });

  test('preserves a mixed disabled AE with only foreign flags and duration when injury clears', async () => {
    const { runtime, actor, effects } = fixture({ legacy: true, stacks: 1 });
    effects.push({ id: 'mixed', name: 'Foreign timed effect', disabled: true, transfer: false,
      duration: { seconds: 60 }, statuses: new Set(['fvtt-injury']), changes: [],
      flags: { [IFS]: { injuryProjection: true }, foreign: { counter: 7 } } });
    await runtime.setStacks(actor, 2, 'test');
    expect(effects[0].disabled).toBeTrue();
    expect(effects[0].duration).toEqual({ seconds: 60 });
    await runtime.setStacks(actor, 0, 'test');
    expect(effects).toHaveLength(1);
    expect(effects[0].flags.foreign).toEqual({ counter: 7 });
    expect(effects[0].statuses.has('fvtt-injury')).toBeFalse();
    expect(effects[0].flags[CC].injuryProjection).toBe(false);
  });

  test('clears a pure projection with DAE empty metadata and Core default source duration without ghosts', async () => {
    const { runtime, actor, effects } = fixture();
    await runtime.setStacks(actor, 1, 'test');
    const projection = effects[0];
    const id = projection.id;
    projection.flags.dae = { specialDuration: [] };
    projection.system = { changes: [] };
    projection.duration = { value: Infinity, units: 'seconds', expiry: null, expired: false };
    projection.toObject = () => ({ duration: { value: null, units: 'seconds', expiry: null, expired: false } });
    await runtime.setStacks(actor, 2, 'test');
    expect(effects).toHaveLength(1);
    expect(effects[0].id).toBe(id);
    expect(effects[0].name).toBe('Injury (2/3)');
    expect(effects[0].img).toEndWith('/injury-2.svg');
    await runtime.setStacks(actor, 0, 'test');
    expect(effects).toHaveLength(0);
    await runtime.setStacks(actor, 1, 'test');
    await runtime.setStacks(actor, 0, 'test');
    expect(effects).toHaveLength(0);
  });

  test('preserves populated DAE durations and unknown DAE fields when injury clears', async () => {
    for (const dae of [{ specialDuration: ['turnEnd'] }, { specialDuration: [], custom: false }]) {
      const { runtime, actor, effects } = fixture();
      await runtime.setStacks(actor, 1, 'test');
      effects[0].flags.dae = structuredClone(dae);
      effects[0].duration = { value: null, units: 'seconds', expiry: null, expired: false };
      await runtime.setStacks(actor, 0, 'test');
      expect(effects).toHaveLength(1);
      expect(effects[0].flags.dae).toEqual(dae);
      expect(effects[0].statuses.has('fvtt-injury')).toBeFalse();
    }
  });

  test('preserves native system changes and explicit zero-valued timed rules', async () => {
    for (const content of [{ system: { changes: [{ key: 'foreign', value: '1' }] } },
      { duration: { value: 0, units: 'seconds', expiry: 'turnStart', expired: false } }]) {
      const { runtime, actor, effects } = fixture();
      await runtime.setStacks(actor, 1, 'test');
      Object.assign(effects[0], structuredClone(content));
      await runtime.setStacks(actor, 0, 'test');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject(content);
      expect(effects[0].statuses.has('fvtt-injury')).toBeFalse();
    }
  });

  test('rejects unknown legacy schema, conflicting flags, multiple old projections, and an active old writer without changing bytes', async () => {
    for (const problem of ['schema', 'flags', 'projections', 'writer'] as const) {
      const { runtime, actor, effects, writes } = fixture({ legacy: true, ifs: problem === 'writer', oldWriter: problem === 'writer' });
      if (problem === 'schema') actor.flags[IFS].schemaVersion = 2;
      if (problem === 'flags') actor.flags[CC] = { injury: { schemaVersion: 1, state: { ...actor.flags[IFS].injury, stacks: 3 } } };
      if (problem === 'projections') effects.push(...['a', 'b'].map((id) => ({ id, statuses: new Set(['fvtt-injury']), flags: { [IFS]: { injuryProjection: true } } })));
      const original = structuredClone(actor.flags);
      await expect(runtime.migrate(actor)).rejects.toThrow();
      expect(actor.flags).toEqual(original);
      expect(writes).toHaveLength(0);
    }
  });

  test('handles captured rapid zero then healing, deduplicates after reload, and never rewrites stale native death failures', async () => {
    const { runtime, actor, writes, globals } = fixture({ ifs: true });
    actor.system.attributes.hp.value = 5;
    actor._stats.modifiedTime = 102;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    await runtime.handleEvent(hpEvent(actor, 0, 5, 102));
    expect(readInjury(actor).stacks).toBe(1);
    expect(writes.every((write) => !('system.attributes.death.failure' in write))).toBeTrue();
    const count = writes.length;
    const later = new InjuryRuntime(globals, () => true); later.start();
    await later.handleEvent(hpEvent(actor, 0, 5, 102));
    expect(writes).toHaveLength(count);
  });

  test('uses the current Actor document when an old same-UUID reference delivers a duplicate', async () => {
    const { runtime, actor, globals, writes } = fixture();
    const stale = { ...actor, flags: structuredClone(actor.flags),
      system: structuredClone(actor.system), _stats: { modifiedTime: 101 } };
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    const count = writes.length;
    globals.fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    await runtime.handleEvent(hpEvent(stale, 10, 0, 101));
    expect(writes).toHaveLength(count);
    expect(readInjury(stale).processedTransactionIds).toEqual([]);
  });

  test('does not project an AE after active GM changes during the Actor flag write', async () => {
    const { runtime, actor, effects, globals } = fixture();
    await runtime.migrate(actor);
    const update = actor.update.bind(actor);
    actor.update = async (changes: any) => {
      await update(changes);
      globals.game.users.activeGM = { id: 'other-gm' };
    };
    await expect(runtime.setStacks(actor, 2, 'test')).rejects.toThrow('active GM');
    expect(readInjury(actor).stacks).toBe(2);
    expect(effects).toHaveLength(0);
  });

  test('starts a death episode once, applies its current injury as failures, and calls only the public Fading Spirits API', async () => {
    const { runtime, actor, writes, begin } = fixture({ legacy: true, stacks: 2, ifs: true });
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    expect(readInjury(actor).episode.open).toBeTrue();
    expect(actor.system.attributes.death.failure).toBe(2);
    expect(writes.filter((write) => write['system.attributes.death.failure'] === 2)).toHaveLength(1);
    expect(begin).toHaveLength(1);
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    expect(begin).toHaveLength(1);
  });

  test('retries a failed Fading Spirits episode bridge without replaying the injury transition', async () => {
    const { runtime, actor, globals } = fixture({ ifs: true });
    let calls = 0;
    globals.game.modules.get(IFS).api.beginDeathEpisode = async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary bridge failure');
      return true;
    };
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    const event = hpEvent(actor, 10, 0, 101);
    await expect(runtime.handleEvent(event)).rejects.toThrow('temporary bridge failure');
    expect(readInjury(actor).pendingFadingEpisodeId).toBeTruthy();
    const count = readInjury(actor).processedTransactionIds.length;
    await runtime.handleEvent(event);
    expect(calls).toBe(2);
    expect(readInjury(actor).pendingFadingEpisodeId).toBeNull();
    expect(readInjury(actor).processedTransactionIds).toHaveLength(count);
    expect(readInjury(actor).stacks).toBe(0);
  });

  test('keeps the exact runtime pairs and the bare 19/20 critical rule in CC', () => {
    const { globals } = fixture();
    expect(injurySupported(globals)).toBeTrue();
    globals.game.version = '14.368'; globals.game.system.version = '6.0.5';
    expect(injurySupported(globals)).toBeTrue();
    globals.game.system.version = '6.0.2';
    expect(injurySupported(globals)).toBeFalse();
    const details: Record<string, unknown> = {};
    expect(applyNineteenCritical(details, 19, '6.0.5')).toBeTrue();
    expect(details.outcome).toBe('revive');
    expect(details.updates).toEqual({ 'system.attributes.death.success': 0,
      'system.attributes.death.failure': 0, 'system.attributes.hp.value': 1 });
  });

  test('suppression prevents recovery injury and authenticated native rest clears stacks once', async () => {
    const { runtime, actor, globals, sockets } = fixture({ legacy: true, stacks: 1 });
    await runtime.migrate(actor);
    const state = readInjury(actor);
    state.episode = { id: 'earlier', open: true, openedAt: 1 };
    actor.flags[CC].injury.state = state;
    await runtime.suppressNextRecovery(actor, 'ritual', 'success');
    actor.system.attributes.hp.value = 5;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 0, 5, 101));
    expect(readInjury(actor).stacks).toBe(1);
    expect(readInjury(actor).suppressNextRecovery).toBeNull();
    await runtime.setStacks(actor, 2, 'test');
    const socket = sockets.get(`module.${CC}`);
    const otherTokenRest = { id: 'other-token-rest', type: 'rest', user: { id: 'player' },
      system: { type: 'short', deltas: {} }, speaker: { actor: actor.id },
      getAssociatedActor: () => ({ id: actor.id, uuid: 'Scene.other.Token.other.Actor.a' }) };
    globals.game.messages.set(otherTokenRest.id, otherTokenRest);
    await socket({ type: 'rest', actorUuid: actor.uuid, messageId: otherTokenRest.id, restType: 'short' }, 'player');
    expect(readInjury(actor).stacks).toBe(2);
    const message = { id: 'rest-1', type: 'rest', user: { id: 'player' }, system: { type: 'short', deltas: {} },
      speaker: { actor: actor.id }, getAssociatedActor: () => actor };
    globals.game.messages.set(message.id, message);
    await socket({ type: 'rest', actorUuid: actor.uuid, messageId: message.id, restType: 'short' }, 'player');
    expect(readInjury(actor).stacks).toBe(0);
    await socket({ type: 'rest', actorUuid: actor.uuid, messageId: message.id, restType: 'short' }, 'player');
    expect(readInjury(actor).processedTransactionIds.filter((id: string) => id.includes('rest-1'))).toHaveLength(1);
  });

  test('authenticates a 6.0.5 player native rest by its canonical ChatMessage author and consumes it once', async () => {
    const { runtime, actor, globals, sockets } = fixture({ legacy: true, stacks: 2 });
    globals.game.version = '14.368'; globals.game.system.version = '6.0.5';
    await runtime.migrate(actor);
    const message = { id: 'native6-rest', type: 'rest', author: { id: 'player' },
      system: { type: 'short', deltas: {} }, speaker: { actor: actor.id }, getAssociatedActor: () => actor };
    globals.game.messages.set(message.id, message);
    const receive = sockets.get(`module.${CC}`);
    const request = { type: 'rest', actorUuid: actor.uuid, messageId: message.id, restType: 'short' };
    await receive(request, undefined);
    expect(readInjury(actor).stacks).toBe(2);
    await receive(request, 'player');
    expect(readInjury(actor).stacks).toBe(0);
    await receive(request, 'player');
    expect(readInjury(actor).processedTransactionIds.filter(id => id === `rest:${actor.uuid}:${message.id}:short`)).toHaveLength(1);
  });

  test('a legacy user alias cannot override a different canonical rest-message author', async () => {
    const { runtime, actor, globals, sockets } = fixture({ legacy: true, stacks: 2 });
    await runtime.migrate(actor);
    const message = { id: 'conflicting-author-rest', type: 'rest', author: { id: 'other' }, user: { id: 'player' },
      system: { type: 'short', deltas: {} }, speaker: { actor: actor.id }, getAssociatedActor: () => actor };
    globals.game.messages.set(message.id, message);
    await sockets.get(`module.${CC}`)({ type: 'rest', actorUuid: actor.uuid, messageId: message.id, restType: 'short' }, 'player');
    expect(readInjury(actor).stacks).toBe(2);
  });

  test('an active GM can clear injury on a native no-chat rest, while an unauthenticated socket cannot', async () => {
    const { actor, runtime, hookMap, sockets } = fixture({ legacy: true, stacks: 2 });
    await hookMap.get('dnd5e.restCompleted')(actor, { type: 'long' }, { type: 'long', chat: false });
    // The native hook starts an async GM write; its public equivalent exposes
    // completion for this in-memory test fixture.
    await runtime.applyRest(actor, 'long', `rest:${actor.uuid}:100:long`);
    expect(readInjury(actor).stacks).toBe(0);
    await runtime.setStacks(actor, 2, 'test');
    await sockets.get(`module.${CC}`)({ type: 'rest', actorUuid: actor.uuid,
      messageId: 'forged', restType: 'long' }, undefined);
    expect(readInjury(actor).stacks).toBe(2);
  });

  test('legacy player set request uses transport sender and Actor OWNER permission', async () => {
    const { runtime, actor, globals, sockets, emits, writes } = fixture();
    globals.game.user = { id: 'player', active: true, isGM: false };
    await runtime.setStacks(actor, 2, 'legacy-api');
    expect(emits).toEqual([{ type: 'setStacks', actorUuid: actor.uuid, stacks: 2, reason: 'legacy-api' }]);
    expect(writes).toHaveLength(0);
    globals.game.user = { id: 'gm', active: true, isGM: true };
    const receive = sockets.get(`module.${CC}`);
    await receive(emits[0], 'player');
    expect(readInjury(actor).stacks).toBe(2);
    await receive({ ...emits[0], stacks: 3 }, 'inactive');
    expect(readInjury(actor).stacks).toBe(2);
    await receive({ ...emits[0], stacks: 3 }, 'visitor');
    expect(readInjury(actor).stacks).toBe(2);
  });

  test('old automation choices preserve NPC scope and do not open an unreviewed 6.x condition catalog', async () => {
    const { actor, runtime, settings, globals } = fixture({ legacy: true, ifs: true });
    settings.set(`${CC}.injurySettingsImported`, false);
    settings.set(`${IFS}.enabled`, true);
    settings.set(`${IFS}.manageNpcs`, false);
    await (runtime as any).importLegacySettings();
    expect(settings.get(`${CC}.injuryEnabled`)).toBe(true);
    expect(settings.get(`${CC}.injuryManageNpcs`)).toBe(false);
    actor.type = 'npc';
    expect(runtime.managed(actor)).toBeFalse();
    actor.type = 'character';
    globals.game.version = '14.368'; globals.game.system.version = '6.0.2';
    const conditions = new ConditionRuntime(globals, () => true);
    conditions.start();
    expect(conditions.definitions()).toEqual([]);
    expect(conditions.list(actor)).toEqual([]);
    await expect(conditions.apply(actor, 'dazed', {})).rejects.toThrow('unsupported');
  });

  test('public migration and suppression refuse disabled or unsupported runtimes before callbacks', async () => {
    const { actor, runtime, settings, globals, writes } = fixture();
    settings.set(`${CC}.injuryEnabled`, false);
    await expect(runtime.migrate(actor)).rejects.toThrow('disabled');
    let called = false;
    await expect(runtime.withSuppressed(actor, 'test', async () => { called = true; })).rejects.toThrow('disabled');
    expect(called).toBeFalse();
    expect(writes).toHaveLength(0);
    settings.set(`${CC}.injuryEnabled`, true);
    globals.game.version = '14.368'; globals.game.system.version = '6.0.2';
    await expect(runtime.migrate(actor)).rejects.toThrow('unsupported');
    expect(writes).toHaveLength(0);
  });

  test('public migration serializes with the first captured HP event', async () => {
    const { actor, runtime } = fixture();
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await Promise.all([runtime.migrate(actor), runtime.handleEvent(hpEvent(actor, 10, 0, 101))]);
    expect(readInjury(actor).episode.open).toBeTrue();
    expect(readInjury(actor).processedTransactionIds).toHaveLength(1);
  });

  test('withSuppressed survives delayed Trigger delivery but expires if no recovery occurs', async () => {
    const { actor, runtime } = fixture();
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    await runtime.withSuppressed(actor, 'revival', async () => {
      actor.system.attributes.hp.value = 5;
      actor._stats.modifiedTime += 1;
    });
    expect(readInjury(actor).suppressNextRecovery).not.toBeNull();
    await runtime.handleEvent(hpEvent(actor, 0, 5, actor._stats.modifiedTime));
    expect(readInjury(actor).stacks).toBe(0);
    expect(readInjury(actor).suppressNextRecovery).toBeNull();
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime += 1;
    await runtime.handleEvent(hpEvent(actor, 5, 0, actor._stats.modifiedTime));
    await runtime.withSuppressed(actor, 'cancelled ritual', async () => {});
    expect(readInjury(actor).suppressNextRecovery).toBeNull();
  });

  test('suppression binds a fall even when both native HP events reach Trigger after the callback', async () => {
    const { actor, runtime } = fixture();
    actor.system.attributes.hp.value = 0;
    actor._stats.modifiedTime = 101;
    await runtime.withSuppressed(actor, 'immediate resurrection', async () => {
      actor.system.attributes.hp.value = 5;
      actor._stats.modifiedTime = 103;
    });
    expect(readInjury(actor).suppressNextRecovery?.episodeId).toBeNull();
    await runtime.handleEvent(hpEvent(actor, 10, 0, 101));
    expect(readInjury(actor).suppressNextRecovery?.episodeId).toBe(readInjury(actor).episode.id);
    await runtime.handleEvent(hpEvent(actor, 0, 5, 103));
    expect(readInjury(actor).stacks).toBe(0);
    expect(readInjury(actor).suppressNextRecovery).toBeNull();
  });

  test('three stacks defer native failures and an old active writer blocks the death-save extension', async () => {
    const state = { stacks: 3, episode: { id: null, open: false, openedAt: null },
      lastObservedHp: 10, lastObservedMax: 10, suppressNextRecovery: null, processedTransactionIds: [] };
    const result = transitionInjury(state, { id: 'fall', at: 1, oldHp: 10, newHp: 0, oldMax: 10, newMax: 10 });
    expect(result.failures).toBeNull();
    expect(result.threeStackEpisode).toBe('fall');
    const { actor, hookMap } = fixture({ ifs: true, oldWriter: true });
    const details: Record<string, unknown> = { subject: actor };
    hookMap.get('dnd5e.rollDeathSave')([{ d20: { results: [{ result: 19, active: true }] } }], details);
    expect(details.updates).toBeUndefined();
  });

  test('owns the TAH Injury count and four-paragraph tooltip in each tooltip mode', () => {
    const { actor, globals, hookMap } = fixture({ legacy: true, stacks: 1 });
    globals.game.i18n = { localize: (key: string) => key === 'FVTTCONDITIONS.Injury.Name' ? '伤势'
      : key === 'FVTTCONDITIONS.Injury.Rules' ? '第一段。\n\n第二段。\n\n第三段。\n\n第四段。' : key };
    expect(globals.CONFIG.statusEffects.find((entry: any) => entry.id === 'fvtt-injury').label)
      .toBe('FVTTCONDITIONS.Injury.Name');
    const action: any = { name: 'old', system: { actionType: 'condition', actionId: 'fvtt-injury' } };
    const hud = { groups: [{ actions: [action] }] };
    const decorate = hookMap.get('tokenActionHudCorePreRender');
    decorate(hud, { actor, setting: { tooltips: 'full' } });
    expect(action.name).toBe('伤势');
    expect(action.info1.icon).toContain('1/3');
    expect(action.tooltip.content.match(/<p>/g)).toHaveLength(4);
    decorate(hud, { actor, setting: { tooltips: 'nameOnly' } });
    expect(action.tooltip.content).toBe('伤势 1/3');
    decorate(hud, { actor, setting: { tooltips: 'none' } });
    expect(action.tooltip).toBeNull();
  });

  test('Token status HUD left click increments and right auxclick decrements once', async () => {
    const { actor, globals, documentListeners } = fixture();
    globals.canvas = { hud: { token: { object: { actor } } } };
    const target = {};
    const fire = async (type: string, button: number) => {
      documentListeners.get(type)({ type, button, target: { closest: () => target },
        preventDefault() {}, stopPropagation() {} });
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    await fire('click', 0);
    expect(readInjury(actor).stacks).toBe(1);
    await fire('contextmenu', 2);
    expect(readInjury(actor).stacks).toBe(1);
    await fire('auxclick', 2);
    expect(readInjury(actor).stacks).toBe(0);
  });

  test('malformed injury data does not block unrelated Trigger subscribers in Custom Conditions', async () => {
    const { actor, globals } = fixture();
    actor.flags[CC] = { injury: { schemaVersion: 999 } };
    actor.system.attributes.hp.value = 5;
    actor._stats.modifiedTime = 101;
    const conditions = new ConditionRuntime(globals, () => true);
    conditions.injury.start();
    let genericCalled = false;
    (conditions.weaponEffects as any).handleTriggerEvent = async () => { genericCalled = true; };
    await conditions.handleTriggerEvent(hpEvent(actor, 10, 5, 101));
    expect(genericCalled).toBeTrue();
    expect(actor.flags[CC].injury).toEqual({ schemaVersion: 999 });
  });
});

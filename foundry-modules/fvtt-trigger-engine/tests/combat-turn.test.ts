import { afterEach, describe, expect, test } from 'bun:test';
import { TriggerEngineRuntime } from '../src/runtime.ts';
import { parseTriggerDefinition, parseTriggerStore } from '../src/schema.ts';
import { MemoryTriggerStorage } from '../src/storage.ts';
import type { TriggerDefinition } from '../src/types.ts';

function combatTrigger(id: string, macroUuid = id, overrides: Partial<TriggerDefinition> = {}): TriggerDefinition {
  return {
    id,
    name: id,
    enabled: true,
    event: { type: 'combatTurnStart', documentType: 'Actor' },
    conditions: null,
    actions: [{ type: 'macro', macroUuid }],
    ...overrides,
  };
}

function documentTrigger(id: string, macroUuid = id): TriggerDefinition {
  return {
    id,
    name: id,
    enabled: true,
    event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.attributes.hp.value'] },
    conditions: null,
    actions: [{ type: 'macro', macroUuid }],
  };
}

function actor(id: string, hp = 10): any {
  const data: any = { _id: id, name: id, system: { attributes: { hp: { value: hp } } } };
  return {
    id,
    uuid: `Actor.${id}`,
    documentName: 'Actor',
    toObject: () => JSON.parse(JSON.stringify(data)),
    set(path: string, value: unknown) {
      const segments = path.split('.');
      let current = data;
      for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
      current[segments.at(-1)!] = value;
    },
  };
}

function combat(combatants: any[], round = 0, turn: number | null = null): any {
  return {
    id: 'encounter',
    uuid: 'Combat.encounter',
    documentName: 'Combat',
    active: true,
    round,
    turn,
    turns: combatants,
    combatants,
  };
}

function globalsFor(user: any, actors: any[], combats: any[] = []): any {
  return {
    game: {
      user,
      users: { activeGM: user },
      actors,
      combats,
    },
    ui: { notifications: { error: () => {} } },
  };
}

describe('combatTurnStart schema', () => {
  test('accepts the additive event without weakening documentUpdate watchedPaths', () => {
    const combat = parseTriggerDefinition(combatTrigger('combat'));
    expect(combat.success).toBeTrue();
    expect(combat.data?.event).toEqual({ type: 'combatTurnStart', documentType: 'Actor' });

    const document = parseTriggerDefinition(documentTrigger('document'));
    expect(document.success).toBeTrue();
    expect(document.data?.event).toEqual({
      type: 'documentUpdate',
      documentType: 'Actor',
      watchedPaths: ['system.attributes.hp.value'],
    });

    const invalid = parseTriggerDefinition({
      ...combatTrigger('invalid'),
      event: { type: 'combatTurnStart', documentType: 'Item' },
    });
    expect(invalid.success).toBeFalse();
    const store = parseTriggerStore({ schemaVersion: 1, triggers: [combatTrigger('ok'), invalid.data] });
    expect(store.data.triggers.map((entry) => entry.id)).toEqual(['ok']);
    expect(store.issues.length).toBeGreaterThan(0);
  });
});

describe('combatTurnStart runtime', () => {
  const runtimes: TriggerEngineRuntime[] = [];

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.stop();
  });

  test('replays a forward turn after explicit undo reconciliation while retaining same-delivery deduplication',async()=>{
    const gm={id:'gm',isGM:true,active:true},actors=['a','b'].map(id=>actor(id));
    const encounter=combat(actors.map(a=>({id:a.id,actor:a})),1,0),globals=globalsFor(gm,actors,[encounter]);
    const hooks:string[]=[],handlers=new Map<string,any>();globals.Hooks={on:(name:string,fn:any)=>{handlers.set(name,fn);return name;},off:()=>{},callAll:(name:string)=>hooks.push(name)};
    const runtime=new TriggerEngineRuntime({globals,storage:new MemoryTriggerStorage()});runtimes.push(runtime);await runtime.start();
    const received:string[]=[];runtime.subscribe(context=>{received.push(`${(context.document as any).id}:${context.phase}`);});
    const prior={round:1,turn:0,combatantId:'a'},current={round:1,turn:1,combatantId:'b'};
    const initial={round:0,turn:null,combatantId:null};handlers.get('combatTurnChange')(encounter,initial,prior);await runtime.whenIdle();
    const checkpoint=runtime.captureCombatUndo(encounter);
    expect(checkpoint.keys.length).toBeGreaterThan(0);
    encounter.turn=1;handlers.get('combatTurnChange')(encounter,prior,current);handlers.get('combatTurnChange')(encounter,prior,current);await runtime.whenIdle();
    expect(received).toEqual(['a:end','b:start']);
    encounter.turn=0;await runtime.reconcileCombatUndo(encounter,checkpoint);encounter.turn=1;
    handlers.get('combatTurnChange')(encounter,initial,prior);await runtime.whenIdle();
    handlers.get('combatTurnChange')(encounter,prior,current);handlers.get('combatTurnChange')(encounter,prior,current);await runtime.whenIdle();
    expect(received).toEqual(['a:end','b:start','a:end','b:start']);expect(hooks).toContain('fvtt-trigger-engine.combatRewound');
  });

  test.each(['callback', 'subscriber'])('stops Combat delivery after GM handoff in an awaited %s', async (boundary) => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor('target');
    const encounter = combat([{ id: 'combatant', actor: target }]);
    const globals = globalsFor(gm, [target], [encounter]);
    const calls: string[] = [];
    globals.Hooks = { callAll: () => calls.push('public-hook') };
    const handoff = async () => {
      await Promise.resolve();
      globals.game.users.activeGM = { id: 'other', isGM: true, active: true };
    };
    const runtime = new TriggerEngineRuntime({ globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [combatTrigger('authority')] }),
      macroResolver: async () => ({ execute: () => calls.push('macro') }),
      onCombatTurnStart: boundary === 'callback' ? handoff : undefined,
    });
    runtimes.push(runtime);
    await runtime.start();
    if (boundary === 'subscriber') runtime.subscribe(handoff);
    runtime.subscribe(() => { calls.push('later-subscriber'); });
    encounter.round = 1;
    encounter.turn = 0;
    const report = await runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 });
    expect(report.skippedReason).toBe('inactive-gm');
    expect(calls).toEqual([]);
  });

  test('reserves both phases across rapid native transitions and a slow end subscriber', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const combatants = ['a', 'b', 'c'].map((id) => ({ id, actor: actor(id) }));
    const encounter = combat(combatants, 1, 0);
    const globals = globalsFor(gm, combatants.map((c) => c.actor), [encounter]);
    const handlers = new Map<string, any>();
    globals.Hooks = { on: (name: string, fn: any) => { handlers.set(name, fn); return name; }, off: () => {} };
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    let release!: () => void;
    let entered!: () => void;
    let finished!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const done = new Promise<void>((resolve) => { finished = resolve; });
    const sequence: string[] = [];
    runtime.subscribe(async (event) => {
      sequence.push(`${(event.document as { id: string }).id}:${event.phase}`);
      if (sequence.length === 1) { entered(); await gate; }
      if (sequence.length === 4) finished();
    });
    const state = (turn: number) => ({ round: 1, turn, combatantId: combatants[turn]!.id });
    handlers.get('combatTurnChange')(encounter, state(0), state(1));
    await started;
    handlers.get('combatTurnChange')(encounter, state(1), state(2));
    release();
    await done;
    expect(sequence).toEqual(['a:end', 'b:start', 'b:end', 'c:start']);
  });

  test('captures first healing for new and previously unseen synthetic Actors', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const globals = globalsFor(gm, []);
    const existingTokenActor = actor('existing-token', 4);
    globals.game.scenes = new Map([['scene', { tokens: new Map([['token', { actor: existingTokenActor }]]) }]]);
    const handlers = new Map<string, any>();
    globals.Hooks = { on: (name: string, fn: any) => { handlers.set(name, fn); return name; }, off: () => {} };
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const events: any[] = [];
    runtime.subscribe((event) => { events.push(event); });
    for (const [id, hook] of [['created', 'createActor'], ['synthetic', 'preUpdateActor']]) {
      const target = actor(id!, 4);
      handlers.get(hook!)(target);
      target.set('system.attributes.hp.value', 7);
      await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 7 });
    }
    expect(events.map((event) => [event.before.system.attributes.hp.value, event.after.system.attributes.hp.value]))
      .toEqual([[4, 7], [4, 7]]);
    const newTokenActor = actor('new-token', 4);
    handlers.get('createToken')({ actor: newTokenActor });
    for (const target of [existingTokenActor, newTokenActor]) {
      target.set('system.attributes.hp.value', 8);
      // The GM receives the remote post-update; no originating pre-update hook.
      await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 8 }, {}, 'player');
    }
    expect(events.slice(2).map((event) => [event.before.system.attributes.hp.value, event.after.system.attributes.hp.value]))
      .toEqual([[4, 8], [4, 8]]);
  });

  test('runs the first and next committed forward turns with Actor snapshots and combat context', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first', 7);
    const secondActor = actor('second', 4);
    const firstToken = { id: 'token-first' };
    const secondToken = { id: 'token-second' };
    const encounter = combat([
      { id: 'combatant-first', actor: firstActor, token: firstToken },
      { id: 'combatant-second', actor: secondActor, token: secondToken },
    ]);
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    const callbackContexts: any[] = [];
    const macroContexts: any[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [combatTrigger('turn', 'macro')] }),
      macroResolver: async () => ({ execute: ({ triggerContext }: any) => { macroContexts.push(triggerContext); } }),
      onCombatTurnStart: async (context) => { callbackContexts.push(context); },
    });
    runtimes.push(runtime);
    await runtime.start();

    encounter.round = 1;
    encounter.turn = 0;
    const firstReport = await runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 }, {}, 'gm');
    encounter.turn = 1;
    const secondReport = await runtime.handleCombatUpdate(encounter, { round: 1, turn: 1 }, { direction: 1 }, 'gm');

    expect(firstReport.matchedTriggerIds).toEqual(['turn']);
    expect(secondReport.matchedTriggerIds).toEqual(['turn']);
    expect(callbackContexts.map((context) => [context.actor, context.combatant, context.round, context.turn]))
      .toEqual([[firstActor, encounter.turns[0], 1, 0], [secondActor, encounter.turns[1], 1, 1]]);
    expect(callbackContexts[0]).toMatchObject({ combat: encounter, token: firstToken, key: 'Combat.encounter:1:0', userId: 'gm' });
    expect(callbackContexts[1]).toMatchObject({ combat: encounter, token: secondToken, key: 'Combat.encounter:1:1', userId: 'gm' });
    expect(macroContexts[0]).toMatchObject({
      event: { type: 'combatTurnStart', documentType: 'Actor' },
      document: firstActor,
      documentUuid: 'Actor.first',
      combat: encounter,
      combatUuid: 'Combat.encounter',
      combatant: encounter.turns[0],
      token: firstToken,
      round: 1,
      turn: 0,
      key: 'Combat.encounter:1:0',
      before: { system: { attributes: { hp: { value: 7 } } } },
      after: { system: { attributes: { hp: { value: 7 } } } },
    });
  });

  test('deduplicates occurrences and ignores unrelated, backward, and revisited turns', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first');
    const secondActor = actor('second');
    const encounter = combat([{ id: 'one', actor: firstActor }, { id: 'two', actor: secondActor }]);
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    const contexts: any[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [combatTrigger('turn')] }),
      macroResolver: async () => ({ execute: () => {} }),
      onCombatTurnStart: async (context) => { contexts.push(context); },
    });
    runtimes.push(runtime);
    await runtime.start();

    const unrelated = await runtime.handleCombatUpdate(encounter, { flags: { test: true } }, {}, 'gm');
    expect(unrelated.skippedReason).toBe('empty-combat');
    encounter.round = 1;
    encounter.turn = 0;
    await runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 }, {}, 'gm');
    encounter.turn = 1;
    await runtime.handleCombatUpdate(encounter, { turn: 1 }, { direction: 1 }, 'gm');
    const duplicate = await runtime.handleCombatUpdate(encounter, { turn: 1 }, { direction: 1 }, 'gm');
    expect(duplicate.skippedReason).toBe('duplicate');

    encounter.turn = 0;
    const backwards = await runtime.handleCombatUpdate(encounter, { turn: 0 }, { direction: -1 }, 'gm');
    encounter.turn = 1;
    const revisit = await runtime.handleCombatUpdate(encounter, { turn: 1 }, { direction: 1 }, 'gm');
    expect(backwards.skippedReason).toBe('duplicate');
    expect(revisit.skippedReason).toBe('duplicate');
    expect(contexts.map((context) => context.key)).toEqual(['Combat.encounter:1:0', 'Combat.encounter:1:1']);
  });

  test('captures rapid advances before the queued callback can observe the next combatant', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first');
    const secondActor = actor('second');
    const encounter = combat([{ id: 'one', actor: firstActor }, { id: 'two', actor: secondActor }]);
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    const contexts: any[] = [];
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async (context) => {
        contexts.push(context);
        if (contexts.length === 1) {
          firstStarted();
          await firstGate;
        }
      },
    });
    runtimes.push(runtime);
    await runtime.start();

    encounter.round = 1;
    encounter.turn = 0;
    const first = runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 }, {}, 'gm');
    await firstStarted;
    encounter.turn = 1;
    const second = runtime.handleCombatUpdate(encounter, { turn: 1 }, { direction: 1 }, 'gm');
    await Promise.resolve();
    expect(contexts).toHaveLength(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(contexts.map((context) => [context.actor, context.key]))
      .toEqual([[firstActor, 'Combat.encounter:1:0'], [secondActor, 'Combat.encounter:1:1']]);
  });

  test('executes from post-lifecycle combatTurnChange after updateCombat has only observed the update', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor('target');
    target.effects = [{ id: 'bleed' }];
    const combatant = { id: 'combatant-target', actor: target, token: { id: 'token-target' } };
    const encounter = combat([combatant]);
    const globals = globalsFor(gm, [target], [encounter]);
    const handlers = new Map<string, any>();
    globals.Hooks = {
      on: (name: string, handler: any) => { handlers.set(name, handler); return name; },
      off: () => {},
    };
    const observedEffectCounts: number[] = [];
    let resolveTurn!: () => void;
    const turnFinished = new Promise<void>((resolve) => { resolveTurn = resolve; });
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async (context) => {
        observedEffectCounts.push(context.actor.effects.length);
        resolveTurn();
      },
    });
    runtimes.push(runtime);
    await runtime.start();

    encounter.round = 1;
    encounter.turn = 0;
    handlers.get('updateCombat')(encounter, { round: 1, turn: 0 }, { direction: 1 }, 'gm');
    expect(observedEffectCounts).toEqual([]);

    // Simulate the native lifecycle/effect work completing before the native hook.
    target.effects = [];
    handlers.get('combatTurnChange')(encounter,
      { round: 0, turn: null, combatantId: null },
      { round: 1, turn: 0, combatantId: combatant.id });
    await turnFinished;
    expect(observedEffectCounts).toEqual([0]);
  });

  test('does not settle before the native turn lifecycle even after a slow update', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor('fallback');
    const combatant = { id: 'combatant-fallback', actor: target };
    const encounter = combat([combatant]);
    const globals = globalsFor(gm, [target], [encounter]);
    const handlers = new Map<string, any>();
    globals.Hooks = {
      on: (name: string, handler: any) => { handlers.set(name, handler); return name; },
      off: () => {},
      callAll: () => {},
    };
    const events: any[] = [];
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    runtime.subscribe((context) => { events.push(context); });

    encounter.round = 1;
    encounter.turn = 0;
    handlers.get('updateCombat')(encounter, { round: 1, turn: 0 }, { direction: 1 }, 'gm');
    await new Promise<void>((resolve) => setTimeout(resolve, 130));
    expect(events).toHaveLength(0);
    handlers.get('combatTurnChange')(encounter,
      { round: 0, turn: null, combatantId: null },
      { round: 1, turn: 0, combatantId: combatant.id });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(events.map((event) => [event.event.type, event.document])).toEqual([['combatTurnStart', target]]);
  });

  test('captures native hook payloads by combatant ID across rapid mutable state changes', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first');
    const secondActor = actor('second');
    const firstCombatant = { id: 'first-combatant', actor: firstActor, token: { id: 'first-token' } };
    const secondCombatant = { id: 'second-combatant', actor: secondActor, token: { id: 'second-token' } };
    const encounter = combat([firstCombatant, secondCombatant]);
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    const handlers = new Map<string, any>();
    globals.Hooks = {
      on: (name: string, handler: any) => { handlers.set(name, handler); return name; },
      off: () => {},
    };
    const contexts: any[] = [];
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    let resolveSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const secondFinished = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async (context) => {
        contexts.push(context);
        if (contexts.length === 1) {
          firstStarted();
          await firstGate;
        } else resolveSecond();
      },
    });
    runtimes.push(runtime);
    await runtime.start();

    const native = handlers.get('combatTurnChange');
    encounter.round = 1;
    encounter.turn = 0;
    native(encounter,
      { round: 0, turn: null, combatantId: null },
      { round: 1, turn: 0, combatantId: firstCombatant.id });
    await firstStarted;

    encounter.turn = 1;
    encounter.turns = [secondCombatant, firstCombatant];
    encounter.combatants = [secondCombatant, firstCombatant];
    native(encounter,
      { round: 1, turn: 0, combatantId: firstCombatant.id },
      { round: 1, turn: 1, combatantId: secondCombatant.id });
    releaseFirst();
    await secondFinished;
    expect(contexts.map((context) => [context.combatant, context.actor, context.key, context.userId]))
      .toEqual([
        [firstCombatant, firstActor, 'Combat.encounter:1:0', undefined],
        [secondCombatant, secondActor, 'Combat.encounter:1:1', undefined],
      ]);
  });

  test('does not replay ready history, reset updates, rewinds, or revisits through the native hook', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first');
    const secondActor = actor('second');
    const firstCombatant = { id: 'first-combatant', actor: firstActor };
    const secondCombatant = { id: 'second-combatant', actor: secondActor };
    const encounter = combat([firstCombatant, secondCombatant], 1, 0);
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    const handlers = new Map<string, any>();
    globals.Hooks = {
      on: (name: string, handler: any) => { handlers.set(name, handler); return name; },
      off: () => {},
    };
    const contexts: any[] = [];
    let resolveForward!: () => void;
    const forwardFinished = new Promise<void>((resolve) => { resolveForward = resolve; });
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async (context) => {
        contexts.push(context);
        if (context.turn === 1) resolveForward();
      },
    });
    runtimes.push(runtime);
    await runtime.start();
    const native = handlers.get('combatTurnChange');

    // The current ready state is historical and must not replay.
    native(encounter,
      { round: 0, turn: null, combatantId: null },
      { round: 1, turn: 0, combatantId: firstCombatant.id });
    await Promise.resolve();
    expect(contexts).toHaveLength(0);

    // An update with no lifecycle hook (such as resetAll's suppressed events) is inert.
    handlers.get('updateCombat')(encounter, { combatants: [] }, { turnEvents: false }, 'gm');
    expect(contexts).toHaveLength(0);

    native(encounter,
      { round: 1, turn: 0, combatantId: firstCombatant.id },
      { round: 1, turn: 1, combatantId: secondCombatant.id });
    await forwardFinished;
    expect(contexts.map((context) => context.key)).toEqual(['Combat.encounter:1:1']);

    native(encounter,
      { round: 1, turn: 1, combatantId: secondCombatant.id },
      { round: 1, turn: 0, combatantId: firstCombatant.id });
    native(encounter,
      { round: 1, turn: 0, combatantId: firstCombatant.id },
      { round: 1, turn: 1, combatantId: secondCombatant.id });
    await Promise.resolve();
    await Promise.resolve();
    expect(contexts.map((context) => context.key)).toEqual(['Combat.encounter:1:1']);
  });

  test('only the active GM executes and missing actors fail closed while missing tokens remain valid', async () => {
    const active = { id: 'active', isGM: true, active: true };
    const other = { id: 'other', isGM: true, active: true };
    const target = actor('target');
    const encounter = combat([{ id: 'target', actor: target }]);
    const globals = globalsFor(other, [target], [encounter]);
    globals.game.users.activeGM = active;
    const contexts: any[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async (context) => { contexts.push(context); },
    });
    runtimes.push(runtime);
    await runtime.start();
    encounter.round = 1;
    encounter.turn = 0;
    expect((await runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 }, {}, 'other')).skippedReason).toBe('inactive-gm');
    expect(contexts).toHaveLength(0);

    globals.game.user = active;
    encounter.turn = 0;
    encounter.round = 2;
    expect((await runtime.handleCombatUpdate(encounter, { round: 2, turn: 0 }, { direction: 1 }, 'active')).skippedReason).toBeUndefined();
    expect(contexts[0]).toMatchObject({ actor: target, token: undefined, userId: 'active' });

    const missingEncounter = combat([{ id: 'missing', token: { id: 'orphan' } }], 0, null);
    const missingRuntime = new TriggerEngineRuntime({
      globals: globalsFor(active, [], [missingEncounter]),
      storage: new MemoryTriggerStorage(),
      onCombatTurnStart: async () => { throw new Error('must not run'); },
    });
    runtimes.push(missingRuntime);
    await missingRuntime.start();
    missingEncounter.round = 1;
    missingEncounter.turn = 0;
    expect((await missingRuntime.handleCombatUpdate(missingEncounter, { round: 1, turn: 0 }, {}, 'active')).skippedReason).toBe('missing-actor');
  });

  test('cleans both update hooks when stopped', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const handlers = new Map<string, unknown>();
    const removed: string[] = [];
    const globals = globalsFor(gm, [], []);
    globals.Hooks = {
      on: (name: string, handler: unknown) => { handlers.set(name, handler); return name; },
      off: (name: string) => { removed.push(name); handlers.delete(name); },
    };
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage() });
    await runtime.start();
    expect(handlers.has('updateActor')).toBeTrue();
    expect(handlers.has('updateCombat')).toBeTrue();
    expect(handlers.has('combatTurnChange')).toBeTrue();
    const registered = [...handlers.keys()].sort();
    await runtime.stop();
    expect(removed.sort()).toEqual(registered);
    expect(handlers.size).toBe(0);
  });

  test('preserves the existing Actor causal recursion guard alongside combat support', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor('target', 10);
    let runtime!: TriggerEngineRuntime;
    let nestedReport: any;
    runtime = new TriggerEngineRuntime({
      globals: globalsFor(gm, [target], []),
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [documentTrigger('actor-loop')] }),
      macroResolver: async () => ({ execute: async ({ triggerContext }: any) => {
        if (!nestedReport) {
          target.set('system.attributes.hp.value', 9);
          nestedReport = await triggerContext.updateDocument({ 'system.attributes.hp.value': 9 });
        }
      } }),
    });
    target.update = async (changes: any, options: unknown = {}) => {
      target.set('system.attributes.hp.value', changes['system.attributes.hp.value']);
      return runtime.handleDocumentUpdate(target, changes, options, 'gm');
    };
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 8);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 8 }, {}, 'gm');
    expect(report.results[0]?.status).toBe('executed');
    expect(nestedReport.results[0]?.status).toBe('skipped');
  });

  test('publishes both generic turn-end and turn-start events to subscribers', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const firstActor = actor('first');
    const secondActor = actor('second');
    const firstCombatant = { id: 'first-combatant', actor: firstActor };
    const secondCombatant = { id: 'second-combatant', actor: secondActor };
    const encounter = combat([firstCombatant, secondCombatant]);
    const handlers = new Map<string, any>();
    const globals = globalsFor(gm, [firstActor, secondActor], [encounter]);
    globals.Hooks = { on: (name: string, handler: any) => { handlers.set(name, handler); return name; }, off: () => {}, callAll: () => {} };
    const events: any[] = [];
    const macroEvents: string[] = [];
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [
      combatTrigger('end-macro', 'end', { event: { type: 'combatTurnEnd', documentType: 'Actor' } }),
    ] }), macroResolver: () => ({ execute: ({ triggerContext }: any) => { macroEvents.push(triggerContext.event.type); } }) });
    runtimes.push(runtime);
    await runtime.start();
    runtime.subscribe((context) => { events.push(context); });

    encounter.round = 1;
    encounter.turn = 0;
    await runtime.handleCombatUpdate(encounter, { round: 1, turn: 0 }, {}, 'gm');
    encounter.turn = 1;
    handlers.get('combatTurnChange')(encounter,
      { round: 1, turn: 0, combatantId: firstCombatant.id },
      { round: 1, turn: 1, combatantId: secondCombatant.id });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(events.map((event) => [event.event.type, event.document])).toEqual([
      ['combatTurnStart', firstActor],
      ['combatTurnEnd', firstActor],
      ['combatTurnStart', secondActor],
    ]);
    expect(macroEvents).toEqual(['combatTurnEnd']);
  });
});

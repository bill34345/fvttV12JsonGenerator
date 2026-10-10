import { expect, test } from 'bun:test';
import { installStatusLifecycles, type StatusLifecycleEntry, type StatusLifecycleRule } from '../src/statusLifecycleRuntime';
import observedMidiCards from './fixtures/midi-status-attack-card.json';
import nativeConditions from './fixtures/native-conditions-5.3.3.json';

function fixture(status: StatusLifecycleRule['parameters']['status'] = 'blinded', unit: 'minute' | 'round' = 'minute') {
  const hooks = new Map<string, (...args: any[]) => unknown>();
  const actor: any = { uuid: 'Actor.target', name: 'Target', scores: [] as Array<number | null>, calls: [] as any[], async rollSavingThrow(...args: any[]) {
    this.calls.push(args); const score = this.scores.shift(); return score === null ? null : [{ total: score ?? 1 }];
  } };
  const target = { id: 'target', uuid: 'Scene.scene.Token.target', actor };
  const sourceActor = { uuid: 'Actor.source' }, source = { id: 'source', uuid: 'Scene.scene.Token.source', actor: sourceActor };
  const item = { id: 'strike', uuid: 'Actor.source.Item.strike', actor: sourceActor };
  const activity = { id: 'attack', uuid: `${item.uuid}.Activity.attack`, actor: sourceActor, item };
  const rule: StatusLifecycleRule = { id: 'strike-status', kind: 'status-lifecycle', actorKey: 'source', itemName: 'Strike', parameters: {
    trigger: 'attack-hit', status, duration: { value: 1, unit }, repeatSave: { ability: 'con', dc: 15, timing: 'target-turn-end', optional: true },
  } };
  const combat = { uuid: 'Combat.combat', round: 1, turn: 0, combatants: [{ tokenId: target.id }, { tokenId: source.id }] };
  let listener: (context: any) => void = () => {}, queue = Promise.resolve(), active = true;
  const entries: StatusLifecycleEntry[] = [], history: any[] = [], notices: string[] = [], answers: boolean[] = [];
  const trigger = { active: true, api: { apiVersion: 1, subscribe: (callback: any) => { listener = callback; return () => { listener = () => {}; }; } } };
  const env: any = { game: { modules: new Map([['fvtt-trigger-engine', trigger]]), user: { id: 'gm', targets: new Set([target]) },
    messages: new Map(), time: { worldTime: 0 }, combat, combats: [combat] }, CONFIG: { time: { roundTime: 6 } },
    canvas: { tokens: new Map([[target.id, target], [source.id, source]]) }, Hooks: { on: (name: string, cb: any) => { hooks.set(name, cb); return name; }, off: (name: string) => hooks.delete(name) },
    DialogV2: { confirm: async () => answers.shift() ?? true } };
  const ports = { assertLive: () => { if (!active) throw new Error('inactive GM'); }, ruleForActivity: (subject: any) => subject === activity ? rule : undefined,
    sourceToken: () => { if (env.canvas.tokens.get(source.id) !== source) throw new Error('source changed'); return source; },
    entries: () => entries, apply: async (selected: StatusLifecycleRule, _source: any, _target: any, lifecycle: any) => {
      entries.push({ actor, status: selected.parameters.status, claim: { ruleId: rule.id, groupId: globalThis.crypto.randomUUID(), targetActorUuid: actor.uuid, lifecycle } });
    }, update: async (entry: any, lifecycle: any) => { entry.claim.lifecycle = lifecycle; },
    remove: async (entry: any) => { const index = entries.indexOf(entry); if (index >= 0) entries.splice(index, 1); },
    enqueue: (operation: () => Promise<unknown>) => { queue = queue.then(async () => { await operation(); }); },
    record: (type: string, detail: any) => history.push({ type, ...detail }), notify: (message: string) => notices.push(message),
  };
  const start = () => installStatusLifecycles(env, [rule], ports);
  const attack = (total = 18, options: any = {}) => {
    const data: any = { data: { flags: {} } };
    hooks.get('dnd5e.preRollAttack')?.({ subject: activity }, {}, data);
    const message: any = { id: globalThis.crypto.randomUUID(), author: { id: options.author ?? 'gm' }, flags: {
      ...data.data.flags, dnd5e: { roll: { type: 'attack' }, activity: { uuid: activity.uuid }, item: { uuid: item.uuid },
        targets: [{ uuid: actor.uuid, ac: options.ac === undefined ? 15 : options.ac }] },
    } };
    env.game.messages.set(message.id, message);
    const roll = { total, parent: message, isCritical: options.critical ?? false, isFumble: options.fumble ?? false };
    if (options.mutate) options.mutate({ message, roll, data });
    if (!options.cancel) hooks.get('dnd5e.postRollAttack')?.([roll], { subject: activity });
    return () => hooks.get('dnd5e.postRollAttack')?.([roll], { subject: activity });
  };
  const end = (key = 'turn-1') => listener({ event: { type: 'combatTurnEnd' }, key, token: target, combatUuid: combat.uuid, round: combat.round, turn: combat.turn });
  return { env, actor, item, activity, rule, target, source, hooks, entries, history, notices, answers, start, attack, end, settle: () => queue, inactive: () => { active = false; } };
}

function midiFixture(index = 1, options: any = {}) {
  const observed = observedMidiCards.cases[index]!, f = fixture('blinded', options.unit ?? 'minute');
  const flags: any = structuredClone(observed.flags);
  f.actor.uuid = flags.dnd5e.targets[0].uuid;
  f.source.actor.uuid = flags.dnd5e.item.uuid.split('.Item.')[0];
  f.item.uuid = flags.dnd5e.item.uuid; f.item.id = flags.dnd5e.item.id;
  f.activity.uuid = flags.dnd5e.activity.uuid; f.activity.id = flags.dnd5e.activity.id;
  f.source.uuid = flags['midi-qol'].attackingTokenUuid; f.source.id = f.source.uuid.split('.').at(-1)!;
  f.target.uuid = flags['midi-qol'].targets[0].uuid; f.target.id = f.target.uuid.split('.').at(-1)!;
  f.env.canvas.tokens = new Map([[f.source.id, f.source], [f.target.id, f.target]]);
  f.env.game.combat.combatants = [{ tokenId: f.source.id }, { tokenId: f.target.id }];
  f.env.game.modules.set('midi-qol', { active: true, version: options.version ?? '14.0.11' });
  const workflows = new Map<string, any>();
  f.env.MidiQOL = { Workflow: { getWorkflow: (id: string) => workflows.get(id) } };
  const card: any = { id: observed.id, author: { id: 'gm' }, speaker: observed.speaker, flags, rolls: [] };
  f.env.game.messages.set(card.id, card);
  const workflow: any = { id: `ChatMessage.${card.id}`, activity: f.activity, actor: f.source.actor, item: f.item, token: f.source,
    targets: new Set([f.target]), hitTargets: new Set(flags['midi-qol'].isHit ? [f.target] : []), itemCardId: card.id,
    attackRollCount: flags['midi-qol'].attackRollCount, aborted: false };
  workflows.set(workflow.id, workflow);
  const config = { subject: f.activity, workflow }, messageConfig: any = { create: false, data: { flags: {} } };
  const stop = f.start();
  f.hooks.get('dnd5e.preRollAttack')?.(config, {}, messageConfig);
  const roll: any = { formula: observed.roll.formula, total: undefined, isCritical: false, isFumble: false, options: {} };
  f.hooks.get('dnd5e.postAttackRollConfiguration')?.([roll], config, {}, messageConfig);
  Object.assign(roll, observed.roll); workflow.attackRoll = roll; workflow.attackTotal = roll.total;
  card.rolls = [{ ...observed.roll, options: { 'midi-qol': { rollType: 'attack' } } }];
  return { ...f, workflow, card, roll, config, messageConfig, workflows, stop,
    native: () => f.hooks.get('dnd5e.postRollAttack')?.([roll], { subject: f.activity }),
    complete: () => f.hooks.get('midi-qol.AttackRollComplete')?.(workflow),
  };
}

test('actual MIDI same-card miss/hit shapes wait for confirmed hit and consume one native roll once', async () => {
  const miss = midiFixture(0); miss.native(); miss.complete(); await miss.settle(); expect(miss.entries).toHaveLength(0); miss.stop();
  const hit = midiFixture(1); hit.native(); await hit.settle(); expect(hit.entries).toHaveLength(0);
  hit.complete(); await hit.settle(); expect(hit.entries).toHaveLength(1);
  expect(hit.entries[0]!.claim.lifecycle.messageId).toBe(hit.card.id);
  hit.complete(); hit.native(); await hit.settle(); expect(hit.entries).toHaveLength(1); hit.stop();
});

test('an unverified MIDI version fails closed with a GM-visible explanation', async () => {
  const f = midiFixture(1, { version: '14.0.12' }); f.native(); f.complete(); await f.settle();
  expect(f.entries).toHaveLength(0); expect(f.notices.some(message => message.includes('Midi-QOL'))).toBe(true); f.stop();
});

test('MIDI waits for the persistent card rather than a cached clone and ignores duplicate card updates', async () => {
  const f = midiFixture(), finalFlags = structuredClone(f.card.flags), finalRolls = f.card.rolls;
  f.workflow.chatCard = { ...f.card, flags: finalFlags, rolls: finalRolls };
  f.card.flags = { ...f.card.flags, 'midi-qol': { ...f.card.flags['midi-qol'], attackRollCount: 0 } }; f.card.rolls = [];
  f.native(); f.complete(); await f.settle(); expect(f.entries).toHaveLength(0);
  f.card.flags = finalFlags; f.card.rolls = finalRolls;
  f.hooks.get('updateChatMessage')?.(f.card); await f.settle(); expect(f.entries).toHaveLength(1);
  f.hooks.get('updateChatMessage')?.(f.card); f.complete(); await f.settle(); expect(f.entries).toHaveLength(1); f.stop();
});

test('MIDI confirmed targets decide the hit even if a separate native message would suggest a hit', async () => {
  const f = midiFixture();
  f.roll.parent = { id: 'native', author: { id: 'gm' }, flags: { ...f.messageConfig.data.flags,
    dnd5e: { ...f.card.flags.dnd5e, roll: { type: 'attack' } } } };
  f.env.game.messages.set('native', f.roll.parent);
  f.native(); await f.settle(); expect(f.entries).toHaveLength(0);
  f.workflow.hitTargets.clear(); f.card.flags['midi-qol'].isHit = false; f.card.flags['midi-qol'].hitTargetUuids = [];
  f.complete(); await f.settle(); expect(f.entries).toHaveLength(0);
  expect(f.history.some(entry => entry.type === 'status-lifecycle-attack' && entry.hit === false && entry.transport === 'midi-qol')).toBe(true);
  f.stop();
});

test('delayed MIDI persistence retains the confirmed hit time and cannot renew an expired minute or round', async () => {
  for (const unit of ['minute', 'round']) {
    const f = midiFixture(1, { unit }), count = f.card.flags['midi-qol'].attackRollCount;
    f.card.flags['midi-qol'].attackRollCount = 0; f.complete(); await f.settle(); expect(f.entries).toHaveLength(0);
    if (unit === 'minute') f.env.game.time.worldTime = 60;
    else f.env.game.combat.round = 2;
    f.card.flags['midi-qol'].attackRollCount = count; f.hooks.get('updateChatMessage')?.(f.card); await f.settle();
    expect(f.entries).toHaveLength(0);
    expect(f.history.some(entry => entry.type === 'status-lifecycle-expired-before-apply')).toBe(true); f.stop();
  }
  const f = midiFixture(), count = f.card.flags['midi-qol'].attackRollCount;
  f.card.flags['midi-qol'].attackRollCount = 0; f.complete(); await f.settle(); f.env.game.time.worldTime = 30;
  f.card.flags['midi-qol'].attackRollCount = count; f.hooks.get('updateChatMessage')?.(f.card); await f.settle();
  expect(f.entries[0]!.claim.lifecycle).toMatchObject({ startedAt: 0, expiresAt: 60 }); f.stop();
});

test('changing the current combat while a MIDI card persists does not move the hit combat anchor', async () => {
  const f = midiFixture(1, { unit: 'round' }), original = f.env.game.combat, count = f.card.flags['midi-qol'].attackRollCount;
  f.card.flags['midi-qol'].attackRollCount = 0; f.complete(); await f.settle();
  f.env.game.combat = { ...original, uuid: 'Combat.other', round: 10, turn: 1 };
  f.env.game.combats = [original, f.env.game.combat];
  f.card.flags['midi-qol'].attackRollCount = count; f.hooks.get('updateChatMessage')?.(f.card); await f.settle();
  expect(f.entries[0]!.claim.lifecycle).toMatchObject({ combatUuid: original.uuid, startRound: 1, startTurn: 0 }); f.stop();
});

test('MIDI rejects unregistered/replaced rolls, wrong identities, targets, card facts, permissions, and cancelled workflows', async () => {
  const changes: Array<(f: ReturnType<typeof midiFixture>) => void> = [
    f => f.workflows.clear(),
    f => { f.workflow.attackRoll = { ...f.roll }; },
    f => { f.workflow.aborted = true; },
    f => { f.workflow.activity = { ...f.activity, uuid: 'foreign' }; },
    f => { f.workflow.item = { ...f.item, uuid: 'foreign' }; },
    f => { f.workflow.itemCardId = 'foreign'; },
    f => { f.workflow.actor = { uuid: 'Actor.foreign' }; },
    f => { f.workflow.targets = new Set([{ ...f.target, uuid: 'Scene.foreign.Token.foreign' }]); },
    f => { f.workflow.hitTargets = new Set([{ ...f.target, uuid: 'Scene.foreign.Token.foreign' }]); },
    f => { f.card.author.id = 'other'; },
    f => { f.card.flags.dnd5e.targets[0].ac = null; },
    f => { f.card.flags['midi-qol'].activityUuid = 'foreign'; },
    f => { f.card.flags['midi-qol'].attackRollCount++; },
    f => { f.card.flags['midi-qol'].hitTargetUuids = ['Scene.foreign.Token.foreign']; },
    f => { f.card.rolls[0].total++; },
    f => { f.env.game.messages.delete(f.card.id); },
    f => { f.env.canvas.tokens.delete(f.target.id); },
    f => f.inactive(),
  ];
  for (const change of changes) {
    const f = midiFixture(); await f.settle(); change(f); f.native(); f.complete(); await f.settle();
    expect(f.entries).toHaveLength(0); f.stop();
  }
  const stopped = midiFixture(); await stopped.settle(); stopped.stop(); stopped.complete(); await stopped.settle();
  expect(stopped.entries).toHaveLength(0);
});

test('confirmed native hit creates one claim; duplicate completion, miss, cancelled roll and total cover create none', async () => {
  const f = fixture(), stop = f.start();
  const replay = f.attack(); await f.settle(); expect(f.entries).toHaveLength(1);
  replay(); f.attack(14); f.attack(30, { fumble: true }); f.attack(20, { cancel: true }); f.attack(20, { ac: null });
  await f.settle(); expect(f.entries).toHaveLength(1);
  f.attack(2, { critical: true }); await f.settle(); expect(f.entries).toHaveLength(2);
  stop();
});

test('all fourteen native status variants use the same executor and source-backed save parameters', async () => {
  for (const [index, { id: status }] of nativeConditions.conditions.entries()) {
    const f = fixture(status as any); f.rule.parameters.repeatSave.ability = index % 2 ? 'wis' : 'con'; f.rule.parameters.repeatSave.dc = 13 + index;
    const stop = f.start(); f.attack(); await f.settle(); f.actor.scores.push(30); f.end(); await f.settle();
    expect(f.entries).toHaveLength(0);
    expect(f.actor.calls[0]).toEqual([{ ability: f.rule.parameters.repeatSave.ability, target: 13 + index }, { configure: true }, { rollMode: 'gmroll' }]);
    stop();
  }
});

test('skip, cancellation and failed repeat save retain condition; success removes only its source', async () => {
  const f = fixture(), stop = f.start(); f.attack(); await f.settle();
  const foreign = { actor: f.actor, status: 'blinded', claim: { ruleId: 'foreign', groupId: 'foreign', targetActorUuid: f.actor.uuid, lifecycle: {} } };
  f.entries.push(foreign);
  f.answers.push(false); f.end('skip'); await f.settle(); expect(f.actor.calls).toHaveLength(0);
  f.actor.scores.push(null); f.end('cancel'); await f.settle(); expect(f.entries).toHaveLength(2);
  f.actor.scores.push(14); f.end('fail'); await f.settle(); expect(f.entries).toHaveLength(2);
  f.actor.scores.push(15); f.end('success'); await f.settle(); expect(f.entries).toEqual([foreign]);
  stop();
});

test('persisted turn offer survives reinstallation; elapsed minute expires on world time, not wall clock', async () => {
  const f = fixture(); let stop = f.start(); f.attack(); await f.settle();
  f.answers.push(false); f.end('same-turn'); await f.settle(); stop();
  stop = f.start(); f.end('same-turn'); await f.settle(); expect(f.actor.calls).toHaveLength(0);
  f.env.game.time.worldTime = 59; f.hooks.get('updateWorldTime')?.(); await f.settle(); expect(f.entries).toHaveLength(1);
  f.env.game.time.worldTime = 60; f.hooks.get('updateWorldTime')?.(); await f.settle(); expect(f.entries).toHaveLength(0);
  stop();
});

test('round duration remains tied to bound combat round and turn, despite unrelated world-time advance', async () => {
  const f = fixture('frightened', 'round'), stop = f.start(); f.env.game.combat.turn = 1;
  f.attack(); await f.settle(); expect(f.entries).toHaveLength(1);
  f.env.game.time.worldTime = 500; f.hooks.get('updateWorldTime')?.(); await f.settle(); expect(f.entries).toHaveLength(1);
  f.env.game.combat.round = 2; f.env.game.combat.turn = 0; f.answers.push(false); f.end('before-anchor'); await f.settle(); expect(f.entries).toHaveLength(1);
  f.env.game.combat.turn = 1; f.end('at-anchor'); await f.settle(); expect(f.entries).toHaveLength(0);
  stop();
});

test('identity mismatch, ambiguous targets, inactive GM and stopping during a save cannot apply/remove effects', async () => {
  const f = fixture(), stop = f.start();
  f.attack(20, { author: 'other' }); f.attack(20, { mutate: ({ message }: any) => { message.flags.dnd5e.targets[0].uuid = 'Actor.wrong'; } });
  await f.settle(); expect(f.entries).toHaveLength(0);
  f.env.game.user.targets.add({ id: 'other', actor: { uuid: 'Actor.other' } }); f.attack(); await f.settle(); expect(f.entries).toHaveLength(0);
  f.env.game.user.targets = new Set([f.target]); f.attack(); await f.settle();
  f.env.DialogV2.confirm = async () => { stop(); return true; };
  f.end(); await expect(f.settle()).rejects.toThrow('已停止'); expect(f.entries).toHaveLength(1); expect(f.actor.calls).toHaveLength(0);
  const other = fixture(); const stopOther = other.start(); await other.settle(); other.inactive(); other.attack(); expect(other.entries).toHaveLength(0); stopOther();
});

test('missing Trigger Engine rejects before registering attack hooks or changing state', () => {
  const f = fixture(); f.env.game.modules.clear(); expect(() => f.start()).toThrow('Trigger Engine');
  expect(f.hooks.size).toBe(0); expect(f.entries).toHaveLength(0);
});

test('ending or deleting the original combat falls back to the saved world deadline, including reload', async () => {
  for (const removed of [false, true]) {
    const f = fixture('blinded', 'round'); let stop = f.start(); f.attack(); await f.settle();
    if (removed) { f.env.game.combats = []; f.env.game.combat = null; f.hooks.get('deleteCombat')?.(); }
    else { f.env.game.combat.round = 0; f.env.game.combat.turn = null; f.hooks.get('updateCombat')?.(); }
    await f.settle(); expect(f.entries).toHaveLength(1); stop();
    f.env.game.time.worldTime = 6; stop = f.start(); await f.settle(); expect(f.entries).toHaveLength(0); stop();
  }
});

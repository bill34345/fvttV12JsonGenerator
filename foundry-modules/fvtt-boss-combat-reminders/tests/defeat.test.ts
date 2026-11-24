import { expect, test } from 'bun:test';
import { DefeatReminders } from '../src/defeat.ts';
import { MODULE_ID } from '../src/types.ts';
import type { Combatant, NativeActor, NativeCombat, NativeItem, ReminderCard } from '../src/types.ts';

function fixture(traits: readonly [string, string, unknown?][]) {
  const flags: Record<string, unknown> = {};
  const entryFlags: Record<string, unknown> = {};
  const items = traits.map(([id, body, manual]) => ({
    id,
    name: id,
    system: { description: { value: body } },
    getFlag: (_scope: string, key: string) => key === 'healthTrigger' ? manual : undefined,
  } as unknown as NativeItem));
  const actor: NativeActor = {
    uuid: 'Actor.monster',
    documentName: 'Actor',
    name: 'Zombie',
    system: { isNPC: true, attributes: { hp: { value: 15, max: 15 } } },
    items,
    statuses: new Set<string>(),
    getFlag: (_scope, key) => flags[key],
    setFlag: async (_scope, key, value) => { flags[key] = value; },
  };
  const entry: Combatant = {
    id: 'npc', name: 'Zombie', actor, initiative: 10, defeated: false,
    getFlag: (_scope, key) => entryFlags[key],
    setFlag: async (_scope, key, value) => { entryFlags[key] = value; },
  };
  const rows = new Map([[entry.id, entry]]);
  const combat: NativeCombat = {
    id: 'combat',
    active: true,
    started: true,
    combatants: { get: id => rows.get(id), [Symbol.iterator]: () => rows.values() },
    current: { round: 1, turn: 0, combatantId: entry.id },
  };
  let card: ReminderCard | undefined;
  let finished = 0;
  const runtime = new DefeatReminders({
    isActiveGM: () => true, combat: () => combat, message: () => undefined,
    format: key => key,
    useActivity: async () => true,
  }, {
    show: value => { card = value; },
    remove: () => { card = undefined; },
    clear: () => { card = undefined; },
  }, () => 'dead', async () => { finished++; });
  return {
    actor,
    combat,
    runtime,
    card: () => card,
    finished: () => finished,
    hp(value: number) {
      const update: Parameters<DefeatReminders['prepare']>[1] = { system: { attributes: { hp: { value } } } };
      runtime.prepare(actor, update);
      actor.system.attributes!.hp!.value = value;
      Object.assign(flags, update.flags?.[MODULE_ID]);
      runtime.observe(actor);
    },
    async choose(id: string) {
      const choice = card?.groups[0]?.choices.find(choice => choice.id === id);
      expect(choice).toBeDefined();
      await choice?.run(new Event('click'));
    },
  };
}

test('a creature with both timings waits for the zero-HP ruling before surfacing death abilities', async () => {
  const f = fixture([
    ['fortitude', 'If damage reduces the zombie to 0 Hit Points, it saves.'],
    ['burst', 'When the zombie dies, it explodes.'],
  ]);
  f.hp(0);
  expect(f.card()?.groups[0]?.choices.map(choice => choice.id)).toEqual(['fortitude', 'defeat-alive', 'defeat-confirm']);
  expect(f.runtime.allowEnd(f.combat, () => {})).toBe(false);
  expect(f.runtime.holdStatus({ id: 'dead', parent: f.actor, delete: async () => {} }, { statuses: ['dead'] })).toBe(true);
  await f.choose('defeat-confirm');
  expect(f.card()?.groups[0]?.choices.map(choice => choice.id)).toEqual(['burst', 'defeat-finish', 'defeat-skip']);
  expect(f.finished()).toBe(0);
  await f.choose('defeat-finish');
  expect(f.finished()).toBe(1);
  expect(f.runtime.pending(f.actor)).toBeUndefined();
  expect(f.runtime.allowEnd(f.combat, () => {})).toBe(true);
});

test('restoring positive HP clears a pending defeat and another zero crossing can be handled', () => {
  const f = fixture([['fortitude', 'If damage reduces the zombie to 0 Hit Points, it saves.']]);
  f.hp(0);
  expect(f.runtime.pending(f.actor)?.stage).toBe('zero');
  f.hp(1);
  expect(f.card()).toBeUndefined();
  expect(f.runtime.pending(f.actor)).toBeUndefined();
  expect(f.finished()).toBe(0);
  f.hp(0);
  expect(f.runtime.pending(f.actor)?.stage).toBe('zero');
});

test('only an eligible explicit bloodied-at-zero ability enters the held zero stage', () => {
  const traits: [string, string, unknown?][] = [
    ['ordinary', 'When the zombie becomes Bloodied, it splits.'],
    ['last-response', '', { kind: 'bloodied', atZero: true, once: true }],
  ];
  const f = fixture(traits);
  f.actor.system.attributes!.hp!.bloodied = 75;
  f.hp(0);
  expect(f.runtime.pending(f.actor)?.stage).toBe('zero');
  expect(f.card()?.groups[0]?.choices.map(choice => choice.id)).toEqual(['last-response', 'defeat-alive', 'defeat-finish']);
  f.runtime.showPending();
  expect(f.card()?.groups[0]?.choices[0]?.id).toBe('last-response');
  f.hp(15);
  f.hp(0);
  expect(f.runtime.pending(f.actor)).toBeUndefined();

  const alreadyMarked = fixture(traits);
  (alreadyMarked.actor.statuses as Set<string>).add('bloodied');
  alreadyMarked.hp(0);
  expect(alreadyMarked.runtime.pending(alreadyMarked.actor)).toBeUndefined();
  const alreadyBelow = fixture(traits);
  alreadyBelow.actor.system.attributes!.hp!.bloodied = 75;
  alreadyBelow.hp(10);
  alreadyBelow.hp(0);
  expect(alreadyBelow.runtime.pending(alreadyBelow.actor)).toBeUndefined();
});

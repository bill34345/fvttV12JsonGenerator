import { expect, test } from 'bun:test';
import { CombatReminders } from '../src/runtime.ts';
import { applyBloodiedFrenzy, clearBloodiedFrenzy, frenzyAlreadyApplied } from '../src/bloodied-effect.ts';
import type { Combatant, NativeActor, NativeCombat, NativeEffect, NativeItem, ReminderCard, TurnState } from '../src/types.ts';

test('instant, own-turn and ongoing descriptions use distinct reminder schedules', () => {
  const specs = [
    ['pudding', 'Black Pudding', 'When it becomes Bloodied, it splits.'],
    ['golem', 'Clay Golem', 'Whenever the golem starts its turn Bloodied, roll 1d6.'],
    ['berserker', 'Berserker', 'While Bloodied, the berserker has Advantage on attack rolls and saving throws.'],
  ] as const;
  const entries = specs.map(([id, name, body], initiative) => {
    const actor: NativeActor = {
      uuid: `Actor.${id}`, name, system: { isNPC: true, attributes: { hp: { value: 100, max: 100, bloodied: 75 } } },
      statuses: new Set(), items: [{ id: 'trait', name: 'Trait', system: { description: { value: body } },
        getFlag: () => undefined } as unknown as NativeItem],
      getFlag: () => undefined, setFlag: async () => undefined,
    };
    return { id, name, actor, initiative } satisfies Combatant;
  });
  const [pudding, golem, berserker] = entries as [typeof entries[number], typeof entries[number], typeof entries[number]];
  const combat: NativeCombat = {
    id: 'fight', active: true, started: true,
    combatants: { get: id => entries.find(entry => entry.id === id), [Symbol.iterator]: () => entries.values() },
    current: { round: 1, turn: 0, combatantId: pudding.id },
  };
  const shown: ReminderCard[] = [];
  const runtime = new CombatReminders({
    isActiveGM: () => true, combat: () => combat, format: key => key, message: () => undefined,
    useActivity: async () => true,
  }, { show: card => shown.push(card), remove: () => {}, clear: () => {} });
  runtime.seedHealth();
  const damageOrHeal = (actor: NativeActor, value: number) => {
    actor.system.attributes!.hp!.value = value;
    runtime.healthChanged(actor);
  };
  const mark = (actor: NativeActor, active: boolean) => {
    const statuses = actor.statuses as Set<string>;
    if (active) statuses.add('bloodied');
    else statuses.delete('bloodied');
    runtime.bloodiedStateChanged(actor);
  };
  const turn = (round: number, index: number, combatantId: string) => {
    const next: TurnState = { round, turn: index, combatantId };
    const previous = combat.current;
    combat.current = next;
    runtime.turnChanged(combat, previous, next);
    runtime.turnChanged(combat, previous, next);
  };
  const ids = () => shown.map(card => card.id);

  damageOrHeal(pudding.actor, 75);
  expect(ids()).toEqual([]);
  mark(pudding.actor, true);
  damageOrHeal(pudding.actor, 66);
  expect(ids()).toEqual(['health:bloodied']);
  mark(golem.actor, true);
  expect(ids()).toEqual(['health:bloodied']);
  turn(1, 1, golem.id);
  expect(ids().at(-1)).toBe('health:bloodied-turn');
  mark(berserker.actor, true);
  expect(ids().at(-1)).toBe('health:bloodied-while');
  expect(shown.at(-1)?.persistent).toBe(true);
  expect(shown.at(-1)?.groups[0]?.choices[0]?.id).toBe('apply-bloodied-frenzy:trait');

  turn(1, 2, berserker.id);
  turn(2, 0, pudding.id);
  turn(2, 1, golem.id);
  expect(ids().filter(id => id === 'health:bloodied-turn')).toHaveLength(2);
  expect(ids().filter(id => id === 'health:bloodied-while')).toHaveLength(1);

  mark(golem.actor, false);
  turn(3, 0, pudding.id);
  turn(3, 1, golem.id);
  expect(ids().filter(id => id === 'health:bloodied-turn')).toHaveLength(2);
  damageOrHeal(berserker.actor, 75);
  expect(ids().filter(id => id === 'health:bloodied-while')).toHaveLength(1);
  mark(berserker.actor, false);
  mark(berserker.actor, true);
  expect(ids().filter(id => id === 'health:bloodied-while')).toHaveLength(2);
  damageOrHeal(berserker.actor, 0);
  damageOrHeal(berserker.actor, 1);
  expect(ids().filter(id => id === 'health:bloodied-while')).toHaveLength(3);
  expect(ids().filter(id => id === 'health:bloodied')).toHaveLength(1);

  mark(pudding.actor, false);
  damageOrHeal(pudding.actor, 0);
  damageOrHeal(pudding.actor, 1);
  mark(pudding.actor, true);
  expect(ids().filter(id => id === 'health:bloodied')).toHaveLength(1);
});

test('a native disadvantage does not block frenzy, and healing removes only the owned effect', async () => {
  const item = { id: 'trait', uuid: 'Actor.npc.Item.trait', system: {} } as NativeItem;
  const changes = ['system.rolls.attack.mode', 'system.rolls.ability.save.mode']
    .map(key => ({ key, type: 'subtract', value: 1 }));
  const foreign: NativeEffect = { id: 'foreign', active: true, matchesOrigin: uuid => uuid === item.uuid,
    system: { changes }, delete: async () => undefined };
  const owned: NativeEffect = { id: 'owned', getFlag: (_scope, key) => key === 'bloodiedFrenzy' ? item.id : undefined,
    delete: async () => undefined };
  const removed: string[] = [];
  const statuses = new Set<string>(['bloodied']);
  const actor = {
    statuses, system: { attributes: { hp: { value: 75, max: 100 } } }, appliedEffects: [foreign], effects: [foreign],
    createEmbeddedDocuments: async () => [owned],
    deleteEmbeddedDocuments: async (_type: string, ids: string[]) => { removed.push(...ids); return []; },
  } as unknown as NativeActor;
  expect(frenzyAlreadyApplied(actor, item)).toBe(false);
  for (const change of changes) change.type = 'add';
  expect(frenzyAlreadyApplied(actor, item)).toBe(true);
  foreign.system!.changes = [
    { key: 'attack', type: 'dnd5e.advantage', value: '1' },
    { key: 'save', type: 'dnd5e.advantage', value: '1' },
  ];
  expect(frenzyAlreadyApplied(actor, item)).toBe(true);
  actor.appliedEffects = [];
  expect(await applyBloodiedFrenzy(actor, item)).toBe(true);
  actor.effects = [foreign, owned];
  await clearBloodiedFrenzy(actor);
  expect(removed).toEqual([]);
  statuses.delete('bloodied');
  await clearBloodiedFrenzy(actor);
  expect(removed).toEqual(['owned']);
});

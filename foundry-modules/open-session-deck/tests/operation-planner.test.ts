import { describe, expect, test } from 'bun:test';
import { buildOperationPlan, type DeckOperationId, type DeckOperationPayload } from '../src/operation-planner.ts';
import { Dnd5eAdapter, type Dnd5eRuntime } from '../src/dnd5e-adapter.ts';
import type { DeckActorCard, DeckActorCommands, DeckSnapshot } from '../src/types.ts';

const available = { enabled: true, tooltipKey: 'available' };
const unavailable = { enabled: false, tooltipKey: 'unavailable' };
const commands: DeckActorCommands = {
  damage: available, heal: available, tempHp: available, toggleInspiration: available,
  exhaustionDown: available, exhaustionUp: available, toggleStatus: available,
  openSheet: available, locate: available, setHp: available, setTempHp: available,
  setMaxModifier: available, setAcModifier: available, toggleConcentration: available,
  setDeathSave: available, setInitiative: available, rollInitiative: available,
  toggleVisibility: available, toggleDefeated: available,
};

function card(uuid: string, patch: Partial<DeckActorCard> = {}): DeckActorCard {
  return {
    uuid, id: uuid.split('.').at(-1)!, name: uuid, img: '/portrait.webp', type: 'character',
    players: [], playerNames: '', anyPlayerActive: false,
    hp: { value: 10, max: 20, baseMax: 20, maxModifier: 0, maxModifierDisplay: '0', effectiveMax: 20, temp: 0, percent: 50 },
    ac: 15, acModifier: 0, inspiration: false, exhaustion: 0, death: { success: 0, failure: 0 },
    concentrating: false, statuses: [], statusChoices: [{ id: 'prone', label: 'Prone', active: false }],
    inCombat: false, sources: ['folder'], commands, ...patch,
  };
}

function snapshot(party: readonly DeckActorCard[], combatants: readonly DeckActorCard[] = []): DeckSnapshot {
  return {
    supported: true, coreVersion: '14.368', world: { id: 'world', title: 'World' },
    system: { id: 'dnd5e', version: '6.0.6' }, scene: null, onlineUsers: 1, party,
    encounter: { active: true, uuid: 'Combat.one', id: 'one', round: 1, turn: 0, displayTurn: 1,
      combatants, commands: { previousTurn: available, nextTurn: available, focusCurrent: available, swapInitiative: available, rollNpcInitiative: available } },
    statusOptions: [{ id: 'prone', label: 'Prone' }], partyFolder: { includeDescendants: true, missing: false, options: [] },
    rosterManager: [], stalePinned: [], staleHidden: [], density: 'comfortable', activeTab: 'party', refreshedAt: 0,
  };
}

describe('unified operation planning', () => {
  test('deduplicates a shared Actor across lists and linked combatants, while retaining each encounter instance', () => {
    const hero = card('Actor.hero');
    const first = card(hero.uuid, { combatantId: 'first' });
    const second = card(hero.uuid, { combatantId: 'second' });
    const state = snapshot([hero], [first, second]);
    const selected = [hero, first, second];
    expect(buildOperationPlan(state, selected, 'actor.damage', { amount: 5 })).toEqual({
      eligibleCount: 1, commands: [{ id: 'actor.damage', targetUuid: hero.uuid, amount: 5 }],
    });
    expect(buildOperationPlan(state, selected, 'combat.toggle-visibility', { active: false })).toEqual({
      eligibleCount: 2, commands: [first, second].map((entry) => ({
        id: 'combat.toggle-visibility', targetUuid: hero.uuid, combatUuid: 'Combat.one', combatantId: entry.combatantId, active: false,
      })),
    });
  });

  test('retains separate synthetic Actor UUIDs for two unlinked copies of the same NPC', () => {
    const first = card('Scene.scene.Token.first.Actor.npc', { id: 'npc', type: 'npc', combatantId: 'first' });
    const second = card('Scene.scene.Token.second.Actor.npc', { id: 'npc', type: 'npc', combatantId: 'second' });
    const plan = buildOperationPlan(snapshot([], [first, second]), [first, second], 'actor.heal', { amount: 3 });
    expect(plan.eligibleCount).toBe(2);
    expect(plan.commands.map((command) => command.targetUuid)).toEqual([first.uuid, second.uuid]);
  });

  test('executes inherited synthetic Actor writes before shared bases without reordering combatant actions', async () => {
    const cases: Array<{ operation: DeckOperationId; payload: DeckOperationPayload; hp?: number; level?: number; prone?: boolean }> = [
      { operation: 'actor.damage', payload: { amount: 2 }, hp: 18 },
      { operation: 'actor.heal', payload: { amount: 2 }, hp: 22 },
      { operation: 'actor.adjust-exhaustion', payload: { delta: 1 }, level: 3 },
      { operation: 'actor.adjust-exhaustion', payload: { delta: -1 }, level: 1 },
      { operation: 'actor.set-status', payload: { statusId: 'prone', active: true }, prone: true },
      { operation: 'actor.set-status', payload: { statusId: 'prone', active: false }, prone: false },
    ];
    for (const scenario of cases) {
      const fixture = inheritedActorFixture(scenario.payload.active === false);
      const selected = fixture.cards;
      const state = snapshot([], selected);
      const plan = buildOperationPlan(state, selected, scenario.operation, scenario.payload);
      expect(plan.eligibleCount).toBe(6);
      expect(plan.commands.slice(0, 3).map((command) => command.targetUuid))
        .toEqual(selected.slice(4).map((entry) => entry.uuid));
      for (const command of plan.commands) await fixture.adapter.execute(command);
      for (const actor of fixture.actors.values()) {
        if (scenario.hp !== undefined) expect(actor.system.attributes.hp.value).toBe(scenario.hp);
        if (scenario.level !== undefined) expect(actor.effects.get('dnd5eexhaustion0')?.system.level).toBe(scenario.level);
        if (scenario.prone !== undefined) expect(actor.statuses.has('prone')).toBe(scenario.prone);
      }
      const encounterPlan = buildOperationPlan(state, selected, 'combat.toggle-visibility', { active: false });
      expect(encounterPlan.commands.map((command) => command.combatantId)).toEqual(selected.map((entry) => entry.combatantId));
      const defeatPlan = buildOperationPlan(state, selected, 'combat.toggle-defeated', { active: true });
      expect(defeatPlan.eligibleCount).toBe(7);
      expect(defeatPlan.commands.map((command) => command.combatantId))
        .toEqual([...selected.slice(4), ...selected.slice(0, 4)].map((entry) => entry.combatantId));
    }
  });

  test('maps a party selection to its unique encounter and excludes non-participants from encounter actions', () => {
    const hero = card('Actor.hero');
    const outside = card('Actor.outside');
    const turn = card(hero.uuid, { combatantId: 'hero-turn' });
    const plan = buildOperationPlan(snapshot([hero, outside], [turn]), [hero, outside, turn], 'combat.toggle-defeated', { active: true });
    expect(plan.eligibleCount).toBe(1);
    expect(plan.commands[0]).toEqual({ id: 'combat.toggle-defeated', targetUuid: hero.uuid, combatUuid: 'Combat.one', combatantId: 'hero-turn', active: true });
  });

  test('re-reads current availability and drops stale selections rather than planning writes to removed objects', () => {
    const old = card('Actor.old');
    const hero = card('Actor.hero');
    const current = card(hero.uuid, { commands: { ...commands, damage: unavailable } });
    const state = snapshot([current]);
    expect(buildOperationPlan(state, [old, hero], 'actor.damage', { amount: 4 }).commands).toEqual([]);
    const oldTurn = card(hero.uuid, { combatantId: 'deleted-turn' });
    expect(buildOperationPlan(state, [oldTurn], 'actor.heal', { amount: 4 }).eligibleCount).toBe(0);
    expect(buildOperationPlan({ ...state, supported: false }, [hero], 'actor.heal', { amount: 4 }).eligibleCount).toBe(0);
  });

  test('restricts heroic inspiration and death saves to characters even when NPC command data is permissive', () => {
    const hero = card('Actor.hero');
    const npc = card('Actor.npc', { type: 'npc' });
    const noDeath = card('Actor.no-death', { death: null });
    const state = snapshot([hero, npc, noDeath]);
    expect(buildOperationPlan(state, state.party, 'actor.toggle-inspiration', { active: true }).commands.map((command) => command.targetUuid))
      .toEqual([hero.uuid, noDeath.uuid]);
    expect(buildOperationPlan(state, state.party, 'actor.set-death-save', { field: 'failure', value: 2 }).commands)
      .toEqual([{ id: 'actor.set-death-save', targetUuid: hero.uuid, field: 'failure', value: 2 }]);
  });

  test('permits NPC exhaustion and counts only targets within the native increment/decrement boundaries', () => {
    const rested = card('Actor.rested', { type: 'npc', commands: { ...commands, exhaustionDown: unavailable } });
    const exhausted = card('Actor.exhausted', { type: 'npc', exhaustion: 6, commands: { ...commands, exhaustionUp: unavailable } });
    const state = snapshot([rested, exhausted]);
    expect(buildOperationPlan(state, state.party, 'actor.adjust-exhaustion', { delta: 1 }).commands)
      .toEqual([{ id: 'actor.adjust-exhaustion', targetUuid: rested.uuid, delta: 1 }]);
    expect(buildOperationPlan(state, state.party, 'actor.adjust-exhaustion', { delta: -1 }).commands)
      .toEqual([{ id: 'actor.adjust-exhaustion', targetUuid: exhausted.uuid, delta: -1 }]);
  });

  test('preserves explicit target states for mixed selections instead of deriving per-target toggles', () => {
    const first = card('Actor.first', { inspiration: true, concentrating: true });
    const second = card('Actor.second', { inspiration: false, concentrating: false });
    const state = snapshot([first, second]);
    for (const operation of ['actor.toggle-inspiration', 'actor.toggle-concentration'] as const) {
      for (const active of [true, false]) {
        const plan = buildOperationPlan(state, state.party, operation, { active });
        expect(plan.eligibleCount).toBe(2);
        expect(plan.commands.map((command) => command.active)).toEqual([active, active]);
      }
    }
  });

  test('respects controllable statuses and keeps direct numeric fields for every eligible creature', () => {
    const hero = card('Actor.hero');
    const npc = card('Actor.npc', { type: 'npc', commands: { ...commands, setAcModifier: unavailable } });
    const state = snapshot([hero, npc]);
    expect(buildOperationPlan(state, state.party, 'actor.set-status', { statusId: 'prone', active: false }).eligibleCount).toBe(2);
    expect(buildOperationPlan(state, state.party, 'actor.set-status', { statusId: 'concentrating', active: true }).eligibleCount).toBe(0);
    expect(buildOperationPlan(state, state.party, 'actor.set-max-modifier', { value: -2 }).commands.map((command) => command.value)).toEqual([-2, -2]);
    expect(buildOperationPlan(state, state.party, 'actor.set-ac-modifier', { value: 3 }).eligibleCount).toBe(1);
    expect(buildOperationPlan(state, state.party, 'actor.set-temp-hp', { value: 0 }).eligibleCount).toBe(2);
  });

  test('retains sheet and locate actions, deduplicating locations by Token UUID', () => {
    const hero = card('Actor.hero', { tokenUuid: 'Scene.scene.Token.hero' });
    const other = card('Actor.other', { commands: { ...commands, openSheet: unavailable, locate: unavailable } });
    const state = snapshot([hero, other]);
    expect(buildOperationPlan(state, state.party, 'actor.open-sheet').commands).toEqual([{ id: 'actor.open-sheet', targetUuid: hero.uuid }]);
    expect(buildOperationPlan(state, state.party, 'token.locate').commands).toEqual([{ id: 'token.locate', targetUuid: hero.uuid, tokenUuid: hero.tokenUuid }]);
  });
});

/** Models sparse ActorDelta inheritance, so modifying the base changes unoverridden Token reads immediately. */
function inheritedActorFixture(prone: boolean) {
  const actors = new Map<string, any>();
  const makeActor = (uuid: string, base?: any): any => {
    let hp: number | undefined = base ? undefined : 20;
    let level: number | undefined = base ? undefined : 2;
    let status: boolean | undefined = base ? undefined : prone;
    const actor: any = {
      uuid, documentName: 'Actor', type: 'npc',
      system: { attributes: { hp: { max: 30, temp: 0 } } },
      effects: { get: (id: string) => id === 'dnd5eexhaustion0' ? { system: { level: level ?? base.effects.get(id).system.level } } : undefined },
      get statuses() { return new Set((status ?? base.statuses.has('prone')) ? ['prone'] : []); },
      async applyDamage(amount: number) { actor.system.attributes.hp.value -= amount; },
      async toggleStatusEffect(id: string, options: { levels?: number; active?: boolean }) {
        if (id === 'exhaustion') level = actor.effects.get('dnd5eexhaustion0').system.level + options.levels!;
        else status = options.active;
      },
    };
    Object.defineProperty(actor.system.attributes.hp, 'value', {
      get: () => hp ?? base.system.attributes.hp.value,
      set: (value: number) => { hp = value; },
    });
    actors.set(uuid, actor);
    return actor;
  };
  makeActor('Actor.hero');
  makeActor('Actor.party-npc');
  const base = makeActor('Actor.template');
  for (const id of ['first', 'second', 'third']) makeActor(`Scene.scene.Token.${id}.Actor.template`, base);
  const cards = [
    card('Actor.hero', { combatantId: 'hero' }), card('Actor.party-npc', { combatantId: 'party-npc', type: 'npc' }),
    card(base.uuid, { combatantId: 'linked-first', type: 'npc' }), card(base.uuid, { combatantId: 'linked-second', type: 'npc' }),
    ...['first', 'second', 'third'].map((id) => card(`Scene.scene.Token.${id}.Actor.template`, { combatantId: id, type: 'npc' })),
  ];
  const runtime: Dnd5eRuntime = {
    game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' }, user: { isGM: true } },
    config: { statusEffects: [{ id: 'prone', name: 'Prone' }], DND5E: { conditionTypes: { exhaustion: { levels: 6 } } } },
    canvas: {}, resolveUuid: async (uuid) => actors.get(uuid), localize: (key) => key,
  };
  return { actors, cards, adapter: new Dnd5eAdapter(runtime) };
}

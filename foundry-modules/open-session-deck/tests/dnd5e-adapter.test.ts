import { describe, expect, test } from 'bun:test';
import { Dnd5eAdapter, supportError, type Dnd5eRuntime } from '../src/dnd5e-adapter.ts';

function actor(id: string, options: Record<string, any> = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    documentName: 'Actor',
    name: options.name ?? id,
    img: `/${id}.webp`,
    type: options.type ?? 'character',
    ownership: options.ownership ?? {},
    system: {
      attributes: {
        hp: { value: options.hp ?? 10, max: options.max ?? 20, temp: options.temp ?? 0 },
        ac: { value: options.ac ?? 15 },
        inspiration: options.inspiration ?? 0,
        exhaustion: options.exhaustion ?? 0,
        death: { success: 1, failure: 2 },
      },
    },
    concentration: { effects: new Set(options.concentrating ? [{}] : []) },
    statuses: new Set(options.statuses ?? []),
    effects: options.effects ?? [],
    applyDamage: async (value: number) => { options.calls?.push(['applyDamage', value]); },
    applyTempHP: async (value: number) => { options.calls?.push(['applyTempHP', value]); },
    update: async (value: unknown) => { options.calls?.push(['update', value]); },
    toggleStatusEffect: async (value: string) => { options.calls?.push(['toggleStatusEffect', value]); },
    sheet: { render: (value: boolean) => options.calls?.push(['sheet', value]) },
  };
}

function runtime(options: Record<string, any> = {}): Dnd5eRuntime {
  const settings = new Map<string, unknown>([
    ['pinnedActors', options.pinned ?? []],
    ['hiddenActors', options.hidden ?? []],
    ['lastOpenMode', 'panel'],
    ['cardDensity', 'comfortable'],
    ['activeTab', 'party'],
  ]);
  const actors = options.actors ?? [];
  return {
    game: {
      version: options.foundryVersion ?? '14.364',
      system: { id: options.systemId ?? 'dnd5e', version: options.systemVersion ?? '5.3.3' },
      user: { isGM: options.isGM ?? true },
      world: { id: 'world', title: 'World' },
      users: options.users ?? [],
      actors,
      combat: options.combat ?? null,
      settings: {
        get: (_module: string, key: string) => settings.get(key),
        set: async (_module: string, key: string, value: unknown) => { settings.set(key, value); options.settingCalls?.push([key, value]); },
      },
      i18n: { lang: 'en' },
    },
    config: {
      statusEffects: [
        { id: 'poisoned', name: 'Poisoned', img: '/poisoned.svg' },
        { id: 'concentrating', name: 'Concentrating' },
        { id: 'exhaustion', name: 'Exhaustion', levels: 6 },
        { id: 'falling', name: 'Falling', pseudo: true },
      ],
      DND5E: { conditionTypes: { exhaustion: { levels: 6 } } },
    },
    canvas: options.canvas ?? { scene: { id: 'scene' }, dimensions: { size: 100 }, animatePan: async () => {} },
    resolveUuid: options.resolveUuid ?? (async (uuid: string) => actors.find((entry: any) => entry.uuid === uuid) ?? options.uuidMap?.[uuid]),
    localize: (key: string) => key,
  };
}

describe('Dnd5eAdapter snapshots', () => {
  test('requires exact Foundry and dnd5e versions', () => {
    expect(supportError(runtime())).toBeUndefined();
    expect(supportError(runtime({ foundryVersion: '14.365' }))).toContain('14.364');
    expect(supportError(runtime({ systemVersion: '5.4.0' }))).toContain('5.3.3');
    expect(supportError(runtime({ systemId: 'daggerheart' }))).toContain('dnd5e');
  });

  test('returns a safe non-interactive snapshot without projecting actors on unsupported runtimes', () => {
    const hero = actor('hero');
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], users: [{ id: 'p', name: 'P', isGM: false, active: true, character: hero }], systemId: 'daggerheart' }));
    const value = adapter.buildSnapshot();
    expect(value.supported).toBeFalse();
    expect(value.party).toEqual([]);
    expect(value.encounter.active).toBeFalse();
    expect(value.encounter.commands.nextTurn.enabled).toBeFalse();
    expect(value.statusOptions).toEqual([]);
    expect(value.rosterManager).toEqual([]);
  });

  test('builds automatic and pinned roster while hiding automatic actors', () => {
    const assigned = actor('assigned', { name: 'Assigned' });
    const owned = actor('owned', { name: 'Owned', ownership: { player2: 3 } });
    const hidden = actor('hidden', { name: 'Hidden' });
    const npc = actor('npc', { name: 'Pinned NPC', type: 'npc' });
    const users = [
      { id: 'player1', name: 'Player One', isGM: false, active: true, character: assigned },
      { id: 'player2', name: 'Player Two', isGM: false, active: false },
    ];
    const adapter = new Dnd5eAdapter(runtime({ actors: [assigned, owned, hidden, npc], users, pinned: [npc.uuid, 'Actor.stale'], hidden: [hidden.uuid, 'Actor.gone'] }));
    const value = adapter.buildSnapshot();
    expect(value.party.map((entry) => entry.name)).toEqual(['Assigned', 'Owned', 'Pinned NPC']);
    expect(value.party[0]?.players[0]?.active).toBe(true);
    expect(value.stalePinned).toEqual(['Actor.stale']);
    expect(value.staleHidden).toEqual(['Actor.gone']);
    expect(value.statusOptions.map((entry) => entry.id)).toEqual(['poisoned']);
  });

  test('projects system fields and current statuses without exposing concentration as a toggle', () => {
    const statusActor = actor('hero', {
      temp: 4,
      inspiration: 1,
      exhaustion: 2,
      concentrating: true,
      statuses: ['poisoned', 'concentrating'],
      effects: [{ disabled: true, statuses: new Set(['stunned']) }],
    });
    const adapter = new Dnd5eAdapter(runtime({ actors: [statusActor], users: [{ id: 'p', name: 'P', isGM: false, active: true, character: statusActor }] }));
    const card = adapter.buildSnapshot().party[0]!;
    expect(card.hp).toEqual({ value: 10, max: 20, temp: 4, percent: 50 });
    expect(card.inspiration).toBe(true);
    expect(card.exhaustion).toBe(2);
    expect(card.concentrating).toBe(true);
    expect(card.statuses.map((entry) => entry.id)).toEqual(['concentrating', 'poisoned']);
  });

  test('projects command availability and exact disabled reasons at resource boundaries', () => {
    const rested = actor('rested', { exhaustion: 0 });
    const exhausted = actor('exhausted', { exhaustion: 6 });
    const adapter = new Dnd5eAdapter(runtime({
      actors: [rested, exhausted],
      users: [
        { id: 'p1', name: 'Offline Owner', isGM: false, active: false, character: rested },
        { id: 'p2', name: 'Online Owner', isGM: false, active: true, character: rested },
      ],
      pinned: [exhausted.uuid],
    }));
    const value = adapter.buildSnapshot();
    const restedCard = value.party.find((entry) => entry.uuid === rested.uuid)!;
    const exhaustedCard = value.party.find((entry) => entry.uuid === exhausted.uuid)!;
    expect(restedCard.players.map((player) => [player.name, player.active])).toEqual([['Offline Owner', false], ['Online Owner', true]]);
    expect(restedCard.commands.exhaustionDown).toEqual({ enabled: false, tooltipKey: 'OSD.Errors.ExhaustionMinimum' });
    expect(restedCard.commands.exhaustionUp.enabled).toBeTrue();
    expect(exhaustedCard.commands.exhaustionUp).toEqual({ enabled: false, tooltipKey: 'OSD.Errors.ExhaustionMaximum' });
    expect(exhaustedCard.commands.exhaustionDown.enabled).toBeTrue();

    const noStatusesRuntime = runtime({ actors: [rested], users: [{ id: 'p', name: 'P', isGM: false, active: true, character: rested }] });
    noStatusesRuntime.config.statusEffects = [];
    expect(new Dnd5eAdapter(noStatusesRuntime).buildSnapshot().party[0]!.commands.toggleStatus)
      .toEqual({ enabled: false, tooltipKey: 'OSD.Errors.NoControllableStatuses' });
  });
});

describe('Dnd5eAdapter commands', () => {
  test('uses dnd5e-native damage, healing, temp HP, update, and status APIs', async () => {
    const calls: unknown[] = [];
    const hero = actor('hero', { calls, inspiration: 0, exhaustion: 2 });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero] }));
    await adapter.execute({ id: 'actor.damage', targetUuid: hero.uuid, amount: 7 });
    await adapter.execute({ id: 'actor.heal', targetUuid: hero.uuid, amount: 3 });
    await adapter.execute({ id: 'actor.temp-hp', targetUuid: hero.uuid, amount: 5 });
    await adapter.execute({ id: 'actor.toggle-inspiration', targetUuid: hero.uuid });
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 });
    await adapter.execute({ id: 'actor.toggle-status', targetUuid: hero.uuid, statusId: 'poisoned' });
    expect(calls).toEqual([
      ['applyDamage', 7],
      ['applyDamage', -3],
      ['applyTempHP', 5],
      ['update', { 'system.attributes.inspiration': 1 }],
      ['update', { 'system.attributes.exhaustion': 3 }],
      ['toggleStatusEffect', 'poisoned'],
    ]);
  });

  test('rejects invalid amounts, managed statuses, stale documents, and non-GM clients', async () => {
    const hero = actor('hero');
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero] }));
    expect(adapter.execute({ id: 'actor.damage', targetUuid: hero.uuid, amount: 0 })).rejects.toThrow('positive integer');
    expect(adapter.execute({ id: 'actor.toggle-status', targetUuid: hero.uuid, statusId: 'concentrating' })).rejects.toThrow('not available');
    expect(adapter.execute({ id: 'actor.damage', targetUuid: 'Actor.missing', amount: 1 })).rejects.toThrow('missing');
    const playerAdapter = new Dnd5eAdapter(runtime({ actors: [hero], isGM: false }));
    expect(playerAdapter.execute({ id: 'actor.damage', targetUuid: hero.uuid, amount: 1 })).rejects.toThrow('GM-only');
  });

  test('rejects exhaustion commands at the system boundaries without issuing no-op writes', async () => {
    const calls: unknown[] = [];
    const rested = actor('rested', { calls, exhaustion: 0 });
    const exhausted = actor('exhausted', { calls, exhaustion: 6 });
    const adapter = new Dnd5eAdapter(runtime({ actors: [rested, exhausted] }));
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: rested.uuid, delta: -1 })).rejects.toThrow('minimum');
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: exhausted.uuid, delta: 1 })).rejects.toThrow('maximum');
    expect(calls).toEqual([]);
  });

  test('rechecks GM permission after asynchronous UUID resolution before writing', async () => {
    const calls: unknown[] = [];
    const hero = actor('hero', { calls });
    const guardedRuntime = runtime({ actors: [hero] });
    guardedRuntime.resolveUuid = async () => {
      guardedRuntime.game.user.isGM = false;
      return hero;
    };
    const adapter = new Dnd5eAdapter(guardedRuntime);
    await expect(adapter.execute({ id: 'actor.damage', targetUuid: hero.uuid, amount: 1 })).rejects.toThrow('GM-only');
    expect(calls).toEqual([]);
  });

  test('uses native combat turn methods and verifies the active combat UUID', async () => {
    const calls: string[] = [];
    const combat = { uuid: 'Combat.one', previousTurn: async () => calls.push('previous'), nextTurn: async () => calls.push('next') };
    const adapter = new Dnd5eAdapter(runtime({ combat }));
    await adapter.execute({ id: 'combat.previous-turn', combatUuid: combat.uuid });
    await adapter.execute({ id: 'combat.next-turn', combatUuid: combat.uuid });
    expect(calls).toEqual(['previous', 'next']);
    expect(adapter.execute({ id: 'combat.next-turn', combatUuid: 'Combat.old' })).rejects.toThrow('changed');
  });
});

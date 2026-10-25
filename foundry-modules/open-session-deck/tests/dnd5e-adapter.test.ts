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
        hp: { value: options.hp ?? 10, max: options.max ?? 20, tempmax: options.tempmax ?? 0, temp: options.temp ?? 0 },
        ac: { value: options.ac ?? 15 },
        inspiration: options.inspiration ?? 0,
        exhaustion: options.legacyExhaustion ?? options.exhaustion ?? 0,
        death: { success: 1, failure: 2 },
      },
      conditions: Object.hasOwn(options, 'conditions') ? options.conditions : { exhaustion: options.exhaustion ?? 0 },
    },
    concentration: { effects: new Set(options.concentrating ? [{}] : []) },
    statuses: new Set(options.statuses ?? []),
    effects: options.effects ?? [],
    folder: Object.hasOwn(options, 'folder') ? options.folder : { id: 'party', name: 'Party', type: 'Actor' },
    applyDamage: async (value: number) => { options.calls?.push(['applyDamage', value]); },
    applyTempHP: async (value: number) => { options.calls?.push(['applyTempHP', value]); },
    update: async (value: unknown) => { options.calls?.push(['update', value]); },
    createEmbeddedDocuments: async (type: string, value: unknown) => { options.calls?.push(['createEmbeddedDocuments', type, value]); },
    deleteEmbeddedDocuments: async (type: string, value: unknown) => { options.calls?.push(['deleteEmbeddedDocuments', type, value]); },
    toggleStatusEffect: async (...args: unknown[]) => {
      options.calls?.push(['toggleStatusEffect', ...args]);
      options.onToggleStatusEffect?.(...args);
    },
    sheet: { render: (value: boolean) => options.calls?.push(['sheet', value]) },
  };
}

function runtime(options: Record<string, any> = {}): Dnd5eRuntime {
  const settings = new Map<string, unknown>([
    ['pinnedActors', options.pinned ?? []],
    ['hiddenActors', options.hidden ?? []],
    ['partyFolderId', options.partyFolderId ?? 'party'],
    ['includePartySubfolders', options.includePartySubfolders ?? true],
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
      folders: options.folders ?? [{ id: 'party', name: 'Party', type: 'Actor' }],
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
    expect(supportError(runtime({ foundryVersion: '14.368', systemVersion: '6.0.2' }))).toBeUndefined();
    expect(supportError(runtime({ foundryVersion: '14.368', systemVersion: '6.0.5' }))).toBeUndefined();
    expect(supportError(runtime({ foundryVersion: '14.368', systemVersion: '6.0.6' }))).toBeUndefined();
    expect(supportError(runtime({ foundryVersion: '14.365' }))).toContain('14.364');
    expect(supportError(runtime({ systemVersion: '5.4.0' }))).toContain('5.3.3');
    expect(supportError(runtime({ foundryVersion: '14.368' }))).toBeUndefined();
    expect(supportError(runtime({ systemVersion: '6.0.2' }))).toContain('6.0.2');
    expect(supportError(runtime({ foundryVersion: '14.369', systemVersion: '6.0.2' }))).toContain('14.368');
    expect(supportError(runtime({ foundryVersion: '14.368', systemVersion: '6.0.4' }))).toContain('6.0.5');
    expect(supportError(runtime({ foundryVersion: '14.364', systemVersion: '6.0.5' }))).toContain('6.0.2 or 6.0.5');
    expect(supportError(runtime({ foundryVersion: '14.364', systemVersion: '6.0.6' }))).toContain('unsupported');
    expect(supportError(runtime({ foundryVersion: '14.368', systemVersion: '6.0.7' }))).toContain('6.0.6');
    expect(supportError(runtime({ systemId: 'daggerheart' }))).toContain('dnd5e');
  });

  test('returns a safe non-interactive snapshot without projecting actors on unsupported runtimes', () => {
    const hero = actor('hero');
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], users: [{ id: 'p', name: 'P', isGM: false, active: true, character: hero }], systemId: 'daggerheart' }));
    const value = adapter.buildSnapshot();
    expect(value.supported).toBeFalse();
    expect(value.coreVersion).toBe('14.364');
    expect(value.system).toEqual({ id: 'daggerheart', version: '5.3.3' });
    expect(value.party).toEqual([]);
    expect(value.encounter.active).toBeFalse();
    expect(value.encounter.commands.nextTurn.enabled).toBeFalse();
    expect(value.statusOptions).toEqual([]);
    expect(value.rosterManager).toEqual([]);
  });

  test('keeps no-active-combat commands unavailable with an explicit reason', () => {
    const value = new Dnd5eAdapter(runtime()).buildSnapshot();
    expect(value.coreVersion).toBe('14.364');
    expect(value.encounter.active).toBeFalse();
    expect(value.encounter.commands).toEqual({
      previousTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      nextTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      focusCurrent: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      swapInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      rollNpcInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
    });
  });

  test('projects the actual Next Core and dnd5e pair without changing the support gate', () => {
    const value = new Dnd5eAdapter(runtime({ foundryVersion: '14.368', systemVersion: '6.0.5' })).buildSnapshot();
    expect(value.coreVersion).toBe('14.368');
    expect(value.system).toEqual({ id: 'dnd5e', version: '6.0.5' });
    expect(value.supported).toBeTrue();
    const rejected = new Dnd5eAdapter(runtime({ foundryVersion: '14.368', systemVersion: '6.0.7' })).buildSnapshot();
    expect(rejected.coreVersion).toBe('14.368');
    expect(rejected.system.version).toBe('6.0.7');
    expect(rejected.supported).toBeFalse();
  });

  test('keeps turn controls unavailable when active combat has no current combatant', () => {
    const combat = { uuid: 'Combat.empty-turn', combatants: [], combatant: null, turn: -1, previousTurn: async () => {}, nextTurn: async () => {} };
    const value = new Dnd5eAdapter(runtime({ combat })).buildSnapshot();
    expect(value.encounter.active).toBeTrue();
    expect(value.encounter.commands).toEqual({
      previousTurn: { enabled: false, tooltipKey: 'OSD.Errors.CombatTurnUnavailable' },
      nextTurn: { enabled: false, tooltipKey: 'OSD.Errors.CombatTurnUnavailable' },
      focusCurrent: { enabled: false, tooltipKey: 'OSD.Errors.CurrentCombatantUnavailable' },
      swapInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NativeApiUnavailable' },
      rollNpcInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NativeApiUnavailable' },
    });
  });

  test('builds the party from the selected Actor folder in directory order and includes descendants', () => {
    const partyFolder = { id: 'party', name: 'Party', type: 'Actor' };
    const childFolder = { id: 'child', name: 'Companions', type: 'Actor', folder: 'party' };
    const assigned = actor('assigned', { name: 'Assigned', folder: partyFolder });
    const owned = actor('owned', { name: 'Owned', ownership: { player2: 3 }, folder: partyFolder });
    const hidden = actor('hidden', { name: 'Outside', folder: null });
    const npc = actor('npc', { name: 'Companion NPC', type: 'npc', folder: childFolder });
    const users = [
      { id: 'player1', name: 'Player One', isGM: false, active: true, character: assigned },
      { id: 'player2', name: 'Player Two', isGM: false, active: false },
    ];
    const adapter = new Dnd5eAdapter(runtime({ actors: [assigned, owned, hidden, npc], folders: [partyFolder, childFolder], users }));
    const value = adapter.buildSnapshot();
    expect(value.party.map((entry) => entry.name)).toEqual(['Assigned', 'Owned', 'Companion NPC']);
    expect(value.party[0]?.players[0]?.active).toBe(true);
    expect(value.partyFolder.selectedName).toBe('Party');
    expect(value.statusOptions.map((entry) => entry.id)).toEqual(['poisoned']);
  });

  test('marks a folder party Actor in combat when the Combatant carries an Actor ID', () => {
    const partyFolder = { id: 'party', name: 'Party', type: 'Actor' };
    const hero = actor('hero', { name: 'Hero', folder: partyFolder });
    const combatant = {
      id: 'token-combatant',
      actorId: hero.id,
      actor: hero,
      token: { id: 'token', uuid: 'Scene.scene.Token.token', parent: { id: 'scene' } },
      initiative: 12.5,
      hidden: false,
    };
    const combat = {
      uuid: 'Combat.token-backed',
      turns: [combatant],
      combatants: [combatant],
      combatant,
      turn: 0,
    };
    const value = new Dnd5eAdapter(runtime({ actors: [hero], folders: [partyFolder], combat })).buildSnapshot();
    expect(value.party[0]?.inCombat).toBeTrue();
    expect(value.encounter.combatants[0]?.partyMember).toBeTrue();
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
    expect(card.hp).toEqual({ value: 10, max: 20, baseMax: 20, maxModifier: 0, maxModifierDisplay: '0', effectiveMax: 20, temp: 4, percent: 50 });
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

  test('uses the dnd5e 6 condition level and native status delta without writing the derived attribute', async () => {
    const calls: unknown[] = [];
    const hero = actor('hero', { calls, exhaustion: 2, legacyExhaustion: 5 });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.368', systemVersion: '6.0.2' }));
    const card = adapter.buildSnapshot().party[0]!;
    expect(card.exhaustion).toBe(2);
    expect(card.commands.exhaustionDown.enabled).toBeTrue();
    expect(card.commands.exhaustionUp.enabled).toBeTrue();
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 });
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: -1 });
    expect(calls).toEqual([
      ['toggleStatusEffect', 'exhaustion', { levels: 1 }],
      ['toggleStatusEffect', 'exhaustion', { levels: -1 }],
    ]);
  });

  test('reads dnd5e 6.0.5 exhaustion from its native effect and writes through the system status API', async () => {
    const calls: unknown[] = [];
    // Match 6.0.5 ActiveEffect5e.ID.EXHAUSTION = staticID("dnd5eexhaustion").
    const exhaustionEffect = { id: 'dnd5eexhaustion0', system: { level: 2 } };
    const effects = { get: (id: string) => id === 'dnd5eexhaustion0' ? exhaustionEffect : undefined };
    const hero = actor('hero', {
      calls,
      effects,
      conditions: {},
      legacyExhaustion: 0,
      onToggleStatusEffect: (_statusId: string, options: { levels: number }) => { exhaustionEffect.system.level += options.levels; },
    });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.368', systemVersion: '6.0.5' }));
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(2);
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 });
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(3);
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: -1 });
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(2);
    expect(calls).toEqual([
      ['toggleStatusEffect', 'exhaustion', { levels: 1 }],
      ['toggleStatusEffect', 'exhaustion', { levels: -1 }],
    ]);
  });

  test('6.0.6 reads the fixed native effect and changes levels only through toggleStatusEffect', async () => {
    const calls: unknown[] = [];
    const effectIds: string[] = [];
    // 6.0.6 ActiveEffect5e.ID.EXHAUSTION = staticID("dnd5eexhaustion"); ConditionData._applyDelta uses that same ID.
    const exhaustionEffect = { system: { level: 2 } };
    const effects = { get: (id: string) => { effectIds.push(id); return id === 'dnd5eexhaustion0' ? exhaustionEffect : undefined; } };
    const hero = actor('hero-606', {
      calls, effects, legacyExhaustion: 5, conditions: { exhaustion: 4 },
      onToggleStatusEffect: (_statusId: string, options: { levels: number }) => { exhaustionEffect.system.level += options.levels; },
    });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.368', systemVersion: '6.0.6' }));
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(2);
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 });
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(3);
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: -1 });
    expect(adapter.buildSnapshot().party[0]!.exhaustion).toBe(2);
    expect(effectIds.length).toBeGreaterThan(0);
    expect(new Set(effectIds)).toEqual(new Set(['dnd5eexhaustion0']));
    expect(calls).toEqual([
      ['toggleStatusEffect', 'exhaustion', { levels: 1 }],
      ['toggleStatusEffect', 'exhaustion', { levels: -1 }],
    ]);
    exhaustionEffect.system.level = 6;
    expect(adapter.buildSnapshot().party[0]!.commands.exhaustionUp.enabled).toBeFalse();
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 })).rejects.toThrow('maximum');
    expect(calls).toHaveLength(2);

    const wrongCore = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.364', systemVersion: '6.0.6' }));
    const futureSystem = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.368', systemVersion: '6.0.7' }));
    await expect(wrongCore.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 })).rejects.toThrow('unsupported');
    await expect(futureSystem.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 })).rejects.toThrow('unsupported');
    expect(calls).toHaveLength(2);
  });

  test('disables dnd5e 6.0.5 exhaustion commands when the native effect level is malformed', async () => {
    const calls: unknown[] = [];
    const hero = actor('invalid', { calls, effects: { get: () => ({ system: { level: '2' } }) } });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero], foundryVersion: '14.368', systemVersion: '6.0.5' }));
    expect(adapter.buildSnapshot().party[0]!.commands.exhaustionUp.enabled).toBeFalse();
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: hero.uuid, delta: 1 })).rejects.toThrow('unavailable');
    expect(calls).toEqual([]);
  });

  test('dnd5e 6 treats an empty condition map as level zero while enforcing native boundaries', async () => {
    const calls: unknown[] = [];
    const rested = actor('rested', { calls, conditions: {}, legacyExhaustion: 3 });
    const exhausted = actor('exhausted', { calls, exhaustion: 6, legacyExhaustion: 0 });
    const missing = actor('missing', { calls, conditions: undefined });
    const invalid = actor('invalid', { calls, conditions: { exhaustion: '2' } });
    const next = runtime({ actors: [rested, exhausted, missing, invalid], foundryVersion: '14.368', systemVersion: '6.0.2' });
    const adapter = new Dnd5eAdapter(next);
    const cards = adapter.buildSnapshot().party;
    expect(cards.find((card) => card.uuid === rested.uuid)!.exhaustion).toBe(0);
    expect(cards.find((card) => card.uuid === rested.uuid)!.commands.exhaustionDown.enabled).toBeFalse();
    expect(cards.find((card) => card.uuid === rested.uuid)!.commands.exhaustionUp.enabled).toBeTrue();
    expect(cards.find((card) => card.uuid === exhausted.uuid)!.commands.exhaustionUp.enabled).toBeFalse();
    expect(cards.find((card) => card.uuid === missing.uuid)!.commands.exhaustionUp.enabled).toBeFalse();
    expect(cards.find((card) => card.uuid === invalid.uuid)!.commands.exhaustionUp.enabled).toBeFalse();
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: rested.uuid, delta: -1 })).rejects.toThrow('minimum');
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: exhausted.uuid, delta: 1 })).rejects.toThrow('maximum');
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: missing.uuid, delta: 1 })).rejects.toThrow('unavailable');
    await expect(adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: invalid.uuid, delta: 1 })).rejects.toThrow('unavailable');
    expect(calls).toEqual([]);
    await adapter.execute({ id: 'actor.adjust-exhaustion', targetUuid: rested.uuid, delta: 1 });
    expect(calls).toEqual([['toggleStatusEffect', 'exhaustion', { levels: 1 }]]);
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

  test('supports direct HP fields, exact temp HP, max modifier clamping, statuses, concentration, AC, and death saves', async () => {
    const calls: unknown[] = [];
    const hero = actor('hero', { calls, hp: 10, max: 20, tempmax: 5, temp: 3, statuses: ['poisoned'] });
    const adapter = new Dnd5eAdapter(runtime({ actors: [hero] }));
    await adapter.execute({ id: 'actor.set-hp', targetUuid: hero.uuid, value: 4 });
    await adapter.execute({ id: 'actor.set-temp-hp', targetUuid: hero.uuid, value: 1 });
    await adapter.execute({ id: 'actor.set-max-modifier', targetUuid: hero.uuid, value: -15 });
    await adapter.execute({ id: 'actor.set-status', targetUuid: hero.uuid, statusId: 'poisoned', active: false });
    await adapter.execute({ id: 'actor.toggle-concentration', targetUuid: hero.uuid });
    await adapter.execute({ id: 'actor.set-ac-modifier', targetUuid: hero.uuid, value: 2 });
    await adapter.execute({ id: 'actor.set-death-save', targetUuid: hero.uuid, field: 'failure', value: 3 });
    expect(calls).toEqual([
      ['applyDamage', 6],
      ['update', { 'system.attributes.hp.temp': 1 }],
      ['update', { 'system.attributes.hp.tempmax': -15, 'system.attributes.hp.value': 5 }],
      ['toggleStatusEffect', 'poisoned', { active: false }],
      ['toggleStatusEffect', 'concentrating', { active: true }],
      ['createEmbeddedDocuments', 'ActiveEffect', [{
        name: 'Open Session Deck: AC Modifier', img: 'icons/svg/shield.svg',
        changes: [{ key: 'system.attributes.ac.bonus', mode: 2, value: '2', priority: 20 }],
        flags: { 'open-session-deck': { acModifier: true } },
      }]],
      ['update', { 'system.attributes.death.failure': 3 }],
    ]);
  });

  test('preserves decimal initiative, swaps exact values, and rolls only missing NPC initiative privately', async () => {
    const combatCalls: unknown[] = [];
    const first = { id: 'first', actor: actor('npc-a', { type: 'npc' }), initiative: 20.08, hidden: false };
    const second = { id: 'second', actor: actor('npc-b', { type: 'npc' }), initiative: 11.22, hidden: false };
    const missing = { id: 'missing', actor: actor('npc-c', { type: 'npc' }), initiative: null, hidden: false };
    const hero = { id: 'hero', actor: actor('hero'), initiative: null, hidden: false };
    const combat = {
      uuid: 'Combat.one', combatants: [first, second, missing, hero],
      setInitiative: async (...args: unknown[]) => combatCalls.push(['setInitiative', ...args]),
      updateEmbeddedDocuments: async (...args: unknown[]) => combatCalls.push(['updateEmbeddedDocuments', ...args]),
      rollInitiative: async (...args: unknown[]) => combatCalls.push(['rollInitiative', ...args]),
    };
    const adapter = new Dnd5eAdapter(runtime({ combat }));
    await adapter.execute({ id: 'combat.set-initiative', combatUuid: combat.uuid, combatantId: first.id, value: 18.14 });
    await adapter.execute({ id: 'combat.swap-initiative', combatUuid: combat.uuid, combatantId: first.id, secondCombatantId: second.id });
    await adapter.execute({ id: 'combat.roll-npc-initiative', combatUuid: combat.uuid });
    expect(combatCalls).toEqual([
      ['setInitiative', 'first', 18.14],
      ['updateEmbeddedDocuments', 'Combatant', [{ _id: 'first', initiative: 11.22 }, { _id: 'second', initiative: 20.08 }]],
      ['updateEmbeddedDocuments', 'Combatant', [{ _id: 'missing', hidden: true, 'flags.open-session-deck.revealed': false }]],
      ['rollInitiative', ['missing'], { messageOptions: { rollMode: 'gmroll' } }],
    ]);
  });
});

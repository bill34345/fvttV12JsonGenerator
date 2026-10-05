import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConditionRuntime } from '../src/runtime.ts';
import { WeaponEffectRuntime } from '../src/weapon-effects.ts';
import { readWeaponEffectInstance } from '@fvtt-json-generator/contracts/weapon-effects';

function actor(id: string): any {
  const data: any = {
    _id: id,
    id,
    uuid: `Actor.${id}`,
    name: id,
    documentName: 'Actor',
    system: { attributes: { hp: { value: 20, max: 20 }, movement: { walk: 30, burrow: 0, climb: 0, fly: 0, swim: 0, units: 'ft' } } },
    effects: [],
    items: [],
    flags: {},
    _preparedOptions: { halfMovement: false, flatSpeedReduction: 0 },
  };
  data._sourceMovement = { ...data.system.attributes.movement };
  let effectCounter = 0;
  return {
    ...data,
    toObject: () => structuredClone(data),
    async createEmbeddedDocuments(_type: string, entries: any[]) {
      const created = entries.map((entry) => ({
        ...structuredClone(entry),
        id: `${id}-effect-${effectCounter++}`,
        _id: `${id}-effect-${effectCounter - 1}`,
        parent: this,
      }));
      data.effects.push(...created);
      reprepareActor(data);
      return created;
    },
    async updateEmbeddedDocuments(type: string, updates: any[]) {
      const documents = type === 'ActiveEffect' ? data.effects : data.items;
      for (const update of updates) {
        const document = documents.find((entry: any) => entry.id === update._id || entry._id === update._id);
        if (!document) continue;
        for (const [key, value] of Object.entries(update)) {
          if (key === 'flags.fvtt-custom-conditions.weaponEffect') {
            document.flags ??= {};
            document.flags['fvtt-custom-conditions'] ??= {};
            document.flags['fvtt-custom-conditions'].weaponEffect = {
              ...(document.flags['fvtt-custom-conditions'].weaponEffect ?? {}),
              ...(structuredClone(value) as Record<string, unknown>),
            };
          } else if (key === 'flags.fvtt-custom-conditions.weaponEffect.-=reservation') {
            delete document.flags?.['fvtt-custom-conditions']?.weaponEffect?.reservation;
          } else if (key === 'flags.fvtt-custom-conditions.condition') {
            document.flags ??= {};
            document.flags['fvtt-custom-conditions'] ??= {};
            document.flags['fvtt-custom-conditions'].condition = value;
          } else if (key !== '_id') document[key] = value;
        }
        reprepareActor(data);
      }
      return documents;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      for (let index = data.effects.length - 1; index >= 0; index -= 1) {
        if (ids.includes(data.effects[index].id) || ids.includes(data.effects[index]._id)) {
          data.effects.splice(index, 1);
          reprepareActor(data);
        }
      }
      return [];
    },
    async update(update: any) {
      for (const [path, value] of Object.entries(update)) {
        if (path.startsWith('flags.')) {
          const parts = path.split('.');
          const module = parts[1] as string;
          const key = parts[2] as string;
          data.flags[module] ??= {};
          data.flags[module][key] = value;
        }
      }
    },
  };
}

function reprepareActor(data: any): void {
  const movement = data.system.attributes.movement;
  const source = data._sourceMovement ?? {};
  const modes = ['walk', 'burrow', 'climb', 'fly', 'swim'];
  for (const mode of modes) {
    let speed = Number(source[mode]);
    if (!Number.isFinite(speed)) speed = 0;
    for (const effect of data.effects) {
      if (effect.disabled) continue;
      for (const change of Array.isArray(effect.changes) ? effect.changes : []) {
        if (Number(change?.mode) !== 2 || change?.key !== `system.attributes.movement.${mode}`) continue;
        const value = Number(change.value);
        if (Number.isFinite(value)) speed += value;
      }
    }
    speed = Math.max(0, speed);
    if (data._preparedOptions?.halfMovement) speed *= 0.5;
    if (Number.isFinite(Number(data._preparedOptions?.flatSpeedReduction))) speed = Math.max(0, speed - Number(data._preparedOptions.flatSpeedReduction));
    movement[mode] = speed;
  }
  movement.speed = movement.walk;
}

function fixture() {
  let active = true;
  const gm: any = { id: 'gm', isGM: true, active: true };
  const source = actor('source');
  const target = actor('target');
  const combatantSource = { id: 'combatant-source', actor: source, actorId: source.id };
  const combatantTarget = { id: 'combatant-target', actor: target, actorId: target.id };
  const combat: any = {
    id: 'combat', uuid: 'Combat.test', round: 1, turn: 0,
    current: { round: 1, turn: 0, combatantId: combatantSource.id },
    turns: [combatantSource, combatantTarget],
    combatant: combatantSource,
  };
  const globals: any = {
    game: { user: gm, users: { activeGM: gm }, combat, actors: [source, target], scenes: [] },
    ui: { notifications: { warn: () => {}, error: () => {} } },
  };
  const runtime = new WeaponEffectRuntime(globals, () => active);
  return {
    globals,
    source,
    target,
    runtime,
    setActive(value: boolean) { active = value; },
    setTurn(round: number, turn: number, currentActor: any = source) {
      combat.round = round;
      combat.turn = turn;
      combat.current = { round, turn, combatantId: currentActor === source ? combatantSource.id : combatantTarget.id };
      combat.combatant = currentActor === source ? combatantSource : combatantTarget;
    },
  };
}

const sourceRef = (source: any) => ({ actorUuid: source.uuid, itemUuid: `${source.uuid}.Item.weapon`, activityUuid: `${source.uuid}.Item.weapon.Activity.attack` });

describe('weapon effect contract and lifecycle', () => {
  test('creates token effects with packaged and credited module icons', async () => {
    const { runtime, source, target } = fixture();
    const sap = await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid } });
    const slow = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 } });
    const vex = await runtime.apply(source, { effectKind: 'vex', source: sourceRef(source), target: { actorUuid: target.uuid } });
    const paths = [
      [sap?.img, 'enfeebled.svg'],
      [slow?.img, 'slowed.svg'],
      [vex?.img, 'jinxed.svg'],
    ] as const;
    for (const [path, file] of paths) {
      expect(path).toBe(`modules/fvtt-custom-conditions/icons/${file}`);
      expect((await readFile(resolve(import.meta.dir, '../src/icons', file), 'utf8')).includes('<svg')).toBeTrue();
    }
  });

  test.each(['14.364', '14.368'])('keeps legacy Slow writes and strongest-source lifecycle on %s/5.3.3', async (core) => {
    const { globals, runtime, source, target } = fixture();
    globals.game.version = core;
    globals.game.system = { id: 'dnd5e', version: '5.3.3' };
    const first = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 }, stackingGroup: 'dnd2024.slow' });
    const secondSource = actor('second-source');
    const second = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(secondSource), target: { actorUuid: target.uuid }, params: { speedReduction: 5 }, stackingGroup: 'dnd2024.slow' });
    expect(runtime.list(target)).toHaveLength(2);
    expect(first?.flags?.['fvtt-custom-conditions']?.weaponEffect?.effectKind).toBe('slow');
    expect(first?.flags?.['fvtt-custom-conditions']?.condition).toBeUndefined();
    expect(second?.flags?.['fvtt-custom-conditions']?.weaponEffect?.stackingGroup).toBe('dnd2024.slow');
    expect(first?.changes).toHaveLength(5);
    expect(first?.system).toBeUndefined();
    expect(first?.changes).toContainEqual(expect.objectContaining({ key: 'system.attributes.movement.walk', value: '-10' }));
    expect(second?.changes).toEqual([]);
    expect(target.system.attributes.movement.walk).toBe(20);
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 0 });
    expect(target.system.attributes.movement.walk).toBe(20);
    await runtime.remove(target, runtime.list(target)[0]!.id);
    expect(runtime.list(target)).toHaveLength(1);
    expect(runtime.list(target)[0]!.instance.params).toMatchObject({ speedReduction: 5 });
    expect(runtime.list(target)[0]!.effect.changes).toHaveLength(5);
    expect(runtime.list(target)[0]!.effect.changes).toContainEqual(expect.objectContaining({ value: '-5' }));
    expect(target.system.attributes.movement.walk).toBe(25);
    await runtime.remove(target, runtime.list(target)[0]!.id);
    expect(target.system.attributes.movement.walk).toBe(30);
  });

  test('converts Slow to dnd5e metric units across canonical movement modes', async () => {
    const { runtime, source, target } = fixture();
    target.system.attributes.movement = { walk: 30, fly: 0, units: 'm' };
    const effect = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 } });
    expect(effect?.changes).toHaveLength(5);
    expect(effect?.changes).toContainEqual(expect.objectContaining({ key: 'system.attributes.movement.walk', value: '-3' }));
  });

  test('uses fixed Slow ADD values before native clamp and half-movement preparation', async () => {
    const { globals, runtime, source, target } = fixture();
    target._sourceMovement.walk = 10;
    target._preparedOptions.halfMovement = true;
    reprepareActor(target);
    expect(target.system.attributes.movement.walk).toBe(5);

    await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 } });
    expect(runtime.list(target)[0]!.effect.changes).toContainEqual(expect.objectContaining({ key: 'system.attributes.movement.walk', value: '-10' }));
    expect(target.system.attributes.movement.walk).toBe(0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 0 });
      reprepareActor(target);
      expect(target.system.attributes.movement.walk).toBe(0);
    }
    await runtime.remove(target, runtime.list(target)[0]!.id);
    expect(target.system.attributes.movement.walk).toBe(5);

    target._preparedOptions.halfMovement = false;
    for (const speed of [5, 10, 15]) {
      target._sourceMovement.walk = speed;
      reprepareActor(target);
      expect(target.system.attributes.movement.walk).toBe(speed);
      const effect = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 } });
      expect(target.system.attributes.movement.walk).toBe(Math.max(0, speed - 10));
      expect(target.system.attributes.movement.walk).toBeGreaterThanOrEqual(0);
      await runtime.remove(target, effect.id);
      expect(target.system.attributes.movement.walk).toBe(speed);
    }
  });

  test('serializes exclusive Sap reservations under concurrent callers and consumes hit or miss completion', async () => {
    const { runtime, source, target } = fixture();
    await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid } });
    const [first, second] = await Promise.all([
      runtime.reserve(target, { attackId: 'attack-1' }),
      runtime.reserve(target, { attackId: 'attack-2' }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const ticket = first ?? second;
    expect(ticket?.instanceId).toBeString();
    expect(ticket?.revision).toBeGreaterThan(0);
    await runtime.commit(target, ticket!);
    expect(runtime.list(target)).toHaveLength(0);
  });

  test('keeps every same-group Sap charge eligible for one attack and is idempotent across a runtime reload', async () => {
    const { globals, runtime, source, target, setTurn } = fixture();
    const input = { effectKind: 'sap' as const, source: sourceRef(source), target: { actorUuid: target.uuid } };
    await runtime.apply(target, input);
    await runtime.apply(target, input);
    const first = await runtime.reserve(target, { attackId: 'same-attack', effectId: undefined });
    const second = await runtime.reserve(target, { attackId: 'same-attack', effectId: undefined });
    const third = await runtime.reserve(target, { attackId: 'same-attack', effectId: undefined });
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeUndefined();
    await runtime.commit(target, first!);
    await runtime.commit(target, second!);
    expect(runtime.list(target)).toHaveLength(0);

    await runtime.apply(target, { ...input, expires: { reference: 'source', phase: 'start', turns: 1 } });
    const reloaded = new WeaponEffectRuntime(globals, () => true);
    // The callback can be delivered twice without deleting the effect early.
    await reloaded.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 0 });
    await reloaded.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 0 });
    expect(reloaded.list(target)).toHaveLength(1);
    setTurn(2, 0, source);
    await reloaded.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 2, turn: 0 });
    expect(reloaded.list(target)).toHaveLength(0);
  });

  test('cancels an unstarted reservation, retains a started unknown reservation, and matches Vex targets', async () => {
    const { runtime, source, target } = fixture();
    await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid } });
    const released = await runtime.reserve(target, { attackId: 'cancel-me' });
    await runtime.cancel(target, released!);
    expect(runtime.list(target)).toHaveLength(1);
    expect(runtime.list(target)[0]!.instance.reservation).toBeUndefined();
    const disabledId = runtime.list(target)[0]!.id;
    await runtime.reserve(target, { attackId: 'disable-me', effectId: disabledId });
    await runtime.setEnabled(target, disabledId, false);
    expect(runtime.list(target)).toHaveLength(1);
    expect(runtime.list(target)[0]!.disabled).toBeTrue();
    expect(runtime.list(target)[0]!.instance.reservation).toBeUndefined();
    await runtime.setEnabled(target, disabledId, true);
    const retry = await runtime.reserve(target, { attackId: 'retry' });
    expect(retry).toBeDefined();
    await runtime.cancel(target, await runtime.start(target, retry!));
    expect(runtime.list(target)[0]!.instance.reservation?.state).toBe('started');

    const vexSource = actor('vex-source');
    const vexTarget = actor('vex-target');
    await runtime.apply(vexSource, { effectKind: 'vex', source: sourceRef(vexSource), target: { actorUuid: vexTarget.uuid } });
    expect(await runtime.reserve(vexSource, { attackId: 'wrong-target', targetActorUuid: target.uuid })).toBeUndefined();
    const vexTicket = await runtime.reserve(vexSource, { attackId: 'right-target', targetActorUuid: vexTarget.uuid });
    expect(vexTicket).toBeDefined();
    await runtime.commit(vexSource, vexTicket!);
    expect(runtime.list(vexSource)).toHaveLength(0);
  });

  test('rejects all persistent operations for a non-GM caller', async () => {
    const { runtime, source, target, setActive } = fixture();
    setActive(false);
    await expect(runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid } })).rejects.toThrow(/active GM/);
    await expect(runtime.remove(target, 'missing')).rejects.toThrow(/active GM/);
    await expect(runtime.reserve(target, { attackId: 'no-gm' })).rejects.toThrow(/active GM/);
  });

  test('expires against the source turn and removes only the owning Slow ActiveEffect', async () => {
    const { globals, runtime, source, target, setTurn } = fixture();
    const sap = await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid }, expires: { reference: 'source', phase: 'start', turns: 1 } });
    const slow = await runtime.apply(target, { effectKind: 'slow', source: sourceRef(source), target: { actorUuid: target.uuid }, params: { speedReduction: 10 }, expires: { reference: 'source', phase: 'start', turns: 2 } });
    expect(runtime.list(target)).toHaveLength(2);
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 0 });
    expect(runtime.list(target)).toHaveLength(2);
    setTurn(2, 0, source);
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 2, turn: 0 });
    expect(runtime.list(target).map((entry) => entry.id)).toEqual([slow?.id]);
    expect(readWeaponEffectInstance(slow)?.effectKind).toBe('slow');
    expect(runtime.list(target).some((entry) => entry.id === sap?.id)).toBeFalse();
  });

  test('counts a future source boundary in the same round and does not expire Vex at the current source end', async () => {
    const { globals, runtime, source, target, setTurn } = fixture();
    // Put the source after the target in initiative. Applying from the target
    // turn should expire Sap at the source's next start in this same round.
    const sourceCombatant = globals.game.combat.turns[0];
    const targetCombatant = globals.game.combat.turns[1];
    globals.game.combat.turns = [targetCombatant, sourceCombatant];
    setTurn(1, 0, target);
    await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid }, expires: { reference: 'source', phase: 'start', turns: 1 } });
    setTurn(1, 1, source);
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 1 });
    expect(runtime.list(target)).toHaveLength(0);

    // Vex applied during the source turn survives the current end event and
    // expires at the next source turn end.
    await runtime.apply(source, { effectKind: 'vex', source: sourceRef(source), target: { actorUuid: target.uuid }, expires: { reference: 'source', phase: 'end', turns: 1 } });
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 1, turn: 1 });
    expect(runtime.list(source)).toHaveLength(1);
    setTurn(2, 1, source);
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: source, combat: globals.game.combat, combatUuid: 'Combat.test', round: 2, turn: 1 });
    expect(runtime.list(source)).toHaveLength(0);
  });

  test('legacy ConditionRuntime list remains unaware of weapon effects', async () => {
    const { runtime, source, target, globals } = fixture();
    const conditionRuntime = new ConditionRuntime(globals, () => true);
    await conditionRuntime.apply(target, 'bleeding', { formula: '1d4' });
    await runtime.apply(target, { effectKind: 'sap', source: sourceRef(source), target: { actorUuid: target.uuid } });
    expect(conditionRuntime.list(target).map((entry) => entry.instance.conditionId)).toEqual(['bleeding']);
    expect(runtime.list(target).map((entry) => entry.instance.effectKind)).toEqual(['sap']);
  });
});

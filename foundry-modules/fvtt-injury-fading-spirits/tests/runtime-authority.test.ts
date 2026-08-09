import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { InjuryFadingRuntime } from '../src/runtime.ts';
import { createActorModuleState } from '../src/state.ts';

const originalGlobals = new Map<string, unknown>();

beforeEach(() => {
  for (const key of ['game', 'ui', 'CONFIG', 'foundry', 'canvas', 'fromUuid']) originalGlobals.set(key, (globalThis as any)[key]);
  (globalThis as any).game = {
    user: { id: 'gm', isGM: true },
    users: { activeGM: { id: 'gm' }, get: () => null },
    settings: { get: (_scope: string, key: string) => key === 'enabled' },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
  };
  (globalThis as any).ui = { notifications: { info() {}, warn() {}, error() {} } };
  (globalThis as any).CONFIG = { statusEffects: [], specialStatusEffects: { DEFEATED: 'dead' } };
  (globalThis as any).foundry = { utils: { hasProperty: (value: any, path: string) => path.split('.').reduce((entry, key) => entry?.[key], value) !== undefined } };
  (globalThis as any).canvas = { tokens: { placeables: [] } };
  (globalThis as any).fromUuid = async () => null;
});

afterEach(() => {
  for (const [key, value] of originalGlobals) (globalThis as any)[key] = value;
  originalGlobals.clear();
});

function fakeActor(stacks = 0) {
  const state = createActorModuleState(10, 10);
  state.injury.stacks = stacks;
  const writes: Array<Record<string, unknown>> = [];
  const actor: any = {
    id: 'actor', uuid: 'Actor.actor', name: 'Hero', type: 'character', documentName: 'Actor', pack: null,
    system: { attributes: { hp: { value: 0, max: 10 }, death: { failure: 0, success: 0 } } },
    flags: { [MODULE_ID]: state }, effects: [], _stats: { modifiedTime: 123 },
    async update(changes: Record<string, unknown>) {
      writes.push(changes);
      if (changes[`flags.${MODULE_ID}`]) this.flags[MODULE_ID] = structuredClone(changes[`flags.${MODULE_ID}`]);
      if (changes['system.attributes.death.failure'] !== undefined) this.system.attributes.death.failure = changes['system.attributes.death.failure'];
    },
    async createEmbeddedDocuments() { return []; },
    async updateEmbeddedDocuments() { return []; },
    async deleteEmbeddedDocuments() { return []; },
    testUserPermission(user: any) { return user?.id === 'player' || user?.isGM === true; },
  };
  return { actor, writes };
}

describe('active-GM runtime authority', () => {
  test('pre-update snapshot catches the first positive-to-zero transition on an actor without module flags', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    delete actor.flags[MODULE_ID];
    actor.system.attributes.hp.value = 10;
    const changes = { system: { attributes: { hp: { value: 0 } } } };
    runtime.onPreUpdateActor(actor, changes, {});
    actor.system.attributes.hp.value = 0;
    await runtime.onUpdateActor(actor, changes, {}, 'player');
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(true);
    expect(actor.flags[MODULE_ID].injury.lastObservedHp).toBe(0);
  });

  test('one observed HP transition produces one state write and exact starting failures', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    runtime.hpSnapshots.set(actor.uuid, { value: 10, max: 10 });
    await runtime.onUpdateActor(actor, { system: { attributes: { hp: { value: 0 } } } }, {}, 'player');
    expect(writes).toHaveLength(1);
    expect(actor.system.attributes.death.failure).toBe(2);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(true);
    await runtime.onUpdateActor(actor, { system: { attributes: { hp: { value: 0 } } } }, {}, 'player');
    expect(writes).toHaveLength(1);
  });

  test('a non-active GM observes but does not persist', async () => {
    (globalThis as any).game.users.activeGM = { id: 'other-gm' };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    runtime.hpSnapshots.set(actor.uuid, { value: 10, max: 10 });
    await runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 0 }, {}, 'player');
    expect(writes).toHaveLength(0);
  });

  test('unknown schema fails closed without writes', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    actor.flags[MODULE_ID].schemaVersion = 999;
    runtime.hpSnapshots.set(actor.uuid, { value: 10, max: 10 });
    await runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 0 }, {}, 'player');
    expect(writes).toHaveLength(0);
  });

  test('rest socket requires the native actor message and ignores the client transaction id', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    const player = { id: 'player', active: true, isGM: false };
    const message = { id: 'rest-message', type: 'rest', speaker: { actor: actor.id }, system: { type: 'short' }, getAssociatedActor: () => actor };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).game.messages = { get: (id: string) => id === message.id ? message : null };
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    const payload = {
      type: 'restCompleted', actorUuid: actor.uuid, restType: 'short', messageId: message.id,
      transactionId: 'forged-client-transaction', requesterId: player.id,
    };
    await runtime.onSocket(payload);
    expect(writes).toHaveLength(0);
    await runtime.onSocket(payload, player.id);
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(0);
    expect(actor.flags[MODULE_ID].injury.processedTransactionIds).toContain(`rest:${actor.uuid}:${message.id}:short`);
    await runtime.onSocket({ ...payload, transactionId: 'different-replay-id' }, player.id);
    expect(writes).toHaveLength(1);
  });

  test('rest socket rejects a message without an exact actor association', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    const player = { id: 'player', active: true, isGM: false };
    const message = { id: 'wrong-rest-message', type: 'rest', speaker: { actor: 'other-actor' }, system: { type: 'short' }, getAssociatedActor: () => actor };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).game.messages = { get: (id: string) => id === message.id ? message : null };
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    await runtime.onSocket({ type: 'restCompleted', actorUuid: actor.uuid, restType: 'short', messageId: message.id, requesterId: player.id }, player.id);
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
  });

  test('socket mutations fail closed when unsupported, disabled, or requested by an inactive user', async () => {
    const runtime = new InjuryFadingRuntime();
    const { actor, writes } = fakeActor(1);
    const player = { id: 'player', active: true, isGM: false };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    const payload = { type: 'setInjury', actorUuid: actor.uuid, stacks: 2, requesterId: player.id };

    runtime.supported = false;
    await runtime.onSocket(payload, player.id);
    runtime.supported = true;
    (globalThis as any).game.settings.get = () => false;
    await runtime.onSocket(payload, player.id);
    (globalThis as any).game.settings.get = (_scope: string, key: string) => key === 'enabled';
    player.active = false;
    await runtime.onSocket(payload, player.id);

    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
  });

  test('socket mutations reject non-managed, compendium, and non-writable actors', async () => {
    const variants = [
      (actor: any) => { actor.type = 'npc'; },
      (actor: any) => { actor.pack = 'Compendium.dnd5e.monsters'; },
      (actor: any) => { actor.isOwner = false; },
      (actor: any) => { actor.update = undefined; },
    ];
    for (const mutate of variants) {
      const runtime = new InjuryFadingRuntime(); runtime.supported = true;
      const { actor, writes } = fakeActor(1);
      mutate(actor);
      const player = { id: 'player', active: true, isGM: false };
      (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
      (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
      await runtime.onSocket({ type: 'setInjury', actorUuid: actor.uuid, stacks: 2, requesterId: player.id }, player.id);
      expect(writes).toHaveLength(0);
      expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
    }
  });

  test('valid setInjury socket packets are applied by the active GM', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    const player = { id: 'player', active: true, isGM: false };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    await runtime.onSocket({
      type: 'setInjury', actorUuid: actor.uuid, stacks: 2, reason: 'GM-approved correction',
      requesterId: player.id, transactionId: 'client-value-is-not-authoritative',
    }, player.id);
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
  });

  test('manual and socket writes reject a fourth injury stack', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(3);
    await expect(runtime.setInjury(actor, 4, 'invalid')).rejects.toThrow(/0 to 3/);
    const player = { id: 'player', active: true, isGM: false };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    await runtime.onSocket({ type: 'setInjury', actorUuid: actor.uuid, stacks: 4, requesterId: player.id }, player.id);
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(3);
  });

  test('Token HUD capture handles click and the complete contextmenu plus auxclick sequence exactly once', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    (globalThis as any).canvas.hud = { token: { object: { actor } } };
    const makeEvent = (type: 'click' | 'contextmenu' | 'auxclick', button: number) => {
      const state = { prevented: false, stopped: false };
      const target = { classList: { contains: () => true }, dataset: { statusId: 'fvtt-injury' }, closest: () => target };
      return {
        state,
        event: {
          type, button, target,
          preventDefault: () => { state.prevented = true; },
          stopPropagation: () => { state.stopped = true; },
        },
      };
    };

    for (const expected of [1, 2, 3, 3]) {
      const click = makeEvent('click', 0);
      runtime.onClickTokenHud(click.event);
      await Bun.sleep(2);
      expect(click.state).toEqual({ prevented: true, stopped: true });
      expect(actor.flags[MODULE_ID].injury.stacks).toBe(expected);
    }
    expect(writes).toHaveLength(3);

    const menu = makeEvent('contextmenu', 2);
    runtime.onClickTokenHud(menu.event);
    await Bun.sleep(2);
    expect(menu.state).toEqual({ prevented: true, stopped: true });
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(3);
    const auxiliary = makeEvent('auxclick', 2);
    runtime.onClickTokenHud(auxiliary.event);
    await Bun.sleep(2);
    expect(auxiliary.state).toEqual({ prevented: true, stopped: true });
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
    expect(writes).toHaveLength(4);

    await runtime.setInjury(actor, 0, 'test reset');
    writes.length = 0;
    runtime.onClickTokenHud(makeEvent('contextmenu', 2).event);
    runtime.onClickTokenHud(makeEvent('auxclick', 2).event);
    await Bun.sleep(2);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(0);
    expect(writes).toHaveLength(0);
  });

  test('socket writes an unlinked synthetic Actor UUID without touching its base Actor', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor: synthetic, writes } = fakeActor(0);
    const { actor: base } = fakeActor(0);
    synthetic.uuid = 'Scene.scene.Token.token.Actor.actor';
    const player = { id: 'player', active: true, isGM: false };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).fromUuid = async (uuid: string) => uuid === synthetic.uuid ? synthetic : null;
    await runtime.onSocket({ type: 'setInjury', actorUuid: synthetic.uuid, stacks: 2, requesterId: player.id }, player.id);
    expect(writes).toHaveLength(1);
    expect(synthetic.flags[MODULE_ID].injury.stacks).toBe(2);
    expect(base.flags[MODULE_ID].injury.stacks).toBe(0);
  });

  test('rest socket rejects a correctly spoken but non-native chat message', async () => {
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    const player = { id: 'player', active: true, isGM: false };
    const message = { id: 'forged-rest-message', type: 'message', speaker: { actor: actor.id }, system: { type: 'short' }, getAssociatedActor: () => actor };
    (globalThis as any).game.users.get = (id: string) => id === player.id ? player : null;
    (globalThis as any).game.messages = { get: (id: string) => id === message.id ? message : null };
    (globalThis as any).fromUuid = async (uuid: string) => uuid === actor.uuid ? actor : null;
    await runtime.onSocket({ type: 'restCompleted', actorUuid: actor.uuid, restType: 'short', messageId: message.id, requesterId: player.id }, player.id);
    expect(writes).toHaveLength(0);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { InjuryFadingRuntime, registerSettings, type HpTransitionTriggerContext } from '../src/runtime.ts';
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
      const promptedEpisodePath = `flags.${MODULE_ID}.fadingSpirits.resurrectionPromptedForDeathEpisodeId`;
      if (changes[promptedEpisodePath] !== undefined) this.flags[MODULE_ID].fadingSpirits.resurrectionPromptedForDeathEpisodeId = changes[promptedEpisodePath];
      if (changes['system.attributes.death.failure'] !== undefined) this.system.attributes.death.failure = changes['system.attributes.death.failure'];
      this._stats.modifiedTime += 1;
    },
    async createEmbeddedDocuments() { return []; },
    async updateEmbeddedDocuments() { return []; },
    async deleteEmbeddedDocuments() { return []; },
    testUserPermission(user: any) { return user?.id === 'player' || user?.isGM === true; },
  };
  return { actor, writes };
}

function useExternalTriggerEngineSource(): void {
  const currentGet = (globalThis as any).game.settings.get;
  (globalThis as any).game.settings.get = (_scope: string, key: string) => key === 'enabled' || key === 'automationSource' ? (key === 'enabled' ? true : 'external') : currentGet(_scope, key);
}

function hpTrigger(actor: any, before: { value: number; max: number }, after: { value: number; max: number }, triggerId = 'actor-update-1'): HpTransitionTriggerContext {
  return {
    triggerId,
    triggerName: 'Actor HP update',
    event: { type: 'documentUpdate', documentType: 'Actor' },
    document: actor,
    documentUuid: actor.uuid,
    before: { system: { attributes: { hp: before } } },
    after: { system: { attributes: { hp: after } } },
    changes: { 'system.attributes.hp.value': after.value, 'system.attributes.hp.max': after.max },
    userId: 'player',
    timestamp: 1000,
  };
}

function configureSettings(values: Record<string, unknown>): void {
  (globalThis as any).game.settings.get = (_scope: string, key: string) => values[key];
}

function genericTriggerEvent(actor: any, before: { value: number; max: number; failure?: number }, after: { value: number; max: number; failure?: number }, timestamp = 1000, revision?: number): Record<string, unknown> {
  const revisionData = revision === undefined ? {} : { _stats: { modifiedTime: revision } };
  return {
    event: { type: 'documentUpdate', documentType: 'Actor' },
    document: actor,
    documentUuid: actor.uuid,
    before: { _id: actor.id, documentName: 'Actor', ...revisionData, system: { attributes: { hp: { value: before.value, max: before.max }, death: { failure: before.failure ?? 0 } } } },
    after: { _id: actor.id, documentName: 'Actor', ...revisionData, system: { attributes: { hp: { value: after.value, max: after.max }, death: { failure: after.failure ?? 0 } } } },
    changes: { 'system.attributes.hp.value': after.value, 'system.attributes.death.failure': after.failure ?? 0 },
    userId: 'player',
    timestamp,
  };
}

describe('active-GM runtime authority', () => {
  test('registers world-scoped automation source with Internal Hooks as the default', () => {
    const registrations: Array<{ key: string; config: Record<string, unknown> }> = [];
    (globalThis as any).game.settings.register = (_scope: string, key: string, config: Record<string, unknown>) => {
      registrations.push({ key, config });
    };
    registerSettings();
    const automation = registrations.find((entry) => entry.key === 'automationSource');
    expect(automation?.config).toMatchObject({
      scope: 'world', config: true, type: String, default: 'internal',
      choices: { internal: 'IFS.Settings.AutomationSource.Internal', external: 'IFS.Settings.AutomationSource.External' },
    });
  });

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

  test('external source keeps internal HP hooks observational while retaining the after snapshot', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    actor.system.attributes.hp.value = 10;
    runtime.onPreUpdateActor(actor, { system: { attributes: { hp: { value: 0 } } } }, {});
    actor.system.attributes.hp.value = 0;
    await runtime.onUpdateActor(actor, { system: { attributes: { hp: { value: 0 } } } }, {}, 'player');
    expect(writes).toHaveLength(0);
    expect(runtime.hpSnapshots.get(actor.uuid)).toEqual({ value: 0, max: 10 });
    expect(actor.flags[MODULE_ID].injury.episode.open).toBeFalse();
  });

  test('external HP processing matches the internal transition and is idempotent for the same Trigger Engine event', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    await runtime.processHpTransition(actor, hpTrigger(actor, { value: 10, max: 10 }, { value: 0, max: 10 }));
    expect(writes).toHaveLength(1);
    expect(actor.system.attributes.death.failure).toBe(2);
    expect(actor.flags[MODULE_ID].injury.episode).toMatchObject({ id: expect.stringContaining('trigger-engine:'), open: true });
    const episodeId = actor.flags[MODULE_ID].injury.episode.id;
    expect(actor._stats.modifiedTime).toBe(124);
    expect(runtime.hpSnapshots.get(actor.uuid)).toEqual({ value: 0, max: 10 });
    await runtime.processHpTransition(actor, hpTrigger(actor, { value: 10, max: 10 }, { value: 0, max: 10 }));
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.episode.id).toBe(episodeId);
  });

  test('external transaction identity includes transition metadata when a trigger is reused', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    const down = hpTrigger(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 'reused-trigger');
    await runtime.processHpTransition(actor, down);
    const up = hpTrigger(actor, { value: 0, max: 10 }, { value: 1, max: 10 }, 'reused-trigger');
    up.timestamp = 1001;
    up.changes = { 'system.attributes.hp.value': 1 };
    await runtime.processHpTransition(actor, up);
    expect(writes).toHaveLength(2);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
  });

  test('external max-only transitions update observation without opening or clearing an injury episode', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    await runtime.processHpTransition(actor, hpTrigger(actor, { value: 10, max: 10 }, { value: 10, max: 12 }, 'actor-max-update-1'));
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBeFalse();
    expect(actor.flags[MODULE_ID].injury.lastObservedHp).toBe(10);
    expect(actor.flags[MODULE_ID].injury.lastObservedMax).toBe(12);
    expect(runtime.hpSnapshots.get(actor.uuid)).toEqual({ value: 10, max: 12 });
  });

  test('external processing preserves resurrection suppression on recovery', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(1);
    actor.flags[MODULE_ID].injury.episode = { id: 'death-1', open: true, openedAt: 1 };
    actor.flags[MODULE_ID].injury.suppressNextRecovery = { transactionId: 'resurrection-1', reason: 'resurrection' };
    await runtime.processHpTransition(actor, hpTrigger(actor, { value: 0, max: 10 }, { value: 1, max: 10 }, 'resurrection-recovery-1'));
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBeFalse();
    expect(actor.flags[MODULE_ID].injury.suppressNextRecovery).toBeNull();
  });

  test('external processing rejects a wrong event or document identity without writing or changing snapshots', async () => {
    useExternalTriggerEngineSource();
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    const context = hpTrigger(actor, { value: 10, max: 10 }, { value: 0, max: 10 });
    const invalidEventContext = {
      ...context,
      event: { type: 'preUpdate', documentType: 'Actor' },
    } as unknown as typeof context;
    await runtime.processHpTransition(actor, invalidEventContext);
    await runtime.processHpTransition(actor, { ...context, documentUuid: 'Actor.other' });
    expect(writes).toHaveLength(0);
    expect(runtime.hpSnapshots.has(actor.uuid)).toBeFalse();
    expect(actor.flags[MODULE_ID].injury.episode.open).toBeFalse();
  });

  test('missing Trigger Engine warns the active GM without switching the external source', async () => {
    useExternalTriggerEngineSource();
    const warnings: string[] = [];
    (globalThis as any).ui.notifications.warn = (message: string) => warnings.push(message);
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    actor.system.attributes.hp.value = 10;
    runtime.onPreUpdateActor(actor, { 'system.attributes.hp.value': 0 }, {});
    actor.system.attributes.hp.value = 0;
    await runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 0 }, {}, 'player');
    expect(writes).toHaveLength(0);
    expect(warnings).toContain('IFS.Errors.TriggerEngineUnavailable');
    expect((globalThis as any).game.settings.get('', 'automationSource')).toBe('external');
  });

  test('consumes the real Trigger Engine subscription shape without triggerId/name and deduplicates recovery', async () => {
    configureSettings({ enabled: true, automationSource: 'external', resurrectionPrompt: false, manageNpcs: false });
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    actor.system.attributes.hp.value = 10;
    const down = genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 1000);
    await runtime.handleTriggerEvent(down);
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(true);
    actor.system.attributes.hp.value = 1;
    const up = genericTriggerEvent(actor, { value: 0, max: 10 }, { value: 1, max: 10 }, 1001);
    await runtime.handleTriggerEvent(up);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(1);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(false);
    const writeCount = writes.length;
    await runtime.handleTriggerEvent(up);
    expect(writes).toHaveLength(writeCount);
  });

  test('without snapshot modifiedTime, distinct Trigger Engine timestamps permit a later death episode while same timestamp replays dedupe', async () => {
    configureSettings({ enabled: true, automationSource: 'external', resurrectionPrompt: false, manageNpcs: false });
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(0);
    actor.system.attributes.hp.value = 10;
    const down = genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 4000);
    await runtime.handleTriggerEvent(down);
    actor.system.attributes.hp.value = 1;
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 0, max: 10 }, { value: 1, max: 10 }, 4001));
    actor.system.attributes.hp.value = 10;
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 1, max: 10 }, { value: 10, max: 10 }, 4002));
    const beforeSecondDeath = writes.length;
    actor.system.attributes.hp.value = 0;
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 4003));
    expect(writes.length).toBe(beforeSecondDeath + 1);
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 4003));
    expect(writes.length).toBe(beforeSecondDeath + 1);
  });

  test('public macro bridge and automatic subscription share one Actor revision transaction at three injury stacks', async () => {
    configureSettings({ enabled: true, automationSource: 'external', resurrectionPrompt: false, manageNpcs: false });
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => 'defer' } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(3);
    actor.system.attributes.hp.value = 0;
    const event = genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 1000, 700);
    const macroContext = {
      ...event,
      triggerId: 'approved-hp-macro',
      triggerName: 'Approved HP bridge macro',
      timestamp: 9999,
    } as unknown as HpTransitionTriggerContext;
    await Promise.all([runtime.handleTriggerEvent(event), runtime.processHpTransition(actor, macroContext)]);
    expect(writes).toHaveLength(1);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(true);
    expect(actor.flags[MODULE_ID].injury.episode.id).toContain('fvtt-trigger-engine:');
  });

  test('three-stack GM ruling is detached from the Trigger Engine queue and is discarded after recovery', async () => {
    configureSettings({ enabled: true, automationSource: 'external', resurrectionPrompt: false, manageNpcs: false });
    let resolveDecision!: (value: unknown) => void;
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => new Promise((resolve) => { resolveDecision = resolve; }) } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(3);
    actor.system.attributes.hp.value = 0;
    const down = runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 10, max: 10 }, { value: 0, max: 10 }, 4500));
    await Bun.sleep(2);
    await down;
    expect(typeof resolveDecision).toBe('function');
    actor.system.attributes.hp.value = 1;
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 0, max: 10 }, { value: 1, max: 10 }, 4501));
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(false);
    resolveDecision('dead');
    await Bun.sleep(2);
    expect(actor.system.attributes.death.failure).toBe(0);
    expect(writes.length).toBe(2);
  });

  test('confirmed death prompts once, cancellation writes no ritual history, and a second GM sees the persistent episode guard', async () => {
    configureSettings({ enabled: true, automationSource: 'internal', resurrectionPrompt: true, manageNpcs: false });
    const waits: Array<(value: unknown) => void> = [];
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => new Promise((resolve) => waits.push(resolve)) } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    actor.system.attributes.death.failure = 3;
    actor.flags[MODULE_ID].injury.episode = { id: 'death-episode-1', open: true, openedAt: 1 };
    actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId = 'death-episode-1';
    const event = genericTriggerEvent(actor, { value: 0, max: 10, failure: 0 }, { value: 0, max: 10, failure: 3 }, 2000);
    await runtime.handleTriggerEvent(event);
    await Bun.sleep(2);
    expect(waits).toHaveLength(1);
    expect(actor.flags[MODULE_ID].fadingSpirits.pendingRitual).toBeNull();
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory).toEqual([]);
    expect(actor.flags[MODULE_ID].fadingSpirits.resurrectionPromptedForDeathEpisodeId).toBe('death-episode-1');
    const writeCount = writes.length;
    waits[0]!(false);
    await Bun.sleep(2);
    const secondRuntime = new InjuryFadingRuntime(); secondRuntime.supported = true;
    await secondRuntime.handleTriggerEvent(event);
    await Bun.sleep(2);
    expect(waits).toHaveLength(1);
    expect(writes).toHaveLength(writeCount);
  });

  test('disabled automation and unmanaged NPCs never prompt or write a marker', async () => {
    configureSettings({ enabled: false, automationSource: 'internal', resurrectionPrompt: true, manageNpcs: false });
    const waits: unknown[] = [];
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => { waits.push(true); return false; } } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const first = fakeActor(2);
    first.actor.system.attributes.death.failure = 3;
    first.actor.flags[MODULE_ID].injury.episode = { id: 'disabled-death', open: true, openedAt: 1 };
    first.actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId = 'disabled-death';
    await runtime.handleTriggerEvent(genericTriggerEvent(first.actor, { value: 0, max: 10 }, { value: 0, max: 10, failure: 3 }));
    first.actor.type = 'npc';
    configureSettings({ enabled: true, automationSource: 'internal', resurrectionPrompt: true, manageNpcs: false });
    await runtime.handleTriggerEvent(genericTriggerEvent(first.actor, { value: 0, max: 10 }, { value: 0, max: 10, failure: 3 }, 1001));
    await Bun.sleep(2);
    expect(waits).toEqual([]);
    expect(first.writes).toHaveLength(0);
    expect(first.actor.flags[MODULE_ID].fadingSpirits.resurrectionPromptedForDeathEpisodeId).toBeNull();
  });

  test('recovery while the prompt is open clears the episode before confirmation and never opens the wizard', async () => {
    configureSettings({ enabled: true, automationSource: 'external', resurrectionPrompt: true, manageNpcs: false });
    let resolvePrompt!: (value: unknown) => void;
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => new Promise((resolve) => { resolvePrompt = resolve; }) } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    actor.system.attributes.death.failure = 3;
    actor.flags[MODULE_ID].injury.episode = { id: 'recovery-death', open: true, openedAt: 1 };
    actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId = 'recovery-death';
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 0, max: 10, failure: 0 }, { value: 0, max: 10, failure: 3 }, 3000));
    await Bun.sleep(2);
    expect(typeof resolvePrompt).toBe('function');
    actor.system.attributes.hp.value = 1;
    await runtime.handleTriggerEvent(genericTriggerEvent(actor, { value: 0, max: 10, failure: 3 }, { value: 1, max: 10, failure: 3 }, 3001));
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(false);
    resolvePrompt(true);
    await Bun.sleep(2);
    expect(actor.flags[MODULE_ID].fadingSpirits.pendingRitual).toBeNull();
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  test('a direct dead Active Effect enters the same guarded prompt path', async () => {
    configureSettings({ enabled: true, automationSource: 'internal', resurrectionPrompt: true, manageNpcs: false });
    const waits: unknown[] = [];
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => { waits.push(true); return false; } } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor } = fakeActor(3);
    actor.system.attributes.death.failure = 3;
    actor.flags[MODULE_ID].injury.episode = { id: 'direct-death', open: true, openedAt: 1 };
    actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId = 'direct-death';
    runtime.onActiveEffectDeath({ parent: actor, statuses: new Set(['dead']), disabled: true });
    runtime.onActiveEffectDeath({ parent: actor, statuses: new Set(['dead']), isSuppressed: true });
    await Bun.sleep(2);
    expect(waits).toHaveLength(0);
    runtime.onActiveEffectDeath({ parent: actor, statuses: new Set(['dead']) });
    await Bun.sleep(2);
    expect(waits).toHaveLength(1);
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory).toEqual([]);
  });

  test('delayed AE marker update shares the Actor queue with internal recovery and cannot reopen the old episode', async () => {
    configureSettings({ enabled: true, automationSource: 'internal', resurrectionPrompt: true, manageNpcs: false });
    const waits: unknown[] = [];
    (globalThis as any).foundry.applications = { api: { DialogV2: { wait: () => { waits.push(true); return true; } } } };
    const runtime = new InjuryFadingRuntime(); runtime.supported = true;
    const { actor, writes } = fakeActor(2);
    actor.system.attributes.death.failure = 3;
    actor.flags[MODULE_ID].injury.episode = { id: 'queued-death', open: true, openedAt: 1 };
    actor.flags[MODULE_ID].fadingSpirits.currentDeathEpisodeId = 'queued-death';
    const originalUpdate = actor.update.bind(actor);
    let releaseMarker!: () => void;
    let markerStarted = false;
    const markerGate = new Promise<void>((resolve) => { releaseMarker = resolve; });
    actor.update = async (changes: Record<string, unknown>, options: Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(changes, `flags.${MODULE_ID}.fadingSpirits.resurrectionPromptedForDeathEpisodeId`)) {
        markerStarted = true;
        await markerGate;
      }
      return originalUpdate(changes, options);
    };

    runtime.onActiveEffectDeath({ parent: actor, statuses: new Set(['dead']) });
    await Bun.sleep(2);
    expect(markerStarted).toBe(true);
    actor.system.attributes.hp.value = 1;
    runtime.hpSnapshots.set(actor.uuid, { value: 0, max: 10 });
    const recovery = runtime.onUpdateActor(actor, { 'system.attributes.hp.value': 1 }, {}, 'gm');
    await Bun.sleep(2);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(true);
    releaseMarker();
    await recovery;
    await Bun.sleep(2);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(3);
    expect(actor.flags[MODULE_ID].injury.episode.open).toBe(false);
    expect(actor.flags[MODULE_ID].fadingSpirits.resurrectionPromptedForDeathEpisodeId).toBeNull();
    expect(waits).toEqual([]);
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });
});

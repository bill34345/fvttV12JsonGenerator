import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { createActorModuleState } from '../src/state.ts';
import {
  __testing as uiTesting,
  activateChatCard,
  openActorDashboard,
  openResolveRitualDialog,
  openResurrectionWizard,
  openSetInjuryDialog,
} from '../src/ui.ts';

type AnyRecord = Record<string, any>;

const globals = globalThis as AnyRecord;
const originalGlobals = new Map<string, unknown>();
let dialogResults: unknown[];
let dialogConfigs: AnyRecord[];
let notifications: string[];
let messages: Map<string, AnyRecord>;
let createdMessages: AnyRecord[];
let resolvedDocuments: Map<string, AnyRecord>;
let messageSequence: number;
let rollTotal: number;

beforeEach(() => {
  for (const key of ['game', 'ui', 'foundry', 'CONFIG', 'ChatMessage', 'Roll', 'fromUuid', 'fromUuidSync']) {
    originalGlobals.set(key, globals[key]);
  }
  dialogResults = [];
  dialogConfigs = [];
  notifications = [];
  messages = new Map();
  createdMessages = [];
  resolvedDocuments = new Map();
  messageSequence = 0;
  rollTotal = 30;
  const users: AnyRecord = {
    activeGM: { id: 'gm' },
    get: (id: string) => ({ id, active: id === 'gm', isGM: id === 'gm' }),
  };
  globals.game = {
    user: { id: 'gm', isGM: true },
    users,
    messages,
    i18n: { localize: (key: string) => key },
  };
  globals.ui = { notifications: {
    warn: (message: string) => notifications.push(`warn:${message}`),
    error: (message: string) => notifications.push(`error:${message}`),
    info: (message: string) => notifications.push(`info:${message}`),
  } };
  globals.CONFIG = { DND5E: { skills: { prc: {} }, abilities: { wis: {} } } };
  globals.foundry = { applications: { api: { DialogV2: { wait: async (config: AnyRecord) => {
    dialogConfigs.push(config);
    return dialogResults.shift() ?? null;
  } } } } };
  globals.ChatMessage = {
    create: async (data: AnyRecord, operation: AnyRecord = {}) => {
      // Core changes the caller's ID unless keepId is requested. World document
      // IDs are unique even if two callers reach create before either resolves.
      await Promise.resolve();
      const id = operation.keepId === true && data._id ? data._id : `message-${++messageSequence}`;
      if (messages.has(id)) throw new Error('World document ID already exists');
      const message: AnyRecord = {
        ...structuredClone(data), _id: id, id,
        async delete() { messages.delete(id); },
      };
      messages.set(id, message);
      createdMessages.push(message);
      return message;
    },
    getSpeaker: (data: AnyRecord) => ({ actor: data?.actor?.id, user: data?.user?.id }),
    getWhisperRecipients: () => [{ id: 'gm' }],
  };
  globals.Roll = class {
    total = rollTotal;
    constructor(public formula: string, public data: AnyRecord) {}
    async evaluate() { this.total = rollTotal; return this; }
    async toMessage(data: AnyRecord, options: AnyRecord) {
      createdMessages.push({ roll: true, formula: this.formula, data: this.data, ...data, options });
    }
  };
  globals.fromUuid = async (uuid: string) => resolvedDocuments.get(uuid) ?? null;
  globals.fromUuidSync = (uuid: string) => resolvedDocuments.get(uuid) ?? null;
});

afterEach(() => {
  for (const [key, value] of originalGlobals) globals[key] = value;
  originalGlobals.clear();
});

function actorFixture(uuid = 'Actor.hero') {
  const state = createActorModuleState(0, 10);
  state.fadingSpirits.currentDeathEpisodeId = 'death-1';
  const writes: AnyRecord[] = [];
  const effects: AnyRecord[] = [];
  const actor: AnyRecord = {
    id: uuid.split('.').at(-1), uuid, name: '<Hero & Friend>', type: 'character', documentName: 'Actor', pack: null,
    system: { attributes: { hp: { value: 0, max: 10 } } }, flags: { [MODULE_ID]: state }, effects,
    async update(changes: AnyRecord) {
      writes.push(structuredClone(changes));
      if (changes[`flags.${MODULE_ID}.schemaVersion`] !== undefined) actor.flags[MODULE_ID].schemaVersion = changes[`flags.${MODULE_ID}.schemaVersion`];
      const next = changes[`flags.${MODULE_ID}.fadingSpirits`];
      if (next) actor.flags[MODULE_ID].fadingSpirits = structuredClone(next);
    },
    async createEmbeddedDocuments(_type: string, entries: AnyRecord[]) {
      effects.push(...entries.map((entry, index) => ({ ...structuredClone(entry), id: `effect-${index + 1}`, statuses: new Set(entry.statuses) })));
      return effects;
    },
    async updateEmbeddedDocuments() {},
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      for (const id of ids) {
        const index = effects.findIndex((effect) => effect.id === id);
        if (index >= 0) effects.splice(index, 1);
      }
    },
  };
  resolvedDocuments.set(uuid, actor);
  return { actor, writes, effects };
}

describe('Injury/Fading Spirits Foundry UI flows', () => {
  test('world-document lock admits one concurrent claim and releases only its owner', async () => {
    const { actor, writes } = actorFixture();
    const attemptId = 'resurrection:Actor.hero:death-1:normal:1';
    const claims = await Promise.all([
      uiTesting.acquireResolutionDocumentLock(actor, attemptId, 'normal', 'first-token'),
      uiTesting.acquireResolutionDocumentLock(actor, attemptId, 'normal', 'second-token'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const lockId = uiTesting.resolutionLockDocumentId(actor.uuid, attemptId);
    const lock = messages.get(lockId);
    expect(lock).toBeDefined();
    expect(messages.size).toBe(1);
    expect(lock!.flags[MODULE_ID].resolutionLock).toMatchObject({ actorUuid: actor.uuid, attemptId, mode: 'normal', startedBy: 'gm' });
    const token = lock!.flags[MODULE_ID].resolutionLock.token;
    expect(await uiTesting.acquireResolutionDocumentLock(actor, attemptId, 'normal', token)).toBeTrue();
    expect(await uiTesting.acquireResolutionDocumentLock(actor, attemptId, 'normal', 'third-token')).toBeFalse();
    await uiTesting.releaseResolutionDocumentLock(actor, attemptId, 'not-the-owner');
    expect(messages.get(lockId)).toBe(lock);
    await uiTesting.releaseResolutionDocumentLock(actor, attemptId, token);
    expect(messages.size).toBe(0);
    expect(writes).toHaveLength(0);
  });

  test('world-document lock preserves a foreign message collision without an Actor write', async () => {
    const { actor, writes } = actorFixture();
    const attemptId = 'resurrection:Actor.hero:death-1:normal:1';
    const lockId = uiTesting.resolutionLockDocumentId(actor.uuid, attemptId);
    const foreign = { id: lockId, content: 'Existing message', flags: { anotherModule: { enabled: false } } };
    messages.set(lockId, foreign);
    expect(await uiTesting.acquireResolutionDocumentLock(actor, attemptId, 'normal', 'token')).toBeFalse();
    expect(messages.get(lockId)).toBe(foreign);
    expect(createdMessages).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  test('renders a safe resurrection dashboard without injury controls', async () => {
    await openActorDashboard(null);
    expect(notifications).toContain('warn:IFS.Errors.ActorRequired');

    const { actor, effects } = actorFixture();
    dialogResults.push('close');
    await openActorDashboard(actor);
    expect(dialogConfigs[0]!.content).toContain('&lt;Hero &amp; Friend&gt;');
    expect(dialogConfigs[0]!.buttons.map((button: AnyRecord) => button.action)).toEqual(['beginEpisode', 'resurrection', 'close']);
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(0);
    expect(effects).toHaveLength(0);
  });

  test('legacy injury editor routes to Custom Conditions', async () => {
    const { actor, writes } = actorFixture();
    await openSetInjuryDialog(actor);
    expect(notifications).toContain('warn:IFS.Errors.InjuryMoved');
    expect(writes).toHaveLength(0);
    let target: any;
    globals.game.modules = new Map([['fvtt-custom-conditions', { active: true, api: { openManager: async (context: any) => { target = context.actor; } } }]]);
    await openSetInjuryDialog(actor);
    expect(target).toBe(actor);
  });

  test('inactive or unknown-active CC with retained APIs cannot hide standalone actions or receive writes', async () => {
    for (const active of [false, undefined]) {
      const { actor } = actorFixture(`Actor.inactive-${String(active)}`);
      const calls = { enabled: 0, manager: 0, suppression: 0 };
      globals.game.modules = new Map([['fvtt-custom-conditions', {
        ...(active === undefined ? {} : { active }),
        api: {
          injury: {
            isEnabled: () => { calls.enabled++; return true; },
            suppressNextRecovery: async () => { calls.suppression++; },
          },
          openManager: async () => { calls.manager++; },
        },
      }]]);
      dialogResults.push('close');
      await openActorDashboard(actor);
      expect(dialogConfigs.at(-1)?.buttons.map((button: AnyRecord) => button.action)).toContain('beginEpisode');
      await openSetInjuryDialog(actor);
      expect(notifications).toContain('warn:IFS.Errors.InjuryMoved');
      dialogResults.push({ mode: 'rapid', abilityMod: '4', soulWilling: 'on' });
      await openResurrectionWizard(actor);
      expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory.at(-1)?.result).toBe('success');
      expect(calls).toEqual({ enabled: 0, manager: 0, suppression: 0 });
    }
  });

  test('active CC public APIs remain available to dashboard, editor, and successful resurrection', async () => {
    const { actor } = actorFixture('Actor.active-cc');
    const calls = { enabled: 0, manager: 0, suppression: 0 };
    globals.game.modules = new Map([['fvtt-custom-conditions', { active: true, api: {
      injury: {
        isEnabled: () => { calls.enabled++; return true; },
        suppressNextRecovery: async () => { calls.suppression++; },
      },
      openManager: async () => { calls.manager++; },
    } }]]);
    dialogResults.push('close');
    await openActorDashboard(actor);
    expect(dialogConfigs.at(-1)?.buttons.map((button: AnyRecord) => button.action)).not.toContain('beginEpisode');
    await openSetInjuryDialog(actor);
    dialogResults.push({ mode: 'rapid', abilityMod: '4', soulWilling: 'on' });
    await openResurrectionWizard(actor);
    expect(calls).toEqual({ enabled: 1, manager: 1, suppression: 1 });
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory.at(-1)?.result).toBe('success');
  });

  test('offers an explicit GM death-episode recovery action without Custom Conditions', async () => {
    const { actor } = actorFixture();
    const received: any[] = [];
    globals.game.modules = new Map([[MODULE_ID, { api: { beginDeathEpisode: async (...args: any[]) => received.push(args) } }]]);
    dialogResults.push('beginEpisode');
    await openActorDashboard(actor);
    expect(received).toHaveLength(1);
    expect(received[0][0]).toBe(actor);
    expect(received[0][1]).toStartWith(`gm:${actor.uuid}:`);
  });

  test('executes a rapid blind resurrection with a single persistent claim and sanitized audit', async () => {
    const { actor } = actorFixture();
    dialogResults.push({ mode: 'rapid', abilityMod: '4', soulWilling: 'on' });
    await openResurrectionWizard(actor);

    const state = actor.flags[MODULE_ID];
    expect(state.fadingSpirits.successfulReturns).toBe(1);
    expect(state.fadingSpirits.resurrectionConsumedForCurrentDeath).toBeTrue();
    expect(state.fadingSpirits.resolutionInProgress).toBeNull();
    expect(state.injury.suppressNextRecovery).toBeNull();
    expect(createdMessages.some((message) => message.roll && message.options.rollMode === 'blindroll')).toBeTrue();
    const audit = createdMessages.find((message) => message.flags?.[MODULE_ID]?.card === 'audit');
    expect(audit!.content).toContain('IFS.Fading.BlindDieNotice');
    expect(audit!.content).not.toContain(String(rollTotal));
    expect([...messages.values()].some((message) => message.flags?.[MODULE_ID]?.resolutionLock)).toBeFalse();
  });

  test.each(['normal', 'final', 'rapid'] as const)('IFS final blind roll provenance binds %s to its claimed Actor and attempt without die metadata', async (mode) => {
    const { actor } = actorFixture(`Actor.provenance-${mode}`);
    if (mode === 'final') actor.flags[MODULE_ID].fadingSpirits.conventionalResurrectionLocked = true;
    const attemptId = `resurrection:${actor.uuid}:death-1:${mode}:1`;
    dialogResults.push({ mode, abilityMod: '4', soulWilling: 'on' });
    await openResurrectionWizard(actor, mode === 'final' ? 'final' : undefined);
    if (mode !== 'rapid') {
      expect(actor.flags[MODULE_ID].fadingSpirits.pendingRitual?.id).toBe(attemptId);
      dialogResults.push({ soulWilling: 'on' });
      await openResolveRitualDialog(actor, attemptId);
    }

    const nativeBlindMessages = createdMessages.filter((message) => message.roll && message.options.rollMode === 'blindroll');
    expect(nativeBlindMessages).toHaveLength(1);
    expect(nativeBlindMessages[0]!.flags?.[MODULE_ID]).toEqual({ finalRoll: { actorUuid: actor.uuid, attemptId } });
    expect(nativeBlindMessages[0]!.formula).toBe(mode === 'rapid' ? '1d20 + @mod' : '1d20');
    expect(nativeBlindMessages[0]!.data).toEqual(mode === 'rapid' ? { mod: 4 } : {});
    expect(nativeBlindMessages[0]!.speaker).toEqual({ actor: undefined, user: 'gm' });

    const history = actor.flags[MODULE_ID].fadingSpirits.attemptHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: attemptId, mode, result: 'success' });
    expect(Object.keys(history[0]).sort()).toEqual([
      'at', 'contributionFailures', 'contributionSuccesses', 'dc', 'gmId', 'id', 'mode', 'result',
    ]);
    const audit = createdMessages.find((message) => message.flags?.[MODULE_ID]?.card === 'audit');
    expect(Object.keys(audit!.flags[MODULE_ID]).sort()).toEqual(['card', 'dc', 'failures', 'mode', 'result', 'successes']);
  });

  test('resolves miracle and soul-refusal branches without exposing the blind die', async () => {
    const { actor } = actorFixture('Actor.miracle');
    dialogResults.push({ mode: 'miracle', soulWilling: 'on' });
    await openResurrectionWizard(actor);
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory.at(-1)).toMatchObject({ mode: 'miracle', result: 'success' });

    const { actor: refusing } = actorFixture('Actor.refusing');
    dialogResults.push({ mode: 'rapid', abilityMod: '0' });
    await openResurrectionWizard(refusing);
    expect(refusing.flags[MODULE_ID].fadingSpirits.attemptHistory.at(-1)).toMatchObject({ mode: 'rapid', result: 'declined' });
    expect(refusing.flags[MODULE_ID].fadingSpirits.resurrectionConsumedForCurrentDeath).toBeFalse();
  });

  test('creates validated contributor requests and allows the active GM to cancel the ritual', async () => {
    const { actor } = actorFixture('Actor.ritual');
    const ally = { uuid: 'Actor.ally', documentName: 'Actor', name: 'Cleric' };
    resolvedDocuments.set(ally.uuid, ally);
    dialogResults.push({
      mode: 'normal', soulWilling: 'on', actor0: ally.uuid, check0: 'prc', ability0: 'wis', dc0: '15', advantage0: 'advantage',
    });
    await openResurrectionWizard(actor);
    const pending = actor.flags[MODULE_ID].fadingSpirits.pendingRitual;
    expect(pending.contributors).toHaveLength(1);
    expect(pending.contributors[0]).toMatchObject({ actorUuid: ally.uuid, check: 'prc', ability: 'wis', dc: 15, advantageMode: 'advantage' });
    const request = createdMessages.find((message) => message.flags?.[MODULE_ID]?.contributionRequest);
    expect(request!.system.data.rolls[0].options).toEqual({ advantage: true, disadvantage: false });
    expect(createdMessages.some((message) => message.flags?.[MODULE_ID]?.card === 'ritual')).toBeTrue();

    dialogResults.push('cancelRitual');
    await openResolveRitualDialog(actor, pending.id);
    expect(actor.flags[MODULE_ID].fadingSpirits.pendingRitual).toBeNull();
    expect(actor.flags[MODULE_ID].fadingSpirits.attemptHistory.at(-1)?.result).toBe('cancelled');
  });

  test('fails closed for invalid contributors and activates only GM-owned chat buttons', async () => {
    const { actor } = actorFixture('Actor.invalid');
    dialogResults.push({ mode: 'normal', actor0: 'Actor.missing', check0: 'prc', dc0: '15', advantage0: 'normal' });
    await openResurrectionWizard(actor);
    expect(notifications.some((message) => message.includes('IFS.Errors.ContributorActorInvalid'))).toBeTrue();

    let click: (() => void) | undefined;
    const button = {
      dataset: { actorUuid: actor.uuid, ritualId: 'missing-ritual' },
      addEventListener: (event: string, callback: () => void) => { if (event === 'click') click = callback; },
    };
    activateChatCard({}, { querySelectorAll: () => [button] });
    expect(click).toBeFunction();
    click!();
    await Promise.resolve();
    expect(notifications).toContain('warn:IFS.Errors.RitualMissing');

    globals.game.user.isGM = false;
    click = undefined;
    activateChatCard({}, { querySelectorAll: () => [button] });
    expect(click).toBeUndefined();
  });
});

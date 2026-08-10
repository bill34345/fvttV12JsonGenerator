import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { createActorModuleState } from '../src/state.ts';
import {
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
    create: async (data: AnyRecord) => {
      const id = data._id ?? `message-${++messageSequence}`;
      const message: AnyRecord = {
        ...structuredClone(data), id,
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
      const next = changes[`flags.${MODULE_ID}`];
      if (next) actor.flags[MODULE_ID] = structuredClone(next);
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
  test('renders a safe dashboard and routes to the injury editor', async () => {
    await openActorDashboard(null);
    expect(notifications).toContain('warn:IFS.Errors.ActorRequired');

    const { actor, effects } = actorFixture();
    dialogResults.push('injury', { stacks: '2' });
    await openActorDashboard(actor);
    expect(dialogConfigs[0]!.content).toContain('&lt;Hero &amp; Friend&gt;');
    expect(actor.flags[MODULE_ID].injury.stacks).toBe(2);
    expect(effects).toHaveLength(1);
    expect(effects[0]!.flags[MODULE_ID]).toEqual({ injuryProjection: true, stacks: 2 });
  });

  test('rejects invalid/manual non-GM injury edits without writing', async () => {
    const { actor, writes } = actorFixture();
    dialogResults.push({ stacks: '9' });
    await openSetInjuryDialog(actor);
    expect(notifications).toContain('error:IFS.Errors.InvalidStacks');
    expect(writes).toHaveLength(0);

    globals.game.users.activeGM = { id: 'other-gm' };
    await openSetInjuryDialog(actor);
    expect(notifications).toContain('warn:IFS.Errors.ActiveGmOnly');
  });

  test('executes a rapid blind resurrection with a single persistent claim and sanitized audit', async () => {
    const { actor } = actorFixture();
    dialogResults.push({ mode: 'rapid', abilityMod: '4', soulWilling: 'on' });
    await openResurrectionWizard(actor);

    const state = actor.flags[MODULE_ID];
    expect(state.fadingSpirits.successfulReturns).toBe(1);
    expect(state.fadingSpirits.resurrectionConsumedForCurrentDeath).toBeTrue();
    expect(state.fadingSpirits.resolutionInProgress).toBeNull();
    expect(state.injury.suppressNextRecovery.reason).toBe('rapid-resurrection-success');
    expect(createdMessages.some((message) => message.roll && message.options.rollMode === 'blindroll')).toBeTrue();
    const audit = createdMessages.find((message) => message.flags?.[MODULE_ID]?.card === 'audit');
    expect(audit!.content).toContain('IFS.Fading.BlindDieNotice');
    expect(audit!.content).not.toContain(String(rollTotal));
    expect([...messages.values()].some((message) => message.flags?.[MODULE_ID]?.resolutionLock)).toBeFalse();
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

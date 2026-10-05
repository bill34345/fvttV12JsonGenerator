import { dnd5eMessageData, isReviewedMidiVersion, NEXT_MIDI_VERSION, originatingMessageData } from './adapters/dnd5e-message.ts';
import {
  parseWeaponConfiguration,
  readWeaponConfiguration,
  weaponConfigurationFlags,
  type WeaponConfiguration,
  type WeaponRuleDefinition,
} from '@fvtt-json-generator/contracts/weapon-properties';
import {
  buildWeaponEffectFlag,
  type WeaponEffectInstance,
  type WeaponEffectReservationTicket,
} from '@fvtt-json-generator/contracts/weapon-effects';
import {
  calculateCriticalDamage,
  type CriticalDamageInput,
  type CriticalDamageResult,
} from './core/critical.ts';
import { settleConfiguredWeaponRules } from './core/settlement.ts';
import type {
  AttackAction,
  AttackOutcome,
  AttackSnapshot,
  ConditionSettlement,
  CreatureSize,
  RuleSettlement,
  SettlementReport,
  TargetSnapshot,
  WeaponRuleContext,
} from './core/types.ts';
import {
  customConditionsApi,
  inspectDependencies,
  triggerEngineApi,
  type DependencyReport,
} from './adapters/dependencies.ts';
import {
  activeGM,
  activeTurn,
  actorSize,
  actorUuid,
  activityUuid,
  collection,
  clone,
  documentUuid,
  fromUuid,
  getProperty,
  isActiveGM,
  isOwnedBy,
  itemActivity,
  itemUuid,
  moduleRecord,
  notification,
  randomId,
  targetActor,
  targetToken,
  type QueryContext,
} from './adapters/foundry.ts';
import { defaultWeaponCore, type WeaponCoreAdapter } from './adapters/core.ts';
import {
  applyCriticalBleedingAction,
  applyPushAction,
  resolveToppleAction,
  selectCleaveSecondary,
} from './adapters/actions.ts';
import { applyWeaponCriticalRolls, weaponBaseRollIndex } from './adapters/critical-roll.ts';
import { planWeaponConfigurationUpdate } from './adapters/configuration.ts';
import { calculateCleaveChildDamage } from './adapters/cleave-damage.ts';
import { useMidiActivityUntilAttack, useMidiActivityUntilTerminal } from './adapters/midi-activity.ts';
import { createDamageProof, isUsageMessage, midiItemCardDamageMatches, recoverDamageProofUpdate, validateDamageProof, type DamageProof } from './adapters/damage-proof.ts';
import { MODULE_ID, MODULE_VERSION } from './constants.ts';

export const WEAPON_RUNTIME_API_VERSION = 1 as const;
export const WEAPON_QUERY_PREPARE = `${MODULE_ID}.prepareUse` as const;
export const WEAPON_QUERY_COMMIT = `${MODULE_ID}.commitUse` as const;
export const WEAPON_QUERY_CANCEL = `${MODULE_ID}.cancelUse` as const;
const LEDGER_FLAG = 'ledger' as const;
const PRIVATE_USE_KEY = '__fvttWeaponMasteryUse' as const;

type AnyRecord = Record<string, any>;

export interface WeaponUseRequest {
  item?: any;
  itemUuid?: string;
  activity?: any;
  activityUuid?: string;
  actor?: any;
  actorUuid?: string;
  target?: any;
  targetActor?: any;
  targetToken?: any;
  targetActorUuid?: string;
  targetTokenUuid?: string;
  targets?: any[];
  attackId?: string;
  messageId?: string;
  parentAttackId?: string;
  childDepth?: number;
  selectedMasteryRuleId?: string | null;
  nativeMasteryUnlocked?: boolean;
  attack?: Partial<AttackSnapshot> & AnyRecord;
  outcome?: AttackOutcome;
  critical?: boolean;
  damageDealt?: number;
  action?: AttackAction;
  attackMode?: string;
  lightExtraAttack?: boolean;
  /** Native activity.use options passed through by the public use wrapper. */
  usage?: AnyRecord;
  rollDialog?: AnyRecord;
  rollMessage?: AnyRecord;
}

export interface WeaponEffectReservationState {
  actorUuid: string;
  ticket: WeaponEffectReservationTicket;
  kind?: string;
  targetActorUuid?: string;
}

export type LedgerStep = 'prepared' | 'started' | 'attack' | 'damage' | 'settled' | 'committed' | 'cancelled' | 'failed';

export interface WeaponLedgerEntry {
  schemaVersion: 1;
  attackId: string;
  sourceActorUuid: string;
  itemUuid?: string;
  activityUuid?: string;
  targetActorUuid?: string;
  targetTokenUuid?: string;
  parentAttackId?: string;
  turnKey?: string;
  step: LedgerStep;
  steps: Record<string, LedgerStep>;
  reservations: WeaponEffectReservationState[];
  usedRuleIds: string[];
  createdAt: number;
  updatedAt: number;
  outcome?: AttackOutcome;
  critical?: boolean;
  damageDealt?: number;
  damageProofNonce?: string;
  messageId?: string;
  lightAttack?: boolean;
  attackMode?: string;
  before?: { hp?: number; tempHp?: number };
  requesterId?: string;
  attackMessageId?: string;
  selectedMasteryRuleId?: string | null;
  nativeMasteryUnlocked?: boolean;
  lightExtraAttack?: boolean;
  configuration?: WeaponConfiguration | null;
}

export interface PreparedWeaponUse extends WeaponUseRequest {
  schemaVersion: 1;
  attackId: string;
  sourceActorUuid: string;
  itemUuid?: string;
  activityUuid?: string;
  targetActorUuid?: string;
  targetTokenUuid?: string;
  turnKey?: string;
  reservations: WeaponEffectReservationState[];
  modifiers: { advantage: boolean; disadvantage: boolean };
  createdAt: number;
  /** Internal document references exist only on the local GM copy. */
  sourceActor?: any;
  resolvedItem?: any;
  resolvedActivity?: any;
  resolvedTargetActor?: any;
  resolvedTargetToken?: any;
}

export interface WeaponUseResult {
  attackId: string;
  status: 'committed' | 'cancelled' | 'pending' | 'blocked' | 'failed';
  outcome?: AttackOutcome;
  settlements: readonly RuleSettlement[];
  reason?: string;
  results?: any;
}

export interface WeaponMasteryRuntimeOptions {
  globals?: any;
  core?: WeaponCoreAdapter;
  isActiveGM?: () => boolean;
  strictRuntime?: boolean;
  openManager?: () => Promise<unknown> | unknown;
}

interface RuntimeRequest extends WeaponUseRequest {
  itemUuid: string;
  actorUuid: string;
  activityUuid?: string;
}

interface RuntimeState {
  prepared: PreparedWeaponUse;
  sourceActor: any;
  item: any;
  activity?: any;
  targetActor?: any;
  targetToken?: any;
  ledger: WeaponLedgerEntry;
  started: boolean;
  attackObserved: boolean;
  damageObserved: boolean;
  lastRoll?: any;
  cleaveTarget?: any;
  cleaveDamageAdjusted?: boolean;
  midiWorkflow?: any;
}

interface RuntimeHandler {
  name: string;
  id: any;
}

export class WeaponMasteryRuntime {
  readonly globals: any;
  readonly core: WeaponCoreAdapter;
  readonly strictRuntime: boolean;
  readonly isGM: () => boolean;
  readonly openManager?: () => Promise<unknown> | unknown;
  #started = false;
  #handlers: RuntimeHandler[] = [];
  #midiChildObservers = new Set<AbortController>();
  #queryPrevious = new Map<string, unknown>();
  #pending = new Map<string, RuntimeState>();
  #ledgerCache = new Map<string, WeaponLedgerEntry[]>();
  #guarded = new WeakSet<object>();
  #handoffs = new WeakMap<object, Promise<unknown>>();
  #guardedMessages = new Set<string>();
  #messageAttack = new Map<string, string>();
  #commitLocks = new Map<string, Promise<WeaponUseResult>>();
  #cancelLocks = new Map<string, Promise<WeaponUseResult>>();
  #transitions = new Map<string, Promise<unknown>>();
  #actorWrites = new Map<string, Promise<unknown>>();
  #activeRolls = new Map<string, string>();
  #sequence = 0;

  constructor(options: WeaponMasteryRuntimeOptions = {}) {
    this.globals = options.globals ?? globalThis;
    this.core = options.core ?? defaultWeaponCore;
    this.strictRuntime = true;
    this.isGM = options.isActiveGM ?? (() => isActiveGM(this.globals));
    this.openManager = options.openManager;
  }

  get started(): boolean { return this.#started; }

  dependencies(): DependencyReport & { dependencies: readonly { id: string; ready: boolean; label?: string; error?: string }[]; errors: readonly string[] } {
    const report = inspectDependencies(this.globals);
    const errors = [
      ...report.incompatible,
      ...report.conflicts.map((id) => `Conflicting module active: ${id}`),
    ];
    return {
      ...report,
      ready: report.ready,
      dependencies: report.modules.map((entry) => ({
        id: entry.id,
        ready: entry.compatible,
        label: entry.id === 'fvtt-custom-conditions' ? 'Custom Conditions' : 'Trigger Engine',
        ...(entry.reason ? { error: entry.reason } : {}),
      })),
      errors,
    };
  }

  configuration(item: any): WeaponConfiguration | null {
    return readWeaponConfiguration(item);
  }

  async configure(item: any, configuration: WeaponConfiguration): Promise<WeaponConfiguration | null> {
    const parsed = parseWeaponConfiguration(configuration);
    if (!parsed) throw new TypeError('Invalid weapon mastery and properties configuration.');
    if (!this.isGM()) throw new Error('Weapon mastery configuration is available to the active GM only.');
    if (!item || item.type !== 'weapon' || item.pack || item.inCompendium) throw new Error('A world or Actor weapon is required.');
    if (typeof item.setFlag !== 'function') throw new Error('Weapon document does not support flags.');
    const plan = planWeaponConfigurationUpdate(item, parsed);
    if (plan.status === 'blocked') throw new Error(`Weapon critical contribution cannot be safely edited: ${plan.reason}`);
    if (plan.changed) {
      if (typeof item.update !== 'function') throw new Error('Weapon document does not support an atomic configuration update.');
      await item.update({ ...plan.updates, [`flags.${MODULE_ID}.weapon`]: parsed });
    } else await item.setFlag(MODULE_ID, 'weapon', parsed);
    return parsed;
  }

  effects(actor: any): readonly AnyRecord[] {
    const api = customConditionsApi(this.globals);
    if (!api || typeof api.list !== 'function') return [];
    return api.list(actor).map((entry: any) => {
      const instance = entry?.instance as WeaponEffectInstance | undefined;
      return {
        id: entry?.id,
        ruleId: instance?.ruleId,
        kind: instance?.effectKind,
        label: entry?.name ?? instance?.effectKind,
        summary: instance?.effectKind === 'slow'
          ? `- ${String((instance.params as { speedReduction?: number })?.speedReduction ?? 10)} ft movement`
          : instance?.effectKind === 'sap' ? 'Disadvantage on the next attack' : 'Advantage on the next attack against the target',
        source: instance?.source?.activityUuid ?? instance?.source?.itemUuid ?? instance?.source?.actorUuid,
        sourceUuid: instance?.source?.actorUuid,
        actorUuid: actorUuid(actor),
        itemUuid: instance?.source?.itemUuid,
        activityId: instance?.source?.activityId ?? instance?.source?.activityUuid,
        targetUuid: instance?.target?.actorUuid,
        enabled: entry?.disabled !== true && instance?.enabled !== false,
      };
    });
  }

  /** Start the module's synchronous guards and async completion adapters. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.installQueries();
    const hooks = this.globals?.Hooks;
    if (typeof hooks?.on !== 'function') return;
    this.onHook('dnd5e.preUseActivity', (activity: any, usage: any, dialog: any, message: any) => this.preUseActivity(activity, usage, dialog, message));
    this.onHook('dnd5e.postUseActivity', (activity: any, usage: any, results: any) => this.postUseActivity(activity, usage, results));
    this.onHook('dnd5e.preRollAttack', (config: any, dialog: any, message: any) => this.preRollAttack(config, dialog, message));
    this.onHook('dnd5e.postAttackRollConfiguration', (rolls: any[], config: any) => this.postAttackRollConfiguration(rolls, config));
    this.onHook('dnd5e.preRollDamage', (config: any) => this.preRollDamage(config));
    this.onHook('dnd5e.rollAttackV2', (rolls: any[], data: any) => this.observeNativeAttack(rolls, data, false));
    this.onHook('dnd5e.postRollAttack', (rolls: any[], data: any) => this.observeNativeAttack(rolls, data, true));
    this.onHook('dnd5e.postDamageRollConfiguration', (rolls: any[], config: any, _dialog: any, message: any) => this.postDamageRollConfiguration(rolls, config, message));
    this.onHook('dnd5e.rollDamageV2', (rolls: any[], data: any) => this.observeNativeDamage(rolls, data));
    this.onHook('dnd5e.rollDamage', (rolls: any[], data: any) => this.observeNativeDamage(rolls, data));
    this.onHook('dnd5e.preApplyDamage', (actor: any, amount: number, updates: any, options: any) => this.stampAppliedDamage(actor, amount, updates, options));
    this.onHook('dnd5e.applyDamage', (actor: any, amount: number, options: any) => this.observeAppliedDamage(actor, amount, options));
    this.onHook('updateActor', (actor: any, changed: any, _options: any, userId: string) => this.observeActorDamageUpdate(actor, changed, userId));
    this.onHook('createChatMessage', (message: any) => this.observeChatMessage(message));
    this.onHook('updateCombat', () => this.pruneTurnUsage());
    // Midi-QOL's preAttackRoll is awaited.  Returning false alone is not
    // enough: its workflow falls back to a native roll unless aborted is set.
    this.onHook('midi-qol.preAttackRoll', (workflow: any) => this.preMidiAttack(workflow));
    this.onHook('midi-qol.preAttackRollConfig', (workflow: any) => this.preMidiAttackConfig(workflow));
    for (const name of ['midi-qol.AttackRollComplete', 'midi-qol.DamageRollComplete', 'midi-qol.postActiveEffects', 'midi-qol.RollComplete', 'midi-qol.preAbort', 'midi-qol.postCleanup']) {
      this.onHook(name, (workflow: any) => this.observeMidiCompletion(name, workflow));
    }
    const trigger = triggerEngineApi(this.globals);
    if (trigger && typeof trigger.subscribeExternal === 'function') {
      try {
        const unsubscribe = trigger.subscribeExternal((event: any) => this.onExternalEvent(event));
        this.#handlers.push({ name: 'external', id: unsubscribe });
      } catch { /* optional until dependency ready */ }
    }
  }

  stop(): void {
    if (!this.#started) return;
    for (const controller of this.#midiChildObservers) controller.abort();
    this.#midiChildObservers.clear();
    for (const { name, id } of this.#handlers.splice(0)) {
      if (name === 'external') {
        if (typeof id === 'function') id();
        continue;
      }
      this.globals?.Hooks?.off?.(name, id);
    }
    for (const [name, prior] of this.#queryPrevious) {
      if (this.globals?.CONFIG?.queries) {
        if (prior === undefined) delete this.globals.CONFIG.queries[name];
        else this.globals.CONFIG.queries[name] = prior;
      }
    }
    this.#queryPrevious.clear();
    this.#pending.clear();
    this.#guardedMessages.clear();
    this.#messageAttack.clear();
    this.#commitLocks.clear();
    this.#cancelLocks.clear();
    this.#started = false;
  }

  /**
   * Reserve one or more matching transient effects before the synchronous
   * dnd5e/Midi roll hook.  On a player client this asks the active GM; the
   * query handler receives Foundry's authenticated user context.
   */
  async prepareUse(subject: any, request: WeaponUseRequest = {}): Promise<PreparedWeaponUse | undefined> {
    const normalized = this.normalizeRequest(subject, request);
    if (!normalized) return undefined;
    if (this.isGM()) return this.transition(`prepare:${normalized.actorUuid}`, () => this.prepareAsGM(normalized, this.globals?.game?.user));
    const gm = activeGM(this.globals);
    if (!gm || typeof gm.query !== 'function') {
      notification(this.globals, 'warn', '武器精通需要当前 active GM 在线才能结算。');
      return undefined;
    }
    try {
      const prepared = await gm.query(WEAPON_QUERY_PREPARE, serializeRequest(normalized), { timeout: 5000 });
      if (!prepared) return undefined;
      this.rememberRemotePrepared(prepared, normalized);
      return prepared;
    } catch (error) {
      notification(this.globals, 'error', `武器精通预检失败：${errorMessage(error)}`);
      return undefined;
    }
  }

  /** Prepare once and let the selected native or Midi flow own the attack. */

  async use(subject: any, request: WeaponUseRequest = {}, dialog: AnyRecord = {}, message: AnyRecord = {}): Promise<WeaponUseResult | undefined> {
    const activity = this.resolveActivity(subject, request);
    const prepared = await this.prepareUse(activity ?? subject, { ...request, activity });
    if (!prepared) return undefined;
    if (typeof activity?.use !== 'function') { await this.cancelUse(prepared); return { attackId: prepared.attackId, status: 'failed', settlements: [], reason: 'activity-unavailable' }; }
    if (moduleRecord(this.globals, 'midi-qol')?.active === true) {
      return this.usePreparedMidi(activity, prepared, request, dialog, message);
    }
    let results: any;
    this.#guarded.add(activity);
    try {
      results = await activity.use({ ...request.usage, [PRIVATE_USE_KEY]: prepared.attackId, subsequentActions: false }, dialog, { ...message, data: { ...message.data, flags: { ...message.data?.flags, [MODULE_ID]: { attackId: prepared.attackId } } } });
    } finally { this.#guarded.delete(activity); }
    if (!results) return this.cancelUse(prepared);
    const originId = results.message?.id;
    const outcome = await this.rollPrepared(activity, prepared, request, {}, originId ? { data: originatingMessageData(originId, this.globals.game?.system?.version === '6.0.5') } : {});
    if (outcome.status === 'cancelled' && results.updates && typeof activity.refund === 'function') await activity.refund(results.updates);
    return { ...outcome, results };
  }

  private async usePreparedMidi(activity: any, prepared: PreparedWeaponUse, request: WeaponUseRequest, dialog: AnyRecord, message: AnyRecord): Promise<WeaponUseResult> {
    const blocked = async (reason: string): Promise<WeaponUseResult> => ({
      ...await this.cancelUse(prepared), status: 'blocked', reason,
    });
    // Midi deliberately suppresses automatic attacks for a system card.
    if (message.systemCard) return blocked('midi-system-card-cannot-start-attack');
    let targetsToUse: Set<any> | undefined;
    if (prepared.targetActorUuid) {
      const token = prepared.targetTokenUuid ? await fromUuid(this.globals, prepared.targetTokenUuid) : undefined;
      const placeable = token?.object ?? (token?.document ? token : undefined);
      if (!placeable || documentUuid(targetToken(placeable)) !== prepared.targetTokenUuid
        || actorUuid(targetActor(placeable)) !== prepared.targetActorUuid) return blocked('midi-target-token-unavailable');
      targetsToUse = new Set([placeable]);
    }
    const usage = {
      ...request.usage, [PRIVATE_USE_KEY]: prepared.attackId, subsequentActions: false,
      midiOptions: {
        ...request.usage?.midiOptions,
        ...(targetsToUse ? { targetsToUse, ignoreUserTargets: true } : {}),
        workflowOptions: {
          ...request.usage?.midiOptions?.workflowOptions,
          [PRIVATE_USE_KEY]: prepared.attackId, autoRollAttack: true,
        },
      },
    };
    try {
      const observation = await useMidiActivityUntilAttack({
        activity, sequenceId: prepared.attackId, globals: this.globals, usage, dialog,
        message: { ...message, data: { ...message.data, flags: {
          ...message.data?.flags, [MODULE_ID]: { attackId: prepared.attackId },
        } } },
      });
      if (observation.event === 'abort' || observation.event === 'refused') {
        return { ...await this.cancelUse(prepared), status: 'cancelled', results: observation.results };
      }
      const messageId = observation.workflow?.attackRoll?.parent?.id ?? observation.workflow?.attackRollMessageId;
      const outcome = await this.commitUse(prepared, typeof messageId === 'string' ? { messageId } : {});
      return { ...outcome, results: observation.results };
    } catch (error) {
      return { ...await this.cancelUse(prepared), status: 'failed', settlements: [], reason: errorMessage(error) };
    }
  }

  async attack(subject: any, request: WeaponUseRequest = {}): Promise<WeaponUseResult | undefined> {
    const activity = this.resolveActivity(subject, request);
    const prepared = await this.prepareUse(activity ?? subject, { ...request, activity });
    if (!prepared) return undefined;
    return this.rollPrepared(activity, prepared, request, (request as AnyRecord).rollDialog ?? {}, (request as AnyRecord).rollMessage ?? {});
  }

  private async rollPrepared(activity: any, prepared: PreparedWeaponUse, request: WeaponUseRequest, dialog: AnyRecord, message: AnyRecord): Promise<WeaponUseResult> {
    if (typeof activity?.rollAttack !== 'function') { await this.cancelUse(prepared); return { attackId: prepared.attackId, status: 'failed', settlements: [], reason: 'activity-unavailable' }; }
    const key = String(activityUuid(activity));
    if (this.#activeRolls.has(key)) { await this.cancelUse(prepared); return { attackId: prepared.attackId, status: 'blocked', settlements: [], reason: 'another-roll-is-pending-for-this-activity' }; }
    this.#activeRolls.set(key, prepared.attackId);
    const rollMessage = { ...message, data: { ...message.data, flags: { ...message.data?.flags, [MODULE_ID]: { attackId: prepared.attackId } } } };
    const rollConfig: AnyRecord = { ...request.usage, [PRIVATE_USE_KEY]: prepared.attackId, ...(request.attackMode ? { attackMode: request.attackMode } : {}) };
    // Supply our contribution before dnd5e dispatches preRollAttack. Other
    // participants (including AC5e) capture the incoming mode in that hook;
    // adding it only in our later handler leaves their dialog default stale.
    if (prepared.modifiers.advantage) rollConfig.advantage = true;
    if (prepared.modifiers.disadvantage) rollConfig.disadvantage = true;
    try {
      // The public configuration dialog is awaited by BasicRoll.buildConfigure.
      // Reserve before showing it, and start only after confirmation. Cancellation
      // therefore releases the reservation without consuming the effect.
      const configuredDialog = { ...dialog };
      const Original = configuredDialog.applicationClass
        ?? this.globals?.game?.dnd5e?.applications?.dice?.AttackRollConfigurationDialog
        ?? this.globals?.game?.dnd5e?.dice?.D20Roll?.DefaultConfigurationDialog;
      if (configuredDialog.configure !== false && typeof Original?.configure === 'function') {
        const runtime = this;
        configuredDialog.configure = true;
        configuredDialog.applicationClass = class {
          static async configure(...args: any[]) {
            const rolls = await Original.configure(...args);
            if (rolls?.length) {
              await runtime.finalizeSelection(prepared, {
                attackMode: rolls[0]?.options?.attackMode ?? args[0]?.attackMode,
                selectedMasteryRuleId: rolls[0]?.options?.mastery ?? args[0]?.mastery,
              });
              await runtime.startUse(prepared);
            }
            return rolls;
          }
        };
        // Fast-forward keybindings must not skip an unstarted reservation.
        rollConfig.event = undefined;
      } else await this.startUse(prepared);
      const rolls = await activity.rollAttack(rollConfig, configuredDialog, rollMessage);
      if (!rolls?.length) return this.cancelUse(prepared);
      // The roll itself is over. A Cleave child may now use the same Activity
      // while the parent is settling without inheriting the parent's nonce.
      if (this.#activeRolls.get(key) === prepared.attackId) this.#activeRolls.delete(key);
      const id = rolls[0]?.parent?.id ?? rolls[0]?.parent?._id;
      const result = await this.commitUse(prepared, typeof id === 'string' ? { messageId: id } : {});
      return { ...result, results: { rolls } };
    } catch (error) {
      const cancelled = await this.cancelUse(prepared);
      return { ...cancelled, status: 'failed', reason: errorMessage(error) };
    } finally {
      if (this.#activeRolls.get(key) === prepared.attackId) this.#activeRolls.delete(key);
      this.#guarded.delete(activity);
    }
  }

  async startUse(prepared: PreparedWeaponUse): Promise<PreparedWeaponUse> {
    if (this.isGM()) return this.transition(prepared.attackId, () => this.startAsGM(prepared));
    const gm = activeGM(this.globals);
    if (!gm || typeof gm.query !== 'function') throw new Error('No active GM is available to start this attack.');
    const started = await gm.query(`${WEAPON_QUERY_PREPARE}.start`, serializePrepared(prepared), { timeout: 5000 });
    const state = this.#pending.get(prepared.attackId);
    if (state && started) {
      state.prepared = started;
      state.started = true;
      state.ledger.step = 'started';
      state.ledger.steps.started = 'started';
    }
    return started;
  }

  async commitUse(prepared: PreparedWeaponUse, outcome: AnyRecord = {}): Promise<WeaponUseResult> {
    if (this.isGM()) {
      return this.transition(prepared.attackId, () => this.commitAsGM(prepared, serializeOutcome(outcome), this.globals?.game?.user));
    }
    const gm = activeGM(this.globals);
    if (!gm || typeof gm.query !== 'function') return { attackId: prepared.attackId, status: 'blocked', settlements: [], reason: 'no-active-gm' };
    try {
      return await gm.query(WEAPON_QUERY_COMMIT, { prepared: serializePrepared(prepared), outcome: serializeOutcome(outcome) }, { timeout: 8000 });
    } catch (error) {
      return { attackId: prepared.attackId, status: 'failed', settlements: [], reason: errorMessage(error) };
    }
  }

  async cancelUse(prepared: PreparedWeaponUse): Promise<WeaponUseResult> {
    if (this.isGM()) {
      return this.transition(prepared.attackId, () => this.cancelAsGM(prepared, this.globals?.game?.user));
    }
    const gm = activeGM(this.globals);
    if (!gm || typeof gm.query !== 'function') return { attackId: prepared.attackId, status: 'blocked', settlements: [], reason: 'no-active-gm' };
    try {
      return await gm.query(WEAPON_QUERY_CANCEL, serializePrepared(prepared), { timeout: 5000 });
    } catch (error) {
      return { attackId: prepared.attackId, status: 'failed', settlements: [], reason: errorMessage(error) };
    }
  }

  criticalDamage(input: CriticalDamageInput): CriticalDamageResult {
    return calculateCriticalDamage(input);
  }

  /** Synchronous dnd5e pre-use guard. It never waits for a socket/query. */
  preUseActivity(activity: any, usage: any, dialog: any = {}, message: any = {}): boolean | void {
    if (!activity || this.#guarded.has(activity) || usage?.[PRIVATE_USE_KEY]) return true;
    // Midi owns Activity.use and awaits our preAttackRoll hook. Do not replace
    // its use workflow with a second native/manual roll.
    if (moduleRecord(this.globals, 'midi-qol')?.active === true) return;
    if (!this.requiresPreparation(activity)) return;
    if (!this.#handoffs.has(activity)) {
      const handoff = this.use(activity, { activity, actor: activity.actor, usage }, dialog, message)
        .catch((error) => this.report(error))
        .finally(() => { this.#handoffs.delete(activity); });
      this.#handoffs.set(activity, handoff);
    }
    return false;
  }

  postUseActivity(_activity: any, usage: any, results: any): boolean | void {
    // dnd5e consumes item resources before this hook.  The public wrapper
    // sets postUseActivity false and rolls the attack exactly once itself.
    if (usage?.[PRIVATE_USE_KEY] && results?.message?.id) this.#messageAttack.set(String(results.message.id), String(usage[PRIVATE_USE_KEY]));
    return;
  }

  preRollAttack(config: any, dialog: any = {}, message: any = {}): boolean | void {
    const subject = config?.subject ?? config?.activity ?? config?.rolls?.[0]?.options?.subject;
    const attackId = config?.[PRIVATE_USE_KEY] ?? config?.options?.[PRIVATE_USE_KEY] ?? this.findAttackId(subject);
    const state = attackId ? this.#pending.get(String(attackId)) : undefined;
    if (state && !isTerminal(state.ledger)) {
      // Activity.use already owns its native roll. A chat-card Attack click
      // while that dialog is open must not attach a second roll to its lease.
      if (moduleRecord(this.globals, 'midi-qol')?.active !== true
        && this.#activeRolls.get(String(activityUuid(subject))) === state.prepared.attackId
        && config?.[PRIVATE_USE_KEY] !== state.prepared.attackId
        && config?.options?.[PRIVATE_USE_KEY] !== state.prepared.attackId) {
        notification(this.globals, 'warn', '该武器已有未完成的攻击窗口，请先完成或取消该窗口。');
        return false;
      }
      config[PRIVATE_USE_KEY] = attackId;
      message.data ??= {};
      message.data.flags ??= {};
      const midiCardId = state.midiWorkflow?.chatCard?.id;
      message.data.flags[MODULE_ID] = {
        ...message.data.flags[MODULE_ID], attackId,
        ...(typeof midiCardId === 'string' ? { midiCardId } : {}),
      };
      if (typeof midiCardId === 'string' && this.globals.game?.system?.version === '6.0.5') {
        message.data.system ??= {};
        message.data.system.origin ??= midiCardId;
      }
      // Midi can suppress native attack messages; keep an authoritative native
      // message with the original visibility/roll mode for GM adjudication.
      message.create = true;
      for (const rollConfig of config.rolls ?? []) {
        rollConfig.options ??= {};
        rollConfig.options[PRIVATE_USE_KEY] = attackId;
      }
      if (state.prepared.modifiers.advantage) {
        config.advantage = true;
        config.rolls?.[0]?.options && (config.rolls[0].options.advantage = true);
      }
      if (state.prepared.modifiers.disadvantage) {
        config.disadvantage = true;
        config.rolls?.[0]?.options && (config.rolls[0].options.disadvantage = true);
      }
      if (moduleRecord(this.globals, 'midi-qol')?.active === true && !state.started) {
        // Midi's preAttackRoll runs before the d20 dialog. This public dialog
        // boundary is awaitable, so a cancelled roll can release a reservation
        // before it is started and a confirmed roll starts it before evaluation.
        // Always show this module's confirmation boundary, including Midi's
        // fast-forward path. The final offhand/mastery choice is validated
        // before an effect reservation can become started.
        dialog.configure = true;
        config.event = undefined;
        const Original = dialog.applicationClass ?? this.globals?.game?.dnd5e?.dice?.D20Roll?.DefaultConfigurationDialog;
        if (typeof Original?.configure !== 'function') {
          void this.abortMidiWorkflow(state).catch(error => this.report(error));
          return false;
        }
        const runtime = this;
        dialog.applicationClass = class {
          static async configure(...args: any[]) {
            let rolls: any[];
            try { rolls = await Original.configure(...args); }
            catch (error) {
              await runtime.cancelUse(state.prepared);
              runtime.#activeRolls.delete(String(state.prepared.activityUuid));
              await runtime.abortMidiWorkflow(state);
              throw error;
            }
            if (!rolls?.length) {
              await runtime.cancelUse(state.prepared);
              runtime.#activeRolls.delete(String(state.prepared.activityUuid));
              await runtime.abortMidiWorkflow(state);
              return rolls;
            }
            await runtime.finalizeSelection(state.prepared, {
              attackMode: rolls[0]?.options?.attackMode ?? args[0]?.attackMode,
              selectedMasteryRuleId: rolls[0]?.options?.mastery ?? args[0]?.mastery,
            });
            await runtime.startUse(state.prepared);
            return rolls;
          }
        };
      }
      return true;
    }
    if (!subject) return;
    if (!this.requiresPreparation(subject)) return;
    if (moduleRecord(this.globals, 'midi-qol')?.active === true) {
      // Midi owns this roll. A missing or stale prepared attack must not start
      // a second native roll through the fallback handoff.
      notification(this.globals, 'error', '武器攻击缺少有效的 Midi 预检，已阻止本次掷骰。');
      return false;
    }
    if (!this.#handoffs.has(subject)) {
      const handoff = this.attack(subject, {
        activity: subject,
        actor: subject.actor,
        targets: collection(config?.targets ?? this.globals?.game?.user?.targets),
        usage: { ...config },
        attackMode: config?.attackMode,
        rollDialog: dialog,
        rollMessage: message,
      }).catch((error) => this.report(error)).finally(() => { this.#handoffs.delete(subject); });
      this.#handoffs.set(subject, handoff);
    }
    return false;
  }

  postAttackRollConfiguration(rolls: any[], config: any): boolean | void {
    if (moduleRecord(this.globals, 'midi-qol')?.active !== true || !rolls?.length) return;
    const id = config?.[PRIVATE_USE_KEY] ?? this.findAttackId(config?.subject);
    const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
    if (!state || state.started || isTerminal(state.ledger)) return;
    void this.cancelUse(state.prepared).catch(error => this.report(error));
    void this.abortMidiWorkflow(state).catch(error => this.report(error));
    this.#activeRolls.delete(String(state.prepared.activityUuid));
    notification(this.globals, 'error', '武器攻击未完成确认，已阻止未授权骰子。');
    return false;
  }

  postDamageRollConfiguration(rolls: any[], config: any, _message?: any): boolean | void {
    const childId = config?.[PRIVATE_USE_KEY] ?? config?.workflow?.workflowOptions?.[PRIVATE_USE_KEY];
    const childState = typeof childId === 'string' ? this.#pending.get(childId) : undefined;
    if (childState?.prepared.parentAttackId) {
      const sourceRolls = collection(config.rolls);
      if (sourceRolls.length !== rolls.length) return false;
      for (const [index, roll] of rolls.entries()) {
        if (sourceRolls[index]?.base === true) {
          roll.base = true;
          roll.abilityModifierIncluded = false;
        }
      }
    }
    const result = applyWeaponCriticalRolls(rolls, config, this.globals);
    if (result.block) {
      notification(this.globals, 'error', `武器重击特质无法安全应用：${result.reason}`);
      return false;
    }
    return;
  }

  preRollDamage(config: any): boolean | void {
    const id = config?.[PRIVATE_USE_KEY] ?? config?.workflow?.workflowOptions?.[PRIVATE_USE_KEY];
    const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
    if (!state?.prepared.parentAttackId) return;
    const baseIndex = weaponBaseRollIndex(config);
    if (baseIndex !== null) config.rolls[baseIndex].base = true;
    const bases = collection(config.rolls).filter((entry: any) => entry?.base === true);
    if (bases.length !== 1 || !Number.isFinite(bases[0]?.data?.mod)) {
      notification(this.globals, 'error', 'Cleave 无法确认武器基础伤害与属性修正，本次伤害已中止。');
      return false;
    }
    bases[0].data.mod = Math.min(0, Number(bases[0].data.mod));
    state.cleaveDamageAdjusted = true;
    return true;
  }

  private async preMidiAttack(workflow: any): Promise<boolean | void> {
    if (!workflow) return;
    const activity = workflow.activity ?? workflow.item?.system?.activities?.get?.(workflow.activityId);
    if (!activity || !this.requiresPreparation(activity)) return;
    const existing = workflow.workflowOptions?.[PRIVATE_USE_KEY] ?? workflow.options?.[PRIVATE_USE_KEY] ?? workflow[PRIVATE_USE_KEY];
    const existingState = existing ? this.#pending.get(String(existing)) : undefined;
    if (existingState && !isTerminal(existingState.ledger)) {
      existingState.midiWorkflow = workflow;
      workflow[PRIVATE_USE_KEY] = existingState.prepared.attackId;
      this.#activeRolls.set(String(existingState.prepared.activityUuid), existingState.prepared.attackId);
      return true;
    }
    if (existing) { workflow.aborted = true; return true; }
    let prepared: PreparedWeaponUse | undefined;
    try {
      prepared = await this.prepareUse(activity, {
        activity,
        actor: activity.actor,
        targets: workflow.targets ? [...workflow.targets] : undefined,
        target: workflow.targets ? [...workflow.targets][0] : undefined,
        attackId: String(workflow.id ?? workflow.uuid) + ':' + Number(workflow.attackRollCount ?? 0),
      });
    } catch (error) {
      this.report(error);
    }
    if (!prepared) {
      workflow.aborted = true;
      // Midi interprets `false` here as a request to fall back to a native
      // roll. Let its own post-config aborted check stop this workflow.
      return true;
    }
    workflow[PRIVATE_USE_KEY] = prepared.attackId;
    workflow.workflowOptions ??= {};
    workflow.workflowOptions[PRIVATE_USE_KEY] = prepared.attackId;
    workflow.options ??= {};
    workflow.options[PRIVATE_USE_KEY] = prepared.attackId;
    const state = this.#pending.get(prepared.attackId);
    if (state) {
      state.midiWorkflow = workflow;
      this.#activeRolls.set(String(state.prepared.activityUuid), prepared.attackId);
    }
    return true;
  }

  private preMidiAttackConfig(workflow: any): void {
    const attackId = workflow?.[PRIVATE_USE_KEY] ?? workflow?.workflowOptions?.[PRIVATE_USE_KEY] ?? workflow?.options?.[PRIVATE_USE_KEY];
    const state = attackId ? this.#pending.get(String(attackId)) : undefined;
    if (!state) return;
    const tracker = workflow.attackRollModifierTracker ?? workflow.attackRoll ?? workflow.attackRollConfig ?? workflow;
    if (state.prepared.modifiers.advantage) addTracker(tracker?.advantage, 'Weapon mastery effect');
    if (state.prepared.modifiers.disadvantage) addTracker(tracker?.disadvantage, 'Weapon mastery effect');
  }


  private observeNativeAttack(rolls: any[], data: any, completed: boolean): void {
    const subject = data?.subject;
    const roll = rolls?.[0];
    const message = roll?.parent;
    const id = roll?.options?.[PRIVATE_USE_KEY] ?? this.findAttackId(subject, message?.id);
    const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
    if (!state || isTerminal(state.ledger)) return;
    state.lastRoll = roll;
    if (message && this.bindAttackMessage(state, message) && this.isGM()) void this.persistState(state).catch(error => this.report(error));
    if (completed && message?.id) void this.commitUse(state.prepared, { messageId: message.id }).catch(error => this.report(error));
  }

  private observeNativeDamage(rolls: any[], data: any): void {
    for (const roll of rolls ?? []) {
      const message = roll?.parent;
      const originId = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.originatingMessage;
      const id = message?.flags?.[MODULE_ID]?.attackId ?? (originId ? this.#messageAttack.get(originId) : undefined);
      const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
      if (state && message?.id && this.damageMessageMatchesState(message, state)) this.#messageAttack.set(message.id, id);
    }
    // Rolling damage is not evidence that a target received damage.
  }

  private observeAppliedDamage(actor: any, amount: number, options: any): void {
    if (!this.isGM() || options?.[MODULE_ID]?.ruleId || !Number.isFinite(amount) || amount < 0) return;
    const message = options?.originatingMessage ?? options?.origin;
    // Midi's same-card callback does not prove how much HP was actually lost.
    // Its preApplyDamage/updateActor proof is the sole settlement path.
    if (this.isMidiSameCard(message)) return;
    const state = this.findDamageState(actor, message);
    if (!state) return;
    // A matching updateActor proof records the actual HP/temp-HP change.
    // dnd5e's post-apply `amount` precedes HP truncation, so it must not
    // overwrite a proof with an exaggerated amount.
    const stamped = actor?.getFlag?.(MODULE_ID, 'damageProof') ?? actor?.flags?.[MODULE_ID]?.damageProof;
    if (stamped?.attackId === state.prepared.attackId && stamped?.damageMessageId === message?.id) return;
    // Only the actual native application callback may supply a damage amount.
    state.damageObserved = true;
    state.ledger.steps.damage = 'damage';
    state.ledger.damageDealt = Math.max(Number(state.ledger.damageDealt ?? 0), amount);
    state.prepared.damageDealt = state.ledger.damageDealt;
    void this.commitUse(state.prepared, { messageId: state.ledger.attackMessageId }).catch(error => this.report(error));
  }

  private stampAppliedDamage(actor: any, amount: number, updates: any, options: any): void {
    if (!Number.isFinite(amount) || amount <= 0 || !updates || typeof updates !== 'object'
      || options?.[MODULE_ID]) {
      this.reportDamageDiagnostic('pre-apply-guard', actor, amount, updates, options);
      return;
    }
    const message = options?.originatingMessage ?? options?.origin;
    const state = this.findDamageState(actor, message);
    if (this.isMidiSameCard(message) && !this.midiCardHasDamageRoll(message)) {
      this.reportDamageDiagnostic('midi-card-without-damage-roll', actor, amount, updates, options, message);
      return;
    }
    const discovered = state ? {
      attackId: state.prepared.attackId,
      attackMessageId: state.ledger.attackMessageId,
      sourceActorUuid: state.prepared.sourceActorUuid,
      requesterId: state.ledger.requesterId,
    } : this.discoverDamageAttack(actor, message);
    if (!discovered?.attackMessageId || !discovered.requesterId
      || (message?.id === discovered.attackMessageId && !this.isMidiSameCard(message))) {
      this.reportDamageDiagnostic('unmatched-attack-link', actor, amount, updates, options, message);
      return;
    }
    const before = snapshotHp(actor);
    const afterHp = updates['system.attributes.hp.value'] ?? before.hp;
    const afterTemp = updates['system.attributes.hp.temp'] ?? before.tempHp;
    if (!Number.isFinite(before.hp) || !Number.isFinite(before.tempHp)
      || !Number.isFinite(afterHp) || !Number.isFinite(afterTemp)) {
      this.reportDamageDiagnostic('invalid-hp-update', actor, amount, updates, options, message);
      return;
    }
    if (message?.flags?.['midi-qol']?.type === 0 && !midiItemCardDamageMatches(message, {
      actorUuid: actorUuid(actor) ?? '', tokenUuid: message.flags['midi-qol'].hitTargetUuids?.[0] ?? '',
      before: { hp: Number(before.hp), tempHp: Number(before.tempHp) }, after: { hp: afterHp, tempHp: afterTemp },
    })) {
      this.reportDamageDiagnostic('midi-item-card-hp-mismatch', actor, amount, updates, options, message);
      return;
    }
    const proposed = createDamageProof({
      schemaVersion: 1,
      attackId: discovered.attackId,
      attackMessageId: discovered.attackMessageId,
      damageMessageId: message.id,
      actorUuid: discovered.sourceActorUuid,
      targetActorUuid: actorUuid(actor),
      requesterId: discovered.requesterId,
      before: { hp: before.hp, tempHp: before.tempHp },
      after: { hp: afterHp, tempHp: afterTemp },
      nonce: `${randomId(this.globals, 'damage')}-${Date.now()}`,
    }, message?.id === discovered.attackMessageId && this.isMidiSameCard(message));
    if (proposed.ok) updates[`flags.${MODULE_ID}.damageProof`] = proposed.proof;
    else this.reportDamageDiagnostic(`proof-${proposed.reason}`, actor, amount, updates, options, message);
  }

  private reportDamageDiagnostic(reason: string, actor: any, amount: number, updates: any, options: any, message?: any): void {
    // Opt in from an active GM's console for one local diagnostic run.
    if (!this.isGM() || this.globals?.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ !== true) return;
    const origin = message ?? options?.originatingMessage ?? options?.origin;
    const entry = {
      reason, amount, targetActorUuid: actorUuid(actor),
      originatingMessageId: options?.originatingMessage?.id ?? null,
      originId: options?.origin?.id ?? null,
      resolvedMessageId: origin?.id ?? null,
      midiSourceActorUuid: options?.midi?.sourceActorUuid ?? null,
      midiTargetUuid: options?.midi?.targetUuid ?? null,
      beforeHp: actor?.system?.attributes?.hp?.value ?? null,
      beforeTempHp: actor?.system?.attributes?.hp?.temp ?? null,
      afterHp: updates?.['system.attributes.hp.value'] ?? null,
      afterTempHp: updates?.['system.attributes.hp.temp'] ?? null,
    };
    const log = Array.isArray(this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__)
      ? this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ : [];
    log.push(entry);
    if (log.length > 20) log.splice(0, log.length - 20);
    this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ = log;
    this.globals?.console?.debug?.(`[${MODULE_ID}] preApplyDamage rejected`, entry);
  }

  private traceDamageProof(stage: string, actor: any, proof?: DamageProof, state?: RuntimeState): void {
    if (!this.isGM() || this.globals?.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ !== true) return;
    const entry = {
      reason: `proof-${stage}`, targetActorUuid: actorUuid(actor) ?? null,
      attackId: proof?.attackId ?? null,
      attackMessageId: proof?.attackMessageId ?? null,
      damageMessageId: proof?.damageMessageId ?? null,
      ledgerStep: state?.ledger.step ?? null,
      hp: actor?.system?.attributes?.hp?.value ?? null,
    };
    const log = Array.isArray(this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__)
      ? this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ : [];
    log.push(entry);
    if (log.length > 20) log.splice(0, log.length - 20);
    this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ = log;
  }

  private discoverDamageAttack(actor: any, damageMessage: any): {
    attackId: string; attackMessageId: string; sourceActorUuid: string; requesterId: string;
  } | undefined {
    if (this.isMidiSameCard(damageMessage)) {
      const flags = dnd5eMessageData(damageMessage, this.globals.game?.system?.version === '6.0.5');
      const sourceActorUuid = damageMessage.flags?.['midi-qol']?.sourceActorUuid;
      const linked = this.midiLinkedAttackMessages(damageMessage);
      const attack = linked.length === 1 ? linked[0] : undefined;
      const attackId = attack?.flags?.[MODULE_ID]?.attackId ?? damageMessage.flags?.[MODULE_ID]?.attackId;
      const attackMessageId = attack?.id ?? damageMessage.id;
      const requesterId = damageMessage?.author?.id ?? damageMessage?.user?.id ?? damageMessage?.user;
      if (typeof attackId !== 'string' || typeof sourceActorUuid !== 'string'
        || typeof requesterId !== 'string' || typeof attackMessageId !== 'string'
        || typeof flags?.activity?.uuid !== 'string' || typeof flags?.item?.uuid !== 'string'
        || !flags.item.uuid.startsWith(`${sourceActorUuid}.Item.`)
        || linked.length > 1
        || (attack && (dnd5eMessageData(attack, this.globals.game?.system?.version === '6.0.5')?.activity?.uuid !== flags.activity.uuid
          || dnd5eMessageData(attack, this.globals.game?.system?.version === '6.0.5')?.item?.uuid !== flags.item.uuid
          || (attack.author?.id ?? attack.user?.id ?? attack.user) !== requesterId))
        || !this.midiCardMatchesTarget(damageMessage, actor)
        || !this.midiCardHasDamageRoll(damageMessage)) return undefined;
      return { attackId, attackMessageId, sourceActorUuid, requesterId };
    }
    const damageFlags = dnd5eMessageData(damageMessage, this.globals.game?.system?.version === '6.0.5');
    const damageAuthor = damageMessage?.author?.id ?? damageMessage?.user?.id ?? damageMessage?.user;
    if (damageFlags?.roll?.type !== 'damage' || typeof damageMessage?.id !== 'string'
      || typeof damageFlags?.activity?.uuid !== 'string' || typeof damageFlags?.item?.uuid !== 'string'
      || typeof damageAuthor !== 'string' || !Number.isFinite(damageMessage.timestamp)) return undefined;
    const targetId = actorUuid(actor);
    const origin = damageFlags.originatingMessage;
    const candidates = collection(this.globals?.game?.messages).filter((message: any) => {
      const flags = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5');
      const author = message?.author?.id ?? message?.user?.id ?? message?.user;
      const usage = origin && origin !== message?.id ? this.globals?.game?.messages?.get?.(origin) : undefined;
      const usageLinked = !origin || origin === message?.id || (isUsageMessage(usage)
        && usage?.flags?.[MODULE_ID]?.attackId === message?.flags?.[MODULE_ID]?.attackId
        && dnd5eMessageData(usage, this.globals.game?.system?.version === '6.0.5')?.activity?.uuid === flags?.activity?.uuid
        && dnd5eMessageData(usage, this.globals.game?.system?.version === '6.0.5')?.item?.uuid === flags?.item?.uuid
        && flags?.originatingMessage === origin);
      return typeof message?.id === 'string' && typeof message?.flags?.[MODULE_ID]?.attackId === 'string'
        && flags?.roll?.type === 'attack' && flags?.activity?.uuid === damageFlags.activity.uuid
        && flags?.item?.uuid === damageFlags.item.uuid && author === damageAuthor
        && Number.isFinite(message.timestamp) && message.timestamp <= damageMessage.timestamp
        && usageLinked
        && Array.isArray(flags?.targets) && flags.targets.length === 1 && flags.targets[0]?.uuid === targetId;
    });
    if (candidates.length !== 1) return undefined;
    const attack = candidates[0];
    const sourceActorUuid = String(damageFlags.item.uuid).split('.Item.')[0];
    if (!sourceActorUuid || sourceActorUuid === damageFlags.item.uuid) return undefined;
    return {
      attackId: attack.flags[MODULE_ID].attackId,
      attackMessageId: attack.id,
      sourceActorUuid,
      requesterId: damageAuthor,
    };
  }

  private observeActorDamageUpdate(actor: any, changed: any, userId: string): void {
    if (!this.isGM()) return;
    const proof = changed?.[`flags.${MODULE_ID}.damageProof`]
      ?? changed?.flags?.[MODULE_ID]?.damageProof;
    if (!proof || typeof proof.attackId !== 'string') {
      const pendingForTarget = [...this.#pending.values()].some(state =>
        !isTerminal(state.ledger) && actorUuid(state.targetActor) === actorUuid(actor));
      if (pendingForTarget && (changed?.['system.attributes.hp.value'] !== undefined
        || changed?.system?.attributes?.hp?.value !== undefined)) {
        this.traceDamageProof('update-actor-without-proof', actor);
      }
      return;
    }
    this.traceDamageProof('update-actor-proof-seen', actor, proof);
    void this.transition(proof.attackId, () => this.acceptDamageProofAsGM(actor, changed, userId, proof))
      .catch(error => this.report(error));
  }

  private async acceptDamageProofAsGM(actor: any, changed: any, userId: string, proof: DamageProof): Promise<void> {
    if (!this.isGM() || typeof userId !== 'string') return;
    // A consecutive update can omit unchanged fields at any proof-schema level.
    // Recovery requires matching attack/nonce and every supplied leaf; observing
    // a stored flag without a fresh update must never trigger settlement.
    const completeProof = recoverDamageProofUpdate(proof, actor?.getFlag?.(MODULE_ID, 'damageProof'));
    if (!completeProof) {
      this.traceDamageProof('partial-proof-mismatch', actor, proof);
      return;
    }
    const state = await this.resolveState({ attackId: completeProof.attackId, sourceActorUuid: completeProof.actorUuid } as PreparedWeaponUse);
    if (!state) { this.traceDamageProof('state-unavailable', actor, completeProof); return; }
    if (isTerminal(state.ledger) || !state.started || !state.attackObserved
      || state.ledger.damageProofNonce === completeProof.nonce
      || actorUuid(state.targetActor) !== actorUuid(actor)
      || state.ledger.attackMessageId !== completeProof.attackMessageId) {
      this.traceDamageProof('state-gate', actor, completeProof, state);
      return;
    }
    const user = this.globals?.game?.users?.get?.(userId)
      ?? (this.globals?.game?.user?.id === userId ? this.globals.game.user : undefined);
    if (!user || (user.isGM !== true && !isOwnedBy(user, actor))) {
      this.traceDamageProof('requester-gate', actor, proof, state);
      return;
    }
    const attackMessage = await this.resolveMessage(completeProof.attackMessageId);
    const damageMessage = await this.resolveMessage(completeProof.damageMessageId);
    const damageFlags = dnd5eMessageData(damageMessage, this.globals.game?.system?.version === '6.0.5');
    const usageMessage = damageFlags?.originatingMessage && damageFlags.originatingMessage !== completeProof.attackMessageId
      ? await this.resolveMessage(damageFlags.originatingMessage) : undefined;
    const midiCard = this.isMidiSameCard(damageMessage)
      && this.midiCardMatchesState(damageMessage, actor, state);
    if (!midiCard && (damageFlags?.roll?.type !== 'damage'
      || damageFlags?.activity?.uuid !== state.prepared.activityUuid
      || damageFlags?.item?.uuid !== state.prepared.itemUuid
      || this.findDamageState(actor, damageMessage)?.prepared.attackId !== state.prepared.attackId)) {
      this.traceDamageProof('damage-message-gate', actor, completeProof, state);
      return;
    }
    const checked = validateDamageProof(completeProof, {
      updateActor: { actor, changed },
      messages: {
        attackMessage, damageMessage, usageMessage, attackId: state.prepared.attackId,
        actorUuid: state.prepared.sourceActorUuid,
        requesterId: state.ledger.requesterId,
        targetActorUuid: actorUuid(state.targetActor),
        originatingAttackMessageId: state.ledger.attackMessageId,
        ...(midiCard ? { midiSameCard: {
          version: this.globals.game.modules.get('midi-qol')?.version, activityUuid: state.prepared.activityUuid,
          itemUuid: state.prepared.itemUuid, targetTokenUuid: state.prepared.targetTokenUuid,
          linkedAttackCount: this.midiLinkedAttackMessages(damageMessage).length,
        } } : {}),
      },
    });
    if (!checked.ok) {
      this.traceDamageProof(`validation-${checked.reason}`, actor, completeProof, state);
      return;
    }
    this.traceDamageProof('validated', actor, completeProof, state);
    state.damageObserved = true;
    state.ledger.steps.damage = 'damage';
    state.ledger.damageDealt = Math.max(Number(state.ledger.damageDealt ?? 0), checked.actualDamage);
    state.ledger.damageProofNonce = checked.proof.nonce;
    state.prepared.damageDealt = state.ledger.damageDealt;
    await this.persistState(state);
    const result = await this.commitAsGM(state.prepared, { messageId: state.ledger.attackMessageId }, this.globals.game.user);
    this.traceDamageProof(`commit-${result.status}`, actor, completeProof, state);
  }

  private findDamageState(actor: any, message: any): RuntimeState | undefined {
    const messageId = message?.id ?? message?._id;
    if (typeof messageId !== 'string') return undefined;
    const registered = this.globals?.game?.messages?.get?.(messageId);
    if (registered && registered !== message) message = registered;
    const origin = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.originatingMessage;
    const mapped = this.#messageAttack.get(messageId) ?? (typeof origin === 'string' ? this.#messageAttack.get(origin) : undefined);
    const candidates = [...this.#pending.values()].filter(state => {
      if (!state.started || !state.attackObserved || isTerminal(state.ledger)
        || actorUuid(state.targetActor) !== actorUuid(actor)) return false;
      if (this.isMidiSameCard(message)) return this.midiCardMatchesState(message, actor, state);
      if (mapped) return state.prepared.attackId === mapped
        && (messageId === state.ledger.attackMessageId || this.damageMessageMatchesState(message, state));
      const flags = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5');
      const author = message?.author?.id ?? message?.user?.id ?? message?.user;
      return flags?.roll?.type === 'damage' && flags?.activity?.uuid === state.prepared.activityUuid
        && flags?.item?.uuid === state.prepared.itemUuid && author === state.ledger.requesterId
        && Number.isFinite(message.timestamp) && message.timestamp >= state.prepared.createdAt;
    });
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private isMidiSameCard(message: any): boolean {
    return this.globals?.game?.modules?.get?.('midi-qol')?.active === true
      && isReviewedMidiVersion(this.globals.game.modules.get('midi-qol')?.version)
      && [0, 4].includes(message?.flags?.['midi-qol']?.type);
  }

  private midiCardMatchesTarget(message: any, actor: any, targetTokenUuid?: string): boolean {
    const hits = message?.flags?.['midi-qol']?.hitTargetUuids;
    if (!Array.isArray(hits) || hits.length !== 1 || typeof hits[0] !== 'string') return false;
    if (targetTokenUuid && hits[0] !== targetTokenUuid) return false;
    try {
      const token = this.globals?.fromUuidSync?.(hits[0])
        ?? this.globals?.foundry?.utils?.fromUuidSync?.(hits[0]);
      return actorUuid(token?.actor) === actorUuid(actor);
    } catch {
      return false;
    }
  }

  private midiCardHasDamageRoll(message: any): boolean {
    if (message?.flags?.['midi-qol']?.type === 0) return this.globals.game.modules.get('midi-qol')?.version === '14.0.11' && midiItemCardDamageMatches(message);
    const types = Array.isArray(message?.rolls)
      ? message.rolls.map((roll: any) => roll?.options?.['midi-qol']?.rollType) : [];
    return types.filter((type: string) => type === 'attack').length === 1
      && types.some((type: string) => ['defaultDamage', 'otherDamage', 'bonusDamage'].includes(type));
  }

  private midiLinkedAttackMessages(card: any): any[] {
    if (typeof card?.id !== 'string') return [];
    const byId = new Map<string, any>();
    for (const message of collection(this.globals?.game?.messages)) {
      if (typeof message?.id === 'string' && message.id !== card.id
        && message?.flags?.[MODULE_ID]?.midiCardId === card.id
        && dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.roll?.type === 'attack') byId.set(message.id, message);
    }
    return [...byId.values()];
  }

  private midiCardMatchesState(message: any, actor: any, state: RuntimeState): boolean {
    const dnd = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5');
    const midi = message?.flags?.['midi-qol'];
    const author = message?.author?.id ?? message?.user?.id ?? message?.user;
    const linked = this.midiLinkedAttackMessages(message);
    return this.isMidiSameCard(message)
      && (message?.id === state.ledger.attackMessageId
        ? linked.length === 0 && message?.flags?.[MODULE_ID]?.attackId === state.prepared.attackId
        : linked.length === 1
          && linked[0]?.id === state.ledger.attackMessageId
          && linked[0]?.flags?.[MODULE_ID]?.attackId === state.prepared.attackId)
      && dnd?.activity?.uuid === state.prepared.activityUuid
      && dnd?.item?.uuid === state.prepared.itemUuid
      && midi?.sourceActorUuid === state.prepared.sourceActorUuid
      && author === state.ledger.requesterId
      && typeof state.prepared.targetTokenUuid === 'string'
      && this.midiCardMatchesTarget(message, actor, state.prepared.targetTokenUuid)
      && this.midiCardHasDamageRoll(message);
  }

  private observeChatMessage(message: any): void {
    const id = message?.flags?.[MODULE_ID]?.attackId;
    const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
    if (state && this.bindAttackMessage(state, message) && this.isGM()) void this.persistState(state).catch(error => this.report(error));
    else if (state && dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.activity?.uuid === state.prepared.activityUuid && dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.item?.uuid === state.prepared.itemUuid && (message?.author?.id ?? message?.user?.id ?? message?.user) === state.ledger.requesterId && message?.timestamp >= state.prepared.createdAt && message?.id) this.#messageAttack.set(message.id, state.prepared.attackId);
    const origin = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5')?.originatingMessage;
    const originAttackId = typeof origin === 'string' ? this.#messageAttack.get(origin) : undefined;
    const originState = originAttackId ? this.#pending.get(originAttackId) : undefined;
    if (originState && message?.id && this.damageMessageMatchesState(message, originState)) {
      this.#messageAttack.set(message.id, originState.prepared.attackId);
    }
  }

  private damageMessageMatchesState(message: any, state: RuntimeState): boolean {
    const flags = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5');
    const author = message?.author?.id ?? message?.user?.id ?? message?.user;
    return flags?.roll?.type === 'damage' && flags?.activity?.uuid === state.prepared.activityUuid
      && flags?.item?.uuid === state.prepared.itemUuid && author === state.ledger.requesterId
      && Number.isFinite(message.timestamp) && message.timestamp >= state.prepared.createdAt;
  }


  private observeMidiCompletion(name: string, workflow: any): void {
    const id = workflow?.[PRIVATE_USE_KEY] ?? workflow?.workflowOptions?.[PRIVATE_USE_KEY] ?? workflow?.options?.[PRIVATE_USE_KEY];
    const state = typeof id === 'string' ? this.#pending.get(id) : undefined;
    if (!state) return;
    const roll = workflow?.attackRoll ?? workflow?.attackRolls?.[0];
    const messageId = roll?.parent?.id ?? workflow?.attackRollMessageId;
    if (name.endsWith('AttackRollComplete') && typeof messageId === 'string') {
      void this.commitUse(state.prepared, { messageId }).catch(error => this.report(error));
    }
    if ((name.endsWith('RollComplete') || name.endsWith('preAbort') || name.endsWith('postCleanup'))
      && this.#activeRolls.get(String(state.prepared.activityUuid)) === state.prepared.attackId) {
      this.#activeRolls.delete(String(state.prepared.activityUuid));
    }
  }

  private async abortMidiWorkflow(state: RuntimeState): Promise<void> {
    const workflow = state.midiWorkflow;
    if (!workflow || workflow.aborted === true) return;
    workflow.aborted = true;
    if (typeof workflow.performState === 'function' && workflow.WorkflowState_Abort !== undefined) {
      await workflow.performState(workflow.WorkflowState_Abort);
    }
  }


  private onExternalEvent(_event: any): void {
    // External notifications are not authoritative evidence for a settlement.
  }


  private async commitAsGM(reference: PreparedWeaponUse, outcome: AnyRecord, requester: any): Promise<WeaponUseResult> {
    if (!this.isGM()) return { attackId: reference.attackId, status: 'blocked', settlements: [], reason: 'not-active-gm' };
    const state = await this.resolveState(reference);
    if (!state) return { attackId: reference.attackId, status: 'failed', settlements: [], reason: 'unknown-attack' };
    if (!this.authorizedRequester(requester, state.sourceActor, state.item)) return { attackId: reference.attackId, status: 'blocked', settlements: [], reason: 'unauthorized' };
    if (isTerminal(state.ledger)) return { attackId: reference.attackId, status: state.ledger.step === 'committed' ? 'committed' : 'cancelled', settlements: [] };
    if (!state.started) return { attackId: reference.attackId, status: 'failed', settlements: [], reason: 'attack-not-started' };
    const actual = await this.actualOutcome(state, outcome);
    if (actual.outcome === 'failed' || actual.outcome === 'cancelled') return { attackId: reference.attackId, status: 'failed', settlements: [], reason: 'missing-authoritative-outcome' };
    state.prepared.outcome = actual.outcome;
    state.prepared.critical = actual.critical;
    state.prepared.damageDealt = actual.damageDealt;
    state.ledger.outcome = actual.outcome;
    state.ledger.critical = actual.critical;
    state.ledger.step = 'attack';
    await this.persistState(state);
    // Consume old Sap/Vex before applying effects earned from the same attack.
    if (state.ledger.steps.consumption !== 'settled') {
      await this.commitReservations(state);
      state.ledger.steps.consumption = 'settled';
      await this.persistState(state);
    }
    const context = this.contextForState(state);
    const reports = [...this.core.settleConfigured(context)];
    let waitForDamage = false;
    const selected = reports.find(report => report.eligibility.kind === 'cleave');
    if (selected && actual.outcome === 'hit' && !state.prepared.parentAttackId && !state.ledger.steps[selected.eligibility.ruleId]) {
      const choice = await selectCleaveSecondary({
        sourceActor: state.sourceActor, sourceToken: sourceTokenFor(this.globals, state.sourceActor, state.activity),
        targetActor: state.targetActor, targetToken: state.targetToken, activity: state.activity, item: state.item, globals: this.globals,
        candidates: collection(this.globals?.canvas?.tokens?.placeables),
        distanceFeet: Number(selected.eligibility.rule?.params.distance ?? 5), reachFeet: Number(context.weapon.reachFeet),
      });
      if (choice.ok && choice.value) {
        state.cleaveTarget = choice.value.target;
        const secondary = this.contextForState(state, targetActor(choice.value.target), choice.value.token);
        secondary.target.distanceFromAttackerFeet = choice.value.distanceFromSourceFeet;
        secondary.target.distanceFromPrimaryFeet = choice.value.distanceFromPrimaryFeet;
        reports.push(this.core.settle(secondary, selected.eligibility.ruleId));
      } else if (choice.status === 'cancelled') state.ledger.steps[selected.eligibility.ruleId] = 'cancelled';
    }
    const settled: RuleSettlement[] = [];
    for (const report of reports) {
      const key = report.eligibility.ruleId;
      const kind = report.eligibility.kind;
      if (actual.outcome === 'hit' && ['slow', 'vex', 'criticalBleeding'].includes(String(kind)) && !state.damageObserved) waitForDamage = true;
      if (!report.eligibility.eligible || ['settled', 'cancelled'].includes(state.ledger.steps[key] ?? '')) continue;
      if (state.ledger.steps[key] === 'started' || state.ledger.steps[key] === 'failed') {
        return { attackId: reference.attackId, status: 'failed', settlements: settled, reason: 'settlement-requires-gm-reconciliation' };
      }
      for (const settlement of report.settlements) {
        // Persist the claim before a non-transactional Foundry document write.
        // An unknown result remains claimed, never automatically replayed.
        const claimed = await this.transition('quota:' + state.prepared.sourceActorUuid, async () => {
          if (kind === 'nick' || kind === 'cleave') {
            const used = this.readLedger(state.sourceActor).filter(entry => entry.attackId !== state.prepared.attackId
              && entry.turnKey === state.prepared.turnKey && entry.step !== 'cancelled'
              && entry.usedRuleIds.some(id => masteryKindForLedgerRule(entry, id) === kind)).length;
            const maxUses = kind === 'nick' ? 1 : Number(report.eligibility.rule?.params.maxUses ?? 1);
            if (used >= maxUses) return false;
            if (!state.ledger.usedRuleIds.includes(key)) state.ledger.usedRuleIds.push(key);
          }
          state.ledger.steps[key] = 'started';
          await this.persistState(state);
          return true;
        });
        if (!claimed) continue;
        try {
          const applied = await this.applySettlement(settlement, state, {});
          state.ledger.steps[key] = applied ? 'settled' : 'cancelled';
          if (!applied) state.ledger.usedRuleIds = state.ledger.usedRuleIds.filter(id => id !== key);
          else settled.push(settlement);
          await this.persistState(state);
        } catch (error) {
          state.ledger.steps[key] = 'failed';
          state.ledger.step = 'failed';
          await this.persistState(state);
          return { attackId: reference.attackId, status: 'failed', settlements: settled, reason: errorMessage(error) };
        }
      }
    }
    state.ledger.step = waitForDamage ? 'attack' : 'committed';
    if (!waitForDamage) state.ledger.steps.committed = 'committed';
    await this.persistState(state);
    return { attackId: reference.attackId, status: waitForDamage ? 'pending' : 'committed', outcome: actual.outcome, settlements: settled };
  }

  private async cancelAsGM(prepared: PreparedWeaponUse, requester: any): Promise<WeaponUseResult> {
    const state = await this.resolveState(prepared);
    if (!state) return { attackId: prepared.attackId, status: 'cancelled', settlements: [] };
    if (!this.authorizedRequester(requester, state.sourceActor, state.item)) return { attackId: prepared.attackId, status: 'blocked', settlements: [], reason: 'unauthorized' };
    if (state.ledger.step === 'committed') return { attackId: prepared.attackId, status: 'committed', settlements: [] };
    if (state.ledger.step === 'cancelled') return { attackId: prepared.attackId, status: 'cancelled', settlements: [] };
    if (state.started) return { attackId: prepared.attackId, status: 'pending', settlements: [], reason: 'started-attack-requires-gm-reconciliation' };
    for (const reservation of state.prepared.reservations) {
      if (reservation.ticket.state !== 'reserved') continue;
      const actor = await fromUuid(this.globals, reservation.actorUuid) ?? (reservation.actorUuid === actorUuid(state.sourceActor) ? state.sourceActor : undefined);
      const api = customConditionsApi(this.globals);
      if (actor && api?.cancel) {
        try { await api.cancel(actor, reservation.ticket); } catch { /* stale cancellation is already terminal */ }
      }
    }
    state.ledger.step = 'cancelled';
    state.ledger.steps.cancelled = 'cancelled';
    await this.persistState(state);
    return { attackId: prepared.attackId, status: 'cancelled', settlements: [] };
  }

  private async startAsGM(prepared: PreparedWeaponUse): Promise<PreparedWeaponUse> {
    const state = await this.resolveState(prepared);
    if (!state) throw new Error('Unknown weapon attack.');
    if (isTerminal(state.ledger)) throw new Error('Attack is already terminal.');
    if (state.started) return state.prepared;
    const api = customConditionsApi(this.globals);
    for (const reservation of state.prepared.reservations) {
      if (reservation.ticket.state !== 'reserved') continue;
      const actor = await fromUuid(this.globals, reservation.actorUuid) ?? (reservation.actorUuid === actorUuid(state.sourceActor) ? state.sourceActor : undefined);
      if (!actor || typeof api?.start !== 'function') throw new Error('Weapon effect reservation actor is unavailable.');
      reservation.ticket = await api.start(actor, reservation.ticket);
    }
    state.started = true;
    state.ledger.step = 'started';
    state.ledger.steps.started = 'started';
    await this.persistState(state);
    return state.prepared;
  }

  private async commitReservations(state: RuntimeState): Promise<void> {
    const api = customConditionsApi(this.globals);
    for (const reservation of state.prepared.reservations) {
      const actor = await fromUuid(this.globals, reservation.actorUuid) ?? (reservation.actorUuid === actorUuid(state.sourceActor) ? state.sourceActor : undefined);
      if (!actor || typeof api?.commit !== 'function') continue;
      try { await api.commit(actor, reservation.ticket); } catch (error) {
        if (!String(errorMessage(error)).toLowerCase().includes('stale')) throw error;
      }
    }
  }

  private async applySettlement(settlement: RuleSettlement, state: RuntimeState, outcome: AnyRecord): Promise<boolean> {
    const source = state.sourceActor;
    const target = state.targetActor;
    if (!target && settlement.type !== 'critical-damage' && settlement.type !== 'extra-attack') return false;
    switch (settlement.type) {
      case 'damage':
        if (!target || typeof target.applyDamage !== 'function') return false;
        await target.applyDamage([{ value: Math.max(0, settlement.amount), type: settlement.damageType }], {
          isDelta: true,
          originatingMessage: await this.resolveMessage(state.prepared.messageId),
          [MODULE_ID]: { attackId: state.prepared.attackId, ruleId: settlement.source.ruleId },
        });
        return true;
      case 'condition':
        return this.applyConditionSettlement(settlement, state);
      case 'saving-throw':
        return this.applyToppleSettlement(settlement, state);
      case 'movement':
        return this.applyPushSettlement(settlement, state);
      case 'child-attack':
        return this.applyCleaveSettlement(settlement, state);
      case 'extra-attack':
        return this.applyNickSettlement(settlement, state);
      case 'critical-damage':
        return true; // critical dice are transformed synchronously before evaluation
      default:
        return false;
    }
  }

  private async applyConditionSettlement(settlement: ConditionSettlement, state: RuntimeState): Promise<boolean> {
    const api = customConditionsApi(this.globals);
    if (!api?.apply) return false;
    const source = state.sourceActor;
    const target = state.targetActor;
    if (!target || !source) return false;
    const sourceRef = {
      actorUuid: actorUuid(source)!,
      ...(state.prepared.itemUuid ? { itemUuid: state.prepared.itemUuid } : {}),
      ...(state.prepared.activityUuid ? { activityUuid: state.prepared.activityUuid } : {}),
    };
    const targetRef = { actorUuid: actorUuid(target)!, ...(state.prepared.targetTokenUuid ? { tokenUuid: state.prepared.targetTokenUuid } : {}) };
    if (settlement.effectKind === 'attack-disadvantage' || settlement.effectKind === 'speed-reduction') {
      const effectKind = settlement.effectKind === 'attack-disadvantage' ? 'sap' : 'slow';
      const created = await api.apply(target, {
        effectKind,
        ruleId: settlement.conditionId,
        stackingGroup: settlement.stackingGroup,
        params: settlement.effectKind === 'speed-reduction' ? { speedReduction: settlement.speedReductionFeet ?? 10 } : {},
        source: sourceRef,
        target: targetRef,
        expires: settlement.duration.kind === 'until-attacker-next-turn-start'
          ? { reference: 'source', phase: 'start', turns: 1 }
          : undefined,
      });
      this.requireAppliedWeaponEffect(api, target, created, effectKind, settlement, sourceRef.actorUuid, targetRef.actorUuid);
      return true;
    }
    if (settlement.effectKind === 'attack-advantage') {
      // Vex belongs to the attacker and points at the target.  Any old Vex
      // ticket was committed above before this new instance is created.
      const created = await api.apply(source, {
        effectKind: 'vex',
        ruleId: settlement.conditionId,
        stackingGroup: settlement.stackingGroup,
        source: sourceRef,
        target: targetRef,
        expires: { reference: 'source', phase: 'end', turns: 1 },
      });
      this.requireAppliedWeaponEffect(api, source, created, 'vex', settlement, sourceRef.actorUuid, targetRef.actorUuid);
      return true;
    }
    if (settlement.effectKind === 'persistent-damage' && settlement.formula) {
      const result = await applyCriticalBleedingAction({
        sourceActor: source,
        sourceToken: sourceTokenFor(this.globals, source, state.activity),
        targetActor: target,
        targetToken: state.targetToken,
        activity: state.activity,
        item: state.item,
        globals: this.globals,
        rule: {
          formula: settlement.formula,
          mode: settlement.damageMode ?? 'hpLoss',
          ...(settlement.damageType ? { damageType: settlement.damageType } : {}),
          endOnHealing: settlement.duration.kind === 'condition-managed' && settlement.duration.endOnHealing,
        },
      });
      return result.ok;
    }
    return false;
  }

  private requireAppliedWeaponEffect(
    api: any,
    owner: any,
    created: any,
    effectKind: 'sap' | 'slow' | 'vex',
    settlement: ConditionSettlement,
    sourceActorUuid: string,
    targetActorUuid: string,
  ): void {
    const id = created?.id ?? created?._id;
    const entry = id && api.list?.(owner)?.find((candidate: any) => candidate.id === id);
    const instance = entry?.instance;
    if (!entry || entry.disabled || instance?.enabled !== true
      || instance.effectKind !== effectKind || instance.ruleId !== settlement.conditionId
      || instance.stackingGroup !== settlement.stackingGroup
      || instance.source?.actorUuid !== sourceActorUuid
      || instance.target?.actorUuid !== targetActorUuid
      || (effectKind === 'slow' && instance.params?.speedReduction !== (settlement.speedReductionFeet ?? 10))) {
      // The dependency may have performed a partial write. Preserve the claim
      // for GM reconciliation instead of treating the rule as settled or retrying.
      throw new Error(`Weapon effect ${effectKind} was not confirmed active after apply.`);
    }
  }

  private async applyToppleSettlement(settlement: Extract<RuleSettlement, { type: 'saving-throw' }>, state: RuntimeState): Promise<boolean> {
    const target = state.targetActor;
    if (!target) return false;
    const result = await resolveToppleAction({
      sourceActor: state.sourceActor,
      sourceToken: sourceTokenFor(this.globals, state.sourceActor, state.activity),
      targetActor: target,
      targetToken: state.targetToken,
      activity: state.activity,
      item: state.item,
      globals: this.globals,
      dc: settlement.dc,
    });
    return result.ok;
  }

  private async applyPushSettlement(settlement: Extract<RuleSettlement, { type: 'movement' }>, state: RuntimeState): Promise<boolean> {
    const result = await applyPushAction({
      sourceActor: state.sourceActor,
      sourceToken: sourceTokenFor(this.globals, state.sourceActor, state.activity),
      targetActor: state.targetActor,
      targetToken: state.targetToken,
      activity: state.activity,
      item: state.item,
      globals: this.globals,
      rule: { distanceFeet: settlement.distanceFeet, maxDistanceFeet: settlement.maxDistanceFeet },
      updateOptions: { [MODULE_ID]: { managed: true, attackId: state.prepared.attackId } },
    });
    return result.ok;
  }

  private async applyCleaveSettlement(settlement: Extract<RuleSettlement, { type: 'child-attack' }>, state: RuntimeState): Promise<boolean> {
    if (state.prepared.parentAttackId || (state.prepared.childDepth ?? 0) > 0) return false;
    const activity = state.activity;
    if (!activity || typeof activity.rollAttack !== 'function') return false;
    const selected = await selectCleaveSecondary({
      sourceActor: state.sourceActor,
      sourceToken: sourceTokenFor(this.globals, state.sourceActor, state.activity),
      targetActor: state.targetActor,
      targetToken: state.targetToken,
      activity,
      item: state.item,
      globals: this.globals,
      candidates: state.cleaveTarget ? [state.cleaveTarget] : undefined,
      selected: state.cleaveTarget,
      distanceFeet: settlement.distanceFromPrimaryFeet,
      reachFeet: settlement.maxDistanceFromAttackerFeet,
    });
    if (!selected.ok || !selected.value) return false;
    const target = selected.value.actor;
    const token = selected.value.token;
    const targetAc = Number(target?.system?.attributes?.ac?.value ?? target?.system?.attributes?.ac);
    if (!Number.isFinite(targetAc)) return false;
    const child: WeaponUseRequest = {
      item: state.item,
      activity,
      actor: state.sourceActor,
      targetActor: target,
      targetToken: token,
      attackId: settlement.childAttackId,
      parentAttackId: state.prepared.attackId,
      childDepth: 1,
      attackMode: state.prepared.attackMode,
    };
    const prepared = await this.prepareUse(activity, child);
    if (!prepared) return false;
    const midi = moduleRecord(this.globals, 'midi-qol');
    if (midi?.active === true) {
      const observer = new AbortController();
      this.#midiChildObservers.add(observer);
      let workflow: any;
      try {
        workflow = await useMidiActivityUntilTerminal({ activity, globals: this.globals,
          sequenceId: prepared.attackId, signal: observer.signal,
          usage: { midiOptions: {
            targetsToUse: new Set([token?.object ?? token]), ignoreUserTargets: true,
            workflowOptions: {
              targetConfirmation: 'none', autoRollAttack: true, autoRollDamage: 'onHit',
              fastForwardAttack: true, fastForwardDamage: true,
              [PRIVATE_USE_KEY]: prepared.attackId,
              parentAttackId: state.prepared.attackId, childDepth: 1,
            },
          } },
          message: { data: { flags: { [MODULE_ID]: {
            attackId: prepared.attackId, parentAttackId: state.prepared.attackId,
          } } } },
        });
      } finally {
        this.#midiChildObservers.delete(observer);
      }
      const childState = await this.resolveState(prepared);
      if (childState?.ledger.steps.attack !== 'attack') {
        if (!childState?.started) { await this.cancelUse(prepared); return false; }
        throw new Error(workflow?.aborted ? 'Cleave child workflow aborted after start; GM reconciliation required.' : 'Cleave child attack has no verified roll.');
      }
      return true;
    }
    const attackMessage = {
      data: { flags: {
        dnd5e: { targets: [{ name: target.name, img: target.img, uuid: actorUuid(target), ac: targetAc }] },
        [MODULE_ID]: { attackId: prepared.attackId, parentAttackId: state.prepared.attackId },
      } },
    };
    const childResult = await this.rollPrepared(activity, prepared, {
      ...child, usage: { target: targetAc },
    }, {}, attackMessage);
    if (childResult.status === 'cancelled') return false;
    if (childResult.status === 'failed' || childResult.status === 'blocked'
      || (childResult.status === 'pending' && childResult.outcome !== 'hit')) {
      throw new Error(`Cleave child attack needs GM reconciliation: ${childResult.reason ?? childResult.status}`);
    }
    if (childResult.outcome !== 'hit') return true;
    if (typeof activity.rollDamage !== 'function' || typeof target.applyDamage !== 'function') {
      throw new Error('Cleave child damage API is unavailable.');
    }
    const childState = await this.resolveState(prepared);
    if (!childState) throw new Error('Cleave child ledger is unavailable.');
    if (typeof childState.ledger.attackMessageId !== 'string') throw new Error('Cleave child attack message is unavailable.');
    const childOrigin = originatingMessageData(childState.ledger.attackMessageId, this.globals.game?.system?.version === '6.0.5');
    const damageRolls = await activity.rollDamage({
      attackMode: state.prepared.attackMode,
      isCritical: childResult.results?.rolls?.[0]?.isCritical === true,
      [PRIVATE_USE_KEY]: prepared.attackId,
    }, { configure: false }, { data: { ...childOrigin, flags: {
      ...childOrigin.flags,
      [MODULE_ID]: { attackId: prepared.attackId },
    } } });
    if (!childState.cleaveDamageAdjusted || !Array.isArray(damageRolls) || !damageRolls.length) {
      throw new Error('Cleave child damage was not rolled with the verified ability adjustment.');
    }
    const calculated = calculateCleaveChildDamage(damageRolls);
    if (!calculated.ok) throw new Error(`Cleave child damage roll is incomplete: ${calculated.reason}`);
    const damages = calculated.components.map(component => ({ value: component.value, ...(component.type ? { type: component.type } : {}) }));
    const damageMessage = damageRolls[0]?.parent ?? await this.resolveMessage(childState.ledger.attackMessageId);
    if (damageMessage?.id) this.#messageAttack.set(damageMessage.id, prepared.attackId);
    await target.applyDamage(damages, { originatingMessage: damageMessage, [MODULE_ID]: { attackId: prepared.attackId, cleaveChild: true } });
    return true;
  }


  private async applyNickSettlement(_settlement: Extract<RuleSettlement, { type: 'extra-attack' }>, state: RuntimeState): Promise<boolean> {
    // This is the existing Light extra attack. No additional roll is created.
    return state.ledger.lightExtraAttack === true && isOffhandAttack(state.prepared) && Boolean(state.prepared.turnKey);
  }

  private normalizeRequest(subject: any, request: WeaponUseRequest): RuntimeRequest | undefined {
    const activity = request.activity ?? (isActivity(subject) ? subject : undefined);
    const item = request.item ?? activity?.item ?? (subject?.type === 'weapon' ? subject : undefined);
    const actor = request.actor ?? activity?.actor ?? item?.actor;
    const itemId = itemUuid(item) ?? request.itemUuid;
    const actorId = actorUuid(actor) ?? request.actorUuid;
    if (!itemId || !actorId) return undefined;
    const selected = request.target ?? request.targetToken ?? request.targetActor;
    const targets = request.targets ?? collection(this.globals?.game?.user?.targets);
    if (!selected && !request.targetActorUuid && targets.length > 1) {
      notification(this.globals, 'warn', '请选择一个主要攻击目标；Cleave 的第二目标在命中后另行选择。');
      return undefined;
    }
    const target = selected ?? targets[0];
    const actorTarget = request.targetActor ?? targetActor(target);
    const tokenTarget = request.targetToken ?? targetToken(target);
    return {
      ...request, itemUuid: itemId, actorUuid: actorId,
      activityUuid: activityUuid(activity) ?? request.activityUuid,
      targetActorUuid: actorUuid(actorTarget) ?? request.targetActorUuid,
      targetTokenUuid: documentUuid(tokenTarget) ?? request.targetTokenUuid,
      target, targetActor: actorTarget, targetToken: tokenTarget,
      item, actor, activity,
    };
  }

  private rememberRemotePrepared(prepared: PreparedWeaponUse, request: RuntimeRequest): void {
    const sourceActor = request.actor;
    if (!sourceActor || this.#pending.has(prepared.attackId)) return;
    const target = request.targetActor ?? targetActor(request.target);
    const token = request.targetToken ?? targetToken(request.target);
    const now = Date.now();
    const ledger: WeaponLedgerEntry = {
      schemaVersion: 1,
      attackId: prepared.attackId,
      sourceActorUuid: prepared.sourceActorUuid,
      ...(prepared.itemUuid ? { itemUuid: prepared.itemUuid } : {}),
      ...(prepared.activityUuid ? { activityUuid: prepared.activityUuid } : {}),
      ...(prepared.targetActorUuid ? { targetActorUuid: prepared.targetActorUuid } : {}),
      ...(prepared.targetTokenUuid ? { targetTokenUuid: prepared.targetTokenUuid } : {}),
      ...(prepared.turnKey ? { turnKey: prepared.turnKey } : {}),
      step: 'prepared',
      steps: { prepared: 'prepared' },
      reservations: prepared.reservations ?? [],
      usedRuleIds: [],
      createdAt: now,
      updatedAt: now,
      requesterId: this.globals?.game?.user?.id,
      before: snapshotHp(target),
    };
    this.#pending.set(prepared.attackId, {
      prepared,
      sourceActor,
      item: request.item,
      activity: request.activity,
      targetActor: target,
      targetToken: token,
      ledger,
      started: false,
      attackObserved: false,
      damageObserved: false,
    });
  }


  private async prepareAsGM(request: RuntimeRequest, requester: any): Promise<PreparedWeaponUse | undefined> {
    if (!this.isGM()) throw new Error('Only the active GM may prepare an attack.');
    if (!this.dependencies().ready) throw new Error('Weapon mastery dependencies or exact runtime are unavailable.');
    const item = await fromUuid(this.globals, request.itemUuid) ?? request.item;
    const actor = item?.actor ?? await fromUuid(this.globals, request.actorUuid) ?? request.actor;
    const activity = await fromUuid(this.globals, request.activityUuid) ?? request.activity;
    if (!item || !actor || !activity || !isAttackActivity(activity)
      || itemUuid(item) !== request.itemUuid || actorUuid(actor) !== request.actorUuid
      || (item.actor && actorUuid(item.actor) !== actorUuid(actor))
      || itemUuid(activity.item) !== itemUuid(item) || actorUuid(activity.actor) !== actorUuid(actor)) throw new Error('Attack source identity mismatch.');
    if (!this.authorizedRequester(requester, actor, item)) throw new Error('The requester does not own this attack.');
    const tokenDocument = request.targetTokenUuid ? await fromUuid(this.globals, request.targetTokenUuid) ?? request.targetToken : request.targetToken;
    const tokenActor = targetActor(tokenDocument);
    const target = tokenActor ?? (request.targetActorUuid ? await fromUuid(this.globals, request.targetActorUuid) : undefined) ?? request.targetActor;
    if (request.targetActorUuid && actorUuid(target) !== request.targetActorUuid) throw new Error('Target actor identity mismatch.');
    if (request.targetTokenUuid && documentUuid(tokenDocument) !== request.targetTokenUuid) throw new Error('Target token identity mismatch.');
    const actorId = actorUuid(actor)!;
    const turn = activeTurn(this.globals);
    const id = request.attackId ?? randomId(this.globals, 'attack') + '-' + (++this.#sequence);
    if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,180}$/.test(id)) throw new Error('Invalid attack identity.');
    if (this.#pending.has(id) || this.readLedger(actor).some(entry => entry.attackId === id)) throw new Error('Attack identity has already been used.');
    const configuration = readWeaponConfiguration(item);
    const selected = configuration?.mastery === 'native'
      ? request.selectedMasteryRuleId ?? readSelectedMastery(item, activity)
      : configuration?.mastery ?? null;
    const unlocked = nativeMasteryUnlocked(actor, item, masteryQualificationKind(configuration, selected));
    // Selection is a choice, not a grant. Every selected native alternative must be legal on the GM copy.
    const offhand = isOffhandAttack(request);
    let lightExtra = false;
    if (offhand && turn.key && isLightWeapon(item)) {
      const history = this.readLedger(actor).filter(entry => entry.turnKey === turn.key);
      lightExtra = history.some(entry => entry.lightAttack && entry.itemUuid !== itemUuid(item) && entry.steps.attack === 'attack')
        && !history.some(entry => entry.lightExtraAttack && entry.step !== 'cancelled' && entry.step !== 'failed');
    }
    const reservations = await this.reserveMatchingEffects(actor, target, id, actorUuid(target), documentUuid(tokenDocument));
    const now = Date.now();
    const prepared: PreparedWeaponUse = {
      schemaVersion: 1, attackId: id, sourceActorUuid: actorId, actorUuid: actorId,
      itemUuid: itemUuid(item), activityUuid: activityUuid(activity),
      targetActorUuid: actorUuid(target), targetTokenUuid: documentUuid(tokenDocument),
      turnKey: turn.key, selectedMasteryRuleId: selected, nativeMasteryUnlocked: unlocked,
      action: lightExtra ? 'attack' : actionForActivity(activity), attackMode: request.attackMode,
      lightExtraAttack: lightExtra, reservations, modifiers: this.modifiersFromReservations(reservations), createdAt: now,
      ...(request.parentAttackId && requester?.isGM ? { parentAttackId: request.parentAttackId, childDepth: 1 } : {}),
    };
    const ledger: WeaponLedgerEntry = {
      schemaVersion: 1, attackId: id, sourceActorUuid: actorId, itemUuid: itemUuid(item), activityUuid: activityUuid(activity),
      targetActorUuid: actorUuid(target), targetTokenUuid: documentUuid(tokenDocument),
      parentAttackId: prepared.parentAttackId, turnKey: turn.key,
      step: 'prepared', steps: { prepared: 'prepared' }, reservations, usedRuleIds: [],
      createdAt: now, updatedAt: now, requesterId: requester.id,
      lightAttack: isLightWeapon(item) && !offhand && prepared.action === 'attack',
      lightExtraAttack: lightExtra, attackMode: request.attackMode,
      selectedMasteryRuleId: selected, nativeMasteryUnlocked: unlocked, configuration: clone(configuration),
    };
    const state: RuntimeState = { prepared, sourceActor: actor, item, activity, targetActor: target, targetToken: tokenDocument?.object ?? tokenDocument, ledger, started: false, attackObserved: false, damageObserved: false };
    this.#pending.set(id, state);
    await this.persistState(state);
    return prepared;
  }

  private async finalizeSelection(prepared: PreparedWeaponUse, selection: AnyRecord): Promise<void> {
    const values = serializeRequest(selection);
    if (this.isGM()) {
      const updated = await this.transition('prepare:' + prepared.sourceActorUuid, () => this.finalizeSelectionAsGM(prepared, values, this.globals.game.user));
      Object.assign(prepared, updated);
      return;
    }
    const gm = activeGM(this.globals);
    if (!gm?.query) throw new Error('No active GM for attack selection.');
    const updated = await gm.query(WEAPON_QUERY_PREPARE + '.selection', { prepared: serializePrepared(prepared), selection: values }, { timeout: 5000 });
    Object.assign(prepared, updated);
    const local = this.#pending.get(prepared.attackId);
    if (local) local.prepared = prepared;
  }

  private async finalizeSelectionAsGM(reference: PreparedWeaponUse, selection: WeaponUseRequest, requester: any): Promise<PreparedWeaponUse> {
    const state = await this.resolveState(reference);
    if (!state || state.started || isTerminal(state.ledger) || !this.authorizedRequester(requester, state.sourceActor, state.item)) throw new Error('Attack selection is no longer editable.');
    const config = state.ledger.configuration;
    const selected = config?.mastery === 'native' ? selection.selectedMasteryRuleId ?? state.prepared.selectedMasteryRuleId : config?.mastery;
    const unlocked = nativeMasteryUnlocked(state.sourceActor, state.item, masteryQualificationKind(config, selected));
    state.prepared.selectedMasteryRuleId = selected;
    state.ledger.selectedMasteryRuleId = selected;
    state.prepared.nativeMasteryUnlocked = unlocked;
    state.ledger.nativeMasteryUnlocked = unlocked;
    const mode = selection.attackMode ?? state.prepared.attackMode;
    const nick = masteryQualificationKind(config, selected)?.replace(/^dnd2024\./, '') === 'nick';
    const offhand = isOffhandAttack({ attackMode: mode });
    let lightExtra = false;
    if (offhand && state.prepared.turnKey && isLightWeapon(state.item)) {
      const history = this.readLedger(state.sourceActor).filter(entry => entry.attackId !== state.prepared.attackId && entry.turnKey === state.prepared.turnKey);
      lightExtra = history.some(entry => entry.lightAttack && entry.itemUuid !== state.prepared.itemUuid && entry.steps.attack === 'attack')
        && !history.some(entry => entry.lightExtraAttack && entry.step !== 'cancelled' && entry.step !== 'failed');
    }
    state.prepared.attackMode = mode;
    state.ledger.attackMode = mode;
    state.prepared.lightExtraAttack = lightExtra;
    state.ledger.lightExtraAttack = lightExtra;
    state.ledger.lightAttack = isLightWeapon(state.item) && !isOffhandAttack({ attackMode: mode }) && actionForActivity(state.activity) === 'attack';
    state.prepared.action = nick && lightExtra ? 'attack' : actionForActivity(state.activity);
    await this.persistState(state);
    return serializePrepared(state.prepared);
  }

  private async reserveMatchingEffects(sourceActor: any, target: any, attackId: string, targetActorUuid?: string, targetTokenUuid?: string): Promise<WeaponEffectReservationState[]> {
    const api = customConditionsApi(this.globals);
    if (!api || typeof api.list !== 'function' || typeof api.reserve !== 'function') return [];
    const reserved: WeaponEffectReservationState[] = [];
    const sourceId = actorUuid(sourceActor);
    const targetId = targetActorUuid ?? actorUuid(target);
    const candidates: Array<{ actor: any; entry: any; targetActorUuid?: string }> = [];
    for (const entry of api.list(sourceActor) ?? []) {
      const instance = entry?.instance;
      if (entry?.disabled || instance?.enabled === false || instance?.reservation || instance?.consumeOn !== 'nextCompletedAttack') continue;
      if (instance.effectKind === 'vex' && sourceId && targetId && instance.source?.actorUuid === sourceId && instance.target?.actorUuid === targetId) candidates.push({ actor: sourceActor, entry, targetActorUuid: targetId });
      // Sap is stored on the creature that was hit and applies to that
      // creature's next outgoing attack.  It therefore belongs to the
      // source actor during preflight, while Vex is selected by target.
      if (instance.effectKind === 'sap' && sourceId && instance.target?.actorUuid === sourceId) candidates.push({ actor: sourceActor, entry, targetActorUuid: sourceId });
    }
    for (const candidate of candidates) {
      try {
        const ticket = await api.reserve(candidate.actor, {
          attackId,
          effectId: candidate.entry.id,
          ...(candidate.targetActorUuid ? { targetActorUuid: candidate.targetActorUuid } : {}),
          ...(targetTokenUuid ? { targetTokenUuid } : {}),
        });
        if (ticket) reserved.push({ actorUuid: actorUuid(candidate.actor)!, ticket, kind: candidate.entry.instance?.effectKind, targetActorUuid: candidate.targetActorUuid });
      } catch (error) {
        for (const prior of reserved) {
          const actor = prior.actorUuid === sourceId ? sourceActor : target;
          try { await api.cancel(actor, prior.ticket); } catch { /* preserve original reservation failure */ }
        }
        throw error;
      }
    }
    return reserved;
  }

  private modifiersFromReservations(reservations: WeaponEffectReservationState[]): { advantage: boolean; disadvantage: boolean } {
    return {
      advantage: reservations.some((entry) => entry.kind === 'vex'),
      disadvantage: reservations.some((entry) => entry.kind === 'sap'),
    };
  }

  private contextForState(state: RuntimeState, targetOverride?: any, tokenOverride?: any): WeaponRuleContext {
    const request = state.prepared;
    const activity = state.activity;
    const target = targetOverride ?? state.targetActor;
    const targetTokenOverride = tokenOverride ?? state.targetToken;
    const item = state.item;
    const turn = { key: state.prepared.turnKey };
    const config = state.ledger.configuration ?? readWeaponConfiguration(item) ?? {
      schemaVersion: 1,
      enabled: false,
      mastery: null,
      grantMastery: false,
      rules: [],
    };
    const attack: AttackSnapshot = {
      attackId: request.attackId,
      outcome: state.ledger.outcome ?? 'failed',
      ...(request.critical === undefined ? {} : { critical: request.critical }),
      action: request.action ?? request.attack?.action ?? actionForActivity(activity),
      primaryTargetId: request.attack?.primaryTargetId ?? actorUuid(state.targetActor),
      ...(request.parentAttackId ? { parentAttackId: request.parentAttackId } : {}),
      ...(request.childDepth === undefined ? {} : { childDepth: request.childDepth }),
      ...(request.lightExtraAttack === undefined ? {} : { lightExtraAttack: request.lightExtraAttack }),
    };
    return {
      configuration: config,
      ...(request.selectedMasteryRuleId ? { selectedMasteryRuleId: request.selectedMasteryRuleId } : {}),
      nativeMasteryUnlocked: state.ledger.nativeMasteryUnlocked === true,
      source: {
        actorId: actorUuid(state.sourceActor)!,
        ...(state.prepared.itemUuid ? { itemId: state.prepared.itemUuid } : {}),
        ...(state.prepared.activityUuid ? { activityId: state.prepared.activityUuid } : {}),
      },
      weapon: weaponSnapshot(item, activity),
      attacker: attackerSnapshot(state.sourceActor, activity),
      attack,
      target: targetSnapshot(target, targetTokenOverride, target === state.targetActor ? request : { ...request, target }),
      ...(turn.key ? { turn: { key: turn.key } } : {}),
      usage: usageSnapshot(this.readLedger(state.sourceActor), turn.key),
    };
  }


  private async actualOutcome(state: RuntimeState, outcome: AnyRecord): Promise<{ outcome: AttackOutcome; critical: boolean; damageDealt?: number; raw?: any }> {
    const id = outcome?.messageId ?? state.ledger.attackMessageId;
    const message = await this.resolveMessage(typeof id === 'string' ? id : undefined);
    if (!message || !this.bindAttackMessage(state, message)) return { outcome: 'failed', critical: false };
    const nativeMidi = this.isMidiSameCard(message)
      && this.globals.game.modules?.get?.('midi-qol')?.version === NEXT_MIDI_VERSION;
    const roll = collection(message.rolls).find(candidate => Number.isFinite(candidate?.total)
      && (!nativeMidi || candidate?.options?.['midi-qol']?.rollType === 'attack'));
    if (!roll) return { outcome: 'failed', critical: false };
    const result = outcomeFromRoll(roll, state.targetActor);
    return {
      outcome: result, critical: roll.isCritical === true || roll.options?.isCritical === true,
      ...(state.damageObserved && Number.isFinite(state.ledger.damageDealt) ? { damageDealt: state.ledger.damageDealt } : {}),
    };
  }

  private bindAttackMessage(state: RuntimeState, message: any): boolean {
    const flags = dnd5eMessageData(message, this.globals.game?.system?.version === '6.0.5');
    const moduleFlags = message?.flags?.[MODULE_ID];
    const author = message?.author?.id ?? message?.user?.id ?? message?.user;
    const speaker = message?.speaker;
    const id = message?.id ?? message?._id;
    const speakerActorMatches = typeof speaker?.actor === 'string' && speaker.actor === state.sourceActor?.id;
    const sourceTokenId = state.sourceActor?.token?.id ?? sourceTokenFor(this.globals, state.sourceActor, state.activity)?.id;
    const speakerTokenMatches = typeof speaker?.token === 'string' && typeof sourceTokenId === 'string' && speaker.token === sourceTokenId;
    if (!state.started || typeof id !== 'string' || flags?.roll?.type !== 'attack'
      || moduleFlags?.attackId !== state.prepared.attackId
      || flags?.activity?.uuid !== state.prepared.activityUuid || flags?.item?.uuid !== state.prepared.itemUuid
      || author !== state.ledger.requesterId
      || (!speakerActorMatches && !speakerTokenMatches)
      || (state.prepared.parentAttackId && (!Array.isArray(flags?.targets) || flags.targets.length !== 1 || flags.targets[0]?.uuid !== state.prepared.targetActorUuid))
      || !Number.isFinite(message.timestamp) || message.timestamp < state.prepared.createdAt) return false;
    if (state.ledger.attackMessageId && state.ledger.attackMessageId !== id) return false;
    state.ledger.attackMessageId = id;
    state.ledger.messageId = id;
    state.prepared.messageId = id;
    state.ledger.steps.attack = 'attack';
    state.attackObserved = true;
    this.#messageAttack.set(id, state.prepared.attackId);
    return true;
  }


  private async resolveState(reference: PreparedWeaponUse): Promise<RuntimeState | undefined> {
    const unavailable = (reason: string): undefined => {
      if (this.isGM() && this.globals?.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ === true) {
        const log = Array.isArray(this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__)
          ? this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ : [];
        log.push({ reason: `resolve-${reason}`, attackId: reference?.attackId ?? null,
          sourceActorUuid: reference?.sourceActorUuid ?? null, pendingCount: this.#pending.size });
        if (log.length > 20) log.splice(0, log.length - 20);
        this.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ = log;
      }
      return undefined;
    };
    if (!reference || typeof reference.attackId !== 'string') return unavailable('invalid-reference');
    const existing = this.#pending.get(reference.attackId);
    if (existing) return reference.sourceActorUuid === existing.prepared.sourceActorUuid
      ? existing : unavailable('existing-source-mismatch');
    const sourceActor = await fromUuid(this.globals, reference.sourceActorUuid);
    if (!sourceActor) return unavailable('source-actor-missing');
    const ledger = this.readLedger(sourceActor).find(entry => entry.attackId === reference.attackId);
    if (!ledger) return unavailable('ledger-missing');
    const item = await fromUuid(this.globals, ledger.itemUuid);
    const activityPrefix = `${ledger.itemUuid}.Activity.`;
    const activityId = typeof ledger.activityUuid === 'string' && ledger.activityUuid.startsWith(activityPrefix)
      ? ledger.activityUuid.slice(activityPrefix.length) : undefined;
    const activity = await fromUuid(this.globals, ledger.activityUuid)
      ?? (activityId && !activityId.includes('.') ? itemActivity(item, activityId) : undefined);
    const target = await fromUuid(this.globals, ledger.targetActorUuid);
    const token = await fromUuid(this.globals, ledger.targetTokenUuid);
    if (!item) return unavailable('item-missing');
    if (!activity) return unavailable('activity-missing');
    if (activityUuid(activity) !== ledger.activityUuid
      || itemUuid(activity.item) !== ledger.itemUuid) return unavailable('activity-identity-mismatch');
    const prepared: PreparedWeaponUse = {
      schemaVersion: 1, attackId: ledger.attackId, sourceActorUuid: ledger.sourceActorUuid,
      itemUuid: ledger.itemUuid, activityUuid: ledger.activityUuid,
      targetActorUuid: ledger.targetActorUuid, targetTokenUuid: ledger.targetTokenUuid,
      parentAttackId: ledger.parentAttackId, childDepth: ledger.parentAttackId ? 1 : 0,
      turnKey: ledger.turnKey, reservations: ledger.reservations,
      modifiers: this.modifiersFromReservations(ledger.reservations), createdAt: ledger.createdAt,
      selectedMasteryRuleId: ledger.selectedMasteryRuleId, nativeMasteryUnlocked: ledger.nativeMasteryUnlocked,
      lightExtraAttack: ledger.lightExtraAttack, action: ledger.lightExtraAttack ? 'attack' : actionForActivity(activity),
      attackMode: ledger.attackMode, messageId: ledger.attackMessageId,
      outcome: ledger.outcome, critical: ledger.critical, damageDealt: ledger.damageDealt,
    };
    const state: RuntimeState = { prepared, sourceActor, item, activity, targetActor: target, targetToken: token?.object ?? token, ledger,
      started: ledger.step !== 'prepared', attackObserved: ledger.steps.attack === 'attack', damageObserved: ledger.steps.damage === 'damage' };
    this.#pending.set(prepared.attackId, state);
    return state;
  }

  private authorizedRequester(user: any, actor: any, item: any): boolean {
    if (!user) return false;
    if (user?.isGM === true && user.active !== false) return true;
    return isOwnedBy(user, item) || isOwnedBy(user, actor);
  }


  private async persistState(state: RuntimeState): Promise<void> {
    // A player's state is a local transport cache, never a replacement for the GM ledger.
    if (!this.isGM()) return;
    const key = actorUuid(state.sourceActor)!;
    const run = (this.#actorWrites.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (!this.isGM()) throw new Error('Active GM changed before ledger persistence.');
      state.ledger.updatedAt = Date.now();
      const entries = this.readLedger(state.sourceActor).filter(entry => entry.attackId !== state.ledger.attackId);
      entries.push(clone(state.ledger));
      // Never evict an unresolved reservation/settlement to make room for history.
      const active = entries.filter(entry => !isTerminal(entry));
      const history = entries.filter(isTerminal).slice(-128);
      if (active.length > 128) throw new Error('Too many unresolved attacks; GM reconciliation required.');
      const next = [...history, ...active];
      if (typeof state.sourceActor?.setFlag !== 'function') throw new Error('Actor ledger persistence is unavailable.');
      await state.sourceActor.setFlag(MODULE_ID, LEDGER_FLAG, next);
      this.#ledgerCache.set(key, next);
      const phase = state.ledger.step;
      if (phase === 'prepared' || phase === 'committed' || phase === 'cancelled') {
        await triggerEngineApi(this.globals).publishExternal({
          schemaVersion: 1, namespace: MODULE_ID,
          eventId: state.prepared.attackId + ':' + phase, type: 'attack.' + phase,
          attackId: state.prepared.attackId, sourceActorUuid: key,
          activityUuid: state.prepared.activityUuid,
          ...(state.prepared.targetActorUuid ? { targetActorUuid: state.prepared.targetActorUuid } : {}),
          timestamp: state.prepared.createdAt,
          data: { reservationCount: state.prepared.reservations.length },
        });
      }
    });
    this.#actorWrites.set(key, run);
    try {
      await run;
      if (this.#pending.size > 256) this.pruneTerminalStates();
    } finally { if (this.#actorWrites.get(key) === run) this.#actorWrites.delete(key); }
  }

  private pruneTerminalStates(): void {
    for (const [attackId, state] of this.#pending) {
      if (this.#pending.size <= 192) break;
      if (!isTerminal(state.ledger)) continue;
      this.#pending.delete(attackId);
      for (const [messageId, mappedId] of this.#messageAttack) {
        if (mappedId === attackId) this.#messageAttack.delete(messageId);
      }
    }
  }

  private readLedger(actor: any): WeaponLedgerEntry[] {
    const raw = actor?.getFlag?.(MODULE_ID, LEDGER_FLAG) ?? actor?.flags?.[MODULE_ID]?.[LEDGER_FLAG];
    return Array.isArray(raw) ? raw.filter(entry => entry?.schemaVersion === 1 && typeof entry.attackId === 'string') : [];
  }

  private requiresPreparation(activity: any): boolean {
    if (!activity || !isAttackActivity(activity)) return false;
    const item = activity.item ?? activity.parent;
    const configuration = readWeaponConfiguration(item);
    if (configuration?.enabled) return true;
    const actor = activity.actor;
    // Record an ordinary first Light attack when another weapon on this actor
    // can use Nick. The first weapon need not carry this module's own flag.
    if (actor && isLightWeapon(item) && collection(actor.items).some((candidate: any) => {
      if (candidate === item || !isLightWeapon(candidate)) return false;
      const other = readWeaponConfiguration(candidate);
      if (!other?.enabled) return false;
      const selected = other.mastery === 'native' ? readSelectedMastery(candidate, itemActivity(candidate)) : other.mastery;
      return masteryQualificationKind(other, selected)?.replace(/^dnd2024\./, '') === 'nick';
    })) return true;
    if (actor && customConditionsApi(this.globals)?.list) {
      const sourceId = actorUuid(actor);
      if (customConditionsApi(this.globals).list(actor).some((entry: any) => entry?.instance?.effectKind === 'vex' && entry.instance.source.actorUuid === sourceId)) return true;
      if (customConditionsApi(this.globals).list(actor).some((entry: any) => entry?.instance?.effectKind === 'sap' && entry.instance.target.actorUuid === sourceId)) return true;
    }
    return false;
  }

  private resolveActivity(subject: any, request: WeaponUseRequest): any | undefined {
    if (request.activity) return request.activity;
    if (isActivity(subject)) return subject;
    return itemActivity(request.item ?? subject, request.activityUuid);
  }

  private findAttackId(subject: any, messageId?: string): string | undefined {
    if (messageId && this.#messageAttack.has(String(messageId))) return this.#messageAttack.get(String(messageId));
    const direct = subject?.[PRIVATE_USE_KEY] ?? subject?.options?.[PRIVATE_USE_KEY];
    if (typeof direct === 'string') return direct;
    const active = this.#activeRolls.get(String(activityUuid(subject)));
    if (active && !isTerminal(this.#pending.get(active)?.ledger)) return active;
    return undefined;
  }

  private async transition<T>(key: string, work: () => Promise<T>): Promise<T> {
    const run = (this.#transitions.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.#transitions.set(key, run);
    try { return await run; } finally { if (this.#transitions.get(key) === run) this.#transitions.delete(key); }
  }

  private async resolveMessage(id?: string): Promise<any> {
    if (!id) return undefined;
    return this.globals?.game?.messages?.get?.(id) ?? fromUuid(this.globals, `ChatMessage.${id}`);
  }


  private async installQueries(): Promise<void> {
    const config = this.globals?.CONFIG;
    if (!config) return;
    config.queries ??= {};
    const requireUser = (context: QueryContext) => {
      if (!this.isGM() || !context?.user || context.user.active === false) throw new Error('An authenticated user and active GM are required.');
      return context.user;
    };
    const handlers: Record<string, (data: any, context: QueryContext) => Promise<any>> = {
      [WEAPON_QUERY_PREPARE]: async (data, context) => {
        const user = requireUser(context);
        const request = serializeRequest(data ?? {}) as RuntimeRequest;
        if (!request.actorUuid || !request.itemUuid || !request.activityUuid) throw new Error('Source UUIDs are required.');
        // Wire callers cannot manufacture document references, qualification or child attacks.
        delete request.parentAttackId;
        const prepared = await this.transition('prepare:' + request.actorUuid, () => this.prepareAsGM(request, user));
        return prepared ? serializePrepared(prepared) : undefined;
      },
      [WEAPON_QUERY_PREPARE + '.start']: async (data, context) => {
        const user = requireUser(context);
        return this.transition(String(data?.attackId), async () => {
          const state = await this.resolveState(data);
          if (!state || !this.authorizedRequester(user, state.sourceActor, state.item) || state.ledger.requesterId !== user.id) throw new Error('Unauthorized attack start.');
          return serializePrepared(await this.startAsGM(state.prepared));
        });
      },
      [WEAPON_QUERY_PREPARE + '.selection']: async (data, context) => {
        const user = requireUser(context);
        return this.transition('prepare:' + String(data?.prepared?.sourceActorUuid), () => this.finalizeSelectionAsGM(data.prepared, serializeRequest(data.selection ?? {}), user));
      },
      [WEAPON_QUERY_COMMIT]: async (data, context) => {
        const user = requireUser(context);
        if (!data?.prepared || !data.outcome || Object.keys(data.outcome).some(key => key !== 'messageId')) throw new Error('Only a linked message ID may be submitted as attack evidence.');
        return this.transition(String(data.prepared.attackId), () => this.commitAsGM(data.prepared, serializeOutcome(data.outcome), user));
      },
      [WEAPON_QUERY_CANCEL]: async (data, context) => {
        const user = requireUser(context);
        return this.transition(String(data?.attackId), () => this.cancelAsGM(data, user));
      },
    };
    for (const [name, handler] of Object.entries(handlers)) {
      this.#queryPrevious.set(name, config.queries[name]);
      config.queries[name] = handler;
    }
  }

  private onHook(name: string, handler: (...args: any[]) => any): void {
    const id = this.globals?.Hooks?.on?.(name, handler);
    this.#handlers.push({ name, id });
  }

  private report(error: unknown): void {
    this.globals?.console?.error?.(`[${MODULE_ID}]`, error);
  }

  private pruneTurnUsage(): void {
    // The ledger is persisted and keyed by the exact Combat/round/turn key;
    // old entries remain available for audit but never match current usage.
  }
}

export function createWeaponMasteryRuntime(options: WeaponMasteryRuntimeOptions = {}): WeaponMasteryRuntime {
  return new WeaponMasteryRuntime(options);
}


function serializeRequest(request: WeaponUseRequest): WeaponUseRequest {
  const result: AnyRecord = {};
  for (const key of ['actorUuid', 'itemUuid', 'activityUuid', 'targetActorUuid', 'targetTokenUuid', 'attackId', 'selectedMasteryRuleId', 'attackMode', 'parentAttackId']) {
    const value = (request as AnyRecord)?.[key];
    if (value === null && key === 'selectedMasteryRuleId') result[key] = null;
    else if (typeof value === 'string' && value.length <= 240 && !/[\u0000-\u001f]/.test(value)) result[key] = value;
  }
  return result;
}

function serializePrepared(prepared: PreparedWeaponUse): PreparedWeaponUse {
  const result = { ...prepared } as PreparedWeaponUse;
  delete result.item;
  delete result.activity;
  delete result.actor;
  delete result.target;
  delete result.targetActor;
  delete result.targetToken;
  delete result.targets;
  delete result.usage;
  delete result.sourceActor;
  delete result.resolvedItem;
  delete result.resolvedActivity;
  delete result.resolvedTargetActor;
  delete result.resolvedTargetToken;
  return result;
}


function serializeOutcome(outcome: AnyRecord): AnyRecord {
  return typeof outcome?.messageId === 'string' ? { messageId: outcome.messageId } : {};
}

function isTerminal(ledger?: WeaponLedgerEntry): boolean {
  return !ledger || ledger.step === 'committed' || ledger.step === 'cancelled';
}

function isOffhandAttack(request: WeaponUseRequest): boolean {
  return typeof request.attackMode === 'string' && request.attackMode.toLowerCase().endsWith('offhand');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isActivity(value: any): boolean {
  return Boolean(value && (value.documentName === 'Activity' || value.actor && value.item && (typeof value.rollAttack === 'function' || typeof value.use === 'function')));
}

function isAttackActivity(activity: any): boolean {
  const type = activity?.type ?? activity?.item?.system?.actionType;
  return activity?.type === 'attack' || activity?.getActionType?.() === 'mwak' || activity?.getActionType?.() === 'rwak' || ['mwak', 'rwak', 'msak', 'rsak'].includes(type);
}

function actionForActivity(activity: any): AttackAction {
  const type = activity?.activation?.type ?? activity?.actionType;
  if (type === 'bonus') return 'bonus';
  if (type === 'reaction') return 'reaction';
  return 'attack';
}

function weaponSnapshot(item: any, activity: any): { id?: string; isMelee: boolean; isLight: boolean; reachFeet?: number; damageType?: string } {
  const type = activity?.getActionType?.() ?? activity?.actionType ?? item?.system?.actionType;
  const properties = item?.system?.properties;
  const hasProperty = (key: string): boolean => properties instanceof Set ? properties.has(key) : Boolean(properties?.[key]);
  const damage = activity?.damage?.parts?.[0] ?? item?.system?.damage?.base ?? item?.system?.damage;
  const damageTypes = damage?.types;
  const damageType = damageTypes instanceof Set ? [...damageTypes][0] : Array.isArray(damageTypes) ? damageTypes[0] : typeof damage?.[1] === 'string' ? damage[1] : damage?.type;
  const reach = item?.system?.range?.reach ?? item?.system?.range?.value;
  return {
    ...(item?.id ? { id: item.id } : {}),
    isMelee: typeof type === 'string' ? type.startsWith('m') : item?.system?.range?.units === 'ft' && !item?.system?.range?.long,
    isLight: hasProperty('lgt') || hasProperty('light'),
    ...(typeof reach === 'number' ? { reachFeet: reach } : {}),
    ...(typeof damageType === 'string' && damageType ? { damageType } : {}),
  };
}

function attackerSnapshot(actor: any, activity: any): { abilityModifier: number; proficiencyBonus: number } {
  const ability = activity?.ability ?? activity?.abilityMod ?? activity?.abilityModifier;
  const mod = typeof activity?.abilityMod === 'number' ? activity.abilityMod : actor?.system?.abilities?.[ability]?.mod;
  const prof = actor?.system?.attributes?.prof;
  return { abilityModifier: Number(mod ?? 0), proficiencyBonus: Number(prof ?? 0) };
}

function targetSnapshot(actor: any, token: any, request: WeaponUseRequest): TargetSnapshot {
  const id = actorUuid(actor) ?? token?.id ?? request.targetActorUuid ?? '';
  return {
    id,
    size: (actorSize(actor) ?? 'medium') as CreatureSize,
    ...(typeof request.damageDealt === 'number' ? { damageDealt: request.damageDealt } : {}),
    ...(typeof request.target?.distanceFromAttackerFeet === 'number' ? { distanceFromAttackerFeet: request.target.distanceFromAttackerFeet } : {}),
    ...(typeof request.target?.distanceFromPrimaryFeet === 'number' ? { distanceFromPrimaryFeet: request.target.distanceFromPrimaryFeet } : {}),
  };
}

function readSelectedMastery(item: any, activity: any): string | null {
  const id = activity?.id;
  const flag = id ? getProperty(item, `flags.dnd5e.last.${id}.mastery`) : undefined;
  const selected = flag ?? activity?.mastery ?? item?.system?.mastery;
  return typeof selected === 'string' && selected.trim() ? selected : null;
}

function masteryQualificationKind(configuration: WeaponConfiguration | null | undefined, selected?: string | null): string | null | undefined {
  if (!selected || selected.startsWith('dnd2024.')) return selected;
  const copied = configuration?.rules.find(rule => rule.ruleId === selected);
  return copied && ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'].includes(copied.kind)
    ? copied.kind : selected;
}

function nativeMasteryUnlocked(actor: any, item: any, selected?: string | null): boolean {
  if (actor?.system?.isNPC === true) return false;
  selected = selected?.replace(/^dnd2024\./, '') ?? selected;
  const mastery = actor?.system?.traits?.weaponProf?.mastery;
  const value = mastery?.value;
  const bonus = mastery?.bonus;
  const baseItem = item?.system?.type?.baseItem ?? item?.type?.baseItem ?? item?.system?.baseItem;
  const itemMastery = item?.system?.mastery;
  const has = (collection: any, candidate: unknown): boolean => {
    if (!candidate) return false;
    if (collection instanceof Set) return collection.has(candidate);
    if (Array.isArray(collection)) return collection.includes(candidate);
    return Boolean(collection?.[candidate as string]);
  };
  if (!has(value, baseItem)) return false;
  return selected === null || selected === undefined || selected === itemMastery || has(bonus, selected);
}

function snapshotHp(actor: any): { hp?: number; tempHp?: number } {
  const hp = actor?.system?.attributes?.hp;
  return {
    ...(typeof hp?.value === 'number' ? { hp: hp.value } : {}),
    ...(typeof hp?.temp === 'number' ? { tempHp: hp.temp } : {}),
  };
}

function usageSnapshot(entries: readonly WeaponLedgerEntry[], turnKey?: string): { usedCount: number; usedRuleIds: readonly string[] } {
  const current = entries.filter((entry) => entry.step === 'committed' && entry.turnKey === turnKey);
  const ids = current.flatMap((entry) => entry.usedRuleIds.map(id => {
    const kind = masteryKindForLedgerRule(entry, id);
    return kind === 'nick' || kind === 'cleave' ? `dnd2024.${kind}` : id;
  }));
  // Eligibility has no rule-specific count field.  All first-release
  // once-per-turn presets are guarded by usedRuleIds; a generic attack count
  // would incorrectly consume Nick/Cleave after an unrelated attack.
  return { usedCount: 0, usedRuleIds: ids };
}

function masteryKindForLedgerRule(entry: WeaponLedgerEntry, ruleId: string): string | undefined {
  if (ruleId.startsWith('dnd2024.')) return ruleId.slice('dnd2024.'.length);
  return entry.configuration?.rules.find(rule => rule.ruleId === ruleId)?.kind;
}

function outcomeFromRoll(roll: any, target: any): AttackOutcome {
  if (!roll) return 'failed';
  if (roll.cancelled === true) return 'cancelled';
  // The native d20 getters encode automatic miss/hit independently of AC.
  if (roll.isFumble === true) return 'miss';
  if (roll.isCritical === true) return 'hit';
  if (roll.isSuccess === false) return 'miss';
  if (roll.isSuccess === true) return 'hit';
  const total = Number(roll.total);
  const ac = Number(target?.system?.attributes?.ac?.value ?? target?.system?.attributes?.ac);
  if (Number.isFinite(total) && Number.isFinite(ac)) return total >= ac ? 'hit' : 'miss';
  return 'failed';
}

function outcomeFromWorkflow(workflow: any): AttackOutcome {
  if (workflow?.aborted || workflow?.cancelled) return 'cancelled';
  if (workflow?.hitTargets && collection(workflow.hitTargets).length === 0 && workflow?.targets) return 'miss';
  if (workflow?.isSuccess === false) return 'miss';
  return 'hit';
}

function totalRolls(rolls: any[]): number | undefined {
  const totals = collection(rolls).map((roll) => Number(roll?.total)).filter(Number.isFinite);
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) : undefined;
}

function addTracker(target: any, label: string): void {
  if (typeof target?.add === 'function') target.add(label);
  else if (target instanceof Set) target.add(label);
}

function isLightWeapon(item: any): boolean {
  const props = item?.system?.properties;
  return props instanceof Set ? props.has('lgt') : Boolean(props?.lgt ?? props?.light);
}

function reservationsWouldBeRelevant(globals: any, sourceActor: any, target: any): boolean {
  const api = customConditionsApi(globals);
  if (!api || typeof api.list !== 'function') return false;
  const sourceId = actorUuid(sourceActor);
  const targetId = actorUuid(target);
  const sourceEntries = api.list(sourceActor) ?? [];
  if (sourceEntries.some((entry: any) => {
    const instance = entry?.instance;
    return entry?.disabled !== true && instance?.enabled !== false && instance?.consumeOn === 'nextCompletedAttack'
      && instance?.effectKind === 'vex' && instance?.source?.actorUuid === sourceId && instance?.target?.actorUuid === targetId;
  })) return true;
  return false;
}

function sourceTokenFor(globals: any, actor: any, activity: any): any | undefined {
  if (activity?.token) return activity.token;
  const controlled = collection(globals?.canvas?.tokens?.controlled).filter((token) => token?.actor === actor || actorUuid(token?.actor) === actorUuid(actor));
  if (controlled.length === 1) return controlled[0];
  if (controlled.length > 1) return undefined;
  try {
    const active = actor?.getActiveTokens?.(true, true);
    if (Array.isArray(active) && active.length === 1) return active[0];
  } catch { /* An unavailable token lookup cannot establish source geometry. */ }
  return undefined;
}

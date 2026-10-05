import { evaluateConditionGroup, watchedPathsMatch } from './evaluator.ts';
import {
  cloneTrigger,
  cloneTriggerStore,
  sanitizeTriggerStore,
  validateTriggerDefinition,
  validateTriggerStore,
  type ValidationIssue,
} from './schema.ts';
import { DEFAULT_TRIGGER_STORE } from './schema.ts';
import type { TriggerStorage } from './storage.ts';
import { FoundryTriggerStorage } from './storage.ts';
import { EXTERNAL_EVENT_SETTING_KEY, MODULE_ID } from './constants.ts';
import type {
  CombatTurnContext,
  CombatUpdateReport,
  ExternalEvent,
  ExternalEventData,
  ExternalEventListener,
  ExternalEventPublishResult,
  DocumentUpdateReport,
  MacroAction,
  PreparedHitPoints,
  TriggerActionResult,
  TriggerContext,
  TriggerDefinition,
  TriggerEventContext,
  TriggerEventListener,
  TriggerExecutionResult,
  TriggerStore,
} from './types.ts';
import {
  EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION,
  EXTERNAL_EVENT_LIMITS,
  EXTERNAL_EVENT_SCHEMA_VERSION,
} from './types.ts';

export interface TriggerEngineRuntimeOptions {
  globals?: any;
  storage?: TriggerStorage;
  externalEventStorage?: ExternalEventLedgerStorage;
  /** A test/embedding seam. The default resolver uses foundry.utils.fromUuid. */
  macroResolver?: (uuid: string) => unknown | Promise<unknown>;
  logger?: Pick<Console, 'error' | 'warn'>;
  onCombatTurnStart?: (context: CombatTurnContext) => Promise<void>;
}

/** Storage seam for the serialized, bounded external-event ledger. */
export interface ExternalEventLedgerStorage {
  load(): unknown | Promise<unknown>;
  save(serializedLedger: string): void | Promise<void>;
}

interface CombatStateSnapshot {
  round: number;
  turn: number | null;
  combatantId: string | null;
  active: boolean;
}

interface CapturedCombatTurn {
  context: CombatTurnContext;
  combatUuid: string;
  actorUuid: string;
  changed: unknown;
  before: unknown;
  after: unknown;
}

export class TriggerEngineRuntime {
  readonly globals: any;
  readonly storage: TriggerStorage;
  readonly externalEventStorage?: ExternalEventLedgerStorage;
  readonly logger: Pick<Console, 'error' | 'warn'>;
  readonly macroResolver?: (uuid: string) => unknown | Promise<unknown>;
  readonly onCombatTurnStart?: (context: CombatTurnContext) => Promise<void>;

  #triggers: TriggerDefinition[] = [];
  #snapshots = new Map<string, unknown>();
  #preparedHpSnapshots = new Map<string, PreparedHitPoints>();
  #documentQueues = new Map<string, Promise<void>>();
  #combatSnapshots = new Map<string, CombatStateSnapshot>();
  #combatQueues = new Map<string, Promise<void>>();
  #snapshotHooks: Array<[string, unknown]> = [];
  #seenCombatTurnKeys = new Set<string>();
  #activeExecutions = new Map<string, { triggerId: string; documentUuid: string }>();
  #eventListeners = new Set<TriggerEventListener>();
  #externalEventListeners = new Set<ExternalEventListener>();
  #externalEvents: ExternalEvent[] = [];
  #externalEventKeys = new Set<string>();
  #externalLedgerLoaded = false;
  #externalLedgerQueue: Promise<void> = Promise.resolve();
  #externalPublishQueue: Promise<void> = Promise.resolve();
  #externalDeliveryQueue: Promise<void> = Promise.resolve();
  #externalSettingRegistered = false;
  #executionSequence = 0;
  #hookId: unknown;
  #combatHookId: unknown;
  #combatTurnHookId: unknown;
  #started = false;
  #invalidIssues: ValidationIssue[] = [];

  constructor(options?: TriggerEngineRuntimeOptions);
  constructor(globals: any, storage?: TriggerStorage);
  constructor(options: any = {}, storageOverride?: TriggerStorage) {
    const normalized = isRuntimeOptions(options)
      ? options
      : { globals: options, storage: storageOverride };
    this.globals = normalized.globals ?? globalThis;
    this.storage = normalized.storage ?? new FoundryTriggerStorage(this.globals.game);
    this.externalEventStorage = normalized.externalEventStorage ?? createFoundryExternalEventStorage(this.globals.game);
    this.logger = normalized.logger ?? console;
    this.macroResolver = normalized.macroResolver;
    this.onCombatTurnStart = normalized.onCombatTurnStart;
  }

  get started(): boolean { return this.#started; }

  get invalidIssues(): readonly ValidationIssue[] { return this.#invalidIssues; }

  /** Subscribe to generic trigger events without importing private runtime code. */
  subscribe(listener: TriggerEventListener): () => void {
    if (typeof listener !== 'function') throw new TypeError('Trigger event listener must be a function.');
    this.#eventListeners.add(listener);
    return () => { this.#eventListeners.delete(listener); };
  }

  /** Subscribe to sanitized external events without requiring GM access. */
  subscribeExternal(listener: ExternalEventListener): () => void {
    if (typeof listener !== 'function') throw new TypeError('External event listener must be a function.');
    this.#externalEventListeners.add(listener);
    return () => { this.#externalEventListeners.delete(listener); };
  }

  /**
   * Publish one validated external event from the active GM. This bridge only
   * transports a bounded envelope; the caller owns GM reparse, permissions,
   * and proof that the attack actually reached the named phase. The returned
   * promise completes after persistence/deduplication; subscribers receive
   * events in order through a separate delivery queue.
   */
  async publishExternal(input: ExternalEvent): Promise<ExternalEventPublishResult> {
    if (!this.isActiveGM()) throw new Error('External events are available to active GMs only.');
    const event = validateExternalEvent(input);
    const run = this.#externalPublishQueue
      .catch(() => undefined)
      .then(async () => this.publishExternalInQueue(event));
    this.#externalPublishQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  /** Load validated world data, seed ready snapshots, and bind lifecycle hooks. */
  async start(): Promise<void> {
    if (this.#started) return;
    this.registerExternalEventSetting();
    await this.reload();
    await this.loadExternalEventLedger();
    this.captureReadySnapshots();
    this.captureReadyCombatSnapshots();
    this.bindUpdateHook();
    this.#started = true;
  }

  /** Alias for consumers that use Foundry lifecycle terminology. */
  async initialize(): Promise<void> { await this.start(); }

  async handleUpdate(document: any, changed: unknown, options: unknown = {}, userId?: string): Promise<DocumentUpdateReport> {
    return this.handleDocumentUpdate(document, changed, options, userId);
  }

  async onDocumentUpdate(document: any, changed: unknown, options: unknown = {}, userId?: string): Promise<DocumentUpdateReport> {
    return this.handleDocumentUpdate(document, changed, options, userId);
  }

  /**
   * Handle one post-update Combat hook. The transition and target references
   * are captured synchronously before the per-Combat queue can yield, so rapid
   * updates cannot make a queued event resolve against a later combatant.
  */
  async handleCombatUpdate(combat: any, changed: unknown, options: unknown = {}, userId?: string): Promise<CombatUpdateReport> {
    const capture = this.captureCombatTurn(combat, changed, options, userId);
    if (!capture.event) return capture.report;

    return this.enqueueCombatTurn(capture.event);
  }

  private async handleCombatTurnChange(combat: any, prior: unknown, current: unknown): Promise<CombatUpdateReport> {
    const capture = this.captureCombatTurnChange(combat, prior, current);
    if (!capture.events.length) return capture.report;
    // Reserve the entire transition before yielding to listeners. Otherwise a
    // rapid second transition can enqueue B.end before A→B enqueues B.start.
    const reports = await Promise.all(capture.events.map((event) => this.enqueueCombatTurn(event)));
    return reports.at(-1) ?? capture.report;
  }

  private enqueueCombatTurn(event: CapturedCombatTurn): Promise<CombatUpdateReport> {
    if (!this.isActiveGM()) {
      return Promise.resolve({
        combatUuid: event.combatUuid,
        key: event.context.key,
        matchedTriggerIds: [],
        results: [],
        skippedReason: 'inactive-gm',
      });
    }
    if (this.#seenCombatTurnKeys.has(event.context.key)) {
      return Promise.resolve({
        combatUuid: event.combatUuid,
        key: event.context.key,
        matchedTriggerIds: [],
        results: [],
        skippedReason: 'duplicate',
      });
    }
    this.#seenCombatTurnKeys.add(event.context.key);

    const previous = this.#combatQueues.get(event.combatUuid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.processCombatTurnEvent(event));
    const tail = run.then(() => undefined, () => undefined);
    this.#combatQueues.set(event.combatUuid, tail);
    void tail.finally(() => {
      if (this.#combatQueues.get(event.combatUuid) === tail) this.#combatQueues.delete(event.combatUuid);
    });
    return run;
  }

  async stop(): Promise<void> {
    if (this.#hookId !== undefined) {
      const hooks = this.globals.Hooks;
      if (typeof hooks?.off === 'function') hooks.off('updateActor', this.#hookId);
      this.#hookId = undefined;
    }
    if (this.#combatHookId !== undefined) {
      const hooks = this.globals.Hooks;
      if (typeof hooks?.off === 'function') hooks.off('updateCombat', this.#combatHookId);
      this.#combatHookId = undefined;
    }
    if (this.#combatTurnHookId !== undefined) {
      const hooks = this.globals.Hooks;
      if (typeof hooks?.off === 'function') hooks.off('combatTurnChange', this.#combatTurnHookId);
      this.#combatTurnHookId = undefined;
    }
    this.#combatQueues.clear();
    for (const [name, id] of this.#snapshotHooks) this.globals.Hooks?.off?.(name, id);
    this.#snapshotHooks = [];
    this.#combatSnapshots.clear();
    this.#seenCombatTurnKeys.clear();
    this.#preparedHpSnapshots.clear();
    this.#started = false;
    this.#eventListeners.clear();
    this.#externalEventListeners.clear();
    this.#externalEvents = [];
    this.#externalEventKeys.clear();
    this.#externalLedgerLoaded = false;
    this.#externalLedgerQueue = Promise.resolve();
    this.#externalPublishQueue = Promise.resolve();
    this.#externalDeliveryQueue = Promise.resolve();
  }

  async reload(): Promise<TriggerStore> {
    try {
      const raw = await this.storage.load();
      this.applySettingValue(raw);
    } catch (error) {
      this.#triggers = [];
      this.#invalidIssues = [{ path: 'store', message: `load failed: ${String(error)}` }];
      this.logger.warn(`[fvtt-trigger-engine] trigger store load failed`, error);
    }
    return this.triggerStore();
  }

  /** Apply a world-setting broadcast to this client's validated runtime cache. */
  applySettingValue(raw: unknown): TriggerStore {
    const parsed = sanitizeTriggerStore(raw);
    this.#triggers = parsed.store.triggers.map(cloneTrigger);
    this.#invalidIssues = parsed.issues;
    return this.triggerStore();
  }

  triggerStore(): TriggerStore {
    return cloneTriggerStore({ schemaVersion: DEFAULT_TRIGGER_STORE.schemaVersion, triggers: this.#triggers });
  }

  listTriggers(): TriggerDefinition[] {
    return this.#triggers.map(cloneTrigger);
  }

  async createTrigger(input: TriggerDefinition): Promise<TriggerDefinition> {
    const trigger = validateTriggerDefinition(input);
    if (this.#triggers.some((entry) => entry.id === trigger.id)) throw new Error(`Trigger ID already exists: ${trigger.id}`);
    await this.persist({ schemaVersion: DEFAULT_TRIGGER_STORE.schemaVersion, triggers: [...this.#triggers, trigger] });
    return cloneTrigger(trigger);
  }

  async updateTrigger(id: string, patch: Partial<TriggerDefinition>): Promise<TriggerDefinition> {
    const index = this.#triggers.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error(`Unknown trigger ID: ${id}`);
    const merged = validateTriggerDefinition({ ...this.#triggers[index], ...patch });
    if (merged.id !== id && this.#triggers.some((entry, candidateIndex) => candidateIndex !== index && entry.id === merged.id)) {
      throw new Error(`Trigger ID already exists: ${merged.id}`);
    }
    const triggers = this.#triggers.map((entry, candidateIndex) => candidateIndex === index ? merged : entry);
    await this.persist({ schemaVersion: DEFAULT_TRIGGER_STORE.schemaVersion, triggers });
    return cloneTrigger(merged);
  }

  async copyTrigger(id: string): Promise<TriggerDefinition> {
    const source = this.#triggers.find((entry) => entry.id === id);
    if (!source) throw new Error(`Unknown trigger ID: ${id}`);
    const baseId = `${source.id}-copy`;
    let nextId = baseId;
    let suffix = 2;
    while (this.#triggers.some((entry) => entry.id === nextId)) nextId = `${baseId}-${suffix++}`;
    const copy = validateTriggerDefinition({ ...cloneTrigger(source), id: nextId, name: `${source.name} (Copy)` });
    await this.persist({ schemaVersion: DEFAULT_TRIGGER_STORE.schemaVersion, triggers: [...this.#triggers, copy] });
    return cloneTrigger(copy);
  }

  async setTriggerEnabled(id: string, enabled: boolean): Promise<TriggerDefinition> {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    return this.updateTrigger(id, { enabled });
  }

  async deleteTrigger(id: string): Promise<void> {
    if (!this.#triggers.some((entry) => entry.id === id)) throw new Error(`Unknown trigger ID: ${id}`);
    await this.persist({ schemaVersion: DEFAULT_TRIGGER_STORE.schemaVersion, triggers: this.#triggers.filter((entry) => entry.id !== id) });
  }

  /**
   * Seed before snapshots at the ready boundary. A snapshot is plain data and
   * therefore cannot retain a live Actor reference or be mutated by Foundry.
   */
  captureReadySnapshots(): void {
    this.#snapshots.clear();
    this.#preparedHpSnapshots.clear();
    for (const actor of this.actors()) {
      const uuid = documentUuid(actor);
      if (uuid) {
        this.#snapshots.set(uuid, snapshotDocument(actor));
        this.rememberPreparedHp(actor, uuid);
      }
    }
    // Unlinked Token Actors also need a baseline on the GM client before a
    // player performs their first update (preUpdateActor is origin-client only).
    for (const scene of this.globals.game?.scenes?.values?.() ?? []) {
      for (const token of scene.tokens?.values?.() ?? []) {
        const actor = token.actor;
        const uuid = actor && documentUuid(actor);
        if (uuid) {
          this.#snapshots.set(uuid, snapshotDocument(actor));
          this.rememberPreparedHp(actor, uuid);
        }
      }
    }
  }

  /** Seed Combat state at ready so initialization cannot replay a live turn. */
  captureReadyCombatSnapshots(): void {
    this.#combatSnapshots.clear();
    this.#seenCombatTurnKeys.clear();
    for (const combat of this.combats()) {
      const uuid = combatUuid(combat);
      if (!uuid) continue;
      const state = readCombatState(combat);
      this.#combatSnapshots.set(uuid, state);
      if (state.active && state.round > 0 && state.turn !== null) this.#seenCombatTurnKeys.add(combatTurnKey(uuid, state));
    }
  }

  snapshotFor(documentUuid: string): unknown {
    return cloneUnknown(this.#snapshots.get(documentUuid));
  }

  captureSnapshots(): void { this.captureReadySnapshots(); }

  /**
   * Handle one post-update Actor hook. Snapshot replacement happens before
   * filtering, permission checks, and recursion checks so every update keeps
   * the next before/after pair fresh.
   */
  async handleDocumentUpdate(document: any, changed: unknown, options: unknown = {}, userId?: string): Promise<DocumentUpdateReport> {
    const documentUuidValue = documentUuid(document) ?? `Actor.${String(document?.id ?? 'unknown')}`;
    const after = snapshotDocument(document);
    const before = this.#snapshots.get(documentUuidValue);
    const priorHp = this.#preparedHpSnapshots.get(documentUuidValue);
    const preparedAfter = snapshotPreparedHp(document);
    const preparedHp = priorHp && preparedAfter
      ? { before: { ...priorHp }, after: { ...preparedAfter } } : undefined;
    this.#snapshots.set(documentUuidValue, cloneUnknown(after));
    this.rememberPreparedHp(document, documentUuidValue);

    const nativeModified = Number(document?._stats?.modifiedTime);
    const event = { document, changed, options, userId, documentUuidValue, before, after,
      preparedHp,
      capturedModifiedTime: Number.isFinite(nativeModified) ? nativeModified : undefined };
    const causalChain = causalExecutions(options);
    const isReentrantCausalUpdate = causalChain.some((entry) => {
      const active = this.#activeExecutions.get(entry.executionId);
      return active?.triggerId === entry.triggerId && active.documentUuid === documentUuidValue;
    });
    if (isReentrantCausalUpdate) {
      return this.processDocumentUpdateEvent(event, new Set(causalChain.map((entry) => entry.triggerId)), causalChain);
    }

    const previous = this.#documentQueues.get(documentUuidValue) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.processDocumentUpdateEvent(event));
    const tail = run.then(() => undefined, () => undefined);
    this.#documentQueues.set(documentUuidValue, tail);
    void tail.finally(() => {
      if (this.#documentQueues.get(documentUuidValue) === tail) this.#documentQueues.delete(documentUuidValue);
    });
    return run;
  }

  private captureCombatTurn(
    combat: any,
    changed: unknown,
    options: unknown,
    userId: string | undefined,
  ): { event: CapturedCombatTurn; report: CombatUpdateReport } | { event: undefined; report: CombatUpdateReport } {
    const combatUuidValue = combatUuid(combat) ?? `Combat.${String(combat?.id ?? 'unknown')}`;
    if (!isCombatDocument(combat)) {
      return { event: undefined, report: combatReport(combatUuidValue, undefined, 'unsupported-combat') };
    }

    const current = readCombatState(combat);
    const previous = this.#combatSnapshots.get(combatUuidValue) ?? previousCombatState(combat);
    this.#combatSnapshots.set(combatUuidValue, current);
    if (!previous) {
      return { event: undefined, report: combatReport(combatUuidValue, undefined, 'uninitialized') };
    }
    if (!current.active) {
      return { event: undefined, report: combatReport(combatUuidValue, undefined, 'inactive-combat') };
    }

    const key = combatTurnKey(combatUuidValue, current);
    if (current.round <= 0 || current.turn === null) {
      return { event: undefined, report: combatReport(combatUuidValue, key, 'empty-combat') };
    }
    if (this.#seenCombatTurnKeys.has(key)) {
      return { event: undefined, report: combatReport(combatUuidValue, key, 'duplicate') };
    }
    if (!hasCombatTurnChange(changed) || !isForwardCombatTransition(previous, current, options)) {
      return { event: undefined, report: combatReport(combatUuidValue, key, 'not-forward-turn') };
    }

    const combatant = combatantById(combat, current.combatantId) ?? combatantAt(combat, current.turn);
    if (!combatant) {
      return { event: undefined, report: combatReport(combatUuidValue, key, 'empty-combat') };
    }
    const token = combatantToken(combatant);
    const actor = combatantActor(combatant, token, this.globals);
    if (!actor) {
      return { event: undefined, report: combatReport(combatUuidValue, key, 'missing-actor') };
    }

    const actorUuid = documentUuid(actor) ?? `Actor.${String(actor?.id ?? 'unknown')}`;
    const before = cloneUnknown(this.#snapshots.get(actorUuid));
    const after = snapshotDocument(actor);
    this.#snapshots.set(actorUuid, cloneUnknown(after));
    return {
      event: {
        context: { actor, combat, combatant, token, round: current.round, turn: current.turn, key, phase: 'start', userId },
        combatUuid: combatUuidValue,
        actorUuid,
        changed: cloneUnknown(changed),
        before,
        after,
      },
      report: combatReport(combatUuidValue, key),
    };
  }

  private captureCombatTurnChange(
    combat: any,
    priorValue: unknown,
    currentValue: unknown,
  ): { events: CapturedCombatTurn[]; report: CombatUpdateReport } {
    const combatUuidValue = combatUuid(combat) ?? `Combat.${String(combat?.id ?? 'unknown')}`;
    if (!isCombatDocument(combat)) {
      return { events: [], report: combatReport(combatUuidValue, undefined, 'unsupported-combat') };
    }

    const previous = combatStateFromHistory(combat, priorValue);
    const current = combatStateFromHistory(combat, currentValue);
    this.#combatSnapshots.set(combatUuidValue, current);
    if (!current.active) {
      return { events: [], report: combatReport(combatUuidValue, undefined, 'inactive-combat') };
    }

    const key = combatTurnKey(combatUuidValue, current);
    if (!isForwardCombatTransition(previous, current, {})) {
      return { events: [], report: combatReport(combatUuidValue, key, 'not-forward-turn') };
    }

    const events: CapturedCombatTurn[] = [];
    if (previous.round > 0 && previous.turn !== null && previous.combatantId) {
      const endEvent = captureCombatPhaseEvent(combat, previous, currentValue, 'end', combatUuidValue, this.globals, this.#snapshots);
      if (endEvent && !this.#seenCombatTurnKeys.has(endEvent.context.key)) events.push(endEvent);
    }
    if (current.round > 0 && current.turn !== null && current.combatantId) {
      const startEvent = captureCombatPhaseEvent(combat, current, currentValue, 'start', combatUuidValue, this.globals, this.#snapshots);
      if (startEvent && !this.#seenCombatTurnKeys.has(startEvent.context.key)) events.push(startEvent);
      else if (!startEvent) return { events: [], report: combatReport(combatUuidValue, key, 'missing-actor') };
    }
    if (!events.length) {
      const reason = current.round <= 0 || current.turn === null ? 'empty-combat' : 'duplicate';
      return { events: [], report: combatReport(combatUuidValue, key, reason) };
    }
    return { events, report: combatReport(combatUuidValue, key) };
  }

  private async processCombatTurnEvent(event: CapturedCombatTurn): Promise<CombatUpdateReport> {
    const { context, combatUuid: combatUuidValue, actorUuid, changed, before, after } = event;
    if (!this.isActiveGM()) {
      return combatReport(combatUuidValue, context.key, 'inactive-gm');
    }

    if (context.phase !== 'end' && this.onCombatTurnStart) {
      try {
        await this.onCombatTurnStart(context);
      } catch (error) {
        this.logger.error('[fvtt-trigger-engine] combat turn-start callback failed', error);
      }
    }

    await this.emitEvent(createCombatEventContext(event));

    if (!this.isActiveGM()) return combatReport(combatUuidValue, context.key, 'inactive-gm');

    const results: TriggerExecutionResult[] = [];
    const matchedTriggerIds: string[] = [];
    for (const trigger of this.#triggers) {
      if (!this.isActiveGM()) return { combatUuid: combatUuidValue, key: context.key, matchedTriggerIds, results, skippedReason: 'inactive-gm' };
      if (!trigger.enabled || trigger.event.type !== eventTypeForCombatContext(context) || trigger.event.documentType !== 'Actor') continue;
      if (!evaluateConditionGroup(trigger.conditions, before, after)) continue;
      matchedTriggerIds.push(trigger.id);
      try {
        results.push(await this.executeTrigger(
          trigger,
          context.actor,
          actorUuid,
          before,
          after,
          changed,
          context.userId,
          [],
          context,
        ));
      } catch (error) {
        results.push({ triggerId: trigger.id, status: 'failed', actionResults: [], error });
        this.logger.error(`[fvtt-trigger-engine] trigger ${trigger.id} failed`, error);
      }
    }
    return { combatUuid: combatUuidValue, key: context.key, matchedTriggerIds, results };
  }

  private async processDocumentUpdateEvent(
    event: {
      document: any;
      changed: unknown;
      options: unknown;
      userId?: string;
      documentUuidValue: string;
      before: unknown;
      after: unknown;
      capturedModifiedTime?: number;
      preparedHp?: TriggerEventContext['preparedHp'];
    },
    suppressedTriggerIds: ReadonlySet<string> = new Set(),
    causalChain: readonly CausalExecution[] = [],
  ): Promise<DocumentUpdateReport> {
    const { document, changed, userId, documentUuidValue, before, after } = event;

    if (!isActorDocument(document)) {
      return { documentUuid: documentUuidValue, matchedTriggerIds: [], results: [], skippedReason: 'unsupported-document' };
    }
    if (!this.isActiveGM()) {
      return { documentUuid: documentUuidValue, matchedTriggerIds: [], results: [], skippedReason: 'inactive-gm' };
    }

    await this.emitEvent({
      event: { type: 'documentUpdate', documentType: 'Actor' },
      document,
      documentUuid: documentUuidValue,
      before: cloneUnknown(before),
      after: cloneUnknown(after),
      changes: cloneUnknown(changed),
      userId,
      timestamp: Date.now(),
      capturedModifiedTime: event.capturedModifiedTime,
      ...(event.preparedHp ? { preparedHp: cloneUnknown(event.preparedHp) } : {}),
    });

    if (!this.isActiveGM()) {
      return { documentUuid: documentUuidValue, matchedTriggerIds: [], results: [], skippedReason: 'inactive-gm' };
    }

    const results: TriggerExecutionResult[] = [];
    const matchedTriggerIds: string[] = [];
    for (const trigger of this.#triggers) {
      if (!this.isActiveGM()) return { documentUuid: documentUuidValue, matchedTriggerIds, results, skippedReason: 'inactive-gm' };
      if (!trigger.enabled || trigger.event.type !== 'documentUpdate' || trigger.event.documentType !== 'Actor') continue;
      if (!watchedPathsMatch(trigger.event.watchedPaths, changed)) continue;
      if (!evaluateConditionGroup(trigger.conditions, before, after)) continue;
      matchedTriggerIds.push(trigger.id);

      if (suppressedTriggerIds.has(trigger.id)) {
        results.push({ triggerId: trigger.id, status: 'skipped', actionResults: [], error: new Error('recursion guard') });
        continue;
      }
      try {
        results.push(await this.executeTrigger(trigger, document, documentUuidValue, before, after, changed, userId, causalChain));
      } catch (error) {
        // A trigger can fail without preventing later matching triggers from running.
        results.push({ triggerId: trigger.id, status: 'failed', actionResults: [], error });
        this.logger.error(`[fvtt-trigger-engine] trigger ${trigger.id} failed`, error);
      }
    }
    return { documentUuid: documentUuidValue, matchedTriggerIds, results };
  }

  isActiveGM(): boolean {
    const user = this.globals.game?.user;
    if (user?.isGM !== true || user.active === false) return false;
    const activeGM = this.globals.game?.users?.activeGM;
    if (!activeGM) return false;
    if (activeGM === user) return true;
    return user?.id !== undefined && activeGM.id !== undefined && activeGM.id === user.id;
  }

  private async publishExternalInQueue(event: ExternalEvent): Promise<ExternalEventPublishResult> {
    if (!this.isActiveGM()) throw new Error('External events are available to active GMs only.');
    await this.ensureExternalEventLedgerLoaded();
    if (!this.isActiveGM()) throw new Error('External events are available to active GMs only.');
    const key = externalEventKey(event);
    if (this.#externalEventKeys.has(key)) {
      return { status: 'duplicate', event: cloneExternalEvent(event) };
    }

    const previousEvents = this.#externalEvents;
    const previousKeys = this.#externalEventKeys;
    const nextEvents = trimExternalEvents([...previousEvents, event]);
    this.#externalEvents = nextEvents;
    this.#externalEventKeys = new Set(nextEvents.map(externalEventKey));
    try {
      if (!this.isActiveGM()) throw new Error('External events are available to active GMs only.');
      await this.saveExternalEventLedger();
    } catch (error) {
      this.#externalEvents = previousEvents;
      this.#externalEventKeys = previousKeys;
      throw error;
    }

    this.enqueueExternalEventDelivery(event);
    return { status: 'published', event: cloneExternalEvent(event) };
  }

  private async ensureExternalEventLedgerLoaded(): Promise<void> {
    if (this.#externalLedgerLoaded) return;
    await this.loadExternalEventLedger();
  }

  private async loadExternalEventLedger(): Promise<void> {
    if (this.#externalLedgerLoaded) return;
    this.#externalLedgerLoaded = true;
    if (!this.externalEventStorage) return;
    try {
      const raw = await this.externalEventStorage.load();
      const events = parseExternalEventLedger(raw);
      this.#externalEvents = events;
      this.#externalEventKeys = new Set(events.map(externalEventKey));
    } catch (error) {
      this.#externalEvents = [];
      this.#externalEventKeys.clear();
      this.logger.warn('[fvtt-trigger-engine] external event ledger load failed', error);
    }
  }

  private async saveExternalEventLedger(): Promise<void> {
    if (!this.externalEventStorage) return;
    await this.externalEventStorage.save(serializeExternalEventLedger(this.#externalEvents));
  }

  private registerExternalEventSetting(): void {
    if (this.#externalSettingRegistered || this.externalEventStorage === undefined) return;
    const settings = this.globals.game?.settings;
    if (typeof settings?.register !== 'function') return;
    this.#externalSettingRegistered = true;
    try {
      settings.register(MODULE_ID, EXTERNAL_EVENT_SETTING_KEY, {
        name: 'FVTTTRIGGER.Settings.ExternalEvents.Name',
        hint: 'FVTTTRIGGER.Settings.ExternalEvents.Hint',
        scope: 'world',
        config: false,
        type: String,
        default: serializeExternalEventLedger([]),
        onChange: (value: unknown) => { void this.handleExternalEventSettingChange(value); },
      });
    } catch (error) {
      // A second registration can occur in embedding/test environments. The
      // setting remains readable and writable when Foundry already registered it.
      this.logger.warn('[fvtt-trigger-engine] external event setting registration skipped', error);
    }
  }

  private async handleExternalEventSettingChange(raw: unknown): Promise<void> {
    const run = this.#externalLedgerQueue
      .catch(() => undefined)
      .then(async () => {
        const events = parseExternalEventLedger(raw);
        const seenBefore = this.#externalEventKeys;
        this.#externalEvents = events;
        this.#externalEventKeys = new Set(events.map(externalEventKey));
        this.#externalLedgerLoaded = true;
        for (const event of events) {
          if (seenBefore.has(externalEventKey(event))) continue;
          this.enqueueExternalEventDelivery(event);
        }
      });
    this.#externalLedgerQueue = run.then(() => undefined, () => undefined);
    await run;
  }

  private enqueueExternalEventDelivery(event: ExternalEvent): void {
    const run = this.#externalDeliveryQueue
      .catch(() => undefined)
      .then(async () => this.emitExternalEvent(event));
    this.#externalDeliveryQueue = run.then(() => undefined, () => undefined);
    void run.catch((error) => {
      this.logger.error('[fvtt-trigger-engine] external event delivery failed', error);
    });
  }

  private async emitExternalEvent(event: ExternalEvent): Promise<void> {
    const listeners = [...this.#externalEventListeners];
    for (const listener of listeners) {
      try { await listener(cloneExternalEvent(event)); }
      catch (error) { this.logger.error('[fvtt-trigger-engine] external event listener failed', error); }
    }
    try {
      this.globals.Hooks?.callAll?.('fvtt-trigger-engine.external-event', cloneExternalEvent(event));
    } catch (error) {
      this.logger.error('[fvtt-trigger-engine] external event hook failed', error);
    }
  }

  private async persist(store: TriggerStore): Promise<void> {
    const valid = validateTriggerStore(store);
    await this.storage.save(valid);
    this.applySettingValue(valid);
  }

  private async emitEvent(context: TriggerEventContext): Promise<void> {
    const listeners = [...this.#eventListeners];
    for (const listener of listeners) {
      // Subscribers may await a document write or dialog while active GM changes.
      if (!this.isActiveGM()) return;
      try { await listener(cloneEventContext(context)); }
      catch (error) { this.logger.error('[fvtt-trigger-engine] event listener failed', error); }
    }
    if (!this.isActiveGM()) return;
    this.globals.Hooks?.callAll?.('fvtt-trigger-engine.event', cloneEventContext(context));
  }

  private bindUpdateHook(): void {
    const hooks = this.globals.Hooks;
    if (typeof hooks?.on !== 'function' || this.#hookId !== undefined) return;
    const seedActor = (document: any) => {
      const uuid = documentUuid(document);
      if (uuid && isActorDocument(document) && !this.#snapshots.has(uuid)) {
        this.#snapshots.set(uuid, snapshotDocument(document));
        this.rememberPreparedHp(document, uuid);
      }
    };
    this.#snapshotHooks.push(['createActor', hooks.on('createActor', seedActor)]);
    this.#snapshotHooks.push(['createToken', hooks.on('createToken', (token: any) => seedActor(token.actor))]);
    this.#snapshotHooks.push(['preUpdateActor', hooks.on('preUpdateActor', seedActor)]);
    this.#snapshotHooks.push(['deleteActor', hooks.on('deleteActor', (document: any) => {
      const uuid = documentUuid(document);
      if (uuid) {
        this.#snapshots.delete(uuid);
        this.#preparedHpSnapshots.delete(uuid);
      }
    })]);
    for (const name of ['createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
      this.#snapshotHooks.push([name, hooks.on(name, (document: any) => {
        const parent = document?.parent;
        const actor = isActorDocument(parent) ? parent : isActorDocument(parent?.parent) ? parent.parent : undefined;
        const uuid = actor && documentUuid(actor);
        if (!uuid) return;
        const prior = (this.#snapshots.get(uuid) as any)?.system?.attributes?.hp;
        const current = (snapshotDocument(actor) as any)?.system?.attributes?.hp;
        // Embedded hooks run after parent.reset(). Preserve a pending Actor HP
        // transition when its source changed before its post-update hook.
        if (prior && current && prior.value === current.value && prior.max === current.max) this.rememberPreparedHp(actor, uuid);
      })]);
    }
    this.#hookId = hooks.on('updateActor', (document: any, changed: unknown, options: unknown, userId: string | undefined) => {
      void this.handleDocumentUpdate(document, changed, options, userId).catch((error) => {
        this.logger.error('[fvtt-trigger-engine] updateActor processing failed', error);
      });
    });
    this.#combatHookId = hooks.on('updateCombat', (combat: any) => {
      this.observeCombatUpdate(combat);
    });
    this.#combatTurnHookId = hooks.on('combatTurnChange', (combat: any, prior: unknown, current: unknown) => {
      void this.handleCombatTurnChange(combat, prior, current).catch((error) => {
        this.logger.error('[fvtt-trigger-engine] combatTurnChange processing failed', error);
      });
    });
  }

  private observeCombatUpdate(combat: any): void {
    const uuid = combatUuid(combat);
    if (uuid && isCombatDocument(combat)) this.#combatSnapshots.set(uuid, readCombatState(combat));
  }

  private rememberPreparedHp(document: any, uuid: string): void {
    const prepared = snapshotPreparedHp(document);
    if (prepared) this.#preparedHpSnapshots.set(uuid, prepared);
    else this.#preparedHpSnapshots.delete(uuid);
  }

  private actors(): any[] {
    const collection = this.globals.game?.actors;
    if (!collection) return [];
    if (typeof collection.values === 'function') return [...collection.values()];
    if (typeof collection[Symbol.iterator] === 'function') return [...collection];
    if (isRecord(collection)) return Object.values(collection);
    return [];
  }

  private combats(): any[] {
    const collection = this.globals.game?.combats;
    if (!collection) return [];
    if (typeof collection.values === 'function') return [...collection.values()];
    if (typeof collection[Symbol.iterator] === 'function') return [...collection];
    if (isRecord(collection)) return Object.values(collection);
    return [];
  }

  private async executeTrigger(
    trigger: TriggerDefinition,
    document: any,
    documentUuidValue: string,
    before: unknown,
    after: unknown,
    changed: unknown,
    userId: string | undefined,
    parentCausalChain: readonly CausalExecution[],
    combatContext?: CombatTurnContext,
  ): Promise<TriggerExecutionResult> {
    const executionId = `${trigger.id}:${documentUuidValue}:${Date.now()}:${++this.#executionSequence}`;
    const childCausalChain = [...parentCausalChain, { executionId, triggerId: trigger.id }];
    const triggerContext: TriggerContext = {
      triggerId: trigger.id,
      triggerName: trigger.name,
      event: combatContext
        ? { type: eventTypeForCombatContext(combatContext), documentType: 'Actor' }
        : { type: 'documentUpdate', documentType: 'Actor' },
      document,
      documentUuid: documentUuidValue,
      before: cloneUnknown(before),
      after: cloneUnknown(after),
      changes: cloneUnknown(changed),
      userId,
      timestamp: Date.now(),
      updateDocument: async (changes: unknown, options: unknown = {}) => {
        this.requireActiveGM();
        if (typeof document?.update !== 'function') throw new Error('Trigger document does not support update()');
        return document.update(changes, withCausalExecutions(options, childCausalChain));
      },
    };
    if (combatContext) {
      Object.assign(triggerContext, {
        combat: combatContext.combat,
        combatUuid: combatUuid(combatContext.combat),
        combatant: combatContext.combatant,
        token: combatContext.token,
        round: combatContext.round,
        turn: combatContext.turn,
        key: combatContext.key,
      });
    }
    // Keep the helper out of ordinary data enumeration/serialization while
    // still exposing it directly to script Macros as triggerContext.updateDocument.
    Object.defineProperty(triggerContext, 'updateDocument', { enumerable: false });
    const actionResults: TriggerActionResult[] = [];
    this.#activeExecutions.set(executionId, { triggerId: trigger.id, documentUuid: documentUuidValue });
    try {
      for (const [actionIndex, action] of trigger.actions.entries()) {
        await this.executeAction(action, triggerContext);
        actionResults.push({ actionIndex, status: 'executed' });
      }
      return { triggerId: trigger.id, status: 'executed', actionResults };
    } catch (error) {
      const actionIndex = actionResults.length;
      actionResults.push({ actionIndex, status: 'failed', error });
      this.reportTriggerFailure(trigger, error);
      return { triggerId: trigger.id, status: 'failed', actionResults, error };
    } finally {
      this.#activeExecutions.delete(executionId);
    }
  }

  private reportTriggerFailure(trigger: TriggerDefinition, error: unknown): void {
    this.logger.error(`[fvtt-trigger-engine] trigger ${trigger.id} failed`, error);
    const notification = this.globals.ui?.notifications?.error;
    if (typeof notification === 'function') {
      notification.call(this.globals.ui.notifications, `Trigger "${trigger.name}" failed: ${String(error)}`);
    }
  }

  private async executeAction(action: MacroAction, triggerContext: TriggerContext): Promise<void> {
    this.requireActiveGM();
    const macro = await this.resolveMacro(action.macroUuid);
    this.requireActiveGM();
    if (!isExecutableMacro(macro)) throw new Error(`Macro is unavailable or cannot execute: ${action.macroUuid}`);
    await macro.execute({ triggerContext });
  }

  private requireActiveGM(): void {
    if (!this.isActiveGM()) throw new Error('Trigger execution requires the current active GM.');
  }

  private async resolveMacro(uuid: string): Promise<any> {
    if (this.macroResolver) return this.macroResolver(uuid);
    const resolver = this.globals.foundry?.utils?.fromUuid ?? this.globals.fromUuid;
    let macro: any;
    if (typeof resolver === 'function') macro = await resolver(uuid);
    else {
      const id = uuid.split('.').at(-1);
      macro = typeof this.globals.game?.macros?.get === 'function' ? this.globals.game.macros.get(id) : undefined;
    }
    if (!macro || macro.documentName !== 'Macro' || macro.type !== 'script' || macro.canExecute !== true) {
      throw new Error(`Macro UUID is not an executable script Macro: ${uuid}`);
    }
    return macro;
  }
}

function isExecutableMacro(value: any): value is { execute: (scope: { triggerContext: TriggerContext }) => Promise<unknown> | unknown } {
  return Boolean(value && typeof value.execute === 'function');
}

function isActorDocument(document: any): boolean {
  return document?.documentName === 'Actor' || document?.constructor?.documentName === 'Actor';
}

function isCombatDocument(document: any): boolean {
  return document?.documentName === 'Combat'
    || document?.constructor?.documentName === 'Combat'
    || (isRecord(document) && ('round' in document || 'turn' in document));
}

function documentUuid(document: any): string | undefined {
  const uuid = document?.uuid;
  if (typeof uuid === 'string' && uuid) return uuid;
  const id = document?.id ?? document?._id;
  return typeof id === 'string' && id ? `Actor.${id}` : undefined;
}

function combatUuid(document: any): string | undefined {
  const uuid = document?.uuid;
  if (typeof uuid === 'string' && uuid) return uuid;
  const id = document?.id ?? document?._id;
  return typeof id === 'string' && id ? `Combat.${id}` : undefined;
}

function snapshotDocument(document: any): unknown {
  let value: unknown;
  try {
    value = typeof document?.toObject === 'function' ? document.toObject(true) : document;
  } catch {
    value = document;
  }
  return cloneUnknown(value);
}

function snapshotPreparedHp(document: any): PreparedHitPoints | undefined {
  try {
    const hp = document?.system?.attributes?.hp;
    if (typeof hp?.value !== 'number' || !Number.isFinite(hp.value) || hp.value < 0
      || typeof hp?.max !== 'number' || !Number.isFinite(hp.max) || hp.max < 0) return undefined;
    return { value: hp.value, max: hp.max };
  } catch { return undefined; }
}

function readCombatState(combat: any): CombatStateSnapshot {
  const rawRound = combat?.round ?? combat?.current?.round;
  const rawTurn = combat && 'turn' in combat ? combat.turn : combat?.current?.turn;
  const round = typeof rawRound === 'number' && Number.isFinite(rawRound) ? rawRound : 0;
  const turn = typeof rawTurn === 'number' && Number.isFinite(rawTurn) ? rawTurn : null;
  const combatant = turn === null ? undefined : combatantAt(combat, turn);
  const rawCombatantId = combatant?.id ?? combatant?._id ?? combat?.current?.combatantId;
  return {
    round,
    turn,
    combatantId: typeof rawCombatantId === 'string' && rawCombatantId ? rawCombatantId : null,
    active: combat?.active !== false && combat?.deleted !== true,
  };
}

function combatStateFromHistory(combat: any, value: unknown): CombatStateSnapshot {
  if (!isRecord(value)) {
    return { round: 0, turn: null, combatantId: null, active: false };
  }
  const round = typeof value.round === 'number' && Number.isFinite(value.round) ? value.round : 0;
  const turn = typeof value.turn === 'number' && Number.isFinite(value.turn) ? value.turn : null;
  const rawCombatantId = value.combatantId;
  return {
    round,
    turn,
    combatantId: typeof rawCombatantId === 'string' && rawCombatantId ? rawCombatantId : null,
    active: combat?.active !== false && combat?.deleted !== true,
  };
}

function previousCombatState(combat: any): CombatStateSnapshot | undefined {
  const previous = combat?.previous;
  if (!isRecord(previous)) return undefined;
  const round = previous.round;
  const rawTurn = previous.turn;
  if (typeof round !== 'number' || !Number.isFinite(round)) return undefined;
  const turn = typeof rawTurn === 'number' && Number.isFinite(rawTurn) ? rawTurn : null;
  const rawCombatantId = previous.combatantId;
  return {
    round,
    turn,
    combatantId: typeof rawCombatantId === 'string' && rawCombatantId ? rawCombatantId : null,
    active: combat?.active !== false && combat?.deleted !== true,
  };
}

function combatTurnKey(combatUuidValue: string, state: CombatStateSnapshot): string {
  return `${combatUuidValue}:${state.round}:${state.turn}`;
}

function captureCombatPhaseEvent(
  combat: any,
  state: CombatStateSnapshot,
  changed: unknown,
  phase: 'start' | 'end',
  combatUuidValue: string,
  globals: any,
  snapshots: Map<string, unknown>,
): CapturedCombatTurn | undefined {
  if (state.round <= 0 || state.turn === null || !state.combatantId) return undefined;
  const combatant = combatantById(combat, state.combatantId);
  if (!combatant) return undefined;
  const token = combatantToken(combatant);
  const actor = combatantActor(combatant, token, globals);
  if (!actor) return undefined;
  const actorUuid = documentUuid(actor) ?? `Actor.${String(actor?.id ?? 'unknown')}`;
  const keyBase = combatTurnKey(combatUuidValue, state);
  const key = phase === 'end' ? `${combatUuidValue}:end:${state.round}:${state.turn}` : keyBase;
  const after = snapshotDocument(actor);
  const before = cloneUnknown(snapshots.get(actorUuid));
  snapshots.set(actorUuid, cloneUnknown(after));
  return {
    context: {
      actor, combat, combatant, token, round: state.round, turn: state.turn,
      key, phase, userId: undefined,
    },
    combatUuid: combatUuidValue,
    actorUuid,
    changed: cloneUnknown(changed),
    before,
    after,
  };
}

function createCombatEventContext(event: CapturedCombatTurn): TriggerEventContext {
  const { context, combatUuid: combatUuidValue, actorUuid, changed, before, after } = event;
  return {
    event: {
      type: eventTypeForCombatContext(context),
      documentType: 'Actor',
    },
    document: context.actor,
    documentUuid: actorUuid,
    before: cloneUnknown(before),
    after: cloneUnknown(after),
    changes: cloneUnknown(changed),
    userId: context.userId,
    timestamp: Date.now(),
    combat: context.combat,
    combatUuid: combatUuidValue,
    combatant: context.combatant,
    token: context.token,
    round: context.round,
    turn: context.turn,
    key: context.key,
    phase: context.phase,
  };
}

function eventTypeForCombatContext(context: CombatTurnContext): 'combatTurnStart' | 'combatTurnEnd' {
  return context.phase === 'end' ? 'combatTurnEnd' : 'combatTurnStart';
}

function cloneEventContext(context: TriggerEventContext): TriggerEventContext {
  return {
    ...context,
    before: cloneUnknown(context.before),
    after: cloneUnknown(context.after),
    changes: cloneUnknown(context.changes),
    ...(context.preparedHp ? { preparedHp: cloneUnknown(context.preparedHp) } : {}),
  };
}

function hasCombatTurnChange(changed: unknown): boolean {
  return isRecord(changed) && (Object.prototype.hasOwnProperty.call(changed, 'round') || Object.prototype.hasOwnProperty.call(changed, 'turn'));
}

function isForwardCombatTransition(previous: CombatStateSnapshot, current: CombatStateSnapshot, options: unknown): boolean {
  if (!previous.active || !current.active || current.round <= 0 || current.turn === null) return false;
  if (isRecord(options)) {
    if (options.turnEvents === false) return false;
    if (typeof options.direction === 'number' && options.direction !== 1) return false;
  }
  if (current.round < previous.round) return false;
  if (current.round > previous.round) return true;
  if (previous.turn === null) return true;
  return current.turn > previous.turn;
}

function combatantById(combat: any, combatantId: string | null): any {
  if (!combatantId) return undefined;
  const collection = combat?.combatants;
  if (typeof collection?.get === 'function') return collection.get(combatantId);
  if (Array.isArray(collection)) return collection.find((entry) => entry?.id === combatantId || entry?._id === combatantId);
  if (typeof collection?.values === 'function') {
    for (const entry of collection.values()) {
      if (entry?.id === combatantId || entry?._id === combatantId) return entry;
    }
  }
  if (isRecord(collection)) return collection[combatantId];
  const turns = combat?.turns;
  if (Array.isArray(turns)) return turns.find((entry) => entry?.id === combatantId || entry?._id === combatantId);
  return undefined;
}

function combatantAt(combat: any, turn: number): any {
  if (!Number.isInteger(turn) || turn < 0) return undefined;
  const turns = combat?.turns;
  if (Array.isArray(turns)) return turns[turn];
  if (typeof turns?.at === 'function') return turns.at(turn);
  if (isRecord(turns)) return turns[turn];
  return combat?.combatant;
}

function combatantToken(combatant: any): any {
  try { return combatant?.token; } catch { return undefined; }
}

function combatantActor(combatant: any, token: any, globals: any): any {
  let actor: any;
  try { actor = combatant?.actor; } catch { actor = undefined; }
  if (actor) return actor;
  try { actor = token?.actor; } catch { actor = undefined; }
  if (actor) return actor;
  const actorId = combatant?.actorId ?? token?.actorId;
  const actors = globals?.game?.actors;
  if (typeof actors?.get === 'function' && typeof actorId === 'string') return actors.get(actorId);
  return undefined;
}

function combatReport(combatUuidValue: string, key: string | undefined, skippedReason?: CombatUpdateReport['skippedReason']): CombatUpdateReport {
  return { combatUuid: combatUuidValue, key, matchedTriggerIds: [], results: [], ...(skippedReason ? { skippedReason } : {}) };
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* test doubles may contain functions */ }
  }
  try { return JSON.parse(JSON.stringify(value)) as T; } catch { return value; }
}

function createFoundryExternalEventStorage(game: any): ExternalEventLedgerStorage | undefined {
  const settings = game?.settings;
  if (typeof settings?.get !== 'function' || typeof settings?.set !== 'function') return undefined;
  return {
    load: () => settings.get(MODULE_ID, EXTERNAL_EVENT_SETTING_KEY),
    save: (serializedLedger: string) => settings.set(MODULE_ID, EXTERNAL_EVENT_SETTING_KEY, serializedLedger),
  };
}

function validateExternalEvent(input: unknown): ExternalEvent {
  if (!isSafePlainRecord(input)) throw new TypeError('External event must be a plain data object.');
  const value = input as Record<string, unknown>;
  const allowedKeys = new Set([
    'schemaVersion', 'namespace', 'eventId', 'type', 'sourceActorUuid',
    'targetActorUuid', 'activityUuid', 'attackId', 'timestamp', 'data',
  ]);
  for (const key of safeOwnKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) throw new TypeError(`External event contains unsupported field: ${String(key)}.`);
  }

  const schemaVersion = ownValue(value, 'schemaVersion');
  if (schemaVersion !== EXTERNAL_EVENT_SCHEMA_VERSION) throw new TypeError('External event schemaVersion must be 1.');
  const namespace = readExternalIdentifier(ownValue(value, 'namespace'), 'namespace', EXTERNAL_EVENT_LIMITS.maxNamespaceOrTypeLength);
  const type = readExternalIdentifier(ownValue(value, 'type'), 'type', EXTERNAL_EVENT_LIMITS.maxNamespaceOrTypeLength);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(namespace)) throw new TypeError('External event namespace is unsafe.');
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(type)) throw new TypeError('External event type is unsafe.');

  const eventId = readExternalIdentifier(ownValue(value, 'eventId'), 'eventId');
  const sourceActorUuid = readExternalIdentifier(ownValue(value, 'sourceActorUuid'), 'sourceActorUuid');
  const targetActorUuidValue = optionalOwnValue(value, 'targetActorUuid');
  const targetActorUuid = targetActorUuidValue === undefined
    ? undefined
    : readExternalIdentifier(targetActorUuidValue, 'targetActorUuid');
  const activityUuid = readExternalIdentifier(ownValue(value, 'activityUuid'), 'activityUuid');
  const attackId = readExternalIdentifier(ownValue(value, 'attackId'), 'attackId');
  const timestamp = ownValue(value, 'timestamp');
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError('External event timestamp must be a non-negative safe integer.');
  }

  const dataValue = optionalOwnValue(value, 'data');
  const data = dataValue === undefined ? undefined : validateExternalData(dataValue);
  const normalized: ExternalEvent = {
    schemaVersion: EXTERNAL_EVENT_SCHEMA_VERSION,
    namespace,
    eventId,
    type,
    sourceActorUuid,
    ...(targetActorUuid === undefined ? {} : { targetActorUuid }),
    activityUuid,
    attackId,
    timestamp,
    ...(data === undefined ? {} : { data }),
  };
  const serialized = JSON.stringify(normalized);
  if (byteLength(serialized) > EXTERNAL_EVENT_LIMITS.maxEnvelopeBytes) {
    throw new TypeError(`External event exceeds ${EXTERNAL_EVENT_LIMITS.maxEnvelopeBytes} bytes.`);
  }
  return normalized;
}

function validateExternalData(input: unknown): ExternalEventData {
  if (!isSafePlainRecord(input)) throw new TypeError('External event data must be a plain record.');
  const data = input as Record<string, unknown>;
  const keys = safeOwnKeys(data);
  if (keys.some((key) => typeof key !== 'string')) throw new TypeError('External event data keys must be strings.');
  if (keys.length > EXTERNAL_EVENT_LIMITS.maxDataKeys) throw new TypeError(`External event data may contain at most ${EXTERNAL_EVENT_LIMITS.maxDataKeys} fields.`);

  const normalized: ExternalEventData = {};
  for (const key of keys as string[]) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError(`External event data key is unsafe: ${key}.`);
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(key) || key.length > EXTERNAL_EVENT_LIMITS.maxDataKeyLength) {
      throw new TypeError(`External event data key is unsafe: ${key}.`);
    }
    if (/(?:blind|secret|hidden|raw|roll|dice?|formula)/iu.test(key)) {
      throw new TypeError(`External event data cannot contain raw roll field: ${key}.`);
    }
    const value = ownValue(data, key);
    if (value === null || typeof value === 'boolean') {
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`External event data field is not finite: ${key}.`);
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > EXTERNAL_EVENT_LIMITS.maxDataStringLength || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError(`External event data string is unsafe or oversized: ${key}.`);
      }
      normalized[key] = value;
      continue;
    }
    throw new TypeError(`External event data must contain primitive values: ${key}.`);
  }
  return normalized;
}

function readExternalIdentifier(value: unknown, path: string, maxLength: number = EXTERNAL_EVENT_LIMITS.maxIdentifierLength): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`External event ${path} must be a non-empty bounded string.`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`External event ${path} contains unsafe control characters.`);
  return value;
}

function parseExternalEventLedger(raw: unknown): ExternalEvent[] {
  let candidate = raw;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) as unknown; }
    catch { return []; }
  }
  if (!isSafePlainRecord(candidate)) return [];
  try {
    if (ownValue(candidate, 'schemaVersion') !== EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION) return [];
    const rawEvents = ownValue(candidate, 'events');
    if (!Array.isArray(rawEvents)) return [];

    const byKey = new Map<string, ExternalEvent>();
    for (const rawEvent of rawEvents) {
      try {
        const event = validateExternalEvent(rawEvent);
        const key = externalEventKey(event);
        byKey.delete(key);
        byKey.set(key, event);
      } catch {
        // World settings are untrusted input; invalid ledger entries are ignored.
      }
    }
    return trimExternalEvents([...byKey.values()]);
  } catch {
    return [];
  }
}

function serializeExternalEventLedger(events: readonly ExternalEvent[]): string {
  const bounded = trimExternalEvents(events);
  return JSON.stringify({ schemaVersion: EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION, events: bounded });
}

function trimExternalEvents(events: readonly ExternalEvent[]): ExternalEvent[] {
  const bounded = events.slice(-EXTERNAL_EVENT_LIMITS.maxLedgerEntries).map(cloneExternalEvent);
  while (bounded.length > 0 && byteLength(JSON.stringify({ schemaVersion: EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION, events: bounded })) > EXTERNAL_EVENT_LIMITS.maxLedgerBytes) {
    bounded.shift();
  }
  return bounded;
}

function cloneExternalEvent(event: ExternalEvent): ExternalEvent {
  return JSON.parse(JSON.stringify(event)) as ExternalEvent;
}

function externalEventKey(event: ExternalEvent): string {
  return `${event.namespace}\u001f${event.eventId}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeOwnKeys(value: object): (string | symbol)[] {
  try { return Reflect.ownKeys(value); }
  catch { throw new TypeError('External event contains an unreadable object.'); }
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor)) throw new TypeError(`External event field must be a data property: ${key}.`);
  return descriptor.value;
}

function optionalOwnValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new TypeError(`External event field must be a data property: ${key}.`);
  return descriptor.value;
}

function isSafePlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeOptions(value: unknown): value is TriggerEngineRuntimeOptions {
  if (!isRecord(value)) return false;
  return 'globals' in value || 'storage' in value || 'externalEventStorage' in value
    || 'macroResolver' in value || 'logger' in value || 'onCombatTurnStart' in value;
}

const CAUSAL_OPTION_KEY = 'fvtt-trigger-engine' as const;

interface CausalExecution {
  executionId: string;
  triggerId: string;
}

function causalExecutions(options: unknown): CausalExecution[] {
  if (!isRecord(options)) return [];
  const marker = options[CAUSAL_OPTION_KEY];
  if (!isRecord(marker) || !Array.isArray(marker.chain)) return [];
  return marker.chain.flatMap((entry): CausalExecution[] => {
    if (!isRecord(entry) || typeof entry.executionId !== 'string' || typeof entry.triggerId !== 'string') return [];
    return [{ executionId: entry.executionId, triggerId: entry.triggerId }];
  });
}

function withCausalExecutions(options: unknown, chain: readonly CausalExecution[]): Record<string, unknown> {
  const next = isRecord(options) ? { ...options } : {};
  next[CAUSAL_OPTION_KEY] = {
    ...(isRecord(next[CAUSAL_OPTION_KEY]) ? next[CAUSAL_OPTION_KEY] : {}),
    chain: chain.map((entry) => ({ ...entry })),
  };
  return next;
}

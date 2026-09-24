import { AUTOMATION_SOURCES, INJURY_STATUS_ID, MAX_INJURY_STACKS, MODULE_ID, SETTINGS, SOCKET_NAME, TRIGGER_ENGINE_MODULE_ID, type AutomationSource } from './constants.ts';
import { applyNineteenCritical, retainedD20Face, setInjuryStacks, transitionInjury, type InjuryAction } from './injury.ts';
import { activeGmId, actorHp, isActiveGmWriter, isManagedActor, readActorState, writeActorState } from './persistence.ts';
import { decorateInjuryTokenActionHud, decorateInjuryTokenHud, nextInjuryStacks, projectInjuryStatus, registerInjuryStatus, statusPresentation } from './projection.ts';
import { createActorModuleState } from './state.ts';
import { activateChatCard, openActorDashboard, openResurrectionWizard } from './ui.ts';

export interface HpSnapshot { value: number; max: number }

export interface HpTransitionTriggerContext {
  triggerId: string;
  triggerName: string;
  event: { type: 'documentUpdate'; documentType: 'Actor' };
  document: unknown;
  documentUuid: string;
  documentName?: string;
  documentType?: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  userId: string | undefined;
  timestamp: number;
  transactionId?: string;
  eventId?: string;
  at?: number;
  occurredAt?: number;
  [key: string]: unknown;
}

export interface TriggerEventContextLike {
  triggerId?: unknown;
  triggerName?: unknown;
  event?: { type?: unknown; documentType?: unknown };
  document?: unknown;
  documentUuid?: unknown;
  before?: unknown;
  after?: unknown;
  changes?: unknown;
  userId?: unknown;
  timestamp?: unknown;
  [key: string]: unknown;
}

interface ValidatedHpTransition {
  before: HpSnapshot;
  after: HpSnapshot;
  transactionId: string;
  at: number;
}

interface ResurrectionPromptRequest {
  actor: any;
  episodeId: string;
}

export class InjuryFadingRuntime {
  readonly hpSnapshots = new Map<string, HpSnapshot>();
  supported = false;
  private externalTriggerEngineWarningShown = false;
  private triggerEngineUnsubscribe: (() => void) | undefined;
  private triggerEngineReadyHook: unknown;
  private readonly triggerEventQueues = new Map<string, Promise<void>>();
  private readonly actorStateQueues = new Map<string, Promise<unknown>>();
  private readonly resurrectionPromptInFlight = new Set<string>();

  constructor() {
    this.triggerEngineReadyHook = undefined;
  }

  initialize(): void {
    registerSettings();
    Hooks.on('ready', () => { void this.onReady(); });
    Hooks.on('canvasReady', () => { void this.onCanvasReady(); });
    Hooks.on('preUpdateActor', (actor: any, changes: Record<string, unknown>, options: Record<string, any>) => {
      this.onPreUpdateActor(actor, changes, options);
    });
    Hooks.on('updateActor', (actor: any, changes: Record<string, unknown>, options: Record<string, any>, userId: string) => {
      void this.onUpdateActor(actor, changes, options, userId);
    });
    Hooks.on('dnd5e.rollDeathSave', (rolls: any[], details: Record<string, unknown>) => this.onDeathSave(rolls, details));
    Hooks.on('dnd5e.restCompleted', (actor: any, result: any, config: any) => { void this.onRestCompleted(actor, result, config); });
    Hooks.on('renderChatMessageHTML', (message: any, html: any) => activateChatCard(message, html));
    Hooks.on('dnd5e.renderChatMessage', (message: any, html: any) => activateChatCard(message, html));
    Hooks.on('createActiveEffect', (effect: any) => this.onActiveEffectDeath(effect));
    Hooks.on('updateActiveEffect', (effect: any) => this.onActiveEffectDeath(effect));
    Hooks.on('deleteActiveEffect', (effect: any, options: Record<string, any>) => { void this.onDeleteEffect(effect, options); });
    Hooks.on('getActorDirectoryEntryContext', (_html: unknown, entries: any[]) => this.addActorContext(entries));
    Hooks.on('chatMessage', (_log: unknown, text: string) => this.onChatCommand(text));
    Hooks.on('renderTokenHUD', (app: any, html: any) => decorateInjuryTokenHud(app, html));
    Hooks.on('tokenActionHudCorePreRender', (hud: any, hudManager: any) => decorateInjuryTokenActionHud(hud, hudManager));
    this.triggerEngineReadyHook = Hooks.on('fvtt-trigger-engine.ready', () => this.connectTriggerEngine());
    const documentRef = (globalThis as any).document;
    documentRef?.addEventListener?.('click', (event: any) => this.onClickTokenHud(event), { capture: true });
    documentRef?.addEventListener?.('contextmenu', (event: any) => this.onClickTokenHud(event), { capture: true });
    documentRef?.addEventListener?.('auxclick', (event: any) => this.onClickTokenHud(event), { capture: true });
  }

  async onReady(): Promise<void> {
    this.supported = game.version === '14.364' && game.system?.id === 'dnd5e' && game.system?.version === '5.3.3';
    if (!this.supported) {
      if (game.user?.isGM) ui.notifications.error(game.i18n.localize('IFS.Errors.UnsupportedRuntime'));
      return;
    }
    registerInjuryStatus();
    game.socket.on(SOCKET_NAME, (payload: unknown, senderId: string) => { void this.onSocket(payload, senderId); });
    await this.reconcileActors(allLoadedActors());
    if (isActiveGmWriter()) await firstRunSetup();
    this.warnIfExternalTriggerEngineUnavailable();
    this.connectTriggerEngine();
  }

  async onCanvasReady(): Promise<void> {
    if (!this.supported) return;
    registerInjuryStatus();
    await this.reconcileActors(canvasTokens().map((token) => token.actor).filter(Boolean));
  }

  async reconcileActors(actors: any[]): Promise<void> {
    const unique = new Map<string, any>();
    for (const actor of actors) if (actor?.uuid) unique.set(actor.uuid, actor);
    for (const actor of unique.values()) {
      this.rememberHp(actor);
      if (!isActiveGmWriter() || !isManagedActor(actor) || !actor.flags?.[MODULE_ID]) continue;
      try {
        const rawStacks = actor.flags[MODULE_ID]?.injury?.stacks;
        const state = readActorState(actor);
        if (rawStacks !== state.injury.stacks) {
          await writeActorState(actor, state, `normalize-injury:${actor.uuid}:${Date.now()}`);
        }
        await projectInjuryStatus(actor, state.injury.stacks);
      } catch (error) {
        warnError(error);
      }
    }
  }

  onDeathSave(rolls: any[], details: Record<string, unknown>): void {
    if (!this.supported || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true) return;
    const face = retainedD20Face(rolls?.[0]);
    applyNineteenCritical(details, face);
  }

  onPreUpdateActor(actor: any, changes: Record<string, unknown>, options: Record<string, any>): void {
    if (!this.supported || options?.[MODULE_ID]?.internal === true || !actor?.uuid) return;
    if (hasChange(changes, 'system.attributes.hp.value') || hasChange(changes, 'system.attributes.hp.max')) {
      this.hpSnapshots.set(actor.uuid, actorHp(actor));
    }
  }

  async onUpdateActor(actor: any, changes: Record<string, unknown>, options: Record<string, any>, userId: string): Promise<void> {
    if (!this.supported) return;
    const current = actorHp(actor);
    const previous = this.hpSnapshots.get(actor.uuid) ?? {
      value: Number(actor?.flags?.[MODULE_ID]?.injury?.lastObservedHp ?? current.value),
      max: Number(actor?.flags?.[MODULE_ID]?.injury?.lastObservedMax ?? current.max),
    };
    this.hpSnapshots.set(actor.uuid, current);
    if (options?.[MODULE_ID]?.internal === true) return;
    if (isExternalAutomationSource()) {
      this.warnIfExternalTriggerEngineUnavailable();
      return;
    }
    if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;

    const valueChanged = hasChange(changes, 'system.attributes.hp.value') && previous.value !== current.value;
    const maxChanged = hasChange(changes, 'system.attributes.hp.max') && previous.max !== current.max;
    if (!valueChanged && !maxChanged) return;
    const tx = transactionId(actor, userId, previous, current, changes, valueChanged ? 'hp' : 'max-observe');
    await this.enqueueActorStateOperation(actor, async () => {
      if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
      try {
        await this.applyHpTransition(actor, previous, current, tx, modifiedTime(actor));
      } catch (error) {
        warnError(error);
      }
    });
  }

  /**
   * Process one HP transition delivered by the optional external Trigger
   * Engine. The before/after snapshots in the context are authoritative: the
   * current Actor document may already have moved on by the time this runs.
   */
  async processHpTransition(actor: any, triggerContext: HpTransitionTriggerContext): Promise<void> {
    if (!this.supported || !isExternalAutomationSource()) return;
    this.warnIfExternalTriggerEngineUnavailable();

    const validated = validateHpTransitionContext(actor, triggerContext);
    if (!validated) return;

    await this.enqueueActorStateOperation(actor, async () => {
      // Keep the local observation current for GM hand-off, source changes, and
      // later max-only updates even when this client cannot write state.
      this.hpSnapshots.set(actor.uuid, validated.after);
      if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
      try {
        await this.applyHpTransition(actor, validated.before, validated.after, validated.transactionId, validated.at);
      } catch (error) {
        warnError(error);
      }
    });
  }

  /** Consume the Trigger Engine's public generic Actor update subscription. */
  async handleTriggerEvent(context: unknown): Promise<void> {
    if (!this.supported || !isActiveGmWriter() || !isRecord(context) || !isRecord(context.event)
      || context.event.type !== 'documentUpdate' || context.event.documentType !== 'Actor') return;
    const actor = context.document;
    if (!actor || actor.documentName !== 'Actor' || typeof actor.uuid !== 'string') return;
    if (game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
    const before = readTriggerHp(context.before);
    const after = readTriggerHp(context.after);
    if (!before || !after || context.documentUuid !== actor.uuid) return;

    const triggerContext = enrichTriggerEventContext(actor, context, before, after);
    if (isExternalAutomationSource()) await this.processHpTransition(actor, triggerContext);
    if (resurrectionPromptEnabled()) {
      // Commit the episode marker while the Trigger Engine's per-Actor queue is held;
      // only the human-facing Dialog is allowed to run after the queue advances.
      const prompt = await this.prepareResurrectionPrompt(actor, context.before, context.after);
      if (prompt) void this.showResurrectionPrompt(prompt).catch(warnError);
    }
  }

  async onRestCompleted(actor: any, result: any, config: any): Promise<void> {
    if (!this.supported || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
    const restType = result?.type === 'long' || config?.type === 'long' ? 'long' : 'short';
    const messageId = result?.message?.id ?? null;
    if (isActiveGmWriter()) {
      const tx = `rest:${actor.uuid}:${messageId ?? modifiedTime(actor)}:${restType}`;
      return this.applySuccessfulRest(actor, restType, tx);
    }
    if (typeof messageId !== 'string') return;
    game.socket.emit(SOCKET_NAME, { type: 'restCompleted', actorUuid: actor.uuid, restType, messageId, requesterId: game.user.id });
  }

  async applySuccessfulRest(actor: any, restType: 'short' | 'long', transactionIdValue: string): Promise<void> {
    if (!isActiveGmWriter()) return;
    const state = readActorState(actor);
    const result = transitionInjury(state.injury, state.fadingSpirits, {
      kind: 'rest', transactionId: transactionIdValue, at: Date.now(), restType,
    });
    if (result.duplicate) return;
    state.injury = result.injury;
    state.fadingSpirits = result.fading;
    await writeActorState(actor, state, transactionIdValue);
    await projectInjuryStatus(actor, 0);
  }

  async setInjury(actor: any, stacks: number, reason: string): Promise<void> {
    if (!Number.isInteger(stacks) || stacks < 0 || stacks > MAX_INJURY_STACKS) throw new Error(`Injury stacks must be an integer from 0 to ${MAX_INJURY_STACKS}.`);
    if (isActiveGmWriter()) {
      const state = readActorState(actor);
      state.injury = setInjuryStacks(state.injury, stacks);
      const tx = `manual:${actor.uuid}:${game.user.id}:${Date.now()}`;
      await writeActorState(actor, state, tx);
      await projectInjuryStatus(actor, state.injury.stacks);
      return;
    }
    if (!activeGmId()) throw new Error('No active GM is available; no state was changed.');
    game.socket.emit(SOCKET_NAME, {
      type: 'setInjury', actorUuid: actor.uuid, stacks, reason: String(reason).slice(0, 200),
      requesterId: game.user.id, transactionId: `request:${actor.uuid}:${game.user.id}:${Date.now()}`,
    });
  }

  async withInjurySuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T): Promise<T> {
    if (!isActiveGmWriter()) throw new Error('Resurrection suppression must be started by the active GM.');
    const tx = `suppression:${actor.uuid}:${game.user.id}:${Date.now()}`;
    let state = readActorState(actor);
    state.injury.suppressNextRecovery = { transactionId: tx, reason: String(reason).slice(0, 200) };
    await writeActorState(actor, state, `${tx}:begin`);
    try {
      return await callback();
    } finally {
      state = readActorState(actor);
      if (state.injury.suppressNextRecovery?.transactionId === tx) {
        state.injury.suppressNextRecovery = null;
        await writeActorState(actor, state, `${tx}:end`);
      }
    }
  }

  async onSocket(payload: unknown, senderId?: unknown): Promise<void> {
    if (!this.supported || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isActiveGmWriter() || !isRecord(payload)) return;
    if (typeof senderId !== 'string' || payload.requesterId !== senderId) return;
    const requester = game.users.get(senderId);
    const actor = typeof payload.actorUuid === 'string' ? await fromUuid(payload.actorUuid) : null;
    if (!requester?.active || !actor || actor.documentName !== 'Actor' || actor.pack || actor.inCompendium
      || actor.isOwner === false || typeof actor.update !== 'function' || !isManagedActor(actor)
      || typeof actor.testUserPermission !== 'function' || !actor.testUserPermission(requester, 'OWNER')) return;
    if (payload.type === 'setInjury') {
      const stacks = Number(payload.stacks);
      if (!Number.isInteger(stacks) || stacks < 0 || stacks > MAX_INJURY_STACKS) return;
      await this.setInjury(actor, stacks, String(payload.reason ?? 'player request'));
    } else if (payload.type === 'restCompleted') {
      if (payload.restType !== 'short' && payload.restType !== 'long') return;
      const message = typeof payload.messageId === 'string' ? game.messages.get(payload.messageId) : null;
      if (!isNativeRestMessage(message, actor, payload.restType)) return;
      const transaction = `rest:${actor.uuid}:${message.id}:${payload.restType}`;
      await this.applySuccessfulRest(actor, payload.restType, transaction);
    }
  }

  async onDeleteEffect(effect: any, options: Record<string, any>): Promise<void> {
    if (!this.supported || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || options?.[MODULE_ID]?.projection || !isActiveGmWriter()) return;
    const owned = effect?.statuses?.has?.(INJURY_STATUS_ID) || effect?.flags?.[MODULE_ID]?.injuryProjection === true;
    if (!owned || !effect.parent) return;
    const stacks = readActorState(effect.parent).injury.stacks;
    if (stacks > 0) queueMicrotask(() => { void projectInjuryStatus(effect.parent, stacks); });
  }

  onActiveEffectDeath(effect: any): void {
    if (!this.supported || !isActiveGmWriter() || !hasDeadStatus(effect) || effect?.parent?.documentName !== 'Actor') return;
    void this.maybePromptResurrectionFromStatus(effect.parent).catch(warnError);
  }

  addActorContext(entries: any[]): void {
    entries.push({
      name: game.i18n.localize('IFS.Title'), icon: '<i class="fa-solid fa-heart-crack"></i>',
      condition: () => game.user?.isGM === true,
      callback: (entry: any) => {
        const element = entry?.[0] ?? entry;
        const id = element?.dataset?.documentId ?? element?.dataset?.entryId;
        const actor = game.actors.get(id);
        if (actor) void openActorDashboard(actor);
      },
    });
  }

  onChatCommand(text: string): boolean | void {
    if (String(text).trim().toLocaleLowerCase() !== '/ifs') return;
    if (!game.user?.isGM) return false;
    const actor = canvasTokens().find((token) => token.controlled)?.actor;
    if (!actor) ui.notifications.warn(game.i18n.localize('IFS.Messages.SelectTokenForCommand'));
    else void openActorDashboard(actor);
    return false;
  }

  onClickTokenHud(event: any): void {
    const target = event?.target?.closest?.(`.effect-control[data-status-id="${INJURY_STATUS_ID}"]`)
      ?? (event?.target?.classList?.contains?.('effect-control') && event?.target?.dataset?.statusId === INJURY_STATUS_ID ? event.target : null);
    if (!target) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event.type === 'contextmenu') return;
    const actor = (globalThis as any).canvas?.hud?.token?.object?.actor;
    if (!actor || !this.supported || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
    const isIncrease = event.type === 'click' && event.button === 0;
    const isDecrease = event.type === 'auxclick' && event.button === 2;
    if (!isIncrease && !isDecrease) return;
    try {
      const current = readActorState(actor).injury.stacks;
      const next = nextInjuryStacks(current, event.button);
      if (next === current) return;
      const operation = this.setInjury(actor, next, 'token-hud');
      if (isActiveGmWriter()) {
        void operation.then(() => decorateInjuryTokenHud({ object: { actor } }, { querySelector: () => target })).catch(warnError);
      } else void operation.catch(warnError);
    } catch (error) {
      warnError(error);
    }
  }

  private connectTriggerEngine(): void {
    if (!this.supported) return;
    if (game.settings.get(MODULE_ID, SETTINGS.enabled) !== true) return;
    const shouldSubscribe = isExternalAutomationSource() || resurrectionPromptEnabled();
    if (!shouldSubscribe || this.triggerEngineUnsubscribe) return;
    const triggerModule = game.modules?.get?.(TRIGGER_ENGINE_MODULE_ID);
    const api = triggerModule?.active === true ? triggerModule.api : undefined;
    if (!api || typeof api.subscribe !== 'function') {
      this.warnIfExternalTriggerEngineUnavailable();
      return;
    }
    try {
      this.triggerEngineUnsubscribe = api.subscribe((context: unknown) => this.enqueueTriggerEvent(context));
    } catch (error) {
      // The public API is exposed during init and becomes usable at ready.
      // The module-owned ready hook retries without importing Trigger Engine internals.
      if (!String(error).includes('not ready')) warnError(error);
      this.warnIfExternalTriggerEngineUnavailable();
    }
  }

  reconnectTriggerEngine(): void {
    const shouldSubscribe = this.supported && game.settings.get(MODULE_ID, SETTINGS.enabled) === true
      && (isExternalAutomationSource() || resurrectionPromptEnabled());
    if (!shouldSubscribe && this.triggerEngineUnsubscribe) {
      try { this.triggerEngineUnsubscribe(); } catch { /* a stale module API cannot block settings changes */ }
      this.triggerEngineUnsubscribe = undefined;
      this.triggerEventQueues.clear();
    }
    if (shouldSubscribe) this.connectTriggerEngine();
  }

  private enqueueTriggerEvent(context: unknown): Promise<void> {
    const record = isRecord(context) ? context : null;
    const actorUuid = typeof record?.documentUuid === 'string'
      ? record.documentUuid
      : isRecord(record?.document) && typeof record.document.uuid === 'string' ? record.document.uuid : null;
    if (!actorUuid) return Promise.resolve();
    const previous = this.triggerEventQueues.get(actorUuid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.handleTriggerEvent(context));
    const tail = run.then(() => undefined, () => undefined);
    this.triggerEventQueues.set(actorUuid, tail);
    void tail.finally(() => {
      if (this.triggerEventQueues.get(actorUuid) === tail) this.triggerEventQueues.delete(actorUuid);
    });
    return run;
  }

  private enqueueActorStateOperation<T>(actor: any, operation: () => Promise<T>): Promise<T> {
    const actorUuid = typeof actor?.uuid === 'string' ? actor.uuid : '';
    if (!actorUuid) return operation();
    const previous = this.actorStateQueues.get(actorUuid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation) as Promise<T>;
    const tail = run.then(() => undefined, () => undefined);
    this.actorStateQueues.set(actorUuid, tail);
    void tail.finally(() => {
      if (this.actorStateQueues.get(actorUuid) === tail) this.actorStateQueues.delete(actorUuid);
    });
    return run;
  }

  private async maybePromptResurrection(actor: any, beforeRaw: unknown, afterRaw: unknown): Promise<void> {
    const prompt = await this.prepareResurrectionPrompt(actor, beforeRaw, afterRaw);
    if (prompt) await this.showResurrectionPrompt(prompt);
  }

  private async maybePromptResurrectionFromStatus(actor: any): Promise<void> {
    if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;
    const state = readActorState(actor);
    const episodeId = state.injury.episode.id;
    if (!state.injury.episode.open || !episodeId || state.fadingSpirits.currentDeathEpisodeId !== episodeId) return;
    if (state.fadingSpirits.resurrectionConsumedForCurrentDeath || state.fadingSpirits.pendingRitual
      || state.fadingSpirits.resurrectionPromptedForDeathEpisodeId === episodeId) return;
    if (actorHp(actor).value > 0 || !explicitDeathConfirmed(actor)) return;
    const prompt = await this.prepareResurrectionPrompt(actor, actor, actor, false);
    if (prompt) await this.showResurrectionPrompt(prompt);
  }

  private async prepareResurrectionPrompt(actor: any, beforeRaw: unknown, afterRaw: unknown, requireEntry = true): Promise<ResurrectionPromptRequest | null> {
    if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !resurrectionPromptEnabled() || !isManagedActor(actor)) return null;
    const before = readTriggerHp(beforeRaw);
    const after = readTriggerHp(afterRaw);
    if (!before || !after || after.value > 0 || (requireEntry && !enteredExplicitDeath(beforeRaw, afterRaw, before, after))) return null;
    const initialState = readActorState(actor);
    const episodeId = initialState.injury.episode.id;
    if (!initialState.injury.episode.open || !episodeId || initialState.fadingSpirits.currentDeathEpisodeId !== episodeId) return null;

    const promptKey = `${actor.uuid}:${episodeId}`;
    if (this.resurrectionPromptInFlight.has(promptKey)) return null;
    this.resurrectionPromptInFlight.add(promptKey);
    try {
      const committedEpisodeId = await this.enqueueActorStateOperation(actor, async () => {
        if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true
          || !resurrectionPromptEnabled() || !isManagedActor(actor)) return null;
        const state = readActorState(actor);
        const currentEpisodeId = state.injury.episode.id;
        if (!state.injury.episode.open || currentEpisodeId !== episodeId
          || state.fadingSpirits.currentDeathEpisodeId !== currentEpisodeId
          || state.fadingSpirits.resurrectionConsumedForCurrentDeath || state.fadingSpirits.pendingRitual
          || state.fadingSpirits.resurrectionPromptedForDeathEpisodeId === currentEpisodeId
          || actorHp(actor).value > 0 || !explicitDeathConfirmed(actor)) return null;
        await actor.update({
          [`flags.${MODULE_ID}.fadingSpirits.resurrectionPromptedForDeathEpisodeId`]: currentEpisodeId,
        }, {
          [MODULE_ID]: { internal: true, transactionId: `resurrection-prompt:${promptKey}` },
        });
        return currentEpisodeId;
      });
      if (!committedEpisodeId) {
        this.resurrectionPromptInFlight.delete(promptKey);
        return null;
      }
      return { actor, episodeId: committedEpisodeId };
    } catch (error) {
      this.resurrectionPromptInFlight.delete(promptKey);
      throw error;
    }
  }

  private async showResurrectionPrompt(prompt: ResurrectionPromptRequest): Promise<void> {
    const { actor, episodeId } = prompt;
    const promptKey = `${actor.uuid}:${episodeId}`;
    try {
      if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !resurrectionPromptEnabled() || !isManagedActor(actor)) return;
      const beforeDialog = readActorState(actor);
      const beforeDialogHp = actorHp(actor);
      if (beforeDialogHp.value > 0 || !beforeDialog.injury.episode.open || beforeDialog.injury.episode.id !== episodeId
        || beforeDialog.fadingSpirits.currentDeathEpisodeId !== episodeId
        || beforeDialog.fadingSpirits.resurrectionConsumedForCurrentDeath || beforeDialog.fadingSpirits.pendingRitual
        || beforeDialog.fadingSpirits.resurrectionPromptedForDeathEpisodeId !== episodeId
        || !explicitDeathConfirmed(actor)) return;
      const dialog = foundry?.applications?.api?.DialogV2;
      if (!dialog?.wait) return;
      const result = await dialog.wait({
        window: { title: localizeText('IFS.Messages.ResurrectionPrompt.Title', 'The soul is fading') },
        modal: true,
        rejectClose: false,
        content: `<p>${escapeHtml(formatText('IFS.Messages.ResurrectionPrompt.Content', { actor: actor.name }, `${String(actor.name ?? 'This actor')} has clearly died at 0 HP. Open the Fading Spirits resurrection wizard for GM review? No roll will begin until you choose a ritual and resolve it.`))}</p>`,
        buttons: [
          { action: 'open', label: 'IFS.Messages.ResurrectionPrompt.Open', callback: () => true },
          { action: 'skip', label: 'IFS.Messages.ResurrectionPrompt.Skip', callback: () => false },
        ],
      });
      if (!(result === true || (isRecord(result) && result.action === 'open'))) return;
      if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !resurrectionPromptEnabled() || !isManagedActor(actor)) return;
      const latest = readActorState(actor);
      const latestHp = actorHp(actor);
      if (latestHp.value > 0 || !latest.injury.episode.open || latest.injury.episode.id !== episodeId
        || latest.fadingSpirits.currentDeathEpisodeId !== episodeId
        || latest.fadingSpirits.resurrectionConsumedForCurrentDeath || latest.fadingSpirits.pendingRitual
        || latest.fadingSpirits.resurrectionPromptedForDeathEpisodeId !== episodeId
        || !explicitDeathConfirmed(actor)) return;
      await openResurrectionWizard(actor);
    } catch (error) {
      throw error;
    } finally {
      this.resurrectionPromptInFlight.delete(promptKey);
    }
  }

  private async applyHpTransition(actor: any, previous: HpSnapshot, current: HpSnapshot, tx: string, at: number): Promise<void> {
    const valueChanged = previous.value !== current.value;
    const maxChanged = previous.max !== current.max;
    if (!valueChanged && !maxChanged) return;

    const rawExists = actor.flags?.[MODULE_ID]?.schemaVersion !== undefined;
    const state = rawExists ? readActorState(actor) : createActorModuleState(previous.value, previous.max);
    if (!valueChanged) {
      state.injury.lastObservedHp = current.value;
      state.injury.lastObservedMax = current.max;
      await writeActorState(actor, state, tx);
      return;
    }

    const result = transitionInjury(state.injury, state.fadingSpirits, {
      kind: 'hp', transactionId: tx, at,
      oldValue: previous.value, newValue: current.value, oldMax: previous.max, newMax: current.max,
    });
    if (result.duplicate) return;
    state.injury = result.injury;
    state.fadingSpirits = result.fading;
    const extra: Record<string, unknown> = {};
    const failures = result.actions.find((action): action is Extract<InjuryAction, { type: 'setDeathFailures' }> => action.type === 'setDeathFailures');
    if (failures) extra['system.attributes.death.failure'] = failures.failures;
    await writeActorState(actor, state, tx, extra);
    await projectInjuryStatus(actor, state.injury.stacks);
    for (const action of result.actions) {
      if (action.type === 'promptThreeStackDecision') {
        // The GM decision must not hold Trigger Engine's per-Actor queue while
        // the dialog is open. The dialog handler rechecks the current episode
        // and HP before it commits any death ruling.
        void this.handleInjuryAction(actor, action).catch(warnError);
      } else await this.handleInjuryAction(actor, action);
    }
  }

  private warnIfExternalTriggerEngineUnavailable(): void {
    if (!isExternalAutomationSource() || !isActiveGmWriter()) return;
    if (isTriggerEngineAvailable()) {
      this.externalTriggerEngineWarningShown = false;
      return;
    }
    if (this.externalTriggerEngineWarningShown) return;
    this.externalTriggerEngineWarningShown = true;
    notify('warn', 'IFS.Errors.TriggerEngineUnavailable');
  }

  private rememberHp(actor: any): void {
    if (actor?.uuid) this.hpSnapshots.set(actor.uuid, actorHp(actor));
  }

  private async handleInjuryAction(actor: any, action: InjuryAction): Promise<void> {
    if (action.type === 'promptThreeStackDecision') await promptThreeStackDecision(actor, action.stacks, action.episodeId);
    else if (action.type === 'injuryAdded') ui.notifications.info(`${actor.name}: ${statusPresentation().name} ${action.stacks}`);
    else if (action.type === 'injuryCleared') ui.notifications.info(`${actor.name}: ${game.i18n.localize('IFS.Messages.InjuryCleared')}`);
  }
}

export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: 'IFS.Settings.Enabled.Name', hint: 'IFS.Settings.Enabled.Hint', scope: 'world', config: true, type: Boolean, default: false,
    onChange: () => runtime.reconnectTriggerEngine(),
  });
  game.settings.register(MODULE_ID, SETTINGS.automationSource, {
    name: 'IFS.Settings.AutomationSource.Name', hint: 'IFS.Settings.AutomationSource.Hint', scope: 'world', config: true,
    type: String, choices: {
      [AUTOMATION_SOURCES.internalHooks]: 'IFS.Settings.AutomationSource.Internal',
      [AUTOMATION_SOURCES.externalTriggerEngine]: 'IFS.Settings.AutomationSource.External',
    }, default: AUTOMATION_SOURCES.internalHooks, onChange: () => runtime.reconnectTriggerEngine(),
  });
  game.settings.register(MODULE_ID, SETTINGS.resurrectionPrompt, {
    name: 'IFS.Settings.ResurrectionPrompt.Name', hint: 'IFS.Settings.ResurrectionPrompt.Hint', scope: 'world', config: true, type: Boolean, default: true,
    onChange: () => runtime.reconnectTriggerEngine(),
  });
  game.settings.register(MODULE_ID, SETTINGS.manageNpcs, {
    name: 'IFS.Settings.ManageNpcs.Name', hint: 'IFS.Settings.ManageNpcs.Hint', scope: 'world', config: true, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.setupComplete, {
    name: 'IFS.Settings.SetupComplete.Name', scope: 'world', config: false, type: Boolean, default: false,
  });
}

async function firstRunSetup(): Promise<void> {
  if (game.settings.get(MODULE_ID, SETTINGS.setupComplete) === true) return;
  const dialog = foundry.applications.api.DialogV2;
  const result = await dialog.wait({
    window: { title: game.i18n.localize('IFS.FirstRun.Title') }, modal: true, rejectClose: false,
    content: `<p>${game.i18n.localize('IFS.FirstRun.Content')}</p>`,
    buttons: [
      { action: 'enable', label: 'IFS.FirstRun.Enable', callback: () => true },
      { action: 'keepOff', label: 'IFS.FirstRun.KeepDisabled', callback: () => false },
    ],
  });
  if (result === true) await game.settings.set(MODULE_ID, SETTINGS.enabled, true);
  await game.settings.set(MODULE_ID, SETTINGS.setupComplete, true);
}

async function promptThreeStackDecision(actor: any, stacks: number, episodeId: string): Promise<void> {
  if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor) || actorHp(actor).value > 0) return;
  const state = readActorState(actor);
  if (!state.injury.episode.open || state.injury.episode.id !== episodeId || state.injury.stacks < 3) return;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name}: ${stacks} ${game.i18n.localize('IFS.Injury.ThreeStack')}` }, modal: true, rejectClose: false,
    content: `<p>${game.i18n.localize('IFS.Injury.ThreeStackContent')}</p>`,
    buttons: [
      { action: 'dead', label: 'IFS.Injury.DirectDeath', callback: () => 'dead' },
      { action: 'exception', label: 'IFS.Injury.EnvironmentException', callback: () => 'exception' },
      { action: 'defer', label: 'IFS.Injury.Defer', callback: () => 'defer' },
    ],
  });
  const current = readActorState(actor);
  if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)
    || actorHp(actor).value > 0 || !current.injury.episode.open || current.injury.episode.id !== episodeId || current.injury.stacks < 3) return;
  if (result === 'dead') {
    await actor.update({ 'system.attributes.death.failure': 3 }, { [MODULE_ID]: { internal: true, transactionId: `${episodeId}:direct-death` } });
    const deadStatus = CONFIG.specialStatusEffects?.DEFEATED ?? 'dead';
    await actor.toggleStatusEffect(deadStatus, { active: true });
  } else if (result === 'exception') {
    const failures = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize('IFS.Injury.EnvironmentException') }, modal: true, rejectClose: false,
      content: `<form><label>${game.i18n.localize('IFS.Injury.StartingFailures')}</label><input type="number" name="failures" min="0" max="2" step="1" value="0"></form>`,
      buttons: [
        { action: 'apply', label: 'IFS.Actions.Apply', callback: (_event: unknown, button: any) => Number(new FormData(button.form).get('failures')) },
        { action: 'cancel', label: 'IFS.Actions.Cancel', callback: () => null },
      ],
    });
    const afterException = readActorState(actor);
    if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)
      || actorHp(actor).value > 0 || !afterException.injury.episode.open || afterException.injury.episode.id !== episodeId || afterException.injury.stacks < 3) return;
    if (Number.isInteger(failures) && Number(failures) >= 0 && Number(failures) <= 2) {
      await actor.update({ 'system.attributes.death.failure': Number(failures) }, { [MODULE_ID]: { internal: true, transactionId: `${episodeId}:exception` } });
    }
  }
}

function transactionId(actor: any, userId: string, oldHp: HpSnapshot, newHp: HpSnapshot, changes: Record<string, unknown>, kind: string): string {
  const input = `${actor.uuid}|${modifiedTime(actor)}|${userId}|${kind}|${oldHp.value}/${oldHp.max}|${newHp.value}/${newHp.max}|${stableJson(changes)}`;
  return hashedTransactionId(kind, actor.uuid, input);
}

function hashedTransactionId(kind: string, actorUuid: string, input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `${kind}:${actorUuid}:${(hash >>> 0).toString(16)}`;
}

function modifiedTime(actor: any): number {
  const value = Number(actor?._stats?.modifiedTime);
  return Number.isFinite(value) ? value : Date.now();
}

function currentAutomationSource(): AutomationSource {
  let value: unknown;
  try { value = game.settings?.get?.(MODULE_ID, SETTINGS.automationSource); } catch { value = undefined; }
  return isExternalAutomationValue(value) ? AUTOMATION_SOURCES.externalTriggerEngine : AUTOMATION_SOURCES.internalHooks;
}

function isExternalAutomationSource(): boolean {
  return currentAutomationSource() === AUTOMATION_SOURCES.externalTriggerEngine;
}

function resurrectionPromptEnabled(): boolean {
  try { return game.settings?.get?.(MODULE_ID, SETTINGS.resurrectionPrompt) !== false; } catch { return true; }
}

function isExternalAutomationValue(value: unknown): boolean {
  // The aliases keep worlds created by early development builds readable;
  // the registered choices use the stable `internal`/`external` values.
  return value === AUTOMATION_SOURCES.externalTriggerEngine
    || value === 'external-trigger-engine'
    || value === 'trigger-engine';
}

function isTriggerEngineAvailable(): boolean {
  const module = game.modules?.get?.(TRIGGER_ENGINE_MODULE_ID);
  return module?.active === true && module.api !== null && typeof module.api === 'object' && typeof module.api.subscribe === 'function';
}

function enrichTriggerEventContext(actor: any, context: Record<string, any>, before: HpSnapshot, after: HpSnapshot): HpTransitionTriggerContext {
  const timestamp = firstFiniteNumber(context.timestamp);
  const seed = `${actor.uuid}|${context.userId ?? ''}|${before.value}/${before.max}|${after.value}/${after.max}|${stableJson(context.changes)}`;
  const triggerId = firstString(context.triggerId) ?? hashedTransactionId('trigger-engine-event', actor.uuid, `${seed}|${timestamp ?? ''}`);
  return {
    ...context,
    triggerId,
    triggerName: firstString(context.triggerName) ?? 'Trigger Engine Actor HP update',
    event: { type: 'documentUpdate', documentType: 'Actor' },
    document: actor,
    documentUuid: actor.uuid,
    before: context.before,
    after: context.after,
    changes: context.changes,
    userId: typeof context.userId === 'string' ? context.userId : undefined,
    timestamp: timestamp ?? modifiedTime(actor),
  };
}

function enteredExplicitDeath(beforeRaw: unknown, afterRaw: unknown, before: HpSnapshot, after: HpSnapshot): boolean {
  if (after.value > 0) return false;
  const beforeFailures = readDeathFailures(beforeRaw);
  const afterFailures = readDeathFailures(afterRaw);
  const beforeDead = hasDeadStatus(beforeRaw);
  const afterDead = hasDeadStatus(afterRaw);
  const enteredZero = before.value > 0 && after.value <= 0;
  const failuresEntered = afterFailures !== null && afterFailures >= 3 && (beforeFailures === null || beforeFailures < 3);
  const deadEntered = afterDead && !beforeDead;
  return (enteredZero || failuresEntered || deadEntered) && (afterFailures !== null && afterFailures >= 3 || afterDead);
}

function explicitDeathConfirmed(actor: any): boolean {
  const failures = readDeathFailures(actor);
  return (failures !== null && failures >= 3) || hasDeadStatus(actor);
}

function readDeathFailures(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const candidates = [
    getPath(value, ['system', 'attributes', 'death', 'failure']),
    getPath(value, ['attributes', 'death', 'failure']),
    value['system.attributes.death.failure'],
  ];
  for (const candidate of candidates) {
    const number = finiteNumber(candidate);
    if (number !== null) return Math.max(0, number);
  }
  return null;
}

function hasDeadStatus(value: unknown): boolean {
  const ids = new Set(['dead', 'defeated', 'DEFEATED']);
  const configured = (globalThis as any).CONFIG?.specialStatusEffects?.DEFEATED;
  if (typeof configured === 'string' && configured) ids.add(configured);
  const record = isRecord(value) ? value : null;
  if (!record) return false;
  if (record.disabled === true || record.isSuppressed === true) return false;
  for (const key of ['status', 'statusId', 'effectId']) {
    if (typeof record[key] === 'string' && ids.has(record[key])) return true;
  }
  for (const key of ['statuses', 'statusEffects']) {
    if (collectionHasDead(record[key], ids)) return true;
  }
  for (const effect of collectionValues(record.effects)) if (hasDeadStatus(effect)) return true;
  return false;
}

function collectionHasDead(value: unknown, ids: Set<string>): boolean {
  if (typeof value === 'string') return ids.has(value);
  if (Array.isArray(value)) return value.some((entry) => typeof entry === 'string' ? ids.has(entry) : hasDeadStatus(entry));
  if (value && typeof (value as any).has === 'function') {
    for (const id of ids) if ((value as any).has(id)) return true;
  }
  return false;
}

function collectionValues(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof (value as any).values === 'function') return [...(value as any).values()];
  if (value && typeof (value as any)[Symbol.iterator] === 'function' && typeof value !== 'string') return [...(value as any)];
  return [];
}

function localizeText(key: string, fallback: string): string {
  let value: unknown;
  try { value = game.i18n?.localize?.(key); } catch { value = undefined; }
  return typeof value === 'string' && value.trim() && value !== key ? value : fallback;
}

function formatText(key: string, values: Record<string, unknown>, fallback: string): string {
  let value: unknown;
  try { value = game.i18n?.format?.(key, values); } catch { value = undefined; }
  return typeof value === 'string' && value !== key ? value : fallback;
}

function validateHpTransitionContext(actor: any, context: unknown): ValidatedHpTransition | null {
  if (!actor || actor.documentName !== 'Actor' || typeof actor.uuid !== 'string' || actor.uuid.length === 0) {
    warnTriggerContext('The target must be a world Actor document.');
    return null;
  }
  if (!isRecord(context) || !isRecord(context.event)
    || context.event.type !== 'documentUpdate' || context.event.documentType !== 'Actor') {
    warnTriggerContext('The trigger event must be documentUpdate for an Actor.');
    return null;
  }
  if (typeof context.triggerId !== 'string' || context.triggerId.trim().length === 0
    || typeof context.triggerName !== 'string' || context.triggerName.trim().length === 0) {
    warnTriggerContext('The trigger must include a non-empty ID and name.');
    return null;
  }
  if (typeof context.timestamp !== 'number' || !Number.isFinite(context.timestamp)) {
    warnTriggerContext('The trigger timestamp must be finite.');
    return null;
  }
  if (context.documentUuid !== actor.uuid) {
    warnTriggerContext('The trigger document UUID does not match the Actor.');
    return null;
  }
  for (const key of ['documentName', 'documentType'] as const) {
    if (context[key] !== undefined && context[key] !== 'Actor') {
      warnTriggerContext('The trigger document must be an Actor.');
      return null;
    }
  }
  if (context.actorUuid !== undefined && context.actorUuid !== actor.uuid) {
    warnTriggerContext('The trigger Actor UUID does not match the Actor.');
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(context, 'document') || !matchesActorDocument(context.document, actor)) {
    warnTriggerContext('The trigger document identity is invalid.');
    return null;
  }
  if (!matchesSnapshotIdentity(context.before, actor) || !matchesSnapshotIdentity(context.after, actor)) {
    warnTriggerContext('The before/after Actor identity is invalid.');
    return null;
  }

  const before = readTriggerHp(context.before);
  const after = readTriggerHp(context.after);
  if (!before || !after) {
    warnTriggerContext('The trigger must include finite HP value and max snapshots.');
    return null;
  }

  return {
    before,
    after,
    transactionId: triggerTransactionId(actor, context, before, after),
    at: triggerTimestamp(actor, context),
  };
}

function matchesActorDocument(value: unknown, actor: any): boolean {
  if (value === actor) return true;
  if (typeof value === 'string') return value === 'Actor' || value === actor.uuid;
  if (!isRecord(value)) return false;
  const uuid = firstString(value.uuid, value.documentUuid, value.actorUuid);
  if (uuid !== undefined && uuid !== actor.uuid) return false;
  const id = firstString(value.id, value._id);
  if (id !== undefined && typeof actor.id === 'string' && id !== actor.id) return false;
  const name = firstString(value.documentName, value.documentType);
  if (name !== undefined && name !== 'Actor') return false;
  return uuid !== undefined || id !== undefined || name !== undefined;
}

function matchesSnapshotIdentity(value: unknown, actor: any): boolean {
  if (!isRecord(value)) return false;
  const uuid = firstString(value.uuid, value.documentUuid, value.actorUuid);
  if (uuid !== undefined && uuid !== actor.uuid) return false;
  const id = firstString(value.id, value._id);
  if (id !== undefined && typeof actor.id === 'string' && id !== actor.id) return false;
  const name = firstString(value.documentName, value.documentType);
  if (name !== undefined && name !== 'Actor') return false;
  return true;
}

function readTriggerHp(value: unknown): HpSnapshot | null {
  if (!isRecord(value)) return null;
  const nestedCandidates = [
    getPath(value, ['system', 'attributes', 'hp']),
    getPath(value, ['attributes', 'hp']),
    value.hp,
    value,
  ];
  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) continue;
    const hpValue = finiteNumber(candidate.value);
    const hpMax = finiteNumber(candidate.max);
    if (hpValue !== null && hpMax !== null) return { value: nonNegative(hpValue), max: nonNegative(hpMax) };
  }
  const flattenedValue = finiteNumber(value['system.attributes.hp.value']);
  const flattenedMax = finiteNumber(value['system.attributes.hp.max']);
  return flattenedValue !== null && flattenedMax !== null
    ? { value: nonNegative(flattenedValue), max: nonNegative(flattenedMax) }
    : null;
}

function triggerTransactionId(actor: any, context: Record<string, any>, before: HpSnapshot, after: HpSnapshot): string {
  const changes = isRecord(context.changes) ? { ...context.changes } : {};
  const actorRevision = snapshotModifiedTime(context.after) ?? snapshotModifiedTime(context.before);
  if (actorRevision !== null) changes.__actorRevision = actorRevision;
  // Trigger IDs and listener timestamps identify delivery, not the underlying
  // Actor update. They are deliberately excluded so a public subscriber and
  // an approved macro bridge converge on one transaction when snapshots carry
  // Foundry's modifiedTime. Without that revision, an explicit event ID or
  // event timestamp is the fallback; if neither is supplied, the stable
  // snapshot hash is deliberately conservative and may coalesce repeats.
  const fallbackEventId = firstString(context.eventId, context.transactionId);
  const fallbackTimestamp = firstFiniteNumber(context.timestamp, context.at, context.occurredAt);
  const eventIdentity = actorRevision ?? fallbackEventId ?? fallbackTimestamp ?? 'snapshot-fallback';
  const input = `${actor.uuid}|${TRIGGER_ENGINE_MODULE_ID}|${eventIdentity}|${before.value}/${before.max}|${after.value}/${after.max}|${stableJson(changes)}`;
  return hashedTransactionId(TRIGGER_ENGINE_MODULE_ID, actor.uuid, input);
}

function snapshotModifiedTime(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return firstFiniteNumber(getPath(value, ['_stats', 'modifiedTime']), value['_stats.modifiedTime']);
}

function triggerTimestamp(actor: any, context: Record<string, any>): number {
  return firstFiniteNumber(context.at, context.timestamp, context.occurredAt) ?? modifiedTime(actor);
}

function getPath(value: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function nonNegative(value: number): number {
  return Math.max(0, value);
}

function hasChange(changes: Record<string, unknown>, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(changes, path) || foundry.utils.hasProperty(changes, path);
}

function isNativeRestMessage(message: any, actor: any, restType: 'short' | 'long'): boolean {
  if (!message || message.type !== 'rest' || message.system?.type !== restType || message.speaker?.actor !== actor?.id) return false;
  let associated: any = null;
  try { associated = message.getAssociatedActor?.() ?? null; } catch { return false; }
  return associated?.uuid === actor?.uuid || associated?.id === actor?.id;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function canvasTokens(): any[] {
  return Array.from((globalThis as any).canvas?.tokens?.placeables ?? []);
}

function allLoadedActors(): any[] {
  return [...Array.from(game.actors ?? []), ...canvasTokens().map((token) => token.actor).filter(Boolean)];
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function notify(level: 'warn' | 'error' | 'info', key: string): void {
  const message = key.includes('.') ? (game.i18n?.localize?.(key) ?? key) : key;
  ui.notifications?.[level]?.(message);
}

function warnTriggerContext(reason: string): void {
  if (!isActiveGmWriter()) return;
  const prefix = game.i18n?.localize?.('IFS.Errors.TriggerContextInvalid') ?? 'IFS.Errors.TriggerContextInvalid';
  notify('warn', `${prefix}: ${reason}`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function warnError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${MODULE_ID} | ${message}`, error);
  ui.notifications?.error?.(`${MODULE_ID}: ${message}`);
}

export const runtime = new InjuryFadingRuntime();

export const publicApi = Object.freeze({
  statusPresentation() { return statusPresentation(); },
  getState(actor: any) { return structuredClone(readActorState(actor)); },
  setInjury(actor: any, stacks: number, reason = 'api') { return runtime.setInjury(actor, stacks, reason); },
  processHpTransition(actor: any, triggerContext: HpTransitionTriggerContext) { return runtime.processHpTransition(actor, triggerContext); },
  openResurrectionWizard(actor: any) { return openResurrectionWizard(actor); },
  getResurrectionState(actor: any) { return structuredClone(readActorState(actor).fadingSpirits); },
  withInjurySuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T) { return runtime.withInjurySuppressed(actor, reason, callback); },
});

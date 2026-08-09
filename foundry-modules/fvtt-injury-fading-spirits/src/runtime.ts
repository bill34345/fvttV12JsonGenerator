import { INJURY_STATUS_ID, MAX_INJURY_STACKS, MODULE_ID, SETTINGS, SOCKET_NAME } from './constants.ts';
import { applyNineteenCritical, retainedD20Face, setInjuryStacks, transitionInjury, type InjuryAction } from './injury.ts';
import { activeGmId, actorHp, isActiveGmWriter, isManagedActor, readActorState, writeActorState } from './persistence.ts';
import { decorateInjuryTokenHud, nextInjuryStacks, projectInjuryStatus, registerInjuryStatus } from './projection.ts';
import { createActorModuleState, type ActorModuleState } from './state.ts';
import { activateChatCard, openActorDashboard, openResurrectionWizard } from './ui.ts';

interface HpSnapshot { value: number; max: number }

export class InjuryFadingRuntime {
  readonly hpSnapshots = new Map<string, HpSnapshot>();
  supported = false;

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
    Hooks.on('deleteActiveEffect', (effect: any, options: Record<string, any>) => { void this.onDeleteEffect(effect, options); });
    Hooks.on('getActorDirectoryEntryContext', (_html: unknown, entries: any[]) => this.addActorContext(entries));
    Hooks.on('chatMessage', (_log: unknown, text: string) => this.onChatCommand(text));
    Hooks.on('renderTokenHUD', (app: any, html: any) => decorateInjuryTokenHud(app, html));
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
    if (!isActiveGmWriter() || game.settings.get(MODULE_ID, SETTINGS.enabled) !== true || !isManagedActor(actor)) return;

    const valueChanged = hasChange(changes, 'system.attributes.hp.value') && previous.value !== current.value;
    const maxChanged = hasChange(changes, 'system.attributes.hp.max') && previous.max !== current.max;
    if (!valueChanged && !maxChanged) return;
    try {
      const rawExists = actor.flags?.[MODULE_ID]?.schemaVersion !== undefined;
      const state = rawExists ? readActorState(actor) : createActorModuleState(previous.value, previous.max);
      if (!valueChanged) {
        state.injury.lastObservedHp = current.value;
        state.injury.lastObservedMax = current.max;
        await writeActorState(actor, state, transactionId(actor, userId, previous, current, changes, 'max-observe'));
        return;
      }
      const tx = transactionId(actor, userId, previous, current, changes, 'hp');
      const result = transitionInjury(state.injury, state.fadingSpirits, {
        kind: 'hp', transactionId: tx, at: modifiedTime(actor),
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
      for (const action of result.actions) await this.handleInjuryAction(actor, action);
    } catch (error) {
      warnError(error);
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

  private rememberHp(actor: any): void {
    if (actor?.uuid) this.hpSnapshots.set(actor.uuid, actorHp(actor));
  }

  private async handleInjuryAction(actor: any, action: InjuryAction): Promise<void> {
    if (action.type === 'promptThreeStackDecision') await promptThreeStackDecision(actor, action.stacks, action.episodeId);
    else if (action.type === 'injuryAdded') ui.notifications.info(`${actor.name}: ${game.i18n.localize('IFS.Status.Injury')} ${action.stacks}`);
    else if (action.type === 'injuryCleared') ui.notifications.info(`${actor.name}: ${game.i18n.localize('IFS.Messages.InjuryCleared')}`);
  }
}

export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: 'IFS.Settings.Enabled.Name', hint: 'IFS.Settings.Enabled.Hint', scope: 'world', config: true, type: Boolean, default: false,
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
  if (!isActiveGmWriter()) return;
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
    if (Number.isInteger(failures) && Number(failures) >= 0 && Number(failures) <= 2) {
      await actor.update({ 'system.attributes.death.failure': Number(failures) }, { [MODULE_ID]: { internal: true, transactionId: `${episodeId}:exception` } });
    }
  }
}

function transactionId(actor: any, userId: string, oldHp: HpSnapshot, newHp: HpSnapshot, changes: Record<string, unknown>, kind: string): string {
  const input = `${actor.uuid}|${modifiedTime(actor)}|${userId}|${kind}|${oldHp.value}/${oldHp.max}|${newHp.value}/${newHp.max}|${stableJson(changes)}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `${kind}:${actor.uuid}:${(hash >>> 0).toString(16)}`;
}

function modifiedTime(actor: any): number {
  const value = Number(actor?._stats?.modifiedTime);
  return Number.isFinite(value) ? value : Date.now();
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

function warnError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${MODULE_ID} | ${message}`, error);
  ui.notifications?.error?.(`${MODULE_ID}: ${message}`);
}

export const runtime = new InjuryFadingRuntime();

export const publicApi = Object.freeze({
  getState(actor: any) { return structuredClone(readActorState(actor)); },
  setInjury(actor: any, stacks: number, reason = 'api') { return runtime.setInjury(actor, stacks, reason); },
  openResurrectionWizard(actor: any) { return openResurrectionWizard(actor); },
  getResurrectionState(actor: any) { return structuredClone(readActorState(actor).fadingSpirits); },
  withInjurySuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T) { return runtime.withInjurySuppressed(actor, reason, callback); },
});

import { MODULE_ID, TRIGGER_ENGINE_MODULE_ID } from './constants.ts';
import { buildConditionTooltip } from './hud.ts';

const LEGACY_ID = 'fvtt-injury-fading-spirits';
const STATUS_ID = 'fvtt-injury';
const MAX_IDS = 128;
const SOCKET = `module.${MODULE_ID}`;

export interface InjuryState {
  stacks: number;
  episode: { id: string | null; open: boolean; openedAt: number | null };
  lastObservedHp: number;
  lastObservedMax: number;
  suppressNextRecovery: { transactionId: string; reason: string; episodeId?: string | null; observedRevision?: number } | null;
  processedTransactionIds: string[];
  pendingFadingEpisodeId?: string | null;
}

export interface InjuryEventContext {
  event?: { type?: string; documentType?: string };
  document?: any;
  documentUuid?: string;
  before?: unknown;
  after?: unknown;
  changes?: unknown;
  userId?: string;
  timestamp?: number;
  capturedModifiedTime?: number;
}

export function injurySupported(globals: any): boolean {
  return globals.game?.system?.id === 'dnd5e' && (
    (globals.game?.version === '14.364' && globals.game?.system?.version === '5.3.3')
    || (globals.game?.version === '14.368' && globals.game?.system?.version === '6.0.5')
  );
}

export function createInjuryState(hp = 0, max = 0): InjuryState {
  return { stacks: 0, episode: { id: null, open: false, openedAt: null },
    lastObservedHp: hp, lastObservedMax: max, suppressNextRecovery: null, processedTransactionIds: [], pendingFadingEpisodeId: null };
}

function plain(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hp(actor: any): { value: number; max: number } {
  const raw = actor?.system?.attributes?.hp;
  const value = Number(raw?.value);
  const max = Number(raw?.max);
  if (!Number.isFinite(value) || !Number.isFinite(max) || value < 0 || max < 0) throw new Error('Injury requires valid Actor HP.');
  return { value, max };
}

function parseState(raw: unknown): InjuryState {
  if (!plain(raw) || !Number.isInteger(raw.stacks) || raw.stacks < 0 || raw.stacks > 3
    || !plain(raw.episode) || typeof raw.episode.open !== 'boolean'
    || !(raw.episode.id === null || typeof raw.episode.id === 'string')
    || !(raw.episode.openedAt === null || Number.isFinite(raw.episode.openedAt))
    || !Number.isFinite(raw.lastObservedHp) || !Number.isFinite(raw.lastObservedMax)
    || raw.lastObservedHp < 0 || raw.lastObservedMax < 0
    || !(raw.suppressNextRecovery === null || (plain(raw.suppressNextRecovery)
      && typeof raw.suppressNextRecovery.transactionId === 'string' && typeof raw.suppressNextRecovery.reason === 'string'
      && (raw.suppressNextRecovery.episodeId === undefined || raw.suppressNextRecovery.episodeId === null
        || typeof raw.suppressNextRecovery.episodeId === 'string')
      && (raw.suppressNextRecovery.observedRevision === undefined
        || Number.isFinite(raw.suppressNextRecovery.observedRevision))))
    || !Array.isArray(raw.processedTransactionIds)
    || raw.processedTransactionIds.some((id: unknown) => typeof id !== 'string')
    || !(raw.pendingFadingEpisodeId === undefined || raw.pendingFadingEpisodeId === null
      || typeof raw.pendingFadingEpisodeId === 'string')) {
    throw new Error('Unknown or malformed injury schema; original data was retained.');
  }
  return structuredClone(raw) as InjuryState;
}

export function readInjury(actor: any): InjuryState {
  const current = actor?.flags?.[MODULE_ID]?.injury;
  if (current !== undefined) {
    if (!plain(current) || current.schemaVersion !== 1) throw new Error('Unknown Custom Conditions injury schema.');
    return parseState(current.state);
  }
  const legacy = actor?.flags?.[LEGACY_ID];
  if (legacy !== undefined) {
    if (!plain(legacy) || legacy.schemaVersion !== 1) throw new Error('Unknown legacy injury schema; migration stopped.');
    if (legacy.injury !== undefined) return parseState(legacy.injury);
  }
  const observed = hp(actor);
  return createInjuryState(observed.value, observed.max);
}

function effects(actor: any): any[] {
  const source = actor?.effects;
  return Array.isArray(source) ? source : typeof source?.values === 'function' ? [...source.values()] : source?.contents ?? [];
}

function ownedProjection(effect: any): boolean {
  return effect?.flags?.[LEGACY_ID]?.injuryProjection === true
    || effect?.flags?.[MODULE_ID]?.injuryProjection === true
    || effect?.statuses?.has?.(STATUS_ID) === true
    || (Array.isArray(effect?.statuses) && effect.statuses.includes(STATUS_ID));
}

function inertDaeDurationFlag(scope: string, value: unknown): boolean {
  // DAE 14.0.12 adds this exact empty configuration to ordinary effects.
  // Every other foreign field remains owned by its module, even if falsy.
  return scope === 'dae' && plain(value) && Object.keys(value).length === 1
    && Array.isArray(value.specialDuration) && value.specialDuration.length === 0;
}

function meaningfulEffectDuration(effect: any): boolean {
  // Core 14 prepares a null duration as Infinity. Use persisted source data
  // instead of treating that derived value or default units as a timed rule.
  const source = typeof effect?.toObject === 'function' ? effect.toObject() : undefined;
  const duration = plain(source) && Object.hasOwn(source, 'duration') ? source.duration : effect?.duration;
  if (duration === null || duration === undefined) return false;
  if (!plain(duration)) return true;
  return Object.entries(duration).some(([key, value]) => {
    if (value === null || value === undefined) return false;
    if (key === 'units' && value === 'seconds') return false;
    if (key === 'expired' && value === false) return false;
    if (['seconds', 'rounds', 'turns'].includes(key) && value === 0) return false;
    return true;
  });
}

function checkProjection(actor: any): any | undefined {
  const owned = effects(actor).filter(ownedProjection);
  if (owned.length > 1) throw new Error('Multiple injury projections; migration stopped without changing effects.');
  return owned[0];
}

function requireActiveGm(globals: any): void {
  const user = globals.game?.user;
  if (user?.isGM !== true || user.active === false || globals.game?.users?.activeGM?.id !== user.id) {
    throw new Error('Only the active GM may write injury state.');
  }
}

function checkLegacyRuntime(globals: any): void {
  const module = globals.game?.modules?.get?.(LEGACY_ID);
  if (module?.active === true && module.api?.injuryOwner !== MODULE_ID) {
    throw new Error('The active Injury/Fading Spirits module still writes injury. Upgrade the paired module before enabling Custom Conditions injury.');
  }
}

export function transitionInjury(state: InjuryState, input: {
  id: string; at: number; oldHp: number; newHp: number; oldMax: number; newMax: number;
}): { state: InjuryState; failures: number | null; threeStackEpisode: string | null; deathEpisode: string | null; duplicate: boolean } {
  const next = structuredClone(state);
  if (next.processedTransactionIds.includes(input.id)) return { state: next, failures: null, threeStackEpisode: null, deathEpisode: null, duplicate: true };
  next.processedTransactionIds = [...next.processedTransactionIds, input.id].slice(-MAX_IDS);
  let failures: number | null = null;
  let threeStackEpisode: string | null = null;
  let deathEpisode: string | null = null;
  if (input.oldHp > 0 && input.newHp === 0) {
    const pending = next.suppressNextRecovery;
    const bindsPendingFall = pending?.episodeId === null && Number.isFinite(pending.observedRevision)
      && input.at <= pending.observedRevision!;
    next.suppressNextRecovery = bindsPendingFall ? { ...pending, episodeId: input.id } : null;
    next.episode = { id: input.id, open: true, openedAt: input.at };
    next.pendingFadingEpisodeId = input.id;
    deathEpisode = input.id;
    if (next.stacks < 3) failures = next.stacks;
    else threeStackEpisode = input.id;
  }
  if (input.oldHp === 0 && input.newHp > 0 && next.episode.open) {
    const episodeId = next.episode.id;
    const suppressed = next.suppressNextRecovery !== null
      && (next.suppressNextRecovery.episodeId === undefined || next.suppressNextRecovery.episodeId === episodeId);
    next.episode = { id: null, open: false, openedAt: null };
    if (suppressed) next.suppressNextRecovery = null;
    else next.stacks = Math.min(3, next.stacks + 1);
  }
  if (input.newHp > input.oldHp && input.newMax > 0 && input.newHp >= input.newMax && input.newMax >= input.oldMax) {
    next.stacks = 0;
    next.episode = { id: null, open: false, openedAt: null };
    next.suppressNextRecovery = null;
  }
  next.lastObservedHp = input.newHp;
  next.lastObservedMax = input.newMax;
  return { state: next, failures, threeStackEpisode, deathEpisode, duplicate: false };
}

export function retainedD20Face(roll: unknown): number | null {
  const candidate = roll as { d20?: { results?: Array<{ result?: unknown; active?: boolean; discarded?: boolean }> }; dice?: Array<{ faces?: number; results?: Array<{ result?: unknown; active?: boolean; discarded?: boolean }> }> };
  const die = candidate?.d20 ?? candidate?.dice?.find((entry) => entry.faces === 20);
  const result = die?.results?.find((entry) => entry.active === true && entry.discarded !== true)
    ?? die?.results?.find((entry) => entry.discarded !== true);
  return Number.isFinite(result?.result) ? Number(result!.result) : null;
}

export function applyNineteenCritical(details: Record<string, unknown>, face: number | null, systemVersion: string): boolean {
  if (face === null || face < 19) return false;
  details.updates = { 'system.attributes.death.success': 0, 'system.attributes.death.failure': 0, 'system.attributes.hp.value': 1 };
  details.chatString = 'DND5E.DeathSaveCriticalSuccess';
  if (systemVersion === '6.0.5') details.outcome = 'revive';
  return true;
}

export class InjuryRuntime {
  readonly globals: any;
  readonly isActiveGM: () => boolean;
  readonly queues = new Map<string, Promise<unknown>>();
  readonly internalRevisions = new Map<string, number>();
  readonly hooks: Array<[string, unknown]> = [];
  readonly hudListeners: Array<[string, (event: any) => void]> = [];
  started = false;

  constructor(globals: any, isActiveGM: () => boolean) { this.globals = globals; this.isActiveGM = isActiveGM; }

  start(): void {
    if (this.started || !injurySupported(this.globals)) return;
    this.started = true;
    const hooks = this.globals.Hooks;
    const on = (name: string, fn: (...args: any[]) => unknown) => { if (typeof hooks?.on === 'function') this.hooks.push([name, hooks.on(name, fn)]); };
    on('dnd5e.rollDeathSave', (rolls, details) => this.onDeathSave(rolls, details));
    on('dnd5e.restCompleted', (actor, result, config) => { void this.onRestCompleted(actor, result, config).catch((error) => this.report(error)); });
    on('renderTokenHUD', (app, html) => this.decorateTokenHud(app, html));
    on('tokenActionHudCorePreRender', (hud, manager) => this.decorateActionHud(hud, manager));
    on('deleteActiveEffect', (effect, options) => { void this.onDeleteEffect(effect, options).catch((error) => this.report(error)); });
    const document = this.globals.document;
    if (typeof document?.addEventListener === 'function') {
      for (const name of ['click', 'contextmenu', 'auxclick']) {
        const handler = (event: any) => this.onTokenHudAction(event);
        document.addEventListener(name, handler, { capture: true });
        this.hudListeners.push([name, handler]);
      }
    }
    this.globals.game?.socket?.on?.(SOCKET, (payload: unknown, senderId: string) =>
      this.onSocket(payload, senderId).catch((error) => this.report(error)));
    this.registerStatus();
    if (this.isActiveGM()) void this.importLegacySettings()
      .then(() => this.reconcileActors()).catch((error) => this.report(error));
  }

  stop(): void {
    for (const [name, id] of this.hooks) this.globals.Hooks?.off?.(name, id);
    this.hooks.length = 0;
    for (const [name, handler] of this.hudListeners) this.globals.document?.removeEventListener?.(name, handler, { capture: true });
    this.hudListeners.length = 0;
    this.internalRevisions.clear();
    this.started = false;
  }

  enabled(): boolean {
    const old = this.globals.game?.modules?.get?.(LEGACY_ID);
    return this.started && (old?.active !== true || old.api?.injuryOwner === MODULE_ID)
      && this.globals.game?.settings?.get?.(MODULE_ID, 'injuryEnabled') === true;
  }

  managed(actor: any): boolean {
    return actor?.documentName === 'Actor' && !actor.pack && !actor.inCompendium
      && (actor.type === 'character' || (actor.type === 'npc' && this.globals.game?.settings?.get?.(MODULE_ID, 'injuryManageNpcs') === true));
  }

  getState(actor: any): InjuryState { return readInjury(actor); }

  async migrate(actor: any): Promise<InjuryState> {
    return this.enqueue(actor, (current) => this.migrateCurrent(current));
  }

  private async migrateCurrent(actor: any): Promise<InjuryState> {
    if (!injurySupported(this.globals) || !this.enabled()) throw new Error('Injury is disabled or unsupported on this runtime.');
    actor = await this.resolveActor(actor);
    requireActiveGm(this.globals);
    checkLegacyRuntime(this.globals);
    checkProjection(actor);
    const current = actor?.flags?.[MODULE_ID]?.injury;
    const state = readInjury(actor);
    if (current !== undefined) {
      const legacy = actor?.flags?.[LEGACY_ID];
      if (legacy !== undefined && (legacy.schemaVersion !== 1 || (legacy.injury !== undefined && (
        current.legacySnapshot === undefined
          ? JSON.stringify(state) !== JSON.stringify(parseState(legacy.injury))
          : current.legacySnapshot !== JSON.stringify(parseState(legacy.injury)))))) {
        throw new Error('Current and legacy injury flags conflict; migration stopped.');
      }
      return state;
    }
    await this.write(actor, state, `migrate:${actor.uuid}`, false);
    return state;
  }

  async reconcileActors(): Promise<void> {
    if (!this.enabled() || !this.isActiveGM()) return;
    const all = [...(this.globals.game?.actors ?? []),
      ...(this.globals.canvas?.tokens?.placeables ?? []).map((token: any) => token.actor)];
    const unique = new Map<string, any>();
    for (const actor of all) if (actor?.uuid && this.managed(actor)
      && (actor.flags?.[LEGACY_ID]?.injury || actor.flags?.[MODULE_ID]?.injury)) unique.set(actor.uuid, actor);
    for (const actor of unique.values()) {
      try { await this.enqueue(actor, async (current) => { const state = await this.migrateCurrent(current);
        await this.project(current, state.stacks); await this.syncFadingEpisode(current); }); }
      catch (error) { this.report(error); }
    }
  }

  private async write(actor: any, state: InjuryState, id: string, project = true, extra: Record<string, unknown> = {}): Promise<void> {
    if (!injurySupported(this.globals) || !this.enabled()) throw new Error('Injury is disabled or unsupported on this runtime.');
    requireActiveGm(this.globals);
    checkLegacyRuntime(this.globals);
    const projection = checkProjection(actor);
    if (!actor?.uuid || typeof actor.update !== 'function') throw new Error('A world Actor with update() is required.');
    const legacy = actor?.flags?.[LEGACY_ID];
    const snapshot = actor?.flags?.[MODULE_ID]?.injury?.legacySnapshot
      ?? (legacy?.injury === undefined ? undefined : JSON.stringify(parseState(legacy.injury)));
    await actor.update({ [`flags.${MODULE_ID}.injury`]: { schemaVersion: 1, state: structuredClone(state),
      ...(snapshot === undefined ? {} : { legacySnapshot: snapshot }) }, ...extra }, { [MODULE_ID]: { injuryInternal: true, transactionId: id } });
    const writtenRevision = Number(actor?._stats?.modifiedTime);
    if (Number.isFinite(writtenRevision)) this.internalRevisions.set(actor.uuid, writtenRevision);
    const readback = actor?.flags?.[MODULE_ID]?.injury;
    if (!plain(readback) || readback.schemaVersion !== 1 || JSON.stringify(parseState(readback.state)) !== JSON.stringify(state)) {
      throw new Error('Injury write readback mismatch; projection was not changed.');
    }
    if (project) await this.project(actor, state.stacks, projection);
  }

  async setStacks(actor: any, stacks: number, reason = 'manual'): Promise<void> {
    if (!Number.isInteger(stacks) || stacks < 0 || stacks > 3) throw new Error('Injury stacks must be 0–3.');
    if (!this.enabled() || !this.managed(actor)) throw new Error('Injury automation is disabled for this Actor.');
    if (!this.isActiveGM()) {
      if (!this.globals.game?.users?.activeGM?.id) throw new Error('No active GM is available to set injury.');
      this.globals.game?.socket?.emit?.(SOCKET, { type: 'setStacks', actorUuid: actor.uuid,
        stacks, reason: String(reason).slice(0, 200) });
      return;
    }
    const run = async (current: any) => { const state = await this.migrateCurrent(current); state.stacks = stacks;
      await this.write(current, state, `manual:${current.uuid}:${Date.now()}:${reason}`); };
    await this.enqueue(actor, run);
  }

  async suppressNextRecovery(actor: any, transactionId: string, reason: string): Promise<void> {
    if (!this.enabled() || !this.managed(actor)) return;
    await this.enqueue(actor, async (current) => {
      const state = await this.migrateCurrent(current);
      if (!state.episode.open && hp(current).value !== 0) return;
      const revision = Number(current?._stats?.modifiedTime);
      if (!state.episode.open && !Number.isFinite(revision)) throw new Error('Native HP revision is required for pending recovery suppression.');
      state.suppressNextRecovery = { transactionId, reason: reason.slice(0, 200), episodeId: state.episode.id,
        ...(!state.episode.open ? { observedRevision: revision } : {}) };
      await this.write(current, state, `${transactionId}:suppression`);
    });
  }

  async withSuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T): Promise<T> {
    requireActiveGm(this.globals);
    if (!injurySupported(this.globals) || !this.enabled() || !this.managed(actor)) {
      throw new Error('Injury is disabled or unsupported for this Actor.');
    }
    const id = `suppression:${actor?.uuid}:${Date.now()}`;
    const before = hp(await this.resolveActor(actor)).value;
    await this.suppressNextRecovery(actor, id, reason);
    try { return await callback(); }
    finally {
      if (this.enabled() && this.isActiveGM()) await this.enqueue(actor, async (current) => {
        const state = readInjury(current);
        if (state.suppressNextRecovery?.transactionId !== id) return;
        // A native recovery can commit before Trigger Engine delivers its
        // queued before/after event. Leave the episode-bound marker for that
        // event to consume, including when the callback subsequently throws.
        if (before === 0 && hp(current).value > 0) return;
        state.suppressNextRecovery = null;
        await this.write(current, state, `${id}:end`);
      });
    }
  }

  async handleEvent(context: InjuryEventContext): Promise<void> {
    if (!this.enabled() || !this.isActiveGM() || context.event?.type !== 'documentUpdate' || context.event.documentType !== 'Actor') return;
    const actor = context.document;
    if (!this.managed(actor) || actor.uuid !== context.documentUuid) return;
    const before = snapshotHp(context.before);
    const after = snapshotHp(context.after);
    if (!before || !after || (before.value === after.value && before.max === after.max)) return;
    const capturedModified = Number(context.capturedModifiedTime ?? (context.after as any)?._stats?.modifiedTime);
    if (!Number.isFinite(capturedModified)) return;
    const id = transactionId(actor.uuid, capturedModified, context.userId, before, after);
    await this.enqueue(actor, async (current) => {
      if (!this.isActiveGM() || !this.enabled()) return;
      const currentRevision = Number(current?._stats?.modifiedTime);
      const nativeCurrent = sameHp(current, after) && (currentRevision === capturedModified
        || currentRevision === this.internalRevisions.get(current.uuid));
      const state = await this.migrateCurrent(current);
      if (state.processedTransactionIds.includes(id)) { await this.syncFadingEpisode(current); return; }
      const result = transitionInjury(state, { id, at: capturedModified, oldHp: before.value, newHp: after.value,
        oldMax: before.max, newMax: after.max });
      if (result.duplicate) return;
      const extra = result.failures === null || !nativeCurrent ? {} : { 'system.attributes.death.failure': result.failures };
      await this.write(current, result.state, id, true, extra);
      if (result.deathEpisode) await this.syncFadingEpisode(current);
      if (result.threeStackEpisode && nativeCurrent) await this.promptThree(current, result.threeStackEpisode);
    });
  }

  async applyRest(actor: any, restType: 'short' | 'long', id: string): Promise<void> {
    if (!this.enabled() || !this.managed(actor) || !this.isActiveGM()) return;
    await this.enqueue(actor, async (current) => {
      const state = await this.migrateCurrent(current);
      if (state.processedTransactionIds.includes(id)) return;
      state.processedTransactionIds = [...state.processedTransactionIds, id].slice(-MAX_IDS);
      state.stacks = 0;
      state.episode = { id: null, open: false, openedAt: null };
      state.suppressNextRecovery = null;
      await this.write(current, state, `rest:${restType}:${id}`);
    });
  }

  private async syncFadingEpisode(actor: any): Promise<void> {
    const module = this.globals.game?.modules?.get?.(LEGACY_ID);
    if (module?.active !== true || typeof module.api?.beginDeathEpisode !== 'function') return;
    const state = readInjury(actor);
    const id = state.pendingFadingEpisodeId;
    if (!id) return;
    const synced = await module.api.beginDeathEpisode(actor, id);
    if (synced === false) return;
    const current = await this.resolveActor(actor);
    const fresh = readInjury(current);
    if (fresh.pendingFadingEpisodeId !== id) return;
    fresh.pendingFadingEpisodeId = null;
    await this.write(current, fresh, `${id}:fading-synced`);
  }

  private async onRestCompleted(actor: any, result: any, config: any): Promise<void> {
    if (!this.enabled() || !this.managed(actor)) return;
    const restType = result?.type === 'long' || config?.type === 'long' ? 'long' : 'short';
    const message = result?.message;
    if (message && !nativeRest(message, actor, restType)) return;
    if (this.isActiveGM()) {
      const revision = Number(actor?._stats?.modifiedTime);
      if (!message && !Number.isFinite(revision)) return;
      await this.applyRest(actor, restType, `rest:${actor.uuid}:${message?.id ?? revision}:${restType}`);
    } else if (message) {
      this.globals.game?.socket?.emit?.(SOCKET, { type: 'rest', actorUuid: actor.uuid, messageId: message.id, restType });
    }
  }

  private async onSocket(payload: unknown, senderId: unknown): Promise<void> {
    if (!this.enabled() || !this.isActiveGM() || !plain(payload)
      || !['rest', 'setStacks'].includes(String(payload.type)) || typeof senderId !== 'string') return;
    const requester = this.globals.game?.users?.get?.(senderId);
    if (!requester?.active || typeof payload.actorUuid !== 'string') return;
    const actor = await this.globals.fromUuid?.(payload.actorUuid);
    if (!this.managed(actor) || actor.uuid !== payload.actorUuid || typeof actor.testUserPermission !== 'function'
      || !actor.testUserPermission(requester, 'OWNER')) return;
    if (payload.type === 'setStacks') {
      if (!Number.isInteger(payload.stacks) || payload.stacks < 0 || payload.stacks > 3) return;
      await this.setStacks(actor, payload.stacks, String(payload.reason ?? 'player request').slice(0, 200));
      return;
    }
    if ((payload.restType !== 'short' && payload.restType !== 'long') || typeof payload.messageId !== 'string') return;
    const message = this.globals.game?.messages?.get?.(payload.messageId);
    if (!nativeRest(message, actor, payload.restType, senderId)) return;
    await this.applyRest(actor, payload.restType, `rest:${actor.uuid}:${message.id}:${payload.restType}`);
  }

  private onDeathSave(rolls: any[], details: Record<string, unknown>): void {
    if (!this.enabled() || !this.managed(details?.subject)) return;
    applyNineteenCritical(details, retainedD20Face(rolls?.[0]), this.globals.game.system.version);
  }

  private async promptThree(actor: any, id: string): Promise<void> {
    if (!this.isActiveGM() || !readInjury(actor).episode.open || readInjury(actor).episode.id !== id) return;
    const dialog = this.globals.foundry?.applications?.api?.DialogV2;
    if (!dialog?.wait) return;
    const result = await dialog.wait({ window: { title: `${actor.name}: ${label(this.globals, 'ThreeStackTitle', 'Injury 3')}` }, modal: true, rejectClose: false,
      content: `<p>${label(this.globals, 'ThreeStackPrompt', 'Three injuries: the GM must decide whether this fall causes death or an exception.')}</p>`,
      buttons: [{ action: 'dead', label: label(this.globals, 'DirectDeath', 'Direct death'), callback: () => 'dead' },
        { action: 'exception', label: label(this.globals, 'Exception', 'Exception'), callback: () => 'exception' },
        { action: 'defer', label: label(this.globals, 'Defer', 'Defer'), callback: () => 'defer' }] });
    if (!this.isActiveGM() || !readInjury(actor).episode.open || readInjury(actor).episode.id !== id || hp(actor).value !== 0) return;
    if (result === 'dead') {
      await actor.update({ 'system.attributes.death.failure': 3 }, { [MODULE_ID]: { injuryInternal: true, transactionId: `${id}:direct-death` } });
      await actor.toggleStatusEffect?.(this.globals.CONFIG?.specialStatusEffects?.DEFEATED ?? 'dead', { active: true });
    } else if (result === 'exception') {
      const failures = await dialog.wait({ window: { title: label(this.globals, 'StartingFailures', 'Starting death failures') }, modal: true, rejectClose: false,
        content: '<form><input type="number" name="failures" min="0" max="2" step="1" value="0"></form>',
        buttons: [{ action: 'apply', label: label(this.globals, 'Apply', 'Apply'), callback: (_event: unknown, button: any) => Number(new FormData(button.form).get('failures')) },
          { action: 'cancel', label: label(this.globals, 'Cancel', 'Cancel'), callback: () => null }] });
      if (Number.isInteger(failures) && failures >= 0 && failures <= 2 && this.isActiveGM()
        && readInjury(actor).episode.id === id && hp(actor).value === 0) {
        await actor.update({ 'system.attributes.death.failure': failures }, { [MODULE_ID]: { injuryInternal: true, transactionId: `${id}:exception` } });
      }
    }
  }

  private registerStatus(): void {
    const statuses = this.globals.CONFIG?.statusEffects;
    if (!Array.isArray(statuses)) return;
    const status = { id: STATUS_ID, name: 'FVTTCONDITIONS.Injury.Name',
      label: 'FVTTCONDITIONS.Injury.Name', img: injuryIcon(1), hud: true };
    const index = statuses.findIndex((entry: any) => entry?.id === STATUS_ID);
    if (index < 0) statuses.push(status);
    else statuses[index] = { ...statuses[index], ...status };
  }

  private async project(actor: any, stacks: number, existing = checkProjection(actor)): Promise<void> {
    requireActiveGm(this.globals);
    const statusValues = existing?.statuses ? [...existing.statuses] : [];
    const otherStatuses = statusValues.filter((id) => id !== STATUS_ID);
    const flags = existing?.flags ?? {};
    const foreignFlagScope = Object.keys(flags).some((scope) => scope !== MODULE_ID && scope !== LEGACY_ID
      && !inertDaeDurationFlag(scope, flags[scope]));
    const foreignOwnFlags = Object.keys(flags[MODULE_ID] ?? {}).some((key) => !['injuryProjection', 'stacks'].includes(key))
      || Object.keys(flags[LEGACY_ID] ?? {}).some((key) => !['injuryProjection', 'stacks'].includes(key));
    const changes = existing?.system?.changes ?? existing?.changes;
    const hasChanges = changes !== null && changes !== undefined
      && (!Array.isArray(changes) || changes.length > 0);
    const hasOtherContent = otherStatuses.length > 0 || hasChanges
      || Boolean(existing?.origin) || Boolean(existing?.description) || meaningfulEffectDuration(existing)
      || foreignFlagScope || foreignOwnFlags || existing?.transfer === true || existing?.disabled === true;
    if (stacks === 0) {
      if (existing && hasOtherContent) {
        await actor.updateEmbeddedDocuments?.('ActiveEffect', [{ _id: existing.id,
          statuses: otherStatuses, [`flags.${MODULE_ID}.injuryProjection`]: false,
          [`flags.${LEGACY_ID}.injuryProjection`]: false }], { [MODULE_ID]: { injuryProjection: true } });
      } else if (existing) await actor.deleteEmbeddedDocuments?.('ActiveEffect', [existing.id], { [MODULE_ID]: { injuryProjection: true } });
      return;
    }
    const statuses = [...new Set([...statusValues, STATUS_ID])];
    const data: Record<string, unknown> = hasOtherContent && existing
      ? { statuses, [`flags.${MODULE_ID}.injuryProjection`]: true, [`flags.${MODULE_ID}.stacks`]: stacks }
      : { name: `${label(this.globals, 'Name', 'Injury')} (${stacks}/3)`, img: injuryIcon(stacks), statuses,
        disabled: false, transfer: false, showIcon: this.globals.CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
        flags: { [MODULE_ID]: { injuryProjection: true, stacks } } };
    if (existing) await actor.updateEmbeddedDocuments?.('ActiveEffect', [{ _id: existing.id, ...data,
      [`flags.${LEGACY_ID}.injuryProjection`]: false }], { [MODULE_ID]: { injuryProjection: true } });
    else await actor.createEmbeddedDocuments?.('ActiveEffect', [data], { [MODULE_ID]: { injuryProjection: true } });
  }

  private decorateTokenHud(app: any, html: any): void {
    const actor = app?.object?.actor;
    const element = html?.querySelector?.(`[data-status-id="${STATUS_ID}"]`);
    if (!actor || !element) return;
    let stacks = 0;
    try { stacks = readInjury(actor).stacks; } catch { return; }
    element.setAttribute?.('src', injuryIcon(Math.max(1, stacks)));
    element.dataset.tooltipText = label(this.globals, 'Level', 'Injury {stacks}/{max}')
      .replaceAll('{stacks}', String(stacks)).replaceAll('{max}', '3');
    element.classList?.toggle?.('active', stacks > 0);
  }

  private decorateActionHud(hud: any, manager: any): void {
    const actor = manager?.token?.actor ?? manager?.actor;
    if (actor?.documentName !== 'Actor') return;
    let stacks: number;
    try { stacks = readInjury(actor).stacks; } catch { return; }
    const name = label(this.globals, 'Name', 'Injury');
    const title = `${name} ${stacks}/3`;
    const mode = String(manager?.setting?.tooltips
      ?? this.globals.game?.tokenActionHud?.setting?.tooltips
      ?? this.globals.game?.settings?.get?.('token-action-hud-core', 'tooltips') ?? 'full');
    const seen = new Set<object>();
    const visit = (value: any) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value.system?.actionType === 'condition' && value.system?.actionId === STATUS_ID) {
        value.name = name;
        if (!value.info1 || (typeof value.info1 === 'object' && (!value.info1.icon && !value.info1.title
          || value.info1.class === 'fvtt-custom-conditions-injury-count'))) value.info1 = { icon: `<span class="fvtt-custom-conditions-injury-count">${stacks}/3</span>`,
          title: '', class: 'fvtt-custom-conditions-injury-count' };
        const classes = String(value.cssClass ?? 'toggle').split(/\s+/).filter((entry) => entry && entry !== 'active');
        if (stacks > 0) classes.push('active');
        value.cssClass = classes.join(' ');
        value.tooltip = mode === 'none' ? null : mode === 'nameOnly' ? { content: escapeHtml(title) } : {
          content: buildConditionTooltip({ title, label: 'Injury',
            description: label(this.globals, 'Rules', 'Injury rules unavailable.'),
            category: label(this.globals, 'ConditionCategory', 'Condition'), bilingual: name !== 'Injury' }),
          class: 'dnd5e2 dnd5e-tooltip rule-tooltip fvtt-custom-conditions-rule-tooltip themed theme-light',
        };
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
    };
    visit(hud);
  }

  private onTokenHudAction(event: any): void {
    const target = event?.target?.closest?.(`.effect-control[data-status-id="${STATUS_ID}"]`);
    if (!target) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!this.enabled() || !this.isActiveGM()) return;
    const actor = this.globals.canvas?.hud?.token?.object?.actor;
    if (!this.managed(actor)) return;
    const delta = event.type === 'click' && event.button === 0 ? 1
      : event.type === 'auxclick' && event.button === 2 ? -1 : 0;
    if (delta === 0) return;
    try {
      const current = readInjury(actor).stacks;
      void this.setStacks(actor, Math.min(3, Math.max(0, current + delta)), 'token-hud').catch((error) => this.report(error));
    } catch (error) { this.report(error); }
  }

  private async onDeleteEffect(effect: any, options: any): Promise<void> {
    if (!this.enabled() || !this.isActiveGM() || options?.[MODULE_ID]?.injuryProjection || !ownedProjection(effect)) return;
    const actor = effect.parent;
    if (!this.managed(actor)) return;
    const stacks = readInjury(actor).stacks;
    if (stacks > 0) queueMicrotask(() => { void this.resolveActor(actor)
      .then((current) => this.project(current, readInjury(current).stacks)).catch((error) => this.report(error)); });
  }

  private async importLegacySettings(): Promise<void> {
    const settings = this.globals.game?.settings;
    if (settings?.get?.(MODULE_ID, 'injurySettingsImported') === true) return;
    const old = this.globals.game?.modules?.get?.(LEGACY_ID);
    if (old?.active === true && old.api?.injuryOwner !== MODULE_ID) {
      throw new Error('Upgrade the active Injury/Fading Spirits module before importing injury settings.');
    }
    const stored = (key: string): boolean | undefined => {
      const entry = settings?.storage?.get?.('world')?.get?.(`${LEGACY_ID}.${key}`);
      const raw = entry?.value;
      return raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : undefined;
    };
    const enabled = old?.active === true ? settings.get(LEGACY_ID, 'enabled') === true : stored('enabled');
    const manageNpcs = old?.active === true ? settings.get(LEGACY_ID, 'manageNpcs') === true : stored('manageNpcs');
    if (enabled !== undefined || manageNpcs !== undefined) {
      await settings.set(MODULE_ID, 'injuryEnabled', enabled ?? false);
      await settings.set(MODULE_ID, 'injuryManageNpcs', manageNpcs ?? false);
    }
    await settings.set(MODULE_ID, 'injurySettingsImported', true);
  }

  private async resolveActor(actor: any): Promise<any> {
    const uuid = actor?.uuid;
    if (typeof uuid !== 'string' || !uuid) throw new Error('A valid Actor UUID is required.');
    if (typeof this.globals.fromUuid !== 'function') return actor;
    const current = await this.globals.fromUuid(uuid);
    if (current?.uuid !== uuid || !this.managed(current)) throw new Error('Actor is no longer available for injury write.');
    return current;
  }

  private enqueue<T>(actor: any, operation: (current: any) => Promise<T>): Promise<T> {
    const key = String(actor?.uuid);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => operation(await this.resolveActor(actor)));
    const tail = run.then(() => undefined, () => undefined);
    this.queues.set(key, tail);
    void tail.finally(() => { if (this.queues.get(key) === tail) this.queues.delete(key); });
    return run;
  }

  private report(error: unknown): void {
    this.globals.console?.error?.(`[${MODULE_ID}] injury`, error);
    this.globals.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
  }
}

function snapshotHp(value: unknown): { value: number; max: number } | null {
  const document = value as any;
  const raw = document?.system?.attributes?.hp;
  if (!raw || !Number.isFinite(Number(raw.value)) || !Number.isFinite(Number(raw.max))) return null;
  return { value: Number(raw.value), max: Number(raw.max) };
}

function sameHp(actor: any, expected: { value: number; max: number }): boolean {
  const current = snapshotHp(actor);
  return current?.value === expected.value && current.max === expected.max;
}

function transactionId(uuid: string, modified: number, userId: string | undefined,
  before: { value: number; max: number }, after: { value: number; max: number }): string {
  const data = `${uuid}|${modified}|${userId ?? ''}|${before.value}/${before.max}|${after.value}/${after.max}`;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
  return `hp:${uuid}:${(hash >>> 0).toString(16)}`;
}

function nativeRest(message: any, actor: any, type: 'short' | 'long', requesterId?: string): boolean {
  if (!message?.id || message.type !== 'rest' || message.system?.type !== type
    || !plain(message.system?.deltas) || message.speaker?.actor !== actor?.id) return false;
  if (requesterId && message.user?.id !== requesterId && message.user !== requesterId) return false;
  let associated: any;
  try { associated = message.getAssociatedActor?.(); } catch { return false; }
  return typeof associated?.uuid === 'string' && associated.uuid === actor.uuid;
}

function injuryIcon(stacks: number): string { return `modules/${MODULE_ID}/icons/injury/injury-${Math.min(3, Math.max(1, stacks))}.svg`; }

function label(globals: any, key: string, fallback: string): string {
  const full = `FVTTCONDITIONS.Injury.${key}`;
  const localized = globals.game?.i18n?.localize?.(full);
  return typeof localized === 'string' && localized !== full ? localized : fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const injuryStatusId = STATUS_ID;
export const injurySocketName = SOCKET;

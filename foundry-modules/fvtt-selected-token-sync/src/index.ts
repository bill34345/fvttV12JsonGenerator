import {
  actorKey,
  collectTargets,
  createIntentStore,
  dedupeActors,
  newTransactionId,
  normalizeMovementAction,
  statusIdFromEffect,
  tokenKey,
  validateTargets,
  type MovementIntent,
  type StatusIntent,
  type SyncTarget,
} from './core.ts';
import { MODULE_ID, MODULE_VERSION, SETTING_ENABLED, SYNC_OPTION_KEY } from './constants.ts';

const pending = createIntentStore();
const confirmedStatus = createIntentStore();
let recentContextMenu: { sourceTokenKey: string; statusId: string; active: boolean; createdAt: number } | null = null;

type HudSource = {
  readonly token: any;
  readonly document: any;
  readonly actor: any | null;
};

function isConflictActive(): boolean {
  return game.modules?.get?.('multistatus')?.active === true;
}

function isEnabled(): boolean {
  return game.settings?.get?.(MODULE_ID, SETTING_ENABLED) === true && !isConflictActive();
}

function localUserId(): string | null {
  return typeof game.user?.id === 'string' ? game.user.id : null;
}

function localize(key: string): string {
  return game.i18n?.localize?.(`${MODULE_ID}.${key}`) ?? key;
}

function notify(kind: 'warn' | 'error', message: string): void {
  const method = ui.notifications?.[kind];
  if (typeof method === 'function') method.call(ui.notifications, message);
  else console.warn(`[${MODULE_ID}] ${message}`);
}

function blockEvent(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function sourceFromHud(app: any): HudSource | null {
  const token = app?.object ?? app?.token ?? app?.document?.object ?? app?.document;
  const document = app?.document ?? token?.document ?? token;
  const actor = app?.actor ?? token?.actor ?? document?.actor ?? null;
  if (!token && !document) return null;
  return { token: token ?? document, document, actor };
}

function controlledTokens(): any[] {
  return Array.isArray(canvas.tokens?.controlled) ? [...canvas.tokens.controlled] : [];
}

function statusDefinition(statusId: string): any | null {
  const statuses = CONFIG.statusEffects;
  if (!statuses) return null;
  if (statuses[statusId]) return statuses[statusId];
  if (Array.isArray(statuses)) return statuses.find((status: any) => status?.id === statusId) ?? null;
  return null;
}

function movementActions(): Record<string, any> | undefined {
  return CONFIG.Token?.movement?.actions;
}

function selectedTargets(source: HudSource): SyncTarget[] {
  return collectTargets(controlledTokens(), source.token);
}

function sourceTarget(targets: readonly SyncTarget[], source: HudSource): SyncTarget | undefined {
  const sourceKey = tokenKey(source.document);
  return targets.find((target) => target.tokenKey === sourceKey) ?? targets.find((target) => target.actor === source.actor);
}

function failureMessage(failures: readonly { target: SyncTarget; reason: string }[]): string {
  const names = failures.map((failure) => `${failure.target.label} (${failure.reason})`).join(', ');
  return `${localize('errors.notAllEligible')}: ${names}`;
}

function captureStatusIntent(app: any, event: Event): void {
  if (!isEnabled()) return;
  const root = event.currentTarget instanceof Element ? event.currentTarget : null;
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-status-id]') : null;
  if (!root || !target || !root.contains(target)) return;

  const statusId = target.dataset.statusId;
  if (!statusId || !statusDefinition(statusId)) return;
  const source = sourceFromHud(app);
  const userId = localUserId();
  if (!source?.actor || !userId) return;

  const targets = selectedTargets(source);
  if (targets.length < 2) return;
  const failures = validateTargets(targets, 'status', game.user);
  if (failures.length) {
    blockEvent(event);
    notify('warn', failureMessage(failures));
    return;
  }

  const sourceEntry = sourceTarget(targets, source);
  if (!sourceEntry) return;
  const isContextMenu = event.type === 'contextmenu';
  const isAuxClick = event.type === 'auxclick';
  if (isAuxClick && recentContextMenu
    && (Date.now() - recentContextMenu.createdAt <= 500)
    && recentContextMenu.sourceTokenKey === sourceEntry.tokenKey
    && recentContextMenu.statusId === statusId
    && recentContextMenu.active === !target.classList.contains('active')) {
    recentContextMenu = null;
    blockEvent(event);
    return;
  }
  const intent: StatusIntent = {
    transactionId: newTransactionId(),
    kind: 'status',
    sourceTokenKey: sourceEntry.tokenKey,
    sourceActorKey: sourceEntry.actorKey,
    userId,
    targets,
    createdAt: Date.now(),
    statusId,
    active: !target.classList.contains('active'),
    overlay: isContextMenu || (event as PointerEvent).button === 2,
  };
  pending.add(intent);
  if (!isContextMenu) return;

  // Chromium's native right-click path may stop at `contextmenu` and not emit
  // the `auxclick` event which Foundry's Application dispatcher normally uses.
  // In that case, perform the same core Actor operation ourselves and keep the
  // preCreate/preDelete hook as the single propagation boundary.
  recentContextMenu = {
    sourceTokenKey: sourceEntry.tokenKey,
    statusId,
    active: intent.active,
    createdAt: Date.now(),
  };
  blockEvent(event);
  void Promise.resolve(source.actor.toggleStatusEffect(statusId, {
    active: intent.active,
    overlay: true,
  })).catch((error: unknown) => {
    pending.consume((candidate) => candidate.transactionId === intent.transactionId);
    recentContextMenu = null;
    notify('error', `${localize('errors.syncFailed')}: ${String(error)}`);
    console.error(`[${MODULE_ID}] status transaction ${intent.transactionId} failed`, error);
  });
}

function captureMovementIntent(app: any, event: Event): void {
  if (!isEnabled()) return;
  const root = event.currentTarget instanceof Element ? event.currentTarget : null;
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-movement-action]') ?? event.target.closest<HTMLElement>('[data-palette="movementActions"] [data-action]')
    : null;
  if (!root || !target || !root.contains(target)) return;

  const source = sourceFromHud(app);
  const userId = localUserId();
  if (!source || !userId) return;
  const action = normalizeMovementAction(target.dataset.movementAction);
  const targets = selectedTargets(source);
  if (targets.length < 2) return;
  const failures = validateTargets(targets, 'movement', game.user, action, movementActions());
  if (failures.length) {
    blockEvent(event);
    notify('warn', failureMessage(failures));
    return;
  }

  const sourceEntry = sourceTarget(targets, source);
  if (!sourceEntry) return;
  const intent: MovementIntent = {
    transactionId: newTransactionId(),
    kind: 'movement',
    sourceTokenKey: sourceEntry.tokenKey,
    sourceActorKey: sourceEntry.actorKey,
    userId,
    targets,
    createdAt: Date.now(),
    movementAction: action,
  };
  pending.add(intent);
}

function onRenderTokenHUD(app: any, html: any): void {
  const element = html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : app?.element;
  if (!(element instanceof HTMLElement)) return;

  const effectsTray = element.querySelector<HTMLElement>('div.status-effects');
  if (effectsTray && effectsTray.dataset.selectedTokenSyncBound !== 'true') {
    effectsTray.dataset.selectedTokenSyncBound = 'true';
    effectsTray.addEventListener('click', (event) => captureStatusIntent(app, event), { capture: true });
    effectsTray.addEventListener('contextmenu', (event) => captureStatusIntent(app, event), { capture: true });
    effectsTray.addEventListener('auxclick', (event) => captureStatusIntent(app, event), { capture: true });
  }

  const movementTray = element.querySelector<HTMLElement>('div.palette[data-palette="movementActions"]');
  if (movementTray && movementTray.dataset.selectedTokenSyncBound !== 'true') {
    movementTray.dataset.selectedTokenSyncBound = 'true';
    movementTray.addEventListener('click', (event) => captureMovementIntent(app, event), { capture: true });
  }
}

function currentStatusActive(actor: any, statusId: string): boolean | undefined {
  const statuses = actor?.statuses;
  if (statuses && typeof statuses.has === 'function') return statuses.has(statusId) === true;
  if (Array.isArray(statuses)) return statuses.includes(statusId);
  return undefined;
}

function mirrorStatus(intent: StatusIntent): void {
  const sourceKey = intent.sourceActorKey;
  const actors = dedupeActors(intent.targets).filter((actor) => actor !== null && actorKey(actor) !== sourceKey);
  const results = actors.map((actor) => Promise.resolve().then(() => {
    // The source Actor's post-create/post-delete update can already project into
    // a synthetic Actor which is based on it. Reconcile the desired state before
    // calling toggleStatusEffect so that this inherited effect is not created a
    // second time in the ActorDelta collection.
    if (currentStatusActive(actor, intent.statusId) === intent.active) return;
    return actor.toggleStatusEffect(intent.statusId, {
      active: intent.active,
      overlay: intent.overlay,
    });
  }));
  void Promise.allSettled(results).then((settled) => {
    const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected.length) {
      notify('error', `${localize('errors.syncFailed')}: ${rejected.length}`);
      console.error(`[${MODULE_ID}] status transaction ${intent.transactionId} failed`, rejected.map((result) => result.reason));
    }
  });
}

function onActiveEffectHook(document: any, userId: string | undefined, active: boolean): void {
  if (!isEnabled() || userId !== localUserId()) return;
  const targetActor = document?.target ?? document?.parent;
  const statusId = statusIdFromEffect(document);
  if (!targetActor || !statusId) return;
  const targetKey = actorKey(targetActor);
  const intent = pending.consume((candidate) => candidate.kind === 'status'
    && candidate.userId === userId
    && candidate.statusId === statusId
    && candidate.active === active
    && candidate.sourceActorKey === targetKey);
  if (intent?.kind === 'status') confirmedStatus.add(intent);
}

function onActiveEffectConfirmed(document: any, userId: string | undefined, active: boolean): void {
  if (!isEnabled() || userId !== localUserId()) return;
  const targetActor = document?.target ?? document?.parent;
  const statusId = statusIdFromEffect(document);
  if (!targetActor || !statusId) return;
  const targetKey = actorKey(targetActor);
  const intent = confirmedStatus.consume((candidate) => candidate.kind === 'status'
    && candidate.userId === userId
    && candidate.statusId === statusId
    && candidate.active === active
    && candidate.sourceActorKey === targetKey);
  if (intent?.kind === 'status') queueMicrotask(() => mirrorStatus(intent));
}

function batchMovement(intent: MovementIntent): void {
  const implementation = (globalThis as any).TokenDocument;
  if (!implementation || typeof implementation.updateDocuments !== 'function') {
    throw new Error('TokenDocument.updateDocuments is unavailable');
  }
  const updates = intent.targets.map((target) => ({
    _id: target.document?.id,
    movementAction: intent.movementAction,
  }));
  if (updates.some((update) => typeof update._id !== 'string' || update._id.length === 0)) {
    throw new Error('A selected TokenDocument has no id');
  }
  return implementation.updateDocuments(updates, {
    parent: canvas.scene,
    [SYNC_OPTION_KEY]: intent.transactionId,
  });
}

function onPreUpdateToken(document: any, changes: Record<string, any>, options: Record<string, any> | undefined, userId: string | undefined): false | void {
  if (!isEnabled() || userId !== localUserId() || options?.[SYNC_OPTION_KEY]) return;
  if (!Object.hasOwn(changes, 'movementAction')) return;
  const movementAction = normalizeMovementAction(changes.movementAction);
  const intent = pending.consume((candidate) => candidate.kind === 'movement'
    && candidate.userId === userId
    && candidate.sourceTokenKey === tokenKey(document)
    && candidate.movementAction === movementAction);
  if (!intent || intent.kind !== 'movement') return;
  void Promise.resolve(batchMovement(intent)).catch((error: unknown) => {
    notify('error', `${localize('errors.syncFailed')}: ${String(error)}`);
    console.error(`[${MODULE_ID}] movement transaction ${intent.transactionId} failed`, error);
  });
  return false;
}

function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTING_ENABLED, {
    name: `${MODULE_ID}.settings.enabled.name`,
    hint: `${MODULE_ID}.settings.enabled.hint`,
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
  });
}

function setEnabled(active: boolean): void {
  if (active && isConflictActive()) {
    notify('error', localize('errors.multistatusConflict'));
    void game.settings.set(MODULE_ID, SETTING_ENABLED, false);
    return;
  }
  if (!active) {
    pending.clear();
    confirmedStatus.clear();
    recentContextMenu = null;
  }
  void game.settings.set(MODULE_ID, SETTING_ENABLED, active).catch((error: unknown) => {
    notify('error', `${localize('errors.settingFailed')}: ${String(error)}`);
  });
}

function addSceneControl(controls: Record<string, any>): void {
  const tokenControl = controls.tokens;
  if (!tokenControl) return;
  tokenControl.tools ??= {};
  tokenControl.tools.selectedTokenSync = {
    name: 'selectedTokenSync',
    title: `${MODULE_ID}.controls.toggle.name`,
    icon: 'fa-solid fa-people-arrows',
    order: Object.keys(tokenControl.tools).length + 1,
    toggle: true,
    active: isEnabled(),
    onChange: (_event: Event, active: boolean) => setEnabled(active),
  };
}

Hooks.once('init', registerSettings);
Hooks.on('getSceneControlButtons', addSceneControl);
Hooks.on('renderTokenHUD', onRenderTokenHUD);
Hooks.on('preCreateActiveEffect', (document: any, _data: any, _options: any, userId: string) => onActiveEffectHook(document, userId, true));
Hooks.on('preDeleteActiveEffect', (document: any, _options: any, userId: string) => onActiveEffectHook(document, userId, false));
Hooks.on('createActiveEffect', (document: any, _options: any, userId: string) => onActiveEffectConfirmed(document, userId, true));
Hooks.on('deleteActiveEffect', (document: any, _options: any, userId: string) => onActiveEffectConfirmed(document, userId, false));
Hooks.on('preUpdateToken', onPreUpdateToken);
Hooks.once('ready', () => {
  if (!isConflictActive()) return;
  pending.clear();
  confirmedStatus.clear();
  recentContextMenu = null;
  if (game.settings?.get?.(MODULE_ID, SETTING_ENABLED) === true) void game.settings.set(MODULE_ID, SETTING_ENABLED, false);
  notify('error', localize('errors.multistatusConflict'));
});

export { MODULE_ID, MODULE_VERSION };

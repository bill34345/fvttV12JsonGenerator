import {
  CONDITION_DEFINITIONS,
  CUSTOM_CONDITION_IDS,
  isSafeConditionFormula,
  projectedConditionStatusId,
  readConditionInstance,
  type ConditionId,
} from '@fvtt-json-generator/contracts/conditions';
import { MODULE_ID } from './constants.ts';
import {
  escapeHtml,
  localize,
  localizedConditionDescription,
  localizedConditionLabel,
} from './localization.ts';

const TOKEN_ACTION_HUD_CORE_ID = 'token-action-hud-core';
const DICE_BADGE_CLASS = 'fvtt-custom-conditions-dice-face';
const PARAMETERIZED_CONDITIONS = new Set<ConditionId>(['bleeding', 'burning', 'frozen', 'jinxed', 'valor']);
const ownedConditionIds = new Set<ConditionId>();
const registeredActionHooks = new WeakSet<object>();
const pendingHudToggles = new WeakMap<object, Map<ConditionId, Promise<void>>>();

export function markConditionStatusOwned(conditionId: ConditionId): void {
  ownedConditionIds.add(conditionId);
}

export function registerConditionHudHook(globals: any = globalThis): unknown {
  if (typeof globals.Hooks?.on !== 'function') return undefined;
  return globals.Hooks.on('tokenActionHudCorePreRender', (hud: any, hudManager: any) => {
    decorateConditionHud(hud, globals, hudManager);
  });
}

/** Install the public TAH roll-handler extender before the HUD creates its handler. */
export function registerConditionActionInterceptor(globals: any = globalThis): unknown {
  const hooks = globals.Hooks;
  if (!hooks || !['object', 'function'].includes(typeof hooks)
    || typeof hooks.on !== 'function' || registeredActionHooks.has(hooks)) return undefined;
  registeredActionHooks.add(hooks);
  const refreshForOwnedEffect = (effect: any) => {
    const instance = readConditionInstance(effect);
    if (!instance || instance.template === true) return;
    const actor = effect?.parent;
    const tokenActionHud = globals.game?.tokenActionHud;
    if (actor?.documentName !== 'Actor' || typeof tokenActionHud?.isControlledActor !== 'function'
      || !tokenActionHud.isControlledActor(actor)) return;
    hooks.callAll?.('forceUpdateTokenActionHud');
  };
  for (const event of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    hooks.on(event, refreshForOwnedEffect);
  }
  return hooks.on('tokenActionHudCoreAddRollHandlerExtenders', (rollHandler: any) => {
    const Extender = globals.game?.modules?.get?.(TOKEN_ACTION_HUD_CORE_ID)?.api?.RollHandlerExtender;
    if (typeof Extender !== 'function' || typeof rollHandler?.addRollHandlerExtender !== 'function') return;
    const extender = new Extender();
    extender.hudManager = rollHandler.hudManager;
    extender.prehandleActionEvent = function () {
      const statusId = this.action?.system?.actionId;
      const conditionId = typeof statusId === 'string' ? logicalConditionId(statusId) : undefined;
      if (this.action?.system?.actionType !== 'condition'
        || !conditionId
        || !isOwnedConditionId(statusId, globals)) return false;
      if (PARAMETERIZED_CONDITIONS.has(conditionId)) routeConditionManager(conditionId, this.hudManager, globals);
      else routeCustomConditionAction(conditionId, this.hudManager, globals);
      return true;
    };
    rollHandler.addRollHandlerExtender(extender);
  });
}

export function decorateConditionHud(hud: any, globals: any = globalThis, hudManager?: any): void {
  if (!hud || typeof hud !== 'object') return;
  const tooltipsSetting = readTooltipsSetting(globals, hudManager);
  const actor = resolveHudActor(hudManager);
  const seen = new Set<object>();
  walkHud(hud, (action) => {
    const statusId = action?.system?.actionType === 'condition' ? action?.system?.actionId : undefined;
    if (typeof statusId !== 'string') return;
    clearOurDiceBadge(action);
    const id = logicalConditionId(statusId);
    if (!id || !isOwnedConditionId(statusId, globals)) return;
    const fallbackName = localizedConditionLabel(id, globals);
    const englishLabel = CONDITION_DEFINITIONS[id].label;
    const title = typeof action.name === 'string' && action.name ? action.name : fallbackName;
    if (actor && (id === 'jinxed' || id === 'valor')) {
      const badge = conditionDiceBadge(actor, id, globals);
      if (badge && isEmptyInfoSlot(action.info1)) action.info1 = badge;
    }
    const classes = String(action.cssClass ?? 'toggle').split(/\s+/).filter((name) => name && name !== 'active');
    const actors = selectedActors(hudManager);
    if (actors.length && actors.every((selected) => activeConditionSources(selected, id).length > 0)) classes.push('active');
    action.cssClass = classes.join(' ');
    if (tooltipsSetting === 'none') {
      action.tooltip = null;
      return;
    }
    if (tooltipsSetting === 'nameOnly') {
      action.tooltip = { content: escapeHtml(title) };
      return;
    }
    const conditionEntry = actor && (id === 'jinxed' || id === 'valor' || id === 'burning')
      ? enabledCondition(actor, id)
      : undefined;
    const formula = conditionEntry?.instance.params.formula;
    const damageType = id === 'burning' ? conditionEntry?.instance.params.damageType : undefined;
    const category = localize(globals, 'DND5E.Rule.Type.Condition', 'Condition');
    const fallbackCategory = localize(globals, 'FVTTCONDITIONS.Manager.Condition', 'Condition');
    action.tooltip = {
      content: buildConditionTooltip({
        title: title === englishLabel && fallbackName !== englishLabel ? fallbackName : title,
        label: englishLabel, description: localizedConditionDescription(id, globals),
        category: category === 'Condition' ? fallbackCategory : category,
        bilingual: fallbackName !== englishLabel,
        formula: typeof formula === 'string'
          ? `${formula}${typeof damageType === 'string' && damageType ? ` · ${damageType}` : ''}`
          : undefined,
        formulaLabel: fallbackName,
      }),
      class: 'dnd5e2 dnd5e-tooltip rule-tooltip fvtt-custom-conditions-rule-tooltip themed theme-light',
    };
  }, seen);
}

export function buildConditionTooltip(input: {
  title: string; label: string; description: string; img?: string;
  category?: string; bilingual?: boolean; formula?: string; formulaLabel?: string;
}): string {
  const title = escapeHtml(input.title);
  const label = escapeHtml(input.label);
  const description = input.description.trim().split(/\r?\n\s*\r?\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`).join('');
  const englishLabel = input.bilingual && input.title !== input.label ? ` ${label}` : '';
  const formula = typeof input.formula === 'string'
    ? `<p class="fvtt-custom-conditions-formula"><strong>${escapeHtml(input.formulaLabel ?? input.title)}:</strong> ${escapeHtml(input.formula)}</p>`
    : '';
  return `<section class="content"><section class="header"><h2>${title}${englishLabel}</h2><ul class="pills"><li class="pill condition">${escapeHtml(input.category ?? 'Condition')}</li></ul></section><section class="description">${description}${formula}</section></section>`;
}

function conditionDiceBadge(actor: any, conditionId: 'jinxed' | 'valor', globals: any = globalThis): {
  icon: string; title: string; class: string;
} | undefined {
  const instance = enabledCondition(actor, conditionId)?.instance;
  const formula = instance?.params.formula;
  if (typeof formula !== 'string' || !formula || formula.length > 200 || !isSafeConditionFormula(formula)) return undefined;
  const compact = formula.replace(/\s+/g, '');
  const simpleDie = /^1d([46])$/i.exec(compact);
  const text = simpleDie ? simpleDie[1]! : compact.length <= 12 ? compact : `${compact.slice(0, 11)}…`;
  const completeLabel = `${localizedConditionLabel(conditionId, globals)}: ${formula}`;
  return {
    icon: `<span class="${DICE_BADGE_CLASS}" aria-label="${escapeHtml(completeLabel)}">${escapeHtml(text)}</span>`,
    title: '',
    class: DICE_BADGE_CLASS,
  };
}

function readTooltipsSetting(globals: any, hudManager: any): string {
  return String(
    hudManager?.setting?.tooltips
      ?? globals?.game?.tokenActionHud?.setting?.tooltips
      ?? globals?.game?.settings?.get?.(TOKEN_ACTION_HUD_CORE_ID, 'tooltips')
      ?? 'full',
  );
}

function isOwnedConditionId(statusId: string, globals: any): boolean {
  const conditionId = logicalConditionId(statusId);
  if (!conditionId) return false;
  const status = findStatus(globals, statusId);
  if (status) return status.flags?.[MODULE_ID]?.owned === true;
  return !globals?.CONFIG?.statusEffects && ownedConditionIds.has(conditionId);
}

function findStatus(globals: any, statusId: string): any {
  const statuses = globals?.CONFIG?.statusEffects;
  if (Array.isArray(statuses)) return statuses.find((entry: any) => entry?.id === statusId);
  if (statuses && typeof statuses === 'object') return statuses[statusId];
  return undefined;
}

function logicalConditionId(statusId: string): ConditionId | undefined {
  return CUSTOM_CONDITION_IDS.find((conditionId) => projectedConditionStatusId(conditionId) === statusId);
}

function resolveHudActor(hudManager: any): any | undefined {
  if (!hudManager || values(hudManager.actors).length > 1 || values(hudManager.tokens).length > 1) return undefined;
  const actor = hudManager.token?.actor ?? hudManager.actor;
  return actor?.documentName === 'Actor' ? actor : undefined;
}

function selectedActors(hudManager: any): any[] {
  if (!hudManager) return [];
  const actors = values(hudManager.actors).filter((actor) => actor?.documentName === 'Actor');
  if (actors.length > 1 || values(hudManager.tokens).length > 1) return actors;
  const actor = resolveHudActor(hudManager);
  return actor ? [actor] : actors;
}

function activeConditionSources(actor: any, conditionId: ConditionId): ConditionId[] {
  const sources: ConditionId[] = [];
  for (const effect of values(actor?.effects)) {
    const instance = readConditionInstance(effect);
    if (!instance || instance.template || instance.enabled === false || effect?.disabled === true
      || effect?.isSuppressed === true || effect?.active === false) continue;
    if (instance.conditionId === conditionId
      || CONDITION_DEFINITIONS[instance.conditionId].composite?.includes(conditionId)) sources.push(instance.conditionId);
  }
  return sources;
}

function values(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value === 'string') return [];
  if (typeof value.values === 'function') return Array.from(value.values());
  if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
  return [];
}

function enabledCondition(actor: any, conditionId: ConditionId): { effect: any; instance: NonNullable<ReturnType<typeof readConditionInstance>> } | undefined {
  for (const effect of values(actor?.effects)) {
    const instance = readConditionInstance(effect);
    if (instance?.conditionId === conditionId
      && instance.template !== true
      && instance.enabled !== false
      && effect?.disabled !== true
      && effect?.isSuppressed !== true
      && effect?.active !== false) return { effect, instance };
  }
  return undefined;
}

function clearOurDiceBadge(action: any): void {
  if (String(action?.info1?.class ?? '').split(/\s+/).includes(DICE_BADGE_CLASS)) action.info1 = undefined;
}

function isEmptyInfoSlot(info: unknown): boolean {
  return info == null || (typeof info === 'object' && !Array.isArray(info) && Object.keys(info).length === 0);
}

function routeCustomConditionAction(conditionId: ConditionId, hudManager: any, globals: any): void {
  const name = CONDITION_DEFINITIONS[conditionId].label;
  const label = localizedConditionLabel(conditionId, globals);
  const actor = resolveHudActor(hudManager);
  if (!isActiveGM(globals) || !actor) {
    notify(globals, hudKey(conditionId, 'Unavailable'), `Custom ${name} can only be toggled by the active GM for one selected Actor.`, { condition: label });
    return;
  }
  const api = globals.game?.modules?.get?.(MODULE_ID)?.api;
  if (!api || typeof api.list !== 'function' || typeof api.apply !== 'function'
    || typeof api.setEnabled !== 'function') {
    notify(globals, hudKey(conditionId, 'Failed'), `Custom ${name} could not be toggled. Check the GM console.`, { condition: label });
    return;
  }
  void enqueueHudToggle(actor, conditionId, () => toggleCondition(api, actor, conditionId, globals)).catch((error) => {
    globals.console?.error?.(`[${MODULE_ID}] TAH ${name} action failed`, error);
    notify(globals, hudKey(conditionId, 'Failed'), `Custom ${name} could not be toggled. Check the GM console.`, { condition: label });
  });
}

function routeConditionManager(conditionId: ConditionId, hudManager: any, globals: any): void {
  const name = CONDITION_DEFINITIONS[conditionId].label;
  const label = localizedConditionLabel(conditionId, globals);
  const actor = resolveHudActor(hudManager);
  if (!isActiveGM(globals) || !actor) {
    notify(globals, conditionId === 'burning' ? 'FVTTCONDITIONS.Hud.BurningUnavailable' : 'FVTTCONDITIONS.Hud.ConfigureUnavailable',
      `Custom ${name} can only be configured by the active GM for one selected Actor.`, { condition: label });
    return;
  }
  const api = globals.game?.modules?.get?.(MODULE_ID)?.api;
  if (typeof api?.openManager !== 'function') {
    notify(globals, conditionId === 'burning' ? 'FVTTCONDITIONS.Hud.BurningFailed' : 'FVTTCONDITIONS.Hud.ConfigureFailed',
      `Custom ${name} manager is unavailable. Check the GM console.`, { condition: label });
    return;
  }
  try {
    void Promise.resolve(api.openManager({ actor, conditionId })).catch((error) => {
      globals.console?.error?.(`[${MODULE_ID}] TAH ${name} action failed`, error);
      notify(globals, conditionId === 'burning' ? 'FVTTCONDITIONS.Hud.BurningFailed' : 'FVTTCONDITIONS.Hud.ConfigureFailed',
        `Custom ${name} manager is unavailable. Check the GM console.`, { condition: label });
    });
  } catch (error) {
    globals.console?.error?.(`[${MODULE_ID}] TAH ${name} action failed`, error);
    notify(globals, conditionId === 'burning' ? 'FVTTCONDITIONS.Hud.BurningFailed' : 'FVTTCONDITIONS.Hud.ConfigureFailed',
      `Custom ${name} manager is unavailable. Check the GM console.`, { condition: label });
  }
}

function enqueueHudToggle(actor: object, conditionId: ConditionId, operation: () => Promise<void>): Promise<void> {
  let queue = pendingHudToggles.get(actor);
  if (!queue) {
    queue = new Map();
    pendingHudToggles.set(actor, queue);
  }
  // Re-read the CC API only after the prior write settles, so rapid clicks alternate state.
  const previous = queue.get(conditionId);
  const pending = previous ? previous.catch(() => {}).then(operation) : operation();
  queue.set(conditionId, pending);
  const cleanup = () => {
    if (queue.get(conditionId) !== pending) return;
    queue.delete(conditionId);
    if (!queue.size) pendingHudToggles.delete(actor);
  };
  void pending.then(cleanup, cleanup);
  return pending;
}

async function toggleCondition(api: any, actor: any, conditionId: ConditionId, globals: any): Promise<void> {
  const name = CONDITION_DEFINITIONS[conditionId].label;
  const label = localizedConditionLabel(conditionId, globals);
  const entries = api.list(actor).filter((entry: any) => entry?.instance?.conditionId === conditionId);
  const enabled = entries.filter((entry: any) => !entry.disabled);
  if (enabled.length > 1 || (!enabled.length && entries.length > 1)) {
    notify(globals, hudKey(conditionId, 'Multiple'), `Multiple Custom ${name} instances found. Manage them in the Custom Conditions panel.`, { condition: label });
    return;
  }
  if (enabled.length === 1) {
    await api.setEnabled(actor, enabled[0]!.id, false);
    return;
  }
  const compositeSources = activeConditionSources(actor, conditionId).filter((source) => source !== conditionId);
  if (compositeSources.length) {
    const sources = compositeSources.map((source) => localizedConditionLabel(source, globals)).join(', ');
    notify(globals, 'FVTTCONDITIONS.Hud.CompositeSource',
      `${name} is currently supplied by ${compositeSources.map((source) => CONDITION_DEFINITIONS[source].label).join(', ')}. Manage the source condition in Custom Conditions.`,
      { condition: label, sources });
    return;
  }
  if (entries.length) {
    await api.setEnabled(actor, entries[0]!.id, true);
    return;
  }
  await api.apply(actor, conditionId, {});
}

function isActiveGM(globals: any): boolean {
  const user = globals.game?.user;
  const activeGM = globals.game?.users?.activeGM;
  return user?.isGM === true && user.active !== false && Boolean(activeGM)
    && (activeGM === user || activeGM?.id === user?.id);
}

function hudKey(conditionId: ConditionId, reason: 'Unavailable' | 'Failed' | 'Multiple'): string {
  if (conditionId === 'dazed' || conditionId === 'shocked') {
    return `FVTTCONDITIONS.Hud.${CONDITION_DEFINITIONS[conditionId].label}${reason}`;
  }
  return `FVTTCONDITIONS.Hud.Toggle${reason}`;
}

function notify(globals: any, key: string, fallback: string, replacements: Record<string, string> = {}): void {
  const localize = globals.game?.i18n?.localize;
  const message = typeof localize === 'function' ? localize.call(globals.game.i18n, key) : key;
  const template = typeof message === 'string' && message !== key ? message : fallback;
  globals.ui?.notifications?.warn?.(template.replace(/\{(\w+)\}/g, (match, token: string) => replacements[token] ?? match));
}

function walkHud(value: any, visitAction: (action: any) => void, seen: Set<object>): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (value?.system?.actionType === 'condition' && value?.system?.actionId) visitAction(value);
  if (Array.isArray(value)) {
    for (const child of value) walkHud(child, visitAction, seen);
    return;
  }
  for (const key of ['groups', 'actions', 'lists', 'tabs']) walkHud(value[key], visitAction, seen);
}

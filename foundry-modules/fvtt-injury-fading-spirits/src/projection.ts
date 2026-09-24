import { INJURY_STATUS_ID, MAX_INJURY_STACKS, MODULE_ID } from './constants.ts';
import { normalizeInjuryStacks } from './state.ts';

const INJURY_ICON_ROOT = `modules/${MODULE_ID}/icons`;

export interface InjuryStatusPresentation {
  id: typeof INJURY_STATUS_ID;
  name: string;
  description: string;
  img: string;
}

const FALLBACK_STATUS_NAME = 'Injury';
const FALLBACK_STATUS_DESCRIPTION = 'When a character first falls from positive hit points to 0 hit points, an injury episode begins. Recovering to positive hit points during that episode adds one injury stack.\n\nInjury stacks range from 0 to 3; at 0–2 stacks, the current stack count becomes the character\'s death save failures. At 3 stacks, the GM must rule on direct death, an environmental exception, or a deferment before death is written.\n\nFull healing, a successful short rest, or a successful long rest clears injury.\n\nA retained natural 19 or 20 on a death save counts as a critical success.';

export function injuryBaseIcon(): string {
  return `${INJURY_ICON_ROOT}/injury.svg`;
}

export function injuryIcon(stacks: number): string {
  const level = Math.max(1, normalizeInjuryStacks(stacks));
  return `${INJURY_ICON_ROOT}/injury-${level}.svg`;
}

export function nextInjuryStacks(stacks: number, button: number): number {
  const current = normalizeInjuryStacks(stacks);
  return normalizeInjuryStacks(current + (button === 0 ? 1 : -1));
}

/** Return the current, already-localized presentation without exposing an i18n key. */
export function statusPresentation(): InjuryStatusPresentation {
  return {
    id: INJURY_STATUS_ID,
    name: localized('IFS.Status.Injury.Name', FALLBACK_STATUS_NAME),
    description: localized('IFS.Status.Injury.Description', FALLBACK_STATUS_DESCRIPTION),
    img: injuryBaseIcon(),
  };
}

export function registerInjuryStatus(): void {
  if (!Array.isArray(CONFIG.statusEffects)) return;
  const presentation = statusPresentation();
  const data = {
    id: INJURY_STATUS_ID,
    name: presentation.name,
    label: presentation.name,
    description: presentation.description,
    tooltip: presentation.description,
    img: presentation.img,
    hud: true,
  };
  const existing = CONFIG.statusEffects.findIndex((entry: any) => entry?.id === INJURY_STATUS_ID);
  if (existing >= 0) CONFIG.statusEffects[existing] = { ...CONFIG.statusEffects[existing], ...data };
  else CONFIG.statusEffects.push(data);
}

export async function projectInjuryStatus(actor: any, stacks: number): Promise<void> {
  if (!actor || !game.user?.isGM) return;
  const level = normalizeInjuryStacks(stacks);
  const effects = Array.from(actor.effects ?? []) as any[];
  const owned = effects.filter((effect) => effect?.statuses?.has?.(INJURY_STATUS_ID)
    || effect?.flags?.[MODULE_ID]?.injuryProjection === true);
  if (level <= 0) {
    if (owned.length) await actor.deleteEmbeddedDocuments('ActiveEffect', owned.map((effect) => effect.id), { [MODULE_ID]: { projection: true } });
    return;
  }
  const presentation = statusPresentation();
  const data = {
    name: `${presentation.name} (${level}/${MAX_INJURY_STACKS})`,
    description: presentation.description,
    img: injuryIcon(level),
    statuses: [INJURY_STATUS_ID],
    disabled: false,
    transfer: false,
    showIcon: (globalThis as any).CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
    flags: { [MODULE_ID]: { injuryProjection: true, stacks: level } },
  };
  if (!owned.length) await actor.createEmbeddedDocuments('ActiveEffect', [data], { [MODULE_ID]: { projection: true } });
  else {
    await actor.updateEmbeddedDocuments('ActiveEffect', [{ _id: owned[0].id, ...data }], { [MODULE_ID]: { projection: true } });
    if (owned.length > 1) await actor.deleteEmbeddedDocuments('ActiveEffect', owned.slice(1).map((effect) => effect.id), { [MODULE_ID]: { projection: true } });
  }
}

export function decorateInjuryTokenHud(app: any, html: any): void {
  const actor = app?.object?.actor;
  const element = html?.querySelector?.(`[data-status-id="${INJURY_STATUS_ID}"]`);
  if (!actor || !element) return;
  const level = normalizeInjuryStacks(actor.flags?.[MODULE_ID]?.injury?.stacks);
  const icon = level > 0 ? injuryIcon(level) : injuryBaseIcon();
  element.setAttribute?.('src', icon);
  if (element.style) {
    element.style.objectPosition = '';
    element.style.background = '';
  }
  const presentation = statusPresentation();
  const levelLabel = formatStatusLevel(level);
  const tooltip = `${levelLabel}\n\n${presentation.description}`;
  element.dataset.tooltipText = tooltip;
  element.dataset.tooltip = tooltip;
  element.setAttribute?.('title', tooltip);
  element.classList?.toggle?.('active', level > 0);
}

/** Decorate only the IFS condition action through Token Action HUD Core's public hook. */
export function decorateInjuryTokenActionHud(hud: any, hudManager: any): void {
  const presentation = statusPresentation();
  const tooltipMode = tokenActionHudTooltipMode(hudManager);
  // Prefer the token's Actor so unlinked tokens use their synthetic Actor flags.
  // In multi-select mode both references are absent, so clear any stale count.
  const actor = hudManager?.token?.actor ?? hudManager?.actor;
  const stacks = actor ? normalizeInjuryStacks(actor.flags?.[MODULE_ID]?.injury?.stacks) : null;
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value as object)) return;
    visited.add(value as object);
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const record = value as Record<string, any>;
    if (record.system?.actionType === 'condition' && record.system?.actionId === INJURY_STATUS_ID) {
      record.name = presentation.name;
      record.img = presentation.img;
      const info1 = record.info1 && typeof record.info1 === 'object' ? record.info1 : {};
      record.info1 = {
        ...info1,
        text: '',
        title: '',
        icon: stacks === null ? '' : `<span class="ifs-injury-stack-badge" aria-hidden="true">${stacks}/${MAX_INJURY_STACKS}</span>`,
      };
      if (tooltipMode === 'none') {
        record.tooltip = '';
        return;
      }
      if (tooltipMode === 'nameOnly') {
        record.tooltip = { content: escapeHtml(presentation.name) };
      } else {
        const title = escapeHtml(presentation.name);
        const category = escapeHtml(localized('DND5E.Rule.Type.Condition', 'Condition'));
        const description = presentation.description.split(/\r?\n\s*\r?\n/)
          .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`).join('');
        record.tooltip = {
          content: `<section class="content"><section class="header"><h2>${title}</h2><ul class="pills"><li class="pill condition">${category}</li></ul></section><section class="description">${description}</section></section>`,
          class: 'dnd5e2 dnd5e-tooltip rule-tooltip ifs-injury-rule-tooltip',
        };
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(hud);
  if (hudManager?.hud !== hud) visit(hudManager?.hud);
  if (hudManager?.groups !== hud) visit(hudManager?.groups);
}

function tokenActionHudTooltipMode(hudManager: any): string | undefined {
  const direct = hudManager?.tooltipsSetting ?? hudManager?.dnd5e?.tooltipsSetting;
  if (typeof direct === 'string') return direct;
  const setting = (globalThis as any).game?.tokenActionHud?.setting?.tooltips;
  if (typeof setting === 'string') return setting;
  try {
    const configured = (globalThis as any).game?.settings?.get?.('token-action-hud-core', 'tooltips');
    return typeof configured === 'string' ? configured : undefined;
  } catch {
    return undefined;
  }
}

function localized(key: string, fallback: string): string {
  let value: unknown;
  try { value = game.i18n?.localize?.(key); } catch { value = undefined; }
  return typeof value === 'string' && value.trim() && value !== key ? value : fallback;
}

function formatStatusLevel(stacks: number): string {
  const fallback = `${statusPresentation().name} ${stacks}/${MAX_INJURY_STACKS}`;
  try {
    const value = game.i18n?.format?.('IFS.Status.InjuryLevel', { stacks, max: MAX_INJURY_STACKS });
    return typeof value === 'string' && value !== 'IFS.Status.InjuryLevel' ? value : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

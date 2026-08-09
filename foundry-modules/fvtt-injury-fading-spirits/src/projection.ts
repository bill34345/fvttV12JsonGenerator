import { INJURY_STATUS_ID, MAX_INJURY_STACKS, MODULE_ID } from './constants.ts';
import { normalizeInjuryStacks } from './state.ts';

const INJURY_ICON_ROOT = `modules/${MODULE_ID}/icons`;

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

export function registerInjuryStatus(): void {
  if (!Array.isArray(CONFIG.statusEffects)) return;
  const data = {
    id: INJURY_STATUS_ID,
    name: 'IFS.Status.Injury',
    img: injuryBaseIcon(),
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
  const data = {
    name: `${game.i18n.localize('IFS.Status.Injury')} (${level}/${MAX_INJURY_STACKS})`,
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
  element.dataset.tooltipText = game.i18n.format('IFS.Status.InjuryLevel', { stacks: level, max: MAX_INJURY_STACKS });
  element.classList?.toggle?.('active', level > 0);
}

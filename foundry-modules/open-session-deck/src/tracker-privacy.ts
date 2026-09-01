import { MODULE_ID, SETTINGS } from './constants.ts';

export function registerTrackerPrivacyHooks(): void {
  Hooks.on('preCreateCombatant', (combatant: any, data: any) => {
    if (!game.user?.isGM) return;
    const actor = combatant.actor;
    const joinedRound = Math.max(1, Number(combatant.parent?.round ?? game.combat?.round ?? 1));
    const update: Record<string, unknown> = { [`flags.${MODULE_ID}.joinedRound`]: joinedRound };
    if (actor && !isFriendlyActor(actor) && !data?.flags?.[MODULE_ID]?.revealed) update.hidden = true;
    combatant.updateSource?.(update);
  });

  Hooks.on('createCombatant', (combatant: any) => {
    if (!game.user?.isGM) return;
    if (combatant.getFlag?.(MODULE_ID, 'joinedRound') == null) {
      void combatant.setFlag?.(MODULE_ID, 'joinedRound', Math.max(1, Number(combatant.parent?.round ?? 1)));
    }
  });

  Hooks.on('updateCombat', (combat: any) => {
    if (!game.user?.isGM) return;
    const current = combat.combatant;
    if (!current?.actor || !isFriendlyActor(current.actor)) return;
    if (!current.getFlag?.(MODULE_ID, 'hasActed')) void current.setFlag?.(MODULE_ID, 'hasActed', true);
  });

  Hooks.on('renderCombatTracker', (_app: unknown, element: unknown) => {
    if (game.user?.isGM) return;
    const root = asElement(element);
    if (root) applyPlayerTrackerPrivacy(root, game.combat);
  });
}

export function applyPlayerTrackerPrivacy(root: HTMLElement, combat: any): void {
  if (!combat) return;
  root.querySelector('.osd-unknown-heading')?.remove();
  const turns = collectionValues(combat.turns ?? combat.combatants);
  const currentTurn = Number.isInteger(combat.turn) ? Number(combat.turn) : -1;
  const round = Math.max(1, Number(combat.round ?? 1));
  const unknown: Array<{ element: HTMLElement; name: string }> = [];

  for (const item of root.querySelectorAll<HTMLElement>('[data-combatant-id]')) {
    item.classList.remove('osd-initiative-unknown');
    const id = String(item.dataset.combatantId ?? '');
    const combatant = turns.find((entry) => String(entry.id) === id);
    if (!combatant?.actor || !isFriendlyActor(combatant.actor)) continue;
    const joinedRound = Math.max(1, Number(combatant.flags?.[MODULE_ID]?.joinedRound ?? 1));
    const hasActed = Boolean(combatant.flags?.[MODULE_ID]?.hasActed);
    const turnIndex = turns.findIndex((entry) => String(entry.id) === id);
    const actedThisRound = turnIndex >= 0 && currentTurn >= 0 && turnIndex <= currentTurn;
    const reveal = friendlyInitiativeIsRevealed({ round, joinedRound, hasActed, actedThisRound });
    if (reveal) continue;
    item.classList.add('osd-initiative-unknown');
    unknown.push({ element: item, name: String(combatant.name ?? combatant.actor.name ?? '') });
  }

  const parent = unknown[0]?.element.parentElement;
  if (!parent) return;
  const heading = document.createElement('li');
  heading.className = 'osd-unknown-heading';
  heading.textContent = game.i18n?.localize?.('OSD.Tracker.UnknownInitiative') ?? 'Unknown initiative';
  parent.append(heading);
  for (const entry of unknown.sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang ?? 'en'))) parent.append(entry.element);
}

export function friendlyInitiativeIsRevealed(options: {
  round: number;
  joinedRound: number;
  hasActed: boolean;
  actedThisRound: boolean;
}): boolean {
  if (options.hasActed) return true;
  if (options.round === 1) return options.actedThisRound;
  return options.joinedRound <= 1;
}

export function isFriendlyActor(actor: any): boolean {
  if (!actor) return false;
  const nonGmUsers = collectionValues(game.users).filter((user) => !user.isGM);
  if (nonGmUsers.some((user) => String(user.character?.uuid ?? '') === String(actor.uuid) || Number(actor.ownership?.[user.id] ?? 0) >= 3)) return true;
  const selectedFolderId = String(game.settings?.get?.(MODULE_ID, SETTINGS.partyFolderId) ?? '');
  if (!selectedFolderId) return false;
  const includeDescendants = game.settings?.get?.(MODULE_ID, SETTINGS.includePartySubfolders) !== false;
  const folders = collectionValues(game.folders).filter((folder) => String(folder?.type ?? '') === 'Actor');
  const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
  let folder = actor.folder;
  const seen = new Set<string>();
  while (folder) {
    const id = String(folder.id ?? folder);
    if (!id || seen.has(id)) return false;
    if (id === selectedFolderId) return true;
    if (!includeDescendants) return false;
    seen.add(id);
    const parentId = String(folder.folder?.id ?? folder.folder ?? folder.parent?.id ?? folder.parent ?? '');
    folder = parentId ? folderById.get(parentId) : null;
  }
  return false;
}

function asElement(value: unknown): HTMLElement | null {
  if (value instanceof HTMLElement) return value;
  const candidate = (value as { 0?: unknown } | null)?.[0];
  return candidate instanceof HTMLElement ? candidate : null;
}

function collectionValues(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.contents)) return value.contents;
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  return Object.values(value);
}

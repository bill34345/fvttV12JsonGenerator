import {
  MODULE_ID,
  SETTINGS,
  SUPPORTED_FOUNDRY_VERSION,
  SUPPORTED_SYSTEM_ID,
  SUPPORTED_SYSTEM_VERSION,
} from './constants.ts';
import type {
  DeckActorCard,
  DeckActorCommands,
  DeckCommand,
  DeckCommandAvailability,
  DeckCommandResult,
  DeckDensity,
  DeckEncounterCommands,
  DeckSnapshot,
  DeckStatusOption,
  DeckTab,
  RosterSource,
} from './types.ts';

export interface Dnd5eRuntime {
  game: any;
  config: any;
  canvas: any;
  resolveUuid(uuid: string): Promise<any>;
  localize(key: string): string;
}

export function createGlobalRuntime(): Dnd5eRuntime {
  return {
    game,
    config: CONFIG,
    canvas,
    resolveUuid: async (uuid: string) => {
      const resolver = (globalThis as any).fromUuid ?? (globalThis as any).foundry?.utils?.fromUuid;
      if (typeof resolver !== 'function') throw new Error('Foundry UUID resolver is unavailable.');
      return resolver(uuid);
    },
    localize: (key: string) => game.i18n?.localize?.(key) ?? key,
  };
}

export function supportError(runtime: Dnd5eRuntime): string | undefined {
  const foundryVersion = String(runtime.game.version ?? runtime.game.release?.version ?? '');
  const systemId = String(runtime.game.system?.id ?? '');
  const systemVersion = String(runtime.game.system?.version ?? '');
  if (foundryVersion !== SUPPORTED_FOUNDRY_VERSION) return `Foundry ${foundryVersion || 'unknown'} is unsupported; required ${SUPPORTED_FOUNDRY_VERSION}.`;
  if (systemId !== SUPPORTED_SYSTEM_ID) return `System ${systemId || 'unknown'} is unsupported; required ${SUPPORTED_SYSTEM_ID}.`;
  if (systemVersion !== SUPPORTED_SYSTEM_VERSION) return `dnd5e ${systemVersion || 'unknown'} is unsupported; required ${SUPPORTED_SYSTEM_VERSION}.`;
  return undefined;
}

export class Dnd5eAdapter {
  constructor(private readonly runtime: Dnd5eRuntime) {}

  buildSnapshot(): DeckSnapshot {
    const { game: runtimeGame, canvas: runtimeCanvas } = this.runtime;
    const error = supportError(this.runtime);
    const users = collectionValues(runtimeGame.users);
    const scene = runtimeCanvas?.scene ?? runtimeGame.scenes?.current ?? null;
    if (error) {
      return {
        supported: false,
        supportError: error,
        world: { id: String(runtimeGame.world?.id ?? ''), title: String(runtimeGame.world?.title ?? '') },
        system: { id: String(runtimeGame.system?.id ?? ''), version: String(runtimeGame.system?.version ?? '') },
        scene: scene ? { id: String(scene.id), name: String(scene.name ?? '') } : null,
        onlineUsers: users.filter((user) => user.active).length,
        party: [],
        encounter: emptyEncounter('OSD.Errors.Unsupported'),
        statusOptions: [],
        rosterManager: [],
        stalePinned: [],
        staleHidden: [],
        density: settingOr(runtimeGame, SETTINGS.cardDensity, 'comfortable') as DeckDensity,
        activeTab: settingOr(runtimeGame, SETTINGS.activeTab, 'party') as DeckTab,
        refreshedAt: Date.now(),
      };
    }
    const actors = collectionValues(runtimeGame.actors);
    const nonGmUsers = users.filter((user) => !user.isGM);
    const pinned = stringSetting(runtimeGame, SETTINGS.pinnedActors);
    const hidden = stringSetting(runtimeGame, SETTINGS.hiddenActors);
    const pinnedSet = new Set(pinned);
    const hiddenSet = new Set(hidden);
    const compatibleActors = actors.filter(isCompatibleActor);
    const actorByUuid = new Map(compatibleActors.map((actor) => [String(actor.uuid), actor]));
    const automaticSet = new Set<string>();

    for (const user of nonGmUsers) {
      if (user.character?.type === 'character' && isCompatibleActor(user.character)) automaticSet.add(String(user.character.uuid));
    }
    for (const actor of compatibleActors) {
      if (actor.type !== 'character') continue;
      if (nonGmUsers.some((user) => Number(actor.ownership?.[user.id] ?? 0) >= 3)) automaticSet.add(String(actor.uuid));
    }

    const combat = runtimeGame.combat ?? null;
    const combatants = combat ? collectionValues(combat.combatants) : [];
    const combatActorIds = new Set(combatants.map((combatant) => String(combatant.actor?.uuid ?? '')).filter(Boolean));
    const partyUuids = new Set<string>();
    for (const uuid of automaticSet) if (!hiddenSet.has(uuid)) partyUuids.add(uuid);
    for (const uuid of pinnedSet) if (actorByUuid.has(uuid)) partyUuids.add(uuid);

    const party = [...partyUuids]
      .map((uuid) => actorByUuid.get(uuid))
      .filter(Boolean)
      .map((actor) => this.projectActor(actor, users, {
        sources: [automaticSet.has(actor.uuid) ? 'automatic' : null, pinnedSet.has(actor.uuid) ? 'pinned' : null].filter(Boolean) as RosterSource[],
        inCombat: combatActorIds.has(String(actor.uuid)),
      }))
      .sort(compareActorCards);

    const encounterCards = combatants.map((combatant) => {
      const actor = combatant.actor;
      if (!actor || !isCompatibleActor(actor)) return null;
      const token = combatant.token;
      const tokenSceneId = String(token?.parent?.id ?? combat?.scene?.id ?? '');
      return this.projectActor(actor, users, {
        sources: ['encounter'],
        inCombat: true,
        combatantId: String(combatant.id),
        initiative: Number.isFinite(combatant.initiative) ? Number(combatant.initiative) : null,
        hasInitiative: Number.isFinite(combatant.initiative),
        tokenUuid: token?.uuid ? String(token.uuid) : undefined,
        tokenSceneId: tokenSceneId || undefined,
        canLocate: Boolean(token?.uuid && runtimeCanvas?.scene?.id && tokenSceneId === String(runtimeCanvas.scene.id)),
        current: String(combat.combatant?.id ?? '') === String(combatant.id),
      });
    }).filter(Boolean) as DeckActorCard[];

    const manager = compatibleActors.map((actor) => ({
      uuid: String(actor.uuid),
      name: String(actor.name ?? ''),
      img: String(actor.img ?? 'icons/svg/mystery-man.svg'),
      type: String(actor.type ?? ''),
      automatic: automaticSet.has(String(actor.uuid)),
      pinned: pinnedSet.has(String(actor.uuid)),
      hidden: hiddenSet.has(String(actor.uuid)),
    })).sort((a, b) => a.name.localeCompare(b.name, runtimeGame.i18n?.lang ?? 'en'));

    const combatTurn = Number.isInteger(combat?.turn) ? Number(combat.turn) : -1;
    const hasCurrentCombatant = Boolean(combat?.combatant && combatTurn >= 0);
    return {
      supported: true,
      world: { id: String(runtimeGame.world?.id ?? ''), title: String(runtimeGame.world?.title ?? '') },
      system: { id: String(runtimeGame.system?.id ?? ''), version: String(runtimeGame.system?.version ?? '') },
      scene: scene ? { id: String(scene.id), name: String(scene.name ?? '') } : null,
      onlineUsers: users.filter((user) => user.active).length,
      party,
      encounter: {
        active: Boolean(combat),
        uuid: combat?.uuid ? String(combat.uuid) : undefined,
        id: combat?.id ? String(combat.id) : undefined,
        round: Number(combat?.round ?? 0),
        turn: combatTurn,
        displayTurn: hasCurrentCombatant ? combatTurn + 1 : 0,
        currentCombatantId: combat?.combatant?.id ? String(combat.combatant.id) : undefined,
        combatants: encounterCards,
        commands: combat ? encounterCommands(combat, hasCurrentCombatant) : emptyEncounterCommands('OSD.Errors.NoActiveCombat'),
      },
      statusOptions: this.statusOptions(),
      rosterManager: manager,
      stalePinned: pinned.filter((uuid) => !actorByUuid.has(uuid)),
      staleHidden: hidden.filter((uuid) => !actorByUuid.has(uuid)),
      density: settingOr(runtimeGame, SETTINGS.cardDensity, 'comfortable') as DeckDensity,
      activeTab: settingOr(runtimeGame, SETTINGS.activeTab, 'party') as DeckTab,
      refreshedAt: Date.now(),
    };
  }

  projectActor(actor: any, users: any[], options: Partial<DeckActorCard> & { sources: RosterSource[]; inCombat: boolean }): DeckActorCard {
    const hp = actor.system?.attributes?.hp ?? {};
    const max = finiteNumber(hp.max);
    const value = finiteNumber(hp.value);
    const statuses = actorStatuses(actor, this.statusMap());
    const players = users.filter((user) => !user.isGM && (String(user.character?.uuid ?? '') === String(actor.uuid) || Number(actor.ownership?.[user.id] ?? 0) >= 3))
      .map((user) => ({ id: String(user.id), name: String(user.name ?? ''), active: Boolean(user.active) }));
    const death = actor.system?.attributes?.death;
    const exhaustion = finiteNumber(actor.system?.attributes?.exhaustion);
    const exhaustionMax = Number(this.runtime.config.DND5E?.conditionTypes?.exhaustion?.levels);
    const canLocate = Boolean(options.canLocate);
    return {
      uuid: String(actor.uuid),
      id: String(actor.id),
      name: String(actor.name ?? ''),
      img: String(actor.img ?? 'icons/svg/mystery-man.svg'),
      type: String(actor.type ?? ''),
      players,
      playerNames: players.map((player) => player.name).join(', '),
      anyPlayerActive: players.some((player) => player.active),
      hp: { value, max, temp: finiteNumber(hp.temp), percent: max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0 },
      ac: Number.isFinite(actor.system?.attributes?.ac?.value) ? Number(actor.system.attributes.ac.value) : null,
      inspiration: Boolean(actor.system?.attributes?.inspiration),
      exhaustion,
      death: death ? { success: finiteNumber(death.success), failure: finiteNumber(death.failure) } : null,
      concentrating: Number(actor.concentration?.effects?.size ?? 0) > 0,
      statuses,
      inCombat: options.inCombat,
      sources: options.sources,
      commands: actorCommands(actor, exhaustion, exhaustionMax, this.statusOptions().length > 0, canLocate),
      combatantId: options.combatantId,
      initiative: options.initiative,
      hasInitiative: options.hasInitiative,
      tokenUuid: options.tokenUuid,
      tokenSceneId: options.tokenSceneId,
      canLocate,
      current: options.current,
    };
  }

  async execute(command: DeckCommand): Promise<DeckCommandResult> {
    this.assertCommandAllowed();
    if (command.id.startsWith('actor.')) {
      const actor = await this.resolveActor(command.targetUuid);
      this.assertCommandAllowed();
      if (command.id === 'actor.damage') await actor.applyDamage(positiveInteger(command.amount));
      else if (command.id === 'actor.heal') await actor.applyDamage(-positiveInteger(command.amount));
      else if (command.id === 'actor.temp-hp') await actor.applyTempHP(positiveInteger(command.amount));
      else if (command.id === 'actor.toggle-inspiration') await actor.update({ 'system.attributes.inspiration': actor.system.attributes.inspiration ? 0 : 1 });
      else if (command.id === 'actor.adjust-exhaustion') {
        const delta = command.delta === -1 ? -1 : command.delta === 1 ? 1 : NaN;
        if (!Number.isFinite(delta)) throw new Error('Exhaustion delta must be -1 or 1.');
        const max = Number(this.runtime.config.DND5E?.conditionTypes?.exhaustion?.levels);
        if (!Number.isFinite(max)) throw new Error('dnd5e exhaustion limit is unavailable.');
        const current = finiteNumber(actor.system?.attributes?.exhaustion);
        const next = current + delta;
        if (next < 0) throw new Error('Exhaustion is already at its minimum.');
        if (next > max) throw new Error('Exhaustion is already at its maximum.');
        await actor.update({ 'system.attributes.exhaustion': next });
      } else if (command.id === 'actor.toggle-status') {
        const allowed = new Set(this.statusOptions().map((option) => option.id));
        if (!command.statusId || !allowed.has(command.statusId)) throw new Error('The selected status is not available for Deck control.');
        await actor.toggleStatusEffect(command.statusId);
      } else if (command.id === 'actor.open-sheet') actor.sheet?.render?.(true);
      return { messageKey: 'OSD.Notifications.ActorUpdated', targetUuid: command.targetUuid };
    }

    if (command.id === 'combat.previous-turn' || command.id === 'combat.next-turn') {
      const combat = this.resolveCombat(command.combatUuid);
      if (command.id === 'combat.previous-turn') await combat.previousTurn();
      else await combat.nextTurn();
      return { messageKey: 'OSD.Notifications.CombatUpdated' };
    }

    if (command.id === 'token.locate') {
      if (!command.tokenUuid) throw new Error('Token UUID is required.');
      const token = await this.runtime.resolveUuid(command.tokenUuid);
      this.assertCommandAllowed();
      if (!token || String(token.parent?.id ?? '') !== String(this.runtime.canvas?.scene?.id ?? '')) throw new Error('The token is not on the active scene.');
      const x = finiteNumber(token.x) + finiteNumber(token.width) * finiteNumber(this.runtime.canvas?.dimensions?.size || 100) / 2;
      const y = finiteNumber(token.y) + finiteNumber(token.height) * finiteNumber(this.runtime.canvas?.dimensions?.size || 100) / 2;
      await this.runtime.canvas.animatePan({ x, y });
      return { messageKey: 'OSD.Notifications.TokenLocated' };
    }

    if (command.id === 'roster.toggle-pin' || command.id === 'roster.toggle-hide') {
      const actor = await this.resolveActor(command.targetUuid);
      this.assertCommandAllowed();
      const key = command.id === 'roster.toggle-pin' ? SETTINGS.pinnedActors : SETTINGS.hiddenActors;
      const values = new Set(stringSetting(this.runtime.game, key));
      if (values.has(actor.uuid)) values.delete(actor.uuid); else values.add(actor.uuid);
      await this.runtime.game.settings.set(MODULE_ID, key, [...values].sort());
      return { messageKey: 'OSD.Notifications.RosterUpdated', targetUuid: actor.uuid };
    }

    if (command.id === 'roster.cleanup') {
      const actorUuids = new Set(collectionValues(this.runtime.game.actors).map((actor) => String(actor.uuid)));
      for (const key of [SETTINGS.pinnedActors, SETTINGS.hiddenActors]) {
        this.assertCommandAllowed();
        await this.runtime.game.settings.set(MODULE_ID, key, stringSetting(this.runtime.game, key).filter((uuid) => actorUuids.has(uuid)));
      }
      return { messageKey: 'OSD.Notifications.RosterUpdated' };
    }

    throw new Error(`Unsupported Deck command: ${command.id}`);
  }

  statusOptions(): DeckStatusOption[] {
    return collectionValues(this.runtime.config.statusEffects)
      .filter((status) => status?.id && !status.pseudo && status.id !== 'concentrating' && status.id !== 'exhaustion' && !String(status.id).startsWith('exhaustion-'))
      .map((status) => ({ id: String(status.id), label: this.runtime.localize(String(status.name ?? status.label ?? status.id)), icon: status.img ? String(status.img) : undefined }))
      .sort((a, b) => a.label.localeCompare(b.label, this.runtime.game.i18n?.lang ?? 'en'));
  }

  private statusMap(): Map<string, DeckStatusOption> {
    return new Map(collectionValues(this.runtime.config.statusEffects)
      .filter((status) => status?.id)
      .map((status) => [String(status.id), {
        id: String(status.id),
        label: this.runtime.localize(String(status.name ?? status.label ?? status.id)),
        icon: status.img ? String(status.img) : undefined,
      }]));
  }

  private assertCommandAllowed(): void {
    if (!this.runtime.game.user?.isGM) throw new Error('Open Session Deck commands are GM-only.');
    const error = supportError(this.runtime);
    if (error) throw new Error(error);
  }

  private async resolveActor(uuid?: string): Promise<any> {
    if (!uuid) throw new Error('Actor UUID is required.');
    const actor = await this.runtime.resolveUuid(uuid);
    if (!actor || actor.documentName !== 'Actor' || !isCompatibleActor(actor)) throw new Error(`Actor is missing or incompatible: ${uuid}`);
    return actor;
  }

  private resolveCombat(uuid?: string): any {
    const combat = this.runtime.game.combat;
    if (!combat || (uuid && String(combat.uuid) !== uuid)) throw new Error('The active combat changed or no longer exists.');
    return combat;
  }
}

function available(enabled: boolean, actionKey: string, unavailableKey: string): DeckCommandAvailability {
  return { enabled, tooltipKey: enabled ? actionKey : unavailableKey };
}

function actorCommands(actor: any, exhaustion: number, exhaustionMax: number, hasStatuses: boolean, canLocate: boolean): DeckActorCommands {
  const canApplyDamage = typeof actor.applyDamage === 'function';
  const canApplyTempHp = typeof actor.applyTempHP === 'function';
  const canUpdate = typeof actor.update === 'function';
  const hasExhaustionModel = canUpdate && Number.isFinite(exhaustionMax);
  const canToggleStatus = typeof actor.toggleStatusEffect === 'function' && hasStatuses;
  const canOpenSheet = typeof actor.sheet?.render === 'function';
  return {
    damage: available(canApplyDamage, 'OSD.Actions.Damage', 'OSD.Errors.NativeApiUnavailable'),
    heal: available(canApplyDamage, 'OSD.Actions.Heal', 'OSD.Errors.NativeApiUnavailable'),
    tempHp: available(canApplyTempHp, 'OSD.Actions.TempHP', 'OSD.Errors.NativeApiUnavailable'),
    toggleInspiration: available(canUpdate, 'OSD.Actions.Inspiration', 'OSD.Errors.NativeApiUnavailable'),
    exhaustionDown: available(hasExhaustionModel && exhaustion > 0, 'OSD.Actions.ExhaustionDown', hasExhaustionModel ? 'OSD.Errors.ExhaustionMinimum' : 'OSD.Errors.NativeApiUnavailable'),
    exhaustionUp: available(hasExhaustionModel && exhaustion < exhaustionMax, 'OSD.Actions.ExhaustionUp', hasExhaustionModel ? 'OSD.Errors.ExhaustionMaximum' : 'OSD.Errors.NativeApiUnavailable'),
    toggleStatus: available(canToggleStatus, 'OSD.Actions.ToggleStatus', hasStatuses ? 'OSD.Errors.NativeApiUnavailable' : 'OSD.Errors.NoControllableStatuses'),
    openSheet: available(canOpenSheet, 'OSD.Actions.OpenSheet', 'OSD.Errors.SheetUnavailable'),
    locate: available(canLocate, 'OSD.Actions.Locate', 'OSD.Errors.TokenNotActive'),
  };
}

function encounterCommands(combat: any, hasCurrentCombatant: boolean): DeckEncounterCommands {
  return {
    previousTurn: available(hasCurrentCombatant && typeof combat.previousTurn === 'function', 'OSD.Actions.PreviousTurn', 'OSD.Errors.CombatTurnUnavailable'),
    nextTurn: available(hasCurrentCombatant && typeof combat.nextTurn === 'function', 'OSD.Actions.NextTurn', 'OSD.Errors.CombatTurnUnavailable'),
    focusCurrent: available(hasCurrentCombatant, 'OSD.Actions.FocusCurrent', 'OSD.Errors.CurrentCombatantUnavailable'),
  };
}

function emptyEncounterCommands(reasonKey: string): DeckEncounterCommands {
  return {
    previousTurn: available(false, 'OSD.Actions.PreviousTurn', reasonKey),
    nextTurn: available(false, 'OSD.Actions.NextTurn', reasonKey),
    focusCurrent: available(false, 'OSD.Actions.FocusCurrent', reasonKey),
  };
}

function emptyEncounter(reasonKey: string): DeckSnapshot['encounter'] {
  return { active: false, round: 0, turn: -1, displayTurn: 0, combatants: [], commands: emptyEncounterCommands(reasonKey) };
}

function actorStatuses(actor: any, map: Map<string, DeckStatusOption>): DeckStatusOption[] {
  const ids = new Set(collectionValues(actor.statuses).map((id) => String(id)));
  return [...ids].map((id) => map.get(id) ?? { id, label: id }).sort((a, b) => a.label.localeCompare(b.label));
}

function isCompatibleActor(actor: any): boolean { return Boolean(actor?.uuid && actor?.system?.attributes?.hp); }
function finiteNumber(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function positiveInteger(value: unknown): number { const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw new Error('Amount must be a positive integer.'); return number; }
function compareActorCards(a: DeckActorCard, b: DeckActorCard): number { return a.name.localeCompare(b.name); }
function collectionValues(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.contents)) return value.contents;
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  return Object.values(value);
}
function stringSetting(runtimeGame: any, key: string): string[] {
  const value = runtimeGame.settings?.get?.(MODULE_ID, key);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function settingOr(runtimeGame: any, key: string, fallback: string): string {
  const value = runtimeGame.settings?.get?.(MODULE_ID, key);
  return typeof value === 'string' && value ? value : fallback;
}

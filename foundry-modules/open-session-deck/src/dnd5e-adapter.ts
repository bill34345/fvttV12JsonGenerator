import {
  MODULE_ID,
  SERVER_NEXT_FOUNDRY_VERSION,
  SERVER_NEXT_EXHAUSTION_EFFECT_ID,
  SERVER_NEXT_SYSTEM_VERSIONS,
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
  if (systemId !== SUPPORTED_SYSTEM_ID) return `System ${systemId || 'unknown'} is unsupported; required ${SUPPORTED_SYSTEM_ID}.`;
  if (isLegacyRuntime(runtime) || isServerNextRuntime(runtime)) return undefined;
  if (foundryVersion !== SUPPORTED_FOUNDRY_VERSION && foundryVersion !== SERVER_NEXT_FOUNDRY_VERSION) return `Foundry ${foundryVersion || 'unknown'} is unsupported; required ${SUPPORTED_FOUNDRY_VERSION} or ${SERVER_NEXT_FOUNDRY_VERSION}.`;
  return `dnd5e ${systemVersion || 'unknown'} is unsupported with Foundry ${foundryVersion}; required ${SUPPORTED_FOUNDRY_VERSION}/${SUPPORTED_SYSTEM_VERSION} or ${SERVER_NEXT_FOUNDRY_VERSION}/${SERVER_NEXT_SYSTEM_VERSIONS.join(' or ')}.`;
}

function isLegacyRuntime(runtime: Dnd5eRuntime): boolean {
  return String(runtime.game.version ?? runtime.game.release?.version ?? '') === SUPPORTED_FOUNDRY_VERSION
    && String(runtime.game.system?.version ?? '') === SUPPORTED_SYSTEM_VERSION;
}

function isServerNextRuntime(runtime: Dnd5eRuntime): boolean {
  return String(runtime.game.version ?? runtime.game.release?.version ?? '') === SERVER_NEXT_FOUNDRY_VERSION
    && SERVER_NEXT_SYSTEM_VERSIONS.some((version) => version === String(runtime.game.system?.version ?? ''));
}

function serverNextExhaustion(actor: any, dnd5eVersion: string): number | undefined {
  if (dnd5eVersion === '6.0.5') {
    const effects = actor.effects;
    if (!effects || typeof effects.get !== 'function') return undefined;
    const effect = effects.get(SERVER_NEXT_EXHAUSTION_EFFECT_ID);
    if (!effect) return 0;
    const level = effect.system?.level;
    return Number.isInteger(level) && level >= 0 ? level : undefined;
  }
  if (dnd5eVersion !== '6.0.2') return undefined;
  const conditions = actor.system?.conditions;
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return undefined;
  if (!Object.hasOwn(conditions, 'exhaustion')) return 0;
  const level = conditions.exhaustion;
  return Number.isInteger(level) && level >= 0 ? level : undefined;
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
        partyFolder: { includeDescendants: true, missing: false, options: [] },
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
    const compatibleActors = actors.filter(isCompatibleActor);
    const folders = collectionValues(runtimeGame.folders).filter((folder) => String(folder?.type ?? '') === 'Actor');
    const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
    const selectedFolderId = settingOr(runtimeGame, SETTINGS.partyFolderId, '');
    const selectedFolder = folderById.get(selectedFolderId);
    const includeDescendants = booleanSetting(runtimeGame, SETTINGS.includePartySubfolders, true);
    const statusOptions = this.statusOptions();

    const combat = runtimeGame.combat ?? null;
    const combatants = combat ? collectionValues(combat.turns ?? combat.combatants) : [];
    const combatActorIds = new Set(combatants.map((combatant) => String(combatant.actorId ?? combatant.actor?.id ?? '')).filter(Boolean));
    const partyActors = selectedFolder
      ? compatibleActors.filter((actor) => actorInFolder(actor, selectedFolderId, includeDescendants, folderById))
      : [];
    const partyActorIds = new Set(partyActors.map((actor) => String(actor.id)));
    const party = partyActors
      .map((actor) => this.projectActor(actor, users, {
        sources: ['folder'],
        inCombat: combatActorIds.has(String(actor.id)),
      }, statusOptions));

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
        partyMember: partyActorIds.has(String(combatant.actorId)),
        characterControls: String(actor.type) === 'character',
        hidden: Boolean(combatant.hidden),
        revealed: Boolean(combatant.flags?.[MODULE_ID]?.revealed),
      }, statusOptions);
    }).filter(Boolean) as DeckActorCard[];

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
      statusOptions,
      partyFolder: {
        selectedId: selectedFolderId || undefined,
        selectedName: selectedFolder ? String(selectedFolder.name ?? '') : undefined,
        includeDescendants,
        missing: Boolean(selectedFolderId && !selectedFolder),
        options: folders.map((folder) => ({ id: String(folder.id), name: String(folder.name ?? ''), depth: folderDepth(folder, folderById) })),
      },
      rosterManager: [],
      stalePinned: [],
      staleHidden: [],
      density: settingOr(runtimeGame, SETTINGS.cardDensity, 'comfortable') as DeckDensity,
      activeTab: settingOr(runtimeGame, SETTINGS.activeTab, 'party') as DeckTab,
      refreshedAt: Date.now(),
    };
  }

  projectActor(
    actor: any,
    users: any[],
    options: Partial<DeckActorCard> & { sources: RosterSource[]; inCombat: boolean },
    statusOptions = this.statusOptions(),
  ): DeckActorCard {
    const hp = actor.system?.attributes?.hp ?? {};
    const baseMax = finiteNumber(hp.max);
    const maxModifier = finiteNumber(hp.tempmax);
    const effectiveMax = Math.max(0, baseMax + maxModifier);
    const value = finiteNumber(hp.value);
    const statuses = actorStatuses(actor, this.statusMap());
    const activeStatusIds = new Set(statuses.map((status) => status.id));
    const players = users.filter((user) => !user.isGM && (String(user.character?.uuid ?? '') === String(actor.uuid) || Number(actor.ownership?.[user.id] ?? 0) >= 3))
      .map((user) => ({ id: String(user.id), name: String(user.name ?? ''), active: Boolean(user.active) }));
    const death = actor.system?.attributes?.death;
    const serverNext = isServerNextRuntime(this.runtime);
    const nativeExhaustion = serverNext ? serverNextExhaustion(actor, String(this.runtime.game.system?.version ?? '')) : undefined;
    const exhaustion = serverNext ? nativeExhaustion ?? 0 : finiteNumber(actor.system?.attributes?.exhaustion);
    const exhaustionMax = Number(this.runtime.config.DND5E?.conditionTypes?.exhaustion?.levels);
    const canLocate = Boolean(options.canLocate);
    const combat = this.runtime.game.combat;
    const commands: DeckActorCommands = {
      ...actorCommands(actor, exhaustion, exhaustionMax, statusOptions.length > 0, canLocate,
        serverNext
          ? typeof actor.toggleStatusEffect === 'function' && nativeExhaustion !== undefined
          : typeof actor.update === 'function'),
      ...(options.combatantId ? {
        setInitiative: available(typeof combat?.setInitiative === 'function', 'OSD.Actions.SetInitiative', 'OSD.Errors.NativeApiUnavailable'),
        rollInitiative: available(typeof combat?.rollInitiative === 'function', 'OSD.Actions.RollInitiative', 'OSD.Errors.NativeApiUnavailable'),
        toggleVisibility: available(typeof combat?.updateEmbeddedDocuments === 'function', 'OSD.Actions.ToggleVisibility', 'OSD.Errors.NativeApiUnavailable'),
      } : {}),
    };
    return {
      uuid: String(actor.uuid),
      id: String(actor.id),
      name: String(actor.name ?? ''),
      img: String(actor.img ?? 'icons/svg/mystery-man.svg'),
      type: String(actor.type ?? ''),
      players,
      playerNames: players.map((player) => player.name).join(', '),
      anyPlayerActive: players.some((player) => player.active),
      hp: {
        value,
        max: effectiveMax,
        baseMax,
        maxModifier,
        maxModifierDisplay: signedNumber(maxModifier),
        effectiveMax,
        temp: finiteNumber(hp.temp),
        percent: effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round((value / effectiveMax) * 100))) : 0,
      },
      ac: Number.isFinite(actor.system?.attributes?.ac?.value) ? Number(actor.system.attributes.ac.value) : null,
      acModifier: actorAcModifier(actor),
      inspiration: Boolean(actor.system?.attributes?.inspiration),
      exhaustion,
      death: death ? { success: finiteNumber(death.success), failure: finiteNumber(death.failure) } : null,
      concentrating: Number(actor.concentration?.effects?.size ?? 0) > 0,
      statuses,
      statusChoices: statusOptions.map((status) => ({ ...status, active: activeStatusIds.has(status.id) })),
      inCombat: options.inCombat,
      sources: options.sources,
      commands,
      combatantId: options.combatantId,
      initiative: options.initiative,
      hasInitiative: options.hasInitiative,
      tokenUuid: options.tokenUuid,
      tokenSceneId: options.tokenSceneId,
      canLocate,
      current: options.current,
      partyMember: options.partyMember,
      characterControls: options.characterControls ?? String(actor.type) === 'character',
      hidden: options.hidden,
      revealed: options.revealed,
    };
  }

  async execute(command: DeckCommand): Promise<DeckCommandResult> {
    this.assertCommandAllowed();
    if (command.id.startsWith('actor.')) {
      const actor = await this.resolveActor(command.targetUuid);
      this.assertCommandAllowed();
      if (command.id === 'actor.set-hp') {
        const hp = actor.system?.attributes?.hp ?? {};
        const effectiveMax = Math.max(0, finiteNumber(hp.max) + finiteNumber(hp.tempmax));
        const desired = boundedInteger(command.value, 0, effectiveMax, 'Current HP');
        const delta = finiteNumber(hp.value) - desired;
        if (delta !== 0) await actor.applyDamage(delta);
      } else if (command.id === 'actor.set-temp-hp') {
        const desired = nonNegativeInteger(command.value, 'Temporary HP');
        const current = finiteNumber(actor.system?.attributes?.hp?.temp);
        if (desired > current && typeof actor.applyTempHP === 'function') await actor.applyTempHP(desired);
        else if (desired !== current) await actor.update({ 'system.attributes.hp.temp': desired });
      } else if (command.id === 'actor.set-max-modifier') {
        const modifier = integer(command.value, 'Maximum HP modifier');
        const baseMax = finiteNumber(actor.system?.attributes?.hp?.max);
        const effectiveMax = Math.max(0, baseMax + modifier);
        const current = finiteNumber(actor.system?.attributes?.hp?.value);
        await actor.update({
          'system.attributes.hp.tempmax': modifier,
          ...(current > effectiveMax ? { 'system.attributes.hp.value': effectiveMax } : {}),
        });
      } else if (command.id === 'actor.set-ac-modifier') {
        await setActorAcModifier(actor, integer(command.value, 'AC modifier'));
      } else if (command.id === 'actor.set-status') {
        const allowed = new Set(this.statusOptions().map((option) => option.id));
        if (!command.statusId || !allowed.has(command.statusId)) throw new Error('The selected status is not available for Deck control.');
        if (typeof command.active !== 'boolean') throw new Error('Status target state is required.');
        const current = new Set(collectionValues(actor.statuses).map(String)).has(command.statusId);
        if (current !== command.active) await actor.toggleStatusEffect(command.statusId, { active: command.active });
      } else if (command.id === 'actor.toggle-concentration') {
        await toggleActorConcentration(actor);
      } else if (command.id === 'actor.set-death-save') {
        if (command.field !== 'success' && command.field !== 'failure') throw new Error('Death save field is invalid.');
        const value = boundedInteger(command.value, 0, 3, 'Death save');
        await actor.update({ [`system.attributes.death.${command.field}`]: value });
      } else if (command.id === 'actor.damage') await actor.applyDamage(positiveInteger(command.amount));
      else if (command.id === 'actor.heal') await actor.applyDamage(-positiveInteger(command.amount));
      else if (command.id === 'actor.temp-hp') await actor.applyTempHP(positiveInteger(command.amount));
      else if (command.id === 'actor.toggle-inspiration') await actor.update({ 'system.attributes.inspiration': actor.system.attributes.inspiration ? 0 : 1 });
      else if (command.id === 'actor.adjust-exhaustion') {
        const delta = command.delta === -1 ? -1 : command.delta === 1 ? 1 : NaN;
        if (!Number.isFinite(delta)) throw new Error('Exhaustion delta must be -1 or 1.');
        const max = Number(this.runtime.config.DND5E?.conditionTypes?.exhaustion?.levels);
        if (!Number.isFinite(max)) throw new Error('dnd5e exhaustion limit is unavailable.');
        const serverNext = isServerNextRuntime(this.runtime);
        const nativeExhaustion = serverNext ? serverNextExhaustion(actor, String(this.runtime.game.system?.version ?? '')) : undefined;
        if (serverNext && nativeExhaustion === undefined) throw new Error('dnd5e exhaustion state is unavailable.');
        const current = serverNext ? nativeExhaustion! : finiteNumber(actor.system?.attributes?.exhaustion);
        const next = current + delta;
        if (next < 0) throw new Error('Exhaustion is already at its minimum.');
        if (next > max) throw new Error('Exhaustion is already at its maximum.');
        if (serverNext) {
          if (typeof actor.toggleStatusEffect !== 'function') throw new Error('dnd5e exhaustion status API is unavailable.');
          await actor.toggleStatusEffect('exhaustion', { levels: delta });
        } else await actor.update({ 'system.attributes.exhaustion': next });
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

    if (command.id.startsWith('combat.')) {
      const combat = this.resolveCombat(command.combatUuid);
      this.assertCommandAllowed();
      if (command.id === 'combat.set-initiative') {
        if (!command.combatantId) throw new Error('Combatant ID is required.');
        await combat.setInitiative(command.combatantId, finite(command.value, 'Initiative'));
      } else if (command.id === 'combat.swap-initiative') {
        const first = resolveCombatant(combat, command.combatantId);
        const second = resolveCombatant(combat, command.secondCombatantId);
        if (first.id === second.id) throw new Error('Choose two different combatants.');
        if (!Number.isFinite(first.initiative) || !Number.isFinite(second.initiative)) throw new Error('Both combatants need initiative values before swapping.');
        await combat.updateEmbeddedDocuments('Combatant', [
          { _id: first.id, initiative: second.initiative },
          { _id: second.id, initiative: first.initiative },
        ]);
      } else if (command.id === 'combat.roll-initiative' || command.id === 'combat.roll-npc-initiative') {
        const combatants = collectionValues(combat.combatants);
        const ids = command.id === 'combat.roll-initiative'
          ? [resolveCombatant(combat, command.combatantId).id]
          : combatants.filter((entry) => entry.actor?.type === 'npc' && !Number.isFinite(entry.initiative)).map((entry) => String(entry.id));
        if (ids.length === 0) return { messageKey: 'OSD.Notifications.NoInitiativeNeeded' };
        const npcIds = new Set(combatants.filter((entry) => entry.actor?.type === 'npc').map((entry) => String(entry.id)));
        const hiddenUpdates = ids.filter((id) => npcIds.has(id)).map((id) => ({ _id: id, hidden: true, [`flags.${MODULE_ID}.revealed`]: false }));
        if (hiddenUpdates.length > 0) await combat.updateEmbeddedDocuments('Combatant', hiddenUpdates);
        await combat.rollInitiative(ids, { messageOptions: { rollMode: 'gmroll' } });
      } else if (command.id === 'combat.toggle-visibility') {
        const combatant = resolveCombatant(combat, command.combatantId);
        const hidden = !Boolean(combatant.hidden);
        await combat.updateEmbeddedDocuments('Combatant', [{
          _id: combatant.id,
          hidden,
          [`flags.${MODULE_ID}.revealed`]: !hidden,
        }]);
      } else {
        throw new Error(`Unsupported Deck command: ${command.id}`);
      }
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

    if (command.id === 'roster.set-folder') {
      const folderId = String(command.folderId ?? '');
      if (folderId) {
        const folder = collectionValues(this.runtime.game.folders).find((entry) => String(entry.id) === folderId && String(entry.type) === 'Actor');
        if (!folder) throw new Error('The selected Actor folder no longer exists.');
      }
      await this.runtime.game.settings.set(MODULE_ID, SETTINGS.partyFolderId, folderId);
      await this.runtime.game.settings.set(MODULE_ID, SETTINGS.includePartySubfolders, command.includeDescendants !== false);
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

function actorCommands(actor: any, exhaustion: number, exhaustionMax: number, hasStatuses: boolean, canLocate: boolean, canManageExhaustion: boolean): DeckActorCommands {
  const canApplyDamage = typeof actor.applyDamage === 'function';
  const canApplyTempHp = typeof actor.applyTempHP === 'function';
  const canUpdate = typeof actor.update === 'function';
  const hasExhaustionModel = canManageExhaustion && Number.isFinite(exhaustionMax);
  const canToggleStatus = typeof actor.toggleStatusEffect === 'function' && hasStatuses;
  const canOpenSheet = typeof actor.sheet?.render === 'function';
  const canEditEmbedded = typeof actor.createEmbeddedDocuments === 'function' && typeof actor.deleteEmbeddedDocuments === 'function';
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
    setHp: available(canApplyDamage, 'OSD.Actions.SetHP', 'OSD.Errors.NativeApiUnavailable'),
    setTempHp: available(canApplyTempHp || canUpdate, 'OSD.Actions.SetTempHP', 'OSD.Errors.NativeApiUnavailable'),
    setMaxModifier: available(canUpdate, 'OSD.Actions.SetMaxModifier', 'OSD.Errors.NativeApiUnavailable'),
    setAcModifier: available(canEditEmbedded, 'OSD.Actions.SetACModifier', 'OSD.Errors.NativeApiUnavailable'),
    toggleConcentration: available(typeof actor.toggleStatusEffect === 'function', 'OSD.Actions.ToggleConcentration', 'OSD.Errors.NativeApiUnavailable'),
    setDeathSave: available(canUpdate && Boolean(actor.system?.attributes?.death), 'OSD.Actions.SetDeathSave', 'OSD.Errors.NativeApiUnavailable'),
    setInitiative: available(false, 'OSD.Actions.SetInitiative', 'OSD.Errors.NoActiveCombat'),
    rollInitiative: available(false, 'OSD.Actions.RollInitiative', 'OSD.Errors.NoActiveCombat'),
    toggleVisibility: available(false, 'OSD.Actions.ToggleVisibility', 'OSD.Errors.NoActiveCombat'),
  };
}

function encounterCommands(combat: any, hasCurrentCombatant: boolean): DeckEncounterCommands {
  const canUpdateCombatants = typeof combat.updateEmbeddedDocuments === 'function';
  const canRoll = typeof combat.rollInitiative === 'function';
  return {
    previousTurn: available(hasCurrentCombatant && typeof combat.previousTurn === 'function', 'OSD.Actions.PreviousTurn', 'OSD.Errors.CombatTurnUnavailable'),
    nextTurn: available(hasCurrentCombatant && typeof combat.nextTurn === 'function', 'OSD.Actions.NextTurn', 'OSD.Errors.CombatTurnUnavailable'),
    focusCurrent: available(hasCurrentCombatant, 'OSD.Actions.FocusCurrent', 'OSD.Errors.CurrentCombatantUnavailable'),
    swapInitiative: available(canUpdateCombatants, 'OSD.Actions.SwapInitiative', 'OSD.Errors.NativeApiUnavailable'),
    rollNpcInitiative: available(canRoll, 'OSD.Actions.RollNpcInitiative', 'OSD.Errors.NativeApiUnavailable'),
  };
}

function emptyEncounterCommands(reasonKey: string): DeckEncounterCommands {
  return {
    previousTurn: available(false, 'OSD.Actions.PreviousTurn', reasonKey),
    nextTurn: available(false, 'OSD.Actions.NextTurn', reasonKey),
    focusCurrent: available(false, 'OSD.Actions.FocusCurrent', reasonKey),
    swapInitiative: available(false, 'OSD.Actions.SwapInitiative', reasonKey),
    rollNpcInitiative: available(false, 'OSD.Actions.RollNpcInitiative', reasonKey),
  };
}

function emptyEncounter(reasonKey: string): DeckSnapshot['encounter'] {
  return { active: false, round: 0, turn: -1, displayTurn: 0, combatants: [], commands: emptyEncounterCommands(reasonKey) };
}

function actorStatuses(actor: any, map: Map<string, DeckStatusOption>): DeckStatusOption[] {
  const ids = new Set(collectionValues(actor.statuses).map((id) => String(id)));
  return [...ids].map((id) => map.get(id) ?? { id, label: id }).sort((a, b) => a.label.localeCompare(b.label));
}

function actorAcModifier(actor: any): number {
  const effect = collectionValues(actor.effects).find((entry) => Boolean(entry.flags?.[MODULE_ID]?.acModifier));
  const change = collectionValues(effect?.changes).find((entry) => String(entry.key) === 'system.attributes.ac.bonus');
  return finiteNumber(change?.value);
}

async function setActorAcModifier(actor: any, value: number): Promise<void> {
  const effect = collectionValues(actor.effects).find((entry) => Boolean(entry.flags?.[MODULE_ID]?.acModifier));
  if (value === 0) {
    if (effect?.id) await actor.deleteEmbeddedDocuments('ActiveEffect', [String(effect.id)]);
    return;
  }
  const data = {
    name: 'Open Session Deck: AC Modifier',
    img: 'icons/svg/shield.svg',
    changes: [{ key: 'system.attributes.ac.bonus', mode: 2, value: String(value), priority: 20 }],
    flags: { [MODULE_ID]: { acModifier: true } },
  };
  if (effect?.id && typeof effect.update === 'function') await effect.update(data);
  else await actor.createEmbeddedDocuments('ActiveEffect', [data]);
}

async function toggleActorConcentration(actor: any): Promise<void> {
  const effects = collectionValues(actor.concentration?.effects);
  if (effects.length > 0) {
    if (typeof actor.endConcentration === 'function') await actor.endConcentration();
    else {
      const ids = effects.map((effect) => String(effect.id ?? effect._id ?? '')).filter(Boolean);
      if (ids.length > 0) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      else await actor.toggleStatusEffect('concentrating', { active: false });
    }
  } else await actor.toggleStatusEffect('concentrating', { active: true });
}

function actorInFolder(actor: any, selectedId: string, includeDescendants: boolean, folderById: Map<string, any>): boolean {
  let folder = actor.folder;
  if (!folder) return false;
  const seen = new Set<string>();
  while (folder) {
    const id = String(folder.id ?? folder);
    if (!id || seen.has(id)) return false;
    if (id === selectedId) return true;
    if (!includeDescendants) return false;
    seen.add(id);
    const parentId = String(folder.folder?.id ?? folder.folder ?? folder.parent?.id ?? folder.parent ?? '');
    folder = parentId ? folderById.get(parentId) : null;
  }
  return false;
}

function folderDepth(folder: any, folderById: Map<string, any>): number {
  let depth = 0;
  let parentId = String(folder.folder?.id ?? folder.folder ?? folder.parent?.id ?? folder.parent ?? '');
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = folderById.get(parentId);
    if (!parent) break;
    depth += 1;
    parentId = String(parent.folder?.id ?? parent.folder ?? parent.parent?.id ?? parent.parent ?? '');
  }
  return depth;
}

function resolveCombatant(combat: any, id?: string): any {
  if (!id) throw new Error('Combatant ID is required.');
  const combatant = collectionValues(combat.combatants).find((entry) => String(entry.id) === id);
  if (!combatant) throw new Error(`Combatant is missing: ${id}`);
  return combatant;
}

function isCompatibleActor(actor: any): boolean { return Boolean(actor?.uuid && actor?.system?.attributes?.hp); }
function finiteNumber(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function signedNumber(value: number): string { return value > 0 ? `+${value}` : String(value); }
function finite(value: unknown, label: string): number { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`); return number; }
function integer(value: unknown, label: string): number { const number = finite(value, label); if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`); return number; }
function nonNegativeInteger(value: unknown, label: string): number { const number = integer(value, label); if (number < 0) throw new Error(`${label} cannot be negative.`); return number; }
function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const number = integer(value, label);
  if (number < minimum || number > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return number;
}
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
function booleanSetting(runtimeGame: any, key: string, fallback: boolean): boolean {
  const value = runtimeGame.settings?.get?.(MODULE_ID, key);
  return typeof value === 'boolean' ? value : fallback;
}

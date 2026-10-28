import type { InspectorReadouts } from './inspector-readouts.ts';

export type DeckOpenMode = 'panel' | 'popout';
export type DeckTab = 'party' | 'encounter';
export type DeckDensity = 'comfortable' | 'compact';
export type DeckCloseMode = DeckOpenMode | 'all';
export type RosterSource = 'folder' | 'encounter' | 'automatic' | 'pinned';

export interface DeckStatus {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export interface DeckStatusOption extends DeckStatus {}

export interface DeckStatusChoice extends DeckStatusOption {
  readonly active: boolean;
}

export interface DeckPlayer {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface DeckCommandAvailability {
  readonly enabled: boolean;
  readonly tooltipKey: string;
}

export interface DeckActorCommands {
  readonly damage: DeckCommandAvailability;
  readonly heal: DeckCommandAvailability;
  readonly tempHp: DeckCommandAvailability;
  readonly toggleInspiration: DeckCommandAvailability;
  readonly exhaustionDown: DeckCommandAvailability;
  readonly exhaustionUp: DeckCommandAvailability;
  readonly toggleStatus: DeckCommandAvailability;
  readonly openSheet: DeckCommandAvailability;
  readonly locate: DeckCommandAvailability;
  readonly setHp: DeckCommandAvailability;
  readonly setTempHp: DeckCommandAvailability;
  readonly setMaxModifier: DeckCommandAvailability;
  readonly setAcModifier: DeckCommandAvailability;
  readonly toggleConcentration: DeckCommandAvailability;
  readonly setDeathSave: DeckCommandAvailability;
  readonly setInitiative: DeckCommandAvailability;
  readonly rollInitiative: DeckCommandAvailability;
  readonly toggleVisibility: DeckCommandAvailability;
  readonly toggleDefeated: DeckCommandAvailability;
}

export interface DeckEncounterCommands {
  readonly previousTurn: DeckCommandAvailability;
  readonly nextTurn: DeckCommandAvailability;
  readonly focusCurrent: DeckCommandAvailability;
  readonly swapInitiative: DeckCommandAvailability;
  readonly rollNpcInitiative: DeckCommandAvailability;
}

export interface DeckPartyFolderOption {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}

export interface DeckPartyFolder {
  readonly selectedId?: string;
  readonly selectedName?: string;
  readonly includeDescendants: boolean;
  readonly missing: boolean;
  readonly options: readonly DeckPartyFolderOption[];
}

export interface DeckActorCard {
  readonly inspection?: InspectorReadouts;
  readonly uuid: string;
  readonly id: string;
  readonly name: string;
  readonly img: string;
  readonly portraitSource?: string;
  readonly type: string;
  readonly players: readonly DeckPlayer[];
  readonly playerNames: string;
  readonly anyPlayerActive: boolean;
  readonly hp: Readonly<{
    value: number;
    max: number;
    baseMax: number;
    maxModifier: number;
    maxModifierDisplay: string;
    effectiveMax: number;
    temp: number;
    percent: number;
  }>;
  readonly ac: number | null;
  readonly acModifier: number;
  readonly inspiration: boolean;
  readonly exhaustion: number;
  readonly death: Readonly<{ success: number; failure: number }> | null;
  readonly concentrating: boolean;
  readonly statuses: readonly DeckStatus[];
  readonly statusChoices: readonly DeckStatusChoice[];
  readonly inCombat: boolean;
  readonly sources: readonly RosterSource[];
  readonly commands: DeckActorCommands;
  readonly combatantId?: string;
  readonly initiative?: number | null;
  readonly hasInitiative?: boolean;
  readonly tokenUuid?: string;
  readonly tokenSceneId?: string;
  readonly canLocate?: boolean;
  readonly current?: boolean;
  readonly partyMember?: boolean;
  readonly characterControls?: boolean;
  readonly hidden?: boolean;
  readonly revealed?: boolean;
  readonly defeated?: boolean;
}

export interface DeckRosterManagerEntry {
  readonly uuid: string;
  readonly name: string;
  readonly img: string;
  readonly type: string;
  readonly automatic: boolean;
  readonly pinned: boolean;
  readonly hidden: boolean;
}

export interface DeckEncounter {
  readonly active: boolean;
  readonly uuid?: string;
  readonly id?: string;
  readonly round: number;
  readonly turn: number;
  readonly displayTurn: number;
  readonly currentCombatantId?: string;
  readonly combatants: readonly DeckActorCard[];
  readonly commands: DeckEncounterCommands;
}

export interface DeckSnapshot {
  readonly initiativeIcon?: Readonly<{ icon: string; hover: string }>;
  readonly undo?: Readonly<{ count: number; label: string; available: boolean; reason?: string }>;
  readonly supported: boolean;
  readonly supportError?: string;
  readonly coreVersion: string;
  readonly world: Readonly<{ id: string; title: string }>;
  readonly system: Readonly<{ id: string; version: string }>;
  readonly scene: Readonly<{ id: string; name: string }> | null;
  readonly onlineUsers: number;
  readonly party: readonly DeckActorCard[];
  readonly encounter: DeckEncounter;
  readonly statusOptions: readonly DeckStatusOption[];
  readonly partyFolder: DeckPartyFolder;
  readonly rosterManager: readonly DeckRosterManagerEntry[];
  readonly stalePinned: readonly string[];
  readonly staleHidden: readonly string[];
  readonly density: DeckDensity;
  readonly activeTab: DeckTab;
  readonly refreshedAt: number;
  readonly error?: string;
}

export type DeckCommandId =
  | 'actor.damage'
  | 'actor.heal'
  | 'actor.temp-hp'
  | 'actor.toggle-inspiration'
  | 'actor.adjust-exhaustion'
  | 'actor.toggle-status'
  | 'actor.set-hp'
  | 'actor.set-temp-hp'
  | 'actor.set-max-modifier'
  | 'actor.set-ac-modifier'
  | 'actor.set-status'
  | 'actor.toggle-concentration'
  | 'actor.set-death-save'
  | 'actor.open-sheet'
  | 'combat.previous-turn'
  | 'combat.next-turn'
  | 'combat.set-initiative'
  | 'combat.swap-initiative'
  | 'combat.roll-initiative'
  | 'combat.roll-npc-initiative'
  | 'combat.toggle-visibility'
  | 'combat.toggle-defeated'
  | 'token.locate'
  | 'roster.set-folder'
  | 'roster.toggle-pin'
  | 'roster.toggle-hide'
  | 'roster.cleanup';

export interface DeckCommand {
  id: DeckCommandId;
  targetUuid?: string;
  combatUuid?: string;
  tokenUuid?: string;
  amount?: number;
  value?: number;
  delta?: number;
  statusId?: string;
  active?: boolean;
  field?: 'success' | 'failure';
  combatantId?: string;
  secondCombatantId?: string;
  folderId?: string;
  includeDescendants?: boolean;
}

export interface DeckCommandResult {
  messageKey: string;
  targetUuid?: string;
}

export interface DeckModuleApi {
  portraitCacheStats(): Promise<import('./portrait-thumbnails.ts').PortraitThumbnailStats | undefined>;
  undo(): Promise<void>;
  openPanel(): Promise<void>;
  openPopout(): Promise<void>;
  openHelp(): Promise<void>;
  focusPopout(): boolean;
  close(mode: DeckCloseMode): Promise<void>;
  refresh(): void;
}

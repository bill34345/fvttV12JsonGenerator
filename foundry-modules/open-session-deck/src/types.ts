export type DeckOpenMode = 'panel' | 'popout';
export type DeckTab = 'party' | 'encounter';
export type DeckDensity = 'comfortable' | 'compact';
export type DeckCloseMode = DeckOpenMode | 'all';
export type RosterSource = 'automatic' | 'pinned' | 'encounter';

export interface DeckStatus {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export interface DeckStatusOption extends DeckStatus {}

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
}

export interface DeckEncounterCommands {
  readonly previousTurn: DeckCommandAvailability;
  readonly nextTurn: DeckCommandAvailability;
  readonly focusCurrent: DeckCommandAvailability;
}

export interface DeckActorCard {
  readonly uuid: string;
  readonly id: string;
  readonly name: string;
  readonly img: string;
  readonly type: string;
  readonly players: readonly DeckPlayer[];
  readonly playerNames: string;
  readonly anyPlayerActive: boolean;
  readonly hp: Readonly<{ value: number; max: number; temp: number; percent: number }>;
  readonly ac: number | null;
  readonly inspiration: boolean;
  readonly exhaustion: number;
  readonly death: Readonly<{ success: number; failure: number }> | null;
  readonly concentrating: boolean;
  readonly statuses: readonly DeckStatus[];
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
  readonly supported: boolean;
  readonly supportError?: string;
  readonly world: Readonly<{ id: string; title: string }>;
  readonly system: Readonly<{ id: string; version: string }>;
  readonly scene: Readonly<{ id: string; name: string }> | null;
  readonly onlineUsers: number;
  readonly party: readonly DeckActorCard[];
  readonly encounter: DeckEncounter;
  readonly statusOptions: readonly DeckStatusOption[];
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
  | 'actor.open-sheet'
  | 'combat.previous-turn'
  | 'combat.next-turn'
  | 'token.locate'
  | 'roster.toggle-pin'
  | 'roster.toggle-hide'
  | 'roster.cleanup';

export interface DeckCommand {
  id: DeckCommandId;
  targetUuid?: string;
  combatUuid?: string;
  tokenUuid?: string;
  amount?: number;
  delta?: number;
  statusId?: string;
}

export interface DeckCommandResult {
  messageKey: string;
  targetUuid?: string;
}

export interface DeckModuleApi {
  openPanel(): Promise<void>;
  openPopout(): Promise<void>;
  focusPopout(): boolean;
  close(mode: DeckCloseMode): Promise<void>;
  refresh(): void;
}

export const MODULE_ID = 'fvtt-boss-combat-reminders';
export const NS = 'FVTTBossCombatReminders';

export interface NativeActivity {
  id: string;
  name: string;
  canUse: boolean;
  activation: { type: string; value?: number | null; condition?: string };
  duration?: { units?: string };
  range?: { units?: string };
  target?: {
    affects?: { type?: string; labels?: { sheet?: string } };
    template?: { type?: string; labels?: { statblock?: string } };
  };
  labels?: { range?: string; duration?: string; concentrationDuration?: string };
  consumption?: { targets?: Array<{ type: string; target?: string }> };
  getUsageToken?(): { id: string } | undefined;
  uses?: { max?: number | null; value?: number | null };
  use(config: { event: Event }, dialog?: object, message?: { data: { speaker: unknown } }): Promise<unknown>;
}

export interface NativeItem {
  id: string;
  name: string;
  img?: string;
  parent?: NativeActor | null;
  sheet?: { render(options: { force: boolean }): Promise<unknown> };
  system: {
    activities?: Iterable<NativeActivity>;
    activation?: { type?: string; condition?: string };
    description?: { value?: string };
    uses?: { max?: number | null; value?: number | null };
  };
  getFlag(scope: string, key: string): unknown;
  unsetFlag(scope: string, key: string): Promise<unknown>;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
}

export interface HpData { value?: number | null; max?: number | null; effectiveMax?: number }

export interface NativeActor {
  documentName?: string;
  uuid: string;
  name: string;
  img?: string;
  system: {
    isNPC?: boolean;
    attributes?: { hp?: HpData };
    resources?: {
      legact?: { value?: number | null };
      legres?: { value?: number | null };
      lair?: { value?: boolean; inside?: boolean };
    };
    resistSave?(message: NativeSaveMessage): Promise<unknown>;
  };
  statuses: ReadonlySet<string>;
  items: Iterable<NativeItem>;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
}

export interface Combatant {
  id: string;
  name: string;
  actor: NativeActor | null;
  isDefeated?: boolean;
  defeated?: boolean;
  initiative: number | null;
  token?: { id: string };
  getFlag?(scope: string, key: string): unknown;
  setFlag?(scope: string, key: string, value: unknown): Promise<unknown>;
}

export interface TurnState {
  round: number;
  turn: number | null;
  combatantId: string | null;
}

export interface NativeCombat {
  id: string;
  active: boolean;
  started: boolean;
  combatants: { get(id: string): Combatant | undefined; [Symbol.iterator](): Iterator<Combatant> };
  current: TurnState;
  scene?: unknown;
}

export interface NativeSaveMessage {
  id: string;
  type: string;
  system: { canResist?: boolean };
  getAssociatedActor(): NativeActor | null;
  getAssociatedToken?(): { id: string } | null;
}

export interface Choice {
  id: string;
  label: string;
  image?: string;
  cost?: string;
  facts?: readonly string[];
  run: (event: Event) => Promise<boolean>;
}

export interface ReminderGroup {
  id: string;
  label: string;
  portrait?: string;
  remaining?: string;
  choices: Choice[];
  oneChoice?: boolean;
}

export type ReminderKind = 'legendary' | 'resistance' | 'lair' | 'bloodied' | 'death';

export interface ReminderCard {
  id: string;
  kind: ReminderKind;
  title: string;
  timing?: string;
  groups: ReminderGroup[];
}

export interface RemindersUI {
  show(card: ReminderCard): void;
  remove(id: string): void;
  removeGroup?(id: string, group: string): void;
  clear(): void;
}

export interface Platform {
  isActiveGM(): boolean;
  combat(): NativeCombat | undefined;
  format(key: string, data?: Record<string, string | number>): string;
  message(id: string): NativeSaveMessage | undefined;
  useActivity(combat: NativeCombat, combatant: Combatant, activity: NativeActivity, event: Event): Promise<boolean>;
}

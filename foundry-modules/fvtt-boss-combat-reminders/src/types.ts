export const MODULE_ID = 'fvtt-boss-combat-reminders';
export const NS = 'FVTTBossCombatReminders';

export interface NativeActivity {
  id: string;
  uuid?: string;
  name: string;
  canUse: boolean;
  type?: string;
  actor?: NativeActor | null;
  item?: NativeItem;
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
  use(config: ActivityUseInput, dialog?: object, message?: NativeActivityMessage): Promise<unknown>;
  rollDamage?(config: DamageInput, dialog?: object, message?: NativeActivityMessage): Promise<unknown[] | undefined>;
}

export interface DamageInput { event?: Event; isCritical?: boolean; ability?: string; ammunition?: NativeItem; attackMode?: string }
export interface ActivityUseInput {
  event?: Event;
  subsequentActions?: boolean;
  consume?: false;
  create?: false;
  midiOptions?: { workflowOptions?: { allowIncapacitated?: boolean } };
}
export interface NativeActivityMessage {
  rollMode?: string;
  create?: boolean;
  data: { speaker?: unknown; whisper?: string[]; blind?: boolean; system?: { targets?: readonly object[]; origin?: string } };
}

export interface NativeItem {
  id: string;
  documentName?: string;
  uuid?: string;
  name: string;
  img?: string;
  parent?: NativeActor | null;
  effects?: Iterable<NativeEffect>;
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

export interface HpData { value?: number | null; max?: number | null; effectiveMax?: number; bloodied?: number }

export interface NativeActor {
  documentName?: string;
  uuid: string;
  name: string;
  img?: string;
  sheet?: { render(options: { force: boolean }): Promise<unknown> };
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
  toggleStatusEffect?(status: string, options: { active: boolean; overlay?: boolean }): Promise<unknown>;
  appliedEffects?: Iterable<NativeEffect>;
  effects?: Iterable<NativeEffect>;
  createEmbeddedDocuments?(name: 'ActiveEffect', data: object[]): Promise<NativeEffect[]>;
  deleteEmbeddedDocuments?(name: 'ActiveEffect', ids: string[]): Promise<NativeEffect[]>;
}

export interface NativeEffect {
  id: string;
  name?: string;
  origin?: string | null;
  matchesOrigin?(uuid: string): boolean;
  active?: boolean;
  parent?: NativeActor | NativeItem | null;
  target?: NativeActor | null;
  statuses?: ReadonlySet<string> | readonly string[];
  changes?: Iterable<{ key: string; value?: unknown }>;
  system?: { changes?: Iterable<{ key: string; type?: string; value?: unknown }> };
  getFlag?(scope: string, key: string): unknown;
  delete(options?: Record<string, unknown>): Promise<unknown>;
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
  update?(data: { defeated: boolean }): Promise<unknown>;
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
  persistent?: boolean;
}

export interface RemindersUI {
  show(card: ReminderCard): void;
  remove(id: string): void;
  removeGroup?(id: string, group: string): void;
  clear(preservePersistent?: boolean): void;
}

export interface Platform {
  isActiveGM(): boolean;
  combat(): NativeCombat | undefined;
  automaticBloodied?(): boolean;
  format(key: string, data?: Record<string, string | number>): string;
  message(id: string): NativeSaveMessage | undefined;
  notify?(message: string): void;
  useActivity(combat: NativeCombat, combatant: Combatant, activity: NativeActivity, event: Event, options?: { pendingDefeat: boolean }): Promise<boolean>;
}

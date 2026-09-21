/** The only world-schema version understood by this module. */
export const TRIGGER_SCHEMA_VERSION = 1 as const;

export type TriggerEventType = 'documentUpdate' | 'combatTurnStart' | 'combatTurnEnd';
export type TriggerDocumentType = 'Actor';
export type ConditionGroupMode = 'ALL' | 'ANY';
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

/**
 * A condition operand is deliberately data-only.  Paths are resolved against
 * the shadow document snapshots held by the runtime; literals are JSON data.
 */
export type ConditionOperand =
  | { type: 'before-path'; path: string }
  | { type: 'after-path'; path: string }
  | { type: 'literal'; value: JsonValue };

export interface TriggerCondition {
  left: ConditionOperand;
  operator: ComparisonOperator;
  right: ConditionOperand;
}

export type Condition = TriggerCondition;

export interface ConditionGroup {
  mode: ConditionGroupMode;
  conditions: TriggerCondition[];
}

export type TriggerEvent =
  | {
    type: 'documentUpdate';
    documentType: TriggerDocumentType;
    watchedPaths: string[];
  }
  | {
    type: 'combatTurnStart';
    documentType: TriggerDocumentType;
  }
  | {
    type: 'combatTurnEnd';
    documentType: TriggerDocumentType;
  };

export interface MacroAction {
  type: 'macro';
  macroUuid: string;
}

export type TriggerAction = MacroAction;

export interface TriggerDefinition {
  id: string;
  name: string;
  enabled: boolean;
  event: TriggerEvent;
  conditions: ConditionGroup | null;
  actions: MacroAction[];
}

export interface TriggerStore {
  schemaVersion: typeof TRIGGER_SCHEMA_VERSION;
  triggers: TriggerDefinition[];
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface CombatTurnContext {
  actor: any;
  combat: any;
  combatant: any;
  token: any;
  round: number;
  turn: number;
  key: string;
  phase?: 'start' | 'end';
  userId: string | undefined;
}

export type TriggerContextEvent =
  | { type: 'documentUpdate'; documentType: 'Actor' }
  | { type: 'combatTurnStart'; documentType: 'Actor' }
  | { type: 'combatTurnEnd'; documentType: 'Actor' };

export interface TriggerEventContext {
  event: TriggerContextEvent;
  document: unknown;
  documentUuid: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  userId: string | undefined;
  timestamp: number;
  combat?: any;
  combatUuid?: string;
  combatant?: any;
  token?: any;
  round?: number;
  turn?: number;
  key?: string;
  phase?: 'start' | 'end';
}

export type TriggerEventListener = (context: TriggerEventContext) => Promise<void> | void;

export interface TriggerContext {
  triggerId: string;
  triggerName: string;
  event: TriggerContextEvent;
  document: unknown;
  documentUuid: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  userId: string | undefined;
  timestamp: number;
  combat?: any;
  combatUuid?: string;
  combatant?: any;
  token?: any;
  round?: number;
  turn?: number;
  key?: string;
  /**
   * Update the triggering document while preserving Trigger Engine causal
   * ancestry. Macros that write back to the same Actor should use this helper
   * so recursive trigger cycles can be suppressed without touching the shared
   * Actor.update method.
   */
  updateDocument: (changes: unknown, options?: unknown) => Promise<unknown>;
}

export type TriggerExecutionStatus = 'executed' | 'failed' | 'skipped';

export interface TriggerActionResult {
  actionIndex: number;
  status: 'executed' | 'failed';
  error?: unknown;
}

export interface TriggerExecutionResult {
  triggerId: string;
  status: TriggerExecutionStatus;
  actionResults: TriggerActionResult[];
  error?: unknown;
}

export interface DocumentUpdateReport {
  documentUuid: string;
  matchedTriggerIds: string[];
  results: TriggerExecutionResult[];
  skippedReason?: 'inactive-gm' | 'recursion-guard' | 'unsupported-document';
}

export interface CombatUpdateReport {
  combatUuid: string;
  key?: string;
  matchedTriggerIds: string[];
  results: TriggerExecutionResult[];
  skippedReason?:
    | 'inactive-gm'
    | 'uninitialized'
    | 'unsupported-combat'
    | 'inactive-combat'
    | 'not-forward-turn'
    | 'duplicate'
    | 'empty-combat'
    | 'missing-actor';
}

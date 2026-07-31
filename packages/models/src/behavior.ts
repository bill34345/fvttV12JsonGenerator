import type { ActorResourceActivation, ActorResourceItemRef } from './resource';

/** Source-derived actor behavior semantics shared by parsing and generation. */

export type ActorBehaviorKind =
  | 'relation'
  | 'lifecycle'
  | 'trigger'
  | 'stage'
  | 'capacity'
  | 'choicePool'
  | 'area'
  | 'externalRule';

export type ActorBehaviorExpressionCoverage = 'structured' | 'literal' | 'missing';
export type ActorBehaviorExecutionMode =
  | 'automatic'
  | 'core-operable'
  | 'gm-assisted'
  | 'external-rule';
export type ActorBehaviorRuleSource = 'schema-derived' | 'source-derived' | 'corpus-derived';

export type ActorBehaviorEventType =
  | 'turnStart'
  | 'turnEnd'
  | 'damageTaken'
  | 'attackHit'
  | 'attackMiss'
  | 'saveSuccess'
  | 'saveFailure'
  | 'hpThreshold'
  | 'enterArea'
  | 'leaveArea'
  | 'activityUsed'
  | 'manual';

export type ActorBehaviorFrequency =
  | 'unlimited'
  | 'oncePerTurn'
  | 'oncePerRound'
  | 'oncePerEncounter'
  | 'firstOccurrence';

export interface ActorBehaviorTrigger {
  event: ActorBehaviorEventType;
  frequency: ActorBehaviorFrequency;
  condition?: string;
}

export interface ActorBehaviorReference {
  id: string;
  role: string;
  item: ActorResourceItemRef;
}

export interface ActorBehaviorEffectChange {
  key: string;
  mode: 2 | 5;
  value: string;
  phase?: 'initial' | 'final';
}

export interface ActorBehaviorState {
  id: string;
  name: string;
  englishName?: string;
  target: 'self' | 'selected';
  statuses: string[];
  changes: ActorBehaviorEffectChange[];
  duration?: {
    rounds?: number;
    turns?: number;
    seconds?: number;
    special?: string;
  };
  removal: string[];
}

export type ActorBehaviorOperationKind =
  | 'apply'
  | 'remove'
  | 'forward'
  | 'choose'
  | 'consume'
  | 'reset'
  | 'mark'
  | 'move'
  | 'template'
  | 'manual';

export interface ActorBehaviorOperation {
  id: string;
  name: string;
  englishName?: string;
  activation: ActorResourceActivation;
  kind: ActorBehaviorOperationKind;
  stateIds: string[];
  referenceIds: string[];
  description: string;
  template?: {
    shape: 'cone' | 'cube' | 'cylinder' | 'line' | 'radius' | 'sphere';
    size: number;
    width?: number;
    units: 'ft';
  };
}

export interface ActorBehaviorCapacity {
  slots: number;
  sizeLimit?: string;
  escapeDc?: number;
  acquire: string;
  release: string;
}

export interface ActorBehaviorChoiceOption {
  id: string;
  name: string;
  englishName?: string;
  description: string;
}

export interface ActorBehaviorChoicePool {
  choose: number;
  distinct: boolean;
  reset: 'turnStart' | 'turnEnd' | 'shortRest' | 'longRest' | 'manual';
  options: ActorBehaviorChoiceOption[];
}

export interface ActorBehaviorMechanic {
  id: string;
  kind: ActorBehaviorKind;
  name: string;
  englishName?: string;
  carrier: ActorResourceItemRef;
  coverage: ActorBehaviorExpressionCoverage;
  executionMode: ActorBehaviorExecutionMode;
  ruleSource: ActorBehaviorRuleSource;
  trigger?: ActorBehaviorTrigger;
  conditions: string[];
  references: ActorBehaviorReference[];
  states: ActorBehaviorState[];
  operations: ActorBehaviorOperation[];
  gmSteps: string[];
  capacity?: ActorBehaviorCapacity;
  choicePool?: ActorBehaviorChoicePool;
  externalRule?: {
    name: string;
    dc?: number;
    ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    result: string;
  };
}

export interface ActorBehaviorSemantics {
  schemaVersion: 1;
  mechanics: ActorBehaviorMechanic[];
}

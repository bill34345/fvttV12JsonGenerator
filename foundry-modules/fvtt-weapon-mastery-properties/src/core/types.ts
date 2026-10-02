import type {
  WeaponConfiguration,
  WeaponRuleDefinition,
  WeaponRuleKind,
} from '@fvtt-json-generator/contracts/weapon-properties';

export type { WeaponConfiguration, WeaponRuleDefinition, WeaponRuleKind };

/** Foundry's dnd5e size IDs, with full English aliases accepted by imports. */
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan' | 'sm' | 'med' | 'lg' | 'grg';

/** Canonical dnd5e size order used by actor.system.traits.size. */
export const CREATURE_SIZE_RANK: Readonly<Record<CreatureSize, number>> = {
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
  huge: 4,
  gargantuan: 5,
  sm: 1,
  med: 2,
  lg: 3,
  grg: 5,
};

export type AttackOutcome = 'hit' | 'miss' | 'cancelled' | 'failed';
export type AttackAction = 'attack' | 'bonus' | 'reaction' | 'other';

export interface WeaponSource {
  actorId: string;
  itemId?: string;
  activityId?: string;
}

export interface WeaponSnapshot {
  id?: string;
  isMelee: boolean;
  isLight: boolean;
  /** Required by Cleave; omitted values fail closed instead of assuming 5 feet. */
  reachFeet?: number;
  damageType?: string;
}

export interface AttackSnapshot {
  attackId: string;
  outcome: AttackOutcome;
  critical?: boolean;
  action?: AttackAction;
  /** The first target of an attack that is evaluating a Cleave candidate. */
  primaryTargetId?: string;
  /** Set by the runtime for an attack created by Cleave. */
  parentAttackId?: string;
  childDepth?: number;
  /** True only when this is the Light-property extra attack candidate. */
  lightExtraAttack?: boolean;
}

export interface TargetSnapshot {
  id: string;
  size: CreatureSize;
  /** Distance from the attacker, in feet, for Cleave reach validation. */
  distanceFromAttackerFeet?: number;
  /** Distance from the first target, in feet, for Cleave's 5-foot check. */
  distanceFromPrimaryFeet?: number;
  /** Damage that actually reached the target after the attack was resolved. */
  damageDealt?: number;
}

export interface TurnSnapshot {
  /** Stable Combat/round/turn identity. Turn-limited rules fail closed when absent. */
  key?: string;
}

export interface RuleUsageSnapshot {
  usedCount?: number;
  usedRuleIds?: readonly string[];
}

/** Browser-safe input shared by the pure rule functions and the runtime adapter. */
export interface WeaponRuleContext {
  configuration: WeaponConfiguration;
  /** The actual legal mastery selected for this attack when mastery is `native`. */
  selectedMasteryRuleId?: string | null;
  nativeMasteryUnlocked?: boolean;
  source: WeaponSource;
  weapon: WeaponSnapshot;
  attacker: {
    abilityModifier: number;
    proficiencyBonus: number;
  };
  attack: AttackSnapshot;
  target: TargetSnapshot;
  turn?: TurnSnapshot;
  usage?: RuleUsageSnapshot;
}

export type EligibilityReason =
  | 'eligible'
  | 'invalid-configuration'
  | 'configuration-disabled'
  | 'rule-not-configured'
  | 'mastery-not-selected'
  | 'mastery-not-unlocked'
  | 'missing-attack-id'
  | 'missing-source-actor'
  | 'missing-target-id'
  | 'missing-turn'
  | 'already-used-this-turn'
  | 'not-a-hit'
  | 'not-a-miss'
  | 'not-melee'
  | 'not-light-extra-attack'
  | 'target-is-primary'
  | 'target-out-of-reach'
  | 'target-too-far'
  | 'target-too-large'
  | 'no-damage-dealt'
  | 'non-positive-ability-modifier'
  | 'not-critical'
  | 'missing-critical-param'
  | 'conflicting-critical-rules'
  | 'child-attack'
  | 'missing-damage-type'
  | 'invalid-ability-modifier'
  | 'invalid-proficiency-bonus'
  | 'invalid-target-size'
  | 'invalid-distance'
  | 'invalid-usage';

export interface RuleEligibility {
  eligible: boolean;
  ruleId: string;
  kind: WeaponRuleKind | null;
  rule: WeaponRuleDefinition | null;
  reason: EligibilityReason;
}

export interface SettlementSource extends WeaponSource {
  ruleId: string;
  attackId: string;
  parentAttackId?: string;
  targetId: string;
  turnKey?: string;
}

export type RuleDuration =
  | {
      kind: 'until-attacker-next-turn-start';
      anchorActorId: string;
      triggerTurnKey: string;
      consumesOn?: 'target-next-attack';
    }
  | {
      kind: 'until-attacker-next-turn-end';
      anchorActorId: string;
      triggerTurnKey: string;
      consumesOn?: 'attacker-next-attack-against-target';
    }
  | {
      kind: 'condition-managed';
      endOnHealing: boolean;
    };

export interface DamageSettlement {
  type: 'damage';
  source: SettlementSource;
  amount: number;
  damageType: string;
  modifierPolicy: 'ability-only';
  /** Explicitly prevents a negative ability modifier from healing the target. */
  minimumAmount: 0;
}

export interface CleaveSettlement {
  type: 'child-attack';
  source: SettlementSource;
  childAttackId: string;
  parentAttackId: string;
  targetId: string;
  distanceFromPrimaryFeet: number;
  maxDistanceFromAttackerFeet: number;
  weaponDamageType: string;
  abilityModifier: number;
  abilityModifierPolicy: 'negative-only';
  minimumDamage: 0;
  maxUsesPerTurn: number;
  allowMasteryChildRecursion: false;
}

export interface NickSettlement {
  type: 'extra-attack';
  source: SettlementSource;
  action: 'attack';
  property: 'light';
  maxUsesPerTurn: number;
  consumesBonusAction: false;
}

export interface PushSettlement {
  type: 'movement';
  source: SettlementSource;
  direction: 'away-from-attacker';
  distanceFeet: number;
  maxDistanceFeet: number;
  requiresDestinationSelection: true;
}

export interface ConditionSettlement {
  type: 'condition';
  source: SettlementSource;
  /** Stable rule identity; never collapsed to the existing `slowed` condition. */
  conditionId: string;
  effectKind: 'attack-disadvantage' | 'speed-reduction' | 'attack-advantage' | 'persistent-damage';
  targetId: string;
  stackingGroup: string;
  merge: 'refresh' | 'max' | 'replace' | 'independent';
  duration: RuleDuration;
  speedReductionFeet?: number;
  formula?: string;
  damageType?: string;
  damageMode?: 'damage' | 'hpLoss';
}

export interface ToppleSettlement {
  type: 'saving-throw';
  source: SettlementSource;
  ability: 'constitution';
  dc: number;
  onFailure: 'prone';
}

export interface CriticalDamageSettlement {
  type: 'critical-damage';
  source: SettlementSource;
  criticalRule: 'deadly' | 'fatal';
  die: number;
  dice: number;
}

export type RuleSettlement =
  | DamageSettlement
  | CleaveSettlement
  | NickSettlement
  | PushSettlement
  | ConditionSettlement
  | ToppleSettlement
  | CriticalDamageSettlement;

export interface SettlementReport {
  eligibility: RuleEligibility;
  settlements: readonly RuleSettlement[];
}

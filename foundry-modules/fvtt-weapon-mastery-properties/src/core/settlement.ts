import { parseWeaponRule, type WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';
import {
  DEFAULT_CLEAVE_DISTANCE_FEET,
  DEFAULT_CLEAVE_MAX_USES,
  DEFAULT_ONCE_PER_TURN,
  DEFAULT_PUSH_DISTANCE_FEET,
  DEFAULT_SLOW_REDUCTION_FEET,
  MIN_DAMAGE_AMOUNT,
} from '../constants.ts';
import { calculateCriticalDamage } from './critical.ts';
import { configuredRuleIds, evaluateMasteryEligibility, ruleTurnKey } from './eligibility.ts';
import type {
  CleaveSettlement,
  ConditionSettlement,
  CriticalDamageSettlement,
  DamageSettlement,
  NickSettlement,
  PushSettlement,
  RuleSettlement,
  SettlementReport,
  SettlementSource,
  ToppleSettlement,
  WeaponRuleContext,
} from './types.ts';

function numberParam(rule: WeaponRuleDefinition, name: string, fallback: number): number {
  const value = rule.params[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sourceFor(context: WeaponRuleContext, rule: WeaponRuleDefinition): SettlementSource {
  return {
    ...context.source,
    ruleId: rule.ruleId,
    attackId: context.attack.attackId,
    ...(context.attack.parentAttackId ? { parentAttackId: context.attack.parentAttackId } : {}),
    targetId: context.target.id,
    ...(ruleTurnKey(context) ? { turnKey: ruleTurnKey(context)! } : {}),
  };
}

function childAttackId(context: WeaponRuleContext): string {
  return `${context.attack.attackId}:cleave:${context.target.id}`;
}

function settleCleave(context: WeaponRuleContext, rule: WeaponRuleDefinition): CleaveSettlement {
  const maxDistance = numberParam(rule, 'distance', DEFAULT_CLEAVE_DISTANCE_FEET);
  const maxUses = numberParam(rule, 'maxUses', DEFAULT_CLEAVE_MAX_USES);
  return {
    type: 'child-attack',
    source: sourceFor(context, rule),
    childAttackId: childAttackId(context),
    parentAttackId: context.attack.attackId,
    targetId: context.target.id,
    distanceFromPrimaryFeet: maxDistance,
    maxDistanceFromAttackerFeet: context.weapon.reachFeet!,
    weaponDamageType: context.weapon.damageType!,
    abilityModifier: Math.min(0, context.attacker.abilityModifier),
    abilityModifierPolicy: 'negative-only',
    minimumDamage: MIN_DAMAGE_AMOUNT,
    maxUsesPerTurn: maxUses,
    allowMasteryChildRecursion: false,
  };
}

function settleGraze(context: WeaponRuleContext, rule: WeaponRuleDefinition): DamageSettlement {
  return {
    type: 'damage',
    source: sourceFor(context, rule),
    amount: Math.max(MIN_DAMAGE_AMOUNT, context.attacker.abilityModifier),
    damageType: context.weapon.damageType!,
    modifierPolicy: 'ability-only',
    minimumAmount: MIN_DAMAGE_AMOUNT,
  };
}

function settleNick(context: WeaponRuleContext, rule: WeaponRuleDefinition): NickSettlement {
  return {
    type: 'extra-attack',
    source: sourceFor(context, rule),
    action: 'attack',
    property: 'light',
    maxUsesPerTurn: numberParam(rule, 'maxUses', DEFAULT_ONCE_PER_TURN),
    consumesBonusAction: false,
  };
}

function settlePush(context: WeaponRuleContext, rule: WeaponRuleDefinition): PushSettlement {
  const distance = numberParam(rule, 'distance', DEFAULT_PUSH_DISTANCE_FEET);
  return {
    type: 'movement',
    source: sourceFor(context, rule),
    direction: 'away-from-attacker',
    distanceFeet: distance,
    maxDistanceFeet: distance,
    requiresDestinationSelection: true,
  };
}

function settleSap(context: WeaponRuleContext, rule: WeaponRuleDefinition): ConditionSettlement {
  return {
    type: 'condition',
    source: sourceFor(context, rule),
    conditionId: rule.ruleId,
    effectKind: 'attack-disadvantage',
    targetId: context.target.id,
    stackingGroup: rule.stackingGroup,
    merge: 'refresh',
    duration: {
      kind: 'until-attacker-next-turn-start',
      anchorActorId: context.source.actorId,
      triggerTurnKey: ruleTurnKey(context)!,
      consumesOn: 'target-next-attack',
    },
  };
}

function settleSlow(context: WeaponRuleContext, rule: WeaponRuleDefinition): ConditionSettlement {
  return {
    type: 'condition',
    source: sourceFor(context, rule),
    conditionId: rule.ruleId,
    effectKind: 'speed-reduction',
    targetId: context.target.id,
    stackingGroup: rule.stackingGroup,
    merge: 'max',
    duration: {
      kind: 'until-attacker-next-turn-start',
      anchorActorId: context.source.actorId,
      triggerTurnKey: ruleTurnKey(context)!,
    },
    speedReductionFeet: numberParam(rule, 'speedReduction', DEFAULT_SLOW_REDUCTION_FEET),
  };
}

function settleTopple(context: WeaponRuleContext, rule: WeaponRuleDefinition): ToppleSettlement {
  return {
    type: 'saving-throw',
    source: sourceFor(context, rule),
    ability: 'constitution',
    dc: 8 + context.attacker.abilityModifier + context.attacker.proficiencyBonus,
    onFailure: 'prone',
  };
}

function settleVex(context: WeaponRuleContext, rule: WeaponRuleDefinition): ConditionSettlement {
  return {
    type: 'condition',
    source: sourceFor(context, rule),
    conditionId: rule.ruleId,
    effectKind: 'attack-advantage',
    targetId: context.target.id,
    stackingGroup: rule.stackingGroup,
    merge: 'refresh',
    duration: {
      kind: 'until-attacker-next-turn-end',
      anchorActorId: context.source.actorId,
      triggerTurnKey: ruleTurnKey(context)!,
      consumesOn: 'attacker-next-attack-against-target',
    },
  };
}

function settleCritical(context: WeaponRuleContext, rule: WeaponRuleDefinition): CriticalDamageSettlement {
  return {
    type: 'critical-damage',
    source: sourceFor(context, rule),
    criticalRule: rule.kind === 'deadly' ? 'deadly' : 'fatal',
    die: rule.params.die as number,
    dice: rule.kind === 'deadly' ? rule.params.dice as number : 1,
  };
}

/**
 * Builds the parameterized critical bleeding record for custom-conditions.
 * The condition module owns persistence and turn/HP lifecycle; this helper only
 * carries an explicit source/rule identity and validated configuration.
 */
export function buildBleedingSettlement(
  context: WeaponRuleContext,
  rule: WeaponRuleDefinition,
): ConditionSettlement | null {
  const parsed = parseWeaponRule(rule);
  if (!parsed || parsed.kind !== 'criticalBleeding' || context.attack.outcome !== 'hit' || context.attack.critical !== true) return null;
  const formula = parsed.params.formula;
  const mode = parsed.params.mode;
  if (typeof formula !== 'string' || (mode !== 'damage' && mode !== 'hpLoss')) return null;
  const damageType = parsed.params.damageType;
  if (mode === 'damage' && typeof damageType !== 'string') return null;
  return {
    type: 'condition',
    source: sourceFor(context, parsed),
    conditionId: parsed.ruleId,
    effectKind: 'persistent-damage',
    targetId: context.target.id,
    stackingGroup: parsed.stackingGroup,
    merge: 'max',
    duration: { kind: 'condition-managed', endOnHealing: parsed.params.endOnHealing === true },
    formula,
    ...(typeof damageType === 'string' ? { damageType } : {}),
    damageMode: mode,
  };
}

/** Settle one validated rule into data-only effects for the runtime adapter. */
export function settleWeaponRule(
  context: WeaponRuleContext,
  ruleId: string,
): SettlementReport {
  const eligibility = evaluateMasteryEligibility(context, ruleId);
  if (!eligibility.eligible || !eligibility.rule) return { eligibility, settlements: [] };
  const rule = eligibility.rule;
  let settlement: RuleSettlement | null = null;
  switch (rule.kind) {
    case 'cleave': settlement = settleCleave(context, rule); break;
    case 'graze': settlement = settleGraze(context, rule); break;
    case 'nick': settlement = settleNick(context, rule); break;
    case 'push': settlement = settlePush(context, rule); break;
    case 'sap': settlement = settleSap(context, rule); break;
    case 'slow': settlement = settleSlow(context, rule); break;
    case 'topple': settlement = settleTopple(context, rule); break;
    case 'vex': settlement = settleVex(context, rule); break;
    case 'deadly':
    case 'fatal': settlement = settleCritical(context, rule); break;
    case 'criticalBleeding': settlement = buildBleedingSettlement(context, rule); break;
    default: settlement = null;
  }
  return { eligibility, settlements: settlement ? [settlement] : [] };
}

/** Settle the selected official mastery plus any configured non-mastery rule. */
export function settleConfiguredWeaponRules(
  context: WeaponRuleContext,
): readonly SettlementReport[] {
  return configuredRuleIds(context).map((ruleId) => settleWeaponRule(context, ruleId));
}

/**
 * Convenience adapter for callers that need the critical pool and its rule
 * settlement together. It remains pure and never changes the configuration.
 */
export function criticalPoolForRule(
  context: WeaponRuleContext,
  ruleId: string,
  weaponBase: Parameters<typeof calculateCriticalDamage>[0]['weaponBase'],
  riders: Parameters<typeof calculateCriticalDamage>[0]['riders'] = [],
) {
  const report = settleWeaponRule(context, ruleId);
  const rule = report.eligibility.rule;
  return calculateCriticalDamage({ critical: context.attack.critical === true, weaponBase, riders, rules: rule ? [rule] : [] });
}

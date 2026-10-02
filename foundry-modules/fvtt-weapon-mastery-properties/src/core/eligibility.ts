import {
  isWeaponMasteryId,
  parseWeaponConfiguration,
  weaponRuleFor,
  type WeaponRuleDefinition,
  type WeaponRuleKind,
} from '@fvtt-json-generator/contracts/weapon-properties';
import {
  DEFAULT_CLEAVE_DISTANCE_FEET,
  DEFAULT_CLEAVE_MAX_USES,
  DEFAULT_ONCE_PER_TURN,
  DEFAULT_PUSH_DISTANCE_FEET,
  DEFAULT_PUSH_MAX_SIZE_RANK,
  DEFAULT_SLOW_REDUCTION_FEET,
} from '../constants.ts';
import { CREATURE_SIZE_RANK } from './types.ts';
import type {
  CreatureSize,
  EligibilityReason,
  RuleEligibility,
  WeaponRuleContext,
} from './types.ts';

const OFFICIAL_KINDS = new Set<WeaponRuleKind>([
  'cleave',
  'graze',
  'nick',
  'push',
  'sap',
  'slow',
  'topple',
  'vex',
]);

function failure(
  ruleId: string,
  reason: EligibilityReason,
  rule: WeaponRuleDefinition | null = null,
): RuleEligibility {
  return { eligible: false, ruleId, kind: rule?.kind ?? null, rule, reason };
}

function success(ruleId: string, rule: WeaponRuleDefinition): RuleEligibility {
  return { eligible: true, ruleId, kind: rule.kind, rule, reason: 'eligible' };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parameterNumber(
  rule: WeaponRuleDefinition,
  key: string,
  fallback: number,
): number | null {
  const value = rule.params[key];
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function targetSizeRank(size: CreatureSize): number | null {
  return Object.prototype.hasOwnProperty.call(CREATURE_SIZE_RANK, size)
    ? CREATURE_SIZE_RANK[size]
    : null;
}

function turnKey(context: WeaponRuleContext): string | null {
  return nonEmpty(context.turn?.key) ? context.turn!.key!.trim() : null;
}

function oncePerTurnFailure(
  context: WeaponRuleContext,
  rule: WeaponRuleDefinition,
  fallbackMaxUses: number,
): EligibilityReason | null {
  const key = turnKey(context);
  if (!key) return 'missing-turn';
  const count = context.usage?.usedCount ?? 0;
  if (!Number.isInteger(count) || count < 0) return 'invalid-usage';
  const maxUses = parameterNumber(rule, 'maxUses', fallbackMaxUses);
  if (maxUses === null || !Number.isInteger(maxUses) || maxUses < 1) return 'invalid-usage';
  const usedRuleIds = context.usage?.usedRuleIds ?? [];
  const configuration = parseWeaponConfiguration(context.configuration);
  const usedSameKind = usedRuleIds.filter((usedRuleId) => {
    if (usedRuleId === rule.ruleId || usedRuleId === `dnd2024.${rule.kind}` || usedRuleId === rule.kind) return true;
    // A copied mastery has a stable, arbitrary ruleId. When the copy is still
    // configured on this weapon, its kind keeps the once-per-turn budget
    // shared with the official rule it was copied from.
    return configuration?.rules.some((candidate) => candidate.ruleId === usedRuleId && candidate.kind === rule.kind) ?? false;
  }).length;
  return Math.max(count, usedSameKind) >= maxUses ? 'already-used-this-turn' : null;
}

function selectedMastery(
  context: WeaponRuleContext,
  configuration: ReturnType<typeof parseWeaponConfiguration>,
): string | null {
  if (!configuration || configuration.mastery === null) return null;
  if (configuration.mastery !== 'native') return configuration.mastery;
  if (!nonEmpty(context.selectedMasteryRuleId)) return null;
  const selected = context.selectedMasteryRuleId!.trim();
  return isWeaponMasteryId(selected) ? `dnd2024.${selected}` : selected;
}

function commonEligibility(context: WeaponRuleContext, ruleId: string): RuleEligibility {
  if (!nonEmpty(ruleId)) return failure(ruleId, 'rule-not-configured');
  const configuration = parseWeaponConfiguration(context.configuration);
  if (!configuration) return failure(ruleId, 'invalid-configuration');
  if (!configuration.enabled) return failure(ruleId, 'configuration-disabled');

  const rule = weaponRuleFor(configuration, ruleId);
  if (!rule) return failure(ruleId, 'rule-not-configured');
  if (!nonEmpty(context.source.actorId)) return failure(ruleId, 'missing-source-actor', rule);
  if (!nonEmpty(context.attack.attackId)) return failure(ruleId, 'missing-attack-id', rule);
  if (!nonEmpty(context.target.id)) return failure(ruleId, 'missing-target-id', rule);

  if (OFFICIAL_KINDS.has(rule.kind)) {
    const selected = selectedMastery(context, configuration);
    const selectedMatches = selected === rule.ruleId || selected === rule.kind;
    if (!selectedMatches) return failure(ruleId, 'mastery-not-selected', rule);
    if (context.nativeMasteryUnlocked !== true && configuration.grantMastery !== true) {
      return failure(ruleId, 'mastery-not-unlocked', rule);
    }
  }
  return success(ruleId, rule);
}

function withTurnAndUse(
  context: WeaponRuleContext,
  rule: WeaponRuleDefinition,
  fallbackMaxUses: number,
): EligibilityReason | null {
  return oncePerTurnFailure(context, rule, fallbackMaxUses);
}

/**
 * Checks only deterministic rule eligibility. It does not roll dice, inspect
 * Foundry documents, or consume a use. All missing runtime context fails closed.
 */
export function evaluateMasteryEligibility(
  context: WeaponRuleContext,
  ruleId: string,
): RuleEligibility {
  const common = commonEligibility(context, ruleId);
  if (!common.eligible || !common.rule) return common;
  const rule = common.rule;
  const attack = context.attack;
  const target = context.target;
  const abilityModifier = context.attacker.abilityModifier;

  switch (rule.kind) {
    case 'cleave': {
      if (!finite(abilityModifier)) return failure(ruleId, 'invalid-ability-modifier', rule);
      if (attack.parentAttackId || (attack.childDepth ?? 0) > 0) return failure(ruleId, 'child-attack', rule);
      if (!context.weapon.isMelee) return failure(ruleId, 'not-melee', rule);
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      if (!nonEmpty(attack.primaryTargetId) || attack.primaryTargetId === target.id) {
        return failure(ruleId, 'target-is-primary', rule);
      }
      const distance = target.distanceFromPrimaryFeet;
      const reach = context.weapon.reachFeet;
      if (!finite(distance) || distance < 0) return failure(ruleId, 'invalid-distance', rule);
      if (!finite(reach) || reach < 0) return failure(ruleId, 'invalid-distance', rule);
      const maxDistance = parameterNumber(rule, 'distance', DEFAULT_CLEAVE_DISTANCE_FEET);
      if (maxDistance === null || maxDistance < 0) return failure(ruleId, 'invalid-distance', rule);
      if (distance > maxDistance) return failure(ruleId, 'target-too-far', rule);
      const attackerDistance = target.distanceFromAttackerFeet;
      if (!finite(attackerDistance) || attackerDistance < 0) return failure(ruleId, 'invalid-distance', rule);
      if (attackerDistance > reach) return failure(ruleId, 'target-out-of-reach', rule);
      if (!nonEmpty(context.weapon.damageType)) return failure(ruleId, 'missing-damage-type', rule);
      const reason = withTurnAndUse(context, rule, DEFAULT_CLEAVE_MAX_USES);
      return reason ? failure(ruleId, reason, rule) : common;
    }
    case 'graze':
      if (!finite(abilityModifier)) return failure(ruleId, 'invalid-ability-modifier', rule);
      if (attack.outcome !== 'miss') return failure(ruleId, 'not-a-miss', rule);
      if (abilityModifier <= 0) return failure(ruleId, 'non-positive-ability-modifier', rule);
      if (!nonEmpty(context.weapon.damageType)) return failure(ruleId, 'missing-damage-type', rule);
      return common;
    case 'nick': {
      if (attack.outcome === 'cancelled' || attack.outcome === 'failed') return failure(ruleId, 'not-light-extra-attack', rule);
      if (!context.weapon.isLight || attack.action !== 'attack' || attack.lightExtraAttack !== true) {
        return failure(ruleId, 'not-light-extra-attack', rule);
      }
      const reason = withTurnAndUse(context, rule, DEFAULT_ONCE_PER_TURN);
      return reason ? failure(ruleId, reason, rule) : common;
    }
    case 'push': {
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      const rank = targetSizeRank(target.size);
      if (rank === null) return failure(ruleId, 'invalid-target-size', rule);
      const maxSize = parameterNumber(rule, 'maxSize', DEFAULT_PUSH_MAX_SIZE_RANK);
      if (maxSize === null || rank > maxSize) return failure(ruleId, 'target-too-large', rule);
      return common;
    }
    case 'sap':
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      return turnKey(context) ? common : failure(ruleId, 'missing-turn', rule);
    case 'slow': {
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      if (!finite(target.damageDealt) || target.damageDealt <= 0) return failure(ruleId, 'no-damage-dealt', rule);
      const reduction = parameterNumber(rule, 'speedReduction', DEFAULT_SLOW_REDUCTION_FEET);
      if (reduction === null || reduction < 0) return failure(ruleId, 'invalid-usage', rule);
      return turnKey(context) ? common : failure(ruleId, 'missing-turn', rule);
    }
    case 'topple':
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      if (!finite(abilityModifier)) return failure(ruleId, 'invalid-ability-modifier', rule);
      if (!finite(context.attacker.proficiencyBonus)) return failure(ruleId, 'invalid-proficiency-bonus', rule);
      return common;
    case 'vex':
      if (attack.outcome !== 'hit') return failure(ruleId, 'not-a-hit', rule);
      if (!finite(target.damageDealt) || target.damageDealt <= 0) return failure(ruleId, 'no-damage-dealt', rule);
      return turnKey(context) ? common : failure(ruleId, 'missing-turn', rule);
    case 'deadly':
    case 'fatal':
      if (attack.outcome !== 'hit' || attack.critical !== true) return failure(ruleId, 'not-critical', rule);
      if (typeof rule.params.die !== 'number' || !Number.isInteger(rule.params.die) || rule.params.die < 2) {
        return failure(ruleId, 'missing-critical-param', rule);
      }
      if (rule.kind === 'deadly' && (typeof rule.params.dice !== 'number' || !Number.isInteger(rule.params.dice) || rule.params.dice < 1)) {
        return failure(ruleId, 'missing-critical-param', rule);
      }
      return common;
    case 'criticalBleeding':
      if (attack.outcome !== 'hit' || attack.critical !== true) return failure(ruleId, 'not-critical', rule);
      return common;
    default:
      return failure(ruleId, 'rule-not-configured');
  }
}

/** Return the normalized configured property rules that may be settled now. */
export function configuredRuleIds(context: WeaponRuleContext): readonly string[] {
  const configuration = parseWeaponConfiguration(context.configuration);
  if (!configuration || !configuration.enabled) return [];
  const ids: string[] = [];
  const selected = selectedMastery(context, configuration);
  if (selected) ids.push(selected);
  for (const rule of configuration.rules) {
    if (!OFFICIAL_KINDS.has(rule.kind)) ids.push(rule.ruleId);
  }
  return [...new Set(ids)];
}

export function ruleTurnKey(context: WeaponRuleContext): string | null {
  return turnKey(context);
}

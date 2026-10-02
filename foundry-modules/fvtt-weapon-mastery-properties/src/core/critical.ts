import type { WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';
import { parseWeaponRule } from '@fvtt-json-generator/contracts/weapon-properties';

export interface DamageDice {
  count: number;
  faces: number;
  /** A static bonus is carried through a critical without being doubled. */
  bonus?: number;
  /** Riders such as a configured bonus can opt out of native critical doubling. */
  doubleOnCritical?: boolean;
  source?: string;
}

export interface CriticalDiceAddition {
  ruleId: string;
  count: number;
  faces: number;
}

export type CriticalDamageReason =
  | 'applied'
  | 'not-critical'
  | 'no-critical-rule'
  | 'invalid-dice'
  | 'invalid-rule'
  | 'conflicting-rules';

export interface CriticalDamageInput {
  critical: boolean;
  weaponBase: DamageDice;
  riders?: readonly DamageDice[];
  rules?: readonly WeaponRuleDefinition[];
}

export interface CriticalDamageResult {
  applicable: boolean;
  reason: CriticalDamageReason;
  /** Which mutually exclusive critical property changed the pool. */
  criticalRule: 'deadly' | 'fatal' | null;
  /** The selected weapon base term after native critical expansion and Fatal. */
  weaponBase: DamageDice;
  /** Other attack damage terms remain separate from the weapon base. */
  riders: readonly DamageDice[];
  /** Deadly/Fatal additions are never folded into the weapon base. */
  addedDice: readonly CriticalDiceAddition[];
}

function validDice(value: DamageDice): boolean {
  return Number.isInteger(value.count) && value.count >= 1
    && Number.isInteger(value.faces) && value.faces >= 2
    && (value.bonus === undefined || (typeof value.bonus === 'number' && Number.isFinite(value.bonus)))
    && (value.doubleOnCritical === undefined || typeof value.doubleOnCritical === 'boolean');
}

function criticalDice(value: DamageDice, critical: boolean): DamageDice {
  return {
    ...value,
    count: critical && value.doubleOnCritical !== false ? value.count * 2 : value.count,
  };
}

function validCriticalRule(rule: WeaponRuleDefinition): boolean {
  const die = rule.params.die;
  if (typeof die !== 'number' || !Number.isInteger(die) || ![4, 6, 8, 10, 12].includes(die)) return false;
  if (rule.kind === 'deadly') {
    const dice = rule.params.dice;
    return typeof dice === 'number' && Number.isInteger(dice) && dice >= 1 && dice <= 20;
  }
  if (rule.kind === 'fatal') {
    const dice = rule.params.dice;
    return dice === undefined || (typeof dice === 'number' && dice === 1);
  }
  return false;
}

/**
 * Calculates the structured critical pool without evaluating a Foundry Roll.
 * Native critical expansion doubles attack dice first. Fatal then changes only
 * the selected weapon base die faces and adds one die; Deadly adds its fixed
 * die after expansion. Static bonuses and rider sources are preserved.
 */
export function calculateCriticalDamage(input: CriticalDamageInput): CriticalDamageResult {
  if (!validDice(input.weaponBase) || (input.riders ?? []).some((rider) => !validDice(rider))) {
    return { applicable: false, reason: 'invalid-dice', criticalRule: null, weaponBase: { ...input.weaponBase }, riders: [...(input.riders ?? [])], addedDice: [] };
  }

  const weaponBase = criticalDice(input.weaponBase, input.critical);
  const riders = (input.riders ?? []).map((rider) => criticalDice(rider, input.critical));
  if (!input.critical) return { applicable: false, reason: 'not-critical', criticalRule: null, weaponBase, riders, addedDice: [] };

  const criticalRules = (input.rules ?? []).filter((rule) => rule.kind === 'deadly' || rule.kind === 'fatal');
  if (criticalRules.length > 1) {
    return { applicable: false, reason: 'conflicting-rules', criticalRule: null, weaponBase, riders, addedDice: [] };
  }
  const rawRule = criticalRules[0];
  if (!rawRule) return { applicable: false, reason: 'no-critical-rule', criticalRule: null, weaponBase, riders, addedDice: [] };
  const rule = parseWeaponRule(rawRule);
  if (!rule || !validCriticalRule(rule)) return { applicable: false, reason: 'invalid-rule', criticalRule: null, weaponBase, riders, addedDice: [] };

  const die = rule.params.die as number;
  const count = rule.kind === 'deadly' ? rule.params.dice as number : 1;
  if (rule.kind === 'fatal') weaponBase.faces = die;
  return {
    applicable: true,
    reason: 'applied',
    criticalRule: rule.kind === 'deadly' ? 'deadly' : 'fatal',
    weaponBase,
    riders,
    addedDice: [{ ruleId: rule.ruleId, count, faces: die }],
  };
}

function bonusSuffix(bonus: number | undefined): string {
  if (bonus === undefined || bonus === 0) return '';
  return bonus > 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`;
}

export function damageDiceFormula(dice: DamageDice): string {
  return `${dice.count}d${dice.faces}${bonusSuffix(dice.bonus)}`;
}

export function criticalDamageFormula(result: CriticalDamageResult): string {
  return [
    damageDiceFormula(result.weaponBase),
    ...result.riders.map(damageDiceFormula),
    ...result.addedDice.map((die) => `${die.count}d${die.faces}`),
  ].join(' + ');
}

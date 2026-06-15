import type { ActionData } from '../models/action';

export type AttackAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface AttackAbilityInferenceInput {
  abilities: Partial<Record<AttackAbility, number>>;
  proficiencyBonus: number;
  attackType: ActionData['attack']['type'] | 'msak' | 'rsak';
  toHit: number;
  damageFormula?: string;
}

export interface AttackAbilityInferenceResult {
  ability: AttackAbility;
  confidence: 'exact';
}

const ABILITIES: AttackAbility[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function inferAttackAbility(input: AttackAbilityInferenceInput): AttackAbilityInferenceResult | null {
  if (!Number.isFinite(input.proficiencyBonus)) {
    return null;
  }

  const damageBonus = parseFormulaBonus(input.damageFormula);
  if (damageBonus === null) {
    return null;
  }

  const matches = ABILITIES.filter((ability) => {
    const score = input.abilities[ability];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return false;
    }
    const modifier = abilityModifier(score);
    return input.toHit === modifier + input.proficiencyBonus && damageBonus === modifier;
  });

  if (matches.length === 0) {
    return null;
  }

  const preferred = preferredAbilities(input.attackType);
  const preferredMatches = preferred.filter((ability) => matches.includes(ability));
  if (preferredMatches.length === 1) {
    return { ability: preferredMatches[0]!, confidence: 'exact' };
  }

  if (matches.length === 1) {
    return { ability: matches[0]!, confidence: 'exact' };
  }

  return null;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function parseFormulaBonus(formula: string | undefined): number | null {
  if (!formula) {
    return null;
  }

  const match = formula.replace(/\s+/g, '').match(/^\d+d\d+(?:([+-])(\d+))?$/i);
  if (!match) {
    return null;
  }

  if (!match[1] || !match[2]) {
    return 0;
  }

  const value = Number.parseInt(match[2], 10);
  return match[1] === '-' ? -value : value;
}

function preferredAbilities(attackType: AttackAbilityInferenceInput['attackType']): AttackAbility[] {
  if (attackType === 'mwak') {
    return ['str'];
  }
  if (attackType === 'rwak') {
    return ['dex'];
  }
  return ['int', 'wis', 'cha'];
}

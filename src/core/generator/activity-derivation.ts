import { abilityModifier, inferAttackAbility, parseFormulaBonus, type AttackAbility, type AttackAbilityInferenceInput } from './attack-ability';

export type ActivityAbility = AttackAbility;

export type DcSourceKind = 'ability' | 'spellcasting' | 'literal';

export interface DcDerivationInput {
  abilities: Partial<Record<ActivityAbility, number>>;
  proficiencyBonus: number;
  dc: number;
  actionName?: string;
  englishName?: string;
  description?: string;
  dcSourceAbility?: ActivityAbility;
  dcSourceKind?: DcSourceKind;
}

export interface SaveDcDerivationInput extends DcDerivationInput {
  targetSaveAbility: string;
}

export interface CheckDcDerivationInput extends DcDerivationInput {
  checkAbility: string;
}

export type DcDerivationResult =
  | { kind: 'native'; calculation: ActivityAbility; reason: 'explicitSource' | 'firstExactMatch' }
  | { kind: 'literal'; reason: 'missingContext' | 'literalSource' | 'requiresResidualBonus' | 'noExactMatch' };

const ABILITIES: ActivityAbility[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function deriveAttackRoll(input: AttackAbilityInferenceInput) {
  return inferAttackAbility(input);
}

export function deriveDamageBase(formula: string | undefined): { abilityBonus: number | null } {
  return { abilityBonus: parseFormulaBonus(formula) };
}

export function deriveSaveDc(input: SaveDcDerivationInput): DcDerivationResult {
  return deriveDc(input);
}

export function deriveCheckDc(input: CheckDcDerivationInput): DcDerivationResult {
  return deriveDc(input);
}

function deriveDc(input: DcDerivationInput): DcDerivationResult {
  if (input.dcSourceKind === 'literal') {
    return { kind: 'literal', reason: 'literalSource' };
  }
  if (!Number.isFinite(input.proficiencyBonus) || !Number.isFinite(input.dc)) {
    return { kind: 'literal', reason: 'missingContext' };
  }

  const explicitSourceAbility = input.dcSourceAbility ?? extractExplicitDcSourceAbility(input);
  if (explicitSourceAbility) {
    return exactDcForAbility(input, explicitSourceAbility)
      ? { kind: 'native', calculation: explicitSourceAbility, reason: 'explicitSource' }
      : { kind: 'literal', reason: 'requiresResidualBonus' };
  }

  const firstExactMatch = ABILITIES.find((ability) => exactDcForAbility(input, ability));
  return firstExactMatch
    ? { kind: 'native', calculation: firstExactMatch, reason: 'firstExactMatch' }
    : { kind: 'literal', reason: 'noExactMatch' };
}

function exactDcForAbility(input: DcDerivationInput, ability: ActivityAbility): boolean {
  const score = input.abilities[ability];
  return typeof score === 'number' && Number.isFinite(score) && input.dc === 8 + input.proficiencyBonus + abilityModifier(score);
}

function extractExplicitDcSourceAbility(input: DcDerivationInput): ActivityAbility | undefined {
  const text = [input.actionName, input.englishName, input.description].filter(Boolean).join(' ');
  const spellcastingMatch = text.match(/spellcasting ability is\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i);
  if (spellcastingMatch?.[1]) {
    return mapAbilityWord(spellcastingMatch[1]);
  }

  const basedMatch = text.match(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)[-\s]+based\s+(?:save\s+)?dc\b/i);
  if (basedMatch?.[1]) {
    return mapAbilityWord(basedMatch[1]);
  }

  const chineseSpellcastingMatch = text.match(/施法属性(?:为|是|：|:)?\s*(力量|敏捷|体质|智力|感知|魅力)/);
  if (chineseSpellcastingMatch?.[1]) {
    return mapAbilityWord(chineseSpellcastingMatch[1]);
  }

  return undefined;
}

function mapAbilityWord(word: string): ActivityAbility | undefined {
  const normalized = word.trim().toLowerCase();
  const map: Record<string, ActivityAbility> = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
    力量: 'str',
    敏捷: 'dex',
    体质: 'con',
    智力: 'int',
    感知: 'wis',
    魅力: 'cha',
  };
  return map[normalized] ?? map[word.trim()];
}

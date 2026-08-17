export type AttackClass = "melee" | "ranged" | "spell";
export type NaturalOneConsequence = "counter" | "ally" | "weapon" | "self" | "other";

import { criticalMaxModifier } from "./critical-die";

export function classifyAttack(actionType: unknown): AttackClass | null {
  switch (actionType) {
    case "mwak": return "melee";
    case "rwak": return "ranged";
    case "msak":
    case "rsak": return "spell";
    default: return null;
  }
}

export function naturalOnePool(
  attackClass: AttackClass,
  itemType: unknown,
  hasOtherTable = false
): NaturalOneConsequence[] {
  const pool: NaturalOneConsequence[] = attackClass === "melee"
    ? ["counter", "ally"]
    : attackClass === "ranged"
      ? ["ally"]
      : ["ally", "self"];
  if ((attackClass === "melee" || attackClass === "ranged") && itemType === "weapon") pool.push("weapon");
  if (hasOtherTable) pool.push("other");
  return pool;
}

export function chooseNaturalOneConsequence(
  pool: readonly NaturalOneConsequence[],
  randomValue: number
): NaturalOneConsequence | null {
  if (!pool.length || !Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) return null;
  return pool[Math.floor(randomValue * pool.length)] ?? null;
}

export interface RetainedDieResult {
  result: number;
  active?: boolean;
  discarded?: boolean;
}

export interface D20Term {
  faces: number;
  results: readonly RetainedDieResult[];
}

/** Reject ambiguous/multiple d20 terms rather than treating discarded advantage dice as retained. */
export function retainedNatural(d20Terms: readonly D20Term[], expected: 1 | 20): boolean {
  const term = d20Terms.length === 1 ? d20Terms[0] : undefined;
  if (!term || term.faces !== 20) return false;
  const kept = term.results.filter((result) => result.active !== false && result.discarded !== true);
  return kept.length === 1 && kept[0]?.result === expected;
}

export interface BaseWeaponDamage {
  number: number;
  denomination: number;
  bonus?: string;
  isBaseWeaponDamage: boolean;
  hasAmbiguousSource?: boolean;
}

/**
 * Structured source for the first, native base-damage formula. This is
 * deliberately item-agnostic so weapon and attack-spell callers can share the
 * formula conversion once each has identified its unique base damage part.
 */
export interface NaturalTwentyBaseDamage {
  number: unknown;
  denomination: unknown;
  isBaseDamage: unknown;
  hasAmbiguousSource?: unknown;
}

export interface NativeDamageRollConfiguration {
  base?: boolean;
  parts?: unknown;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Minimal browser-safe view of the first DiceTerm after native critical expansion. */
export interface ConfiguredDiceTerm {
  number: unknown;
  faces: unknown;
  modifiers: unknown;
  options?: unknown;
}

export interface NaturalTwentyDiceTermSplit {
  first: {
    number: 1;
    faces: number;
    modifiers: readonly string[];
    options?: Readonly<Record<string, unknown>>;
  };
  remaining: {
    number: number;
    faces: number;
    modifiers: readonly string[];
    options?: Readonly<Record<string, unknown>>;
  };
  formula: string;
}

function validNaturalTwentyBaseDamage(source: NaturalTwentyBaseDamage | null | undefined): source is NaturalTwentyBaseDamage & {
  number: number;
  denomination: number;
  isBaseDamage: true;
} {
  return source?.isBaseDamage === true
    && source.hasAmbiguousSource !== true
    && (source.hasAmbiguousSource === undefined || typeof source.hasAmbiguousSource === "boolean")
    && typeof source.number === "number"
    && Number.isInteger(source.number)
    && source.number >= 1
    && typeof source.denomination === "number"
    && Number.isInteger(source.denomination)
    && source.denomination >= 2;
}

function configuredDiceModifiers(modifiers: unknown): string[] | null {
  const values = Array.isArray(modifiers)
    ? modifiers
    : modifiers instanceof Set
      ? [...modifiers]
      : null;
  if (!values || values.some((modifier) => typeof modifier !== "string" || modifier.length === 0 || modifier.length > 50 || !/^[A-Za-z][A-Za-z0-9<>=!]*$/u.test(modifier))) return null;
  return [...values];
}

function configuredDiceOptions(options: unknown): Record<string, unknown> | null | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== "object" || Array.isArray(options)) return null;
  return { ...(options as Record<string, unknown>) };
}

function diceTermFormula(number: number, faces: number, modifiers: readonly string[]): string {
  return `${number}d${faces}${modifiers.join("")}`;
}

/**
 * Splits the first DiceTerm only after dnd5e has applied the native critical
 * multiplier. It neither mutates the configured term nor touches the roll's
 * critical option, so later dice/riders in that same damage roll remain native.
 */
export function splitConfiguredCriticalFirstDiceTerm(
  term: ConfiguredDiceTerm | null | undefined
): NaturalTwentyDiceTermSplit | null {
  if (!term || typeof term.number !== "number" || !Number.isInteger(term.number) || term.number < 2
    || typeof term.faces !== "number" || !Number.isInteger(term.faces) || term.faces < 2) return null;
  const modifiers = configuredDiceModifiers(term.modifiers);
  const options = configuredDiceOptions(term.options);
  if (!modifiers || options === null || modifiers.some((modifier) => /^(?:min|max|critmax)/iu.test(modifier))) return null;
  const maxModifier = criticalMaxModifier(term.faces);
  if (!maxModifier) return null;
  const firstModifiers = [...modifiers, maxModifier];
  const remaining = term.number - 1;
  const first: NaturalTwentyDiceTermSplit["first"] = { number: 1, faces: term.faces, modifiers: firstModifiers };
  const remainder: NaturalTwentyDiceTermSplit["remaining"] = { number: remaining, faces: term.faces, modifiers: [...modifiers] };
  if (options) {
    first.options = { ...options };
    remainder.options = { ...options };
  }
  return {
    first,
    remaining: remainder,
    formula: `${diceTermFormula(1, term.faces, firstModifiers)} + ${diceTermFormula(remaining, term.faces, modifiers)}`
  };
}

/**
 * Converts only the first structured base-damage die in an unevaluated
 * formula. The converted formula carries the complete critical dice pool in
 * one DiceTerm. The `critmaxN` modifier is applied to results[0], so it still
 * rolls while its effective value is its maximum and its raw face remains
 * available to animation and tooltip rendering: 1d8 -> 2d8critmax8.
 *
 * The formula must begin with the exact, plain base `NdX` term. This rejects
 * custom, previously transformed, or otherwise ambiguous formula structures
 * instead of guessing how to rewrite them.
 */
export function transformNaturalTwentyBaseDamageFormula(
  source: NaturalTwentyBaseDamage | null | undefined,
  formula: unknown
): string | null {
  if (!validNaturalTwentyBaseDamage(source) || typeof formula !== "string" || formula.length === 0 || formula.length > 200 || /[<>;]/.test(formula)) return null;
  const firstDie = /^(\s*)(\d+)d(\d+)(?=\s*(?:[+-]|$))/iu.exec(formula);
  if (!firstDie || Number(firstDie[2]) !== source.number || Number(firstDie[3]) !== source.denomination) return null;
  const untouchedSuffix = formula.slice(firstDie[0].length);
  // A second die in this same part has an unclear critical/rider boundary. Do
  // not disable native critical expansion unless this first part is fully
  // accounted for by the replacement formula.
  if (/(?:\d*)d\d+/iu.test(untouchedSuffix)) return null;
  const remainingDice = (source.number * 2) - 1;
  const maxModifier = criticalMaxModifier(source.denomination);
  if (!maxModifier) return null;
  return `${firstDie[1]}${remainingDice + 1}d${source.denomination}${maxModifier}${untouchedSuffix}`;
}

/** Compatibility adapter for the existing weapon preview/runtime callers. */
export function transformNaturalTwentyBaseWeaponDamage(source: BaseWeaponDamage): string | null {
  const bonus = source?.bonus === undefined ? "" : typeof source.bonus === "string" ? source.bonus.trim() : null;
  if (bonus === null || bonus.length > 200 || /[<>;]/.test(bonus)) return null;
  const formula = `${source?.number}d${source?.denomination}${bonus ? ` + ${bonus}` : ""}`;
  return transformNaturalTwentyBaseDamageFormula({
    number: source?.number,
    denomination: source?.denomination,
    isBaseDamage: source?.isBaseWeaponDamage,
    hasAmbiguousSource: source?.hasAmbiguousSource
  }, formula);
}

/**
 * Legacy pre-evaluation formula helper. It only accepts a configuration whose
 * caller has already explicitly disabled a second critical expansion; it never
 * changes `isCritical` itself. Post-configuration runtime integration should
 * use splitConfiguredCriticalFirstDiceTerm instead.
 */
export function transformNaturalTwentyBaseDamageRoll(
  source: NaturalTwentyBaseDamage | null | undefined,
  rolls: readonly NativeDamageRollConfiguration[]
): NativeDamageRollConfiguration[] | null {
  if (!validNaturalTwentyBaseDamage(source) || !Array.isArray(rolls)) return null;
  const baseIndexes = rolls
    .map((roll, index) => roll?.base === true ? index : -1)
    .filter((index) => index >= 0);
  if (baseIndexes.length !== 1) return null;
  const baseIndex = baseIndexes[0];
  if (baseIndex === undefined) return null;
  const base = rolls[baseIndex];
  if (!base || !Array.isArray(base.parts) || base.parts.length < 1 || !base.parts.every((part: unknown) => typeof part === "string")) return null;
  if (base.options?.isCritical !== false) return null;
  const formula = transformNaturalTwentyBaseDamageFormula(source, base.parts[0]);
  if (!formula) return null;
  // dnd5e's live damage-roll configuration carries non-cloneable functions
  // inside `data` (for example actor-derived roll helpers). A deep clone makes
  // the real v14 hook fail with DataCloneError even though the fixture shape
  // looks serializable. Only copy the fields this transform mutates and keep
  // the native data object intact.
  const transformed = rolls.map((roll) => ({
    ...roll,
    ...(Array.isArray(roll.parts) ? { parts: [...roll.parts] } : {}),
    ...(roll.options && typeof roll.options === "object" ? { options: { ...roll.options } } : {})
  })) as NativeDamageRollConfiguration[];
  const target = transformed[baseIndex];
  if (!target) return null;
  target.parts = [formula, ...base.parts.slice(1)];
  return transformed;
}

/** Compatibility adapter for existing weapon runtime callers. */
export function transformNaturalTwentyBaseWeaponRoll(
  source: BaseWeaponDamage,
  rolls: readonly NativeDamageRollConfiguration[]
): NativeDamageRollConfiguration[] | null {
  return transformNaturalTwentyBaseDamageRoll({
    number: source?.number,
    denomination: source?.denomination,
    isBaseDamage: source?.isBaseWeaponDamage,
    hasAmbiguousSource: source?.hasAmbiguousSource
  }, rolls);
}

export function nextWeaponPenalty(current: unknown): number | null {
  const penalty = typeof current === "number" ? current : 0;
  if (!Number.isInteger(penalty) || penalty < 0 || penalty >= 20) return null;
  return penalty + 1;
}

export function repairedWeaponPenalty(current: unknown, amount = 1): number | null {
  const penalty = typeof current === "number" ? current : 0;
  if (!Number.isInteger(penalty) || penalty < 0 || !Number.isInteger(amount) || amount < 1) return null;
  return Math.max(0, penalty - amount);
}

/**
 * A browser-safe view of an evaluated dnd5e 5.3.3 DamageRoll.
 *
 * dnd5e's getDamageConfig marks the weapon base configuration with `base`,
 * then DamageRoll.fromConfig creates the evaluated roll. The marker is not a
 * dependable property of the evaluated roll, so the runtime must carry it
 * forward before calling this helper. The same applies to whether @mod was
 * present in the native base formula; omitting the marker would make an
 * offhand attack indistinguishable from one which already included the mod.
 */
export interface EvaluatedCleaveDamageRoll {
  total?: unknown;
  data?: Record<string, unknown>;
  formula?: unknown;
  terms?: readonly unknown[];
  /** Copied from dnd5e's pre-evaluation roll configuration. */
  base?: unknown;
  /** Explicit runtime marker; inferred only when the evaluated terms are unambiguous. */
  abilityModifierIncluded?: unknown;
  options?: {
    type?: unknown;
    base?: unknown;
    abilityModifierIncluded?: unknown;
    [key: string]: unknown;
  };
}

export interface CleaveDamageComponent {
  /** Damage is clamped per native roll before it reaches applyDamage. */
  value: number;
  /** dnd5e's selected roll.options.type; null preserves an untyped roll. */
  type: string | null;
  rollIndex: number;
}

export type CleaveDamageRejectReason =
  | 'missing-rolls'
  | 'missing-base'
  | 'ambiguous-base'
  | 'invalid-roll-total'
  | 'invalid-base-ability-modifier'
  | 'ambiguous-ability-modifier'
  | 'invalid-damage-type';

export type CleaveDamageResult =
  | {
      ok: true;
      components: readonly CleaveDamageComponent[];
      total: number;
      baseIndex: number;
      abilityModifier: number;
      removedAbilityModifier: number;
    }
  | {
      ok: false;
      reason: CleaveDamageRejectReason;
    };

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isMarkedBase(roll: EvaluatedCleaveDamageRoll): boolean {
  return roll.base === true || roll.options?.base === true;
}

function explicitAbilityModifierIncluded(roll: EvaluatedCleaveDamageRoll): boolean | undefined {
  const value = roll.abilityModifierIncluded ?? roll.options?.abilityModifierIncluded;
  return typeof value === 'boolean' ? value : undefined;
}

function isNumericTerm(term: unknown): term is Record<string, unknown> {
  if (!record(term)) return false;
  const className = term.class ?? (term as { constructor?: { name?: unknown } }).constructor?.name;
  if (className === 'NumericTerm') return true;
  // This structural fallback is for serialized/fixture terms. Dice terms have
  // faces/denomination and operator terms have operator, so neither matches.
  return typeof term.number === 'number'
    && !('faces' in term)
    && !('denomination' in term)
    && !('operator' in term);
}

function numericTermTotal(term: Record<string, unknown>): number | null {
  if (finite(term.total)) return term.total;
  return finite(term.number) ? term.number : null;
}

/**
 * Infer whether dnd5e included the positive @mod term in the marked base roll.
 * An explicit marker always wins. Without it, only one matching NumericTerm
 * is accepted; multiple matches are ambiguous because a rider can equal the
 * ability modifier by coincidence.
 */
function abilityModifierWasIncluded(
  roll: EvaluatedCleaveDamageRoll,
  abilityModifier: number,
): true | false | 'ambiguous' {
  const explicit = explicitAbilityModifierIncluded(roll);
  if (explicit !== undefined) return explicit;
  if (abilityModifier <= 0) return false;

  const formula = typeof roll.formula === 'string' ? roll.formula : '';
  if ((formula.match(/@mod\b/gu) ?? []).length > 1) return 'ambiguous';
  if (formula.includes('@mod')) return true;

  const matches = (roll.terms ?? [])
    .filter(isNumericTerm)
    .map(numericTermTotal)
    .filter((value): value is number => value !== null && value === abilityModifier);
  if (matches.length > 1) return 'ambiguous';
  return matches.length === 1;
}

function damageType(roll: EvaluatedCleaveDamageRoll): string | null | undefined {
  const value = roll.options?.type;
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) return undefined;
  return value;
}

/**
 * Convert authoritative evaluated native damage rolls into Cleave's child
 * damage components. The positive ability modifier is removed at most once,
 * and only from the uniquely marked weapon base roll. Every component is
 * clamped independently, while typed and untyped rolls remain separate.
 */
export function calculateCleaveChildDamage(
  rolls: readonly EvaluatedCleaveDamageRoll[] | null | undefined,
): CleaveDamageResult {
  if (!Array.isArray(rolls) || rolls.length === 0) return { ok: false, reason: 'missing-rolls' };
  const baseIndexes = rolls.map((roll, index) => isMarkedBase(roll) ? index : -1).filter((index) => index >= 0);
  if (baseIndexes.length === 0) return { ok: false, reason: 'missing-base' };
  if (baseIndexes.length !== 1) return { ok: false, reason: 'ambiguous-base' };
  const baseIndex = baseIndexes[0]!;
  const base = rolls[baseIndex]!;
  const abilityModifier = base.data?.mod;
  if (!finite(abilityModifier)) return { ok: false, reason: 'invalid-base-ability-modifier' };

  const included = abilityModifierWasIncluded(base, abilityModifier);
  if (included === 'ambiguous') return { ok: false, reason: 'ambiguous-ability-modifier' };
  const removedAbilityModifier = included && abilityModifier > 0 ? abilityModifier : 0;
  const components: CleaveDamageComponent[] = [];
  for (const [rollIndex, roll] of rolls.entries()) {
    if (!finite(roll?.total)) return { ok: false, reason: 'invalid-roll-total' };
    const type = damageType(roll);
    if (type === undefined) return { ok: false, reason: 'invalid-damage-type' };
    const value = Math.max(0, roll.total - (rollIndex === baseIndex ? removedAbilityModifier : 0));
    components.push({ value, type, rollIndex });
  }
  return {
    ok: true,
    components,
    total: components.reduce((sum, component) => sum + component.value, 0),
    baseIndex,
    abilityModifier,
    removedAbilityModifier,
  };
}

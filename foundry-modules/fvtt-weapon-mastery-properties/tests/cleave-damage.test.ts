import { describe, expect, test } from 'bun:test';
import { calculateCleaveChildDamage, type EvaluatedCleaveDamageRoll } from '../src/adapters/cleave-damage.ts';

function numeric(number: number): Record<string, unknown> {
  return { class: 'NumericTerm', number, total: number };
}

function die(total: number): Record<string, unknown> {
  return { class: 'Die', faces: 8, total };
}

function baseRoll(overrides: Partial<EvaluatedCleaveDamageRoll> = {}): EvaluatedCleaveDamageRoll {
  return {
    base: true,
    total: 12,
    data: { mod: 3 },
    terms: [die(9), { operator: '+' }, numeric(3)],
    options: { type: 'slashing' },
    ...overrides,
  };
}

describe('Cleave evaluated damage', () => {
  test('removes one positive ability modifier only from the marked base roll', () => {
    const result = calculateCleaveChildDamage([
      baseRoll(),
      { total: 5, data: { mod: 3 }, terms: [die(5)], options: { type: 'fire' } },
    ]);
    expect(result).toEqual({
      ok: true,
      components: [
        { value: 9, type: 'slashing', rollIndex: 0 },
        { value: 5, type: 'fire', rollIndex: 1 },
      ],
      total: 14,
      baseIndex: 0,
      abilityModifier: 3,
      removedAbilityModifier: 3,
    });
  });

  test('retains a negative ability modifier and clamps every component independently', () => {
    const result = calculateCleaveChildDamage([
      baseRoll({ total: 1, data: { mod: -2 }, terms: [die(3), { operator: '-' }, numeric(2)] }),
      { total: -4, options: { type: 'poison' } },
    ]);
    expect(result).toMatchObject({ ok: true, total: 1, removedAbilityModifier: 0, abilityModifier: -2 });
    if (result.ok) expect(result.components).toEqual([
      { value: 1, type: 'slashing', rollIndex: 0 },
      { value: 0, type: 'poison', rollIndex: 1 },
    ]);
  });

  test('does not subtract an offhand modifier already omitted by native dnd5e', () => {
    const result = calculateCleaveChildDamage([
      baseRoll({
        total: 9,
        terms: [die(9)],
        abilityModifierIncluded: false,
      }),
    ]);
    expect(result).toMatchObject({ ok: true, total: 9, removedAbilityModifier: 0 });
  });

  test('uses an explicit inclusion marker when the evaluated terms are ambiguous', () => {
    const result = calculateCleaveChildDamage([
      baseRoll({
        terms: [die(6), { operator: '+' }, numeric(3), { operator: '+' }, numeric(3)],
        abilityModifierIncluded: true,
      }),
    ]);
    expect(result).toMatchObject({ ok: true, total: 9, removedAbilityModifier: 3 });
  });

  test('rejects missing or ambiguous base rolls and ambiguous ability provenance', () => {
    expect(calculateCleaveChildDamage([{ total: 10, data: { mod: 3 }, options: { type: 'slashing' } }])).toEqual({ ok: false, reason: 'missing-base' });
    expect(calculateCleaveChildDamage([baseRoll(), baseRoll()])).toEqual({ ok: false, reason: 'ambiguous-base' });
    expect(calculateCleaveChildDamage([baseRoll({ terms: [die(6), numeric(3), numeric(3)] })])).toEqual({ ok: false, reason: 'ambiguous-ability-modifier' });
  });

  test('rejects malformed evaluated inputs instead of trusting caller totals', () => {
    expect(calculateCleaveChildDamage([baseRoll({ total: Number.NaN })])).toEqual({ ok: false, reason: 'invalid-roll-total' });
    expect(calculateCleaveChildDamage([baseRoll({ data: {} })])).toEqual({ ok: false, reason: 'invalid-base-ability-modifier' });
    expect(calculateCleaveChildDamage([baseRoll({ options: { type: 4 } })])).toEqual({ ok: false, reason: 'invalid-damage-type' });
  });
});

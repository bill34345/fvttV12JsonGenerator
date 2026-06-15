import { describe, expect, it } from 'bun:test';
import { inferAttackAbility } from '../attack-ability';

describe('inferAttackAbility', () => {
  it('infers strength for an exact melee attack and damage modifier match', () => {
    expect(
      inferAttackAbility({
        abilities: { str: 16, dex: 14, con: 16, int: 3, wis: 11, cha: 3 },
        proficiencyBonus: 3,
        attackType: 'mwak',
        toHit: 6,
        damageFormula: '1d8+3',
      }),
    ).toEqual({ ability: 'str', confidence: 'exact' });
  });

  it('infers each action independently from its own attack and damage numbers', () => {
    expect(
      inferAttackAbility({
        abilities: { str: 16, dex: 14, con: 12, int: 18, wis: 10, cha: 8 },
        proficiencyBonus: 3,
        attackType: 'rwak',
        toHit: 7,
        damageFormula: '2d8+4',
      }),
    ).toEqual({ ability: 'int', confidence: 'exact' });
  });

  it('does not infer ability when the attack bonus and damage modifier do not exactly match', () => {
    expect(
      inferAttackAbility({
        abilities: { str: 16, dex: 14, con: 16, int: 3, wis: 11, cha: 3 },
        proficiencyBonus: 3,
        attackType: 'mwak',
        toHit: 8,
        damageFormula: '1d8+3',
      }),
    ).toBeNull();
  });
});

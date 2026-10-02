import { describe, expect, test } from 'bun:test';
import { calculateCriticalDamage, criticalDamageFormula, damageDiceFormula, type DamageDice } from '../src/core/critical.ts';
import type { WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';

const deadly: WeaponRuleDefinition = { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' };
const fatal: WeaponRuleDefinition = { ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' };

const base: DamageDice = { count: 1, faces: 6, bonus: 4, source: 'weapon-base' };

describe('critical damage formulas', () => {
  test('native critical doubling happens before Deadly and preserves static bonuses', () => {
    const result = calculateCriticalDamage({ critical: true, weaponBase: base, rules: [deadly] });
    expect(result.applicable).toBeTrue();
    expect(result.reason).toBe('applied');
    expect(result.weaponBase).toMatchObject({ count: 2, faces: 6, bonus: 4 });
    expect(result.addedDice).toEqual([{ ruleId: 'house.deadly', count: 1, faces: 8 }]);
    expect(criticalDamageFormula(result)).toBe('2d6 + 4 + 1d8');
  });

  test('Fatal changes only the selected weapon base faces and adds exactly one die', () => {
    const rider: DamageDice = { count: 1, faces: 6, source: 'sneak-attack' };
    const result = calculateCriticalDamage({ critical: true, weaponBase: base, riders: [rider], rules: [fatal] });
    expect(result.weaponBase).toMatchObject({ count: 2, faces: 10, bonus: 4 });
    expect(result.riders).toEqual([{ count: 2, faces: 6, source: 'sneak-attack' }]);
    expect(result.addedDice).toEqual([{ ruleId: 'house.fatal', count: 1, faces: 10 }]);
    expect(criticalDamageFormula(result)).toBe('2d10 + 4 + 2d6 + 1d10');
  });

  test('ordinary hits do not apply Deadly/Fatal transformations', () => {
    const result = calculateCriticalDamage({ critical: false, weaponBase: base, rules: [fatal] });
    expect(result.reason).toBe('not-critical');
    expect(result.weaponBase).toEqual(base);
    expect(result.addedDice).toEqual([]);
    expect(damageDiceFormula(result.weaponBase)).toBe('1d6 + 4');
  });

  test('riders can explicitly remain single on a critical while the weapon base doubles', () => {
    const result = calculateCriticalDamage({
      critical: true,
      weaponBase: base,
      riders: [{ count: 1, faces: 4, doubleOnCritical: false, source: 'configured-flat-rider' }],
      rules: [deadly],
    });
    expect(result.weaponBase.count).toBe(2);
    expect(result.riders[0]).toMatchObject({ count: 1, faces: 4 });
  });

  test('Deadly and Fatal cannot be silently combined', () => {
    const result = calculateCriticalDamage({ critical: true, weaponBase: base, rules: [deadly, fatal] });
    expect(result.reason).toBe('conflicting-rules');
    expect(result.addedDice).toEqual([]);
  });

  test('critical calculation does not mutate source dice or rider objects', () => {
    const weapon = { ...base };
    const rider = { count: 1, faces: 6, source: 'rider' } satisfies DamageDice;
    calculateCriticalDamage({ critical: true, weaponBase: weapon, riders: [rider], rules: [fatal] });
    expect(weapon).toEqual(base);
    expect(rider).toEqual({ count: 1, faces: 6, source: 'rider' });
  });
});

import { describe, expect, test } from 'bun:test';
import {
  defaultWeaponConfiguration, officialMasteryRule, parseWeaponConfiguration,
  parseWeaponRule, weaponConfigurationFlags, readWeaponConfiguration,
  weaponCriticalBonus, WEAPON_MASTERY_IDS,
} from '../packages/contracts/src/weapon-properties';

const deadly = { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly d8', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' };

describe('weapon rules contract', () => {
  test('all official masteries are immutable rule identities and isolated copies', () => {
    for (const id of WEAPON_MASTERY_IDS) expect(parseWeaponRule(officialMasteryRule(id))?.kind).toBe(id);
    const original = officialMasteryRule('slow');
    expect(parseWeaponRule({ ...original, params: { speedReduction: 20 } })).toBeNull();
    expect(parseWeaponRule({ ...original, ruleId: 'house.ice', params: { speedReduction: 20 } })?.params.speedReduction).toBe(20);
    original.params.speedReduction = 100;
    expect(officialMasteryRule('slow').params.speedReduction).toBe(10);
  });
  test('native mastery and an explicit property survive roundtrip without losing identity', () => {
    const config = parseWeaponConfiguration({ ...defaultWeaponConfiguration(), enabled: true, rules: [deadly] });
    expect(config).not.toBeNull();
    expect(weaponCriticalBonus(config!)).toBe('1d8');
    expect(readWeaponConfiguration({ flags: weaponConfigurationFlags(config!) })).toEqual(config);
    expect(config?.grantMastery).toBe(false);
  });
  test('requires exact schema, known rule kind and complete critical dice', () => {
    expect(parseWeaponConfiguration({ ...defaultWeaponConfiguration(), schemaVersion: 2 })).toBeNull();
    expect(parseWeaponRule({ ...deadly, kind: 'javascript' })).toBeNull();
    expect(parseWeaponRule({ ...deadly, params: { dice: 1 } })).toBeNull();
    expect(parseWeaponRule({ ...deadly, params: { dice: 1, die: 20 } })).toBeNull();
    expect(parseWeaponRule({ ...deadly, params: { dice: 0, die: 8 } })).toBeNull();
    expect(parseWeaponConfiguration({ ...defaultWeaponConfiguration(), mastery: 'house.missing' })).toBeNull();
  });
  test('does not permit stacking multiple initial properties or repeated identities', () => {
    const fatal = { ...deadly, ruleId: 'house.fatal', kind: 'fatal', params: { die: 10 } };
    expect(parseWeaponConfiguration({ ...defaultWeaponConfiguration(), rules: [deadly, fatal] })).toBeNull();
    expect(parseWeaponConfiguration({ ...defaultWeaponConfiguration(), rules: [deadly, deadly] })).toBeNull();
  });
  test('persistent damage has explicit semantics and bounded data-only formula', () => {
    const bleed = { ruleId: 'house.bleed', kind: 'criticalBleeding', label: 'Bleed', stackingGroup: 'bleeding', params: { formula: '1d6', mode: 'hpLoss' } };
    expect(parseWeaponRule(bleed)).not.toBeNull();
    expect(parseWeaponRule({ ...bleed, params: { formula: '1d6' } })).toBeNull();
    expect(parseWeaponRule({ ...bleed, params: { formula: 'globalThis.game', mode: 'hpLoss' } })).toBeNull();
    expect(parseWeaponRule({ ...bleed, params: { formula: '1d6', mode: 'damage' } })).toBeNull();
  });
});

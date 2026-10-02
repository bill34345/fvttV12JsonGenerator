import { expect, test } from 'bun:test';
import { applyWeaponCriticalRolls } from '../src/adapters/critical-roll';
import { defaultWeaponConfiguration, weaponConfigurationFlags, weaponDamagePartSignature, type WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';

class Die {
  number: number; faces: number; options: any; modifiers: string[]; method: any; results: any[] = []; _evaluated = false;
  constructor(data: any) { this.number = data.number; this.faces = data.faces; this.options = data.options ?? {}; this.modifiers = data.modifiers ?? []; this.method = data.method; }
}
class OperatorTerm { operator: string; options: any; constructor(data: any) { this.operator = data.operator; this.options = data.options ?? {}; } }
class Roll {
  isCritical = true; _evaluated = false; options: any = {}; terms: any[]; compiled = '';
  constructor(terms: any[]) { this.terms = terms; this.resetFormula(); }
  get formula() { return this.compiled; }
  resetFormula() { this.compiled = this.terms.map(t => t instanceof Die ? `${t.number}d${t.faces}${t.modifiers.join('')}` : t.operator).join(' '); }
}
const globals = { foundry: { dice: { terms: { Die, OperatorTerm } } } };
function fixture(kind: 'deadly' | 'fatal' = 'fatal') {
  const rule: WeaponRuleDefinition = { ruleId: `house.${kind}`, kind, label: kind, params: kind === 'fatal' ? { die: 10 } : { dice: 1, die: 8 }, stackingGroup: `house.${kind}` };
  const item = { type: 'weapon', flags: weaponConfigurationFlags({ ...defaultWeaponConfiguration(), enabled: true, rules: [rule] }) };
  const activity: any = { type: 'attack', item, flags: {} };
  const base = new Roll([new Die({ number: 2, faces: 6, modifiers: ['r1', 'critmax6'], options: { baseNumber: 1, critical: true } })]);
  const rider = new Roll([new Die({ number: 4, faces: 8 })]);
  return { activity, base, rider, config: { subject: activity, rolls: [{ base: false }, { base: true }] } };
}

test('Fatal changes the unique native base, preserves riders/modifiers, appends only one undoubled die', () => {
  const { base, rider, config } = fixture();
  const result = applyWeaponCriticalRolls([rider, base], config, globals);
  expect(result.applied).toBe(true);
  expect(rider.formula).toBe('4d8');
  expect(base.formula).toBe('2d10r1critmax10 + 1d10');
  expect(base.terms[0].options.baseNumber).toBe(1);
  expect(applyWeaponCriticalRolls([rider, base], config, globals).reason).toBe('already-applied');
  expect(base.formula).toBe('2d10r1critmax10 + 1d10');
});

test('an unrelated identical native bonus does not suppress Deadly or Fatal', () => {
  const { base, rider, config } = fixture('deadly');
  rider.options.critical = { bonusDamage: '1d8' };
  expect(applyWeaponCriticalRolls([rider, base], config, globals).applied).toBe(true);
  expect(rider.formula).toBe('4d8 + 1d8');
  const fatal = fixture();
  fatal.base.options.critical = { bonusDamage: '1d10' };
  applyWeaponCriticalRolls([fatal.rider, fatal.base], fatal.config, globals);
  expect(fatal.base.terms[0].faces).toBe(10);
  expect(fatal.base.formula).toBe('2d10r1critmax10 + 1d10');
});

test('generator-owned native Deadly bonus is recognized by provenance rather than just text', () => {
  const { base, rider, activity, config } = fixture('deadly');
  rider.options.critical = { bonusDamage: '1d8' };
  rider.terms.push(new OperatorTerm({ operator: '+', options: { criticalBonusDamage: true } }), new Die({ number: 1, faces: 8, options: { criticalBonusDamage: true } }));
  rider.resetFormula();
  activity.flags.fvttJsonGenerator = { weaponPropertyContributions: { deadly: { ruleId: 'house.deadly', bonus: '1d8' } } };
  expect(applyWeaponCriticalRolls([rider, base], config, globals).reason).toBe('native-owned-bonus');
  expect(rider.formula).toBe('4d8 + 1d8');
});

test('ambiguous base layouts, evaluated dice and native powerful-critical fail before mutation', () => {
  const { base, rider, config } = fixture();
  const before = base.formula;
  expect(applyWeaponCriticalRolls([rider, base], { ...config, rolls: [{ base: true }, { base: true }] }, globals).block).toBe(true);
  base._evaluated = true;
  expect(applyWeaponCriticalRolls([rider, base], config, globals).block).toBe(true);
  base._evaluated = false;
  base.options.critical = { powerfulCritical: true };
  expect(applyWeaponCriticalRolls([rider, base], config, globals).block).toBe(true);
  expect(base.formula).toBe(before);
});

test('ordinary damage remains completely unchanged', () => {
  const { base, rider, config } = fixture(); base.isCritical = false; rider.isCritical = false;
  expect(applyWeaponCriticalRolls([rider, base], config, globals)).toEqual({ applied: false, reason: 'ordinary-damage' });
  expect(base.formula).toBe('2d6r1critmax6');
});

test('Fatal uses a generated literal base without changing an unrelated damage rider or adding ability damage', () => {
  const { activity, base, rider, config } = fixture();
  const part = { number: 1, denomination: 6, bonus: '', types: ['piercing'], custom: { enabled: false } };
  activity.damage = { includeBase: false, parts: [part, { ...part, denomination: 8, types: ['fire'] }] };
  activity.flags.fvttJsonGenerator = { weaponPropertyBase: { schemaVersion: 1, partIndex: 0,
    signature: weaponDamagePartSignature(part) } };
  config.rolls = [{ base: false }, { base: false }];
  expect(applyWeaponCriticalRolls([base, rider], config, globals).applied).toBeTrue();
  expect(base.formula).toBe('2d10r1critmax10 + 1d10');
  expect(rider.formula).toBe('4d8');
  expect(base.terms.some(term => String(term.formula ?? '').includes('@mod'))).toBeFalse();
});

test('literal base edits, reordered parts or extra unbound rolls fail before mutation', () => {
  for (const change of ['edited-part', 'reordered-parts', 'extra-roll']) {
    const { activity, base, rider, config } = fixture();
    const part = { number: 1, denomination: 6, bonus: '', types: ['piercing'], custom: { enabled: false } };
    activity.damage = { includeBase: false, parts: [part, { ...part, denomination: 8 }] };
    activity.flags.fvttJsonGenerator = { weaponPropertyBase: { schemaVersion: 1, partIndex: 0,
      signature: weaponDamagePartSignature(part) } };
    config.rolls = [{ base: false }, { base: false }];
    if (change === 'edited-part') part.denomination = 4;
    if (change === 'reordered-parts') activity.damage.parts.reverse();
    const rolls = [base, rider];
    if (change === 'extra-roll') { config.rolls.push({ base: false }); rolls.push(new Roll([new Die({ number: 1, faces: 4 })])); }
    const before = rolls.map(roll => roll.formula);
    expect(applyWeaponCriticalRolls(rolls, config, globals).block).toBeTrue();
    expect(rolls.map(roll => roll.formula)).toEqual(before);
  }
});

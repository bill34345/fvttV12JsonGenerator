import { describe, expect, test } from 'bun:test';
import type { WeaponConfiguration, WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';
import { settleConfiguredWeaponRules, settleWeaponRule } from '../src/core/settlement.ts';
import type { WeaponRuleContext } from '../src/core/types.ts';

function configuration(kind: string, rules: WeaponRuleDefinition[] = []): WeaponConfiguration {
  return { schemaVersion: 1, enabled: true, mastery: `dnd2024.${kind}`, grantMastery: false, rules };
}

function context(kind: string, overrides: Partial<WeaponRuleContext> = {}): WeaponRuleContext {
  return {
    configuration: configuration(kind),
    nativeMasteryUnlocked: true,
    source: { actorId: 'attacker', itemId: 'weapon', activityId: 'attack' },
    weapon: { isMelee: true, isLight: false, reachFeet: 5, damageType: 'slashing' },
    attacker: { abilityModifier: 4, proficiencyBonus: 3 },
    attack: { attackId: 'attack-1', outcome: 'hit', action: 'attack', primaryTargetId: 'primary' },
    target: { id: 'target', size: 'medium', distanceFromAttackerFeet: 5, distanceFromPrimaryFeet: 5, damageDealt: 8 },
    turn: { key: 'combat:1:0' },
    ...overrides,
  };
}

const deadly: WeaponRuleDefinition = { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' };
const fatal: WeaponRuleDefinition = { ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' };
const bleeding: WeaponRuleDefinition = {
  ruleId: 'house.critBleeding', kind: 'criticalBleeding', label: 'Critical Bleeding',
  params: { formula: '1d6', mode: 'damage', damageType: 'slashing', endOnHealing: true }, stackingGroup: 'house.critBleeding',
};

describe('weapon mastery settlements', () => {
  test('Cleave creates a bounded child attack with negative-only ability modifier', () => {
    const result = settleWeaponRule(context('cleave', { attacker: { abilityModifier: -2, proficiencyBonus: 3 } }), 'dnd2024.cleave');
    expect(result.settlements[0]).toMatchObject({
      type: 'child-attack', childAttackId: 'attack-1:cleave:target', parentAttackId: 'attack-1',
      weaponDamageType: 'slashing', abilityModifier: -2, abilityModifierPolicy: 'negative-only',
      allowMasteryChildRecursion: false, maxUsesPerTurn: 1,
    });
  });

  test('Cleave omits a positive ability modifier from the child damage roll', () => {
    const result = settleWeaponRule(context('cleave', { attacker: { abilityModifier: 4, proficiencyBonus: 3 } }), 'dnd2024.cleave');
    expect(result.settlements[0]).toMatchObject({
      type: 'child-attack', abilityModifier: 0, abilityModifierPolicy: 'negative-only', minimumDamage: 0,
    });
  });

  test('Graze never turns a negative modifier into damage or healing', () => {
    const negative = settleWeaponRule(context('graze', { attacker: { abilityModifier: -3, proficiencyBonus: 3 }, attack: { attackId: 'miss', outcome: 'miss' } }), 'dnd2024.graze');
    expect(negative.settlements).toEqual([]);
    const positive = settleWeaponRule(context('graze', { attacker: { abilityModifier: 2, proficiencyBonus: 3 }, attack: { attackId: 'miss', outcome: 'miss' } }), 'dnd2024.graze');
    expect(positive.settlements[0]).toMatchObject({ type: 'damage', amount: 2, minimumAmount: 0, damageType: 'slashing' });
  });

  test('Nick, Push, Topple preserve exact action, distance, size and DC rules', () => {
    const nick = settleWeaponRule(context('nick', { weapon: { isMelee: true, isLight: true, reachFeet: 5, damageType: 'piercing' }, attack: { attackId: 'nick', outcome: 'hit', action: 'attack', lightExtraAttack: true } }), 'dnd2024.nick');
    expect(nick.settlements[0]).toMatchObject({ type: 'extra-attack', action: 'attack', consumesBonusAction: false, maxUsesPerTurn: 1 });
    const push = settleWeaponRule(context('push'), 'dnd2024.push');
    expect(push.settlements[0]).toMatchObject({ type: 'movement', direction: 'away-from-attacker', distanceFeet: 10, maxDistanceFeet: 10, requiresDestinationSelection: true });
    const topple = settleWeaponRule(context('topple', { attacker: { abilityModifier: -2, proficiencyBonus: 3 } }), 'dnd2024.topple');
    expect(topple.settlements[0]).toMatchObject({ type: 'saving-throw', ability: 'constitution', dc: 9, onFailure: 'prone' });
  });

  test('Sap, Slow, and Vex keep different duration and stacking semantics', () => {
    const sap = settleWeaponRule(context('sap'), 'dnd2024.sap').settlements[0];
    expect(sap).toMatchObject({ type: 'condition', conditionId: 'dnd2024.sap', effectKind: 'attack-disadvantage', merge: 'refresh', duration: { kind: 'until-attacker-next-turn-start', consumesOn: 'target-next-attack', triggerTurnKey: 'combat:1:0' } });
    const slow = settleWeaponRule(context('slow'), 'dnd2024.slow').settlements[0];
    expect(slow).toMatchObject({ type: 'condition', conditionId: 'dnd2024.slow', effectKind: 'speed-reduction', merge: 'max', speedReductionFeet: 10, duration: { kind: 'until-attacker-next-turn-start' } });
    const vex = settleWeaponRule(context('vex'), 'dnd2024.vex').settlements[0];
    expect(vex).toMatchObject({ type: 'condition', conditionId: 'dnd2024.vex', effectKind: 'attack-advantage', merge: 'refresh', duration: { kind: 'until-attacker-next-turn-end', consumesOn: 'attacker-next-attack-against-target' } });
  });

  test('Deadly, Fatal and critical bleeding remain distinct rule identities', () => {
    const deadlyContext = context('vex', { configuration: { ...configuration('vex'), rules: [deadly] }, attack: { attackId: 'crit', outcome: 'hit', critical: true } });
    expect(settleWeaponRule(deadlyContext, 'house.deadly').settlements[0]).toMatchObject({ type: 'critical-damage', criticalRule: 'deadly', die: 8, dice: 1, source: { ruleId: 'house.deadly', attackId: 'crit' } });
    const fatalContext = context('vex', { configuration: { ...configuration('vex'), rules: [fatal] }, attack: { attackId: 'crit', outcome: 'hit', critical: true } });
    expect(settleWeaponRule(fatalContext, 'house.fatal').settlements[0]).toMatchObject({ type: 'critical-damage', criticalRule: 'fatal', die: 10, dice: 1 });
    const bleedingContext = context('vex', { configuration: { ...configuration('vex'), rules: [bleeding] }, attack: { attackId: 'crit', outcome: 'hit', critical: true } });
    expect(settleWeaponRule(bleedingContext, 'house.critBleeding').settlements[0]).toMatchObject({ type: 'condition', conditionId: 'house.critBleeding', effectKind: 'persistent-damage', formula: '1d6', damageType: 'slashing', damageMode: 'damage', duration: { kind: 'condition-managed', endOnHealing: true } });
  });

  test('Copied official conditions preserve their custom rule ID while keeping their effect kind', () => {
    const copiedSlow: WeaponRuleDefinition = {
      ruleId: 'homebrew.slow.brisk', kind: 'slow', label: 'Brisk Slow',
      params: { speedReduction: 5 }, stackingGroup: 'homebrew.slow.brisk',
    };
    const value = context('vex', {
      configuration: { ...configuration('vex'), mastery: copiedSlow.ruleId, rules: [copiedSlow] },
      target: { id: 'target', size: 'medium', distanceFromAttackerFeet: 5, distanceFromPrimaryFeet: 5, damageDealt: 8 },
    });
    const report = settleWeaponRule(value, copiedSlow.ruleId);
    expect(report.eligibility).toMatchObject({ eligible: true, kind: 'slow', ruleId: copiedSlow.ruleId });
    expect(report.settlements[0]).toMatchObject({
      type: 'condition', conditionId: copiedSlow.ruleId, effectKind: 'speed-reduction', speedReductionFeet: 5,
    });
  });

  test('configured settlement includes selected official mastery and one configured house property', () => {
    const value = context('vex', { configuration: { ...configuration('vex'), rules: [deadly] }, attack: { attackId: 'crit', outcome: 'hit', critical: true } });
    const reports = settleConfiguredWeaponRules(value);
    expect(reports.map((report) => report.eligibility.ruleId)).toEqual(['dnd2024.vex', 'house.deadly']);
    expect(reports.every((report) => report.eligibility.eligible)).toBeTrue();
  });
});

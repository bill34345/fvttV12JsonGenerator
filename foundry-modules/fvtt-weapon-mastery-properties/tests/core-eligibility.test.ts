import { describe, expect, test } from 'bun:test';
import { officialMasteryRule, type WeaponConfiguration, type WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';
import { evaluateMasteryEligibility, configuredRuleIds } from '../src/core/eligibility.ts';
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

describe('weapon mastery eligibility', () => {
  test('requires the explicit mastery selection and native unlock', () => {
    const notSelected = evaluateMasteryEligibility({ ...context('slow'), configuration: { ...configuration('slow'), mastery: 'native' } }, 'dnd2024.slow');
    expect(notSelected.reason).toBe('mastery-not-selected');
    const notUnlocked = evaluateMasteryEligibility({ ...context('slow'), nativeMasteryUnlocked: false }, 'dnd2024.slow');
    expect(notUnlocked.reason).toBe('mastery-not-unlocked');
    const granted = evaluateMasteryEligibility({ ...context('slow'), nativeMasteryUnlocked: false, configuration: { ...configuration('slow'), grantMastery: true } }, 'dnd2024.slow');
    expect(granted.eligible).toBeTrue();
  });

  test('Cleave validates melee, exact distances, reach, turn quota, and child recursion', () => {
    expect(evaluateMasteryEligibility(context('cleave'), 'dnd2024.cleave').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('cleave', { weapon: { isMelee: false, isLight: false, reachFeet: 5, damageType: 'slashing' } }), 'dnd2024.cleave').reason).toBe('not-melee');
    expect(evaluateMasteryEligibility(context('cleave', { target: { id: 'target', size: 'medium', distanceFromAttackerFeet: 5, distanceFromPrimaryFeet: 6, damageDealt: 8 } }), 'dnd2024.cleave').reason).toBe('target-too-far');
    expect(evaluateMasteryEligibility(context('cleave', { target: { id: 'target', size: 'medium', distanceFromAttackerFeet: 10, distanceFromPrimaryFeet: 5, damageDealt: 8 } }), 'dnd2024.cleave').reason).toBe('target-out-of-reach');
    expect(evaluateMasteryEligibility(context('cleave', { attack: { attackId: 'child', parentAttackId: 'attack-1', childDepth: 1, outcome: 'hit', action: 'attack', primaryTargetId: 'primary' } }), 'dnd2024.cleave').reason).toBe('child-attack');
    expect(evaluateMasteryEligibility(context('cleave', { usage: { usedCount: 1 } }), 'dnd2024.cleave').reason).toBe('already-used-this-turn');
  });

  test('Graze uses only a positive ability modifier on a miss', () => {
    expect(evaluateMasteryEligibility(context('graze', { attack: { attackId: 'miss', outcome: 'miss' }, attacker: { abilityModifier: 2, proficiencyBonus: 3 } }), 'dnd2024.graze').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('graze', { attacker: { abilityModifier: -1, proficiencyBonus: 3 }, attack: { attackId: 'miss', outcome: 'miss' } }), 'dnd2024.graze').reason).toBe('non-positive-ability-modifier');
    expect(evaluateMasteryEligibility(context('graze', { attacker: { abilityModifier: 0, proficiencyBonus: 3 }, attack: { attackId: 'miss', outcome: 'miss' } }), 'dnd2024.graze').reason).toBe('non-positive-ability-modifier');
    expect(evaluateMasteryEligibility(context('graze'), 'dnd2024.graze').reason).toBe('not-a-miss');
  });

  test('Nick only grants the Light extra attack in the Attack action', () => {
    const eligible = context('nick', { weapon: { isMelee: true, isLight: true, reachFeet: 5, damageType: 'piercing' }, attack: { attackId: 'nick', outcome: 'hit', action: 'attack', lightExtraAttack: true } });
    expect(evaluateMasteryEligibility(eligible, 'dnd2024.nick').eligible).toBeTrue();
    expect(evaluateMasteryEligibility({ ...eligible, attack: { ...eligible.attack, action: 'bonus' } }, 'dnd2024.nick').reason).toBe('not-light-extra-attack');
    expect(evaluateMasteryEligibility({ ...eligible, usage: { usedCount: 1 } }, 'dnd2024.nick').reason).toBe('already-used-this-turn');
  });

  test('copied official masteries keep their effect kind and share the once-per-turn budget', () => {
    const copiedNick: WeaponRuleDefinition = {
      ruleId: 'homebrew.nick.quick', kind: 'nick', label: 'Quick Nick',
      params: { maxUses: 1 }, stackingGroup: 'homebrew.nick.quick',
    };
    const copied = context('vex', {
      configuration: { ...configuration('vex'), mastery: copiedNick.ruleId, rules: [copiedNick] },
      weapon: { isMelee: true, isLight: true, reachFeet: 5, damageType: 'piercing' },
      attack: { attackId: 'copied-nick', outcome: 'hit', action: 'attack', lightExtraAttack: true },
    });
    expect(evaluateMasteryEligibility(copied, copiedNick.ruleId)).toMatchObject({
      eligible: true, ruleId: copiedNick.ruleId, kind: 'nick',
    });
    expect(evaluateMasteryEligibility({ ...copied, usage: { usedRuleIds: ['dnd2024.nick'] } }, copiedNick.ruleId).reason)
      .toBe('already-used-this-turn');
  });

  test('custom mastery IDs do not share a quota with an unrelated effect kind', () => {
    const copiedNick: WeaponRuleDefinition = {
      ruleId: 'homebrew.nick.quick', kind: 'nick', label: 'Quick Nick',
      params: { maxUses: 1 }, stackingGroup: 'homebrew.nick.quick',
    };
    const copied = context('vex', {
      configuration: { ...configuration('vex'), mastery: copiedNick.ruleId, rules: [copiedNick] },
      weapon: { isMelee: true, isLight: true, reachFeet: 5, damageType: 'piercing' },
      attack: { attackId: 'copied-nick', outcome: 'hit', action: 'attack', lightExtraAttack: true },
      usage: { usedRuleIds: ['dnd2024.vex'] },
    });
    expect(evaluateMasteryEligibility(copied, copiedNick.ruleId).eligible).toBeTrue();
  });

  test('Push allows Large and rejects Huge using canonical IDs and aliases', () => {
    expect(evaluateMasteryEligibility(context('push', { target: { id: 'large', size: 'large', distanceFromAttackerFeet: 5 } }), 'dnd2024.push').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('push', { target: { id: 'large', size: 'lg', distanceFromAttackerFeet: 5 } }), 'dnd2024.push').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('push', { target: { id: 'huge', size: 'huge', distanceFromAttackerFeet: 5 } }), 'dnd2024.push').reason).toBe('target-too-large');
  });

  test('Slow and Vex require damage actually dealt, while Sap only requires a hit', () => {
    expect(evaluateMasteryEligibility(context('sap', { target: { id: 'target', size: 'medium', damageDealt: 0 } }), 'dnd2024.sap').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('slow', { target: { id: 'target', size: 'medium', damageDealt: 0 } }), 'dnd2024.slow').reason).toBe('no-damage-dealt');
    expect(evaluateMasteryEligibility(context('vex', { target: { id: 'target', size: 'medium', damageDealt: -1 } }), 'dnd2024.vex').reason).toBe('no-damage-dealt');
    expect(evaluateMasteryEligibility(context('slow', { target: { id: 'target', size: 'medium', damageDealt: 1 } }), 'dnd2024.slow').eligible).toBeTrue();
  });

  test('Topple eligibility is a hit and its DC inputs may be negative', () => {
    expect(evaluateMasteryEligibility(context('topple', { attacker: { abilityModifier: -2, proficiencyBonus: 2 } }), 'dnd2024.topple').eligible).toBeTrue();
    expect(evaluateMasteryEligibility(context('topple', { attack: { attackId: 'miss', outcome: 'miss' } }), 'dnd2024.topple').reason).toBe('not-a-hit');
  });

  test('configuredRuleIds keeps the selected official rule and separate house identity', () => {
    const deadly: WeaponRuleDefinition = { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' };
    const value = context('vex', { configuration: { ...configuration('vex'), rules: [deadly] } });
    expect(configuredRuleIds(value)).toEqual(['dnd2024.vex', 'house.deadly']);
    expect(officialMasteryRule('push').params).toEqual({ distance: 10, maxSize: 3 });
  });
});

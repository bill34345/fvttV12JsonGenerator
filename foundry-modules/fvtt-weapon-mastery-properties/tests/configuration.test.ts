import { describe, expect, test } from 'bun:test';
import {
  defaultWeaponConfiguration,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';
import { planWeaponConfigurationUpdate } from '../src/adapters/configuration';

function configuration(
  enabled: boolean,
  dice = 1,
  die = 8,
): WeaponConfiguration {
  return {
    ...defaultWeaponConfiguration(),
    enabled,
    rules: enabled ? [{
      ruleId: 'house.deadly',
      kind: 'deadly',
      label: 'Deadly',
      params: { dice, die },
      stackingGroup: 'house.deadly',
    }] : [],
  };
}

function item(bonus = '1d6 + 1d8'): any {
  return {
    type: 'weapon',
    system: {
      activities: {
        attack: {
          _id: 'attack',
          id: 'attack',
          type: 'attack',
          damage: { critical: { bonus } },
          flags: {
            fvttJsonGenerator: {
              weaponPropertyContributions: {
                deadly: { ruleId: 'house.deadly', bonus: '1d8' },
              },
            },
          },
        },
      },
    },
  };
}

describe('weapon configuration native Deadly update planning', () => {
  test('replaces only the marked contribution and preserves independent bonuses', () => {
    const source = item();
    const plan = planWeaponConfigurationUpdate(source, configuration(true, 2, 10));

    expect(plan.status).toBe('ready');
    expect(plan.changed).toBe(true);
    expect(plan.updates).toEqual({
      'system.activities.attack.damage.critical.bonus': '1d6 + 2d10',
      'system.activities.attack.flags.fvttJsonGenerator.weaponPropertyContributions.deadly': {
        ruleId: 'house.deadly',
        bonus: '2d10',
      },
    });
    expect(source.system.activities.attack.damage.critical.bonus).toBe('1d6 + 1d8');
  });

  test('removes only the marked contribution when the property is disabled', () => {
    const plan = planWeaponConfigurationUpdate(item(), configuration(false));

    expect(plan).toEqual({
      status: 'ready',
      changed: true,
      activityIds: ['attack'],
      updates: {
        'system.activities.attack.damage.critical.bonus': '1d6',
        'system.activities.attack.flags.fvttJsonGenerator.weaponPropertyContributions.-=deadly': null,
      },
    });
  });

  test('deletes the bonus field when the owned term was the complete formula', () => {
    const source = item('1d8');
    const plan = planWeaponConfigurationUpdate(source, configuration(false));

    expect(plan.status).toBe('ready');
    expect(plan.updates['system.activities.attack.damage.critical.-=bonus']).toBeNull();
    expect(plan.updates['system.activities.attack.flags.fvttJsonGenerator.weaponPropertyContributions.-=deadly']).toBeNull();
  });

  test('fails closed when a new native contribution has no provenance marker', () => {
    const source = item();
    delete source.system.activities.attack.flags;
    const plan = planWeaponConfigurationUpdate(source, configuration(true, 2, 10));

    expect(plan.status).toBe('ready');
    expect(plan.changed).toBe(false);
    expect(plan.updates).toEqual({});
  });

  test('fails closed when the marked contribution is missing or duplicated', () => {
    const missing = item('1d6 + 2d10');
    expect(planWeaponConfigurationUpdate(missing, configuration(false))).toMatchObject({
      status: 'blocked', reason: 'missing-owned-bonus',
    });

    const duplicate = item('1d8 + 1d6 + 1d8');
    expect(planWeaponConfigurationUpdate(duplicate, configuration(false))).toMatchObject({
      status: 'blocked', reason: 'ambiguous-owned-bonus',
    });
  });

  test('accepts Foundry-like activity collections', () => {
    const source = item();
    source.system.activities = new Map(Object.entries(source.system.activities));
    const plan = planWeaponConfigurationUpdate(source, configuration(true, 1, 10));
    expect(plan.status).toBe('ready');
    expect(plan.updates['system.activities.attack.damage.critical.bonus']).toBe('1d6 + 1d10');
  });

  test('accepts a Foundry Item-like class instance at the document boundary', () => {
    class ItemLike {
      type = 'weapon';
      system: any;
      constructor(data: any) { this.system = data.system; }
    }
    const source = new ItemLike(item());
    const plan = planWeaponConfigurationUpdate(source, configuration(false));
    expect(plan.status).toBe('ready');
    expect(plan.updates['system.activities.attack.damage.critical.bonus']).toBe('1d6');
  });

  test('rejects malformed configuration without touching the item', () => {
    const source = item();
    const plan = planWeaponConfigurationUpdate(source, { ...configuration(true), rules: [{ kind: 'deadly' }] });
    expect(plan.status).toBe('blocked');
    expect(plan.reason).toBe('invalid-configuration');
    expect(source).toEqual(item());
  });
});

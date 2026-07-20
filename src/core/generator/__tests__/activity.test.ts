import { describe, it, expect } from 'bun:test';
import { ActivityGenerator } from '../activity';
import type { ActionData } from '../../parser/action';

describe('ActivityGenerator', () => {
  const generator = new ActivityGenerator();

  it('should generate attack activity', () => {
    const action: ActionData = {
      name: 'Bite',
      type: 'attack',
      attack: {
        type: 'mwak',
        toHit: 14,
        range: '10 ft',
        damage: [{ formula: '2d10+8', type: 'piercing' }]
      }
    };
    
    const activities = generator.generate(action);
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];
    
    expect(activity.type).toBe('attack');
    expect(activity.attack.bonus).toBe('14');
    expect(activity.damage.parts[0].number).toBe(2);
    expect(activity.damage.parts[0].denomination).toBe(10);
    expect(activity.damage.parts[0].types).toContain('piercing');
  });

  it('generates a melee attack with reach and no thrown range', () => {
    const action: ActionData = {
      name: 'Mace',
      type: 'attack',
      attack: {
        type: 'mwak',
        toHit: 2,
        range: '',
        reach: '5 ft',
        damage: [{ formula: '1d6', type: 'bludgeoning' }],
      },
    };

    const activity = Object.values(generator.generate(action))[0] as any;

    expect(activity.range).toMatchObject({ reach: 5, value: null, long: null, units: 'ft' });
  });

  it('should generate save activity', () => {
    const action: ActionData = {
      name: 'Breath',
      type: 'save',
      save: {
        dc: 15,
        ability: 'dex',
        onFail: 'half'
      },
      damage: [{ formula: '4d6', type: 'fire' }]
    };

    const activities = generator.generate(action);
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    expect(activity.type).toBe('save');
    expect(activity.save.dc.value).toBe(15);
    expect(activity.save.ability).toContain('dex');
    expect(activity.damage.parts[0].number).toBe(4);
    expect(activity.damage.parts[0].types).toContain('fire');
  });

  it('generates native save DC calculation when the source ability is explicit and exact', () => {
    const action: ActionData = {
      name: 'Radiant Burst',
      type: 'save',
      save: {
        dc: 15,
        ability: 'dex',
        dcSourceAbility: 'wis',
        dcSourceKind: 'spellcasting',
      },
      damage: [{ formula: '4d6', type: 'radiant' }],
    };

    const activities = generator.generate(action, {
      abilities: { str: 10, dex: 14, con: 12, int: 12, wis: 18, cha: 10 },
      proficiencyBonus: 3,
    });
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    expect(activity.type).toBe('save');
    expect(activity.save.ability).toEqual(['dex']);
    expect(activity.save.dc).toEqual(
      expect.objectContaining({
        calculation: 'wis',
        formula: '',
      }),
    );
    expect(activity.save.dc.value).toBe(15);
  });

  it('uses the first exact ability match for save DCs without an explicit source', () => {
    const action: ActionData = {
      name: '奴役',
      englishName: 'Enslave',
      type: 'save',
      desc: '仅限被魅惑的目标。目标必须进行一次 DC 17 的感知 (Wisdom) 豁免检定。',
      save: {
        dc: 17,
        ability: 'wis',
      },
    };

    const activities = generator.generate(action, {
      abilities: { str: 21, dex: 9, con: 20, int: 18, wis: 15, cha: 18 },
      proficiencyBonus: 5,
    });
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    expect(activity.save.dc).toEqual(
      expect.objectContaining({
        calculation: 'int',
        formula: '',
        value: 17,
      }),
    );
  });

  it('should map new ActionData fields (reach, recharge, target, versatile)', () => {
    const action: ActionData = {
      name: 'Complex Attack',
      type: 'attack',
      attack: {
        type: 'mwak',
        toHit: 10,
        range: '5 ft',
        reach: '10',
        damage: [{ formula: '1d8+5', type: 'slashing' }],
        versatile: { formula: '1d10+5' }
      },
      recharge: { value: 5, charged: true },
      target: { value: 15, type: 'cone', units: 'ft' }
    };

    const activities = generator.generate(action);
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    // Check reach mapping
    expect(activity.range).toEqual(
      expect.objectContaining({
        override: false,
        reach: 10,
        value: null,
        long: null,
        units: 'ft',
        special: '',
      }),
    );

    // Check versatile mapping
    expect(activity.damage.versatile).toBeDefined();
    expect(activity.damage.versatile.number).toBe(1);
    expect(activity.damage.versatile.denomination).toBe(10);
    expect(activity.damage.versatile.types).toContain('slashing');

    // Check recharge mapping
    expect(activity.uses.recovery[0].period).toBe('recharge');
    expect(activity.uses.recovery[0].formula).toBe('5');
    expect(activity.uses.max).toBe('1');

    // Check target mapping
    expect(activity.target).toEqual(
      expect.objectContaining({
        override: false,
        prompt: true,
        template: expect.objectContaining({
          type: 'cone',
          size: '15',
          units: 'ft',
          contiguous: false,
        }),
        affects: expect.objectContaining({
          count: '',
          type: '',
          choice: false,
          special: '',
        }),
      }),
    );
  });

  it('creates default targeting scaffolding for melee attacks instead of falling back to self-only activity defaults', () => {
    const action: ActionData = {
      name: 'Tail Crash',
      type: 'attack',
      attack: {
        type: 'mwak',
        toHit: 9,
        range: '10 ft',
        reach: '10',
        damage: [{ formula: '4d6+5', type: 'bludgeoning' }]
      }
    };

    const activities = generator.generate(action);
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    expect(activity.range).toEqual(
      expect.objectContaining({
        override: false,
        reach: 10,
        value: null,
        long: null,
        units: 'ft',
      }),
    );
    expect(activity.target).toEqual(
      expect.objectContaining({
        override: false,
        prompt: true,
        template: expect.objectContaining({
          contiguous: false,
          units: 'ft',
          type: '',
        }),
        affects: expect.objectContaining({
          choice: false,
          type: '',
        }),
      }),
    );
  });

  it('should map all AOE shapes correctly', () => {
    const shapes = [
      { input: 'cone', expected: 'cone' },
      { input: 'cube', expected: 'cube' },
      { input: 'cylinder', expected: 'cylinder' },
      { input: 'line', expected: 'line' },
      { input: 'sphere', expected: 'sphere' },
      { input: 'rect', expected: 'rect' }
    ];

    for (const { input, expected } of shapes) {
      const action: ActionData = {
        name: `Test ${input}`,
        type: 'utility',
        target: { value: 20, type: input, units: 'ft' }
      };
      const activities = generator.generate(action);
      const id = Object.keys(activities)[0]!;
      expect(activities[id].target.template.type).toBe(expected);
    }
  });

  it('consumes one activity use when a utility activity has its own limited uses', () => {
    const action: ActionData = {
      name: 'Protective Ward',
      type: 'use',
      useAction: {
        activation: 'reaction',
        consumption: 0,
        limitedUses: {
          spent: 0,
          max: '1',
          recovery: [{ period: 'dawn', type: 'recoverAll' }],
        },
      },
    };

    const activities = generator.generate(action);
    const activity = activities[Object.keys(activities)[0]!];

    expect(activity.consumption.targets).toEqual([{
      type: 'activityUses',
      target: '',
      value: '1',
      scaling: { mode: '', formula: '' },
    }]);
    expect(activity.uses).toEqual(action.useAction?.limitedUses);
  });

  it('does not invent a consumption target for an unlimited utility activity', () => {
    const action: ActionData = {
      name: 'Open the Gate',
      type: 'use',
      useAction: {
        activation: 'action',
        consumption: 0,
      },
    };

    const activities = generator.generate(action);
    const activity = activities[Object.keys(activities)[0]!];

    expect(activity.consumption.targets).toEqual([]);
    expect(activity.uses).toEqual({ spent: 0, recovery: [], max: '' });
  });

  it('should generate cast activity with correct structure', () => {
    const spellUuid = 'Compendium.dnd5e.spells.Item.59v9K9K9K9K9K9K9';
    const activities = generator.generateCast(spellUuid);
    const id = Object.keys(activities)[0]!;
    const activity = activities[id];

    expect(activity.type).toBe('cast');
    // Old structure: cast: { spell: uuid }
    // New structure: spell: { uuid: uuid }
    expect(activity.spell).toBeDefined();
    expect(activity.spell.uuid).toBe(spellUuid);
    expect(activity.cast).toBeUndefined();
  });
});

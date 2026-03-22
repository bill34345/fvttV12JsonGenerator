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

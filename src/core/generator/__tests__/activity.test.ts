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
    expect(activity.range.value).toBe('10');
    expect(activity.range.units).toBe('ft');

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
    expect(activity.target.template.type).toBe('cone');
    expect(activity.target.template.size).toBe('15');
    expect(activity.target.template.units).toBe('ft');
  });
});

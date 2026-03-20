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
});

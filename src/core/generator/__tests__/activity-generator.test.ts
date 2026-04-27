import { describe, it, expect } from 'bun:test';
import { ActivityGenerator } from '../activity';
import type { ActionData } from '../../parser/action';

describe('ActivityGenerator - generatePassiveEffect', () => {
  const generator = new ActivityGenerator();

  it('should generate Active Effect for acBonus', () => {
    const action: ActionData = {
      name: '自然护甲',
      type: 'effect',
      passiveEffect: {
        type: 'acBonus',
        value: 2,
        description: '天生护甲加厚'
      }
    };

    const effect = generator.generatePassiveEffect(action);

    expect(effect).toBeDefined();
    expect(effect!._id).toBeDefined();
    expect(effect!.name).toBe('自然护甲');
    expect(effect!.type).toBe('passive');
    expect(effect!.transfer).toBe(true);
    expect(effect!.changes).toEqual([{
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '+2',
      priority: null
    }]);
  });

  it('should return undefined for non-acBonus passive effects', () => {
    const action: ActionData = {
      name: '水下呼吸',
      type: 'effect',
      passiveEffect: {
        type: 'other',
        description: '可以在水下呼吸'
      }
    };

    const effect = generator.generatePassiveEffect(action);

    expect(effect).toBeUndefined();
  });

  it('should return undefined for non-effect actions', () => {
    const action: ActionData = {
      name: '啮咬',
      type: 'attack',
      attack: {
        type: 'mwak',
        toHit: 14,
        range: '10 ft',
        damage: [{ formula: '2d10+8', type: 'piercing' }]
      }
    };

    const effect = generator.generatePassiveEffect(action);

    expect(effect).toBeUndefined();
  });
});

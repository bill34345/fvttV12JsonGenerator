import { describe, it, expect } from 'bun:test';
import { ActionParser } from '../action';

describe('ActionParser - Chinese Robustness', () => {
  const parser = new ActionParser();

  it('should extract AOE Cone information', () => {
    const action = parser.parse('火焰吐息 [充能 5-6]: 覆盖 90 尺锥形区域，DC 21 敏捷豁免，失败 18d6 火焰伤害，成功减半');
    expect(action).not.toBeNull();
    
    // AOE specific assertions that will fail
    expect((action as any).target?.value).toBe(90);
    expect((action as any).target?.type).toBe('cone');
    expect((action as any).target?.units).toBe('ft');
  });

  it('should extract Versatile damage', () => {
    const action = parser.parse('长剑 [近战武器攻击]: +5 命中, 触及 5 尺, 14 (2d10+6) 挥砍伤害，双手使用时为 16 (2d12+6)');
    expect(action).not.toBeNull();
    
    // Versatile specific assertions that will fail
    expect((action as any).attack?.versatile?.formula).toBe('2d12+6');
  });

  it('should extract Recharge information', () => {
    const action = parser.parse('火焰吐息 [充能 5-6]: 覆盖 90 尺锥形区域');
    expect(action).not.toBeNull();
    
    // Recharge specific assertions that will fail
    expect(action?.recharge?.value).toBe(5);
    expect(action?.recharge?.charged).toBe(true);
  });
});

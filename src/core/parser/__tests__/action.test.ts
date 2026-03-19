import { describe, it, expect } from 'bun:test';
import { ActionParser } from '../action';

describe('ActionParser', () => {
  const parser = new ActionParser();

  it('should parse melee attack', () => {
    const input = '啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺';
    const result = parser.parse(input);
    expect(result).not.toBeNull();
    if (result && result.attack) {
      expect(result.name).toBe('啮咬');
      expect(result.type).toBe('attack');
      expect(result.attack.type).toBe('mwak');
      expect(result.attack.toHit).toBe(14);
      expect(result.attack.range).toBe('触及10尺');
      expect(result.attack.damage[0].formula).toBe('2d10+8');
      expect(result.attack.damage[0].type).toBe('piercing'); // "穿刺" -> "piercing"
    }
  });

  it('should parse recharge save', () => {
    const input = '火焰吐息 [充能5-6]: { 豁免: DC21敏捷, 失败: 18d6火焰, 成功: 减半 }';
    const result = parser.parse(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.name).toBe('火焰吐息');
      expect(result.recharge?.value).toBe(5);
      expect(result.recharge?.charged).toBe(true);
      expect(result.save?.dc).toBe(21);
      expect(result.save?.ability).toBe('dex'); // "敏捷" -> "dex"
      // Damage check (generic)
      const dmg = (result as any).damage;
      expect(dmg).toBeDefined();
      expect(dmg[0].formula).toBe('18d6');
      expect(dmg[0].type).toBe('fire'); // "火焰" -> "fire"
    }
  });
});

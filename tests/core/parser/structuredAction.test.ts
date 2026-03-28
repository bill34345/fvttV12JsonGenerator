import { describe, it, expect } from 'bun:test';
import { StructuredActionParser } from '../../../src/core/parser/structuredAction';

describe('StructuredActionParser', () => {
  const parser = new StructuredActionParser();

  describe('parseStructuredSection', () => {
    it('should return empty array for non-array input', () => {
      const result = parser.parseStructuredSection(null, '动作');
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = parser.parseStructuredSection(undefined, '动作');
      expect(result).toEqual([]);
    });
  });

  describe('attack with sub-action (触手 case)', () => {
    it('should parse attack with sub-action correctly', () => {
      const input = [
        {
          '名称': '啮咬 (Bite)',
          '类型': 'attack',
          '攻击类型': '近战武器攻击',
          '命中': 14,
          '范围': '触及10尺',
          '伤害': ['2d10+8穿刺', '2d6火焰'],
          '目标': { '类型': 'creature', '数量': 1 },
          '子活动': [
            {
              '名称': '触手-疾病',
              '触发': '命中后',
              'DC': 16,
              '属性': '体质',
              '失败效果': [{ '类型': '疾病', '描述': '感染疾病' }],
              '低值效果': [{ '类型': '伤害', '公式': '2d6', '描述': '低值效果' }],
            },
          ],
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('啮咬');
      expect(result[0]!.englishName).toBe('Bite');
      expect(result[0]!.type).toBe('attack');
      expect(result[0]!.attackType).toBe('mwak');
      expect(result[0]!.toHit).toBe(14);
      expect(result[0]!.range).toBe('触及10尺');
      expect(result[0]!.damage).toEqual([
        { formula: '2d10+8穿刺', type: '' },
        { formula: '2d6火焰', type: '' },
      ]);
      expect(result[0]!.subActions).toHaveLength(1);
      const subAction = result[0]!.subActions![0]!;
      expect(subAction.name).toBe('触手-疾病');
      expect(subAction.trigger).toBe('命中后');
      expect(subAction.DC).toBe(16);
      expect(subAction.ability).toBe('con');
    });
  });

  describe('save with concentration (支配 case)', () => {
    it('should parse save with concentration correctly', () => {
      const input = [
        {
          '名称': '支配怪物',
          '类型': 'save',
          'DC': 18,
          '属性': '感知',
          '需专注': true,
          '失败效果': [{ '类型': '魅惑', '描述': '被支配' }],
          '低值阈值': 13,
          '低值效果': [{ '类型': '魅惑', '描述': '心灵控制减弱' }],
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('支配怪物');
      expect(result[0]!.type).toBe('save');
      expect(result[0]!.DC).toBe(18);
      expect(result[0]!.ability).toBe('wis');
      expect(result[0]!.concentration).toBe(true);
      expect(result[0]!.failEffects).toEqual([
        { type: '魅惑', describe: '被支配' },
      ]);
      expect(result[0]!.lowValueThreshold).toBe(13);
      expect(result[0]!.lowValueEffects).toEqual([
        { type: '魅惑', describe: '心灵控制减弱' },
      ]);
    });
  });

  describe('legendary action with condition (精神迷雾 case)', () => {
    it('should parse legendary action with formula in failEffects', () => {
      const input = [
        {
          '名称': '精神迷雾',
          '类型': 'save',
          'DC': 17,
          '属性': '智力',
          '失败效果': [{ '公式': '4d6', '类型': '心灵', '描述': '心灵伤害' }],
        },
      ];

      const result = parser.parseStructuredSection(input, '传奇动作');

      expect(result).toHaveLength(1);
      expect(result[0]!.activation?.type).toBe('legendary');
      expect(result[0]!.type).toBe('save');
      expect(result[0]!.DC).toBe(17);
      expect(result[0]!.ability).toBe('int');
      expect(result[0]!.failEffects).toEqual([
        { formula: '4d6', type: '心灵', describe: '心灵伤害' },
      ]);
    });
  });

  describe('english name extraction', () => {
    it('should extract english name from parentheses', () => {
      const input = [
        {
          '名称': '探测心灵感应 (Probing Telepathy)',
          '类型': 'utility',
        },
      ];

      const result = parser.parseStructuredSection(input, '特性');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('探测心灵感应');
      expect(result[0]!.englishName).toBe('Probing Telepathy');
      expect(result[0]!.type).toBe('utility');
    });
  });

  describe('utility action parsing', () => {
    it('should parse utility action correctly', () => {
      const input = [
        {
          '名称': '多重攻击',
          '类型': 'utility',
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('多重攻击');
      expect(result[0]!.type).toBe('utility');
      expect(result[0]!.activation?.type).toBe('action');
    });
  });

  describe('recharge parsing (奴役 case)', () => {
    it('should parse recharge array correctly', () => {
      const input = [
        {
          '名称': '奴役',
          '类型': 'save',
          'DC': 17,
          '充能': [5, 6],
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result).toHaveLength(1);
      expect(result[0]!.recharge).toEqual([5, 6]);
      expect(result[0]!.type).toBe('save');
      expect(result[0]!.DC).toBe(17);
    });
  });

  describe('activation type inference', () => {
    it('should infer activation type based on section name', () => {
      const sections: Array<{ section: string; expected: 'special' | 'action' | 'bonus' | 'reaction' | 'legendary' }> = [
        { section: '特性', expected: 'special' },
        { section: '动作', expected: 'action' },
        { section: '附赠动作', expected: 'bonus' },
        { section: '反应', expected: 'reaction' },
        { section: '传奇动作', expected: 'legendary' },
      ];

      for (const { section, expected } of sections) {
        const result = parser.parseStructuredSection([{ '名称': '测试', '类型': 'utility' }], section);
        expect(result[0]!.activation?.type).toBe(expected);
      }
    });
  });

  describe('damage parsing', () => {
    it('should parse damage parts with type', () => {
      const input = [
        {
          '名称': '火焰冲击',
          '类型': 'attack',
          '攻击类型': '远程法术攻击',
          '命中': 12,
          '范围': '120尺',
          '伤害': [
            { '公式': '8d6', '类型': '火焰' },
          ],
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result[0]!.damage).toEqual([
        { formula: '8d6', type: '火焰' },
      ]);
    });
  });

  describe('aoe parsing', () => {
    it('should parse aoe template correctly', () => {
      const input = [
        {
          '名称': '火球术',
          '类型': 'save',
          'DC': 15,
          '属性': '敏捷',
          'AoE': {
            '形状': '球形',
            '范围': 20,
          },
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect((result[0]!.aoe as any).shape).toBe('sphere');
      expect(result[0]!.aoe!.range).toBe(20);
    });
  });

  describe('target parsing', () => {
    it('should parse target with special type', () => {
      const input = [
        {
          '名称': '支配人类',
          '类型': 'save',
          'DC': 15,
          '属性': '感知',
          '目标': {
            '类型': 'creature',
            '数量': 1,
          },
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result[0]!.target).toEqual({
        count: 1,
        type: 'creature',
      });
    });
  });

  describe('string entry fallback', () => {
    it('should handle string entries as utility actions', () => {
      const input = ['简单攻击', '防御姿态'];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result).toHaveLength(2);
      expect(result[0]!).toEqual({ name: '简单攻击', type: 'utility', describe: '简单攻击' });
      expect(result[1]!).toEqual({ name: '防御姿态', type: 'utility', describe: '防御姿态' });
    });
  });

  describe('perLongRest parsing', () => {
    it('should parse perLongRest correctly', () => {
      const input = [
        {
          '名称': '医疗',
          '类型': 'utility',
          '每日': 3,
        },
      ];

      const result = parser.parseStructuredSection(input, '特性');

      expect(result[0]!.perLongRest).toBe(3);
    });
  });

  describe('special effects parsing', () => {
    it('should parse special effects correctly', () => {
      const input = [
        {
          '名称': '濒死触发',
          '类型': 'utility',
          '特殊效果': [
            {
              '触发': '濒血',
              '描述': '激发潜能',
            },
          ],
        },
      ];

      const result = parser.parseStructuredSection(input, '特性');

      expect(result[0]!.specialEffects).toEqual([
        {
          trigger: '濒血',
          describe: '激发潜能',
        },
      ]);
    });
  });

  describe('embedded effects parsing', () => {
    it('should parse embedded effects correctly', () => {
      const input = [
        {
          '名称': '毒素攻击',
          '类型': 'attack',
          '攻击类型': '近战武器攻击',
          '命中': 10,
          '范围': '触及5尺',
          '内嵌效果': [
            {
              '类型': '毒素',
              '描述': '中毒状态',
              '持续': '1分钟',
              '伤害类型': '毒素',
              '伤害公式': '1d6',
            },
          ],
        },
      ];

      const result = parser.parseStructuredSection(input, '动作');

      expect(result[0]!.embeddedEffects).toEqual([
        {
          type: '毒素',
          describe: '中毒状态',
          duration: '1分钟',
          damageType: '毒素',
          damageFormula: '1d6',
        },
      ]);
    });
  });
});
import { describe, it, expect } from 'bun:test';
import { YamlParser } from '../yaml';

describe('YamlParser', () => {
  const parser = new YamlParser();

  it('should parse valid NPC YAML', () => {
    const yaml = `
名称: 成年红龙
类型: npc
能力:
  力量: 27
  敏捷: 10
生命值: 256 (19d12+133)
护甲等级: 19 (天生护甲)
豁免熟练: [敏捷, 体质]
---
# Bio
This is a dragon.
`;
    const result = parser.parse(yaml);
    expect(result.name).toBe('成年红龙');
    expect(result.abilities.str).toBe(27);
    expect(result.abilities.dex).toBe(10);
    expect(result.attributes.hp?.value).toBe(256);
    expect(result.attributes.hp?.formula).toBe('19d12+133');
    expect(result.attributes.ac?.value).toBe(19);
    expect(result.attributes.ac?.calc).toBe('natural');
    expect(result.saves).toContain('dex');
    expect(result.saves).toContain('con');
    expect(result.details.biography).toContain('This is a dragon');
  });

  it('should extract lair initiative from lair actions', () => {
    const yaml = `
名称: 成年红龙
类型: npc
巢穴动作:
  - "在先攻顺位20（initiative count 20）时，该龙可以采取一个巢穴动作..."
  - "动作1: ..."
---
`;
    const result = parser.parse(yaml);
    expect(result.lairInitiative).toBe(20);
  });

  it('should throw on unknown field', () => {
    const yaml = `
名称: Test
UnknownField: 123
`;
    expect(() => parser.parse(yaml)).toThrow('InvalidField');
  });
});

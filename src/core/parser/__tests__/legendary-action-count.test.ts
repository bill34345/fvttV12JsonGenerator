import { describe, it, expect } from 'bun:test';
import { YamlParser } from '../yaml';
import { EnglishBestiaryParser } from '../english';
import { ActorGenerator } from '../../generator/actor';

describe('Legendary Action Count Extraction', () => {
  describe('YamlParser (Chinese)', () => {
    const parser = new YamlParser();

    it('should extract legendary action count from Chinese description', () => {
      const input = `
---
名称: 成年红龙
传奇动作:
  - 该龙可以采取3次传奇动作，选择下述选项之一。
  - 侦测: 龙进行一次感知（察觉）检定。
---
`;
      const result = parser.parse(input);
      expect(result.attributes.legact).toBeDefined();
      expect(result.attributes.legact?.value).toBe(3);
      expect(result.attributes.legact?.max).toBe(3);
    });

    it('should extract legendary action count from English description in Chinese YAML', () => {
      const input = `
---
名称: 成年红龙
传奇动作:
  - The dragon can take 3 legendary actions, choosing from the options below.
  - 侦测: 龙进行一次感知（察觉）检定。
---
`;
      const result = parser.parse(input);
      expect(result.attributes.legact).toBeDefined();
      expect(result.attributes.legact?.value).toBe(3);
      expect(result.attributes.legact?.max).toBe(3);
    });
  });

  describe('EnglishBestiaryParser', () => {
    const parser = new EnglishBestiaryParser();

    it('should extract legendary action count from English description', () => {
      const input = `
---
layout: creature
name: Adult Red Dragon
---
## Legendary Actions

The dragon can take 3 legendary actions, choosing from the options below.
- Detect. The dragon makes a Wisdom (Perception) check.
`;
      const result = parser.parse(input);
      expect(result.attributes.legact).toBeDefined();
      expect(result.attributes.legact?.value).toBe(3);
      expect(result.attributes.legact?.max).toBe(3);
    });
  });

  describe('ActorGenerator Integration', () => {
    const generator = new ActorGenerator();

    it('should set legact in actor JSON', () => {
      const parsed: any = {
        name: 'Test NPC',
        type: 'npc' as const,
        abilities: {},
        attributes: {
          legact: { value: 3, max: 3 }
        },
        details: {},
        traits: {},
        items: []
      };
      const actor = generator.generate(parsed);
      expect(actor.system.resources.legact.value).toBe(3);
      expect(actor.system.resources.legact.max).toBe(3);
    });
  });
});

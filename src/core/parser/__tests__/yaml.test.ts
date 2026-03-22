import { describe, expect, it } from 'bun:test';
import { FIELD_MAPPING } from '../../../config/mapping';
import { YamlParser } from '../yaml';

function keyFor(internalKey: string): string {
  const key = Object.keys(FIELD_MAPPING).find((field) => FIELD_MAPPING[field]?.key === internalKey);
  if (!key) {
    throw new Error(`Missing field mapping for ${internalKey}`);
  }
  return key;
}

describe('YamlParser', () => {
  const parser = new YamlParser();

  it('should parse valid NPC YAML', () => {
    const yaml = `
${keyFor('name')}: Adult Red Dragon
${keyFor('type')}: npc
${keyFor('str')}: 27
${keyFor('dex')}: 10
${keyFor('hp')}: 256 (19d12+133)
${keyFor('ac')}: 19 (natural armor)
${keyFor('saves')}: [${keyFor('dex')}, ${keyFor('con')}]
---
# Bio
This is a dragon.
`;
    const result = parser.parse(yaml);
    expect(result.name).toBe('Adult Red Dragon');
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
${keyFor('name')}: Adult Red Dragon
${keyFor('type')}: npc
${keyFor('lair_actions')}:
  - "On initiative count 20, the dragon can take a lair action."
  - "Action 1: ..."
---
`;
    const result = parser.parse(yaml);
    expect(result.lairInitiative).toBe(20);
  });

  it('should bridge markdown body sections into parsed actions while keeping traits in biography', () => {
    const yaml = `
${keyFor('name')}: Slithering Bloodfin
${keyFor('type')}: npc
${keyFor('size')}: Large
---

### Traits
- Blood Frenzy. Slithering Bloodfin has advantage on melee attack rolls against wounded creatures.
### Actions

- Bite. Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 14 (2d8+5) piercing damage.
### Bonus Actions

- Swallow. Melee Weapon Attack: +9 to hit, reach 5 ft., one grappled target.
### Reactions

- Slippery. When a melee attack misses the bloodfin, it moves up to 10 feet.
### Legendary Actions

Slithering Bloodfin can take 3 legendary actions.
- Mental Fog (Costs 2 Actions). One target must succeed on a saving throw.`;
    const result = parser.parse(yaml);

    expect(result.details.biography).toContain('Blood Frenzy');
    expect(result.actions).toHaveLength(1);
    expect(result.actions?.[0]).toContain('Bite');
    expect(result.actions?.[0]).toContain('Hit');
    expect(result.bonus_actions).toHaveLength(1);
    expect(result.bonus_actions?.[0]).toContain('Swallow');
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions?.[0]).toContain('Slippery');
    expect(result.legendary_actions).toHaveLength(2);
    expect(result.legendary_actions?.[0]).toContain('3 legendary actions');
    expect(result.attributes.legact).toEqual({ value: 3, max: 3 });
  });

  it('should throw on unknown field', () => {
    const yaml = `
${keyFor('name')}: Test
UnknownField: 123
`;
    expect(() => parser.parse(yaml)).toThrow('InvalidField');
  });

  it('should preserve exact hit point values for plain numeric strings', () => {
    const yaml = `
${keyFor('name')}: Hit Point Test
${keyFor('type')}: npc
${keyFor('hp')}: '75'
---`;

    const result = parser.parse(yaml);
    expect(result.attributes.hp).toEqual({ value: 75, max: 75 });
  });

  it('should preserve hit point formulas without truncating the leading value', () => {
    const yaml = `
${keyFor('name')}: Hit Point Test
${keyFor('type')}: npc
${keyFor('hp')}: 255 (30d10 + 90)
---`;

    const result = parser.parse(yaml);
    expect(result.attributes.hp).toEqual({ value: 255, max: 255, formula: '30d10 + 90' });
  });
});

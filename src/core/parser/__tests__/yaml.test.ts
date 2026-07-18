import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FIELD_MAPPING } from '../../../config/mapping';
import { validatePortableSpellManifest, validatePortableSpellManifestStructure } from '../../spell-resolution';
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

  it('preserves fractional challenge ratings as their numeric value', () => {
    const yaml = `
${keyFor('name')}: Fractional CR Test
${keyFor('type')}: npc
${keyFor('cr')}: 1/2
---`;

    expect(parser.parse(yaml).details.cr).toBe(0.5);
  });

  it('keeps legacy object-style actions on the legacy action path instead of creating blank structured actions', () => {
    const yaml = readFileSync('src/core/parser/__tests__/fixtures/yaml-legacy-actions.md', 'utf-8');

    const result = parser.parse(yaml);

    expect(result.actions).toEqual([
      {
        'Bite [Melee Weapon Attack]':
          '+5 to hit, reach 5 ft., one target. Hit: 1d8+3 piercing damage.',
      },
    ]);
    expect(result.structuredActions).toBeUndefined();
  });

  it('preserves an explicit activation type on a structured trait while retaining section inference elsewhere', () => {
    const yaml = readFileSync('src/core/parser/__tests__/fixtures/yaml-structured-activation.md', 'utf-8');

    const result = parser.parse(yaml);
    const traits = result.structuredActions?.['特性'];
    const actions = result.structuredActions?.['动作'];

    expect(traits?.[0]?.activation?.type).toBe('bonus');
    expect(traits?.[0]?.activation?.explicit).toBe(true);
    expect(traits?.[1]?.activation?.type).toBe('special');
    expect(traits?.[1]?.activation?.explicit).toBeUndefined();
    expect(actions?.[0]?.activation?.type).toBe('action');
    expect(actions?.[0]?.activation?.explicit).toBeUndefined();
  });

  it('maps and preserves only a strictly validated portable spell manifest', () => {
    const markdown = readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8');
    const result = parser.parse(markdown);

    expect(result.spellManifest).toEqual({
      schemaVersion: 1,
      manifestId: 'portable-caster-spells',
      sourceSha256: '0'.repeat(64),
      rulesPreference: '2024',
      spellcastingGroups: [{
        groupId: 'innate-wisdom',
        featureItemKey: 'innate-wisdom-feature',
        ability: 'wis',
        saveDc: 13,
        spellRefs: [{
          refId: 'mage-armor',
          identifier: 'mage-armor',
          originalName: 'Mage Armor',
          englishName: 'Mage Armor',
          aliases: [],
          method: 'innate',
          restrictions: [],
          evidence: [{ start: 0, end: 10, quote: 'Mage Armor' }],
        }],
      }],
    });
    expect(result.structuredActions?.['特性']?.[1]?.spellcastingFeatureKey).toBe('innate-wisdom-feature');
  });

  it('does not pretend rendered Markdown is the raw evidence source', () => {
    const markdown = readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8');
    const result = parser.parse(markdown);

    expect(validatePortableSpellManifestStructure(result.spellManifest).ok).toBe(true);
    const falselySourceBacked = validatePortableSpellManifest(result.spellManifest, markdown);
    expect(falselySourceBacked.ok).toBe(false);
    if (!falselySourceBacked.ok) {
      expect(falselySourceBacked.findings).toContainEqual(expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' }));
    }
  });

  it('fails closed when the portable manifest has structurally invalid evidence', () => {
    const markdown = readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8')
      .replace('end: 10', 'end: 11');

    expect(() => parser.parse(markdown)).toThrow('INVALID_EVIDENCE_QUOTE_LENGTH');
  });

  it.each([
    ['a zero-length evidence span', (markdown: string) => markdown
      .replace('start: 0', 'start: 10')
      .replace('quote: Mage Armor', "quote: ''")],
    ['unsafe-integer evidence offsets', (markdown: string) => markdown
      .replace('start: 0', 'start: 9007199254740992')
      .replace('end: 10', 'end: 9007199254740992')
      .replace('quote: Mage Armor', "quote: ''")],
  ])('fails closed for %s at the structure-only boundary', (_label, mutate) => {
    const markdown = mutate(readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8'));

    expect(() => parser.parse(markdown)).toThrow('INVALID_EVIDENCE');
  });

  it.each([
    ['a non-trait section', (markdown: string) => markdown.replace('特性:', '动作:'), 'InvalidSpellcastingFeatureLinkSection'],
    ['an explicitly active trait', (markdown: string) => markdown.replace(
      'spellcastingFeatureKey: innate-wisdom-feature',
      'spellcastingFeatureKey: innate-wisdom-feature\n    activationType: action',
    ), 'InvalidSpellcastingFeatureActivation'],
  ])('rejects spellcasting linkage on %s', (_label, mutate, code) => {
    const markdown = mutate(readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8'));

    expect(() => parser.parse(markdown)).toThrow(code);
  });
});

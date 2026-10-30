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

  it.each([
    ['false', false], ['null', null], ['literal-v2', 'literal-v2'], ['{}', {}], ['[]', []],
  ])('retains the Actor and reports invalid canonical biography mode %s', (yamlValue, value) => {
    const parsed = parser.parse(`名称: Literal\n传记: Original biography.\nintake-biography-mode: ${yamlValue}\n`);

    expect(parsed.name).toBe('Literal');
    expect(parsed.details.biography).toContain('Original biography.');
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({
      code: 'FIELD_PROJECTION_INCOMPLETE', path: 'intake-biography-mode',
    }));
    expect(parsed.candidateReview?.proposal).toEqual(expect.objectContaining({ field: 'intake-biography-mode', value }));
  });

  it('retains source-authored body actions alongside canonical literal biography mode', () => {
    const parsed = parser.parse('---\n名称: Literal\nintake-biography-mode: literal-v1\n---\n# Actions\nExtra rule.');

    expect(parsed.name).toBe('Literal');
    expect(parsed.biographyMode).toBe('literal');
    expect(parsed.actions).toEqual(['Extra rule.']);
  });

  it.each(['\n','\r\n'])('keeps authored biography and program notes separate with %j line endings', (eol) => {
    const sourceText = `Author note: 护甲等级：14。${eol}Keep every author line.`;
    const programNotes = ['护甲等级：14（Natural Armor）'];
    const presentation = {version:1 as const, sourceText, programNotes};
    const document = ['名称: Binder','intake-biography-mode: literal-v1',
      '传记: ' + JSON.stringify(sourceText + '\n\n' + programNotes[0]),
      'intake-biography-presentation: ' + JSON.stringify({version:1, sourceLength:sourceText.length, programNotes})].join(eol);
    const parsed = parser.parse(document);
    expect(parsed.biographyPresentation).toEqual(presentation);
    expect(parsed.details.biography).toBe(sourceText + '\n\n' + programNotes[0]);
  });

  it.each([
    {version:2,sourceLength:7,programNotes:['Program.']},
    {version:1,sourceLength:1,programNotes:['Program.']},
    {version:1,sourceLength:7,programNotes:[{text:'Program.'}]},
    {version:1,sourceLength:7,programNotes:['Program.'],unexpected:true},
  ])('retains authored biography and reports inconsistent or unsupported provenance %j', (presentation) => {
    const parsed = parser.parse(['名称: Binder','intake-biography-mode: literal-v1',
      '传记: "Author.\\n\\nProgram."',
      'intake-biography-presentation: ' + JSON.stringify(presentation)].join('\n'));

    expect(parsed.name).toBe('Binder');
    expect(parsed.details.biography).toStartWith('Author.\n\nProgram.');
    expect(parsed.biographyPresentation).toBeUndefined();
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({
      code: 'FIELD_PROJECTION_INCOMPLETE', path: 'intake-biography-presentation',
    }));
    expect(parsed.candidateReview?.proposal).toEqual(expect.objectContaining({
      field: 'intake-biography-presentation', value: presentation,
    }));
  });

  it('does not treat ordinary authored annotation-like prose as program content', () => {
    const parsed = parser.parse('名称: Binder\n传记: "Author. 护甲等级：14。"');
    expect(parsed.details.biography).toBe('Author. 护甲等级：14。');
    expect(parsed.biographyPresentation).toBeUndefined();
    const explicitPresentation = parser.parse('名称: Binder\n传记: Author.\nintake-biography-presentation: {version: 1, sourceLength: 7, programNotes: []}');
    expect(explicitPresentation.details.biography).toBe('Author.');
    expect(explicitPresentation.biographyPresentation).toEqual({ version: 1, sourceText: 'Author.', programNotes: [] });
  });

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

  it('retains unknown fields with a diagnostic and keeps the Actor', () => {
    const yaml = `
${keyFor('name')}: Test
UnknownField: 123
`;
    const parsed = parser.parse(yaml);
    expect(parsed.name).toBe('Test');
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({
      code: 'FIELD_PROJECTION_INCOMPLETE', path: 'UnknownField',
    }));
    expect(parsed.candidateReview?.proposal).toEqual(expect.objectContaining({ field: 'UnknownField', value: 123 }));
    expect(parsed.details.biography).toContain('UnknownField：123');
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

  it('preserves fractional challenge ratings when the source includes XP', () => {
    const yaml = `
${keyFor('name')}: Fractional CR With XP Test
${keyFor('type')}: npc
${keyFor('cr')}: "1/4 (50 XP)"
---`;

    expect(parser.parse(yaml).details.cr).toBe(0.25);
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
    expect(actions?.[1]).toEqual(expect.objectContaining({
      name: 'Radiant Burst',
      type: 'save',
      DC: 21,
      ability: 'dex',
      damage: [{ formula: '4d10', type: 'psychic' }],
    }));
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

  it('retains spell identity and reports structurally invalid portable manifest evidence', () => {
    const markdown = readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8')
      .replace('end: 10', 'end: 11');

    const parsed = parser.parse(markdown);
    const ref = parsed.spellManifest?.spellcastingGroups[0]?.spellRefs[0];
    expect(ref).toEqual(expect.objectContaining({ refId: 'mage-armor', englishName: 'Mage Armor', evidence: [] }));
    expect(parsed.structuredActions?.['特性']?.[1]?.spellcastingFeatureKey).toBe('innate-wisdom-feature');
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({
      code: 'FIELD_PROJECTION_INCOMPLETE', path: '/spellcastingGroups/0/spellRefs/0/evidence/0',
    }));
    expect(parsed.candidateReview?.proposal).toEqual(expect.objectContaining({
      value: { start: 0, end: 11, quote: 'Mage Armor' },
    }));
  });

  it.each([
    ['a zero-length evidence span', (markdown: string) => markdown
      .replace('start: 0', 'start: 10')
      .replace('quote: Mage Armor', "quote: ''")],
    ['unsafe-integer evidence offsets', (markdown: string) => markdown
      .replace('start: 0', 'start: 9007199254740992')
      .replace('end: 10', 'end: 9007199254740992')
      .replace('quote: Mage Armor', "quote: ''")],
  ])('retains the spell and reports %s at the structure-only boundary', (_label, mutate) => {
    const markdown = mutate(readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8'));

    const parsed = parser.parse(markdown);
    expect(parsed.name).toBe('Portable Caster');
    expect(parsed.spellManifest?.spellcastingGroups[0]?.spellRefs[0]).toEqual(expect.objectContaining({
      refId: 'mage-armor', englishName: 'Mage Armor', evidence: [],
    }));
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({
      code: 'FIELD_PROJECTION_INCOMPLETE', path: '/spellcastingGroups/0/spellRefs/0/evidence/0',
    }));
    expect(parsed.candidateReview?.proposal).toEqual(expect.objectContaining({
      field: '/spellcastingGroups/0/spellRefs/0/evidence/0',
      value: expect.objectContaining({ quote: '' }),
    }));
  });

  it.each([
    ['a mythic section', (markdown: string) => markdown.replace('特性:', '神话动作:'), '神话动作', 'legendary'],
    ['an explicit special activation', (markdown: string) => markdown.replace(
      'spellcastingFeatureKey: innate-wisdom-feature',
      'spellcastingFeatureKey: innate-wisdom-feature\n    activationType: special',
    ), '特性', 'special'],
  ] as const)('retains source spellcasting linkage on %s', (_label, mutate, section, activation) => {
    const markdown = mutate(readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8'));

    const parsed = parser.parse(markdown);
    const linked = parsed.structuredActions?.[section]?.find((entry) => entry.spellcastingFeatureKey);
    expect(linked).toEqual(expect.objectContaining({
      name: 'Innate Magic', spellcastingFeatureKey: 'innate-wisdom-feature',
      describe: 'The caster invokes its explicitly granted magic.',
      activation: expect.objectContaining({ type: activation }),
    }));
    expect(parsed.spellManifest?.spellcastingGroups[0]?.spellRefs[0]?.englishName).toBe('Mage Armor');
  });
  it.each([['动作','action'],['附赠动作','bonus'],['反应','reaction'],['传奇动作','legendary']] as const)('retains source spellcasting linkage in %s', (section, activation) => {
    const markdown=readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md','utf-8').replace('特性:',section+':');
    const parsed=parser.parse(markdown),linked=parsed.structuredActions![section]!.filter(entry=>entry.spellcastingFeatureKey);
    expect(linked).toHaveLength(1);expect(linked[0]!.activation?.type).toBe(activation);
    expect(linked[0]!.spellcastingFeatureKey).toBe('innate-wisdom-feature');
    expect(validatePortableSpellManifestStructure(parsed.spellManifest).ok).toBe(true);
  });
});

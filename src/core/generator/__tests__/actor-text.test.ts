import { describe, expect, it } from 'bun:test';
import {
  extractInlineFeatureLinesFromBiography,
  extractPrimaryDamagePartsFromText,
} from '../actor-text';

describe('actor text damage extraction', () => {
  it('keeps alternate damage types on the same damage formula', () => {
    const parts = extractPrimaryDamagePartsFromText(
      '命中：8（`1d8 + 3`）点挥砍伤害 (Slashing Damage) 或穿刺伤害 (Piercing Damage)。',
    );

    expect(parts).toEqual([
      {
        formula: '1d8+3',
        type: 'slashing',
        types: ['slashing', 'piercing'],
      },
    ]);
  });
});

describe('english biography feature extraction', () => {
  it('recognizes emphasized feature titles wrapped across lines', () => {
    const cases = [
      {
        biography: '***Aura of\nCourage.*** Allies cannot be frightened.',
        expected: 'Aura of Courage. Allies cannot be frightened.',
      },
      {
        biography: '***Minion:\nSavage Horde.*** The next attack scores a critical hit.',
        expected: 'Minion: Savage Horde. The next attack scores a critical hit.',
      },
      {
        biography: '***Spirit-Bonded Body (Recharges after a Short\nor Long Rest).*** The orc transforms.',
        expected: 'Spirit-Bonded Body (Recharges after a Short or Long Rest). The orc transforms.',
      },
    ];

    for (const testCase of cases) {
      expect(extractInlineFeatureLinesFromBiography(testCase.biography, 'english')).toEqual({
        biography: '',
        features: [testCase.expected],
      });
    }
  });

  it('does not consume narrative after an unmatched emphasis opener', () => {
    const biography = [
      '***An unfinished emphasis marker',
      'Ordinary narrative remains ordinary narrative.',
    ].join('\n');

    expect(extractInlineFeatureLinesFromBiography(biography, 'english')).toEqual({
      biography,
      features: [],
    });
  });

  it.each([
    [
      'Chinese bloodied replacement',
      '命中：12（3d6+2）穿刺伤害——若该集群处于浴血则改为9（3d4+2）穿刺伤害——外加7（2d6）力场伤害。',
      ['3d6+2', '2d6'],
    ],
    [
      'English instead clause',
      'Hit: 12 (3d6+2) piercing damage; if bloodied, it deals 9 (3d4+2) piercing damage instead, plus 7 (2d6) force damage.',
      ['3d6+2', '2d6'],
    ],
    [
      'English conditional or clause',
      'Hit: 12 (3d6+2) piercing damage, or 9 (3d4+2) piercing damage if the swarm is bloodied, plus 7 (2d6) force damage.',
      ['3d6+2', '2d6'],
    ],
  ] as const)('does not emit replacement damage as simultaneous damage: %s', (
    _label,
    text,
    expected,
  ) => {
    expect(extractPrimaryDamagePartsFromText(text).map((part) => part.formula)).toEqual([...expected]);
  });

  it('keeps multiple unconditional additive damage parts', () => {
    const parts = extractPrimaryDamagePartsFromText(
      '命中：5（1d6+2）穿刺伤害，外加7（2d6）力场伤害与3（1d4+1）火焰伤害。',
    );

    expect(parts.map((part) => part.formula)).toEqual(['1d6+2', '2d6', '1d4+1']);
  });
});

import { describe, expect, it } from 'bun:test';
import { EnglishActionParser } from '../englishAction';

describe('EnglishActionParser spell attacks', () => {
  const parser = new EnglishActionParser();

  it.each([
    [
      'Firebolt. Ranged Spell Attack: +6 to hit, range 120 ft., one target. Hit: 11 (2d10) fire damage.',
      'rsak',
      'range 120 ft.',
      '2d10',
    ],
    [
      'Shocking Grasp. Melee Spell Attack: +7 to hit, reach 5 ft., one creature. Hit: 13 (3d8) lightning damage.',
      'msak',
      'reach 5 ft.',
      '3d8',
    ],
    [
      'Radiant Lance. Ranged Spell Attack: +5 to hit, range 60 ft., one creature. Hit: 9 (2d8) radiant damage.',
      'rsak',
      'range 60 ft.',
      '2d8',
    ],
  ] as const)('preserves %s as a native spell attack', (source, expectedType, expectedRange, expectedDamage) => {
    const action = parser.parse(source);

    expect(action?.type).toBe('attack');
    expect(action?.attack).toMatchObject({
      type: expectedType,
      range: expectedRange,
      damage: [expect.objectContaining({ formula: expectedDamage })],
    });
  });

  it('keeps a neighboring weapon attack classified as a weapon attack', () => {
    const action = parser.parse(
      'Longbow. Ranged Weapon Attack: +6 to hit, range 150/600 ft., one target. Hit: 8 (1d8 + 4) piercing damage.',
    );

    expect(action?.attack?.type).toBe('rwak');
  });

  it('does not classify unrelated spell prose as an attack', () => {
    const action = parser.parse('Arcane Sight. The mage can see magical auras within 30 feet.');

    expect(action?.type).toBe('utility');
    expect(action?.attack).toBeUndefined();
  });
});

describe('EnglishActionParser save outcomes', () => {
  const parser = new EnglishActionParser();

  it('records explicit half damage on a successful save', () => {
    const action = parser.parse(
      'Flame Burst. Each creature must make a DC 15 Dexterity saving throw, taking 4d6 fire damage on a failed save, or half as much damage on a successful one.',
    );

    expect(action?.save?.outcome).toBe('half');
  });

  it.each([
    'Poison Spray. The target must make a DC 14 Constitution saving throw, taking 2d12 poison damage on a failed save.',
    'Thunder Pulse. On a failed DC 16 Strength saving throw, the target takes 3d8 thunder damage.',
    'Freezing Mist. A creature that fails a DC 13 Constitution saving throw takes 2d6 cold damage.',
  ])('records failed-save-only damage as no damage on success: %s', (source) => {
    const action = parser.parse(source);

    expect(action?.save?.outcome).toBe('none');
  });

  it('keeps non-damage save prose literal instead of inventing half damage', () => {
    const action = parser.parse(
      'Dread Glare. The target must succeed on a DC 15 Wisdom saving throw or become frightened until the end of its next turn.',
    );

    expect(action?.save?.outcome).toBe('literal');
    expect(action?.damage).toEqual([]);
  });
});

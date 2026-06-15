import { describe, expect, it } from 'bun:test';
import { deriveCheckDc, deriveSaveDc } from '../activity-derivation';

const ALYXIAN_ABILITIES = { str: 21, dex: 9, con: 20, int: 18, wis: 15, cha: 18 };

describe('activity DC derivation', () => {
  it('uses the first exact ability match even when multiple source abilities share the same DC', () => {
    expect(
      deriveSaveDc({
        abilities: ALYXIAN_ABILITIES,
        proficiencyBonus: 5,
        dc: 18,
        targetSaveAbility: 'wis',
        actionName: '支配',
        englishName: 'Dominate',
        description: '目标必须进行一次 DC 18 的感知 (Wisdom) 豁免检定。目标被魔法魅惑并受控制。',
      }),
    ).toEqual({ kind: 'native', calculation: 'str', reason: 'firstExactMatch' });
  });

  it('uses the first exact mental ability match without hard-coded semantic filtering', () => {
    expect(
      deriveSaveDc({
        abilities: ALYXIAN_ABILITIES,
        proficiencyBonus: 5,
        dc: 17,
        targetSaveAbility: 'wis',
        actionName: '奴役',
        englishName: 'Enslave',
        description: '仅限被魅惑的目标。目标必须进行一次 DC 17 的感知 (Wisdom) 豁免检定。',
      }),
    ).toEqual({ kind: 'native', calculation: 'int', reason: 'firstExactMatch' });
  });

  it('uses an explicit spellcasting source ability when it exactly matches', () => {
    expect(
      deriveSaveDc({
        abilities: { str: 10, dex: 14, con: 12, int: 12, wis: 18, cha: 10 },
        proficiencyBonus: 3,
        dc: 15,
        targetSaveAbility: 'dex',
        actionName: 'Radiant Burst',
        description: 'Spellcasting ability is Wisdom. Each target makes a DC 15 Dexterity saving throw.',
        dcSourceAbility: 'wis',
        dcSourceKind: 'spellcasting',
      }),
    ).toEqual({ kind: 'native', calculation: 'wis', reason: 'explicitSource' });
  });

  it('extracts explicit spellcasting source ability from the activity description', () => {
    expect(
      deriveSaveDc({
        abilities: { str: 18, dex: 14, con: 12, int: 12, wis: 18, cha: 10 },
        proficiencyBonus: 3,
        dc: 15,
        targetSaveAbility: 'dex',
        actionName: 'Radiant Burst',
        description: 'Its spellcasting ability is Wisdom. Each target makes a DC 15 Dexterity saving throw.',
      }),
    ).toEqual({ kind: 'native', calculation: 'wis', reason: 'explicitSource' });
  });

  it('uses the first exact source ability when no explicit source exists', () => {
    expect(
      deriveSaveDc({
        abilities: { str: 10, dex: 16, con: 12, int: 18, wis: 12, cha: 10 },
        proficiencyBonus: 3,
        dc: 15,
        targetSaveAbility: 'int',
        actionName: 'Mind Pulse',
        description: 'A pulse of psychic force forces a saving throw.',
      }),
    ).toEqual({ kind: 'native', calculation: 'int', reason: 'firstExactMatch' });
  });

  it('keeps DC literal when it would require a hidden residual bonus', () => {
    expect(
      deriveSaveDc({
        abilities: { str: 10, dex: 14, con: 12, int: 12, wis: 18, cha: 10 },
        proficiencyBonus: 3,
        dc: 16,
        targetSaveAbility: 'dex',
        actionName: 'Radiant Burst',
        dcSourceAbility: 'wis',
        dcSourceKind: 'spellcasting',
      }),
    ).toEqual({ kind: 'literal', reason: 'requiresResidualBonus' });
  });

  it('exposes the same DC policy for future check activities', () => {
    expect(
      deriveCheckDc({
        abilities: { str: 10, dex: 10, con: 10, int: 20, wis: 14, cha: 12 },
        proficiencyBonus: 4,
        dc: 17,
        checkAbility: 'spellcasting',
        actionName: 'Nullifying Field',
        description: 'The creature must make a DC 17 Spellcasting ability check.',
        dcSourceAbility: 'int',
        dcSourceKind: 'spellcasting',
      }),
    ).toEqual({ kind: 'native', calculation: 'int', reason: 'explicitSource' });
  });
});

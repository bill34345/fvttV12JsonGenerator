import { describe, expect, it } from 'bun:test';
import { extractSourceDerivedAcEffect } from '../acEffectExtraction';

describe('extractSourceDerivedAcEffect', () => {
  it.each([
    ['Shell Drop. The creature AC becomes 14 until it rests.', 'flat', 14],
    ['脆弱甲壳。该生物的护甲等级降至13，直到其完成休息。', 'flat', 13],
    ['Guarded Step. The creature gains +9 AC until its next turn.', 'bonus', 9],
    ['防御步法。该生物的护甲等级获得 +2 加值。', 'bonus', 2],
  ] as const)('extracts an explicit source AC clause from %s', (text, kind, value) => {
    expect(extractSourceDerivedAcEffect(text)).toEqual(
      expect.objectContaining({ kind, value }),
    );
  });

  it.each([
    'Bleeding Bite. Melee Weapon Attack: +4 to hit.',
    'Claw. The creature attacks: +9 to hit.',
    'Jack gains a +3 bonus to the roll.',
    'Brittle Shell. The creature withdraws without changing AC.',
  ])('does not infer an AC effect from containing or non-changing text: %s', (text) => {
    expect(extractSourceDerivedAcEffect(text)).toBeNull();
  });
});

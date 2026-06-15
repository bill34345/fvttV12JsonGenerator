import { describe, expect, it } from 'bun:test';
import { extractPrimaryDamagePartsFromText } from '../actor-text';

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

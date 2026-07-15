import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ItemParser } from '../../parser/item-parser';
import { assertEqualStructure } from '../../utils/assertEqualStructure';
import { ItemGenerator } from '../item-generator';

const shieldFixture = readFileSync(
  join(__dirname, '../../parser/__tests__/fixtures/shield-of-the-cavalier.md'),
  'utf8',
);

function itemWithRarity(rarity: string): string {
  return ['---', 'layout: item', `稀有度: ${rarity}`, '---', '## Test Item'].join('\n');
}

function activitySemantics(item: Awaited<ReturnType<ItemGenerator['generate']>>) {
  return Object.values(item.system.activities ?? {}).map((activity: any) => ({
    name: activity.name,
    type: activity.type,
    activation: activity.activation,
    consumption: activity.consumption,
    uses: activity.uses,
  }));
}

describe('source-derived standalone Item semantics', () => {
  it.each([
    ['普通', 'common'],
    ['非普通', 'uncommon'],
    ['稀有', 'rare'],
    ['极珍稀', 'veryRare'],
    ['非常稀有', 'veryRare'],
    ['very rare', 'veryRare'],
    ['传说', 'legendary'],
    ['神器', 'artifact'],
  ] as const)('normalizes the exact rarity %s to %s', (source, expected) => {
    expect(new ItemParser().parse(itemWithRarity(source)).rarity).toBe(expected);
  });

  it('does not turn prose containing 稀有 into a rarity', () => {
    const source = ['---', 'layout: item', '---', '## Rumored Item', '*奇物，稀有度尚未确定*'].join('\n');
    expect(new ItemParser().parse(source).rarity).toBeUndefined();
  });

  it('keeps trigger-only saving throw prose out of save activities and parses explicit reaction limits', () => {
    const parsed = new ItemParser().parse(shieldFixture);
    const protectiveField = parsed.structuredActions?.utilities?.find((action) => action.englishName === 'Protective Field');

    expect(parsed.rarity).toBe('veryRare');
    expect(parsed.structuredActions?.saves).toBeUndefined();
    expect(parsed.structuredActions?.attacks?.map((action) => action.englishName)).toEqual(['Forceful Bash']);
    expect(protectiveField).toEqual(expect.objectContaining({
      name: '庇护领域',
      englishName: 'Protective Field',
      type: 'use',
      useAction: expect.objectContaining({
        activation: 'reaction',
        consumption: 0,
        limitedUses: {
          spent: 0,
          max: '1',
          recovery: [{ period: 'dawn', type: 'recoverAll' }],
        },
      }),
    }));
  });

  it.each([
    ['中文反应', '当盟友被攻击时，你可以作为反应将其移动 5 尺。'],
    ['English Reaction', "When an ally is attacked, you can use your reaction to move it 5 feet."],
    ['每日反应', '当盟友受到伤害时，你可以用你的反应保护它。使用该能力后，直到次日黎明前不能再次使用。'],
  ])('recognizes explicit actionable reaction syntax: %s', (name, description) => {
    const source = ['---', 'layout: item', '---', `## ${name}`, '*奇物，稀有*', `**守护（Guard）.** ${description}`].join('\n');
    const action = new ItemParser().parse(source).structuredActions?.utilities?.[0];
    expect(action?.type).toBe('use');
    expect(action?.useAction?.activation).toBe('reaction');
  });

  it.each([
    ['使用此反应后，直到下一个黎明前都无法再次使用。'],
    ['此词条一经使用，直至次日黎明前你都无法再次使用。'],
    ["After you use this reaction, you can't use it again until the next dawn."],
  ])('derives one dawn-recovering use only from an explicit limit: %s', (limitClause) => {
    const source = [
      '---',
      'layout: item',
      '---',
      '## Guardian Item',
      '*奇物，稀有*',
      `**守护（Guard）.** 当盟友受到伤害时，你可以用你的反应保护它。${limitClause}`,
    ].join('\n');
    expect(new ItemParser().parse(source).structuredActions?.utilities?.[0]?.useAction?.limitedUses).toEqual({
      spent: 0,
      max: '1',
      recovery: [{ period: 'dawn', type: 'recoverAll' }],
    });
  });

  it('does not infer a dawn limit from descriptive dawn prose', () => {
    const source = [
      '---',
      'layout: item',
      '---',
      '## Guardian Item',
      '*奇物，稀有*',
      '**守护（Guard）.** 黎明时盾牌会发光；当盟友受到伤害时，你可以用你的反应保护它，且可重复使用。',
    ].join('\n');
    expect(new ItemParser().parse(source).structuredActions?.utilities?.[0]?.useAction?.limitedUses).toBeUndefined();
  });

  it('does not infer an action from a descriptive use of the word 反应', () => {
    const source = ['---', 'layout: item', '---', '## 敏锐护符', '*奇物，稀有*', '**敏锐（Alertness）.** 这枚护符会提高佩戴者的反应速度。'].join('\n');
    const action = new ItemParser().parse(source).structuredActions?.utilities?.[0];
    expect(action?.type).toBe('utility');
    expect(action?.useAction).toBeUndefined();
  });

  for (const fvttVersion of ['12', '14'] as const) {
    it(`generates named Shield activities with reaction activation and dawn recovery for v${fvttVersion}`, async () => {
      const parsed = new ItemParser().parse(shieldFixture);
      const generated = await new ItemGenerator({ fvttVersion }).generate(parsed);
      const activities = activitySemantics(generated);
      const reaction = activities.find((activity) => activity.name === '庇护领域 (Protective Field)');

      expect(generated.system.rarity).toBe('veryRare');
      expect(activities.map((activity) => activity.name)).toEqual([
        '强力猛击 (Forceful Bash)',
        '庇护领域 (Protective Field)',
      ]);
      expect(reaction).toEqual(expect.objectContaining({
        type: 'utility',
        activation: expect.objectContaining({ type: 'reaction', value: 1, override: false }),
        consumption: expect.objectContaining({ targets: [] }),
        uses: {
          spent: 0,
          max: '1',
          recovery: [{ period: 'dawn', type: 'recoverAll' }],
        },
      }));
      assertEqualStructure(
        reaction,
        {
          name: '',
          type: '',
          activation: { type: '', value: 0, override: false },
          consumption: {
            targets: [],
            scaling: { allowed: false, max: '' },
            spellSlot: false,
          },
          uses: {
            spent: 0,
            max: '',
            recovery: [{ period: '', type: '' }],
          },
        },
        { mode: 'shape' },
      );
    });
  }

  it('leaves the unrelated Jewel identity, rarity, stages, and first-stage effects intact', async () => {
    const jewel = readFileSync(
      join(process.cwd(), 'obsidian/dnd数据转fvttjson/input/items/三祷之坠.md'),
      'utf8',
    );
    const parsed = new ItemParser().parse(jewel);
    const generated = await new ItemGenerator({ fvttVersion: '12' }).generate(parsed);

    assertEqualStructure(
      {
        name: generated.name,
        rarity: generated.system.rarity,
        stageNames: parsed.stages?.map((stage) => stage.name),
        firstStageActionTypes: parsed.stages?.[0]?.actions
          ? Object.keys(parsed.stages[0].actions)
          : [],
      },
      {
        name: '三祷之坠 (Jewel of Three Prayers)',
        rarity: 'legendary',
        stageNames: ['休眠态', '觉醒态', '升华态'],
        firstStageActionTypes: [],
      },
    );
  });
});

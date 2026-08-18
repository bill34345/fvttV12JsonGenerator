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
    description: activity.description,
    duration: activity.duration,
    range: activity.range,
    target: activity.target,
    effects: activity.effects,
    uses: activity.uses,
  }));
}

function compactItem(options: {
  title: string;
  typeLine?: string;
  traitName?: string;
  traitDescription?: string;
}): string {
  const typeLine = options.typeLine ?? '奇物，稀有';
  return [
    '---',
    'layout: item',
    '---',
    `## ${options.title}`,
    `*${typeLine}*`,
    options.traitName && options.traitDescription
      ? `**${options.traitName}.** ${options.traitDescription}`
      : '没有明确的可执行机制。',
  ].join('\n');
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

  it('starts an unspecified armor item from a neutral schema instead of the first breastplate mechanics', async () => {
    const parsed = new ItemParser().parse(compactItem({
      title: '未知护具（Unknown Guard）',
      typeLine: '护甲，稀有',
    }));
    const generated = await new ItemGenerator({ fvttVersion: '14' }).generate(parsed);

    expect(generated.img).toBe('icons/svg/item-bag.svg');
    expect(generated.system.armor).toEqual({ value: null, dex: null, magicalBonus: null });
    expect(generated.system.type).toEqual({ value: 'trinket', baseItem: '' });
    expect(generated.system.properties).toEqual(['mgc']);
    expect(generated.system.weight).toEqual({ value: 0, units: 'lb' });
    expect(generated.system.price).toEqual({ value: 0, denomination: 'gp' });
    expect(generated.effects).toEqual([]);
  });

  it.each([
    [
      '中文额外盾牌加值',
      '护甲（盾牌），极珍稀',
      '持握这面盾牌期间，你的护甲等级获得 +2 加值。这是盾牌原本提供的 AC 加值外的额外加值。',
      2,
    ],
    [
      'English Additional Shield Bonus',
      'Armor (Shield), very rare',
      "While holding this shield, you have a +1 bonus to Armor Class. This bonus is in addition to the shield's normal bonus to AC.",
      1,
    ],
    [
      '中文另一额外加值',
      '护甲（盾牌），极珍稀',
      '持握该盾牌时，你在盾牌原本的护甲等级加值之外，额外获得 +3 AC 加值。',
      3,
    ],
  ])('parses explicit shield base and additional magical AC: %s', (_label, typeLine, description, bonus) => {
    const parsed = new ItemParser().parse(compactItem({ title: 'Corpus Shield', typeLine })
      .replace('没有明确的可执行机制。', description));

    expect(parsed.armor).toEqual({
      value: 2,
      dex: null,
      magicalBonus: bonus,
      type: 'shield',
      baseItem: 'shield',
    });
    expect(parsed.properties).toContain('mgc');
  });

  it('does not turn a plain AC value into an additional magical shield bonus', () => {
    const parsed = new ItemParser().parse(compactItem({ title: 'Plain Shield', typeLine: '护甲（盾牌），普通' })
      .replace('没有明确的可执行机制。', '持握这面盾牌时，你的护甲等级为 2。'));

    expect(parsed.armor).toEqual({
      value: 2,
      dex: null,
      magicalBonus: null,
      type: 'shield',
      baseItem: 'shield',
    });
    expect(parsed.properties ?? []).not.toContain('mgc');
  });

  it.each([
    [
      '中文专注光环',
      '当盟友被攻击时，你可以用反应创造一个 5 尺光环。该光环需要你维持专注，并持续最多 1 分钟。',
      { value: '1', units: 'minute', concentration: true, aura: '5' },
    ],
    [
      'English Concentration Aura',
      'As a reaction, create a 15-foot aura that lasts while you maintain concentration, up to 10 minutes.',
      { value: '10', units: 'minute', concentration: true, aura: '15' },
    ],
    [
      '中文轮数光环',
      '当你被命中时，你可以用反应创造一个 10 尺光环，持续 3 轮。',
      { value: '3', units: 'round', concentration: false, aura: '10' },
    ],
  ])('parses explicit utility duration, concentration, and aura: %s', (_label, description, expected) => {
    const parsed = new ItemParser().parse(compactItem({
      title: 'Duration Corpus',
      traitName: '守护（Guard）',
      traitDescription: description,
    }));
    const action = parsed.structuredActions?.utilities?.[0] as any;

    expect(action.activity).toEqual({
      duration: {
        value: expected.value,
        units: expected.units,
        concentration: expected.concentration,
      },
      range: { value: expected.aura, units: 'ft' },
      target: {
        template: { type: 'radius', size: expected.aura, units: 'ft' },
      },
    });
  });

  it('does not infer duration or concentration from descriptive minute/concentration words', () => {
    const parsed = new ItemParser().parse(compactItem({
      title: 'Duration Negative',
      traitName: '观察（Observe）',
      traitDescription: '你可以用反应观察一个标有 1 分钟刻度的表盘，并专注于辨认其花纹。',
    }));

    expect((parsed.structuredActions?.utilities?.[0] as any)?.activity).toBeUndefined();
  });

  it.each([
    ['中文力量', '将你的熟练加值和力量调整值加入攻击检定', '力量', '钝击', 'str'],
    ['English Dexterity', 'Add your proficiency bonus and Dexterity modifier to the attack roll', '敏捷', '穿刺', 'dex'],
    ['中文感知反序', '将你的感知调整值和熟练加值加入攻击检定', '感知', '力场', 'wis'],
  ] as const)('uses an explicitly sourced attack ability and normalizes its damage modifier: %s', (
    _label,
    attackRoll,
    abilityName,
    damageType,
    expectedAbility,
  ) => {
    const parsed = new ItemParser().parse(compactItem({
      title: 'Ability Corpus',
      typeLine: '武器，稀有',
      traitName: '精准攻击（Precise Attack）',
      traitDescription: `你执行一次攻击动作。${attackRoll}。若命中，造成 1d6 + 你${abilityName}调整值的${damageType}伤害。`,
    }));
    const attack = parsed.structuredActions?.attacks?.[0]?.attack;

    expect(attack?.ability).toBe(expectedAbility);
    expect(attack?.damage[0]?.formula).toBe('1d6+@mod');
  });

  it('does not infer an attack ability from an ability requirement without proficiency-roll wording', () => {
    const parsed = new ItemParser().parse(compactItem({
      title: 'Ability Negative',
      typeLine: '武器，稀有',
      traitName: '沉重攻击（Heavy Attack）',
      traitDescription: '使用者的力量调整值必须为正数才能执行这次攻击动作。若命中，造成 1d6 + 你力量调整值的钝击伤害。',
    }));
    const attack = parsed.structuredActions?.attacks?.[0]?.attack;

    expect(attack?.ability).toBeUndefined();
    expect(attack?.damage[0]?.formula).toBe('1d6+@str');
  });

  for (const fvttVersion of ['12', '14'] as const) {
    it(`generates named Shield activities with reaction activation and dawn recovery for v${fvttVersion}`, async () => {
      const parsed = new ItemParser().parse(shieldFixture);
      const generated = await new ItemGenerator({ fvttVersion }).generate(parsed);
      const activities = activitySemantics(generated);
      const reaction = activities.find((activity) => activity.name === '庇护领域 (Protective Field)');

      expect(generated.system.rarity).toBe('veryRare');
      expect(generated.system.armor).toEqual({ value: 2, dex: null, magicalBonus: 2 });
      expect(generated.system.type).toEqual({ value: 'shield', baseItem: 'shield' });
      expect(generated.system.properties).toEqual(['mgc']);
      expect(generated.system.weight).toEqual({ value: 6, units: 'lb' });
      expect(generated.system.price).toEqual({ value: 0, denomination: 'gp' });
      expect(activities.map((activity) => activity.name)).toEqual([
        '强力猛击 (Forceful Bash)',
        '庇护领域 (Protective Field)',
      ]);
      const bash = activities.find((activity) => activity.name === '强力猛击 (Forceful Bash)');
      const rawBash = Object.values(generated.system.activities ?? {})
        .find((activity: any) => activity.name === '强力猛击 (Forceful Bash)') as any;
      const prone = generated.effects?.find((effect: any) => effect.statuses?.includes('prone'));
      expect(rawBash.attack).toEqual(expect.objectContaining({
        ability: 'str',
        bonus: '',
        flat: false,
      }));
      expect(rawBash.damage.parts).toContainEqual(expect.objectContaining({
        types: ['force'],
        custom: { enabled: true, formula: '2d6+2+@mod' },
      }));
      expect(prone).toEqual(expect.objectContaining({ transfer: false, statuses: ['prone'] }));
      expect(bash?.effects).toContainEqual({ _id: prone?._id });
      expect(reaction).toEqual(expect.objectContaining({
        type: 'utility',
        activation: expect.objectContaining({ type: 'reaction', value: 1, override: false }),
        consumption: expect.objectContaining({
          targets: [{
            type: 'activityUses',
            target: '',
            value: '1',
            scaling: { mode: '', formula: '' },
          }],
        }),
        description: { chatFlavor: expect.stringContaining('持续最多 1 分钟') },
        duration: {
          value: '1',
          units: 'minute',
          concentration: true,
          override: false,
        },
        range: { value: '5', units: 'ft', special: '', override: false },
        target: expect.objectContaining({
          template: expect.objectContaining({ type: 'radius', size: '5', units: 'ft' }),
        }),
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
          description: { chatFlavor: '' },
          consumption: {
            targets: [{
              type: '',
              target: '',
              value: '',
              scaling: { mode: '', formula: '' },
            }],
            scaling: { allowed: false, max: '' },
            spellSlot: false,
          },
          duration: { value: '', units: '', concentration: false, override: false },
          range: { value: '', units: '', special: '', override: false },
          target: {
            template: {
              count: '',
              contiguous: false,
              type: '',
              size: '',
              width: '',
              height: '',
              units: '',
            },
            affects: { count: '', type: '', choice: false, special: '' },
            prompt: false,
            override: false,
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

  it('does not attach a condition effect when prone is only an attack prerequisite', async () => {
    const source = compactItem({
      title: 'Prerequisite Hammer',
      typeLine: '武器，稀有',
      traitName: '追击（Follow-up）',
      traitDescription: '目标必须已经处于倒地状态，你才能执行这次攻击动作。若命中，造成 1d6 钝击伤害。',
    });
    const parsed = new ItemParser().parse(source);
    const generated = await new ItemGenerator({ fvttVersion: '14' }).generate(parsed);

    expect(generated.effects).toEqual([]);
    expect(Object.values(generated.system.activities ?? {})).toHaveLength(1);
  });

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

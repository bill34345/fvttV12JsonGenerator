import { describe, expect, it } from 'bun:test';
import { ItemParser } from '../item-parser';

describe('ItemParser', () => {
  const parser = new ItemParser();

  describe('canParse', () => {
    it('returns true for content with layout: item', () => {
      const content = ['---', 'layout: item', '---', '## Test Item'].join('\n');
      expect(parser.canParse(content)).toBe(true);
    });

    it('returns false for content with layout: creature', () => {
      const content = ['---', 'layout: creature', '---', '## Test Creature'].join('\n');
      expect(parser.canParse(content)).toBe(false);
    });

    it('returns false for content without frontmatter', () => {
      const content = '## Just a regular item';
      expect(parser.canParse(content)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses frontmatter with all fields', () => {
      const content = [
        '---',
        'layout: item',
        '名称: 三祷之坠',
        '英文名: Jewel of Three Prayers',
        '类型: 奇物',
        '稀有度: 传说',
        'require-attunement: true',
        '---',
        '## 三祷之坠（Jewel of Three Prayers）',
        '*奇物，传说（需同调）*',
        '三祷之坠是一件诀别遗物...',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('三祷之坠');
      expect(result.englishName).toBe('Jewel of Three Prayers');
      expect(result.rarity).toBe('legendary');
      expect(result.attunement).toBe('required');
      expect(result.description).toBe('三祷之坠是一件诀别遗物...');
    });

    it('parses header line format with Chinese and English names', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 三祷之坠（Jewel of Three Prayers）',
        '*奇物，传说（需同调）*',
        '三祷之坠是一件诀别遗物...',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('三祷之坠');
      expect(result.englishName).toBe('Jewel of Three Prayers');
      expect(result.rarity).toBe('legendary');
      expect(result.attunement).toBe('required');
      expect(result.description).toBe('三祷之坠是一件诀别遗物...');
    });

    it('parses frontmatter name and header English name', () => {
      const content = [
        '---',
        'layout: item',
        '名称: 三祷之坠',
        '---',
        '## 三祷之坠（Jewel of Three Prayers）',
        '*奇物，传说*',
        'Some description',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('三祷之坠');
      expect(result.englishName).toBe('Jewel of Three Prayers');
    });

    it('parses 需同调 attunement from header', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 矮人护甲（Dwarven Plate）',
        '*护甲，稀有（需同调）*',
        'Description here',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('矮人护甲');
      expect(result.englishName).toBe('Dwarven Plate');
      expect(result.rarity).toBe('uncommon');
      expect(result.attunement).toBe('required');
    });

    it('parses rarity from frontmatter', () => {
      const content = [
        '---',
        'layout: item',
        '稀有度: rare',
        '---',
        '## Shield',
        '*普通盾牌*',
        'A simple shield',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.rarity).toBe('rare');
    });

    it('uses header line name when frontmatter name is missing', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## Only Header Name',
        '*common*',
        'Description',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('Only Header Name');
    });

    it('uses "Unknown Item" when no name found', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        'No header here',
        'Just some text',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('Unknown Item');
    });

    it('parses shield example', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 矮人护甲（Dwarven Plate）',
        '*护甲，稀有（需同调）*',
        'You gain a +2 bonus to AC while wearing this armor.',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.name).toBe('矮人护甲');
      expect(result.englishName).toBe('Dwarven Plate');
      expect(result.rarity).toBe('uncommon');
      expect(result.attunement).toBe('required');
    });
  });

  describe('attack trait parsing', () => {
    it('parses shield bash attack trait', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 骑士之盾（Shield of the Cavalier）',
        '*护甲（盾牌），极珍稀（需同调）*',
        '持握这面盾牌期间，你的护甲等级获得 +2 加值。',
        '**强力猛击（Forceful Bash）.** 当你执行攻击动作时，你可以使用这面盾牌进行其中一次攻击，这次攻击的目标必须在你 5 尺之内。将你的熟练加值和力量调整值加入攻击检定。若命中，盾牌会对目标造成 2d6 + 2 + 你力量调整值的力场伤害。如果目标是生物，你可以将其推离至多 10 尺。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions).toBeDefined();
      expect(result.structuredActions?.attacks).toBeDefined();
      const attacks = result.structuredActions?.attacks;
      expect(attacks?.length).toBeGreaterThan(0);

      const attack = attacks?.[0];
      expect(attack).toBeDefined();
      expect(attack!.name).toBe('强力猛击');
      expect(attack!.englishName).toBe('Forceful Bash');
      expect(attack!.type).toBe('attack');
      expect(attack!.attack?.type).toBe('mwak');
      expect(attack!.attack?.range).toBe('5 ft');
      expect(attack!.attack?.reach).toBe('5 ft');
      expect(attack!.attack?.toHit).toBe(0);
    });

    it('parses attack with explicit to-hit bonus', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 火球杖（Wand of Fireballs）',
        '*魔杖，稀有（需同调）*',
        '**火焰冲击（Flame Strike）.** 当你执行攻击动作时，你可以用这把魔杖进行一次攻击。这次攻击使用你的魅力调整值作为攻击加值。若命中，目标受到 3d6 + 5火焰伤害。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks).toBeDefined();
      const attack = result.structuredActions?.attacks?.[0];
      expect(attack).toBeDefined();
      expect(attack!.name).toBe('火焰冲击');
      expect(attack!.englishName).toBe('Flame Strike');
      expect(attack!.type).toBe('attack');
      expect(attack!.attack?.type).toBe('mwak');
    });

    it('does not create attack for non-attack traits', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 三祷之坠（Jewel of Three Prayers）',
        '*奇物，传说（需同调）*',
        '**休眠态（Dormant State）.** 在这个状态下，三祷之坠是一面闪闪发光的黄金圆盘。',
        '在休眠状态下，这件坠饰有着以下属性：',
        '- 当佩戴这件饰物时，你的 AC 获得 +1 加值。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks).toBeUndefined();
    });

    it('parses ranged attack trait', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 火焰弓（Flame Bow）',
        '*武器，稀有*',
        '**火焰射击（Flame Shot）.** 当你执行攻击动作时，你可以用这把弓进行一次远程攻击。目标必须在 30 尺范围内。若命中，目标受到 1d8 + 3火焰伤害。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks).toBeDefined();
      const attack = result.structuredActions?.attacks?.[0];
      expect(attack).toBeDefined();
      expect(attack!.name).toBe('火焰射击');
      expect(attack!.attack?.type).toBe('rwak');
      expect(attack!.attack?.range).toBe('30 ft');
    });

    it('handles multiple attack traits', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 双发法杖（Dual Wand）',
        '*魔杖，传说（需同调）*',
        '**寒冰箭（Cold Shot）.** 当你执行攻击动作时，你可以发射一支寒冰箭。目标必须在 60 尺内。若命中，目标受到 2d8 + 2寒冷伤害。',
        '**火焰弹（Fire Bolt）.** 当你执行攻击动作时，你可以发射一枚火焰弹。目标必须在 90 尺内。若命中，目标受到 3d6火焰伤害。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks?.length).toBe(2);
    });
  });

  describe('save trait parsing', () => {
    it('parses save trait with DC and ability', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 秘术铠甲（Arcane Armor）',
        '*奇物，稀有（需同调）*',
        '**秘视（Arcane Sight）.** DC 18体质豁免 你能看穿30尺范围内的隐形生物。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions).toBeDefined();
      expect(result.structuredActions?.saves).toBeDefined();
      const saves = result.structuredActions?.saves;
      expect(saves?.length).toBeGreaterThan(0);

      const save = saves?.[0];
      expect(save).toBeDefined();
      expect(save!.name).toBe('秘视');
      expect(save!.englishName).toBe('Arcane Sight');
      expect(save!.type).toBe('save');
      expect(save!.save?.dc).toBe(18);
      expect(save!.save?.ability).toBe('con');
    });

    it('parses save trait with 豁免DC format', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 心灵护盾（Mind Shield）',
        '*奇物，稀有*',
        '**心灵防护（Mind Guard）.** 豁免DC 15感知 抵抗心灵伤害。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.saves).toBeDefined();
      const save = result.structuredActions?.saves?.[0];
      expect(save).toBeDefined();
      expect(save!.name).toBe('心灵防护');
      expect(save!.englishName).toBe('Mind Guard');
      expect(save!.save?.dc).toBe(15);
      expect(save!.save?.ability).toBe('wis');
    });

    it('parses save with damage on failed save', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 火焰吐息杖（Wand of Flame Breath）',
        '*魔杖，稀有（需同调）*',
        '**火焰吐息（Flame Breath）.** 当你执行攻击动作时，你可以用这把魔杖进行火焰吐息攻击。豁免DC 14敏捷 失败：6d6火焰伤害，成功：减半。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.saves).toBeDefined();
      const save = result.structuredActions?.saves?.[0];
      expect(save).toBeDefined();
      expect(save!.type).toBe('save');
      expect(save!.save?.dc).toBe(14);
      expect(save!.save?.ability).toBe('dex');
      expect(save!.damage).toBeDefined();
      expect(save!.damage?.length).toBeGreaterThan(0);
    });

    it('does not create save for non-save traits', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 魔法斗篷（Magic Cloak）',
        '*奇物，普通*',
        '**防护（Protection）.** 你获得+1护甲等级加成。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.saves).toBeUndefined();
    });

    it('handles both attack and save traits in same item', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 元素法杖（Elemental Wand）',
        '*魔杖，稀有（需同调）*',
        '**元素打击（Elemental Strike）.** 当你执行攻击动作时，你可以进行一次远程攻击。目标在30尺内。若命中，受到2d6火焰伤害。',
        '**元素爆发（Elemental Burst）.** DC 13体质豁免 失败：4d6火焰伤害，成功：减半。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks).toBeDefined();
      expect(result.structuredActions?.saves).toBeDefined();
      expect(result.structuredActions?.attacks?.length).toBe(1);
      expect(result.structuredActions?.saves?.length).toBe(1);
    });

    it('parses save with English ability name', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 防护戒指（Ring of Protection）',
        '*戒指，稀有（需同调）*',
        '**防护光环（Protective Aura）.** DC 12 dex save 区域内生物获得保护。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.saves).toBeDefined();
      const save = result.structuredActions?.saves?.[0];
      expect(save).toBeDefined();
      expect(save!.save?.dc).toBe(12);
      expect(save!.save?.ability).toBe('dex');
    });
  });

  describe('utility trait parsing', () => {
    it('parses basic utility trait', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 水中呼吸戒指（Ring of Water Breathing）',
        '*戒指，稀有（需同调）*',
        '**水中呼吸（Water Breathing）.** 你获得在水中呼吸的能力。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions).toBeDefined();
      expect(result.structuredActions?.utilities).toBeDefined();
      const utilities = result.structuredActions?.utilities;
      expect(utilities?.length).toBeGreaterThan(0);

      const utility = utilities?.[0];
      expect(utility).toBeDefined();
      expect(utility!.name).toBe('水中呼吸');
      expect(utility!.englishName).toBe('Water Breathing');
      expect(utility!.type).toBe('utility');
    });

    it('parses utility trait with English name', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 护盾（Shield）',
        '*护甲，稀有*',
        '**AC加成（AC Bonus）.** 你获得+2AC加成。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.utilities).toBeDefined();
      const utility = result.structuredActions?.utilities?.[0];
      expect(utility).toBeDefined();
      expect(utility!.name).toBe('AC加成');
      expect(utility!.englishName).toBe('AC Bonus');
      expect(utility!.type).toBe('utility');
    });

    it('handles mixed attack + save + utility traits', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 元素之刃（Elemental Blade）',
        '*武器，传说（需同调）*',
        '**元素打击（Elemental Strike）.** 当你执行攻击动作时，你可以进行一次远程攻击。目标在30尺内。若命中，受到2d6火焰伤害。',
        '**元素防护（Elemental Ward）.** DC 15体质豁免 失败：4d6火焰伤害，成功：减半。',
        '**火焰免疫（Fire Immunity）.** 你对火焰伤害免疫。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.attacks).toBeDefined();
      expect(result.structuredActions?.saves).toBeDefined();
      expect(result.structuredActions?.utilities).toBeDefined();

      expect(result.structuredActions?.attacks?.length).toBe(1);
      expect(result.structuredActions?.saves?.length).toBe(1);
      expect(result.structuredActions?.utilities?.length).toBe(1);

      const utility = result.structuredActions?.utilities?.[0];
      expect(utility!.name).toBe('火焰免疫');
      expect(utility!.englishName).toBe('Fire Immunity');
      expect(utility!.type).toBe('utility');
    });

    it('does not include attack or save traits in utilities', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 攻击与豁免物品（Attack and Save Item）',
        '*奇物，稀有（需同调）*',
        '**攻击特性（Attack Feature）.** 当你执行攻击动作时，造成2d6伤害。',
        '**豁免特性（Save Feature）.** DC 15敏捷豁免。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.utilities).toBeUndefined();
    });
  });

  describe('cast trait parsing', () => {
    it('parses basic cast trait', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 隐形魔杖（Wand of Invisibility）',
        '*魔杖，稀有（需同调）*',
        '**隐形术（Invisibility）.** 消耗1发充能施展隐形术。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions).toBeDefined();
      expect(result.structuredActions?.casts).toBeDefined();
      const casts = result.structuredActions?.casts;
      expect(casts?.length).toBeGreaterThan(0);

      const cast = casts?.[0];
      expect(cast).toBeDefined();
      expect(cast!.name).toBe('隐形术');
      expect(cast!.englishName).toBe('Invisibility');
      expect(cast!.type).toBe('utility');
      expect(cast!.spellName).toBe('隐形术');
      expect(cast!.usesPerDay).toBe(1);
    });

    it('parses cast with spell name in asterisks', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 火球杖（Wand of Fireball）',
        '*魔杖，稀有（需同调）*',
        '**火球术（Fireball）.** 每天1次施展*火球术*。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.casts).toBeDefined();
      const cast = result.structuredActions?.casts?.[0];
      expect(cast).toBeDefined();
      expect(cast!.name).toBe('火球术');
      expect(cast!.englishName).toBe('Fireball');
      expect(cast!.spellName).toBe('火球术');
      expect(cast!.usesPerDay).toBe(1);
    });

    it('parses cast with uses per day', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 治疗法杖（Staff of Healing）',
        '*法杖，稀有（需同调）*',
        '**治疗术（Healing）.** 每天3次施展*治疗术*。',
      ].join('\n');

      const result = parser.parse(content);
      expect(result.structuredActions?.casts).toBeDefined();
      const casts = result.structuredActions?.casts;
      expect(casts?.length).toBe(1);

      const cast = casts?.[0];
      expect(cast).toBeDefined();
      expect(cast!.name).toBe('治疗术');
      expect(cast!.englishName).toBe('Healing');
      expect(cast!.usesPerDay).toBe(3);
    });
  });

  describe('multi-stage item parsing', () => {
    it('parses three-stage item with Dormant, Awakened, and Exalted states', () => {
      const content = [
        '---',
        'layout: item',
        '名称: 三祷之坠',
        '英文名: Jewel of Three Prayers',
        '类型: 奇物',
        '稀有度: 传说',
        'require-attunement: true',
        '---',
        '## 三祷之坠（Jewel of Three Prayers）',
        '*奇物，传说（需同调）*',
        '三祷之坠是一件诀别遗物...',
        '**休眠态（Dormant State）.** 在这个状态下，三祷之坠是一面闪闪发光的黄金圆盘。',
        '在休眠状态下，这件坠饰有着以下属性：',
        '- 当佩戴这件坠饰时，你的护甲等级获得 +1 加值。',
        '- 你可以感知距离你30尺内的所有生物位置。',
        '**觉醒态（Awakened State）.** 当你完成一次短休息并将坠饰置于你的唇边时，坠饰会发出微光。',
        '在觉醒状态下，这件坠饰有着以下属性（此外保留休眠状态下的属性）：',
        '- 你的护甲等级获得 +2 加值（取代 +1）。',
        '- 你可以施展*侦测魔法*，每长休一次。',
        '- 你获得+5的生命值加成。',
        '**升华态（Exalted State）.** 在升华状态下，三祷之坠完全绽放其力量。',
        '在升华状态下，这件坠饰有着以下属性（此外保留之前状态下的属性）：',
        '- 你的护甲等级获得 +3 加值（取代 +2）。',
        '- 你可以每天一次施展*反魔法场*。',
        '- 你对心灵伤害免疫。',
      ].join('\n');

      const result = parser.parse(content);

      expect(result.name).toBe('三祷之坠');
      expect(result.stages).toBeDefined();
      expect(result.stages!.length).toBe(3);

      expect(result.stages![0].name).toBe('休眠态');
      expect(result.stages![0].requirements).toEqual([
        '当佩戴这件坠饰时，你的护甲等级获得 +1 加值。',
        '你可以感知距离你30尺内的所有生物位置。',
      ]);

      expect(result.stages![1].name).toBe('觉醒态');
      expect(result.stages![1].requirements).toEqual([
        '你的护甲等级获得 +2 加值（取代 +1）。',
        '你可以施展*侦测魔法*，每长休一次。',
        '你获得+5的生命值加成。',
      ]);

      expect(result.stages![2].name).toBe('升华态');
      expect(result.stages![2].requirements).toEqual([
        '你的护甲等级获得 +3 加值（取代 +2）。',
        '你可以每天一次施展*反魔法场*。',
        '你对心灵伤害免疫。',
      ]);
    });

    it('parses item with no stage keywords as empty stages array', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 普通物品（Normal Item）',
        '*普通*',
        '这是一个普通物品。',
      ].join('\n');

      const result = parser.parse(content);

      expect(result.stages).toEqual([]);
    });

    it('parses item with only Dormant state', () => {
      const content = [
        '---',
        'layout: item',
        '---',
        '## 简单物品（Simple Item）',
        '*普通*',
        '**休眠态（Dormant State）.** 简单描述。',
        '在休眠状态下：',
        '- 能力1。',
      ].join('\n');

      const result = parser.parse(content);

      expect(result.stages).toBeDefined();
      expect(result.stages!.length).toBe(1);
      expect(result.stages![0].name).toBe('休眠态');
      expect(result.stages![0].requirements).toEqual(['能力1。']);
    });
  });
});

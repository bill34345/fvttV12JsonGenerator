import { test, expect, describe } from 'bun:test';
import { ItemGenerator } from '../item-generator';
import { ItemParser } from '../../parser/item-parser';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REFERENCES_PATH = join(__dirname, '../../../../references/dnd5e-4.3.9/repo/packs/_source/items');

describe('ItemGenerator Golden Master Verification', () => {
  describe('equipment item structure', () => {
    test('generated equipment matches reference structure', async () => {
      const parser = new ItemParser();
      const generator = new ItemGenerator();

      const content = `
---
layout: item
名称: 测试护甲
类型: 护甲
稀有度: rare
require-attunement: true
---
## 测试护甲（Test Armor）
*护甲，稀有（需同调）*
这是一个测试护甲，提供AC加成。
      `.trim();

      const parsed = parser.parse(content);
      const item = await generator.generate(parsed);

      // Check required top-level fields
      expect(item._id).toBeDefined();
      expect(typeof item._id).toBe('string');
      expect(item._id.length).toBeGreaterThan(0);

      expect(item.name).toBeDefined();
      expect(typeof item.name).toBe('string');

      expect(item.type).toBe('equipment');

      // Check system object exists and has required fields
      expect(item.system).toBeDefined();
      expect(typeof item.system).toBe('object');

      // Description field
      expect(item.system.description).toBeDefined();
      expect(item.system.description.value).toBeDefined();

      // Source field
      expect(item.system.source).toBeDefined();
      expect(item.system.source.book).toBe('SRD 5.1');

      // Physical properties
      expect(item.system.quantity).toBeDefined();
      expect(item.system.weight).toBeDefined();
      expect(item.system.price).toBeDefined();

      // Rarity
      expect(item.system.rarity).toBe('rare');

      // Attunement
      expect(item.system.attunement).toBe('required');

      // Identifier
      expect(item.system.identifier).toBeDefined();

      // Check _stats for Golden Master compliance
      expect(item._stats).toBeDefined();
      if (item._stats) {
        expect(item._stats.coreVersion).toBeDefined();
        expect(item._stats.systemId).toBe('dnd5e');
        expect(item._stats.systemVersion).toBeDefined();
      }
    });

    test('equipment reference item has valid golden master structure', () => {
      // Load a real reference equipment item to verify structure
      const referencePath = join(REFERENCES_PATH, 'equipment', 'amulet-of-health.json');

      if (existsSync(referencePath)) {
        const content = readFileSync(referencePath, 'utf-8');
        const reference = JSON.parse(content);

        // Verify this is a valid golden master reference
        expect(reference._id).toMatch(/^[a-z0-9]+$/i);
        expect(reference.name).toBe('Amulet of Health');
        expect(reference.type).toBe('equipment');
        expect(reference.system).toBeDefined();
        expect(reference.system.description).toBeDefined();
        expect(reference.system.attunement).toBe('required');
        expect(reference.system.rarity).toBe('rare');
        expect(reference.system.identifier).toBe('amulet-of-health');
        expect(reference._stats).toBeDefined();
        expect(reference._stats.systemId).toBe('dnd5e');
      }
    });
  });

  describe('weapon item structure', () => {
    test('generated weapon matches reference structure', async () => {
      const parser = new ItemParser();
      const generator = new ItemGenerator();

      const content = `
---
layout: item
名称: 战斧
类型: 武器
稀有度: 普通
---
## 战斧（Battleaxe）
*武器，普通*
一把坚固的战斧。
      `.trim();

      const parsed = parser.parse(content);
      const item = await generator.generate(parsed);

      // Check required top-level fields
      expect(item._id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.type).toBe('weapon');

      // Check system object
      expect(item.system).toBeDefined();

      // Description
      expect(item.system.description).toBeDefined();

      // Source
      expect(item.system.source).toBeDefined();

      // Physical properties
      expect(item.system.quantity).toBe(1);
      expect(item.system.weight).toBeDefined();
      expect(item.system.price).toBeDefined();

      // Weapon-specific fields
      expect(item.system.damage).toBeDefined();
      expect(item.system.damage.base).toBeDefined();

      // Range for weapons
      expect(item.system.range).toBeDefined();

      // Properties
      expect(item.system.properties).toBeDefined();

      // Identifier
      expect(item.system.identifier).toBeDefined();

      // _stats for Golden Master compliance
      expect(item._stats).toBeDefined();
      if (item._stats) {
        expect(item._stats.systemId).toBe('dnd5e');
      }
    });

    test('weapon reference item has valid golden master structure', () => {
      const referencePath = join(REFERENCES_PATH, 'weapon', 'battleaxe.json');

      if (existsSync(referencePath)) {
        const content = readFileSync(referencePath, 'utf-8');
        const reference = JSON.parse(content);

        // Verify golden master reference structure
        expect(reference._id).toMatch(/^[a-z0-9]+$/i);
        expect(reference.name).toBe('Battleaxe');
        expect(reference.type).toBe('weapon');
        expect(reference.system).toBeDefined();
        expect(reference.system.damage).toBeDefined();
        expect(reference.system.damage.base).toBeDefined();
        expect(reference.system.damage.base.types).toContain('slashing');
        expect(reference.system.range).toBeDefined();
        expect(reference.system.properties).toBeDefined();
        expect(reference.system.identifier).toBe('battleaxe');
        expect(reference._stats).toBeDefined();
      }
    });
  });

  describe('consumable item with charges structure', () => {
    test('generated consumable with charges matches reference structure', async () => {
      const parser = new ItemParser();
      const generator = new ItemGenerator();

      const content = `
---
layout: item
名称: 炼金火焰
类型: 消耗品
稀有度: 普通
---
## 炼金火焰（Alchemist's Fire）
*消耗品，普通*
这是一种粘性流体，暴露在空气中会点燃。
      `.trim();

      const parsed = parser.parse(content);
      const item = await generator.generate(parsed);

      // Check required top-level fields
      expect(item._id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.type).toBe('consumable');

      // Check system object
      expect(item.system).toBeDefined();

      // Description
      expect(item.system.description).toBeDefined();

      // Source
      expect(item.system.source).toBeDefined();

      // Physical properties
      expect(item.system.quantity).toBe(1);
      expect(item.system.weight).toBeDefined();
      expect(item.system.price).toBeDefined();

      // Consumable-specific: uses/charges
      expect(item.system.uses).toBeDefined();
      expect(item.system.uses.max).toBeDefined();

      // _stats for Golden Master compliance
      expect(item._stats).toBeDefined();
      if (item._stats) {
        expect(item._stats.systemId).toBe('dnd5e');
      }
    });

    test('consumable reference item has valid golden master structure', () => {
      const referencePath = join(REFERENCES_PATH, 'potion', 'alchemists-fire.json');

      if (existsSync(referencePath)) {
        const content = readFileSync(referencePath, 'utf-8');
        const reference = JSON.parse(content);

        // Verify golden master reference structure
        expect(reference._id).toMatch(/^[a-z0-9]+$/i);
        expect(reference.name).toBe("Alchemist's Fire");
        expect(reference.type).toBe('consumable');
        expect(reference.system).toBeDefined();
        expect(reference.system.uses).toBeDefined();
        expect(reference.system.uses.max).toBe('1');
        expect(reference.system.damage).toBeDefined();
        expect(reference.system.identifier).toBe('alchemists-fire');
        expect(reference._stats).toBeDefined();

        // Verify activities structure for consumables
        expect(reference.system.activities).toBeDefined();
      }
    });
  });

  describe('multi-stage item structure', () => {
    test('generated multi-stage item matches reference structure', async () => {
      const parser = new ItemParser();
      const generator = new ItemGenerator();

      // Three-stage item (Dormant, Awakened, Exalted)
      const content = `
---
layout: item
名称: 三祷之坠
英文名: Jewel of Three Prayers
类型: 奇物
稀有度: 传说
require-attunement: true
---
## 三祷之坠（Jewel of Three Prayers）
*奇物，传说（需同调）*
三祷之坠是一件诀别遗物...

**休眠态（Dormant State）.** 在这个状态下，三祷之坠是一面闪闪发光的黄金圆盘。
在休眠状态下，这件坠饰有着以下属性：
- 当佩戴这件坠饰时，你的护甲等级获得 +1 加值。
- 你可以感知距离你30尺内的所有生物位置。

**觉醒态（Awakened State）.** 当你完成一次短休息并将坠饰置于你的唇边时，坠饰会发出微光。
在觉醒状态下，这件坠饰有着以下属性（此外保留休眠状态下的属性）：
- 你的护甲等级获得 +2 加值（取代 +1）。

**升华态（Exalted State）.** 在升华状态下，三祷之坠完全绽放其力量。
在升华状态下，这件坠饰有着以下属性（此外保留之前状态下的属性）：
- 你的护甲等级获得 +3 加值（取代 +2）。
      `.trim();

      const parsed = parser.parse(content);
      expect(parsed.stages).toBeDefined();
      expect(parsed.stages!.length).toBe(3);

      const item = await generator.generate(parsed);

      // Check required top-level fields
      expect(item._id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.type).toBe('equipment');

      // Check system object
      expect(item.system).toBeDefined();

      // Description with cumulative requirements
      expect(item.system.description).toBeDefined();
      expect(item.system.description.value).toContain('休眠态');

      // Rarity and attunement
      expect(item.system.rarity).toBe('legendary');
      expect(item.system.attunement).toBe('required');

      // Identifier
      expect(item.system.identifier).toBeDefined();

      // _stats for Golden Master compliance
      expect(item._stats).toBeDefined();
      if (item._stats) {
        expect(item._stats.systemId).toBe('dnd5e');
      }
    });

    test('stages are properly parsed from multi-stage item', () => {
      const parser = new ItemParser();

      const content = `
---
layout: item
名称: 三祷之坠
英文名: Jewel of Three Prayers
类型: 奇物
稀有度: 传说
require-attunement: true
---
## 三祷之坠（Jewel of Three Prayers）
*奇物，传说（需同调）*
三祷之坠是一件诀别遗物...

**休眠态（Dormant State）.** 在这个状态下，三祷之坠是一面闪闪发光的黄金圆盘。
在休眠状态下，这件坠饰有着以下属性：
- 当佩戴这件坠饰时，你的护甲等级获得 +1 加值。

**觉醒态（Awakened State）.** 当你完成一次短休息并将坠饰置于你的唇边时，坠饰会发出微光。
在觉醒状态下，这件坠饰有着以下属性（此外保留休眠状态下的属性）：
- 你的护甲等级获得 +2 加值（取代 +1）。
      `.trim();

      const parsed = parser.parse(content);

      // Verify stage parsing
      expect(parsed.stages).toBeDefined();
      const stages = parsed.stages!;
      expect(stages.length).toBe(2);

      const stage0 = stages[0];
      const stage1 = stages[1];
      expect(stage0?.name).toBe('休眠态');
      expect(stage0?.requirements).toEqual([
        '当佩戴这件坠饰时，你的护甲等级获得 +1 加值。',
      ]);

      expect(stage1?.name).toBe('觉醒态');
      expect(stage1?.requirements).toEqual([
        '你的护甲等级获得 +2 加值（取代 +1）。',
      ]);
    });
  });

  describe('reference items directory structure', () => {
    test('all item type directories exist in references', () => {
      const itemTypes = ['equipment', 'weapon', 'potion', 'armor', 'wand', 'rod', 'tool', 'ammunition', 'container', 'loot'];

      for (const itemType of itemTypes) {
        const dirPath = join(REFERENCES_PATH, itemType);
        // Directory may or may not exist, but if it does, it should have JSON files
        if (existsSync(dirPath)) {
          const files = readdirSync(dirPath).filter((f: string) => f.endsWith('.json'));
          expect(files.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

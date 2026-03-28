import { describe, expect, it } from 'bun:test';
import { ActorGenerator } from '../../../src/core/generator/actor';
import type { StructuredActionData } from '../../../src/core/models/action';

describe('appendStructuredActionItems', () => {
  function createMinimalParsedNPC(structuredActions: any): any {
    return {
      name: 'Test NPC',
      type: 'npc',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      attributes: {
        hp: { value: 10, max: 10 },
        ac: { value: 10, calc: 'flat' as const },
        movement: {},
        init: 0,
        prof: 0,
      },
      details: { cr: 0, xp: { value: 0 }, biography: { value: '' } },
      traits: {
        dr: { value: [] },
        di: { value: [] },
        ci: { value: [] },
        languages: [],
        senses: {},
      },
      items: [],
      structuredActions,
    };
  }

  function getActivities(item: any): any[] {
    return Object.values(item.system?.activities ?? {});
  }

  describe('utility action generation', () => {
    it('generates utility action item from structured data', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '探测心灵感应',
          englishName: 'Probing Telepathy',
          type: 'utility',
          activation: { type: 'special' },
          describe: '若一个生物通过心灵感应与底栖魔鱼交流，且底栖魔鱼能看见该生物，底栖魔鱼即可获知该生物最深层的渴望。',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      expect(items.length).toBeGreaterThan(0);
      const item = items.find((i: any) => i.name.includes('探测心灵感应'));
      expect(item).toBeDefined();
      expect(item.type).toBe('feat');
      expect(item.system.activation?.type).toBe('');
      const activities = getActivities(item);
      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0]?.type).toBe('utility');
    });

    it('generates multiple utility actions in the same section', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '特性一',
          englishName: 'Feature One',
          type: 'utility',
          describe: '第一个特性',
        },
        {
          name: '特性二',
          englishName: 'Feature Two',
          type: 'utility',
          describe: '第二个特性',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      expect(items.filter((i: any) => i.name.includes('特性一') || i.name.includes('Feature One'))).toHaveLength(1);
      expect(items.filter((i: any) => i.name.includes('特性二') || i.name.includes('Feature Two'))).toHaveLength(1);
    });
  });

  describe('attack action generation', () => {
    it('generates attack action item without target', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '啮咬',
          englishName: 'Bite',
          type: 'attack',
          attackType: 'mwak',
          toHit: 14,
          range: '触及10尺',
          damage: [{ formula: '2d10+8', type: '穿刺' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('啮咬'));

      expect(item).toBeDefined();
      expect(item.type).toBe('feat');
      expect(item.system.activation?.type).toBe('action');

      const activities = getActivities(item);
      const attackActivity = activities.find((a: any) => a.type === 'attack');
      expect(attackActivity).toBeDefined();
      expect(attackActivity.attack?.type?.value).toBe('mwak');
    });

    it('generates ranged attack action', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '远程攻击',
          englishName: 'Ranged Attack',
          type: 'attack',
          attackType: 'rwak',
          toHit: 12,
          range: '120尺',
          damage: [{ formula: '8d6', type: '火焰' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('远程攻击'));

      expect(item).toBeDefined();
      const activities = getActivities(item);
      const attackActivity = activities.find((a: any) => a.type === 'attack');
      expect(attackActivity.attack?.type?.value).toBe('rwak');
    });
  });

  describe('save action generation', () => {
    it('generates save action item without target', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '魔法火焰',
          englishName: 'Magical Fire',
          type: 'save',
          DC: 15,
          ability: 'dex',
          describe: '躲避魔法火焰',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('魔法火焰'));

      expect(item).toBeDefined();
      const activities = getActivities(item);
      const saveActivity = activities.find((a: any) => a.type === 'save');
      expect(saveActivity).toBeDefined();
      expect(saveActivity.save?.dc?.value).toBe(15);
    });

    it('generates save action with recharge', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '重击',
          englishName: 'Heavy Hit',
          type: 'save',
          DC: 17,
          ability: 'str',
          recharge: [5, 6],
          describe: '强力重击',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('重击'));

      expect(item).toBeDefined();
      expect(item.system.uses?.per).toBe('recharge');
    });
  });

  describe('legendary action generation', () => {
    it('generates legendary action items with legendary activation type', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '精神迷雾',
          englishName: 'Mental Fog',
          type: 'save',
          activation: { type: 'legendary', condition: '消耗 2 动作' },
          DC: 17,
          ability: 'int',
          describe: '产生精神迷雾',
        },
        {
          name: '魂缚互换',
          englishName: 'Soulbound Swap',
          type: 'utility',
          activation: { type: 'legendary' },
          describe: '底栖魔鱼和至多一个被其魅惑的生物进行传送，互换位置。',
        },
      ];

      const parsed = createMinimalParsedNPC({
        传奇动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      const mentalFog = items.find((i: any) => i.name.includes('精神迷雾'));
      expect(mentalFog).toBeDefined();
      expect(mentalFog.system.activation?.type).toBe('legendary');

      const soulbound = items.find((i: any) => i.name.includes('魂缚互换'));
      expect(soulbound).toBeDefined();
      expect(soulbound.system.activation?.type).toBe('legendary');
    });
  });

  describe('section mapping', () => {
    it('maps 特性 section to passive activation', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '被动特性',
          englishName: 'Passive Feature',
          type: 'utility',
          describe: '被动能力',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('被动特性'));

      expect(item).toBeDefined();
      expect(item.system.activation?.type).toBe('');
    });

    it('maps 附赠动作 section to bonus activation', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '快速打击',
          englishName: 'Quick Strike',
          type: 'attack',
          attackType: 'mwak',
          toHit: 8,
          range: '触及5尺',
          damage: [{ formula: '1d6+4', type: '挥砍' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        附赠动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('快速打击'));

      expect(item).toBeDefined();
      expect(item.system.activation?.type).toBe('bonus');
    });

    it('maps 反应 section to reaction activation', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '借机攻击',
          englishName: 'Opportunity Attack',
          type: 'attack',
          attackType: 'mwak',
          toHit: 10,
          range: '触及10尺',
          damage: [{ formula: '2d6+5', type: '钝击' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        反应: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('借机攻击'));

      expect(item).toBeDefined();
      expect(item.system.activation?.type).toBe('reaction');
    });
  });

  describe('perLongRest and concentration', () => {
    it('sets per-long-rest uses on items', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '特殊能力',
          englishName: 'Special Ability',
          type: 'utility',
          activation: { type: 'special', condition: '3次/日' },
          perLongRest: 3,
          describe: '每日三次的能力',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('特殊能力'));

      expect(item).toBeDefined();
      expect(item.system.uses).toEqual(
        expect.objectContaining({
          value: 3,
          max: 3,
        }),
      );
    });

    it('sets concentration flag on items', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '专注法术',
          englishName: 'Concentration Spell',
          type: 'utility',
          concentration: true,
          describe: '需要专注的法术',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('专注法术'));

      expect(item).toBeDefined();
      expect(item.system.concentration).toBe(true);
    });
  });

  describe('english name preservation', () => {
    it('preserves english name in structured action data', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '探测心灵感应',
          englishName: 'Probing Telepathy',
          type: 'utility',
          describe: '描述文字',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('探测心灵感应'));

      expect(item).toBeDefined();
      expect(item.name).toContain('探测心灵感应');
    });
  });
});
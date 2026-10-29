import { describe, expect, test } from 'bun:test';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { convertMarkdownContentToJson } from '../../../src/core/workflow/singleFileConversion';
import { buildValidLurkerIr } from '../../../src/core/intake/__tests__/fixtures/lurker';

describe('structured action source sections', () => {
  for (const fvttVersion of ['12', '13', '14'] as const) {
    test(`retains separately parsed lair actions with structured actions on v${fvttVersion}`, async () => {
      const content = `---
名称: Mixed Sections Fixture
类型: npc
力量: 10
敏捷: 10
体质: 10
智力: 10
感知: 10
魅力: 10
护甲等级: 10
生命值: 10
挑战等级: 0
动作:
  - 名称: Ordinary Action
    类型: utility
    描述: An ordinary action.
巢穴动作:
  - 'Local Pulse. On initiative count 20, each creature makes a DC 13 Dexterity saving throw. On a failed save it takes 2d6 fire damage. On a successful save it takes half damage.'
---`;
      const result = await convertMarkdownContentToJson({ content, fvttVersion, effectProfile: 'core', translationService: null });
      const actor = result.rawJson as any;
      expect(actor).toMatchObject({
        name: 'Mixed Sections Fixture',
        type: 'npc',
        _stats: { systemVersion: fvttVersion === '14' ? '5.3.3' : '4.3.9' },
        system: { resources: { lair: { value: true, initiative: 20 } } },
      });
      expect(actor.items).toHaveLength(2);
      const lair = actor.items.find((item: any) => item.name === 'Local Pulse');
      const ordinary = actor.items.find((item: any) => item.name === 'Ordinary Action');
      expect(lair).toMatchObject({ type: 'feat', system: { type: { subtype: 'lair' } } });
      expect(Object.values(lair.system.activities)).toMatchObject([{ type: 'save', activation: { type: 'lair' }, save: { ability: ['dex'] }, damage: { onSave: 'half', parts: [{ number: 2, denomination: 6, types: ['fire'] }] } }]);
      expect(Object.values(ordinary.system.activities)).toMatchObject([{ type: 'utility', activation: { type: 'action' } }]);

      // A source without a lair section must retain its complete existing Item graph.
      const noLair = content.replace(/巢穴动作:[\s\S]*?\n---$/, '---');
      const withoutLair = await convertMarkdownContentToJson({ content: noLair, fvttVersion, effectProfile: 'core', translationService: null });
      const unrelated = withoutLair.rawJson as any;
      const stripTimes = (value: any): any => JSON.parse(JSON.stringify(value, (key, entry) => key === 'createdTime' || key === 'modifiedTime' ? undefined : entry));
      expect(unrelated.items).toHaveLength(1);
      expect(stripTimes(unrelated.items[0])).toEqual(stripTimes(ordinary));
    });
  }

  test('keeps source section independent from explicit Activity activation', async () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.traits = [{ name: 'Trait Action', englishName: 'Trait Action', description: 'Trait carrier with an explicit action Activity.', activityType: 'utility', activationType: 'action' }];
    ir.creature.actions = [
      { name: 'Turn Start Pulse', englishName: 'Turn Start Pulse', description: 'At the creature\'s turn start, each target makes a DC 13 Dexterity saving throw. On a failure it takes 2d6 piercing damage. On a success it takes no damage.', activityType: 'save', activationType: 'special', save: { dc: 13, ability: 'dex' }, damage: [{ formula: '2d6', type: 'piercing', relationship: 'base' }] },
      { name: 'Ordinary Action', englishName: 'Ordinary Action', description: 'An ordinary action.', activityType: 'utility', activationType: 'action' },
    ];
    ir.creature.bonusActions = [{ name: 'Bonus Carrier', englishName: 'Bonus Carrier', description: 'A bonus action.', activityType: 'utility', activationType: 'bonus' }];
    ir.creature.reactions = [{ name: 'Reaction Carrier', englishName: 'Reaction Carrier', description: 'A reaction.', activityType: 'utility', activationType: 'reaction' }];
    ir.creature.legendaryActions = [{ name: 'Legendary Carrier', englishName: 'Legendary Carrier', description: 'A legendary action.', activityType: 'utility', activationType: 'legendary', legendaryCost: 1 }];
    const result = await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(ir), fvttVersion: '14', effectProfile: 'core', translationService: null });
    const items = (result.rawJson as any).items as any[];
    const item = (name: string) => items.find((entry) => entry.name.includes(name));
    const section = (name: string) => item(name).flags['tidy5e-sheet'];
    const activity = (name: string) => Object.values(item(name).system.activities)[0] as any;

    expect(activity('Turn Start Pulse').activation.type).toBe('special');
    expect(section('Turn Start Pulse')).toMatchObject({ section: '动作', actionSection: '动作' });
    expect(activity('Trait Action').activation.type).toBe('action');
    expect(section('Trait Action')).toMatchObject({ section: '特性', actionSection: '特性' });
    expect(section('Ordinary Action')).toMatchObject({ section: '动作', actionSection: '动作' });
    expect(section('Bonus Carrier')).toMatchObject({ section: '附赠动作', actionSection: '附赠动作' });
    expect(section('Reaction Carrier')).toMatchObject({ section: '反应', actionSection: '反应' });
    expect(section('Legendary Carrier')).toMatchObject({ section: 'Legendary Actions', actionSection: 'Legendary Actions' });
  });
});

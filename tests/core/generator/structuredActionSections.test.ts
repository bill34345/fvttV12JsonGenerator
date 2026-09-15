import { describe, expect, test } from 'bun:test';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { convertMarkdownContentToJson } from '../../../src/core/workflow/singleFileConversion';
import { buildValidLurkerIr } from '../../../src/core/intake/__tests__/fixtures/lurker';

describe('structured action source sections', () => {
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

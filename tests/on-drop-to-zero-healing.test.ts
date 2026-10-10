import { describe, expect, test } from 'bun:test';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';

const options = { fvttVersion: '14' as const, effectProfile: 'core' as const, translationService: null };

async function generateFixture(path: string): Promise<any> {
  const content = await Bun.file(path).text();
  return (await convertMarkdownContentToJson({ ...options, content })).rawJson;
}

function itemByName(actor: any, name: string): any {
  const matches = actor.items.filter((item: any) => item.name === name);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('source-bound drop-to-zero healing metadata', () => {
  test('projects explicit English and Chinese recovery using the recovery formula, not prior damage', async () => {
    const actor = await generateFixture('tests/fixtures/on-drop-to-zero-healing.md');
    expect(actor.name).toBe('Drop-to-zero healing regression creature');
    expect(actor.type).toBe('npc');
    expect(Array.isArray(actor.items)).toBe(true);
    expect(actor.items.map((item: any) => item.name)).toEqual([
      'Arcane Bite', '寒潮摄取', 'Final Blow', 'Bilebrine', 'Mortal Blade',
      'Shade Caller', 'Delayed Recovery', 'Later Recovery', 'No Recovery', 'Postponed Healing',
    ]);

    for (const [name, formula, damageNumber, damageDie] of [
      ['Arcane Bite', '3d6', 2, 6],
      ['寒潮摄取', '2d6', 4, 6],
      ['Final Blow', '1d12', 1, 8],
    ] as const) {
      const item = itemByName(actor, name);
      expect(item.flags.fvttJsonGenerator.rules.onDropToZero).toEqual({
        healFormula: formula,
        maintainWithoutConcentration: false,
      });
      const activities = Object.values(item.system.activities) as any[];
      expect(activities).toHaveLength(1);
      expect(activities[0].damage.parts[0]).toMatchObject({ number: damageNumber, denomination: damageDie });
      expect(activities[0]._id).toBe(Object.keys(item.system.activities)[0]);
    }
  });

  test('leaves disease, death, summoning, later-turn recovery, and negated healing without a heal rule', async () => {
    const actor = await generateFixture('tests/fixtures/on-drop-to-zero-healing.md');
    for (const name of ['Bilebrine', 'Mortal Blade', 'Shade Caller', 'Delayed Recovery', 'Later Recovery', 'No Recovery', 'Postponed Healing']) {
      const item = itemByName(actor, name);
      expect(item.flags?.fvttJsonGenerator?.rules?.onDropToZero).toBeUndefined();
      expect(Object.values(item.system.activities)).toHaveLength(1);
    }
    const bilebrine = itemByName(actor, 'Bilebrine');
    const activity = Object.values(bilebrine.system.activities)[0] as any;
    expect(activity).toMatchObject({
      type: 'save',
      damage: { parts: [
        expect.objectContaining({ number: 5, denomination: 8, types: ['acid'] }),
        expect.objectContaining({ number: 5, denomination: 8, types: ['necrotic'] }),
      ] },
    });
  });

  test('preserves an unrelated Actor and its complete save Activity without a drop-to-zero rule', async () => {
    const actor = await generateFixture('tests/fixtures/structured-action-targets/no-target.md');
    expect(actor).toMatchObject({ name: '无目标测试', type: 'npc' });
    const item = itemByName(actor, '无目标脉冲');
    expect(item.flags?.fvttJsonGenerator?.rules?.onDropToZero).toBeUndefined();
    expect(Object.values(item.system.activities)).toHaveLength(1);
    expect(Object.values(item.system.activities)[0]).toMatchObject({
      type: 'save', activation: { type: 'action' },
      save: { ability: ['dex'], dc: { calculation: '', formula: '13' } },
      damage: { onSave: 'none', parts: [expect.objectContaining({ number: 1, denomination: 6, types: ['lightning'] })] },
    });
  });
});

import { describe, expect, test } from 'bun:test';
import { ParserFactory } from '@fvtt-json-generator/parser';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';

const fixtureRoot = 'tests/fixtures';
const damageFixture = `${fixtureRoot}/structured-damage-only.md`;

function actionByName(actor: any, name: string): { item: any; activity: any } {
  const item = actor.items.find((candidate: any) => candidate.name === name || candidate.name.startsWith(`${name} `));
  expect(item).toBeDefined();
  const activities = Object.values(item.system.activities ?? {}) as any[];
  expect(activities).toHaveLength(1);
  return { item, activity: activities[0] };
}

describe('explicit structured damage-only actions', () => {
  test.each(['LF', 'CRLF'] as const)('parses source-declared damage and retains bilingual text with %s', async (lineEnding) => {
    const lfSource = await Bun.file(damageFixture).text();
    const source = lineEnding === 'CRLF' ? lfSource.replace(/\r?\n/g, '\r\n') : lfSource;
    const parsed = new ParserFactory().parse(source);
    const sections = parsed.structuredActions!;

    expect(sections['反应']![0]).toMatchObject({
      name: 'Courage to Dread', type: 'damage', activation: { type: 'reaction' },
      damage: [{ formula: '2d8', type: 'necrotic' }],
    });
    expect(sections['传奇动作']![0]).toMatchObject({
      name: 'Malice Deeps', type: 'damage', activation: { type: 'legendary' },
      damage: [{ formula: '2d8', type: 'cold' }],
    });
    expect(sections['附赠动作']![0]).toMatchObject({
      name: '寒潮', englishName: 'Cold Surge', type: 'damage',
      activation: { type: 'bonus' }, describe: '目标受到 1d6 寒冷伤害。',
      damage: [{ formula: '1d6', type: 'cold' }],
    });
    expect(sections['动作']![0]).toMatchObject({ type: 'attack', damage: [{ formula: '1d6', type: 'slashing' }] });
    expect(sections['动作']![1]).toMatchObject({ type: 'save', DC: 12, damage: [{ formula: '1d4', type: 'cold' }] });
  });

  test('preserves explicit damage beside conflicting utility prose and keeps deferred or missing damage separate', async () => {
    const source = await Bun.file(`${fixtureRoot}/structured-damage-only-near-misses.md`).text();
    const actions = new ParserFactory().parse(source).structuredActions!['动作']!;
    expect(actions.map((action) => action.type)).toEqual(['damage', 'damage', 'damage']);
    expect(actions.map((action) => action.damage)).toEqual([[{formula:'2d8',type:'necrotic'}], undefined, undefined]);
    expect(actions[1]!.sourceDamageParts).toEqual([{formula:'3d6',type:'fire',relationship:'conditional'},{formula:'4d6',type:'lightning',relationship:'replacement'}]);
    expect(actions[0]!.describe).toContain('2d8 necrotic damage');
  });

  test('formal workflow generates complete damage Activities with activation and stable IDs', async () => {
    const source = await Bun.file(damageFixture).text();
    const options = { content: source, fvttVersion: '14' as const, effectProfile: 'core' as const, translationService: null };
    const first = await convertMarkdownContentToJson(options);
    const second = await convertMarkdownContentToJson(options);
    const actor = first.rawJson as any;

    for (const [name, activation, number, denomination, damageType] of [
      ['Courage to Dread', 'reaction', 2, 8, 'necrotic'],
      ['Malice Deeps', 'legendary', 2, 8, 'cold'],
      ['寒潮', 'bonus', 1, 6, 'cold'],
    ] as const) {
      const { item, activity } = actionByName(actor, name);
      const again = actionByName(second.rawJson, name);
      expect(typeof activity._id).toBe('string');
      expect(activity).toMatchObject({
        type: 'damage',
        activation: { type: activation },
        damage: { parts: [expect.objectContaining({ number, denomination, types: [damageType] })] },
      });
      expect(item._id).toBe(again.item._id);
      expect(activity._id).toBe(again.activity._id);
      expect(Object.keys(item.system.activities)).toEqual([activity._id]);
    }
    expect(actionByName(actor, 'Claw').activity).toMatchObject({ type: 'attack', damage: { parts: [expect.objectContaining({ types: ['slashing'] })] } });
    expect(actionByName(actor, 'Frost Save').activity).toMatchObject({ type: 'save', damage: { parts: [expect.objectContaining({ types: ['cold'] })] } });
    expect(first.actorVerification).not.toBeNull();
    expect(first.actorVerification?.sourceIntegrityErrors).toEqual([]);
  });
});

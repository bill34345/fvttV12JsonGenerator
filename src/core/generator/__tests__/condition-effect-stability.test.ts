import { describe, expect, it } from 'bun:test';
import type { ParsedNPC } from '../../../config/mapping';
import { ActorGenerator } from '../actor';
import { ItemGenerator } from '../item-generator';

function makeActorInput(): ParsedNPC {
  return {
    name: 'Condition Effect Stability Probe',
    type: 'npc',
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
    actions: [
      'Frost Bind. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 12 (2d8 + 3) bludgeoning damage, and the target becomes Frozen (DC 14 to escape).',
      'Jinxing Bolt. Ranged Spell Attack: +5 to hit, range 60 ft., one target. Hit: 8 (1d8 + 3) force damage, and the target becomes Jinxed, subtracting `1d6` from its attack rolls and saving throws.',
      'Valor Mark. As an action, choose one willing creature within 30 feet. The target becomes Valor, adding `1d4` to its attack rolls and saving throws.',
      'Jinxing Bolt. Ranged Spell Attack: +5 to hit, range 60 ft., one target. Hit: 8 (1d8 + 3) force damage, and the target becomes Jinxed, subtracting `1d4` from its attack rolls and saving throws.',
      'Plain Strike. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 4 (1d4) slashing damage.',
    ],
  };
}

function makeRepeatedEmbeddedEffectsInput(): ParsedNPC {
  return {
    name: 'Repeated Embedded Effect Probe',
    type: 'npc',
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
    structuredActions: {
      动作: [{
        name: 'Twin Jinx Effect',
        type: 'attack',
        activation: { type: 'action' },
        attackType: 'mwak',
        toHit: 5,
        range: 'reach 5 ft.',
        damage: [{ formula: '1d8 + 3', type: 'slashing' }],
        describe: 'A single attack carries two separately recorded Jinxed effects.',
        embeddedEffects: [
          { type: 'Jinxed', describe: 'The first target becomes Jinxed `1d6`.' },
          { type: 'Jinxed', describe: 'A second target becomes Jinxed `1d4`.' },
        ],
      }],
    },
  };
}

function makeRepeatedStructuredItemInput() {
  const action = {
    name: 'Shared Hex',
    type: 'attack' as const,
    desc: 'The target becomes Jinxed, subtracting `1d6` from its attack rolls and saving throws.',
    attack: {
      type: 'mwak' as const,
      toHit: 5,
      range: 'reach 5 ft.',
      damage: [{ formula: '1d8 + 3', type: 'slashing' }],
    },
  };
  return {
    name: 'Repeated Structured Conditions',
    englishName: 'Repeated Structured Conditions',
    type: 'weapon' as const,
    description: 'Two source entries carry the same condition text in separate action groups.',
    structuredActions: {
      attacks: [structuredClone(action)],
      utilities: [structuredClone(action)],
    },
  };
}

function generatedDocumentShape(actor: any) {
  return actor.items.map((item: any) => ({
    name: item.name,
    type: item.type,
    description: item.system.description,
    activities: item.system.activities,
    effects: item.effects ?? [],
  }));
}

describe('generated condition Effect IDs', () => {
  it('keeps IDs and Activity links stable while preserving distinct states and unrelated Items', () => {
    const generator = new ActorGenerator({ fvttVersion: '14', translationService: null });
    const first = generator.generate(makeActorInput(), { route: 'english' });
    const repeated = generator.generate(makeActorInput(), { route: 'english' });

    expect(generatedDocumentShape(repeated)).toEqual(generatedDocumentShape(first));

    const frozen = first.items.find((item: any) => item.name === 'Frost Bind');
    const jinxed = first.items.filter((item: any) => item.name === 'Jinxing Bolt');
    const valor = first.items.find((item: any) => item.name === 'Valor Mark');
    const plain = first.items.find((item: any) => item.name === 'Plain Strike');
    expect(frozen).toBeDefined();
    expect(jinxed).toHaveLength(2);
    expect(valor).toBeDefined();
    expect(plain).toBeDefined();

    const conditionOf = (item: any) => item.effects[0]?.flags?.['fvtt-custom-conditions']?.condition;
    expect(conditionOf(frozen)).toMatchObject({ conditionId: 'frozen', params: { escapeDC: 14 } });
    expect(conditionOf(jinxed[0])).toMatchObject({ conditionId: 'jinxed', params: { formula: '1d6' } });
    expect(conditionOf(valor)).toMatchObject({ conditionId: 'valor', params: { formula: '1d4' } });
    expect(conditionOf(jinxed[1])).toMatchObject({ conditionId: 'jinxed', params: { formula: '1d4' } });

    expect(jinxed[0]!.effects[0]!.name).toBe(jinxed[1]!.effects[0]!.name);
    expect(jinxed[0]!.effects[0]!._id).not.toBe(jinxed[1]!.effects[0]!._id);
    expect(plain!.effects ?? []).toHaveLength(0);

    for (const item of first.items) {
      const effects = item.effects ?? [];
      const effectIds = effects.map((effect: any) => effect._id);
      expect(new Set(effectIds).size).toBe(effectIds.length);
      for (const id of effectIds) expect(id).toMatch(/^[a-f0-9]{16}$/u);

      for (const [key, activity] of Object.entries(item.system.activities ?? {}) as Array<[string, any]>) {
        expect(activity._id).toBe(key);
        for (const link of activity.effects ?? []) expect(effectIds).toContain(link._id);
      }
    }
  });

  it('keeps same-name repeated condition Effects separate on one generated Item', () => {
    const generator = new ActorGenerator({ fvttVersion: '14', translationService: null });
    const first = generator.generate(makeRepeatedEmbeddedEffectsInput(), { route: 'english' });
    const repeated = generator.generate(makeRepeatedEmbeddedEffectsInput(), { route: 'english' });
    const item = first.items.find((entry: any) => entry.name === 'Twin Jinx Effect');
    const repeatedItem = repeated.items.find((entry: any) => entry.name === 'Twin Jinx Effect');

    expect(generatedDocumentShape(repeated)).toEqual(generatedDocumentShape(first));
    expect(item).toBeDefined();
    expect(item!.effects).toHaveLength(2);
    expect(item!.effects[0]!.name).toBe(item!.effects[1]!.name);
    expect(new Set(item!.effects.map((effect: any) => effect._id)).size).toBe(2);
    expect(item!.effects.map((effect: any) => effect.flags?.['fvtt-custom-conditions']?.condition?.params?.formula).sort())
      .toEqual(['1d4', '1d6']);
    expect(item!.system.activities).toEqual(repeatedItem!.system.activities);

    const activity = Object.values(item!.system.activities)[0] as any;
    expect(activity.effects.map((effect: any) => effect._id).sort())
      .toEqual(item!.effects.map((effect: any) => effect._id).sort());
  });

  it('uses ItemGenerator logical paths to separate identical source actions in one Item', async () => {
    const generator = new ItemGenerator({ fvttVersion: '14' });
    const first = await generator.generate(makeRepeatedStructuredItemInput());
    const repeated = await generator.generate(makeRepeatedStructuredItemInput());
    const effectProjection = (item: any) => ({
      activities: item.system.activities,
      effects: item.effects.map(({ origin: _origin, ...effect }: any) => effect),
    });

    expect(effectProjection(repeated)).toEqual(effectProjection(first));
    expect(Object.keys(first.system.activities)).toHaveLength(2);
    expect(first.effects).toHaveLength(2);
    const effects = first.effects;
    if (!effects) throw new Error('Expected generated condition effects');
    const effectIds = effects.map((effect: any) => effect._id);
    expect(new Set(effectIds).size).toBe(2);
    for (const id of effectIds) expect(id).toMatch(/^[a-f0-9]{16}$/u);
    for (const effect of effects) {
      expect(effect.name).toBe('Jinxed');
      expect(effect.flags?.['fvtt-custom-conditions']?.condition?.params).toEqual({ formula: '1d6' });
    }

    const linkedIds = Object.values(first.system.activities).flatMap((activity: any) =>
      (activity.effects ?? []).map((effect: any) => effect._id));
    expect(linkedIds.sort()).toEqual(effectIds.sort());
  });
});

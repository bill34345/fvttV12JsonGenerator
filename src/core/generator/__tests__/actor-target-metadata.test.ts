import { describe, expect, it } from 'bun:test';
import { assertEqualStructure } from '../../utils/assertEqualStructure';
import { applyActorTargetMetadata, normalizeTargetUses } from '../actor-target-metadata';

function createActor(): any {
  return {
    name: 'Metadata Control',
    custom: { keep: true },
    _stats: { old: 'actor' },
    effects: [{ name: 'Actor Effect', _stats: { old: 'actor-effect' } }],
    items: [
      {
        name: 'Control Item',
        custom: { keep: 'item' },
        _stats: { old: 'item' },
        effects: [{ name: 'Item Effect', _stats: { old: 'item-effect' } }],
        system: {
          activation: { type: 'reaction' },
          uses: {
            value: 2,
            max: 2,
            per: 'day',
            spent: 0,
            recovery: [{ period: 'day', type: 'recoverAll' }],
          },
          activities: {
            control: {
              custom: { keep: 'activity' },
              uses: { value: 1, max: 1, per: 'day', spent: 0, recovery: [] },
            },
          },
        },
      },
    ],
  };
}

describe('actor target metadata', () => {
  it('stamps v12 documents and removes legacy Item activation/uses fields', () => {
    const actor = createActor();
    applyActorTargetMetadata(actor, '12');

    expect(actor._stats).toEqual(expect.objectContaining({
      old: 'actor',
      coreVersion: '12.331',
      systemId: 'dnd5e',
      systemVersion: '4.3.9',
    }));
    expect(actor.effects[0]._stats.coreVersion).toBe('12.331');
    expect(actor.items[0]._stats.systemVersion).toBe('4.3.9');
    expect(actor.items[0].effects[0]._stats.systemVersion).toBe('4.3.9');
    expect(actor.items[0].system.activation).toBeUndefined();
    expect(actor.items[0].system.uses).toEqual({
      max: '2',
      spent: 0,
      recovery: [{ period: 'day', type: 'recoverAll' }],
    });
    expect(actor.items[0].system.activities.control.uses).toEqual({
      max: '1',
      spent: 0,
      recovery: [],
    });
  });

  it('normalizes v14 Item and Activity uses without changing unrelated structure', () => {
    const actor = createActor();
    applyActorTargetMetadata(actor, '14');

    expect(actor._stats).toEqual(expect.objectContaining({
      old: 'actor',
      coreVersion: '14.361',
      systemId: 'dnd5e',
      systemVersion: '5.3.3',
    }));
    expect(actor.effects[0]._stats.systemVersion).toBe('5.3.3');
    expect(actor.items[0]._stats.coreVersion).toBe('14.361');
    expect(actor.items[0].effects[0]._stats.systemVersion).toBe('5.3.3');
    expect(actor.items[0].system.activation).toBeUndefined();
    expect(actor.items[0].system.uses).toEqual({
      max: '2',
      spent: 0,
      recovery: [{ period: 'day', type: 'recoverAll' }],
    });
    expect(actor.items[0].system.activities.control.uses).toEqual({
      max: '1',
      spent: 0,
      recovery: [],
    });
    assertEqualStructure(
      {
        actorName: actor.name,
        actorCustom: actor.custom,
        itemName: actor.items[0].name,
        itemCustom: actor.items[0].custom,
        activityCustom: actor.items[0].system.activities.control.custom,
      },
      {
        actorName: 'Metadata Control',
        actorCustom: { keep: true },
        itemName: 'Control Item',
        itemCustom: { keep: 'item' },
        activityCustom: { keep: 'activity' },
      },
    );
  });

  it('clones v14 uses before removing legacy fields', () => {
    const original = { value: 1, max: 3, per: 'lr', spent: 1, recovery: [] };
    const normalized = normalizeTargetUses(original, '14');

    expect(normalized).toEqual({ max: '3', spent: 1, recovery: [] });
    expect(original).toEqual({ value: 1, max: 3, per: 'lr', spent: 1, recovery: [] });
  });
});

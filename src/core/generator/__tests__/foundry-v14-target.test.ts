import { describe, expect, it } from 'bun:test';
import { ActorGenerator } from '../actor';
import { ActivityGenerator } from '../activity';
import { ItemGenerator } from '../item-generator';
import { assertEqualStructure } from '../../utils/assertEqualStructure';
import { ActorValidator } from '../validator';
import type { ParsedNPC } from '../../../config/mapping';

describe('Foundry v14 generator target', () => {
  it('emits v14 actor stats, resource counters, and senses schema', () => {
    const input: ParsedNPC = {
      name: 'V14 Guardian',
      type: 'npc',
      abilities: {},
      attributes: {
        legact: { value: 2, max: 3 },
      },
      details: {},
      traits: {
        senses: {
          darkvision: 60,
          blindsight: 10,
          special: 'sees invisible creatures',
        },
      },
      skills: {},
      saves: [],
      items: [],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(input);

    expect(actor._stats.coreVersion).toBe('14.364');
    expect(actor._stats.systemVersion).toBe('5.3.3');
    expect(actor.system.resources.legact).toEqual(expect.objectContaining({ max: 3, spent: 1 }));
    expect(actor.system.resources.legact.value).toBeUndefined();
    expect(actor.system.attributes.senses.ranges).toEqual(expect.objectContaining({
      darkvision: 60,
      blindsight: 10,
      tremorsense: 0,
      truesight: 0,
    }));
    expect(actor.system.attributes.senses.darkvision).toBeUndefined();
    expect(actor.system.attributes.senses.special).toBe('sees invisible creatures');
  });

  it('keeps the existing v12 resource and senses schema by default', () => {
    const actor = new ActorGenerator().generate({
      name: 'V12 Guardian',
      type: 'npc',
      abilities: {},
      attributes: {
        legact: { value: 2, max: 3 },
      },
      details: {},
      traits: {
        senses: { darkvision: 60 },
      },
      skills: {},
      saves: [],
      items: [],
    });

    expect(actor._stats.coreVersion).toBe('12.331');
    expect(actor._stats.systemVersion).toBe('4.3.9');
    expect(actor.system.resources.legact).toEqual(expect.objectContaining({ value: 2, max: 3 }));
    expect(actor.system.attributes.senses.darkvision).toBe(60);
    expect(actor.system.attributes.senses.ranges).toBeUndefined();
  });

  it('emits v14 save activity source without legacy dc.value', () => {
    const generator = new ActivityGenerator({ fvttVersion: '14' });
    const activities = generator.generate({
      name: 'Radiant Burst',
      type: 'save',
      save: { dc: 15, ability: 'dex', outcome: 'half', onSave: 'half damage' },
      damage: [{ formula: '4d6', type: 'radiant' }],
    });
    const activity = activities[Object.keys(activities)[0]!];

    expect(activity.save.dc).toEqual({
      calculation: '',
      formula: '15',
    });
    expect(activity.damage.onSave).toBe('half');
    expect(activity.damage.parts[0].number).toBe(4);
    expect(activity.damage.parts[0].denomination).toBe(6);
  });

  it('uses v14 item stats and removes derived attuned source field', async () => {
    const item = await new ItemGenerator({ fvttVersion: '14' }).generate({
      name: 'Test Armor',
      englishName: 'Test Armor',
      type: 'equipment',
      rarity: 'rare',
      attunement: 'required',
      description: 'Armor generated for v14.',
    });

    expect(item._stats?.coreVersion).toBe('14.364');
    expect(item._stats?.systemVersion).toBe('5.3.3');
    expect(item.system.attunement).toBe('required');
    expect(item.system.attuned).toBeUndefined();
  });

  it('uses bundled minimal templates for every supported v14 item route', async () => {
    const cases = [
      ['weapon', 'weapon'],
      ['equipment', 'equipment'],
      ['consumable', 'consumable'],
      ['loot', 'loot'],
      ['tool', 'tool'],
      ['ammunition', 'consumable'],
      ['armor', 'equipment'],
      ['rod', 'equipment'],
      ['wand', 'equipment'],
      ['staff', 'weapon'],
      ['container', 'container'],
    ] as const;

    for (const [sourceType, foundryType] of cases) {
      const item = await new ItemGenerator({ fvttVersion: '14' }).generate({
        name: `Test ${sourceType}`,
        type: sourceType,
        description: `Source-derived ${sourceType} fixture.`,
      });

      expect(item.type).toBe(foundryType);
      expect(item.system.description.value).toContain(sourceType);
      expect(item._stats?.systemVersion).toBe('5.3.3');
    }
  });

  it('keeps a schema-complete neutral v14 equipment structure without reference-item mechanics', async () => {
    const generated = await new ItemGenerator({ fvttVersion: '14' }).generate({
      name: 'Amulet of Health',
      type: 'equipment',
      description: 'Representative structure check.',
    });

    const neutralEquipmentContract = {
      _id: 'contract-id',
      name: 'Contract Item',
      type: 'equipment',
      img: 'icons/svg/item-bag.svg',
      system: {
        description: { value: '', chat: '' },
        source: { custom: '', book: '', page: '', license: '', rules: '' },
        quantity: 1,
        weight: { value: 0, units: 'lb' },
        price: { value: 0, denomination: 'gp' },
        attunement: 'none',
        equipped: false,
        rarity: 'common',
        identified: true,
        cover: null,
        uses: { max: '', spent: 0, recovery: [] },
        activities: {},
        identifier: 'contract-item',
        properties: ['mgc'],
        container: null,
        unidentified: { description: '' },
        armor: { value: null, dex: null, magicalBonus: null },
        type: { value: 'trinket', baseItem: '' },
      },
      effects: [],
      flags: { fvttJsonGenerator: { effectHints: {} } },
      _stats: {
        duplicateSource: null,
        coreVersion: '14.364',
        systemId: 'dnd5e',
        systemVersion: '5.3.3',
        createdTime: 0,
        modifiedTime: 0,
      },
    };

    assertEqualStructure(generated, neutralEquipmentContract, { mode: 'shape' });
    expect(generated.img).toBe('icons/svg/item-bag.svg');
    expect(generated.system.armor).toEqual({ value: null, dex: null, magicalBonus: null });
    expect(generated.system.type).toEqual({ value: 'trinket', baseItem: '' });
    expect(generated.system.properties).toEqual(['mgc']);
    expect(generated.effects).toEqual([]);
  });

  it('omits user-specific lastModifiedBy metadata from portable v14 Item JSON', async () => {
    const generated = await new ItemGenerator({ fvttVersion: '14' }).generate({
      name: 'Portable Shield',
      type: 'equipment',
      description: 'Portable import metadata regression.',
    });

    expect(generated._stats).not.toHaveProperty('lastModifiedBy');
  });

  it('targets the canonical v14 Item AC bonus in system changes', () => {
    const effect = new ActivityGenerator({ fvttVersion: '14' }).generatePassiveEffect({
      name: 'Natural Guard',
      type: 'effect',
      passiveEffect: {
        type: 'acBonus',
        value: 2,
        description: 'The creature gains +2 AC.',
      },
    });

    expect(effect?.changes).toBeUndefined();
    expect(effect?.type).toBe('base');
    expect(effect?.system.changes[0]).toEqual(expect.objectContaining({
      key: 'system.attributes.ac.bonus',
      type: 'add',
      phase: 'initial',
      value: 2,
      priority: null,
    }));
    expect(effect?._stats.coreVersion).toBe('14.364');
    expect(effect?._stats.systemVersion).toBe('5.3.3');
  });

  it('emits v14 spell preparation fields for legacy spell fallback items', () => {
    const actor = new ActorGenerator({ fvttVersion: '14' }).generate({
      name: 'Fallback Spellcaster',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: ['Cantrips (at will): homebrew spark'],
    });

    const spell = actor.items.find((item: any) => item.name === 'homebrew spark');
    expect(spell?.type).toBe('spell');
    expect(spell?.system.preparation).toBeUndefined();
    expect(spell?.system.method).toBe('innate');
    expect(spell?.system.prepared).toBe(1);
  });

  it('normalizes v14 embedded item metadata and removes item-level activation', () => {
    const actor = new ActorGenerator({ fvttVersion: '14' }).generate({
      name: 'Bite Actor',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['Bite [Melee Weapon Attack]: +5 hit, 5 ft, 1d8+3 piercing'],
    });

    const item = actor.items.find((candidate: any) => candidate.type === 'weapon');
    const activityId = item ? Object.keys(item.system.activities)[0] : undefined;
    const activity = activityId ? item?.system.activities[activityId] : undefined;

    expect(item?._stats.coreVersion).toBe('14.364');
    expect(item?._stats.systemVersion).toBe('5.3.3');
    expect(item?.system.activation).toBeUndefined();
    expect(activity.activation).toEqual(expect.objectContaining({ type: 'action', value: null }));
  });

  it('validator accepts v14 senses.ranges as target schema, not leaked senses', () => {
    const parsed: ParsedNPC = {
      name: 'Sensed Actor',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: { senses: { darkvision: 60 } },
      skills: {},
      saves: [],
      items: [],
    };
    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed);

    expect(new ActorValidator().validate(parsed, actor)).not.toContain(
      "Potential Leakage: Found unexpected sense 'ranges: [object Object]'",
    );
  });

  it('does not turn grappled target prerequisites into v14 grapple effects', () => {
    const actor = new ActorGenerator({ fvttVersion: '14' }).generate({
      name: 'Prerequisite Actor',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Mind Delve: One grappled creature must make a DC 14 Intelligence saving throw. On a failure, attacks against the target score a critical hit on a roll of 15-20 until the end of the next turn.',
      ],
    }, { route: 'english' });

    const item = actor.items.find((candidate: any) => candidate.name === 'Mind Delve');
    const statuses = (item?.effects ?? []).flatMap((effect: any) => effect.statuses ?? []);

    expect(statuses).not.toContain('grappled');
  });
});

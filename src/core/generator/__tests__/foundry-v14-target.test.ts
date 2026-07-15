import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
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

    expect(actor._stats.coreVersion).toBe('14.361');
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
      save: { dc: 15, ability: 'dex', onFail: 'half' },
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

    expect(item._stats?.coreVersion).toBe('14.361');
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

  it('keeps the representative v14 equipment template structure', async () => {
    const template = loadYaml(readFileSync(join(
      process.cwd(),
      'references/item-templates/dnd5e-5.3.3/items/equipment/amulet-of-health.yml',
    ), 'utf8')) as Record<string, any>;
    delete template.system.attuned;
    const generated = await new ItemGenerator({ fvttVersion: '14' }).generate({
      name: 'Amulet of Health',
      type: 'equipment',
      description: 'Representative structure check.',
    });

    assertEqualStructure(generated, template, { mode: 'shape' });
  });

  it('targets v14 AC formula instead of legacy AC bonus path', () => {
    const effect = new ActivityGenerator({ fvttVersion: '14' }).generatePassiveEffect({
      name: 'Natural Guard',
      type: 'effect',
      passiveEffect: {
        type: 'acBonus',
        value: 2,
        description: 'The creature gains +2 AC.',
      },
    });

    expect(effect?.changes[0]).toEqual(expect.objectContaining({
      key: 'system.attributes.ac.formula',
      value: '+2',
    }));
    expect(effect?._stats.coreVersion).toBe('14.361');
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

    expect(item?._stats.coreVersion).toBe('14.361');
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

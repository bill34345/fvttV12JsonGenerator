import { describe, it, expect } from 'bun:test';
import { ActorGenerator } from '../actor';
import type { ParsedNPC } from '../../../config/mapping';

describe('ActorGenerator', () => {
  const generator = new ActorGenerator();

  it('should generate basic actor from parsed data', () => {
    const input: ParsedNPC = {
      name: 'Dragon',
      type: 'npc',
      abilities: { str: 20 },
      attributes: { hp: { value: 100, max: 100 } },
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Bite [Melee Weapon Attack]: +10 hit, 10 ft, 2d10+5 piercing'
      ]
    };
    
    const actor = generator.generate(input);
    expect(actor.name).toBe('Dragon');
    expect(actor.system.abilities.str.value).toBe(20);
    expect(actor.items.length).toBe(1);
    expect(actor.items[0].name).toBe('Bite');
    expect(actor.items[0].type).toBe('weapon');
    
    // Check activity
    const activities = actor.items[0].system.activities;
    const id = Object.keys(activities)[0];
    expect(id).toBeDefined();
    if (!id) {
      throw new Error('Expected generated activity id');
    }
    expect(activities[id].attack.bonus).toBe('10');
  });

  it('uses english action parsing for bestiary attack lines', () => {
    const input: ParsedNPC = {
      name: 'Adult Red Dragon',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.',
      ],
    };

    const actor = generator.generate(input);

    expect(actor.items.length).toBe(1);
    expect(actor.items[0].name).toBe('Bite');
    const activities = actor.items[0].system.activities;
    const id = Object.keys(activities)[0];
    expect(id).toBeDefined();
    if (!id) {
      throw new Error('Expected generated activity id');
    }
    expect(activities[id].type).toBe('attack');
    expect(activities[id].damage.parts).toHaveLength(2);
  });

  it('keeps utility fallback item for unstructured english action lines', () => {
    const input: ParsedNPC = {
      name: 'Adult Red Dragon',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['Multiattack. The dragon makes three attacks: one with its bite and two with its claws.'],
    };

    const actor = generator.generate(input);

    expect(actor.items.length).toBe(1);
    expect(actor.items[0].name).toBe('Multiattack');
    expect(actor.items[0].type).toBe('feat');
  });

  it('extracts individual spell names from english spellcasting list lines', () => {
    const input: ParsedNPC = {
      name: 'Pinna',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: [
        'Cantrips (at will): minor illusion, mage hand, dancing lights, fire bolt',
        '1st level (4 slots): color spray, silent image, identify, magic missile',
      ],
    };

    const actor = generator.generate(input);
    const spellItems = actor.items.filter((item: { type: string }) => item.type === 'spell');

    expect(spellItems.length).toBeGreaterThanOrEqual(6);
    expect(spellItems.map((item: { name: string }) => item.name)).toContain('minor illusion');
    expect(spellItems.map((item: { name: string }) => item.name)).toContain('magic missile');
  });

  it('should generate regional effects with localization-aware flags and system fields', () => {
    const input: ParsedNPC = {
      name: 'Dragon',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      regional_effects: [
        'Water: The water is clear.'
      ]
    };

    // Chinese route (default)
    const actorCn = generator.generate(input, { route: 'chinese' });
    const itemCn = actorCn.items.find((i: any) => i.name === 'Water');
    expect(itemCn).toBeDefined();
    expect(itemCn.flags['tidy5e-sheet'].section).toBe('巢穴效应');
    expect(itemCn.system.source.custom).toBe('Imported');
    expect(itemCn.system.activities).toEqual({});

    // English route
    const actorEn = generator.generate(input, { route: 'english' });
    const itemEn = actorEn.items.find((i: any) => i.name === 'Water');
    expect(itemEn).toBeDefined();
    expect(itemEn.flags['tidy5e-sheet'].section).toBe('Regional Effects');
    expect(itemEn.system.source.custom).toBe('Imported');
    expect(itemEn.system.activities).toEqual({});
  });

  it('extracts lair initiative from lair actions description', () => {
    const input: ParsedNPC = {
      name: 'Dragon',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      lair_actions: [
        'On initiative count 20 (losing initiative ties), the dragon takes a lair action to cause one of the following effects; the dragon can’t use the same effect two rounds in a row:',
        'Action 1: ...'
      ],
      lairInitiative: 20
    };

    const actor = generator.generate(input);
    expect(actor.system.resources.lair.value).toBe(true);
    expect(actor.system.resources.lair.initiative).toBe(20);
  });
});

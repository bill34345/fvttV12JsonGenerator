import { describe, it, expect } from 'bun:test';
import { ActorGenerator } from '../actor';
import type { ParsedNPC } from '../../../config/mapping';

describe('ActorGenerator Upgrade', () => {
  const generator = new ActorGenerator();

  it('should handle new traits (dv, dm)', () => {
    const input: ParsedNPC = {
      name: 'Test Traits',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {
        dv: ['fire'],
        dm: { amount: { fire: '-5' }, bypasses: [] }
      },
      skills: {},
      saves: [],
      items: []
    };
    
    const actor = generator.generate(input);
    expect(actor.system.traits.dv.value).toEqual(['fire']);
    expect(actor.system.traits.dm).toEqual({ amount: { fire: '-5' }, bypasses: [] });
  });

  it('should generate lair actions with correct activation', () => {
    const input: ParsedNPC = {
      name: 'Test Lair',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      lair_actions: [
        'Lair Swipe [Melee Weapon Attack]: +5 hit, 5 ft, 1d6 damage'
      ]
    };

    const actor = generator.generate(input);
    const item = actor.items.find((i: any) => i.name === 'Lair Swipe');
    expect(item).toBeTruthy();
    expect(item.system.activation.type).toBe('lair');
    expect(item.system.activation.cost).toBe(1);
  });

  it('should generate regional effects with flags', () => {
    const input: ParsedNPC = {
      name: 'Test Regional',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      regional_effects: [
        'Fog: The area is foggy.'
      ]
    };

    const actor = generator.generate(input);
    const item = actor.items.find((i: any) => i.name === 'Fog');
    expect(item).toBeTruthy();
    expect(item.type).toBe('feat');
    expect(item.flags['tidy5e-sheet'].section).toBe('巢穴效应');
  });

  it('should generate spellcasting items', () => {
    const input: ParsedNPC = {
      name: 'Test Spells',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: [
        'Unknown Spell XYZ', // Should be innate/standalone
      ]
    };

    const actor = generator.generate(input);
    
    // Check Standalone
    const spell = actor.items.find((i: any) => i.name === 'Unknown Spell XYZ');
    expect(spell).toBeTruthy();
    expect(spell.type).toBe('spell');
    expect(spell.system.preparation.mode).toBe('innate');

    // Check Spellcasting Feature (might be created if there are linked spells, 
    // or if we decide to create it always? Current logic: "if (hasLinkedSpells) ... push(spellcastingItem)")
    // So with only unknown spells, we expect NO "施法" item.
    const casting = actor.items.find((i: any) => i.name === '施法');
    expect(casting).toBeUndefined();
  });
});

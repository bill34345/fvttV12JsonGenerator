import { describe, it, expect } from 'bun:test';
import { ActorGenerator } from '../actor';
import type { ParsedNPC } from '../../../config/mapping';
import { spellsMapper } from '../../mapper/spells';

describe('ActorGenerator E2E Comprehensive Tests', () => {
  const generator = new ActorGenerator({ translationService: null });

  it('generates legendary creature with 3 actions and lair initiative 20', async () => {
    const input: ParsedNPC = {
      name: 'Legendary Dragon',
      type: 'npc',
      abilities: {},
      attributes: {
        legact: { value: 3, max: 3 }
      },
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      lairInitiative: 20,
      actions: ['Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage.'],
    };

    const actor = await generator.generateForRoute(input, 'english');

    // Check legendary actions
    expect(actor.system.resources.legact.value).toBe(3);
    expect(actor.system.resources.legact.max).toBe(3);

    // Check lair initiative
    expect(actor.system.resources.lair.value).toBe(true);
    expect(actor.system.resources.lair.initiative).toBe(20);
  });

  it('generates spellcaster with cast activity using spell.uuid structure', async () => {
    // Mock a spell in the mapper
    // Since spellsMapper is a singleton and we can't easily mock its internal Map without reflection or changing the code,
    // we'll check if we can find a way to inject a spell or just verify the structure if a spell is found.
    // Actually, we can just check the code path in ActorGenerator.appendLegacySpellItems.
    
    // Let's try to find a spell that might be in a typical spells.ldb or just mock the mapper if possible.
    // Since I can't easily mock the singleton, I'll check if I can add a spell to it.
    (spellsMapper as any).spells.set('Fireball', {
      uuid: 'fireball-uuid',
      name: 'Fireball',
      sourceId: 'Compendium.dnd5e.spells.Item.fireball-uuid'
    });

    const input: ParsedNPC = {
      name: 'Mage',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: ['Spellcasting. The mage is a 5th-level spellcaster.', '3rd level (2 slots): Fireball'],
    };

    const actor = await generator.generateForRoute(input, 'chinese');

    const spellcastingItem = actor.items.find((i: any) => i.name === '施法');
    expect(spellcastingItem).toBeDefined();
    
    const activities = Object.values(spellcastingItem.system.activities);
    const castActivity = activities.find((a: any) => a.type === 'cast');
    expect(castActivity).toBeDefined();
    expect((castActivity as any).spell.uuid).toBe('fireball-uuid');
  });

  it('generates spellcaster with spell items when spell is not found in mapper', async () => {
    const input: ParsedNPC = {
      name: 'Mage',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: ['Spellcasting. The mage is a 5th-level spellcaster.', '3rd level (2 slots): Unknown Spell'],
    };

    const actor = await generator.generateForRoute(input, 'chinese');

    const spellItem = actor.items.find((i: any) => i.name === 'Unknown Spell');
    expect(spellItem).toBeDefined();
    expect(spellItem.type).toBe('spell');
  });

  it('generates creature with damage bypasses "mgc"', async () => {
    const input: ParsedNPC = {
      name: 'Magic Resistant Golem',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {
        dr: ['fire'],
        bypasses: ['mgc']
      },
      skills: {},
      saves: [],
      items: [],
    };

    const actor = await generator.generateForRoute(input, 'chinese');

    expect(actor.system.traits.dr.value).toContain('fire');
    expect(actor.system.traits.dr.bypasses).toContain('mgc');
  });

  it('generates creature with skill "半熟练" -> 0.5', async () => {
    const input: ParsedNPC = {
      name: 'Jack of all Trades',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {
        ath: 0.5,
        ste: 1,
        prc: 2
      },
      saves: [],
      items: [],
    };

    const actor = await generator.generateForRoute(input, 'chinese');

    expect(actor.system.skills.ath.value).toBe(0.5);
    expect(actor.system.skills.ste.value).toBe(1);
    expect(actor.system.skills.prc.value).toBe(2);
  });
});

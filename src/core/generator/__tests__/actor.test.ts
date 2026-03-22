import { describe, expect, it } from 'bun:test';
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
        'Bite [Melee Weapon Attack]: +10 hit, 10 ft, 2d10+5 piercing',
      ],
    };

    const actor = generator.generate(input);
    expect(actor.name).toBe('Dragon');
    expect(actor.system.abilities.str.value).toBe(20);
    expect(actor.items.length).toBe(1);
    expect(actor.items[0].name).toBe('Bite');
    expect(actor.items[0].type).toBe('weapon');

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
        'Water: The water is clear.',
      ],
    };

    const actorCn = generator.generate(input, { route: 'chinese' });
    const itemCn = actorCn.items.find((i: any) => i.name === 'Water');
    expect(itemCn).toBeDefined();
    expect(itemCn.system.source.custom).toBe('Imported');
    expect(itemCn.system.activities).toEqual({});

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
        'On initiative count 20 (losing initiative ties), the dragon takes a lair action to cause one of the following effects; the dragon cannot use the same effect two rounds in a row:',
        'Action 1: ...',
      ],
      lairInitiative: 20,
    };

    const actor = generator.generate(input);
    expect(actor.system.resources.lair.value).toBe(true);
    expect(actor.system.resources.lair.initiative).toBe(20);
  });

  it('normalizes creature type and derives initiative bonus from the total initiative value', () => {
    const input: ParsedNPC = {
      name: 'Bloodfin',
      type: 'npc',
      abilities: { dex: 14 },
      attributes: { init: 6 },
      details: { creatureType: 'aberration' },
      traits: {},
      skills: {},
      saves: ['dex'],
      items: [],
    };

    const actor = generator.generate(input);

    expect(actor.system.details.type.value).toBe('aberration');
    expect(actor.system.attributes.init.bonus).toBe(4);
    expect(actor.system.abilities.dex.proficient).toBe(1);
  });

  it('extracts plain biography trait lines into dedicated feat items with structured html', () => {
    const input: ParsedNPC = {
      name: 'Slithering Bloodfin',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {
        biography: [
          '- **Blood Frenzy**. The bloodfin has advantage on melee attack rolls against wounded creatures.',
          '- **Wriggly**. The bloodfin can spend 5 feet of movement to end grappled or restrained on itself.',
          '- **Death Burst**. When the bloodfin dies, each creature within 10 feet must make a DC 16 Constitution saving throw. On a failed save, it takes 10 (3d6) poison damage, becomes Poisoned, and must make a DC 16 Charisma saving throw to resist Ruidium Corruption.',
        ].join('\n'),
      },
      traits: {},
      skills: {},
      saves: [],
      items: [],
    };

    const actor = generator.generate(input, { route: 'english' });
    const bloodFrenzy = actor.items.find((item: any) => item.name === 'Blood Frenzy');
    const wriggly = actor.items.find((item: any) => item.name === 'Wriggly');
    const deathBurst = actor.items.find((item: any) => item.name === 'Death Burst');

    expect(bloodFrenzy).toBeDefined();
    expect(wriggly).toBeDefined();
    expect(actor.items.some((item: any) => item.name.includes('Death Burst'))).toBe(true);

    for (const item of [bloodFrenzy, wriggly, deathBurst].filter(Boolean) as any[]) {
      expect(item.type).toBe('feat');
      expect(String(item.system.description?.value ?? '')).toMatch(/<p>|<br\s*\/?>|<ul>|<li>/i);
    }

    const bloodFrenzyActivity = Object.values(bloodFrenzy.system.activities ?? {})[0] as any;
    const wrigglyActivity = Object.values(wriggly.system.activities ?? {})[0] as any;
    expect(Object.values(bloodFrenzy.system.activities ?? {}).some((activity: any) => activity.type === 'utility')).toBe(true);
    expect(Object.values(wriggly.system.activities ?? {}).some((activity: any) => activity.type === 'utility')).toBe(true);
    expect(bloodFrenzy.flags['tidy5e-sheet']).toEqual(expect.objectContaining({ section: 'Traits', actionSection: 'Traits' }));
    expect(wriggly.flags['tidy5e-sheet']).toEqual(expect.objectContaining({ section: 'Traits', actionSection: 'Traits' }));
    expect(bloodFrenzyActivity.activation).toEqual(expect.objectContaining({ type: '', value: null }));
    expect(wrigglyActivity.activation).toEqual(expect.objectContaining({ type: 'special', value: null }));
  });

  it('extracts inherited-dc save chains from death-triggered burst text', () => {
    const deathBurstBlock = [
      '**Death Burst**. When the bloodfin dies, each creature within 10 feet must make a **DC 16 (Constitution) saving throw**.',
      '- On a failed save: the creature takes 10 (3d6) poison damage, becomes Poisoned, and must make a **(Charisma) saving throw** to resist Ruidium Corruption.',
    ].join('\n');
    const saves = (generator as any).extractSavingThrowsWithInheritedDcFromText(deathBurstBlock);

    expect(saves).toEqual([
      expect.objectContaining({ ability: 'con', dc: 16 }),
      expect.objectContaining({ ability: 'cha', dc: 16 }),
    ]);
  });

  it('models Bloodfin Bite as an attack activity instead of a damage-only fallback', () => {
    const input: ParsedNPC = {
      name: 'Slithering Bloodfin',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Bite. Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) piercing damage, and the target is grappled (escape DC 15) and restrained.',
      ],
    };

    const actor = generator.generate(input, { route: 'english' });
    const bite = actor.items.find((item: any) => item.name === 'Bite');

    expect(bite).toBeDefined();
    expect(Object.values(bite.system.activities ?? {}).map((activity: any) => activity.type)).toContain('attack');
    expect(Object.values(bite.system.activities ?? {}).map((activity: any) => activity.type)).not.toContain('damage');
  });

  it('keeps Bloodfin Tail Crash attack-first and does not collapse it into a single save-only activity', () => {
    const input: ParsedNPC = {
      name: 'Slithering Bloodfin',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Tail Crash. Melee Weapon Attack: +9 to hit, reach 10 ft., one target that is not the same target as Bite. Hit: 19 (4d6 + 5) bludgeoning damage. Heavy Hit: If the attack total exceeds the target AC by 5 or more, roll 1d3. 1. Bleeding Wound: the target takes 1d6 bludgeoning damage. 2. Reeling Impact: the target must succeed on a DC 15 Constitution saving throw or become Dazed. 3. Push: the target is pushed 10 ft.',
      ],
    };

    const actor = generator.generate(input, { route: 'english' });
    const tailCrash = actor.items.find((item: any) => item.name === 'Tail Crash');
    const activities = Object.values(tailCrash?.system.activities ?? {}) as Array<{ type?: string }>;

    expect(tailCrash).toBeDefined();
    expect(activities.length).toBeGreaterThan(1);
    expect(activities.some((activity) => activity.type === 'attack')).toBe(true);
    expect(activities.every((activity) => activity.type === 'save')).toBe(false);
    const attackActivity = activities.find((activity) => activity.type === 'attack') as any;
    expect(tailCrash.system.range).toEqual(
      expect.objectContaining({
        value: null,
        long: null,
        reach: 10,
        units: 'ft',
      }),
    );
    expect(attackActivity.range).toEqual(
      expect.objectContaining({
        override: false,
        reach: 10,
        units: 'ft',
      }),
    );
    expect(attackActivity.target).toEqual(
      expect.objectContaining({
        override: false,
        prompt: true,
        template: expect.objectContaining({
          contiguous: false,
          units: 'ft',
          type: '',
        }),
      }),
    );
    expect(attackActivity.damage.parts).toHaveLength(1);
    expect(attackActivity.damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 4,
        denomination: 6,
        bonus: '5',
        types: ['bludgeoning'],
      }),
    );
  });

  it('emits reusable Heavy Hit automation metadata instead of only static boolean hints', () => {
    const input: ParsedNPC = {
      name: 'Heavy Hit Brute',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: [
        'Tail Crash. Melee Weapon Attack: +9 to hit, reach 10 ft., one target. Hit: 19 (4d6 + 5) bludgeoning damage. Heavy Hit: If the attack total exceeds the target AC by 5 or more, roll 1d3. 1. Bleeding Wound: the target takes 1d6 bludgeoning damage. 2. Reeling Impact: the target must succeed on a DC 15 Constitution saving throw or become Dazed. 3. Push: the target is pushed 10 ft.',
      ],
    };

    const actor = generator.generate(input, { route: 'english' });
    const tailCrash = actor.items.find((item: any) => item.name === 'Tail Crash');
    const activities = Object.values(tailCrash?.system.activities ?? {}) as any[];
    const attackActivity = activities.find((activity) => activity.type === 'attack');

    expect(tailCrash).toBeDefined();
    expect(attackActivity?.midiProperties).toEqual(
      expect.objectContaining({
        identifier: 'heavy-hit-primary',
        otherActivityCompatible: true,
      }),
    );
    expect(attackActivity?.macroData?.command).toMatch(/attackTotal|targetAC|1d3|MidiQOL/);
    expect((tailCrash as any).flags?.fvttJsonGenerator?.heavyHit).toEqual(
      expect.objectContaining({
        mode: 'random',
        acMargin: 5,
        dieFormula: '1d3',
        branchActivityIds: expect.any(Array),
      }),
    );
    expect((tailCrash as any).flags?.fvttJsonGenerator?.heavyHit?.branchActivityIds).toHaveLength(3);
  });

  it('does not inject prone into Bloodfin Swallow and preserves daily reaction recovery metadata', () => {
    const input: ParsedNPC = {
      name: 'Slithering Bloodfin',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      bonus_actions: [
        'Swallow. Melee Weapon Attack: +9 to hit, reach 5 ft., one grappled creature. Hit: the target is swallowed. A swallowed creature is no longer grappled, but it is blinded and restrained and has total cover against effects outside the bloodfin. It takes 14 (4d6) necrotic damage immediately and at the start of each of the bloodfin\'s turns. If the bloodfin takes 30 damage from a creature inside it in one turn, or 20 bludgeoning damage in one turn, it must succeed on a DC 15 Constitution saving throw at the end of that turn or regurgitate the swallowed creature, which falls prone in a space within 5 feet.',
      ],
      reactions: [
        'Pelagic Screech. 1/day, bloodied only. Each creature in the same body of water within 300 feet must succeed on a DC 15 Wisdom saving throw or become Dazed until the end of its next turn.',
      ],
    };

    const actor = generator.generate(input, { route: 'english' });
    const swallow = actor.items.find((item: any) => item.name === 'Swallow');
    const pelagicScreech = actor.items.find((item: any) => item.name === 'Pelagic Screech');

    expect(swallow).toBeDefined();
    expect(Object.values(swallow.system.activities ?? {}).map((activity: any) => activity.type)).toEqual(['attack', 'damage', 'save']);
    const swallowActivities = Object.values(swallow.system.activities ?? {}) as any[];
    expect(swallowActivities[0].effects).toHaveLength(2);
    expect(swallowActivities[1].damage.parts[0]).toEqual(
      expect.objectContaining({ number: 4, denomination: 6, types: ['necrotic'] }),
    );
    expect(swallowActivities[2].save.ability).toContain('con');
    expect(swallowActivities[2].save.dc.value).toBe(15);
    expect((swallow.effects ?? []).flatMap((effect: any) => effect.statuses ?? [])).not.toContain('prone');
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed/i.test(String(effect?.name ?? '')))).toBe(false);
    expect((swallow.effects ?? []).flatMap((effect: any) => effect.statuses ?? []).sort()).toEqual([
      'blinded',
      'restrained',
    ]);

    expect(pelagicScreech).toBeDefined();
    expect(pelagicScreech.system.activation?.condition).toMatch(/bloodied/i);
    expect(pelagicScreech.system.uses).toEqual(
      expect.objectContaining({
        value: 1,
        max: 1,
      }),
    );
    expect(Array.isArray(pelagicScreech.system.uses?.recovery)).toBe(true);
    expect(pelagicScreech.system.uses?.recovery?.[0]?.period).toBe('day');
    expect(pelagicScreech.flags['tidy5e-sheet']).toEqual(
      expect.objectContaining({ section: 'Reactions', actionSection: 'Reactions' }),
    );
    const pelagicActivity = Object.values(pelagicScreech.system.activities ?? {})[0] as any;
    expect(pelagicActivity.activation).toEqual(expect.objectContaining({ type: 'reaction', value: null }));
    expect(pelagicActivity.consumption).toEqual(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            type: 'itemUses',
            value: '1',
          }),
        ],
      }),
    );

    for (const item of [swallow, pelagicScreech]) {
      for (const effect of item.effects ?? []) {
        expect(effect.img).toMatch(/^systems\/dnd5e\/icons\/svg\/statuses\/.+\.svg$/);
      }
    }
  });
});

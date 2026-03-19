import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { EnglishBestiaryParser } from '../english';
import { ParserFactory } from '../router';

describe('EnglishBestiaryParser frontmatter', () => {
  const parser = new EnglishBestiaryParser();

  it('parses common bestiary frontmatter fields into ParsedNPC', () => {
    const content = readFileSync(new URL('./fixtures/english-bestiary-adult-red-dragon.md', import.meta.url), 'utf-8');

    const result = parser.parse(content);

    expect(result.name).toBe('Adult Red Dragon');
    expect(result.type).toBe('npc');

    expect(result.abilities).toEqual({
      str: 27,
      dex: 10,
      con: 25,
      int: 16,
      wis: 13,
      cha: 21,
    });

    expect(result.attributes.ac).toEqual({ value: 19, calc: 'natural' });
    expect(result.attributes.hp).toEqual({ value: 256, max: 256, formula: '19d12+133' });
    expect(result.attributes.movement).toEqual({ walk: 40, climb: 40, fly: 80 });

    expect(result.details.cr).toBe(17);
    expect(result.details.xp).toBe(18000);

    expect(result.saves).toEqual(['dex', 'con', 'wis', 'cha']);
    expect(result.skills).toEqual({ prc: 2, ste: 1 });

    expect(result.traits.senses).toEqual({ blindsight: 60, darkvision: 120, passive: 23 });
    expect(result.traits.languages).toEqual(['common', 'draconic']);
    expect(result.traits.di).toEqual(['fire']);
    expect(result.traits.ci).toEqual(['charmed']);

    expect(result.details.biography).toContain('Adult red dragons are powerful and feared predators.');
  });

  it('tolerates unknown layout-oriented fields on english route', () => {
    const factory = new ParserFactory();
    const content = [
      '---',
      'layout: creature',
      'name: Test Creature',
      'tags: [bestiary, dragon]',
      'cssclasses: wide-page',
      'unknown_nested:',
      '  display: compact',
      '---',
      'Body text',
    ].join('\n');

    expect(factory.detectRoute(content)).toBe('english');
    expect(() => factory.parse(content)).not.toThrow();
    expect(factory.parse(content).name).toBe('Test Creature');
  });

  it('extracts actions, legendary actions, and lair actions while preserving narrative biography', () => {
    const content = [
      '---',
      'layout: creature',
      'name: Ancient Flame Dragon',
      '---',
      'Ancient flame dragons burn entire kingdoms when enraged.',
      '',
      '### Actions',
      '- Multiattack. The dragon makes three attacks: one with its bite and two with its claws.',
      '- Bite. Melee Weapon Attack: +17 to hit, reach 15 ft., one target, 2d10 + 10 piercing damage.',
      '',
      '### legendary actions',
      '- Detect. The dragon makes a Wisdom (Perception) check.',
      '- Tail Attack. The dragon makes a tail attack.',
      '',
      '### Lair Actions',
      '>* Magma Burst. Molten rock erupts from a point on the ground.',
      '- Tremor. The ground shakes violently in a 20-foot radius.',
      '',
      'Its hoard is hidden beneath a volcanic mountain.',
    ].join('\n');

    const result = parser.parse(content);

    expect(result.actions).toEqual([
      'Multiattack. The dragon makes three attacks: one with its bite and two with its claws.',
      'Bite. Melee Weapon Attack: +17 to hit, reach 15 ft., one target, 2d10 + 10 piercing damage.',
    ]);
    expect(result.legendary_actions).toEqual([
      'Detect. The dragon makes a Wisdom (Perception) check.',
      'Tail Attack. The dragon makes a tail attack.',
    ]);
    expect(result.lair_actions).toEqual([
      'Magma Burst. Molten rock erupts from a point on the ground.',
      'Tremor. The ground shakes violently in a 20-foot radius.',
    ]);

    expect(result.details.biography).toContain('Ancient flame dragons burn entire kingdoms when enraged.');
    expect(result.details.biography).toContain('Its hoard is hidden beneath a volcanic mountain.');
    expect(result.details.biography).not.toContain('### Actions');
    expect(result.details.biography).not.toContain('Tail Attack.');
  });

  it('extracts bonus actions and reactions into dedicated sections', () => {
    const content = [
      '---',
      'layout: creature',
      'name: Skirmisher',
      '---',
      '### Actions',
      '- Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft., one target.',
      '### Bonus Actions',
      '- Dash. The skirmisher moves up to its speed.',
      '### Reactions',
      '- Parry. The skirmisher adds 2 to its AC against one melee attack.',
    ].join('\n');

    const result = parser.parse(content);

    expect(result.actions).toEqual(['Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft., one target.']);
    expect(result.bonus_actions).toEqual(['Dash. The skirmisher moves up to its speed.']);
    expect(result.reactions).toEqual(['Parry. The skirmisher adds 2 to its AC against one melee attack.']);
  });

  it('extracts spellcasting blocks and keeps non-section text in biography', () => {
    const content = [
      '---',
      'layout: creature',
      'name: Arcane Warden',
      '---',
      'Arcane wardens are elite guardians of forgotten vaults.',
      '',
      '### Spellcasting',
      'The warden is a 12th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 16).',
      '- At will: detect magic, mage hand',
      '- 1/day each: teleport',
      '',
      '### Actions',
      '- Quarterstaff. Melee Weapon Attack: +7 to hit, reach 5 ft., one target.',
      '',
      'It never abandons its assigned post.',
    ].join('\n');

    const result = parser.parse(content);

    expect(result.spellcasting).toEqual([
      'The warden is a 12th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 16).',
      'At will: detect magic, mage hand',
      '1/day each: teleport',
    ]);
    expect(result.actions).toEqual(['Quarterstaff. Melee Weapon Attack: +7 to hit, reach 5 ft., one target.']);
    expect(result.details.biography).toContain('Arcane wardens are elite guardians of forgotten vaults.');
    expect(result.details.biography).toContain('It never abandons its assigned post.');
    expect(result.details.biography).not.toContain('Spellcasting');
    expect(result.details.biography).not.toContain('At will: detect magic');
  });

  it('merges wrapped emphasized action lines from bestiary markdown', () => {
    const content = [
      '---',
      'layout: creature',
      'name: Pinna',
      '---',
      '### Actions',
      '***Dagger.*** Melee or Ranged Weapon Attack: +2 to',
      'hit, reach 5 ft. or range 20/60 ft., one target. Hit:',
      '2 (1d4) piercing damage.',
    ].join('\n');

    const result = parser.parse(content);

    expect(result.actions).toEqual([
      'Dagger. Melee or Ranged Weapon Attack: +2 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 2 (1d4) piercing damage.',
    ]);
  });

  it('extracts inline emphasized spellcasting block without markdown heading', () => {
    const content = [
      '---',
      'layout: creature',
      'name: Pinna',
      'size: Medium humanoid',
      '---',
      '***Spellcasting.*** Pinna is a 3rd-level spellcaster.',
      'spellcasting ability is Intelligence.',
      '',
      '* Cantrips (at will): <i>minor illusion, mage hand, dancing lights, fire bolt</i>',
      '* 1st level (4 slots): <i>color spray, silent image, identify, magic missile</i>',
      '### Actions',
      '***Dagger.*** Melee or Ranged Weapon Attack: +2 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 2 (1d4) piercing damage.',
    ].join('\n');

    const result = parser.parse(content);

    expect(result.traits.size).toBe('med');
    expect(result.spellcasting).toEqual([
      'Pinna is a 3rd-level spellcaster.',
      'spellcasting ability is Intelligence.',
      'Cantrips (at will): <i>minor illusion, mage hand, dancing lights, fire bolt</i>',
      '1st level (4 slots): <i>color spray, silent image, identify, magic missile</i>',
    ]);
    expect(result.actions).toEqual([
      'Dagger. Melee or Ranged Weapon Attack: +2 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 2 (1d4) piercing damage.',
    ]);
  });
});

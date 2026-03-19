import { describe, expect, it } from 'bun:test';
import { EnglishActionParser } from '../englishAction';

type ExtendedActionResult = {
  damage?: Array<{ formula: string; type: string }>;
  legendaryCost?: number;
};

describe('EnglishActionParser', () => {
  const parser = new EnglishActionParser();

  it('parses melee weapon attack with reach and multi-damage', () => {
    const input =
      'Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('attack');
    expect(result?.name).toBe('Bite');
    expect(result?.attack?.type).toBe('mwak');
    expect(result?.attack?.toHit).toBe(14);
    expect(result?.attack?.range).toBe('reach 10 ft.');
    expect(result?.attack?.damage).toEqual([
      { formula: '2d10+8', type: 'piercing' },
      { formula: '2d6', type: 'fire' },
    ]);
  });

  it('parses ranged weapon attack with range', () => {
    const input =
      'Tail Spikes. Ranged Weapon Attack: +8 to hit, range 100/200 ft., one target. Hit: 11 (2d6 + 4) piercing damage.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('attack');
    expect(result?.name).toBe('Tail Spikes');
    expect(result?.attack?.type).toBe('rwak');
    expect(result?.attack?.toHit).toBe(8);
    expect(result?.attack?.range).toBe('range 100/200 ft.');
    expect(result?.attack?.damage).toEqual([{ formula: '2d6+4', type: 'piercing' }]);
  });

  it('parses melee or ranged weapon attack syntax used by bestiary markdown', () => {
    const input =
      'Dagger. Melee or Ranged Weapon Attack: +2 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 2 (1d4) piercing damage.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('attack');
    expect(result?.name).toBe('Dagger');
    expect(result?.attack?.type).toBe('mwak');
    expect(result?.attack?.toHit).toBe(2);
    expect(result?.attack?.range).toBe('reach 5 ft. or range 20/60 ft.');
    expect(result?.attack?.damage).toEqual([{ formula: '1d4', type: 'piercing' }]);
  });

  it('parses save DC and recharge from english statblock line', () => {
    const input =
      'Fire Breath (Recharge 5-6). The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('save');
    expect(result?.name).toBe('Fire Breath');
    expect(result?.save).toEqual({
      dc: 21,
      ability: 'dex',
      onSave: 'half damage',
    });
    expect(result?.recharge).toEqual({ value: 5, charged: true });
    expect((result as ExtendedActionResult | null)?.damage).toEqual([{ formula: '18d6', type: 'fire' }]);
  });

  it('parses legendary action cost metadata from action names', () => {
    const input =
      'Wing Attack (Costs 2 Actions). The dragon beats its wings. Each creature within 10 feet must succeed on a DC 25 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('save');
    expect(result?.name).toBe('Wing Attack');
    expect((result as ExtendedActionResult | null)?.legendaryCost).toBe(2);
    expect(result?.save?.dc).toBe(25);
    expect(result?.save?.ability).toBe('dex');
  });

  it('keeps utility fallback for unstructured english lines', () => {
    const input = 'Multiattack. The dragon makes three attacks: one with its bite and two with its claws.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('utility');
    expect(result?.name).toBe('Multiattack');
    expect(result?.desc).toContain('three attacks');
  });

  it('keeps colon subtitle in action name when sentence body follows', () => {
    const input =
      'Villain Ability: Warlord. As a reaction, when a minion dies, Dorokor can issue a command to her other minions.';

    const result = parser.parse(input);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Villain Ability: Warlord');
    expect(result?.type).toBe('utility');
  });
});

import { describe, it, expect } from 'bun:test';
import { ItemValidator } from '../item-validator';
import type { ParsedItem } from '../../models/item';
import type { ItemDocument } from '../../generator/item-generator';

describe('ItemValidator', () => {
  const validator = new ItemValidator();

  // Validator validates ParsedItem structure (the _item parameter is unused in validateRequiredFields and validateActivities)
  // The warnings check parsed fields: name, type, damage, range, armor, uses, price, weight, activities

  describe('valid item passes', () => {
    it('should return empty warnings for a valid weapon', () => {
      const parsed: ParsedItem = {
        name: 'Longsword',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 8, types: ['slashing'] } },
        range: { value: 5, long: null, units: 'ft' },
      };
      const item: ItemDocument = {
        _id: 'abc123',
        name: 'Longsword',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toEqual([]);
    });

    it('should return empty warnings for valid armor', () => {
      const parsed: ParsedItem = {
        name: 'Chainmail',
        type: 'armor',
        armor: { value: 16 },
      };
      const item: ItemDocument = {
        _id: 'def456',
        name: 'Chainmail',
        type: 'armor',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toEqual([]);
    });

    it('should return empty warnings for consumable with uses', () => {
      const parsed: ParsedItem = {
        name: 'Healing Potion',
        type: 'consumable',
        uses: { max: '1', recovery: [{ period: 'rest', type: 'formulaic', formula: '1' }], spent: 0 },
      };
      const item: ItemDocument = {
        _id: 'potion123',
        name: 'Healing Potion',
        type: 'consumable',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toEqual([]);
    });
  });

  describe('name mismatch warning', () => {
    it('should warn when name does not match', () => {
      const parsed: ParsedItem = {
        name: 'Shortbow',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 6, types: ['piercing'] } },
        range: { value: 80, long: 320, units: 'ft' },
      };
      const item: ItemDocument = {
        _id: 'xyz789',
        name: 'Longbow',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Name mismatch: Expected 'Shortbow', got 'Longbow'");
    });
  });

  describe('type mismatch warning', () => {
    it('should warn when type does not match', () => {
      const parsed: ParsedItem = {
        name: 'Shield',
        type: 'equipment',
        armor: { value: 2 },
      };
      const item: ItemDocument = {
        _id: 'type123',
        name: 'Shield',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Type mismatch: Expected 'equipment', got 'weapon'");
    });
  });

  describe('missing armor warning for equipment', () => {
    it('should warn when equipment type is missing armor value in parsed', () => {
      const parsed: ParsedItem = {
        name: 'Leather Armor',
        type: 'equipment',
        // missing armor field
      };
      const item: ItemDocument = {
        _id: 'armor123',
        name: 'Leather Armor',
        type: 'equipment',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Armor/equipment missing armor value');
    });

    it('should warn when armor type is missing armor value in parsed', () => {
      const parsed: ParsedItem = {
        name: 'Plate Armor',
        type: 'armor',
        // missing armor field
      };
      const item: ItemDocument = {
        _id: 'plate123',
        name: 'Plate Armor',
        type: 'armor',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Armor/equipment missing armor value');
    });
  });

  describe('activity validation', () => {
    it('should warn when activity has unknown type', () => {
      const parsed: ParsedItem = {
        name: 'Magic Staff',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 6, types: ['bludgeoning'] } },
        range: { value: 5, long: null, units: 'ft' },
        activities: {
          activity1: {
            _id: 'act-001',
            type: 'unknown-type',
          },
        },
      };
      const item: ItemDocument = {
        _id: 'act123',
        name: 'Magic Staff',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Activity 'activity1' has unknown type: 'unknown-type'");
    });

    it('should warn when attack activity is missing attack data', () => {
      const parsed: ParsedItem = {
        name: 'Ranged Weapon',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 6, types: ['piercing'] } },
        range: { value: 100, long: 300, units: 'ft' },
        activities: {
          attack1: {
            _id: 'atk-001',
            type: 'attack',
            // missing attack field
            range: { value: '100', units: 'ft', override: false },
          },
        },
      };
      const item: ItemDocument = {
        _id: 'atk123',
        name: 'Ranged Weapon',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Attack activity 'attack1' missing attack data");
    });

    it('should warn when attack activity is missing range data', () => {
      const parsed: ParsedItem = {
        name: 'Melee Weapon',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 8, types: ['slashing'] } },
        range: { value: 5, long: null, units: 'ft' },
        activities: {
          melee1: {
            _id: 'melee-001',
            type: 'attack',
            attack: { ability: 'str', bonus: '+5', flat: false },
            // missing range
          },
        },
      };
      const item: ItemDocument = {
        _id: 'range123',
        name: 'Melee Weapon',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Attack activity 'melee1' missing range data");
    });

    it('should warn when save activity is missing save data', () => {
      const parsed: ParsedItem = {
        name: 'Aura Effect',
        type: 'equipment',
        armor: { value: 0 },
        activities: {
          save1: {
            _id: 'save-001',
            type: 'save',
            // missing save field
          },
        },
      };
      const item: ItemDocument = {
        _id: 'save123',
        name: 'Aura Effect',
        type: 'equipment',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Save activity 'save1' missing save data");
    });

    it('should warn when cast activity is missing spell data', () => {
      const parsed: ParsedItem = {
        name: 'Spell Wand',
        type: 'wand',
        activities: {
          cast1: {
            _id: 'cast-001',
            type: 'cast',
            // missing spell field
          },
        },
      };
      const item: ItemDocument = {
        _id: 'cast123',
        name: 'Spell Wand',
        type: 'wand',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain("Cast activity 'cast1' missing spell data");
    });
  });

  describe('negative value warnings', () => {
    it('should warn for negative price', () => {
      const parsed: ParsedItem = {
        name: 'Cheap Item',
        type: 'loot',
        price: { value: -5, denomination: 'gp' },
      };
      const item: ItemDocument = {
        _id: 'price123',
        name: 'Cheap Item',
        type: 'loot',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Invalid negative price: -5');
    });

    it('should warn for negative weight', () => {
      const parsed: ParsedItem = {
        name: 'Floating Item',
        type: 'loot',
        weight: { value: -1, units: 'lb' },
      };
      const item: ItemDocument = {
        _id: 'weight123',
        name: 'Floating Item',
        type: 'loot',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Invalid negative weight: -1');
    });
  });

  describe('consumable validation', () => {
    it('should warn when consumable is missing uses data', () => {
      const parsed: ParsedItem = {
        name: 'Potion',
        type: 'consumable',
        // no uses field
      };
      const item: ItemDocument = {
        _id: 'potion123',
        name: 'Potion',
        type: 'consumable',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Consumable missing uses/recovery data');
    });
  });

  describe('weapon validation', () => {
    it('should warn when weapon is missing damage', () => {
      const parsed: ParsedItem = {
        name: 'Broken Sword',
        type: 'weapon',
        // no damage
        range: { value: 5, long: null, units: 'ft' },
      };
      const item: ItemDocument = {
        _id: 'broken123',
        name: 'Broken Sword',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Weapon missing damage data');
    });

    it('should warn when weapon is missing range', () => {
      const parsed: ParsedItem = {
        name: 'Mystery Weapon',
        type: 'weapon',
        damage: { base: { number: 1, denomination: 6, types: ['bludgeoning'] } },
        // no range
      };
      const item: ItemDocument = {
        _id: 'mystery123',
        name: 'Mystery Weapon',
        type: 'weapon',
        system: {},
      };
      const warnings = validator.validate(parsed, item);
      expect(warnings).toContain('Weapon missing range data');
    });
  });
});

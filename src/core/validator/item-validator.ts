import type { ParsedItem } from '../models/item';
import type { ItemDocument } from '../generator/item-generator';

export class ItemValidator {
  public validate(parsed: ParsedItem, item: ItemDocument): string[] {
    const warnings: string[] = [];

    // Check: name matches
    if (item.name !== parsed.name && parsed.name) {
      warnings.push(`Name mismatch: Expected '${parsed.name}', got '${item.name}'`);
    }

    // Check: type matches
    if (item.type !== parsed.type) {
      warnings.push(`Type mismatch: Expected '${parsed.type}', got '${item.type}'`);
    }

    // Check: required fields present based on type
    this.validateRequiredFields(parsed, item, warnings);

    // Check: activities have valid structure
    this.validateActivities(parsed, item, warnings);

    return warnings;
  }

  private validateRequiredFields(parsed: ParsedItem, _item: ItemDocument, warnings: string[]): void {
    const { type } = parsed;

    // Weapons require damage and range
    if (type === 'weapon') {
      if (!parsed.damage) {
        warnings.push('Weapon missing damage data');
      }
      if (!parsed.range) {
        warnings.push('Weapon missing range data');
      }
    }

    // Armor requires armor value
    if (type === 'armor' || type === 'equipment') {
      if (!parsed.armor) {
        warnings.push('Armor/equipment missing armor value');
      }
    }

    // Consumables with uses require uses data
    if (type === 'consumable' && !parsed.uses) {
      warnings.push('Consumable missing uses/recovery data');
    }

    // Items with price should have positive values
    if (parsed.price && parsed.price.value < 0) {
      warnings.push(`Invalid negative price: ${parsed.price.value}`);
    }

    // Items with weight should have positive values
    if (parsed.weight && parsed.weight.value < 0) {
      warnings.push(`Invalid negative weight: ${parsed.weight.value}`);
    }
  }

  private validateActivities(parsed: ParsedItem, _item: ItemDocument, warnings: string[]): void {
    const activities = parsed.activities;

    if (!activities || Object.keys(activities).length === 0) {
      return;
    }

    for (const [id, activity] of Object.entries(activities)) {
      // Check: activity has required _id
      if (!activity._id) {
        warnings.push(`Activity missing _id: ${id}`);
      }

      // Check: activity has valid type
      const validTypes = ['attack', 'cast', 'save', 'utility'];
      if (activity.type && !validTypes.includes(activity.type)) {
        warnings.push(`Activity '${id}' has unknown type: '${activity.type}'`);
      }

      // Check: attack activities have required fields
      if (activity.type === 'attack') {
        if (!activity.attack) {
          warnings.push(`Attack activity '${id}' missing attack data`);
        }
        if (!activity.range) {
          warnings.push(`Attack activity '${id}' missing range data`);
        }
      }

      // Check: cast activities have spell info
      if (activity.type === 'cast') {
        if (!activity.spell) {
          warnings.push(`Cast activity '${id}' missing spell data`);
        }
      }

      // Check: save activities have save data
      if (activity.type === 'save') {
        if (!activity.save) {
          warnings.push(`Save activity '${id}' missing save data`);
        }
      }
    }
  }
}

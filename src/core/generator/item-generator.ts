import type { ParsedItem, ItemType, ActivityData } from '../models/item';
import { ActivityGenerator } from './activity';
import { generateEnhancedConditionEffects } from './actor-effects';
import { getFoundryTarget, type FvttTargetVersion } from '../foundryTarget';

/**
 * Item document type - represents a Foundry VTT item document
 */
export interface ItemDocument {
  _id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, any>;
  effects?: any[];
  flags?: Record<string, any>;
  folder?: string;
  sort?: number;
  ownership?: Record<string, number>;
  _stats?: Record<string, any>;
  _key?: string;
}

/**
 * Options for ItemGenerator
 */
export interface ItemGeneratorOptions {
  fvttVersion?: FvttTargetVersion;
}

/**
 * Generate a random 16-character hex ID for items
 */
function generateItemId(): string {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * ItemGenerator - generates Foundry VTT Item documents from ParsedItems
 * 
 * Uses reference templates from dnd5e-4.3.9 pack source items and patches
 * them with parsed data to create valid item documents.
 */
export class ItemGenerator {
  private activityGenerator: ActivityGenerator;
  private readonly fvttVersion: FvttTargetVersion;

  constructor(private options: ItemGeneratorOptions = {}) {
    this.fvttVersion = options.fvttVersion ?? '12';
    this.activityGenerator = new ActivityGenerator({ fvttVersion: this.fvttVersion });
  }

  /**
   * Generate an ItemDocument from a ParsedItem
   */
  async generate(parsed: ParsedItem): Promise<ItemDocument> {
    // 1. Start from a neutral versioned schema. Reference items are evidence
    // for field shape, never a source of mechanics for an unrelated item.
    const template = this.loadBundledMinimalTemplate(parsed.type);

    // 2. Clone the template using golden master pattern
    const item = JSON.parse(JSON.stringify(template)) as ItemDocument;

    // 3. Generate new IDs for the cloned item
    item._id = generateItemId();

    // 4. Patch basic fields (name, description, rarity, attunement, price, weight)
    this.patchBasicFields(item, parsed);

    // 5. Generate activities from parsed.activities or parsed.structuredActions
    if (parsed.activities) {
      this.generateActivities(item, parsed.activities);
    } else if (parsed.structuredActions) {
      this.generateStructuredActivities(item, parsed.structuredActions);
    }

    // 6. Return the item document
    this.finalizeTargetFields(item);
    return item;
  }

  /**
   * Load fallback template when no reference is available
   */
  private loadBundledMinimalTemplate(type: ItemType): ItemDocument {
    const item = this.loadFallbackTemplate(type);
    const foundryType = this.foundryItemType(type);
    item.type = foundryType;

    item.system.properties ??= [];
    item.system.container ??= null;
    item.system.unidentified ??= { description: '' };

    if (foundryType === 'weapon') {
      item.system.damage ??= {
        base: { number: null, denomination: 0, bonus: '', types: [], custom: { enabled: false, formula: '' }, scaling: { mode: '', number: null, formula: '' } },
        versatile: { number: null, denomination: 0, bonus: '', types: [], custom: { enabled: false, formula: '' }, scaling: { mode: '', number: null, formula: '' } },
      };
      item.system.range ??= { value: null, long: null, reach: null, units: 'ft' };
      item.system.type ??= { value: 'simpleM', baseItem: '' };
      item.system.proficient ??= null;
    } else if (foundryType === 'equipment') {
      item.system.armor ??= { value: null, dex: null, magicalBonus: null };
      item.system.type ??= { value: 'trinket', baseItem: '' };
    } else if (foundryType === 'consumable') {
      item.system.type ??= { value: type === 'ammunition' ? 'ammo' : 'potion', subtype: '' };
      item.system.damage ??= { base: { number: null, denomination: 0, bonus: '', types: [], custom: { enabled: false, formula: '' }, scaling: { mode: '', number: null, formula: '' } } };
    } else if (foundryType === 'loot') {
      item.system.type ??= { value: 'gear' };
    } else if (foundryType === 'tool') {
      item.system.type ??= { value: 'art', baseItem: '' };
      item.system.ability ??= '';
      item.system.bonus ??= '';
    } else if (foundryType === 'container') {
      item.system.capacity ??= { type: 'weight', value: null };
      item.system.currency ??= { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    }

    return item;
  }

  private foundryItemType(type: ItemType): string {
    if (type === 'ammunition' || type === 'consumable') return 'consumable';
    if (type === 'armor' || type === 'rod' || type === 'wand') return 'equipment';
    if (type === 'staff') return 'weapon';
    return type;
  }

  private loadFallbackTemplate(type: ItemType = 'equipment'): ItemDocument {
    // Return a minimal valid item structure
    return {
      _id: 'fallback',
      name: 'Unknown Item',
      type: this.foundryItemType(type),
      img: 'icons/svg/item-bag.svg',
      system: {
        description: {
          value: '',
          chat: '',
        },
        source: {
          custom: '',
          book: 'SRD 5.1',
          page: '',
          license: 'CC-BY-4.0',
          rules: '2014',
        },
        quantity: 1,
        weight: {
          value: 0,
          units: 'lb',
        },
        price: {
          value: 0,
          denomination: 'gp',
        },
        attunement: 'none',
        equipped: false,
        rarity: 'common',
        identified: true,
        cover: null,
        uses: {
          max: '',
          spent: 0,
          recovery: [],
        },
        activities: {},
        attuned: false,
        identifier: 'unknown-item',
      },
      effects: [],
      flags: {},
      _stats: {
        duplicateSource: null,
          coreVersion: this.targetStats().coreVersion,
          systemId: this.targetStats().systemId,
          systemVersion: this.targetStats().systemVersion,
        createdTime: Date.now(),
        modifiedTime: Date.now(),
      },
    };
  }

  /**
   * Patch basic fields on the item document
   */
  private patchBasicFields(item: ItemDocument, parsed: ParsedItem): void {
    // Name (append englishName in parentheses if present)
    if (parsed.name) {
      item.name = parsed.englishName
        ? `${parsed.name} (${parsed.englishName})`
        : parsed.name;
      item.system.identifier = this.sanitizeIdentifier(parsed.name);
    }

    // Description
    if (parsed.description !== undefined || parsed.cumulativeRequirements || parsed.stages?.[0]?.requirements?.length) {
      item.system.description = item.system.description || { value: '', chat: '' };
      let desc = parsed.description;

      if (desc === undefined && parsed.stages?.[0]?.requirements?.length) {
        desc = parsed.stages[0].requirements.join('\n');
      }

      desc = desc || '';

      if (parsed.cumulativeRequirements?.length) {
        const reqHtml = parsed.cumulativeRequirements
          .map((r) => `<p>${r}</p>`)
          .join('');
        desc = desc ? `${desc}\n${reqHtml}` : reqHtml;
      }

      item.system.description.value = desc;
    }

    // Rarity
    if (parsed.rarity) {
      item.system.rarity = parsed.rarity;
    }

    // Attunement
    if (parsed.attunement) {
      item.system.attunement = parsed.attunement;
      if (!this.isV14()) {
        item.system.attuned = parsed.attunement === 'required';
      }
    }

    // Price
    if (parsed.price) {
      item.system.price = {
        value: parsed.price.value,
        denomination: parsed.price.denomination,
      };
    }

    // Weight
    if (parsed.weight) {
      item.system.weight = {
        value: parsed.weight.value,
        units: parsed.weight.units,
      };
    }

    // Quantity
    if (parsed.quantity !== undefined) {
      item.system.quantity = parsed.quantity;
    }

    // Source
    if (parsed.source) {
      item.system.source = item.system.source || { custom: '', book: '', page: '', license: '', rules: '' };
      item.system.source.custom = parsed.source;
    }

    // Damage (for weapons)
    if (parsed.damage) {
      item.system.damage = parsed.damage;
    }

    // Range (for weapons/ranged items)
    if (parsed.range) {
      item.system.range = {
        value: parsed.range.value,
        long: parsed.range.long,
        units: parsed.range.units || 'ft',
        reach: parsed.range.reach ?? null,
      };
    }

    // Properties (for weapons/armor)
    if (parsed.properties) {
      item.system.properties = parsed.properties;
    }

    // Armor class (for armor/equipment)
    if (parsed.armor) {
      item.system.armor = {
        value: parsed.armor.value,
        dex: parsed.armor.dex ?? null,
        magicalBonus: parsed.armor.magicalBonus ?? null,
      };
      item.system.type = {
        value: parsed.armor.type ?? 'trinket',
        baseItem: parsed.armor.baseItem ?? '',
      };
    }

    // Uses/charges (for consumables)
    if (parsed.uses) {
      item.system.uses = {
        max: parsed.uses.max,
        spent: parsed.uses.spent || 0,
        recovery: parsed.uses.recovery || [],
      };
    }
  }

  /**
   * Generate and attach activities from parsed activities
   */
  private generateActivities(item: ItemDocument, activities: Record<string, ActivityData>): void {
    if (!item.system) {
      item.system = {};
    }
    if (!item.system.activities) {
      item.system.activities = {};
    }

    for (const [key, activity] of Object.entries(activities)) {
      // Generate a new ID for each activity
      const newId = generateItemId();
      const activityWithId = {
        ...activity,
        _id: newId,
      };
      item.system.activities[newId] = activityWithId;
    }
  }

  /**
   * Generate activities from structured actions (attacks, saves, utilities, casts, effects, uses)
   */
  private generateStructuredActivities(
    item: ItemDocument,
    structuredActions: {
      attacks?: any[];
      saves?: any[];
      utilities?: any[];
      casts?: any[];
      effects?: any[];
      uses?: any[];
      spells?: any[];
    }
  ): void {
    if (!item.system) {
      item.system = {};
    }
    if (!item.system.activities) {
      item.system.activities = {};
    }

    let sortOrder = 100000;

    if (!item.effects) {
      item.effects = [];
    }

    const processActions = (actions: any[] | undefined) => {
      if (!actions) return;
      if (!item.effects) item.effects = [];
      for (const action of actions) {
      const passiveEffect = this.activityGenerator.generatePassiveEffect(action);
        if (passiveEffect) {
          passiveEffect.origin = `Item.${item._id}`;
          item.effects.push(passiveEffect);
        } else {
          const activities = this.activityGenerator.generate(action);
          const conditionEffects = generateEnhancedConditionEffects(
            action.desc ?? '',
            activities,
            action.name,
          );
          for (const conditionEffect of conditionEffects) {
            conditionEffect.origin = `Item.${item._id}`;
            item.effects.push(conditionEffect);
          }
          for (const [id, activity] of Object.entries(activities)) {
            const actionName = action.englishName
              ? `${action.name} (${action.englishName})`
              : action.name;
            item.system.activities[id] = {
              ...activity,
              name: (activity as ActivityData).name || actionName,
              sort: sortOrder,
            };
            sortOrder += 100000;
          }
        }
      }
    };

    processActions(structuredActions.attacks);
    processActions(structuredActions.saves);
    processActions(structuredActions.utilities);
    processActions(structuredActions.casts);
    processActions(structuredActions.effects);
    processActions(structuredActions.uses);
    processActions(structuredActions.spells);
  }

  /**
   * Sanitize a string to be used as an item identifier
   */
  private sanitizeIdentifier(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private finalizeTargetFields(item: ItemDocument): void {
    item._stats = {
      ...(item._stats ?? {}),
      coreVersion: this.targetStats().coreVersion,
      systemId: this.targetStats().systemId,
      systemVersion: this.targetStats().systemVersion,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
    };
    delete item._stats.lastModifiedBy;

    if (this.isV14()) {
      delete item.system.attuned;
    }

    if (Array.isArray(item.effects)) {
      for (const effect of item.effects) {
        if (!effect || typeof effect !== 'object') continue;
        effect._stats = {
          ...(effect._stats ?? {}),
          coreVersion: this.targetStats().coreVersion,
          systemId: this.targetStats().systemId,
          systemVersion: this.targetStats().systemVersion,
        };
      }
    }
  }

  private targetStats(): ReturnType<typeof getFoundryTarget>['stats'] {
    return getFoundryTarget(this.fvttVersion).stats;
  }

  private isV14(): boolean {
    return this.fvttVersion === '14';
  }
}

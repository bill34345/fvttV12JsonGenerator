import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ParsedItem, ItemType, ActivityData } from '../models/item';
import type { ItemParserStrategy } from '../parser/item-strategy';
import { ActivityGenerator } from './activity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From src/core/generator/, go up 3 levels to project root: src/core -> src -> project root
const REFERENCES_PATH = join(__dirname, '../../..', 'references/dnd5e-4.3.9/repo/packs/_source/items');

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
  fvttVersion?: string;
}

/**
 * Mapping from ItemType to reference directory name
 */
const ITEM_TYPE_TO_DIR: Record<ItemType, string> = {
  weapon: 'weapon',
  equipment: 'equipment',
  consumable: 'potion',
  loot: 'loot',
  tool: 'tool',
  ammunition: 'ammunition',
  armor: 'armor',
  rod: 'rod',
  wand: 'wand',
  staff: 'weapon',
  container: 'container',
};

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

  constructor(private options: ItemGeneratorOptions = {}) {
    this.activityGenerator = new ActivityGenerator();
  }

  /**
   * Generate an ItemDocument from a ParsedItem
   */
  async generate(parsed: ParsedItem): Promise<ItemDocument> {
    // 1. Load reference template based on item type
    const template = this.loadReferenceTemplate(parsed.type);

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
    return item;
  }

  /**
   * Load a reference template item from the dnd5e pack source
   */
  private loadReferenceTemplate(type: ItemType): ItemDocument {
    const dir = ITEM_TYPE_TO_DIR[type] || 'equipment';
    const dirPath = join(REFERENCES_PATH, dir);

    try {
      // Read directory contents to find a template file
      const files = this.getJsonFiles(dirPath);

      if (files.length === 0) {
        // Fallback to equipment template
        return this.loadFallbackTemplate();
      }

      // Use the first item in the directory as template
      const firstFile = files[0];
      if (!firstFile) {
        return this.loadFallbackTemplate();
      }
      const templatePath = join(dirPath, firstFile);
      const content = readFileSync(templatePath, 'utf-8');
      return JSON.parse(content) as ItemDocument;
    } catch (error) {
      console.warn(`Warning: Failed to load reference template for type ${type}, using fallback: ${error}`);
      return this.loadFallbackTemplate();
    }
  }

  /**
   * Get all JSON files in a directory
   */
  private getJsonFiles(dirPath: string): string[] {
    try {
      if (!existsSync(dirPath)) {
        return [];
      }
      return readdirSync(dirPath)
        .filter((file: string) => file.endsWith('.json') && file !== '_folder.json')
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Load fallback template when no reference is available
   */
  private loadFallbackTemplate(): ItemDocument {
    // Return a minimal valid item structure
    return {
      _id: 'fallback',
      name: 'Unknown Item',
      type: 'equipment',
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
          value: 1,
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
        coreVersion: '12.331',
        systemId: 'dnd5e',
        systemVersion: '4.0.0',
        createdTime: Date.now(),
        modifiedTime: Date.now(),
        lastModifiedBy: 'fvttJsonGenerator',
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
      item.system.attuned = parsed.attunement === 'required';
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
        dex: 0,
        magicalBonus: null,
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
          for (const [id, activity] of Object.entries(activities)) {
            item.system.activities[id] = {
              ...activity,
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
}

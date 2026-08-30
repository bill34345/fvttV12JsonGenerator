import * as yaml from 'js-yaml';
import { detectItemRoute } from './itemRouter';
import type { ItemParserStrategy } from './itemStrategy';
import type { ParsedItem, ItemRarity, AttunementType, ItemType, UsesData, ItemStage } from '@fvtt-json-generator/models/item';
import type { ActionData, Damage } from '@fvtt-json-generator/models/action';
import { i18n } from './i18n';

/**
 * Item parser - handles layout: item frontmatter content
 * Full implementation in T7-T10
 */
export class ItemParser implements ItemParserStrategy {
  readonly type = 'item' as const;

  canParse(content: string): boolean {
    return detectItemRoute(content);
  }

  parse(content: string, normalizedBody?: string): ParsedItem {
    const { frontmatter, body } = this.splitContent(content);
    const rawData = yaml.load(frontmatter) as Record<string, unknown>;

    const name = this.parseName(rawData);
    const englishName = this.parseEnglishName(rawData);
    const type = this.parseType(rawData);
    const img = this.parseImage(rawData);
    const rarity = this.parseRarity(rawData);
    const attunement = this.parseAttunement(rawData);

    const headerInfo = this.parseHeaderLine(body);

    const finalName = (name && name !== 'Unknown Item') ? name : (headerInfo.name ?? 'Unknown Item');
    const finalEnglishName = englishName ?? headerInfo.englishName;
    const finalRarity = rarity ?? headerInfo.rarity;
    const finalAttunement = attunement ?? headerInfo.attunement;
    const finalType = this.classifyItemType(type || headerInfo.type || 'loot');

    const description = this.extractDescription(body);
    const itemMechanics = this.parseItemMechanics(rawData['item-mechanics']);
    const uses = itemMechanics?.uses ?? this.parseUses(body);
    const armor = this.parseArmor(body, type, headerInfo.type);
    const properties = armor?.magicalBonus ? ['mgc'] : undefined;
    const weight = armor?.baseItem === 'shield'
      // schema-derived: the locked dnd5e 4.3.9 and 5.3.3 shield records
      // both define the base shield as 6 lb.
      ? { value: 6, units: 'lb' as const }
      : undefined;

    let stages: ItemStage[];
    let structuredActions: ParsedItem['structuredActions'];

    if (itemMechanics) {
      stages = this.parseStages(body);
      structuredActions = itemMechanics.structuredActions;
    } else if (normalizedBody) {
      // Parse YAML when normalizedBody is provided
      const yamlData = yaml.load(normalizedBody) as Record<string, unknown>;
      stages = this.parseYamlStages(yamlData);
      structuredActions = this.parseYamlActions(yamlData);
    } else {
      // Fall back to regex-based parsing
      stages = this.parseStages(body);
      const attacks = this.parseAttackTraits(body);
      const saves = this.parseSaveTraits(body);
      const utilities = this.parseUtilityTraits(body);
      const casts = this.parseCastTraits(body);
      const bulletAbilities = this.parseBulletAbilities(body);

      const allActions = {
        ...attacks,
        ...saves,
        ...utilities,
        ...casts,
        ...bulletAbilities,
      };
      structuredActions = Object.keys(allActions).length > 0 ? allActions as any : undefined;
    }

    return {
      name: finalName,
      englishName: finalEnglishName,
      type: finalType,
      img,
      rarity: finalRarity,
      attunement: finalAttunement,
      description,
      armor,
      properties,
      weight,
      uses,
      stages,
      structuredActions,
    };
  }

  /**
   * Parse the formal Item Intake contract.  It deliberately lives in
   * frontmatter so the original prose can remain intact below it; this makes
   * a generated Markdown file both reviewable by a GM and repeatable by the
   * deterministic Item parser.
   */
  private parseItemMechanics(value: unknown): {
    uses?: UsesData;
    structuredActions?: ParsedItem['structuredActions'];
  } | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('item-mechanics must be a mapping.');
    }
    const contract = value as Record<string, unknown>;
    if (contract.schemaVersion !== 1) {
      throw new Error('item-mechanics.schemaVersion must be 1.');
    }

    let uses: UsesData | undefined;
    if (contract.uses !== undefined) {
      if (typeof contract.uses !== 'object' || contract.uses === null || Array.isArray(contract.uses)) {
        throw new Error('item-mechanics.uses must be a mapping.');
      }
      const rawUses = contract.uses as Record<string, unknown>;
      const max = rawUses.max;
      if ((typeof max !== 'number' && typeof max !== 'string') || String(max).trim() === '') {
        throw new Error('item-mechanics.uses.max is required.');
      }
      const recovery = Array.isArray(rawUses.recovery) ? rawUses.recovery.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          throw new Error(`item-mechanics.uses.recovery[${index}] must be a mapping.`);
        }
        const record = entry as Record<string, unknown>;
        if (typeof record.period !== 'string' || typeof record.type !== 'string') {
          throw new Error(`item-mechanics.uses.recovery[${index}] requires period and type.`);
        }
        return {
          period: record.period,
          type: record.type as UsesData['recovery'][number]['type'],
          ...(typeof record.formula === 'string' ? { formula: record.formula } : {}),
        };
      }) : [];
      uses = { max: String(max), spent: 0, recovery };
    }

    if (!Array.isArray(contract.abilities)) {
      throw new Error('item-mechanics.abilities must be an array.');
    }
    const effects: ActionData[] = [];
    const usesActions: ActionData[] = [];
    const spells: ActionData[] = [];
    for (const [index, entry] of contract.abilities.entries()) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`item-mechanics.abilities[${index}] must be a mapping.`);
      }
      const ability = entry as Record<string, unknown>;
      const id = typeof ability.id === 'string' && ability.id.trim()
        ? ability.id.trim()
        : `ability-${index + 1}`;
      const kind = ability.kind;
      if (kind === 'passive-ac') {
        if (typeof ability.value !== 'number' || !Number.isFinite(ability.value)) {
          throw new Error(`item-mechanics.abilities[${index}].value must be a numeric AC bonus.`);
        }
        effects.push({
          name: `AC +${ability.value} 加值`,
          logicalPath: `item-mechanics/${id}`,
          type: 'effect',
          passiveEffect: { type: 'acBonus', value: ability.value },
        });
        continue;
      }
      if (kind === 'light') {
        const activation = this.mapActivation(String(ability.activation ?? ''));
        const consumption = ability.consumption;
        const bright = ability.bright;
        const dim = ability.dim;
        if (typeof consumption !== 'number' || typeof bright !== 'number' || typeof dim !== 'number') {
          throw new Error(`item-mechanics.abilities[${index}] light requires numeric consumption, bright, and dim.`);
        }
        if (dim < bright || consumption !== 0) {
          throw new Error(`item-mechanics.abilities[${index}] light must have dim >= bright and zero consumption.`);
        }
        usesActions.push({
          name: '点亮',
          logicalPath: `item-mechanics/${id}`,
          type: 'use',
          light: {
            bright,
            dim,
            activation,
            consumption,
            ...(ability.extinguish === 'disable-effect' ? { extinguish: 'disable-effect' as const } : {}),
          },
          useAction: { consumption, activation },
        });
        continue;
      }
      if (kind === 'spell') {
        const spell = ability.spell;
        if (typeof spell !== 'object' || spell === null || Array.isArray(spell)) {
          throw new Error(`item-mechanics.abilities[${index}].spell must be a mapping.`);
        }
        const spellData = spell as Record<string, unknown>;
        if (typeof spellData.identifier !== 'string' || typeof spellData.name !== 'string') {
          throw new Error(`item-mechanics.abilities[${index}].spell requires identifier and name.`);
        }
        if (typeof ability.consumption !== 'number' || ability.consumption < 0) {
          throw new Error(`item-mechanics.abilities[${index}].consumption must be a non-negative number.`);
        }
        spells.push({
          name: `施展 ${spellData.name}`,
          logicalPath: `item-mechanics/${id}`,
          type: 'spell',
          spellName: spellData.name,
          englishName: spellData.name,
          spellIdentifier: spellData.identifier,
          useAction: {
            consumption: ability.consumption,
            activation: this.mapActivation(String(ability.activation ?? 'action')),
          },
        });
        continue;
      }
      throw new Error(`item-mechanics.abilities[${index}].kind is unsupported.`);
    }

    const structuredActions: ParsedItem['structuredActions'] = {
      ...(effects.length > 0 ? { effects } : {}),
      ...(usesActions.length > 0 ? { uses: usesActions } : {}),
      ...(spells.length > 0 ? { spells } : {}),
    };
    return {
      uses,
      structuredActions: Object.keys(structuredActions).length > 0 ? structuredActions : undefined,
    };
  }

  /**
   * Parse item stages from YAML data structure
   */
  private parseYamlStages(yamlData: Record<string, unknown>): ItemStage[] {
    const stages: ItemStage[] = [];
    const stagesData = yamlData['stages'];

    if (!Array.isArray(stagesData)) {
      return stages;
    }

    for (const stage of stagesData) {
      if (typeof stage !== 'object' || stage === null) {
        continue;
      }

      const stageObj = stage as Record<string, unknown>;
      const itemStage: ItemStage = {
        name: typeof stageObj['name'] === 'string' ? stageObj['name'] : '',
        description: typeof stageObj['description'] === 'string' ? stageObj['description'] : undefined,
        requirements: Array.isArray(stageObj['requirements'])
          ? stageObj['requirements'].filter((r): r is string => typeof r === 'string')
          : undefined,
      };

      // Parse structured actions from abilities within this stage
      const abilities = stageObj['abilities'];
      if (Array.isArray(abilities)) {
        itemStage.actions = this.parseYamlAbilities(abilities);
      }

      stages.push(itemStage);
    }

    return stages;
  }

  /**
   * Parse abilities array into structured action data
   */
  private parseYamlAbilities(abilities: unknown[]): NonNullable<ItemStage['actions']> {
    const effects: ActionData[] = [];
    const uses: ActionData[] = [];
    const spells: ActionData[] = [];
    const saves: ActionData[] = [];

    for (const ability of abilities) {
      if (typeof ability !== 'object' || ability === null) {
        continue;
      }

      const abilityObj = ability as Record<string, unknown>;
      const abilityType = typeof abilityObj['type'] === 'string' ? abilityObj['type'] : 'effect';
      const abilityName = typeof abilityObj['name'] === 'string' ? abilityObj['name'] : 'Unknown Ability';

      const actionData = this.convertYamlAbilityToAction(abilityObj, abilityName);
      if (!actionData) continue;

      switch (abilityType) {
        case 'effect':
          effects.push(actionData);
          break;
        case 'use':
          uses.push(actionData);
          break;
        case 'spell':
          spells.push(actionData);
          break;
        case 'save':
          saves.push(actionData);
          break;
        default:
          effects.push(actionData);
      }
    }

    return {
      ...(effects.length > 0 ? { effects } : {}),
      ...(uses.length > 0 ? { uses } : {}),
      ...(spells.length > 0 ? { spells } : {}),
      ...(saves.length > 0 ? { saves } : {}),
    };
  }

  /**
   * Convert a YAML ability object to ActionData
   */
  private convertYamlAbilityToAction(abilityObj: Record<string, unknown>, name: string): ActionData | null {
    const abilityType = typeof abilityObj['type'] === 'string' ? abilityObj['type'] : 'effect';

    // Handle AC bonus effect
    if (abilityObj['acBonus'] !== undefined) {
      const acBonus = typeof abilityObj['acBonus'] === 'number' ? abilityObj['acBonus'] : 0;
      return {
        name,
        type: 'effect',
        passiveEffect: {
          type: 'acBonus',
          value: acBonus,
          description: abilityObj['description'] as string | undefined,
        },
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Handle water breathing effect
    if (abilityObj['waterBreathing'] === true) {
      return {
        name,
        type: 'effect',
        passiveEffect: {
          type: 'senses',
          value: '水中呼吸',
          description: abilityObj['description'] as string | undefined,
        },
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Handle swimming speed effect
    if (abilityObj['swimmingSpeed'] !== undefined) {
      const speedValue = abilityObj['swimmingSpeed'];
      return {
        name,
        type: 'effect',
        passiveEffect: {
          type: 'speed',
          value: typeof speedValue === 'number' ? speedValue : 'equal',
          description: abilityObj['description'] as string | undefined,
        },
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Handle save ability (has DC)
    if (abilityObj['dc'] !== undefined || abilityType === 'save') {
      const dc = typeof abilityObj['dc'] === 'number' ? abilityObj['dc'] : 18;
      const ability = typeof abilityObj['ability'] === 'string' ? abilityObj['ability'] : 'con';
      const damages: Damage[] = [];

      if (abilityObj['damage']) {
        const damageData = abilityObj['damage'];
        if (typeof damageData === 'string') {
          const damageMatch = damageData.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([\u4e00-\u9fa5]+)伤害/);
          if (damageMatch) {
            damages.push({
              formula: damageMatch[1]?.replace(/\s*/g, '') || '',
              type: this.mapDamageType(damageMatch[2] || 'bludgeoning'),
            });
          }
        }
      }

      return {
        name,
        type: 'save',
        save: {
          dc,
          ability,
          onFail: abilityObj['onFail'] as string | undefined,
        },
        damage: damages.length > 0 ? damages : undefined,
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Handle spell ability
    if (abilityObj['spellName'] !== undefined || abilityType === 'spell') {
      const spellName = typeof abilityObj['spellName'] === 'string'
        ? abilityObj['spellName']
        : (abilityObj['spell'] as string | undefined);
      const usesPerDay = typeof abilityObj['usesPerDay'] === 'number' ? abilityObj['usesPerDay'] : 1;
      const activation = abilityObj['activation'] as string | undefined;

      return {
        name,
        type: 'spell',
        spellName,
        usesPerDay,
        useAction: activation ? {
          consumption: usesPerDay,
          activation: this.mapActivation(activation),
          description: abilityObj['description'] as string | undefined,
        } : undefined,
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Handle use ability (charge-consuming without DC)
    if (abilityObj['consumption'] !== undefined || abilityType === 'use') {
      const consumption = typeof abilityObj['consumption'] === 'number' ? abilityObj['consumption'] : 1;
      const activation = abilityObj['activation'] as string | undefined;

      return {
        name,
        type: 'use',
        useAction: {
          consumption,
          activation: this.mapActivation(activation || 'action'),
          description: abilityObj['description'] as string | undefined,
        },
        desc: abilityObj['description'] as string | undefined,
      };
    }

    // Default: utility/effect
    return {
      name,
      type: 'effect',
      passiveEffect: {
        type: 'other',
        description: abilityObj['description'] as string | undefined,
      },
      desc: abilityObj['description'] as string | undefined,
    };
  }

  /**
   * Parse structured actions from YAML data (top-level abilities)
   */
  private parseYamlActions(yamlData: Record<string, unknown>): ParsedItem['structuredActions'] {
    const abilities = yamlData['abilities'];

    if (!Array.isArray(abilities)) {
      return undefined;
    }

    const actions = this.parseYamlAbilities(abilities);

    return Object.keys(actions).length > 0 ? actions as any : undefined;
  }

  private mapActivation(activation: string): 'action' | 'bonus' | 'reaction' | 'free' {
    const lower = activation.toLowerCase();
    if (lower.includes('附赠') || lower.includes('bonus')) return 'bonus';
    if (lower.includes('反应') || lower.includes('reaction')) return 'reaction';
    if (lower.includes('免费') || lower.includes('free')) return 'free';
    return 'action';
  }

  private splitContent(content: string): { frontmatter: string; body: string } {
    const normalized = content.trim();

    // Standard Jekyll-style frontmatter: ---\n...\n---\nbody
    const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (match) {
      return { frontmatter: match[1] ?? '', body: (match[2] ?? '').trim() };
    }

    const sepMatch = normalized.match(/^([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (sepMatch) {
      return { frontmatter: sepMatch[1] ?? '', body: (sepMatch[2] ?? '').trim() };
    }

    return { frontmatter: normalized, body: '' };
  }

  private parseName(rawData: Record<string, unknown>): string {
    return this.readString(rawData, ['名称', 'name']) ?? 'Unknown Item';
  }

  private parseEnglishName(rawData: Record<string, unknown>): string | undefined {
    return this.readString(rawData, ['英文名', 'englishName', 'english_name']);
  }

  private parseType(rawData: Record<string, unknown>): string | undefined {
    return this.readString(rawData, ['类型', 'type', 'itemType', 'item_type']);
  }

  private parseImage(rawData: Record<string, unknown>): string | undefined {
    const image = rawData['img'] ?? rawData['image'];
    if (typeof image === 'string' && image.trim()) {
      return image.trim();
    }
    return undefined;
  }

  /**
   * Classify raw type string into dnd5e ItemType
   */
  classifyItemType(rawType: string): ItemType {
    if (!rawType || !rawType.trim()) {
      return 'loot';
    }

    const lower = rawType.toLowerCase().trim();

    // source-derived: item metadata uses these accessory labels as the whole
    // type token, optionally followed by a parenthesized subtype.
    if (
      /^(?:饰品|饰物)(?:\s*[（(][^）)]*[）)])?$/.test(lower)
      || /^accessory(?:\s*\([^)]*\))?$/.test(lower)
    ) {
      return 'equipment';
    }

    // Chinese type mappings
    const chineseMap: Record<string, ItemType> = {
      '武器': 'weapon',
      '武器攻击': 'weapon',
      '护甲': 'armor',
      '盾牌': 'armor',
      '甲': 'armor',
      '装备': 'equipment',
      '奇物': 'equipment',
      '药水': 'consumable',
      '卷轴': 'consumable',
      '消耗品': 'consumable',
      '魔杖': 'wand',
      '法杖': 'staff',
      '杖': 'staff',
      '魔棒': 'rod',
      '弹药': 'ammunition',
      '箭': 'ammunition',
      '弩箭': 'ammunition',
      '工具': 'tool',
      '战利品': 'loot',
      '宝物': 'loot',
      '容器': 'container',
    };

    // English type mappings
    const englishMap: Record<string, ItemType> = {
      'weapon': 'weapon',
      'armor': 'armor',
      'shield': 'armor',
      'equipment': 'equipment',
      'wondrous': 'equipment',
      'potion': 'consumable',
      'scroll': 'consumable',
      'consumable': 'consumable',
      'wand': 'wand',
      'staff': 'staff',
      'rod': 'rod',
      'ammunition': 'ammunition',
      'arrow': 'ammunition',
      'bolt': 'ammunition',
      'tool': 'tool',
      'loot': 'loot',
      'treasure': 'loot',
      'container': 'container',
      'backpack': 'container',
    };

    // Check Chinese map first (more specific patterns)
    for (const [keyword, itemType] of Object.entries(chineseMap)) {
      if (lower.includes(keyword)) {
        return itemType;
      }
    }

    // Check English map
    for (const [keyword, itemType] of Object.entries(englishMap)) {
      if (lower.includes(keyword)) {
        return itemType;
      }
    }

    // Default to loot if unmappable
    return 'loot';
  }

  private parseRarity(rawData: Record<string, unknown>): ItemRarity | undefined {
    const rarity = this.readString(rawData, ['稀有度', 'rarity']);
    return rarity ? this.normalizeRarity(rarity) : undefined;
  }

  private parseAttunement(rawData: Record<string, unknown>): AttunementType | undefined {
    const explicitAttunement = this.readString(rawData, ['attunement']);
    if (explicitAttunement) {
      const normalized = explicitAttunement.toLowerCase();
      if (normalized === 'required' || normalized === 'optional' || normalized === 'none') {
        return normalized;
      }
    }

    // Check require-attunement field
    const requireAttunement = rawData['require-attunement'];
    if (requireAttunement === true || requireAttunement === 'true' || requireAttunement === 'yes') {
      return 'required';
    }

    // Check 需同调 field
    const requiresAttunement = rawData['需同调'];
    if (requiresAttunement === true || requiresAttunement === 'true' || requiresAttunement === 'yes') {
      return 'required';
    }

    return undefined;
  }

  private readString(rawData: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = rawData[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private parseHeaderLine(body: string): {
    name?: string;
    englishName?: string;
    type?: string;
    rarity?: ItemRarity;
    attunement?: AttunementType;
  } {
    const result: ReturnType<typeof this.parseHeaderLine> = {};

    const lines = body.split(/\r?\n/).filter(line => line.trim());

    // Parse header line: ## Name（EnglishName） or ## Name
    for (const line of lines) {
      const headerMatch = line.match(/^##\s*([^（\)]+)(?:（([^）]+)）)?/);
      if (headerMatch) {
        result.name = (headerMatch[1] ?? '').trim();
        if (headerMatch[2]) {
          result.englishName = headerMatch[2].trim();
        }
        break;
      }
    }

    // Parse italic line: *type，rarity（attunement）*
    for (const line of lines) {
      const italicMatch = line.match(/^\*([^*]+)\*$/);
      if (italicMatch) {
        const content = italicMatch[1] ?? '';
        this.parseItalicContent(content, result);
        break;
      }
    }

    return result;
  }

  private parseItalicContent(
    content: string,
    result: {
      type?: string;
      rarity?: ItemRarity;
      attunement?: AttunementType;
    }
  ): void {
    // Split by ， or , to get parts
    const parts = content.split(/[,，]/).map(p => p.trim());

    // Chinese item type keywords
    const typeKeywords = ['武器', '装备', '护甲', '奇物', '饰品', '饰物', '消耗品', '工具', '弹药', '容器', '魔杖', '权杖', 'rod', 'wand', 'staff', 'weapon', 'equipment', 'armor', 'consumable', 'tool', 'ammunition', 'container', 'accessory'];

    // Attunement keywords
    const attunementKeywords = ['需同调', 'require-attunement', 'requires attunement', 'attunement required'];

    for (const part of parts) {
      const lowerPart = part.toLowerCase();

      if (attunementKeywords.some(kw => lowerPart.includes(kw.toLowerCase()))) {
        result.attunement = 'required';
      }

      if (typeKeywords.some(kw => lowerPart.includes(kw.toLowerCase())) && !result.type) {
        result.type = part;
      } else {
        const rarity = this.normalizeRarity(part);
        if (rarity) {
          result.rarity = rarity;
        }
      }
    }
  }

  private normalizeRarity(text: string): ItemRarity | undefined {
    // source-derived: rarity must be an exact source label after removing an
    // attunement qualifier. Substring matching turns prose into mechanics and
    // makes longer labels such as 非常稀有 collide with 稀有.
    const normalized = text
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const rarityMap: Record<string, ItemRarity> = {
      '普通': 'common',
      common: 'common',
      '非普通': 'uncommon',
      uncommon: 'uncommon',
      '稀有': 'rare',
      rare: 'rare',
      '极珍稀': 'veryRare',
      '非常稀有': 'veryRare',
      'very rare': 'veryRare',
      veryrare: 'veryRare',
      '传说': 'legendary',
      legendary: 'legendary',
      '神器': 'artifact',
      artifact: 'artifact',
    };
    return rarityMap[normalized];
  }

  private extractDescription(body: string): string | undefined {
    const lines = body.split(/\r?\n/);
    const descriptionLines: string[] = [];
    let foundHeader = false;
    let foundItalic = false;
    let foundBold = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip the header line (## Name)
      if (!foundHeader && /^##\s/.test(trimmed)) {
        foundHeader = true;
        continue;
      }

      // Skip the italic line (*type，rarity*)
      if (!foundItalic && /^\*[^*]+\*$/.test(trimmed)) {
        foundItalic = true;
        continue;
      }

      // Bold stage headers (**休眠态（Dormant State）.**) mark when stage content begins
      // After bold header, description is over and stage requirements start
      if (!foundBold && /^\*\*[^*]+（[^）]+）\*\*\./.test(trimmed)) {
        foundBold = true;
        continue;
      }

      // Skip empty lines at the start
      if (!foundHeader && !foundItalic && !foundBold && !trimmed) {
        continue;
      }

      // Once we've passed header, italic, or bold, collect all non-empty lines
      if ((foundHeader || foundItalic || foundBold) && trimmed) {
        descriptionLines.push(trimmed);
      }
    }

    if (descriptionLines.length === 0) {
      // The Web workbench also accepts concise, frontmatter-first Item
      // Markdown. If it has ordinary prose but omits the optional display
      // header and italic metadata line, preserving that prose is safer than
      // silently emitting an empty description.
      const plainBody = lines
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
      return plainBody || undefined;
    }

    return descriptionLines.join('\n');
  }

  private parseUses(body: string): UsesData | undefined {
    const normalized = body.replace(/\*\*|__/g, '');
    const chargeMatch = normalized.match(/(?:具有|拥有)\s*(\d+)\s*发?充能/);
    const increaseMatch = normalized.match(/充能数?增加到?\s*(\d+)/);

    if (!chargeMatch && !increaseMatch) {
      return undefined;
    }

    const max = chargeMatch?.[1] ?? increaseMatch?.[1] ?? '3';
    const recovery: UsesData['recovery'] = [];

    if (/每天黎明恢复所有被消耗的充能/.test(normalized)) {
      recovery.push({ period: 'dawn', type: 'recoverAll' });
    } else {
      const formulaMatch = normalized.match(/每天黎明恢复(\d+)/);
      if (formulaMatch) {
        recovery.push({ period: 'dawn', type: 'formula', formula: formulaMatch[1] });
      }
    }

    const diceFormulaMatch = normalized.match(/(?:恢复|每[天日]黎明)\s*(\d+)d(\d+)([+-]\d+)?/);
    if (diceFormulaMatch && recovery.length === 0) {
      const [, num, denom, bonus] = diceFormulaMatch;
      const formula = bonus ? `${num}d${denom}${bonus}` : `${num}d${denom}`;
      recovery.push({ period: 'dawn', type: 'formula', formula });
    }

    return {
      max,
      recovery,
      spent: 0,
    };
  }

  private parseStages(body: string): ItemStage[] {
    return parseItemStages(body);
  }

  /**
   * Parse bullet-point abilities from item body into structured ActionData objects.
   * Classifies each bullet into: effect (passive), spell (casting), use (charge-consuming, no DC), or save (has DC)
   */
  parseBulletAbilities(body: string): { effects?: ActionData[]; uses?: ActionData[]; spells?: ActionData[]; saves?: ActionData[] } {
    const effects: ActionData[] = [];
    const uses: ActionData[] = [];
    const spells: ActionData[] = [];
    const saves: ActionData[] = [];

    const lines = body.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
        continue;
      }

      const ability = trimmed.replace(/^[-*]\s*/, '');
      const action = this.classifyBulletAbility(ability);
      if (!action) continue;

      // Handle 'use-and-save' case - bullet has both charge consumption AND save DC
      if (action === 'use-and-save') {
        const useEntry = this.parseBulletUse(ability);
        const saveEntry = this.parseBulletSave(ability);
        uses.push(useEntry);
        saves.push(saveEntry);
        continue;
      }

      switch (action.type) {
        case 'effect':
          effects.push(action);
          break;
        case 'spell':
          spells.push(action);
          break;
        case 'use':
          uses.push(action);
          break;
        case 'save':
          saves.push(action);
          break;
      }
    }

    return {
      ...(effects.length > 0 ? { effects } : {}),
      ...(uses.length > 0 ? { uses } : {}),
      ...(spells.length > 0 ? { spells } : {}),
      ...(saves.length > 0 ? { saves } : {}),
    };
  }

  /**
   * Classify a bullet ability text into ActionData with appropriate type and parsed fields.
   * Returns 'use-and-save' string to indicate a bullet should generate TWO entries.
   */
  private classifyBulletAbility(text: string): ActionData | null | 'use-and-save' {
    const spellMatch = text.match(/施展\s*\*([^*]+)\*\s*（?\*([^*]+)\*）?|施展\s*([^\s\d]+)/);
    if (/施展\s*\*[^*]+\*|施展\s*[^\s\d]+/.test(text) && spellMatch) {
      return this.parseBulletSpell(text, spellMatch);
    }

    // Check USE FIRST - if bullet has "消耗X发充能", it's primarily a use ability
    // If it also has DC (for the save effect that follows), generate BOTH entries
    if (/消耗\s*\d+\s*(发|点).*充能|无需动作|以一个附赠动作/.test(text)) {
      if (/\bDC\s*\d+\b|进行\s*\d+\s*DC|体质豁免/.test(text) && /\d+d\d+/.test(text)) {
        // Bullet has BOTH use (charge consumption) AND save (DC + damage)
        // Return special marker to generate two entries
        return 'use-and-save';
      }
      return this.parseBulletUse(text);
    }

    // Check save only if NOT a use bullet
    if (/\bDC\s*\d+\b|进行\s*\d+\s*DC|体质豁免/.test(text) && /\d+d\d+/.test(text)) {
      return this.parseBulletSave(text);
    }

    if (/AC\s*\+\s*\d|获得\s*\+\s*\d\s*加值|水中呼吸|游泳速度|光耀伤害/.test(text) ||
        (/获得.*能力|增加.*加值|加值.*增加/.test(text) && !/DC\s*\d+/.test(text))) {
      return this.parseBulletEffect(text);
    }

    return null;
  }

  /**
   * Parse a bullet as spellcasting ability
   */
  private parseBulletSpell(text: string, match: RegExpMatchArray): ActionData {
    let spellName = '';
    let englishName: string | undefined;
    if (match[1]) {
      spellName = match[1].trim();
    } else if (match[3]) {
      spellName = match[3].trim();
    }
    if (match[2]) {
      englishName = match[2].trim();
    }
    spellName = spellName.replace(/[。.。]+$/, '');

    const usesMatch = text.match(/消耗\s*(\d+)\s*(发|点)/);
    const consumption = usesMatch ? parseInt(usesMatch[1] ?? '1', 10) : 1;

    let activation = 'action';
    if (/附赠动作/.test(text)) {
      activation = 'bonus';
    } else if (/无需动作|免费动作/.test(text)) {
      activation = 'free';
    } else if (/反应/.test(text)) {
      activation = 'reaction';
    }

    return {
      name: `施展 ${spellName}`,
      type: 'spell',
      spellName,
      englishName,
      useAction: {
        consumption,
        activation: activation as 'action' | 'bonus' | 'reaction' | 'free',
        description: text,
      },
    };
  }

  /**
   * Parse a bullet as charge-consuming use ability (no DC)
   */
  private parseBulletUse(text: string): ActionData {
    const usesMatch = text.match(/消耗\s*(\d+)\s*(发|点)/);
    const consumption = usesMatch ? parseInt(usesMatch[1] ?? '1', 10) : 1;

    let activation = 'action';
    if (/附赠动作/.test(text)) {
      activation = 'bonus';
    } else if (/无需动作|免费动作/.test(text)) {
      activation = 'free';
    } else if (/反应/.test(text)) {
      activation = 'reaction';
    }

    let name = '使用饰物能力';
    if (/结束.*状态|结束.*状态/.test(text)) {
      name = '结束状态';
    } else if (/重新进行豁免/.test(text)) {
      name = '重掷豁免';
    } else if (/传送/.test(text)) {
      name = '传送';
    }

    return {
      name,
      type: 'use',
      useAction: {
        consumption,
        activation: activation as 'action' | 'bonus' | 'reaction' | 'free',
        description: text,
      },
    };
  }

  /**
   * Parse a bullet as save-based ability (has DC and damage)
   */
  private parseBulletSave(text: string): ActionData {
    const dcMatch = text.match(/\bDC\s*(\d+)\b/i);
    const dc = dcMatch ? parseInt(dcMatch[1] ?? '18', 10) : 18;

    const damageMatch = text.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*(光耀|火焰|寒冷|闪电|力场|暗蚀|毒素|强酸|心灵|穿刺|钝击|挥砍)伤害/);
    const damages: Damage[] = [];
    if (damageMatch) {
      damages.push({
        formula: damageMatch[1]?.replace(/\s*/g, '') || '',
        type: this.mapDamageType(damageMatch[2] || 'bludgeoning'),
      });
    }

    const ability = this.extractSaveAbility(text) ?? '';

    let name = '保存效应';
    if (/传送/.test(text)) {
      name = '传送';
    }

    return {
      name,
      type: 'save',
      save: {
        dc,
        ability,
        ...this.extractBulletFailure(text),
      },
      damage: damages.length > 0 ? damages : undefined,
      desc: text,
    };
  }

  private extractSaveAbility(text: string): string | undefined {
    const abilityEntries: Array<[RegExp, string]> = [
      [/(?:力量|strength|\bstr\b)\s*(?:豁免|saving throw|save)/i, 'str'],
      [/(?:敏捷|dexterity|\bdex\b)\s*(?:豁免|saving throw|save)/i, 'dex'],
      [/(?:体质|constitution|\bcon\b)\s*(?:豁免|saving throw|save)/i, 'con'],
      [/(?:智力|intelligence|\bint\b)\s*(?:豁免|saving throw|save)/i, 'int'],
      [/(?:感知|wisdom|\bwis\b)\s*(?:豁免|saving throw|save)/i, 'wis'],
      [/(?:魅力|charisma|\bcha\b)\s*(?:豁免|saving throw|save)/i, 'cha'],
      [/(?:豁免|saving throw|save)\s*(?:力量|strength|\bstr\b)/i, 'str'],
      [/(?:豁免|saving throw|save)\s*(?:敏捷|dexterity|\bdex\b)/i, 'dex'],
      [/(?:豁免|saving throw|save)\s*(?:体质|constitution|\bcon\b)/i, 'con'],
      [/(?:豁免|saving throw|save)\s*(?:智力|intelligence|\bint\b)/i, 'int'],
      [/(?:豁免|saving throw|save)\s*(?:感知|wisdom|\bwis\b)/i, 'wis'],
      [/(?:豁免|saving throw|save)\s*(?:魅力|charisma|\bcha\b)/i, 'cha'],
    ];

    return abilityEntries.find(([pattern]) => pattern.test(text))?.[1];
  }

  private extractBulletFailure(text: string): Pick<NonNullable<ActionData['save']>, 'onFail'> {
    const failureText = text.match(/(?:失败|failure|failed save)[:：]?\s*([^。.;]+)/i)?.[1] ?? text;
    if (/(?:目盲|blinded)/i.test(failureText)) {
      const onFail = '目盲';
      return { onFail };
    }
    return {};
  }

  /**
   * Parse a bullet as passive effect (AC bonus, water breathing, etc.)
   */
  private parseBulletEffect(text: string): ActionData {
    let name = '被动效果';
    let passiveEffect: ActionData['passiveEffect'] = { type: 'other', description: text };

    const acMatch = text.match(/(?:AC\s*)?获得\s*\+\s*(\d+)\s*加值|AC\s*\+\s*(\d+)|额外\s*AC\s*加值?\s*增加\s*到\s*\+\s*(\d+)/);
    if (acMatch) {
      const bonus = parseInt(acMatch[1] ?? acMatch[2] ?? acMatch[3] ?? '0', 10);
      name = `AC +${bonus} 加值`;
      passiveEffect = { type: 'acBonus', value: bonus, description: text };
    } else if (/水中呼吸/.test(text)) {
      name = '水中呼吸';
      passiveEffect = { type: 'senses', value: '水中呼吸', description: text };
    } else if (/游泳速度/.test(text)) {
      name = '游泳速度';
      const speedMatch = text.match(/行走速度的\s*(\d+)\s*倍|(\d+)\s*尺/);
      const value = speedMatch ? speedMatch[1] || speedMatch[2] : 'equal';
      passiveEffect = { type: 'speed', value, description: text };
    }

    return {
      name,
      type: 'effect',
      passiveEffect,
      desc: text,
    };
  }

  private mapDamageType(typeRaw: string): string {
    const map: Record<string, string> = {
      '光耀': 'radiant', '火焰': 'fire', '寒冷': 'cold', '闪电': 'lightning',
      '力场': 'force', '暗蚀': 'necrotic', '毒素': 'poison', '强酸': 'acid',
      '心灵': 'psychic', '穿刺': 'piercing', '钝击': 'bludgeoning', '挥砍': 'slashing',
    };
    return map[typeRaw] || 'bludgeoning';
  }

  private parseTraits(body: string): Array<{ name: string; description: string }> {
    const traits: Array<{ name: string; description: string }> = [];
    const stageKeywords = ['休眠态', 'Dormant', '觉醒态', 'Awakened', '升华态', 'Exalted'];
    const traitPattern = /^\*\*([^*（]+)（([^）]+)）\.\*\*\s*(.*)$/;

    const lines = body.split(/\r?\n/);
    let currentTrait: { name: string; description: string } | null = null;
    let descriptionLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      const isStage = stageKeywords.some(kw => {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^\\*\\*${escapedKw}`);
        return pattern.test(trimmed);
      });

      if (isStage) {
        if (currentTrait) {
          currentTrait.description = descriptionLines.join(' ').trim();
          traits.push(currentTrait);
        }
        currentTrait = null;
        descriptionLines = [];
        continue;
      }

      const traitMatch = trimmed.match(traitPattern);
      if (traitMatch && traitMatch[1] !== undefined) {
        if (currentTrait) {
          currentTrait.description = descriptionLines.join(' ').trim();
          traits.push(currentTrait);
        }
        currentTrait = {
          name: traitMatch[1].trim() + '（' + (traitMatch[2]?.trim() ?? '') + '）',
          description: '',
        };
        descriptionLines = traitMatch[3] ? [traitMatch[3]] : [];
      } else if (currentTrait && trimmed && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
        descriptionLines.push(trimmed);
      }
    }

    if (currentTrait) {
      currentTrait.description = descriptionLines.join(' ').trim();
      traits.push(currentTrait);
    }

    return traits;
  }

  /**
   * Parse attack traits from item body and return structuredActions with attacks
   */
  private parseAttackTraits(body: string): { attacks?: ActionData[] } {
    const traits = this.parseTraits(body);
    const attacks: ActionData[] = [];

    for (const trait of traits) {
      if (this.isAttackTrait(trait.description)) {
        const attack = this.parseAttackFromTrait(trait.name, trait.description);
        if (attack) {
          attacks.push(attack);
        }
      }
    }

    return attacks.length > 0 ? { attacks } : {};
  }

  /**
   * Check if a trait description contains attack mechanics
   */
  private isAttackTrait(description: string): boolean {
    // Must contain both "攻击动作" (attack action) and damage info
    const hasAttackAction = /攻击动作|攻击检定|进行攻击|武器攻击|远程攻击/i.test(description);
    const hasDamage = /\d+d\d+.*伤害|造成.*伤害/i.test(description);
    return hasAttackAction && hasDamage;
  }

  /**
   * Parse attack data from a trait description
   */
  private parseAttackFromTrait(name: string, description: string): ActionData | null {
    const englishNameMatch = name.match(/（([^）]+)）[。.]?$/);
    const englishName = englishNameMatch ? englishNameMatch[1] : undefined;
    const cleanName = name.replace(/（([^）]+)）[。.]?$/, '').trim();

    // Parse damage
    const ability = this.parseExplicitAttackAbility(description);
    const damage = this.parseAttackDamage(description).map((entry) => ability
      ? { ...entry, formula: entry.formula.replace(`@${ability}`, '@mod') }
      : entry);
    if (!damage.length) {
      return null;
    }

    // Parse range/reach
    const rangeInfo = this.parseAttackRange(description);
    const isRanged = rangeInfo.isRanged;
    const range = rangeInfo.range;
    const reach = rangeInfo.reach;

    // Parse to-hit (may be 0 if not determinable from text)
    const toHit = this.parseAttackToHit(description);

    return {
      name: cleanName,
      englishName,
      type: 'attack',
      desc: description,
      attack: {
        type: isRanged ? 'rwak' : 'mwak',
        ...(ability ? { ability } : {}),
        toHit,
        range,
        reach,
        damage,
      },
    };
  }

  /**
   * Parse damage from attack trait description
   */
  private parseAttackDamage(description: string): Damage[] {
    const damages: Damage[] = [];

    const attrMap: Record<string, string> = {
      '你力量调整值的': '@str',
      '你敏捷调整值的': '@dex',
      '你体质调整值的': '@con',
      '你智力调整值的': '@int',
      '你感知调整值的': '@wis',
      '你魅力调整值的': '@cha',
    };

    const damagePattern = /(\d+d\d+(?:\s*[+\-]\s*(?:\d+|@\w+))*)\s*(?:[+\-]\s*)?((?:你(?:力量|敏捷|体质|智力|感知|魅力)调整值的?)?)([\u4e00-\u9fa5]+)伤害|(\d+d\d+(?:\s*[+\-]\s*\d+)*)\s*(?:点?)?([\u4e00-\u9fa5]+)伤害|(?<=的)([\u4e00-\u9fa5]+)伤害/gi;

    for (const match of description.matchAll(damagePattern)) {
      let formula: string;
      let typeRaw: string;

      if (match[1] !== undefined) {
        formula = match[1]?.trim() ?? '';
        const attrRef = match[2]?.trim() ?? '';
        typeRaw = match[3]?.trim() ?? '';

        if (attrRef && attrMap[attrRef]) {
          formula = formula + '+' + attrMap[attrRef];
        }
        formula = formula.replace(/\s*([+\-])\s*/g, '$1');
      } else if (match[4] !== undefined) {
        formula = match[4]?.trim() ?? '';
        typeRaw = match[5]?.trim() ?? '';
      } else if (match[6] !== undefined) {
        typeRaw = match[6].trim();
        const typeIndex = match.index ?? 0;
        const formulaPart = description.slice(0, typeIndex);
        const formulaMatch = formulaPart.match(/(\d+d\d+(?:\s*[+\-]\s*(?:\d+|[\u4e00-\u9fa5]+(?!\w)))*)\s*$/);
        formula = formulaMatch?.[1] ?? formulaPart.trim();
      } else {
        continue;
      }

      const typeKey = i18n.getKey(typeRaw);
      let type: string;

      if (typeKey?.includes('Damage')) {
        type = typeKey.replace('DND5E.Damage', '').toLowerCase();
      } else {
        const directMap: Record<string, string> = {
          '穿刺': 'piercing',
          '钝击': 'bludgeoning',
          '挥砍': 'slashing',
          '火焰': 'fire',
          '寒冷': 'cold',
          '闪电': 'lightning',
          '雷鸣': 'thunder',
          '光耀': 'radiant',
          '暗蚀': 'necrotic',
          '力场': 'force',
          '毒素': 'poison',
          '强酸': 'acid',
          '心灵': 'psychic',
        };
        type = directMap[typeRaw] || 'bludgeoning';
      }
      damages.push({ formula, type });
    }

    return damages;
  }

  /**
   * Parse range/reach from attack trait description
   */
  private parseAttackRange(description: string): { isRanged: boolean; range: string; reach?: string } {
    if (/远程攻击/.test(description)) {
      const rangeMatch = description.match(/(\d+)\s*尺/);
      if (rangeMatch) {
        return {
          isRanged: true,
          range: `${rangeMatch[1]} ft`,
        };
      }
      return {
        isRanged: true,
        range: '30 ft',
      };
    }

    const reachMatch = description.match(/(\d+)\s*尺(?:之)?(?:内|范围内)/);
    if (reachMatch) {
      const reachValue = reachMatch[1];
      return {
        isRanged: false,
        range: `${reachValue} ft`,
        reach: `${reachValue} ft`,
      };
    }

    const rangeMatch = description.match(/射程\s*(\d+)(?:\s*\/\s*(\d+))?\s*尺/);
    if (rangeMatch) {
      const range = rangeMatch[2]
        ? `${rangeMatch[1]}/${rangeMatch[2]} ft`
        : `${rangeMatch[1]} ft`;
      return {
        isRanged: true,
        range,
      };
    }

    if (/攻击动作/.test(description)) {
      return {
        isRanged: false,
        range: '5 ft',
      };
    }

    return {
      isRanged: true,
      range: '30 ft',
    };
  }

  private parseAttackToHit(description: string): number {
    const toHitMatch = description.match(/([+-]?\d+)\s*命中/);
    if (toHitMatch?.[1]) {
      return parseInt(toHitMatch[1], 10);
    }

    if (/熟练加值.*力量调整值|熟练加值和力量调整值/.test(description)) {
      return 0;
    }

    return 0;
  }

  private parseSaveTraits(body: string): { saves?: ActionData[] } {
    const traits = this.parseTraits(body);
    const saves: ActionData[] = [];

    for (const trait of traits) {
      if (this.isSaveTrait(trait.description)) {
        const save = this.parseSaveFromTrait(trait.name, trait.description);
        if (save) {
          saves.push(save);
        }
      }
    }

    return saves.length > 0 ? { saves } : {};
  }

  private isSaveTrait(description: string): boolean {
    // source-derived: a saving throw mentioned only as a trigger is not a save
    // rolled by this trait. The trait needs an explicit numeric DC to become a
    // save activity; parseSaveFromTrait enforces the same boundary.
    return /(?:\bDC\s*\d+|豁免(?:检定)?\s*(?:DC\s*)?\d+)/i.test(description);
  }

  private parseSaveFromTrait(name: string, description: string): ActionData | null {
    const englishNameMatch = name.match(/（([^）]+)）[。.]?$/);
    const englishName = englishNameMatch ? englishNameMatch[1] : undefined;
    const cleanName = name.replace(/（([^）]+)）[。.]?$/, '').trim();

    const dcMatch = description.match(/(?:DC|豁免)\s*(\d+)/i);
    if (!dcMatch) return null;
    const dc = parseInt(dcMatch[1] ?? '0', 10);

    const abilityMap: Record<string, string> = {
      '力量': 'str', '敏捷': 'dex', '体质': 'con',
      '智力': 'int', '感知': 'wis', '魅力': 'cha'
    };
    let ability = '';
    const normalizedDescription = description.toLowerCase();
    for (const [cn, en] of Object.entries(abilityMap)) {
      if (description.includes(cn) || normalizedDescription.includes(en)) {
        ability = en;
        break;
      }
    }

    const damages = this.parseAttackDamage(description);

    return {
      name: cleanName,
      englishName,
      type: 'save',
      save: {
        dc,
        ability,
        onSave: undefined,
      },
      damage: damages.length > 0 ? damages : undefined,
    };
  }

  /**
   * Parse utility traits (passive abilities) from item body
   */
  private parseUtilityTraits(body: string): { utilities?: ActionData[] } {
    const traits = this.parseTraits(body);
    const utilities: ActionData[] = [];

    for (const trait of traits) {
      // Skip if it's an attack or save trait
      if (this.isAttackTrait(trait.description)) continue;
      if (this.isSaveTrait(trait.description)) continue;

      // This is a utility trait
      const utility = this.parseUtilityFromTrait(trait.name, trait.description);
      if (utility) {
        utilities.push(utility);
      }
    }

    return utilities.length > 0 ? { utilities } : {};
  }

  /**
   * Parse utility action from a trait
   */
  private parseUtilityFromTrait(name: string, description: string): ActionData | null {
    const englishNameMatch = name.match(/（([^）]+)）[。.]?$/);
    const englishName = englishNameMatch ? englishNameMatch[1] : undefined;
    const cleanName = name.replace(/（([^）]+)）[。.]?$/, '').trim();

    const activation = this.parseExplicitTraitActivation(description);
    if (activation) {
      const activity = this.parseTraitActivityDetails(description);
      return {
        name: cleanName,
        englishName,
        type: 'use',
        desc: description,
        ...(activity ? { activity } : {}),
        useAction: {
          consumption: 0,
          activation,
          description,
          limitedUses: this.parseTraitLimitedUses(description),
        },
      };
    }

    // Utility traits with no explicit action syntax remain descriptive. A bare
    // word such as 反应 in “反应速度” cannot create action economy mechanics.
    return {
      name: cleanName,
      englishName,
      type: 'utility',
      desc: description,
    };
  }

  private parseExplicitAttackAbility(description: string): NonNullable<ActionData['attack']>['ability'] | undefined {
    const abilities = [
      { key: 'str' as const, cn: '力量', en: 'strength' },
      { key: 'dex' as const, cn: '敏捷', en: 'dexterity' },
      { key: 'con' as const, cn: '体质', en: 'constitution' },
      { key: 'int' as const, cn: '智力', en: 'intelligence' },
      { key: 'wis' as const, cn: '感知', en: 'wisdom' },
      { key: 'cha' as const, cn: '魅力', en: 'charisma' },
    ];

    for (const ability of abilities) {
      const chineseForward = new RegExp(`熟练加值[\\s\\S]{0,16}${ability.cn}调整值`);
      const chineseReverse = new RegExp(`${ability.cn}调整值[\\s\\S]{0,16}熟练加值`);
      const englishForward = new RegExp(`proficiency bonus[\\s\\S]{0,24}${ability.en} modifier`, 'i');
      const englishReverse = new RegExp(`${ability.en} modifier[\\s\\S]{0,24}proficiency bonus`, 'i');
      if (
        chineseForward.test(description)
        || chineseReverse.test(description)
        || englishForward.test(description)
        || englishReverse.test(description)
      ) {
        return ability.key;
      }
    }
    return undefined;
  }

  private parseArmor(
    body: string,
    frontmatterType: string | undefined,
    headerType: string | undefined,
  ): ParsedItem['armor'] {
    const typeText = `${frontmatterType ?? ''} ${headerType ?? ''}`;
    if (!/(?:盾牌|\bshield\b)/i.test(typeText)) {
      return undefined;
    }

    const magicalBonus = this.parseAdditionalShieldAcBonus(body);
    return {
      // schema-derived: locked dnd5e 4.3.9 and 5.3.3 both model a normal
      // shield as base armor 2; any explicit extra source bonus is separate.
      value: 2,
      dex: null,
      magicalBonus,
      type: 'shield',
      baseItem: 'shield',
    };
  }

  private parseAdditionalShieldAcBonus(body: string): number | null {
    const clauses = body.split(/[。.!?；;]+/).map((part) => part.trim()).filter(Boolean);
    for (let index = 0; index < clauses.length; index++) {
      const clause = `${clauses[index] ?? ''} ${clauses[index + 1] ?? ''}`;
      const explicitlyAdditional = /(?:额外|之外|原本.*(?:外|之外)|in addition to|additional)/i.test(clause);
      const mentionsArmorClass = /(?:护甲等级|\bAC\b|armor class)/i.test(clause);
      if (!explicitlyAdditional || !mentionsArmorClass) continue;

      const bonusMatch = clause.match(/(?:额外(?:获得)?\s*|获得\s*|have\s+(?:an?\s*)?)(?:a\s*)?\+\s*(\d+)\s*(?:AC|护甲等级|加值|bonus)?/i)
        ?? clause.match(/\+\s*(\d+)\s*(?:AC|护甲等级|加值|bonus)/i);
      if (bonusMatch?.[1]) {
        return Number.parseInt(bonusMatch[1], 10);
      }
    }
    return null;
  }

  private parseTraitActivityDetails(description: string): ActionData['activity'] | undefined {
    const duration = this.parseExplicitActivityDuration(description);
    const aura = description.match(/(?:创造|制造|create(?:s)?|emanation|aura)[\s\S]{0,40}?(\d+)\s*-?\s*(?:尺|feet?|foot)[\s\S]{0,12}?(?:光环|灵光|emanation|aura)/i)
      ?? description.match(/(\d+)\s*-?\s*(?:尺|feet?|foot)[\s\S]{0,12}?(?:光环|灵光|emanation|aura)/i);
    const auraSize = aura?.[1];

    if (!duration && !auraSize) return undefined;
    return {
      ...(duration ? { duration } : {}),
      ...(auraSize ? {
        range: { value: auraSize, units: 'ft' as const },
        target: {
          template: { type: 'radius' as const, size: auraSize, units: 'ft' as const },
        },
      } : {}),
    };
  }

  private parseExplicitActivityDuration(description: string): NonNullable<ActionData['activity']>['duration'] | undefined {
    const durationMatch = description.match(/(?:持续(?:最多)?|维持(?:最多)?|lasts?(?:\s+for|\s+up\s+to)?|up\s+to)\s*(\d+)\s*(轮|分钟|小时|天|rounds?|minutes?|hours?|days?)/i);
    if (!durationMatch?.[1] || !durationMatch[2]) return undefined;

    const unitText = durationMatch[2].toLowerCase();
    const units = /轮|round/.test(unitText)
      ? 'round'
      : /分钟|minute/.test(unitText)
        ? 'minute'
        : /小时|hour/.test(unitText)
          ? 'hour'
          : 'day';
    const concentration = /(?:维持专注|保持专注|maintain(?:s|ing)? concentration|concentration\s*,?\s*(?:for|up to))/i.test(description);

    return { value: durationMatch[1], units, concentration };
  }

  private parseExplicitTraitActivation(description: string): 'action' | 'bonus' | 'reaction' | 'free' | undefined {
    if (/(?:作为(?:一个)?反应|(?:可以|可)用(?:你的|其)?反应|(?:可以|可)使用(?:你的|其)?反应|as (?:a|your) reaction|use your reaction)/i.test(description)) {
      return 'reaction';
    }
    if (/(?:作为(?:一个)?附赠动作|as a bonus action)/i.test(description)) {
      return 'bonus';
    }
    if (/(?:无需动作|不需要动作|without (?:using|requiring) an action)/i.test(description)) {
      return 'free';
    }
    if (/(?:作为(?:一个)?动作|as an action)/i.test(description)) {
      return 'action';
    }
    return undefined;
  }

  private parseTraitLimitedUses(
    description: string,
  ): NonNullable<ActionData['useAction']>['limitedUses'] {
    const onceUntilDawn = /(?:直到|直至)(?:下一个|次日)?黎明前.*(?:无法|不能).*再次使用/i.test(description)
      || /(?:cannot|can't)\s+(?:use\s+)?(?:it|this (?:reaction|ability|feature))?\s*(?:again\s+)?until (?:the )?next dawn/i.test(description);
    if (!onceUntilDawn) return undefined;
    return {
      spent: 0,
      max: '1',
      recovery: [{ period: 'dawn', type: 'recoverAll' }],
    };
  }

  /**
   * Parse cast traits (spellcasting items like wands, staffs, rods)
   */
  private parseCastTraits(body: string): { casts?: ActionData[] } {
    const traits = this.parseTraits(body);
    const casts: ActionData[] = [];

    for (const trait of traits) {
      if (this.isCastTrait(trait.description)) {
        const cast = this.parseCastFromTrait(trait.name, trait.description);
        if (cast) {
          casts.push(cast);
        }
      }
    }

    return casts.length > 0 ? { casts } : {};
  }

  /**
   * Check if a trait description contains spellcasting
   */
  private isCastTrait(description: string): boolean {
    // Must mention spell casting with 施展/cast/施展法术
    return /施展.*\*[^*]+\*|施展\s*[\u4e00-\u9fa5]+|每天\d+次.*施展/i.test(description);
  }

  /**
   * Parse cast data from a trait description
   */
  private parseCastFromTrait(name: string, description: string): ActionData | null {
    const englishNameMatch = name.match(/（([^）]+)）[。.]?$/);
    const englishName = englishNameMatch ? englishNameMatch[1] : undefined;
    const cleanName = name.replace(/（([^）]+)）[。.]?$/, '').trim();

    const spellMatch = description.match(/\*([^*]+)\*/) || description.match(/施展\s*([^\s\d]+)/);
    const spellName = spellMatch ? (spellMatch[1] ?? cleanName).replace(/[。.。]+$/, '').trim() : cleanName;

    const usesMatch = description.match(/每天(\d+)次|消耗(\d+)发/);
    const usesPerDay = usesMatch ? parseInt(usesMatch[1] ?? usesMatch[2] ?? '1', 10) : 1;

    return {
      name: cleanName,
      englishName,
      type: 'utility',
      spellName,
      usesPerDay,
    };
  }
}

/**
 * Parse the source-defined lifecycle stage headers used by the formal Item
 * parser. Browser Intake reuses this exact detector so a provider cannot erase
 * a multi-stage source boundary from its IR.
 */
export function parseItemStages(body: string): ItemStage[] {
  const stages: ItemStage[] = [];
  const stageKeywords = [
    { zh: '休眠态', en: 'Dormant State' },
    { zh: '觉醒态', en: 'Awakened State' },
    { zh: '升华态', en: 'Exalted State' },
  ];

  const lines = body.split(/\r?\n/);
  let currentStage: ItemStage | null = null;
  let inBulletSection = false;
  let currentAbilities: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    let detectedStage = false;
    for (const keyword of stageKeywords) {
      const escapedZh = keyword.zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedEn = keyword.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stagePattern = new RegExp(`^\\*\\*${escapedZh}（${escapedEn}）\\.`);
      if (stagePattern.test(trimmed)) {
        if (currentStage) {
          currentStage.requirements = [...currentAbilities];
          stages.push(currentStage);
        }
        const descMatch = trimmed.match(/^\*\*[^*]+（[^）]+）\*\*\.\s*(.*)$/);
        currentStage = {
          name: keyword.zh,
          description: descMatch ? descMatch[1] : '',
          requirements: [],
        };
        currentAbilities = [];
        inBulletSection = false;
        detectedStage = true;
        break;
      }
    }

    if (detectedStage) continue;

    if (currentStage) {
      if (currentStage.description && !inBulletSection) {
        const introPattern = /在[^，,]+状态下/;
        if (introPattern.test(trimmed)) {
          inBulletSection = true;
          continue;
        }
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        inBulletSection = true;
        const ability = trimmed.replace(/^[-*]\s*/, '');
        currentAbilities.push(ability);
      }
    }
  }

  if (currentStage) {
    currentStage.requirements = [...currentAbilities];
    stages.push(currentStage);
  }

  return stages;
}

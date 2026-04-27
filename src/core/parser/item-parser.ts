import * as yaml from 'js-yaml';
import { detectItemRoute } from './item-router';
import type { ItemParserStrategy } from './item-strategy';
import type { ParsedItem, ItemRarity, AttunementType, ItemType, UsesData, ItemStage } from '../models/item';
import type { ActionData, Damage } from './action';
import { i18n } from '../mapper/i18n';

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
    const rarity = this.parseRarity(rawData);
    const attunement = this.parseAttunement(rawData);

    const headerInfo = this.parseHeaderLine(body);

    const finalName = (name && name !== 'Unknown Item') ? name : (headerInfo.name ?? 'Unknown Item');
    const finalEnglishName = englishName ?? headerInfo.englishName;
    const finalRarity = rarity ?? headerInfo.rarity;
    const finalAttunement = attunement ?? headerInfo.attunement;

    const description = this.extractDescription(body);
    const uses = this.parseUses(body);

    let stages: ItemStage[];
    let structuredActions: ParsedItem['structuredActions'];

    if (normalizedBody) {
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
      type: this.classifyItemType(type || headerInfo.type || 'loot'),
      rarity: finalRarity,
      attunement: finalAttunement,
      description,
      uses,
      stages,
      structuredActions,
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
  private parseYamlAbilities(abilities: unknown[]): ItemStage['actions'] {
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
    const name = rawData['名称'];
    if (typeof name === 'string' && name.trim()) {
      return name.trim();
    }
    return 'Unknown Item';
  }

  private parseEnglishName(rawData: Record<string, unknown>): string | undefined {
    const englishName = rawData['英文名'];
    if (typeof englishName === 'string' && englishName.trim()) {
      return englishName.trim();
    }
    return undefined;
  }

  private parseType(rawData: Record<string, unknown>): string | undefined {
    const type = rawData['类型'];
    if (typeof type === 'string' && type.trim()) {
      return type.trim();
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
    const rarity = rawData['稀有度'];
    if (typeof rarity !== 'string') {
      return undefined;
    }

    const rarityMap: Record<string, ItemRarity> = {
      '普通': 'common',
      'common': 'common',
      'uncommon': 'uncommon',
      '稀有': 'uncommon',
      'rare': 'rare',
      '非常稀有': 'veryrare',
      'very rare': 'veryrare',
      'veryrare': 'veryrare',
      '传说': 'legendary',
      'legendary': 'legendary',
      'artifact': 'artifact',
      '神器': 'artifact',
    };

    const normalized = rarity.replace(/（[^）]+）/g, '').trim();
    return rarityMap[normalized];
  }

  private parseAttunement(rawData: Record<string, unknown>): AttunementType | undefined {
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
    const typeKeywords = ['武器', '装备', '护甲', '奇物', '消耗品', '工具', '弹药', '容器', '魔杖', '权杖', 'rod', 'wand', 'staff', 'weapon', 'equipment', 'armor', 'consumable', 'tool', 'ammunition', 'container'];

    // Rarity keywords
    const rarityKeywords = ['普通', 'common', '稀有', 'uncommon', 'rare', '非常稀有', 'very rare', 'veryrare', '传说', 'legendary', '神器', 'artifact'];

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
        const isRarity = rarityKeywords.some(kw => lowerPart.includes(kw.toLowerCase()));
        if (isRarity) {
          const rarity = this.normalizeRarity(part);
          if (rarity) {
            result.rarity = rarity;
          }
        }
      }
    }
  }

  private normalizeRarity(text: string): ItemRarity | undefined {
    const lower = text.toLowerCase();

    if (lower.includes('普通') || lower === 'common') return 'common';
    if (lower.includes('稀有') || lower === 'uncommon') return 'uncommon';
    if (lower.includes('rare') || lower === 'rare') return 'rare';
    if (lower.includes('非常稀有') || lower.includes('very rare') || lower === 'veryrare') return 'veryrare';
    if (lower.includes('传说') || lower === 'legendary') return 'legendary';
    if (lower.includes('artifact') || lower.includes('神器')) return 'artifact';

    return undefined;
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
      return undefined;
    }

    return descriptionLines.join('\n');
  }

  private parseUses(body: string): UsesData | undefined {
    const chargeMatch = body.match(/(?:具有|拥有)\s*(\d+)\s*发?充能/);
    const increaseMatch = body.match(/充能数?增加到?\s*(\d+)/);
    
    if (!chargeMatch && !increaseMatch) {
      return undefined;
    }

    const max = chargeMatch?.[1] ?? increaseMatch?.[1] ?? '3';
    const recovery: UsesData['recovery'] = [];

    if (/每天黎明恢复所有被消耗的充能/.test(body)) {
      recovery.push({ period: 'dawn', type: 'recoverAll' });
    } else {
      const formulaMatch = body.match(/每天黎明恢复(\d+)/);
      if (formulaMatch) {
        recovery.push({ period: 'dawn', type: 'formula', formula: formulaMatch[1] });
      }
    }

    const diceFormulaMatch = body.match(/(?:恢复|每[天日]黎明)\s*(\d+)d(\d+)([+-]\d+)?/);
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

    const ability = 'con';
    if (/力量豁免/.test(text)) {
      ability.match(/str/);
    } else if (/敏捷豁免/.test(text)) {
      ability.match(/dex/);
    } else if (/体质豁免/.test(text)) {
      ability.match(/con/);
    } else if (/智力豁免/.test(text)) {
      ability.match(/int/);
    } else if (/感知豁免/.test(text)) {
      ability.match(/wis/);
    } else if (/魅力豁免/.test(text)) {
      ability.match(/cha/);
    }

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
        onFail: '目盲',
      },
      damage: damages.length > 0 ? damages : undefined,
      desc: text,
    };
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
    const damage = this.parseAttackDamage(description);
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
      attack: {
        type: isRanged ? 'rwak' : 'mwak',
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
    return /(?:DC|豁免)\s*\d+|豁免检定/.test(description);
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
    let ability = 'str';
    for (const [cn, en] of Object.entries(abilityMap)) {
      if (description.includes(cn) || description.toLowerCase().includes(en)) {
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
  private parseUtilityFromTrait(name: string, _description: string): ActionData | null {
    const englishNameMatch = name.match(/（([^）]+)）[。.]?$/);
    const englishName = englishNameMatch ? englishNameMatch[1] : undefined;
    const cleanName = name.replace(/（([^）]+)）[。.]?$/, '').trim();

    // Utility traits have no attack or save mechanics
    // They just describe passive effects
    return {
      name: cleanName,
      englishName,
      type: 'utility',
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

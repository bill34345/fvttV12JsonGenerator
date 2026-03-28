import * as yaml from 'js-yaml';
import { FIELD_MAPPING, type ParsedNPC, type FieldDefinition } from '../../config/mapping';
import { i18n } from '../mapper/i18n';
import { CHINESE_ACTION_REGEX } from './chineseActionRegex';
import { StructuredActionParser } from './structuredAction';
import type { StructuredActionData } from '../models/action';

type YamlBodySectionKey =
  | 'traits'
  | 'actions'
  | 'bonus_actions'
  | 'reactions'
  | 'legendary_actions'
  | 'raw_notes';

type YamlBodyExtractionResult = {
  biography: string;
  traits: string[];
  actions: string[];
  bonus_actions: string[];
  reactions: string[];
  legendary_actions: string[];
};

export class YamlParser {
  public parse(content: string): ParsedNPC {
    const { frontmatter, body } = this.splitContent(content);
    const rawData = yaml.load(frontmatter) as Record<string, any>;
    
    const result: ParsedNPC = {
      name: '',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: { bypasses: [] },
      skills: {},
      skillBonuses: {},
      skillPassives: {},
      saves: [],
      saveBonuses: {},
      items: []
    };

    if (body.trim()) {
      const extracted = this.extractBodySections(body);
      const biographyParts = [extracted.biography, ...extracted.traits].filter((part) => part.trim());
      if (biographyParts.length > 0) {
        result.details.biography = biographyParts.join('\n').trim();
      }
      if (extracted.actions.length > 0) {
        result.actions = extracted.actions;
      }
      if (extracted.bonus_actions.length > 0) {
        result.bonus_actions = extracted.bonus_actions;
      }
      if (extracted.reactions.length > 0) {
        result.reactions = extracted.reactions;
      }
      if (extracted.legendary_actions.length > 0) {
        result.legendary_actions = extracted.legendary_actions;
        const first = extracted.legendary_actions[0];
        if (typeof first === 'string') {
          const match =
            first.match(CHINESE_ACTION_REGEX.CHINESE_LEGENDARY_ACTION_COUNT) ??
            first.match(CHINESE_ACTION_REGEX.LEGENDARY_ACTION_COUNT);
          if (match?.[1]) {
            const count = parseInt(match[1]);
            if (!result.attributes.legact) {
              result.attributes.legact = { value: count, max: count };
            }
          }
        }
      }
    }

    this.traverse(rawData, result);

    if (rawData && typeof rawData === 'object') {
      if ('豁免熟练' in rawData) {
        this.parseSavingThrows((rawData as Record<string, unknown>)['豁免熟练'], result);
      }
      if ('技能' in rawData) {
        this.parseSkills((rawData as Record<string, Record<string, string | number>>)['技能'], result);
      }
      if ('感官' in rawData) {
        const parsedSenses = this.parseSenses((rawData as Record<string, unknown>)['感官']);
        result.traits.senses = parsedSenses.senses;
        if (parsedSenses.passivePerception !== undefined) {
          result.skillPassives = {
            ...(result.skillPassives || {}),
            prc: parsedSenses.passivePerception,
          };
        }
      }
    }
    
    return result;
  }

  private splitContent(content: string): { frontmatter: string; body: string } {
    const normalized = content.trim();
    
    // Case 1: Standard Jekyll-style frontmatter
    const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (match) {
      return { frontmatter: match[1]!, body: match[2]!.trim() };
    }

    // Case 2: No leading ---, but has a separator
    const sepMatch = normalized.match(/^([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (sepMatch) {
      return { frontmatter: sepMatch[1]!, body: sepMatch[2]!.trim() };
    }
    
    return { frontmatter: normalized, body: '' };
  }

  private traverse(obj: any, result: ParsedNPC) {
    for (const [key, value] of Object.entries(obj)) {
      const mapping = FIELD_MAPPING[key];

      if (mapping) {
        this.applyField(mapping, value, result);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested container (e.g. "能力" or "Attributes")
        this.traverse(value, result);
      } else {
        // Unknown key at leaf level -> Strict Mode Error
        throw new Error(`InvalidField: Unknown field '${key}'`);
      }
    }
  }

  private applyField(mapping: FieldDefinition, value: any, result: ParsedNPC) {
    const internalKey = mapping.key;
    const path = mapping.path; // e.g. "system.abilities.str.value"

    // Map Value if needed (e.g. for Saves array)
    const processedValue = this.processValue(mapping, value);

    // Determine target location in ParsedNPC
    if (path === 'name') {
      result.name = processedValue;
    } else if (path === 'type') {
      // ignore, fixed to npc
    } else if (path.startsWith('system.abilities')) {
      if (internalKey === 'saves') {
        this.parseSavingThrows(processedValue, result);
      } else {
        // system.abilities.str.value -> abilities.str
        // internalKey is "str"
        result.abilities[internalKey as keyof ParsedNPC['abilities']] = processedValue;
      }
    } else if (path.startsWith('system.attributes')) {
      if (internalKey === 'movement') {
        result.attributes.movement = this.parseMovement(processedValue);
      } else if (internalKey === 'hp') {
        // Handle HP format "256 (19d12+133)"
        result.attributes.hp = this.parseHP(processedValue);
      } else if (internalKey === 'ac') {
        // Handle AC format "19 (natural armor)"
        result.attributes.ac = this.parseAC(processedValue);
      } else if (internalKey === 'init') {
        result.attributes.init = parseInt(processedValue);
      } else if (internalKey === 'prof') {
        result.attributes.prof = parseInt(processedValue);
      }
    } else if (path.startsWith('system.details')) {
      if (internalKey === 'cr') result.details.cr = parseInt(processedValue);
      if (internalKey === 'xp') result.details.xp = parseInt(processedValue);
      if (internalKey === 'alignment') result.details.alignment = processedValue;
      if (internalKey === 'creatureType') result.details.creatureType = processedValue;
      // biography handled via body
    } else if (path === 'items') {
      if (internalKey === 'actions') result.actions = processedValue;
      if (internalKey === 'reactions') result.reactions = processedValue;
      if (internalKey === 'bonus_actions') result.bonus_actions = processedValue;
      if (internalKey === 'legendary_actions') {
        result.legendary_actions = processedValue;
        if (Array.isArray(processedValue) && processedValue.length > 0) {
          const first = processedValue[0];
          if (typeof first === 'string') {
            const match = first.match(CHINESE_ACTION_REGEX.CHINESE_LEGENDARY_ACTION_COUNT) || 
                          first.match(CHINESE_ACTION_REGEX.LEGENDARY_ACTION_COUNT);
            if (match && match[1]) {
              const count = parseInt(match[1]);
              if (!result.attributes.legact) {
                result.attributes.legact = { value: count, max: count };
              }
            }
          }
        }
      }
      if (internalKey === 'lair_actions') {
        result.lair_actions = processedValue;
        result.lairInitiative = this.extractLairInitiative(processedValue);
      }
      if (internalKey === 'regional_effects') result.regional_effects = processedValue;
      if (internalKey === 'spellcasting') result.spellcasting = processedValue;
      if (['特性', '动作', '附赠动作', '反应', '传奇动作'].includes(internalKey)) {
        const structuredParser = new StructuredActionParser();
        const sectionMap: Record<string, string> = {
          '特性': '特性',
          '动作': '动作',
          '附赠动作': '附赠动作',
          '反应': '反应',
          '传奇动作': '传奇动作',
        };
        const mapped = sectionMap[internalKey];
        if (mapped) {
          result.structuredActions = result.structuredActions ?? {};
          const sa = result.structuredActions as Record<string, StructuredActionData[]>;
          sa[mapped] = structuredParser.parseStructuredSection(processedValue, internalKey);
        }
      }
    } else if (path.startsWith('system.traits')) {
      if (internalKey === 'senses') {
        const parsedSenses = this.parseSenses(processedValue);
        result.traits.senses = parsedSenses.senses;
        if (parsedSenses.passivePerception !== undefined) {
          result.skillPassives = {
            ...(result.skillPassives || {}),
            prc: parsedSenses.passivePerception,
          };
        }
      } else if (internalKey === 'size') {
        const sizeMap: Record<string, string> = {
          '微型': 'tiny', '极小': 'tiny',
          '小型': 'sm',
          '中型': 'med',
          '大型': 'lg',
          '巨型': 'huge',
          '超巨型': 'grg'
        };
        result.traits.size = sizeMap[processedValue] || processedValue;
      } else if (internalKey === 'dm') {
        result.traits.dm = this.parseDamageMod(processedValue);
      } else {
        // dr, di, ci, languages -> array
        if (['dr', 'di', 'dv'].includes(internalKey) && Array.isArray(processedValue)) {
          const bypasses: string[] = [];
          const filtered = processedValue.filter((v: any) => {
            if (typeof v !== 'string') return true;
            const b = this.detectBypasses(v);
            if (b) {
              bypasses.push(b);
              return false;
            }
            return true;
          });
          result.traits[internalKey as 'dr' | 'di' | 'dv'] = filtered;
          if (bypasses.length > 0) {
            result.traits.bypasses = Array.from(new Set([...(result.traits.bypasses || []), ...bypasses]));
          }
        } else {
          result.traits[internalKey as keyof ParsedNPC['traits']] = processedValue;
        }
      }

    } else if (path.startsWith('system.skills')) {
      // skills: { 察觉: 专精 }
      // Map keys and values?
      // Keys: "察觉" -> "prc"
      // Values: "专精" -> 2
      this.parseSkills(processedValue, result);
    }
  }

  private extractBodySections(body: string): YamlBodyExtractionResult {
    const sectionLines: Record<YamlBodySectionKey, string[]> = {
      traits: [],
      actions: [],
      bonus_actions: [],
      reactions: [],
      legendary_actions: [],
      raw_notes: [],
    };
    const biographyLines: string[] = [];

    let currentSection: YamlBodySectionKey | undefined;
    let currentSectionLevel = 0;

    for (const rawLine of body.split(/\r?\n/)) {
      const heading = this.parseMarkdownHeading(rawLine);
      if (heading) {
        if (currentSection && heading.level > currentSectionLevel) {
          sectionLines[currentSection].push(rawLine);
          continue;
        }

        const detectedSection = this.classifyBodySectionHeading(heading.title);
        if (detectedSection) {
          currentSection = detectedSection;
          currentSectionLevel = heading.level;
        } else {
          currentSection = undefined;
          currentSectionLevel = 0;
          biographyLines.push(rawLine);
        }
        continue;
      }

      if (currentSection) {
        sectionLines[currentSection].push(rawLine);
      } else {
        biographyLines.push(rawLine);
      }
    }

    return {
      biography: biographyLines.join('\n').trim(),
      traits: this.normalizeBodySectionLines(sectionLines.traits),
      actions: this.normalizeBodySectionLines(sectionLines.actions),
      bonus_actions: this.normalizeBodySectionLines(sectionLines.bonus_actions),
      reactions: this.normalizeBodySectionLines(sectionLines.reactions),
      legendary_actions: this.normalizeBodySectionLines(sectionLines.legendary_actions),
    };
  }

  private parseMarkdownHeading(line: string): { level: number; title: string } | undefined {
    const match = line.match(/^\s{0,3}(#{1,6})\s*(.+?)\s*#*\s*$/);
    if (!match?.[1] || !match[2]) {
      return undefined;
    }

    return {
      level: match[1].length,
      title: match[2].trim(),
    };
  }

  private classifyBodySectionHeading(title: string): YamlBodySectionKey | undefined {
    const normalized = title.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (normalized.includes('传奇动作') || normalized.includes('legendary actions')) {
      return 'legendary_actions';
    }

    if (normalized.includes('附赠动作') || normalized.includes('bonus actions')) {
      return 'bonus_actions';
    }

    if (normalized.includes('反应') || normalized.includes('reactions')) {
      return 'reactions';
    }

    if (normalized.includes('特性') || normalized.includes('traits')) {
      return 'traits';
    }

    if (normalized.includes('动作') || normalized === 'actions') {
      return 'actions';
    }

    if (normalized.includes('原始备注') || normalized.includes('raw notes')) {
      return 'raw_notes';
    }

    return undefined;
  }

  private normalizeBodySectionLines(lines: string[]): string[] {
    const merged: string[] = [];
    let currentLines: string[] = [];

    const flushCurrent = () => {
      if (currentLines.length === 0) {
        return;
      }

      merged.push(currentLines.join('\n').trim());
      currentLines = [];
    };

    for (const rawLine of lines) {
      const cleaned = this.cleanBodySectionLine(rawLine);
      if (!cleaned) {
        continue;
      }

      const indent = rawLine.match(/^\s*/)?.[0]?.length ?? 0;
      const trimmedRaw = rawLine.trimStart();
      const isTopLevelEntry =
        indent < 2 && (/^[-*+]\s+/.test(trimmedRaw) || /^\d+[.)]\s+/.test(trimmedRaw));

      if (isTopLevelEntry) {
        flushCurrent();
        currentLines.push(cleaned);
        continue;
      }

      if (currentLines.length === 0) {
        currentLines.push(cleaned);
        continue;
      }

      currentLines.push(cleaned);
    }

    flushCurrent();

    return merged;
  }

  private cleanBodySectionLine(line: string): string {
    let text = line.trim();
    if (!text) {
      return '';
    }

    while (text.startsWith('>')) {
      text = text.slice(1).trimStart();
    }

    text = text.replace(/^[-*+]\s*/, '');
    text = text.replace(/^\d+[.)]\s*/, '');

    const nestedHeading = this.parseMarkdownHeading(text);
    if (nestedHeading) {
      text = nestedHeading.title;
    }

    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/\*/g, '');

    return text.trim();
  }

  private shouldMergeBodySectionLine(
    previous: string | undefined,
    current: string,
    rawLine: string,
  ): boolean {
    if (!previous) {
      return false;
    }

    if (!current.trim()) {
      return false;
    }

    if (/^\s{2,}/.test(rawLine)) {
      return true;
    }

    if (!/[。！？.!?)]$/.test(previous.trim())) {
      return true;
    }

    if (/^(命中|豁免失败|豁免成功|强击|若|并且|且|成功|失败|直到|目标|该目标|它|其|此后|额外|Bleed|Dazed|\(|\+|-|\d)/.test(current)) {
      return true;
    }

    return false;
  }

  private extractLairInitiative(lairActions: any): number | undefined {
    if (!Array.isArray(lairActions)) return undefined;
    const regex = /(?:on\s+)?initiative\s+(?:count\s+)?(\d+)/i;
    const cnRegex = /(?:在)?先攻(?:顺位|项)?\s*(\d+)/;
    
    for (const action of lairActions) {
      const text = typeof action === 'string' ? action : JSON.stringify(action);
      const match = text.match(regex) || text.match(cnRegex);
      if (match && match[1]) {
        return parseInt(match[1]);
      }
    }
    return undefined;
  }

  private processValue(mapping: FieldDefinition, value: any): any {
    if (mapping.type === 'array' && Array.isArray(value)) {
      return value.map(item => {
        if (typeof item === 'string') {
          const s = item.trim();
          if (!s) return item;

          const itemMapping = FIELD_MAPPING[s];
          if (itemMapping) return itemMapping.key;
          
          const key = i18n.getKey(s);
          if (key) {
             let clean = key.replace(/^DND5E\./, '');
             // Use exact replacements for core types to avoid conpoisoned
             if (clean.includes('Condition')) {
                clean = clean.replace('Condition', '');
             } else if (clean.startsWith('Con') && !clean.includes('Constitution')) {
                clean = clean.replace(/^Con/, '');
             } else if (clean.includes('Damage')) {
                clean = clean.replace('Damage', '');
             } else if (clean.includes('Skill')) {
                clean = clean.replace('Skill', '');
             }
             return clean.toLowerCase();
          }
          return s;
        }
        return item;
      });
    }
    return value;
  }

  private parseMovement(value: string | object): Record<string, any> {
    if (typeof value === 'object') return value as Record<string, any>;
    const result: Record<string, any> = {};
    // "40尺, 攀爬40尺, 飞行80尺"
    const parts = value.split(/,|，/);
    
    for (const part of parts) {
      const p = part.trim();
      const match = p.match(/^([^\d]*?)(\d+)/);
      if (match && match[2]) {
        let typeRaw = (match[1] || '').trim();
        const dist = parseInt(match[2]);
        
        if (typeRaw === 'walk' || typeRaw === '步行' || typeRaw === '') {
            result['walk'] = dist;
        } else {
            const key = i18n.getKey(typeRaw);
            if (key) {
                let type = key.replace('DND5E.Movement', '').toLowerCase();
                if (type === 'fly') type = 'fly'; 
                result[type] = dist;
            } else {
                if (typeRaw.includes('攀爬')) result['climb'] = dist;
                else if (typeRaw.includes('飞行') || typeRaw.includes('fly')) result['fly'] = dist;
                else if (typeRaw.includes('游泳') || typeRaw.includes('swim')) result['swim'] = dist;
                else if (typeRaw.includes('挖掘') || typeRaw.includes('burrow')) result['burrow'] = dist;
                else if (typeRaw.includes('悬浮') || typeRaw.includes('hover')) {
                  result['fly'] = dist;
                  result['hover'] = true;
                }
            }
        }
      }
    }
    return result;
  }

  private parseHP(value: string | number): { value: number; max: number; formula?: string } {
    if (typeof value === 'number') return { value, max: value };
    const trimmed = value.trim();
    const exact = trimmed.match(/^(\d+)$/);
    if (exact?.[1]) {
      const numeric = parseInt(exact[1], 10);
      return { value: numeric, max: numeric };
    }

    const withFormula = trimmed.match(/^(\d+)\s*\(([^)]+)\)$/);
    if (withFormula?.[1] && withFormula[2]) {
      const numeric = parseInt(withFormula[1], 10);
      return { value: numeric, max: numeric, formula: withFormula[2].trim() };
    }

    return { value: parseInt(trimmed), max: parseInt(trimmed) };
  }

  private parseAC(value: string | number): { value: number; calc: "flat" | "natural" | "default" } {
    if (typeof value === 'number') return { value, calc: "flat" };
    // "19 (天生护甲)"
    const val = parseInt(value);
    const isNatural = value.includes('天生') || value.includes('natural');
    return { value: val, calc: isNatural ? "natural" : "flat" };
  }

  private parseSenses(senses: any): { senses: Record<string, number | string>; passivePerception?: number } {
    const result: Record<string, number | string> = {};
    let passivePerception: number | undefined;
    if (typeof senses !== 'object' || senses === null) return { senses: result, passivePerception };

    const senseMap: Record<string, string> = {
      '黑暗视觉': 'darkvision',
      '盲视': 'blindsight',
      '震颤感知': 'tremorsense',
      '真实视觉': 'truesight',
      '被动察觉': 'passiveperception',
      '特殊': 'special',
    };

    for (const [k, v] of Object.entries(senses)) {
      const key = senseMap[k] || k;
      if (key === 'special') {
        const text = String(v).trim();
        if (text) {
          result.special = text;
        }
        continue;
      }
      const val = parseInt(String(v));
      if (key === 'passiveperception') {
        if (!isNaN(val)) {
          passivePerception = val;
        }
        continue;
      }
      if (!isNaN(val)) {
        result[key] = val;
      }
    }
    return { senses: result, passivePerception };
  }

  private parseDamageMod(value: any): { amount: Record<string, string>; bypasses: string[] } {
    const result = { amount: {} as Record<string, string>, bypasses: [] as string[] };
    if (typeof value !== 'object' || value === null) return result;

    for (const [k, v] of Object.entries(value)) {
      let key = k;
      // Try i18n lookup
      const i18nKey = i18n.getKey(k);
      if (i18nKey) {
        // e.g. "DND5E.DamageFire" -> "fire"
        key = i18nKey.replace(/^DND5E\.Damage/, '').toLowerCase();
      } else {
        // Fallback or if already English-like
        key = k.replace(/^DND5E\.Damage/, '').toLowerCase();
      }

      result.amount[key] = String(v);
    }
    return result;
  }

  private parseSkills(skills: Record<string, string | number>, result: ParsedNPC): void {
    const parsedSkills: Record<string, number> = {};
    const skillBonuses: Record<string, number> = {};
    const profBonus = this.getProficiencyBonus(result);

    for (const [key, val] of Object.entries(skills)) {
      // Map key: "察觉" -> "prc"
      const i18nKey = i18n.getKey(key);
      let skillKey = key;
      if (i18nKey) {
        // "DND5E.SkillPrc" -> "prc"
        skillKey = i18nKey.replace('DND5E.Skill', '').toLowerCase();
      }

      let skillValue = 0.5;
      const valStr = String(val);

      if (valStr === '专精' || valStr === '2') {
        skillValue = 2;
      } else if (valStr === '熟练' || valStr === '1') {
        skillValue = 1;
      } else if (valStr === '半熟练' || valStr === '0.5') {
        skillValue = 0.5;
      } else {
        const num = parseFloat(valStr);
        if (!isNaN(num)) {
          if (num >= 0 && num <= 2) {
            skillValue = num;
          } else {
            skillValue = this.inferSkillProficiency(skillKey, num, result, profBonus);
            const expected = this.expectedSkillModifier(skillKey, skillValue, result, profBonus);
            const delta = num - expected;
            if (delta !== 0) {
              skillBonuses[skillKey] = delta;
            }
          }
        }
      }

      parsedSkills[skillKey] = skillValue;
    }

    result.skills = parsedSkills;
    result.skillBonuses = skillBonuses;
  }

  private parseSavingThrows(value: unknown, result: ParsedNPC): void {
    const saves = new Set<string>();
    const saveBonuses: Record<string, number> = {};
    const profBonus = this.getProficiencyBonus(result);

    const applyEntry = (rawKey: unknown, rawValue?: unknown) => {
      const ability = this.normalizeAbility(rawKey);
      if (!ability) return;

      if (rawValue === undefined) {
        saves.add(ability);
        return;
      }

      const numeric = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (!Number.isNaN(numeric)) {
        const baseMod = this.abilityModifier(result.abilities[ability] ?? 10);
        const proficient = numeric >= baseMod + (profBonus ?? 0) - 0.25;
        if (proficient) {
          saves.add(ability);
        }
        const expected = baseMod + (proficient ? profBonus ?? 0 : 0);
        const delta = numeric - expected;
        if (delta !== 0) {
          saveBonuses[ability] = delta;
        }
        return;
      }

      saves.add(ability);
    };

    if (Array.isArray(value)) {
      for (const entry of value) {
        applyEntry(entry);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, rawValue] of Object.entries(value)) {
        applyEntry(key, rawValue);
      }
    } else if (typeof value === 'string') {
      const entries = value.split(/[,;，]/).map((entry) => entry.trim()).filter(Boolean);
      for (const entry of entries) {
        const match = entry.match(/^(.+?)\s*([+-]?\d+)\s*$/);
        if (match?.[1] && match[2]) {
          applyEntry(match[1], Number.parseInt(match[2], 10));
        } else {
          applyEntry(entry);
        }
      }
    }

    result.saves = Array.from(saves);
    result.saveBonuses = saveBonuses;
  }

  private getProficiencyBonus(result: ParsedNPC): number | undefined {
    if (typeof result.attributes.prof === 'number' && Number.isFinite(result.attributes.prof)) {
      return result.attributes.prof;
    }

    if (typeof result.details.cr === 'number' && Number.isFinite(result.details.cr)) {
      if (result.details.cr >= 17) return 6;
      if (result.details.cr >= 13) return 5;
      if (result.details.cr >= 9) return 4;
      if (result.details.cr >= 5) return 3;
      return 2;
    }

    return undefined;
  }

  private inferSkillProficiency(
    skillKey: string,
    modifier: number,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number {
    const abilityKey = this.getSkillAbility(skillKey);
    if (!abilityKey || !profBonus) {
      return 1;
    }

    const baseMod = this.abilityModifier(result.abilities[abilityKey] ?? 10);
    const level = (modifier - baseMod) / profBonus;
    if (!Number.isFinite(level)) return 1;
    if (level >= 1.75) return 2;
    if (level >= 0.75) return 1;
    if (level >= 0.25) return 0.5;
    return 0;
  }

  private expectedSkillModifier(
    skillKey: string,
    proficiency: number,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number {
    const abilityKey = this.getSkillAbility(skillKey);
    const baseMod = this.abilityModifier(abilityKey ? result.abilities[abilityKey] ?? 10 : 10);
    if (!profBonus) {
      return baseMod;
    }
    return baseMod + proficiency * profBonus;
  }

  private getSkillAbility(skillKey: string): keyof ParsedNPC['abilities'] | undefined {
    const map: Record<string, keyof ParsedNPC['abilities']> = {
      acr: 'dex',
      ani: 'wis',
      arc: 'int',
      ath: 'str',
      dec: 'cha',
      his: 'int',
      ins: 'wis',
      itm: 'cha',
      inv: 'int',
      med: 'wis',
      nat: 'int',
      prc: 'wis',
      prf: 'cha',
      per: 'cha',
      rel: 'int',
      slt: 'dex',
      ste: 'dex',
      sur: 'wis',
    };

    return map[skillKey];
  }

  private abilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private normalizeAbility(value: unknown): keyof ParsedNPC['abilities'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z\u4e00-\u9fff]+/g, ' ')
      .trim();

    const map: Record<string, keyof ParsedNPC['abilities']> = {
      str: 'str',
      strength: 'str',
      力量: 'str',
      dex: 'dex',
      dexterity: 'dex',
      敏捷: 'dex',
      con: 'con',
      constitution: 'con',
      体质: 'con',
      int: 'int',
      intelligence: 'int',
      智力: 'int',
      wis: 'wis',
      wisdom: 'wis',
      感知: 'wis',
      cha: 'cha',
      charisma: 'cha',
      魅力: 'cha',
    };

    if (map[normalized]) {
      return map[normalized];
    }

    const i18nKey = i18n.getKey(value);
    if (i18nKey?.startsWith('DND5E.Ability')) {
      return i18nKey.replace('DND5E.Ability', '').toLowerCase() as keyof ParsedNPC['abilities'];
    }

    return undefined;
  }

  private detectBypasses(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes('非魔法') || t.includes('nonmagical')) return 'mgc';
    if (t.includes('精金') || t.includes('adamantine')) return 'ada';
    if (t.includes('镀银') || t.includes('silvered')) return 'sil';
    return null;
  }
}

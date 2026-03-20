import * as yaml from 'js-yaml';
import { FIELD_MAPPING, type ParsedNPC, type FieldDefinition } from '../../config/mapping';
import { i18n } from '../mapper/i18n';
import { CHINESE_ACTION_REGEX } from './chineseActionRegex';

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
      saves: [],
      items: []
    };

    if (body.trim()) {
      result.details.biography = body.trim();
    }

    this.traverse(rawData, result);
    
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
        result.saves = processedValue;
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
    } else if (path.startsWith('system.traits')) {
      if (internalKey === 'senses') {
        result.traits.senses = this.parseSenses(processedValue); 
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
      result.skills = this.parseSkills(processedValue);
    }
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
    // "256 (19d12+133)"
    const match = value.match(/^(\d+)\s*\(?(.+?)\)?$/);
    if (match) {
      return { value: parseInt(match[1]!), max: parseInt(match[1]!), formula: match[2] };
    }
    return { value: parseInt(value), max: parseInt(value) };
  }

  private parseAC(value: string | number): { value: number; calc: "flat" | "natural" | "default" } {
    if (typeof value === 'number') return { value, calc: "flat" };
    // "19 (天生护甲)"
    const val = parseInt(value);
    const isNatural = value.includes('天生') || value.includes('natural');
    return { value: val, calc: isNatural ? "natural" : "flat" };
  }

  private parseSenses(senses: any): Record<string, number> {
    const result: Record<string, number> = {};
    if (typeof senses !== 'object' || senses === null) return result;

    const senseMap: Record<string, string> = {
      '黑暗视觉': 'darkvision',
      '盲视': 'blindsight',
      '震颤感知': 'tremorsense',
      '真实视觉': 'truesight'
    };

    for (const [k, v] of Object.entries(senses)) {
      const key = senseMap[k] || k;
      const val = parseInt(String(v));
      if (!isNaN(val)) {
        result[key] = val;
      }
    }
    return result;
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

  private parseSkills(skills: Record<string, string | number>): Record<string, number> {
    const result: Record<string, number> = {};
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
        if (!isNaN(num)) skillValue = num;
      }
      
      result[skillKey] = skillValue; 
    }
    return result;
  }

  private detectBypasses(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes('非魔法') || t.includes('nonmagical')) return 'mgc';
    if (t.includes('精金') || t.includes('adamantine')) return 'ada';
    if (t.includes('镀银') || t.includes('silvered')) return 'sil';
    return null;
  }
}

import { i18n } from '../mapper/i18n';

export interface Damage {
  formula: string;
  type: string;
}

export interface ActionData {
  name: string;
  englishName?: string;
  type: "attack" | "save" | "utility";
  desc?: string; 
  
  attack?: {
    type: "mwak" | "rwak";
    toHit: number;
    range: string;
    damage: Damage[];
  };

  save?: {
    dc: number;
    ability: string;
    onSave?: string;
    onFail?: string;
  };

  recharge?: {
    value: number;
    charged: boolean;
  };
  
  damage?: Damage[];
}

export class ActionParser {

  private splitName(raw: string): { name: string; englishName?: string } {
    const enMatch = raw.match(/^(.+?)\s*\(\s*([A-Za-z][A-Za-z0-9\s&:'-]+?)\s*\)\s*$/);
    if (enMatch && enMatch[1] && enMatch[2]) {
      return { name: enMatch[1].trim(), englishName: enMatch[2].trim() };
    }
    return { name: raw.trim() };
  }

  private extractDamageType(str: string): string | null {
    const dicePos = str.search(/\d+d\d+/);
    if (dicePos === -1) return null;
    const afterDice = str.slice(dicePos);
    const match = afterDice.match(/(?:[\d\+\-\s\(\)]+\s*)?(?:点|的)?\s*([\u4e00-\u9fa5]+)/);
    if (match) {
      let word = match[1]!.replace(/^(点|的)\s*/, '').replace(/伤害$/, '');
      const validTypes = ['穿刺', '死灵', '钝击', '挥砍', '毒素', '火焰', '寒冷', '闪电', '雷鸣', '光耀', '暗蚀', '力场', '心灵', '强酸'];
      if (validTypes.includes(word)) {
        return word;
      }
    }
    return null;
  }

  public parse(line: string): ActionData | null {
    line = line.trim();
    if (!line) return null;

    // 1. Attack pattern (Standard & Compact)
    const attackMatch = line.match(/^(.+?)\s*\[(.+?)\]:\s*\+?(\d+)\s*(?:命中|hit),\s*(.+?),\s*(.+)$/i);
    if (attackMatch && attackMatch[1] && attackMatch[2] && attackMatch[3] && attackMatch[4] && attackMatch[5]) {
      const { name, englishName } = this.splitName(attackMatch[1].trim());
      const typeStr = attackMatch[2];
      const hitStr = attackMatch[3];
      const rangeStr = attackMatch[4];
      const dmgPart = attackMatch[5];
      
      const damages: Damage[] = [];
      const formulaRegex = /(\d+d\d+(?:\s*[+\-]\s*\d+)?)/g;
      const typeRaw = this.extractDamageType(dmgPart);
      const typeKey = typeRaw ? i18n.getKey(typeRaw) : null;
      const type = typeKey ? typeKey.replace('DND5E.Damage', '').toLowerCase() : 'bludgeoning';
      const formulaMatch = dmgPart.match(formulaRegex);
      if (formulaMatch) {
        for (const formula of formulaMatch) {
          damages.push({ formula: formula.trim(), type });
        }
      }
      
      const isRanged = typeStr.includes('远程') || typeStr.includes('Ranged');
      
      return {
        name,
        englishName,
        type: 'attack',
        desc: dmgPart,
        attack: {
          type: isRanged ? 'rwak' : 'mwak',
          toHit: parseInt(hitStr),
          range: rangeStr.trim(),
          damage: damages
        }
      };
    }

    // 2. Recharge pattern
    const rechargeMatch = line.match(/^(.+?)\s*\[(?:充能|Recharge)\s*(\d+)(?:-\d+)?\]:/);
    if (rechargeMatch && rechargeMatch[1] && rechargeMatch[2]) {
      const { name, englishName } = this.splitName(rechargeMatch[1].trim());
      const rechargeVal = parseInt(rechargeMatch[2]);
      const rest = line.substring(rechargeMatch[0].length).trim();
      
      if (rest.startsWith('{')) {
        const data = this.parseObjectSyntax(name, rest);
        if (data) {
          data.englishName = englishName;
          data.recharge = { value: rechargeVal, charged: true };
          return data;
        }
      }
    }

    // 3. Simple Object Syntax
    const objectMatch = line.match(/^(.+?):\s*(\{.*\})$/);
    if (objectMatch && objectMatch[1] && objectMatch[2]) {
      const { name, englishName } = this.splitName(objectMatch[1].trim());
      const data = this.parseObjectSyntax(name, objectMatch[2].trim());
      if (data) {
        data.englishName = englishName;
        return data;
      }
    }

    // 4. Pure Text Logic Extraction
    const simpleMatch = line.match(/^(.+?):\s*(.+)$/);
    if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
      const { name, englishName } = this.splitName(simpleMatch[1].trim());
      const desc = simpleMatch[2].trim();
      
      const data: ActionData = {
        name,
        englishName,
        type: 'utility',
        desc
      };

      // Extract DC Save
      const dcMatch = desc.match(/DC\s*(\d+)\s*(?:的)?\s*([\u4e00-\u9fa5]{2})/i);
      if (dcMatch && dcMatch[1] && dcMatch[2]) {
        const dc = parseInt(dcMatch[1]);
        const abilityRaw = dcMatch[2].trim();
        const abilityKey = i18n.getKey(abilityRaw);
        if (abilityKey) {
          let ability = 'str';
          if (abilityKey.includes('Str')) ability = 'str';
          else if (abilityKey.includes('Dex')) ability = 'dex';
          else if (abilityKey.includes('Con')) ability = 'con';
          else if (abilityKey.includes('Int')) ability = 'int';
          else if (abilityKey.includes('Wis')) ability = 'wis';
          else if (abilityKey.includes('Cha')) ability = 'cha';
          data.save = { dc, ability };
          data.type = 'save';
        }
      }

      const formulaRegex = /(\d+d\d+(?:\s*[+\-]\s*\d+)?)/g;
      const damages: Damage[] = [];
      const typeRaw = this.extractDamageType(desc);
      const typeKey = typeRaw ? i18n.getKey(typeRaw) : null;
      if (typeKey) {
        const type = typeKey.replace('DND5E.Damage', '').toLowerCase();
        const formulaMatches = desc.match(formulaRegex);
        if (formulaMatches) {
          for (const formula of formulaMatches) {
            damages.push({ formula: formula.trim(), type });
          }
        }
      }
      
      if (damages.length > 0) {
        data.damage = damages;
        if (data.type === 'utility') data.type = 'save';
      }

      return data;
    }

    return null;
  }

  private parseObjectSyntax(name: string, content: string): ActionData | null {
    const inner = content.replace(/^\{|\}$/g, '');
    const parts = inner.split(/,(?![^()]*\))/);
    let saveInfo: ActionData['save'] = undefined;
    let damages: Damage[] = [];

    for (const part of parts) {
      const split = part.split(':');
      const k = split[0]?.trim();
      const v = split[1]?.trim();
      if (!k || !v) continue;

      if (k === '豁免' || k === 'Save') {
        const dcMatch = v.match(/DC\s*(\d+)\s*(.+)/i);
        if (dcMatch && dcMatch[1] && dcMatch[2]) {
          const abilityKey = i18n.getKey(dcMatch[2].trim());
          let ability = 'str';
          if (abilityKey) {
            if (abilityKey.includes('Str')) ability = 'str';
            else if (abilityKey.includes('Dex')) ability = 'dex';
            else if (abilityKey.includes('Con')) ability = 'con';
            else if (abilityKey.includes('Int')) ability = 'int';
            else if (abilityKey.includes('Wis')) ability = 'wis';
            else if (abilityKey.includes('Cha')) ability = 'cha';
          }
          saveInfo = { dc: parseInt(dcMatch[1]), ability };
        }
      }
      
      if (k === '失败' || k === 'Fail') {
        const dmg = this.parseDamage(v);
        if (dmg.length > 0) damages = dmg;
        if (saveInfo) saveInfo.onFail = v;
      }
      if ((k === '成功' || k === 'Success') && saveInfo) {
        saveInfo.onSave = v;
      }
    }

    const data: ActionData = { name, type: (saveInfo || damages.length > 0) ? 'save' : 'utility' };
    if (saveInfo) data.save = saveInfo;
    if (damages.length > 0) data.damage = damages;
    return data;
  }

  private parseDamage(str: string): Damage[] {
    const results: Damage[] = [];
    const parts = str.split(/\s+\+\s+/);
    for (const part of parts) {
      const match = part.match(/^(.+?)\s*([\u4e00-\u9fa5a-zA-Z]+)$/);
      if (match && match[1] && match[2]) {
        const typeKey = i18n.getKey(match[2].trim());
        if (typeKey) {
          results.push({ 
            formula: match[1].trim(), 
            type: typeKey.replace('DND5E.Damage', '').toLowerCase() 
          });
        }
      }
    }
    return results;
  }
}

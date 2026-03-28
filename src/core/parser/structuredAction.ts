import type {
  StructuredActionData,
  DamagePart,
  AoeTemplate,
  ActionTarget,
  SaveEffect,
  SubAction,
  EmbeddedEffect,
  SpecialEffect,
  ActivityActivationType,
  SaveAbility,
  TriggerType,
} from '../models/action';

const ABILITY_MAP: Record<string, string> = {
  '力量': 'str',
  '敏捷': 'dex',
  '体质': 'con',
  '智力': 'int',
  '感知': 'wis',
  '魅力': 'cha',
  'str': 'str',
  'dex': 'dex',
  'con': 'con',
  'int': 'int',
  'wis': 'wis',
  'cha': 'cha',
};

const AOE_SHAPE_MAP: Record<string, string> = {
  '球形': 'sphere',
  '锥形': 'cone',
  '线形': 'line',
  '立方体': 'cube',
  '圆柱形': 'cylinder',
  '矩形': 'rect',
};

export class StructuredActionParser {
  public parseStructuredSection(section: unknown, sectionName: string): StructuredActionData[] {
    if (!section || !Array.isArray(section)) {
      return [];
    }
    return section.map((entry: unknown) => this.parseActionEntry(entry, sectionName));
  }

  private parseActionEntry(entry: unknown, sectionName: string): StructuredActionData {
    if (typeof entry === 'string') {
      return { name: entry, type: 'utility', describe: entry };
    }

    const name = (entry as Record<string, unknown>)['名称'] ?? (entry as Record<string, unknown>)['name'] ?? '';
    const type = (entry as Record<string, unknown>)['类型'] ?? 'utility';
    const describe = (entry as Record<string, unknown>)['描述'] ?? (entry as Record<string, unknown>)['describe'] ?? '';

    const activationType = this.inferActivationType(sectionName);
    const subActions = this.parseSubActions((entry as Record<string, unknown>)['子活动']);
    const embeddedEffects = this.parseEmbeddedEffects((entry as Record<string, unknown>)['内嵌效果']);

    const action: StructuredActionData = {
      name: this.extractName(String(name)),
      englishName: this.extractEnglishName(String(name)),
      type: this.normalizeType(String(type)),
      activation: activationType ? { type: activationType, condition: ((entry as Record<string, unknown>)['activation'] as Record<string, unknown>)?.['condition'] as string | undefined } : undefined,
      describe: String(describe),
    };

    if (action.type === 'attack' || (entry as Record<string, unknown>)['攻击类型']) {
      const attackType = (entry as Record<string, unknown>)['攻击类型'] ?? (entry as Record<string, unknown>)['attackType'] ?? '';
      action.attackType = this.normalizeAttackType(String(attackType));
      action.toHit = this.parseNumber((entry as Record<string, unknown>)['命中'] ?? (entry as Record<string, unknown>)['toHit']);
      action.range = String((entry as Record<string, unknown>)['范围'] ?? (entry as Record<string, unknown>)['range'] ?? '');
      action.damage = this.parseDamageParts((entry as Record<string, unknown>)['伤害']);
    }

    if (action.type === 'save' || (entry as Record<string, unknown>)['DC']) {
      action.DC = this.parseNumber((entry as Record<string, unknown>)['DC']);
      action.ability = this.normalizeAbility(String((entry as Record<string, unknown>)['属性'] ?? (entry as Record<string, unknown>)['ability']));
      action.aoe = this.parseAoe((entry as Record<string, unknown>)['AoE'] ?? (entry as Record<string, unknown>)['aoe']);
    }

    if ((entry as Record<string, unknown>)['目标'] || (entry as Record<string, unknown>)['target']) {
      action.target = this.parseTarget((entry as Record<string, unknown>)['目标'] ?? (entry as Record<string, unknown>)['target']);
    }

    const recharge = (entry as Record<string, unknown>)['充能'] ?? (entry as Record<string, unknown>)['recharge'];
    if (recharge && Array.isArray(recharge) && recharge.length === 2) {
      action.recharge = [this.parseNumber(recharge[0]), this.parseNumber(recharge[1])];
    }

    if ((entry as Record<string, unknown>)['每日'] ?? (entry as Record<string, unknown>)['perLongRest']) {
      action.perLongRest = this.parseNumber((entry as Record<string, unknown>)['每日'] ?? (entry as Record<string, unknown>)['perLongRest']);
    }

    if ((entry as Record<string, unknown>)['需专注'] ?? (entry as Record<string, unknown>)['concentration']) {
      action.concentration = Boolean((entry as Record<string, unknown>)['需专注'] ?? (entry as Record<string, unknown>)['concentration']);
    }

    action.failEffects = this.parseSaveEffects((entry as Record<string, unknown>)['失败效果']);
    action.successEffects = this.parseSaveEffects((entry as Record<string, unknown>)['成功效果']);

    if ((entry as Record<string, unknown>)['低值阈值'] ?? (entry as Record<string, unknown>)['lowValueThreshold']) {
      action.lowValueThreshold = this.parseNumber((entry as Record<string, unknown>)['低值阈值'] ?? (entry as Record<string, unknown>)['lowValueThreshold']);
    }
    if ((entry as Record<string, unknown>)['低值效果'] ?? (entry as Record<string, unknown>)['lowValueEffects']) {
      action.lowValueEffects = this.parseSaveEffects((entry as Record<string, unknown>)['低值效果']);
    }
    if ((entry as Record<string, unknown>)['特殊效果'] ?? (entry as Record<string, unknown>)['specialEffects']) {
      action.specialEffects = this.parseSpecialEffects((entry as Record<string, unknown>)['特殊效果']);
    }

    if (subActions.length > 0) {
      action.subActions = subActions;
    }
    if (embeddedEffects.length > 0) {
      action.embeddedEffects = embeddedEffects;
    }

    return action;
  }

  private inferActivationType(sectionName: string): ActivityActivationType | null {
    if (sectionName === '特性') return 'special';
    if (sectionName === '动作') return 'action';
    if (sectionName === '附赠动作') return 'bonus';
    if (sectionName === '反应') return 'reaction';
    if (sectionName === '传奇动作') return 'legendary';
    return null;
  }

  private extractName(fullName: string): string {
    const match = fullName.match(/^(.+?)\s*\(/);
    return match?.[1]?.trim() ?? fullName.trim();
  }

  private extractEnglishName(fullName: string): string | undefined {
    const match = fullName.match(/\(([^)]+)\)\s*$/);
    return match?.[1]?.trim();
  }

  private normalizeType(t: string): StructuredActionData['type'] {
    const m = t?.toLowerCase();
    if (m === 'attack') return 'attack';
    if (m === 'save') return 'save';
    if (m === 'damage') return 'damage';
    return 'utility';
  }

  private normalizeAttackType(t: string): StructuredActionData['attackType'] {
    const m = t?.toLowerCase();
    if (m === 'mwak' || m?.includes('近战武器')) return 'mwak';
    if (m === 'rwak' || m?.includes('远程武器')) return 'rwak';
    if (m === 'msak' || m?.includes('近战法术')) return 'msak';
    if (m === 'rsak' || m?.includes('远程法术')) return 'rsak';
    return 'mwak';
  }

  private normalizeAbility(a: string): SaveAbility | undefined {
    if (!a) return undefined;
    return (ABILITY_MAP[a] ?? a) as SaveAbility;
  }

  private parseNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v.replace(/[^\d-]/g, ''), 10) || 0;
    return 0;
  }

  private parseDamageParts(parts: unknown): DamagePart[] | undefined {
    if (!parts || !Array.isArray(parts)) return undefined;
    return parts.map((p: unknown) => ({
      formula: typeof p === 'string' ? p : String((p as Record<string, unknown>)['公式'] ?? (p as Record<string, unknown>)['formula'] ?? ''),
      type: typeof p === 'string' ? '' : String((p as Record<string, unknown>)['类型'] ?? (p as Record<string, unknown>)['type'] ?? ''),
    }));
  }

  private parseAoe(aoe: unknown): AoeTemplate | undefined {
    if (!aoe || typeof aoe !== 'object') return undefined;
    const shape = String((aoe as Record<string, unknown>)['形状'] ?? (aoe as Record<string, unknown>)['shape'] ?? '');
    const range = this.parseNumber((aoe as Record<string, unknown>)['范围'] ?? (aoe as Record<string, unknown>)['range']);
    if (!shape || !range) return undefined;
    return {
      shape: (AOE_SHAPE_MAP[shape] ?? shape) as AoeTemplate['shape'],
      range,
      width: this.parseNumber((aoe as Record<string, unknown>)['width']),
      height: this.parseNumber((aoe as Record<string, unknown>)['height']),
    };
  }

  private parseTarget(target: unknown): ActionTarget | undefined {
    if (!target || typeof target !== 'object') return undefined;
    const count = (target as Record<string, unknown>)['数量'] ?? (target as Record<string, unknown>)['count'] ?? 1;
    const type = String((target as Record<string, unknown>)['类型'] ?? (target as Record<string, unknown>)['type'] ?? 'creature');
    const special = (target as Record<string, unknown>)['特殊'] ?? (target as Record<string, unknown>)['special'];
    const countStr = String(count);
    return {
      count: countStr === '所有生物' || countStr === 'all' ? 'all' : countStr === '所有非异怪生物' ? countStr : this.parseNumber(count),
      type: type as ActionTarget['type'],
      special: special ? String(special) : undefined,
    };
  }

  private parseSaveEffects(effects: unknown): SaveEffect[] | undefined {
    if (!effects || !Array.isArray(effects)) return undefined;
    return effects.map((e: unknown) => ({
      formula: (e as Record<string, unknown>)['公式'] ? String((e as Record<string, unknown>)['公式']) : undefined,
      type: (e as Record<string, unknown>)['类型'] ? String((e as Record<string, unknown>)['类型']) : undefined,
      state: (e as Record<string, unknown>)['状态'] ? String((e as Record<string, unknown>)['状态']) : undefined,
      describe: (e as Record<string, unknown>)['描述'] ? String((e as Record<string, unknown>)['描述']) : undefined,
    }));
  }

  private parseSpecialEffects(effects: unknown): SpecialEffect[] | undefined {
    if (!effects || !Array.isArray(effects)) return undefined;
    return effects.map((e: unknown) => ({
      trigger: String((e as Record<string, unknown>)['触发'] ?? (e as Record<string, unknown>)['trigger'] ?? ''),
      describe: String((e as Record<string, unknown>)['描述'] ?? (e as Record<string, unknown>)['describe'] ?? ''),
    }));
  }

  private parseSubActions(sub: unknown): SubAction[] {
    if (!sub || !Array.isArray(sub)) return [];
    return sub.map((s: unknown) => ({
      name: String((s as Record<string, unknown>)['名称'] ?? (s as Record<string, unknown>)['name'] ?? ''),
      type: this.normalizeType(String((s as Record<string, unknown>)['类型'] ?? (s as Record<string, unknown>)['type'] ?? 'utility')),
      trigger: String((s as Record<string, unknown>)['触发'] ?? (s as Record<string, unknown>)['trigger'] ?? 'special') as TriggerType,
      threshold: (s as Record<string, unknown>)['阈值'] ? this.parseNumber((s as Record<string, unknown>)['阈值']) : undefined,
      DC: (s as Record<string, unknown>)['DC'] ? this.parseNumber((s as Record<string, unknown>)['DC']) : undefined,
      ability: (s as Record<string, unknown>)['属性'] ? this.normalizeAbility(String((s as Record<string, unknown>)['属性'])) : undefined,
      damage: this.parseDamageParts((s as Record<string, unknown>)['伤害']),
      describe: String((s as Record<string, unknown>)['描述'] ?? (s as Record<string, unknown>)['describe'] ?? ''),
    }));
  }

  private parseEmbeddedEffects(emb: unknown): EmbeddedEffect[] {
    if (!emb || !Array.isArray(emb)) return [];
    return emb.map((e: unknown) => ({
      type: String((e as Record<string, unknown>)['类型'] ?? (e as Record<string, unknown>)['type'] ?? ''),
      describe: String((e as Record<string, unknown>)['描述'] ?? (e as Record<string, unknown>)['describe'] ?? ''),
      duration: (e as Record<string, unknown>)['持续'] ? String((e as Record<string, unknown>)['持续']) : undefined,
      damageType: (e as Record<string, unknown>)['伤害类型'] ? String((e as Record<string, unknown>)['伤害类型']) : undefined,
      damageFormula: (e as Record<string, unknown>)['伤害公式'] ? String((e as Record<string, unknown>)['伤害公式']) : undefined,
    }));
  }
}

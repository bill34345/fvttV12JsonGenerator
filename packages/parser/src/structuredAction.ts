import { splitBilingualName } from '@fvtt-json-generator/models/display-name';
import { sourceOperationStructureErrors,isSourceCandidateReview } from '@fvtt-json-generator/models/source-operations';
import type {
  StructuredActionData,
  DamagePart,
  SourceDamagePart,
  AoeTemplate,
  ActionTarget,
  SaveEffect,
  SubAction,
  EmbeddedEffect,
  SpecialEffect,
  ActivityActivationType,
  SaveAbility,
  TriggerType,
} from '@fvtt-json-generator/models/action';
import { parseSupportedRuleFacts } from './sourceRuleFacts';
import {SOURCE_NATIVE_FAILURE_LABELS} from '@fvtt-json-generator/models/source-rule-facts';
import {
  isWeaponMasteryId,
  parseWeaponConfiguration,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';

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
  '半径': 'radius',
  '锥形': 'cone',
  '线形': 'line',
  '立方体': 'cube',
  '圆柱形': 'cylinder',
  '矩形': 'rect',
};

const closedRecord = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value
  && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const nativeStatuses = (value: unknown): boolean => Array.isArray(value) && value.length <= 15
  && value.every(status => typeof status === 'string' && Object.hasOwn(SOURCE_NATIVE_FAILURE_LABELS, status))
  && new Set(value).size === value.length;

/** Typed GM fields are authored IR data; descriptions never prove or rebuild them. */
function assertExplicitGmFields(record: Record<string, unknown>, executionMode: unknown): void {
  if (record.spellUseRecords !== undefined && (executionMode !== 'native-with-gm'
    || !Array.isArray(record.spellUseRecords) || !record.spellUseRecords.length || record.spellUseRecords.length > 128
    || record.spellUseRecords.some(value => !closedRecord(value, ['name', 'max', 'period'])
      || !nonempty(value.name) || !positiveInteger(value.max) || value.period !== 'day'))) throw new Error('InvalidManualSpellUsesStructure');
  if (record.gmTriggeredSave !== undefined) {
    const save = record.gmTriggeredSave;
    if (executionMode !== 'native-with-gm' || !closedRecord(save, ['dc', 'ability', 'trigger', 'sourceText', 'failureStatuses'])
      || !positiveInteger(save.dc) || typeof save.ability !== 'string' || !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(save.ability)
      || !nonempty(save.trigger) || !nonempty(save.sourceText) || !nativeStatuses(save.failureStatuses)) throw new Error('InvalidGmTriggeredSaveStructure');
  }
  if (record.nativeFailureStatuses !== undefined && (executionMode !== 'native-with-gm' || !nativeStatuses(record.nativeFailureStatuses))) throw new Error('InvalidNativeFailureStatusesStructure');
}

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

    const record = entry as Record<string, unknown>;
    if (record.literalMechanics !== undefined && record.literalMechanics !== true) throw new Error('InvalidLiteralMechanics');
    if(record.candidateReview!==undefined&&!isSourceCandidateReview(record.candidateReview))throw new Error('InvalidSourceCandidateReview');
    if(record.candidateCounters!==undefined&&(!record.candidateReview||!Array.isArray(record.candidateCounters)||record.candidateCounters.some((counter:any)=>!counter||typeof counter.name!=='string'||!counter.name.trim()||!Number.isSafeInteger(counter.max)||counter.max<1||counter.recovery!==null&&typeof counter.recovery!=='string')))throw Error('InvalidSourceCandidateCounter');
    const executionMode = record['执行模式'] ?? record.executionMode;
    if (executionMode !== undefined && executionMode !== 'gm-manual'&&executionMode!=='native-with-gm') throw new Error('InvalidFeatureExecutionMode');
    if(executionMode==='native-with-gm'&&(!String(record.nativeRuleText??'').trim()||!String(record.manualRemainder??'').trim()))throw new Error('InvalidMixedFeatureBoundary');
    assertExplicitGmFields(record, executionMode);
    if(record.sourceOperations!==undefined&&(executionMode!=='native-with-gm'||sourceOperationStructureErrors(record.sourceOperations).length))throw new Error('InvalidSourceOperations');
    if(record.sourceContext!==undefined&&(!Array.isArray(record.sourceContext)||record.sourceContext.some(context=>typeof context!=='string'||!context.trim())))throw new Error('InvalidSourceOperationContext');
    if(record.sourceFeatureId!==undefined&&(typeof record.sourceFeatureId!=='string'||!/^\w{16}$/u.test(record.sourceFeatureId)))throw new Error('InvalidSourceFeatureIdentity');
    if (executionMode === 'gm-manual') {
      const forbidden = ['伤害','damage','治疗','healing','攻击类型','attackType','命中','toHit','DC','属性','ability','AoE','aoe','目标','target','内嵌效果','子活动','失败效果','成功效果','weapon-properties','weaponProperties','武器特性','native-mastery','nativeMastery','原生精通','spellcastingFeatureKey'];
      if (forbidden.some(key => Object.hasOwn(record, key)) || type !== 'utility' || !String(describe).trim()) {
        throw new Error('ManualFeatureContainsExecutableMechanics');
      }
    }
    const rawDamage = record['\u4f24\u5bb3'] ?? record['damage'];
    const rawHealing = record['\u6cbb\u7597'] ?? record['healing'];
    const activation = record['activation'];
    const activationRecord = activation && typeof activation === 'object' && !Array.isArray(activation)
      ? activation as Record<string, unknown>
      : undefined;
    const explicitActivationType = this.normalizeActivationType(record['激活'] ?? record['activationType'] ?? activationRecord?.['type']);
    const activationType = explicitActivationType ?? this.inferActivationType(sectionName);
    const spellcastingFeatureKey = this.parseSpellcastingFeatureKey(record['spellcastingFeatureKey']);
    const weaponConfiguration = this.parseWeaponConfiguration(
      record['weapon-properties'] ?? record.weaponProperties ?? record['武器特性'],
    );
    const nativeMastery = this.parseNativeMastery(
      record['native-mastery'] ?? record.nativeMastery ?? record['原生精通'],
    );
    if (spellcastingFeatureKey && !['特性','动作','附赠动作','反应','传奇动作'].includes(sectionName)) {
      throw new Error('InvalidSpellcastingFeatureLinkSection: expected a trait, action, bonus action or reaction.');
    }
    if (spellcastingFeatureKey && explicitActivationType && !['action','bonus','reaction','legendary'].includes(explicitActivationType)) {
      throw new Error('InvalidSpellcastingFeatureActivation: unsupported linked spellcasting activation.');
    }
    const subActions = this.parseSubActions((entry as Record<string, unknown>)['子活动']);
    if(record.literalName!==undefined&&record.literalName!==true)throw new Error('InvalidLiteralName');
    const literalName=record.literalName===true||executionMode!==undefined||!!spellcastingFeatureKey;
    const embeddedEffects = this.parseEmbeddedEffects((entry as Record<string, unknown>)['内嵌效果']);

    const action: StructuredActionData = {
      ...(record.candidateReview?{candidateReview:structuredClone(record.candidateReview) as StructuredActionData['candidateReview']}:{}),
      ...(record.candidateCounters?{candidateCounters:structuredClone(record.candidateCounters) as StructuredActionData['candidateCounters']}:{}),
      name: literalName?String(name):this.extractName(String(name)),
      ...(record.literalMechanics === true ? { literalMechanics: true as const } : {}),
      ...(executionMode === 'gm-manual'||executionMode==='native-with-gm' ? { executionMode } : {}),
      ...(executionMode==='native-with-gm'?{nativeRuleText:String(record.nativeRuleText),manualRemainder:String(record.manualRemainder)}:{}),
      ...(record.spellUseRecords!==undefined?{spellUseRecords:structuredClone(record.spellUseRecords) as StructuredActionData['spellUseRecords']}:{}),
      ...(record.gmTriggeredSave!==undefined?{gmTriggeredSave:structuredClone(record.gmTriggeredSave) as StructuredActionData['gmTriggeredSave']}:{}),
      ...(record.nativeFailureStatuses!==undefined?{nativeFailureStatuses:structuredClone(record.nativeFailureStatuses) as StructuredActionData['nativeFailureStatuses']}:{}),
      ...(record.sourceOperations!==undefined?{sourceOperations:structuredClone(record.sourceOperations) as StructuredActionData['sourceOperations']}:{}),
      ...(record.sourceContext!==undefined?{sourceContext:[...record.sourceContext as string[]]}:{}),
      ...(record.sourceFeatureId!==undefined?{sourceFeatureId:record.sourceFeatureId as string}:{}),
      englishName: literalName?undefined:this.extractEnglishName(String(name)),
      spellcastingFeatureKey,
      ...(weaponConfiguration ? { weaponConfiguration } : {}),
      ...(nativeMastery ? { nativeMastery } : {}),
      type: this.normalizeType(String(type)),
      activation: activationType ? {
        type: activationType,
        condition: activationRecord?.['condition'] as string | undefined,
        ...(explicitActivationType ? { explicit: true } : {}),
      } : undefined,
      describe: String(describe),
    };
    if (rawDamage !== undefined) action.sourceDamageParts = this.parseSourceDamageParts(rawDamage);
    action.sourceRuleFacts = record.literalMechanics === true || executionMode === 'gm-manual'||executionMode==='native-with-gm' ? [] : parseSupportedRuleFacts(action.describe ?? '');
    if((record.literalMechanics === true || executionMode==='native-with-gm')&&['none','half','full'].includes(String(record.saveOutcome)))action.saveOutcome=record.saveOutcome as 'none'|'half'|'full';
    const explicitRange=record['范围']??record.range;
    if(typeof explicitRange==='string'&&explicitRange.trim())action.range=explicitRange.trim();
    if(typeof record.targetSpecial==='string'&&record.targetSpecial.trim())action.targetSpecial=record.targetSpecial.trim();

    if (action.type === 'attack' || (entry as Record<string, unknown>)['攻击类型']) {
      const attackType = (entry as Record<string, unknown>)['攻击类型'] ?? (entry as Record<string, unknown>)['attackType'] ?? '';
      action.attackType = this.normalizeAttackType(String(attackType));
      action.toHit = this.parseNumber((entry as Record<string, unknown>)['命中'] ?? (entry as Record<string, unknown>)['toHit']);
      action.range = String((entry as Record<string, unknown>)['范围'] ?? (entry as Record<string, unknown>)['range'] ?? '');
      action.damage = this.parseDamageParts(rawDamage);
    }

    if (action.type === 'save' || (entry as Record<string, unknown>)['DC']) {
      action.DC = this.parseNumber((entry as Record<string, unknown>)['DC']);
      action.ability = this.normalizeAbility(String((entry as Record<string, unknown>)['属性'] ?? (entry as Record<string, unknown>)['ability']));
      const saveCondition = record['豁免条件'] ?? record.saveCondition;
      if (typeof saveCondition === 'string' && saveCondition.trim()) action.saveCondition = saveCondition.trim();
      const dcSourceKind = (entry as Record<string, unknown>)['DC来源'] ?? (entry as Record<string, unknown>)['dcSourceKind'];
      if (dcSourceKind === 'ability' || dcSourceKind === 'spellcasting' || dcSourceKind === 'literal') {
        action.dcSourceKind = dcSourceKind;
      }
      action.aoe = this.parseAoe((entry as Record<string, unknown>)['AoE'] ?? (entry as Record<string, unknown>)['aoe']);
      if (rawDamage !== undefined) action.damage = this.parseDamageParts(rawDamage);
    }

    if (action.type === 'damage' && rawDamage !== undefined) {
      action.damage = this.parseDamageParts(rawDamage);
    }

    if (action.type === 'heal' && rawHealing && typeof rawHealing === 'object' && !Array.isArray(rawHealing)) {
      const healing = rawHealing as Record<string, unknown>;
      const formula = String(healing['\u516c\u5f0f'] ?? healing['formula'] ?? '').trim();
      const rawType = String(healing['\u7c7b\u578b'] ?? healing['type'] ?? '').trim().toLowerCase();
      if (formula && (rawType === 'healing' || rawType === 'temphp')) {
        action.healing = { formula, type: rawType };
        if(healing.target!==undefined){
          const target=healing.target;
          if(!target||typeof target!=='object'||Array.isArray(target))throw new Error('InvalidHealingTarget');
          const recipient=target as Record<string,unknown>;
          if(Object.keys(recipient).some(key=>!['type','count','special'].includes(key))||!['self','creature'].includes(String(recipient.type))||recipient.count!==1||typeof recipient.special!=='string'||!recipient.special.trim())throw new Error('InvalidHealingTarget');
          action.healing.target={type:recipient.type as 'self'|'creature',count:1,special:recipient.special};
        }
      }
    }

    if ((entry as Record<string, unknown>)['目标'] || (entry as Record<string, unknown>)['target']) {
      action.target = this.parseTarget((entry as Record<string, unknown>)['目标'] ?? (entry as Record<string, unknown>)['target']);
    }

    const recharge = (entry as Record<string, unknown>)['充能'] ?? (entry as Record<string, unknown>)['recharge'];
    const rechargeRange = this.parseRechargeRange(recharge);
    if (rechargeRange) action.recharge = rechargeRange;

    if(record['perLongRest']!==undefined)action.perLongRest=this.parseNumber(record['perLongRest']);
    const hasUses=Object.hasOwn(record,'使用次数'),hasDaily=Object.hasOwn(record,'每日');
    if(hasUses&&hasDaily)throw new Error('ConflictingSourceUses: multiple counter fields require review.');
    const rawUses=hasUses?record['使用次数']:hasDaily?{max:record['每日'],period:'day'}:undefined;
    if(hasUses||hasDaily){
      if(!rawUses||typeof rawUses!=='object'||Array.isArray(rawUses))throw new Error('InvalidSourceUses: expected max and period.');
      const uses=rawUses as Record<string,unknown>;
      if(Object.keys(uses).some(key=>!['max','period'].includes(key))||!Number.isSafeInteger(uses.max)||Number(uses.max)<1||typeof uses.period!=='string'||!['day','longRest','shortRest','dawn'].includes(uses.period))throw new Error('InvalidSourceUses: positive integer max and a supported period are required.');
      if(action.recharge||action.perLongRest!==undefined)throw new Error('ConflictingSourceUses: multiple recovery mechanisms require review.');
      action.uses={max:Number(uses.max),period:uses.period as NonNullable<StructuredActionData['uses']>['period']};
    }

    const legendaryCost = (entry as Record<string, unknown>)['传奇动作消耗'] ?? (entry as Record<string, unknown>)['legendaryCost'];
    if (legendaryCost !== undefined) action.legendaryCost = this.parseNumber(legendaryCost);

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

    if (action.spellUseRecords && (action.type !== 'utility' || action.uses || action.recharge || action.perLongRest !== undefined)) throw new Error('InvalidManualSpellUsesCombination');
    if (action.gmTriggeredSave && (action.type !== 'attack' || action.DC !== undefined || action.nativeFailureStatuses !== undefined)) throw new Error('InvalidGmTriggeredSaveCombination');
    if (action.gmTriggeredSave && (!action.attackType || !Number.isSafeInteger(action.toHit))) throw new Error('InvalidGmTriggeredSavePrimaryAttack');
    if (action.nativeFailureStatuses && (action.type !== 'save' || !positiveInteger(action.DC) || !action.ability || !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(action.ability))) throw new Error('InvalidNativeFailureStatusesCombination');
    return action;
  }

  private parseSpellcastingFeatureKey(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('InvalidSpellcastingFeatureKey: spellcastingFeatureKey must be a non-empty string.');
    }
    return value.trim();
  }

  private parseWeaponConfiguration(value: unknown): WeaponConfiguration | undefined {
    if (value === undefined) return undefined;
    const parsed = parseWeaponConfiguration(value);
    if (!parsed) {
      throw new Error('InvalidWeaponConfiguration: weapon-properties must be a valid WeaponConfiguration.');
    }
    return parsed;
  }

  private parseNativeMastery(value: unknown): StructuredActionData['nativeMastery'] {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!isWeaponMasteryId(normalized)) {
      throw new Error('InvalidNativeWeaponMastery: native-mastery must name one official dnd2024 mastery.');
    }
    return normalized;
  }

  private parseRechargeRange(value: unknown): [number, number] | undefined {
    const parts = Array.isArray(value) && value.length === 2
      ? value
      : typeof value === 'string'
        ? value.match(/^\s*(\d+)\s*(?:-|–|—|至|到)\s*(\d+)\s*$/u)?.slice(1)
        : undefined;
    if (!parts || parts.length !== 2) return undefined;
    const minimum = this.parseNumber(parts[0]);
    const maximum = this.parseNumber(parts[1]);
    return Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum)
      && minimum >= 1 && maximum >= minimum ? [minimum, maximum] : undefined;
  }

  private inferActivationType(sectionName: string): ActivityActivationType | null {
    if (sectionName === '特性') return 'special';
    if (sectionName === '动作') return 'action';
    if (sectionName === '附赠动作') return 'bonus';
    if (sectionName === '反应') return 'reaction';
    if (sectionName === '传奇动作') return 'legendary';
    if (sectionName === '神话动作') return 'legendary';
    return null;
  }

  private normalizeActivationType(value: unknown): ActivityActivationType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'action' || normalized === 'bonus' || normalized === 'reaction' || normalized === 'legendary' || normalized === 'special') {
      return normalized;
    }
    return null;
  }

  private extractName(fullName: string): string {
    return splitBilingualName(fullName).name;
  }

  private extractEnglishName(fullName: string): string | undefined {
    return splitBilingualName(fullName).englishName;
  }

  private normalizeType(t: string): StructuredActionData['type'] {
    const m = t?.toLowerCase();
    if (m === 'attack') return 'attack';
    if (m === 'save') return 'save';
    if (m === 'damage') return 'damage';
    if (m === 'heal') return 'heal';
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

  private parseSourceDamageParts(parts: unknown): SourceDamagePart[] | undefined {
    if (parts === undefined) return undefined;
    if (!Array.isArray(parts)) throw new Error('InvalidSourceDamage: expected a damage list.');
    const result = parts.map((part: unknown): SourceDamagePart => {
      if (typeof part === 'string') return { formula: part, type: '', relationship: 'base' };
      if (!part || typeof part !== 'object' || Array.isArray(part)) throw new Error('InvalidSourceDamage: expected a damage part.');
      const record = part as Record<string, unknown>;
      const relationship = String(record['关系'] ?? record.relationship ?? 'base').trim().toLowerCase();
      const condition = record['条件'] ?? record.condition;
      const types=record['类型选项']??record.types;
      if(types!==undefined&&(!Array.isArray(types)||types.length<2||types.some(t=>typeof t!=='string'||!t.trim())||new Set(types).size!==types.length))throw new Error('InvalidSourceDamage: an exclusive type choice requires distinct nonempty types.');
      if (!['base', 'additional', 'conditional', 'replacement'].includes(relationship)
        || condition !== undefined && (typeof condition !== 'string' || !condition.trim())) {
        throw new Error('InvalidSourceDamage: relationship or condition is invalid.');
      }
      return {
        formula: String(record['公式'] ?? record.formula ?? ''),
        type: String(record['类型'] ?? record.type ?? ''),
        ...(types===undefined?{}:{types:types as string[]}),
        relationship: relationship as SourceDamagePart['relationship'],
        ...(condition === undefined ? {} : { condition: condition.trim() }),
      };
    });
    return result.length ? result : undefined;
  }

  private parseDamageParts(parts: unknown): DamagePart[] | undefined {
    const damage = this.parseSourceDamageParts(parts)?.filter(part =>
      part.relationship === 'base' || part.relationship === 'additional')
      .map(({ formula, type, types }) => ({ formula, type, ...(types ? { types } : {}) }));
    return damage?.length ? damage : undefined;
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
    return emb.map((e: unknown) => {
      const localized = (e as Record<string, unknown>)['条件'], literal = (e as Record<string, unknown>)['condition'];
      if (localized !== undefined && literal !== undefined && localized !== literal) throw new Error('InvalidEmbeddedCondition: conflicting literal fields.');
      const condition = localized !== undefined ? localized : literal;
      if (condition !== undefined && typeof condition !== 'string') throw new Error('InvalidEmbeddedCondition: expected a literal string.');
      return {
        type: String((e as Record<string, unknown>)['类型'] ?? (e as Record<string, unknown>)['type'] ?? ''),
        describe: String((e as Record<string, unknown>)['描述'] ?? (e as Record<string, unknown>)['describe'] ?? ''),
        ...(condition !== undefined ? { condition } : {}),
        duration: (e as Record<string, unknown>)['持续'] ? String((e as Record<string, unknown>)['持续']) : undefined,
        damageType: (e as Record<string, unknown>)['伤害类型'] ? String((e as Record<string, unknown>)['伤害类型']) : undefined,
        damageFormula: (e as Record<string, unknown>)['伤害公式'] ? String((e as Record<string, unknown>)['伤害公式']) : undefined,
        escapeDc: (e as Record<string, unknown>)['逃脱DC'] === undefined
          ? undefined : this.parseNumber((e as Record<string, unknown>)['逃脱DC']),
        staged: typeof (e as Record<string, unknown>)['阶段'] === 'boolean' ? (e as Record<string, unknown>)['阶段'] as boolean : undefined,
      };
    });
  }
}

import { splitBilingualName } from '@fvtt-json-generator/models/display-name';
import { normalizeCreatureFeatureInput,isHealingRecipient,isSourceCandidateReview,isSourceCandidateCounters,type SourceOperation } from '@fvtt-json-generator/models/source-operations';
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

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {name: '未映射能力', type: 'utility', describe: JSON.stringify(entry)};
    const name = (entry as Record<string, unknown>)['名称'] ?? (entry as Record<string, unknown>)['name'] ?? '';
    const type = (entry as Record<string, unknown>)['类型'] ?? (entry as Record<string,unknown>).type ?? 'utility';
    let describe = (entry as Record<string, unknown>)['描述'] ?? (entry as Record<string, unknown>)['describe'] ?? '';

    const record = structuredClone(entry as Record<string, unknown>);
    const candidateReview = record.candidateReview, candidateCounters = record.candidateCounters;
    const invalidReview = Object.hasOwn(record,'candidateReview')&&!isSourceCandidateReview(candidateReview);
    const invalidCounters = Object.hasOwn(record,'candidateCounters')
      &&!(Array.isArray(candidateCounters)&&candidateCounters.length===0)&&!isSourceCandidateCounters(candidateCounters);
    if(invalidReview)delete record.candidateReview;
    if(invalidCounters)delete record.candidateCounters;
    normalizeCreatureFeatureInput(record, describe);
    describe = record.description ?? record['描述'] ?? describe;
    let executionMode = record['执行模式'] ?? record.executionMode;
    if (record.sourceOperations !== undefined) executionMode = 'native-with-gm';
    if (executionMode === 'gm-manual' && ['伤害','damage','治疗','healing','攻击类型','attackType','命中','toHit','DC'].some(key => record[key] !== undefined)) executionMode = 'native-with-gm';
    if (executionMode === 'native-with-gm') {
      record.nativeRuleText ??= String(describe);
      record.manualRemainder ??= String(describe);
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
    const subActions = this.parseSubActions((entry as Record<string, unknown>)['子活动']);
    const literalName=record.literalName===true||executionMode!==undefined||!!spellcastingFeatureKey;
    const embeddedEffects = this.parseEmbeddedEffects((entry as Record<string, unknown>)['内嵌效果']);

    const suppliedType=this.normalizeType(String(type));
    const effectiveType=suppliedType!=='utility'?suppliedType:record['攻击类型']||record.attackType?'attack':record.DC!==undefined?'save':rawHealing?'heal':rawDamage?'damage':'utility';
    const action: StructuredActionData = {
      ...(record.actorResource==='legres'?{actorResource:'legres' as const}:{}),
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
      type: effectiveType,
      activation: activationType ? {
        type: activationType,
        condition: activationRecord?.['condition'] as string | undefined,
        ...(explicitActivationType ? { explicit: true } : {}),
      } : undefined,
      describe: String(describe),
    };
    if(invalidReview)this.retainActionField(action,'candidateReview',candidateReview,'审阅记录未能读取；原始记录保留，能力内容继续。',false);
    if(invalidCounters)this.retainActionField(action,'candidateCounters',candidateCounters,'手动次数记录未能读取；原始记录保留，能力内容继续。',false);
    if (rawDamage !== undefined) action.sourceDamageParts = this.parseSourceDamageParts(rawDamage);
    if(action.sourceDamageParts?.some(part=>part.relationship==='conditional'||part.relationship==='replacement'||part.condition))action.literalMechanics=true;
    action.sourceRuleFacts = action.literalMechanics === true || executionMode === 'gm-manual'||executionMode==='native-with-gm' ? [] : parseSupportedRuleFacts(action.describe ?? '');
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
      if(!Number.isFinite(action.toHit)){
        this.retainActionField(action,'attack/toHit',record['命中']??record.toHit,'此命中修正由GM按原始值处理；已知伤害保留。');
        delete action.attackType;delete action.toHit;action.type=action.damage?.length?'damage':'utility';
      }else if(!action.attackType){
        const rawKind=String(attackType).toLowerCase(),kind=rawKind==='melee'||rawKind==='ranged'?rawKind:'unclassified';
        const reach=/(?:reach|触及)\s*(\d+)/iu.exec(action.range),range=/(?:range|射程)\s*(\d+)(?:\s*\/\s*(\d+))?/iu.exec(action.range);
        const plain=/^\s*(\d+)(?:\s*\/\s*(\d+))?\s*(?:ft\.?|feet|尺)\s*$/iu.exec(action.range);
        if(kind==='unclassified')this.retainActionField(action,'attack/type',attackType,'攻击分类未映射，保留未分类的GM攻击检定。');
        const ids=new Set((action.sourceOperations??[]).map(op=>op.id));let id='flat-attack',suffix=1;while(ids.has(id))id='flat-attack-'+(++suffix);
        const op:SourceOperation={id,name:action.name,type:'attack',relationship:'primary',sourceText:action.describe??'',
          attack:{type:kind,toHit:action.toHit!,...(reach?{reach:Number(reach[1])}:kind==='melee'&&plain?{reach:Number(plain[1])}:{}),...(range?{range:Number(range[1]),...(range[2]?{longRange:Number(range[2])}:{})}:kind==='ranged'&&plain?{range:Number(plain[1]),...(plain[2]?{longRange:Number(plain[2])}:{})}:{})},
          damage:action.sourceDamageParts??[],proof:{},...(!reach&&!range&&kind==='unclassified'&&action.range?{targetSpecial:'GM 范围：'+action.range}:{})};
        action.sourceOperations=[...(action.sourceOperations??[]),op];action.executionMode='native-with-gm';action.nativeRuleText=action.describe??'';action.manualRemainder=action.describe??'';
        delete action.attackType;delete action.toHit;delete action.damage;delete action.sourceDamageParts;action.type='utility';
      }
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
      if(!Number.isFinite(action.DC)||!action.ability){
        this.retainActionField(action,'save',{dc:record.DC,ability:record['属性']??record.ability,statuses:record.nativeFailureStatuses},'此豁免字段由GM按原始值处理，已知伤害与其他操作保留。');
        delete action.DC;delete action.ability;delete action.nativeFailureStatuses;
        if(action.type==='save')action.type=action.damage?.length?'damage':'utility';
      }
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
          if(!target||typeof target!=='object'||Array.isArray(target)) { action.describe += '\n\nGM 治疗对象：'+JSON.stringify(target); } else {
          const recipient=target as Record<string,unknown>;
          if(isHealingRecipient(recipient))action.healing.target={type:recipient.type as 'self'|'creature'|'any',...(typeof recipient.count==='number'?{count:recipient.count}:{}),special:typeof recipient.special==='string'?recipient.special:''};
          else action.describe += '\n\nGM 治疗对象：'+JSON.stringify(target);
          }
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
    const rawUses=hasUses?record['使用次数']:hasDaily?{max:record['每日'],period:'day'}:undefined;
    if(rawUses && typeof rawUses === 'object' && !Array.isArray(rawUses)) {
      const uses=rawUses as Record<string,unknown>;
      if(Number.isSafeInteger(uses.max)&&Number(uses.max)>0&&typeof uses.period==='string'&&['day','longRest','shortRest','dawn'].includes(uses.period)) {
        action.uses={max:Number(uses.max),period:uses.period as NonNullable<StructuredActionData['uses']>['period']};
      } else action.describe += '\n\nGM 次数与恢复：'+JSON.stringify(rawUses);
    } else if(rawUses!==undefined)action.describe += '\n\nGM 次数与恢复：'+JSON.stringify(rawUses);
    if(hasUses&&hasDaily)action.describe += '\n\nGM 另有每日次数：'+JSON.stringify(record['每日']);

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

    return action;
  }

  private parseSpellcastingFeatureKey(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }
    return value.trim();
  }

  private retainActionField(action:StructuredActionData,path:string,value:unknown,message:string,appendSourceNote=true):void {
    const prior=action.candidateReview;
    action.candidateReview={version:1,findings:[...(prior?.findings??[]),{code:'FIELD_PROJECTION_INCOMPLETE',path,message}],proposal:{prior:prior?.proposal??null,value}};
    if(appendSourceNote)action.describe=[action.describe,'GM：'+message+' '+JSON.stringify(value)].filter(Boolean).join('\n\n');
  }

  private parseWeaponConfiguration(value: unknown): WeaponConfiguration | undefined {
    if (value === undefined) return undefined;
    const parsed = parseWeaponConfiguration(value);
    if (!parsed) {
      return undefined;
    }
    return parsed;
  }

  private parseNativeMastery(value: unknown): StructuredActionData['nativeMastery'] {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!isWeaponMasteryId(normalized)) {
      return undefined;
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
    return undefined;
  }

  private normalizeAbility(a: string): SaveAbility | undefined {
    if (!a) return undefined;
    return ABILITY_MAP[a.toLowerCase()] as SaveAbility | undefined;
  }

  private parseNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v.replace(/[^\d-]/g, ''), 10) || 0;
    return 0;
  }

  private parseSourceDamageParts(parts: unknown): SourceDamagePart[] | undefined {
    if (parts === undefined) return undefined;
    const values=Array.isArray(parts)?parts:[parts];
    const result = values.flatMap((part: unknown): SourceDamagePart[] => {
      if (typeof part === 'string') return [{ formula: part, type: '', relationship: 'base' }];
      if (!part || typeof part !== 'object' || Array.isArray(part)) return [];
      const record = part as Record<string, unknown>;
      const relationship = String(record['关系'] ?? record.relationship ?? 'base').trim().toLowerCase();
      const condition = record['条件'] ?? record.condition;
      const types=record['类型选项']??record.types;
      const knownRelationship=['base','additional','conditional','replacement'].includes(relationship)?relationship:'conditional';
      return [{
        formula: String(record['公式'] ?? record.formula ?? ''),
        type: String(record['类型'] ?? record.type ?? ''),
        ...(!Array.isArray(types)?{}:{types:types.filter(t=>typeof t==='string') as string[]}),
        relationship: knownRelationship as SourceDamagePart['relationship'],
        ...(typeof condition === 'string'?{condition:condition.trim()}:knownRelationship!==relationship?{condition:'GM 伤害关系：'+relationship}:{}),
      }];
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
    return effects.filter(e=>e&&typeof e==='object'&&!Array.isArray(e)).map((e: unknown) => ({
      formula: (e as Record<string, unknown>)['公式'] ? String((e as Record<string, unknown>)['公式']) : undefined,
      type: (e as Record<string, unknown>)['类型'] ? String((e as Record<string, unknown>)['类型']) : undefined,
      state: (e as Record<string, unknown>)['状态'] ? String((e as Record<string, unknown>)['状态']) : undefined,
      describe: (e as Record<string, unknown>)['描述'] ? String((e as Record<string, unknown>)['描述']) : undefined,
    }));
  }

  private parseSpecialEffects(effects: unknown): SpecialEffect[] | undefined {
    if (!effects || !Array.isArray(effects)) return undefined;
    return effects.filter(e=>e&&typeof e==='object'&&!Array.isArray(e)).map((e: unknown) => ({
      trigger: String((e as Record<string, unknown>)['触发'] ?? (e as Record<string, unknown>)['trigger'] ?? ''),
      describe: String((e as Record<string, unknown>)['描述'] ?? (e as Record<string, unknown>)['describe'] ?? ''),
    }));
  }

  private parseSubActions(sub: unknown): SubAction[] {
    if (!sub || !Array.isArray(sub)) return [];
    return sub.filter(s=>s&&typeof s==='object'&&!Array.isArray(s)).map((s: unknown) => ({
      name: String((s as Record<string, unknown>)['名称'] ?? (s as Record<string, unknown>)['name'] ?? ''),
      type: this.normalizeType(String((s as Record<string, unknown>)['类型'] ?? (s as Record<string, unknown>)['type'] ?? 'utility')),
      trigger: String((s as Record<string, unknown>)['触发'] ?? (s as Record<string, unknown>)['trigger'] ?? 'special') as TriggerType,
      threshold: (s as Record<string, unknown>)['阈值'] ? this.parseNumber((s as Record<string, unknown>)['阈值']) : undefined,
      DC: (s as Record<string, unknown>)['DC'] ? this.parseNumber((s as Record<string, unknown>)['DC']) : undefined,
      ability: (s as Record<string, unknown>)['属性'] ? this.normalizeAbility(String((s as Record<string, unknown>)['属性'])) : undefined,
      damage: this.parseDamageParts((s as Record<string, unknown>)['伤害']),
      embeddedEffects: this.parseEmbeddedEffects((s as Record<string, unknown>)['内嵌效果']),
      describe: String((s as Record<string, unknown>)['描述'] ?? (s as Record<string, unknown>)['describe'] ?? ''),
    }));
  }

  private parseEmbeddedEffects(emb: unknown): EmbeddedEffect[] {
    if (!emb || !Array.isArray(emb)) return [];
    return emb.filter(e=>e&&typeof e==='object'&&!Array.isArray(e)).map((e: unknown) => {
      const localized = (e as Record<string, unknown>)['条件'], literal = (e as Record<string, unknown>)['condition'];
      const condition = localized !== undefined ? localized : literal;
      return {
        type: String((e as Record<string, unknown>)['类型'] ?? (e as Record<string, unknown>)['type'] ?? ''),
        ...((e as Record<string,unknown>)['状态']??(e as Record<string,unknown>).statuses?{statuses:((e as Record<string,unknown>)['状态']??(e as Record<string,unknown>).statuses) as string[]}:{}),
        ...((e as Record<string,unknown>)['力竭级数']!==undefined?{exhaustionLevels:this.parseNumber((e as Record<string,unknown>)['力竭级数'])}:{}),
        describe: String((e as Record<string, unknown>)['描述'] ?? (e as Record<string, unknown>)['describe'] ?? ''),
        ...(typeof condition === 'string' ? { condition } : {}),
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

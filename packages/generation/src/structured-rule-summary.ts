import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from '@fvtt-json-generator/contracts/status-lifecycle';
import type { ActionData, SourceDamagePart, SourceRuleFact, StructuredActionData } from '@fvtt-json-generator/models/action';
import { conditionalAttackSaveTrigger, normalizedSourceDamageParts } from './save-outcome';

/** An audit aid for mechanics already consumed by Actor generation. It never replaces source prose. */
export interface StructuredRuleSummary {
  zh: string;
  factRefs: string[];
  executionMode: 'native' | 'gm-assisted';
  uncovered: string[];
}

const DAMAGE: Record<string, string> = {
  acid: '强酸', bludgeoning: '钝击', cold: '寒冷', fire: '火焰', force: '力场',
  lightning: '闪电', necrotic: '暗蚀', piercing: '穿刺', poison: '毒素',
  psychic: '心灵', radiant: '光耀', slashing: '挥砍', thunder: '雷鸣',
};
const ABILITY: Record<string, string> = {
  str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力',
  力量: '力量', 敏捷: '敏捷', 体质: '体质', 智力: '智力', 感知: '感知', 魅力: '魅力',
};
const ACTIVATION: Record<string, string> = {
  action: '动作', bonus: '附赠动作', reaction: '反应', legendary: '传奇动作', special: '特殊激活',
};
const PERIOD: Record<string, string> = {
  day: '每日', longRest: '每次长休', shortRest: '每次短休', dawn: '每日黎明',
};
const UNIT: Record<string, string> = {
  round: '轮', minute: '分钟', hour: '小时', day: '天',
  rounds: '轮', minutes: '分钟', hours: '小时', days: '天',
};
const SHAPE: Record<string, string> = { sphere: '球形', radius: '球形', cone: '锥形', line: '线形', cube: '立方体', cylinder: '圆柱形', rectangle: '矩形', 球形: '球形', 锥形: '锥形', 线形: '线形', 立方体: '立方体', 圆柱形: '圆柱形', 矩形: '矩形' };
const STATUS = Object.fromEntries(Object.entries(NATIVE_LIFECYCLE_STATUS_DEFINITIONS)
  .flatMap(([, definition]) => definition.sourceNames.map(name => [name.toLowerCase(), definition.label])));

function plainNumber(value: number | string): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? String(value) : undefined;
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/u.test(trimmed) ? trimmed : undefined;
}
function simpleRange(value: string): string | undefined {
  const trimmed = value.trim();
  const match = /^(?:触及|射程|reach|range)?\s*(\d+(?:\s*\/\s*\d+)?)\s*(?:尺|ft\.?)?$/iu.exec(trimmed);
  return match?.[1]?.replace(/\s+/gu, '');
}
function simpleDuration(value: string): string | undefined {
  const match = /^(\d+)\s*(rounds?|minutes?|hours?|days?|轮|分钟|小时|天)$/iu.exec(value.trim());
  if (!match) return undefined;
  const unit = UNIT[match[2]!.toLowerCase()] ?? (['轮', '分钟', '小时', '天'].includes(match[2]!) ? match[2]! : undefined);
  return unit ? match[1] + unit : undefined;
}

export function summarizeStructuredRule(input: {
  logicalPath: string;
  action: ActionData;
  sourceAction?: StructuredActionData;
  generatedItem?: any;
}): StructuredRuleSummary | undefined {
  const { logicalPath: path, action, sourceAction, generatedItem } = input;
  const lines: string[] = [];
  const refs: string[] = [];
  const uncovered: string[] = [];
  let assisted = false;
  const add = (name: string, zh: string) => { lines.push(zh); refs.push(path + '/structured/' + name); };
  const unknown = (name: string, source?: string) => {
    assisted = true;
    uncovered.push(path + '/structured/' + name + (source ? ': ' + source : ''));
  };

  for(const op of sourceAction?.sourceOperations??[]){
    const prefix='sourceOperations/'+op.id;
    if(op.attack)add(prefix+'/attack',({mwak:'近战武器',rwak:'远程武器',msak:'近战法术',rsak:'远程法术'}[op.attack.type])+'攻击，命中'+(op.attack.toHit>=0?'+':'')+op.attack.toHit+(op.attack.reach!==undefined?'，触及'+op.attack.reach+'尺':'')+(op.attack.range!==undefined?'，射程'+op.attack.range+(op.attack.longRange?'/'+op.attack.longRange:'')+'尺':''));
    if(op.save)add(prefix+'/save','DC '+op.save.dc+op.save.abilities.map(ability=>ABILITY[ability]).join('或')+'豁免'+(op.save.choice==='target'?'，由目标选择属性':'')+(op.save.outcome==='half'?'，成功时伤害减半':''));
    if(op.healing)add(prefix+'/healing',op.healing.formula+'点'+(op.healing.type==='temphp'?'临时生命值':'治疗')+'，'+(op.healing.target.type==='self'?'自身':'同一来源受者')+'；时机与资格按完整原文');
    for(const[index,part]of(op.damage??[]).entries())add(prefix+'/damage/'+index,part.formula+'点'+(part.types??[part.type]).map(type=>DAMAGE[type]??type).join('或')+'伤害'+(part.types?'（同次掷骰自选一种类型）':'')+(['conditional','replacement'].includes(part.relationship)?'，由GM判断来源条件':''));
    if(op.aoe)add(prefix+'/aoe',op.aoe.radius+'尺'+(op.aoe.shape==='radius'?'自身光环':SHAPE[op.aoe.shape])+'区域');
    if(op.relationship==='follow-up')add(prefix+'/trigger','后续操作由GM按完整来源单独触发，不再次消耗主能力次数');
    unknown(prefix+'/adjudication',op.sourceText);
  }

  if (action.attack) {
    const kind = { mwak: '近战武器', rwak: '远程武器', msak: '近战法术', rsak: '远程法术' }[action.attack.type];
    const range = simpleRange(action.attack.reach ?? action.attack.range);
    add('attack', kind + '攻击，命中加值' + (action.attack.toHit >= 0 ? '+' : '') + action.attack.toHit
      + (range ? '，' + (action.attack.type === 'mwak' || action.attack.type === 'msak' ? '触及' : '射程') + range + '尺' : ''));
    if (!range && (action.attack.reach || action.attack.range)) unknown('attack/range', action.attack.reach ?? action.attack.range);
    if (action.attack.versatile) {
      add('attack/versatile', '双手替代伤害公式' + action.attack.versatile.formula + '，由GM核对适用条件');
      unknown('attack/versatile-condition');
    }
  }
  if (action.save) {
    const ability = ABILITY[action.save.ability.toLowerCase()];
    add('save', 'DC ' + action.save.dc + (ability ?? '属性待核对') + '豁免'
      + (action.save.outcome === 'half' ? '，成功时伤害减半' : ''));
    if (!ability) unknown('save/ability', action.save.ability);
    if (action.save.outcome === 'literal') unknown('save/outcome', action.save.onSave ?? action.save.onFail);
    if (action.save.condition) {
      if (conditionalAttackSaveTrigger(action) === action.save.condition)
        add('save/trigger', '仅当本次攻击伤害使目标生命值降至0时，后续豁免与后果由GM处理');
      unknown('save/condition', action.save.condition);
    }
  }
  if (sourceAction?.saveCondition && sourceAction.saveCondition !== action.save?.condition)
    unknown('save/source-condition', sourceAction.saveCondition);
  if (action.targetAffected) {
    const target = action.targetAffected;
    const count = target.count === 'all' ? '所有' : plainNumber(target.count);
    if (count && (target.type === 'creature' || target.type === 'object')) {
      add('target', count === '所有' ? '所有' + (target.type === 'creature' ? '生物' : '物体')
        : count + (target.type === 'creature' ? '个生物' : '个物体'));
    } else {
      add('target', '目标数量或类型待GM核对');
      unknown('target/count-type', String(target.count) + '/' + target.type);
    }
    if (target.special) unknown('target/special', target.special);
  }
  if (action.aoe?.template) {
    const area = action.aoe.template;
    const shape = SHAPE[area.type];
    if (shape && Number.isFinite(area.distance)) add('aoe', shape + '区域，范围' + area.distance + '尺');
    else { add('aoe', '区域形状或范围待GM核对'); unknown('aoe', area.type + '/' + area.distance); }
  }
  if (action.activity?.range) {
    const range = plainNumber(action.activity.range.value);
    if (range && action.activity.range.units === 'ft') add('activity/range', '射程' + range + '尺');
    else { add('activity/range', '射程待GM核对'); unknown('activity/range', action.activity.range.value + ' ' + action.activity.range.units); }
  }
  if(action.activity?.targetSpecial){
    if(action.activity.targetSpecial==='targets it can see')add('activity/targetSpecial','目标必须在该生物视线内');
    else unknown('activity/targetSpecial',action.activity.targetSpecial);
  }
  if (action.activity?.target?.template) {
    const template = action.activity.target.template;
    const size = plainNumber(template.size);
    if (size && template.units === 'ft' && SHAPE[template.type])
      add('activity/template', SHAPE[template.type] + '区域，范围' + size + '尺');
    else { add('activity/template', '区域模板待GM核对'); unknown('activity/template', template.type + '/' + template.size + '/' + template.units); }
  }
  if (action.activity?.duration) {
    const duration = action.activity.duration;
    const value = plainNumber(duration.value);
    const unit = UNIT[duration.units.toLowerCase()];
    if (value && unit) add('activity/duration', '持续' + value + unit + (duration.concentration ? '，需要专注' : ''));
    else { add('activity/duration', '持续时间待GM核对'); unknown('activity/duration', duration.value + ' ' + duration.units); }
  }
  const damage: SourceDamagePart[] = normalizedSourceDamageParts(action) ??
    (action.attack?.damage ?? action.damage ?? []).map(part => ({ ...part, relationship: 'base' }));
  damage.forEach((part, index) => {
    const type = DAMAGE[part.type.toLowerCase()];
    const relationship = { base: '基础', additional: '追加', conditional: '条件', replacement: '替代' }[part.relationship];
    const needsCondition = Boolean(part.condition) || part.relationship === 'conditional' || part.relationship === 'replacement';
    if (!type) {
      add('damage/' + index, '第' + (index + 1) + '项' + relationship + '伤害类型待GM核对'
        + (needsCondition ? '，触发或替代条件待GM核对' : ''));
      unknown('damage/' + index + '/type', part.type);
      if (needsCondition) unknown('damage/' + index + '/condition', part.condition);
      return;
    }
    add('damage/' + index, relationship + '伤害' + part.formula + '点' + type
      + (needsCondition ? '，触发或替代条件待GM核对' : ''));
    if (needsCondition) unknown('damage/' + index + '/condition', part.condition);
  });
  if (sourceAction?.activation) {
    const activation = ACTIVATION[sourceAction.activation.type];
    if (activation) add('activation', '激活方式：' + activation
      + (sourceAction.activation.cost === undefined ? '' : '，消耗' + sourceAction.activation.cost));
    else { add('activation', '激活方式待GM核对'); unknown('activation/type', sourceAction.activation.type); }
    if (sourceAction.activation.condition) unknown('activation/condition', sourceAction.activation.condition);
  }
  if (sourceAction?.uses) {
    const period = PERIOD[sourceAction.uses.period];
    if (period) add('uses', period + '可使用' + sourceAction.uses.max + '次');
    else { add('uses', '使用次数恢复条件待GM核对'); unknown('uses/period', sourceAction.uses.period); }
  }
  if (sourceAction?.perLongRest !== undefined) add('perLongRest', '每次长休可使用' + sourceAction.perLongRest + '次');
  if (action.usesPerDay !== undefined) add('usesPerDay', '每日可使用' + action.usesPerDay + '次');
  if (action.healing) add('healing', '恢复公式' + action.healing.formula
    + (action.healing.type === 'temphp' ? '点临时生命值' : '点生命值'));
  if (sourceAction?.recharge) add('recharge', '充能' + sourceAction.recharge[0] + '—' + sourceAction.recharge[1]);
  if (action.recharge) add('recharge/consumed', '充能起点' + action.recharge.value + (action.recharge.charged ? '，当前已充能' : '，当前未充能'));
  if (sourceAction?.concentration) add('concentration', '需要专注');
  for (const [index, effect] of (sourceAction?.embeddedEffects ?? []).entries()) {
    const status = STATUS[effect.type.toLowerCase()];
    if (status) {
      const generatedStatuses = (generatedItem?.effects ?? [])
        .flatMap((item: any) => Array.isArray(item?.statuses) ? item.statuses : []);
      add('effect/' + index, '状态' + status
        + (effect.escapeDc === undefined ? '' : '，逃脱DC ' + effect.escapeDc)
        + (effect.staged ? '，按阶段变化' : '')
        + (effect.duration && simpleDuration(effect.duration) ? '，持续' + simpleDuration(effect.duration) : '')
        + (generatedStatuses.includes(effect.type.toLowerCase()) ? '，Actor含状态效果' : '，原生效果关联待核对'));
      if (!generatedStatuses.includes(effect.type.toLowerCase())) unknown('effect/' + index + '/linkage');
    } else { add('effect/' + index, '状态名称待GM核对'); unknown('effect/' + index + '/status', effect.type); }
    if (effect.escapeDc !== undefined || effect.staged || effect.duration) assisted = true;
    if (effect.duration && !simpleDuration(effect.duration)) unknown('effect/' + index + '/duration', effect.duration);
    if (effect.describe) unknown('effect/' + index + '/description', effect.describe);
  }
  for (const [index, effect] of (sourceAction?.failEffects ?? []).entries()) {
    if (!effect.state) continue;
    const status = STATUS[effect.state.toLowerCase()];
    add('failure-effect/' + index, status ? '豁免失败施加' + status + '，生效条件待GM核对' : '豁免失败状态待GM核对');
    unknown('failure-effect/' + index + '/application', status ? undefined : effect.state);
  }
  if (sourceAction?.successEffects?.length) unknown('success-effects', JSON.stringify(sourceAction.successEffects));
  if (sourceAction?.lowValueEffects?.length) unknown('low-value-effects', JSON.stringify(sourceAction.lowValueEffects));
  if (sourceAction?.specialEffects?.length) unknown('special-effects', JSON.stringify(sourceAction.specialEffects));
  if (sourceAction?.subActions?.length) unknown('sub-actions', JSON.stringify(sourceAction.subActions));
  for (const [index, fact] of (action.sourceRuleFacts ?? []).entries()) {
    renderSupportedFact(fact, index, action, add, unknown);
  }
  if (!lines.length && uncovered.length) add('uncovered', '结构化机制待GM对照完整来源核对');
  if (!lines.length) return undefined;
  return { zh: lines.join('；') + (uncovered.length ? '；未覆盖条件或机制由GM对照完整来源核对' : '')
    + '。', factRefs: refs, executionMode: assisted ? 'gm-assisted' : 'native', uncovered };
}

function renderSupportedFact(
  fact: SourceRuleFact,
  index: number,
  action: ActionData,
  add: (name: string, zh: string) => void,
  unknown: (name: string, source?: string) => void,
): void {
  const prefix = 'rule/' + index + '/' + fact.kind;
  const native = normalizedSourceDamageParts(action)?.filter(part =>
    (part.relationship === 'base' || part.relationship === 'additional') && !part.condition)
    ?? action.attack?.damage ?? action.damage ?? [];
  const hasDamage = (formula: string, type: string) => native.some(part =>
    part.formula.replace(/\s+/gu, '').toLowerCase() === formula.replace(/\s+/gu, '').toLowerCase()
      && part.type.toLowerCase() === type.toLowerCase());
  if (fact.kind === 'attack-damage') {
    const range = simpleRange(action.attack?.reach ?? action.attack?.range ?? '');
    if (!action.attack || action.attack.type !== fact.attackType || action.attack.toHit !== fact.toHit
      || range !== simpleRange(fact.distance) || !hasDamage(fact.formula, fact.damageType)) {
      add(prefix, '来源攻击规则与Actor事实待GM核对'); unknown(prefix + '/fact-conflict', fact.source); return;
    }
    add(prefix, '一个目标，命中时受到' + fact.average + '（' + fact.formula + '）点'
      + (DAMAGE[fact.damageType.toLowerCase()] ?? '类型待核对') + '伤害');
    if (!DAMAGE[fact.damageType.toLowerCase()]) unknown(prefix + '/damage-type', fact.damageType);
  } else if (fact.kind === 'save-damage') {
    if (!action.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability
      || !hasDamage(fact.formula, fact.damageType)
      || fact.halfOnSuccess && action.save.outcome !== 'half') {
      add(prefix, '来源豁免伤害与Actor事实待GM核对'); unknown(prefix + '/fact-conflict', fact.source); return;
    }
    const target = fact.targetScope.kind === 'target' ? '目标'
      : fact.targetScope.kind === 'area' ? '区域内所有生物' : fact.targetScope.feet + '尺内所有生物';
    add(prefix, target + '豁免失败时受到' + fact.average + '（' + fact.formula + '）点'
      + (DAMAGE[fact.damageType.toLowerCase()] ?? '类型待核对') + '伤害'
      + (fact.halfOnSuccess ? '，成功时伤害减半' : ''));
    if (!DAMAGE[fact.damageType.toLowerCase()]) unknown(prefix + '/damage-type', fact.damageType);
  } else if (fact.kind === 'visible-target-save-damage') {
    if (!action.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability
      || action.save.outcome !== 'half'
      || fact.damages.length !== native.length
      || fact.damages.some((part, index) => !hasDamage(part.formula, part.damageType)
        || native[index]?.formula.replace(/\s+/gu, '').toLowerCase() !== part.formula.replace(/\s+/gu, '').toLowerCase())) {
      add(prefix, '来源可见目标豁免与Actor事实待GM核对'); unknown(prefix + '/fact-conflict', fact.source); return;
    }
    const damages = fact.damages.map(part => part.average + '（' + part.formula + '）点'
      + (DAMAGE[part.damageType.toLowerCase()] ?? '类型待核对') + '伤害').join('，外加');
    add(prefix, '施用者能看见且位于' + fact.withinFeet + '尺内的一名生物豁免失败时受到'
      + damages + '，成功时伤害减半');
    if (fact.damages.some(part => !DAMAGE[part.damageType.toLowerCase()])) unknown(prefix + '/damage-type');
  } else if (fact.kind === 'heavy-armour-half') {
    if (!native.some(part => part.formula.replace(/\s+/gu, '') === fact.formula.replace(/\s+/gu, '')
      && part.type.toLowerCase() === fact.damageType.toLowerCase())) {
      add(prefix, '来源条件伤害与Actor事实待GM核对');
      unknown(prefix + '/fact-conflict', fact.source);
      return;
    }
    const damageType = DAMAGE[fact.damageType.toLowerCase()];
    if (!damageType) { add(prefix, '来源伤害类型待GM核对'); unknown(prefix + '/damage-type', fact.damageType); return; }
    add(prefix, '受' + (fact.targetCondition === 'grappled' ? '擒' : '束缚') + '的目标受到'
      + fact.average + '（' + fact.formula + '）点' + damageType + '伤害；'
      + (fact.armourNegated ? '未穿重甲时' : '穿着重甲时') + '伤害减半，由GM处理');
    unknown(prefix + '/application');
  } else if (fact.kind === 'forced-movement') {
    if (action.save && (action.save.dc !== fact.dc || action.save.ability !== fact.ability)) {
      add(prefix, '来源推离豁免与Actor事实待GM核对'); unknown(prefix + '/fact-conflict', fact.source); return;
    }
    const ability = ABILITY[fact.ability];
    add(prefix, '目标进行DC ' + fact.dc + (ability ?? '属性待核对') + '豁免；失败时被推离'
      + fact.distance + (fact.distanceFormula ? '（' + fact.distanceFormula.replace(/[x*]/giu, '×') + '）' : '')
      + '尺，由GM处理');
    unknown(prefix + '/application', ability ? undefined : fact.ability);
  } else if (fact.kind === 'target-choice-save') {
    if (action.save && action.save.dc !== fact.dc) {
      add(prefix, '来源目标自选豁免与Actor事实待GM核对'); unknown(prefix + '/fact-conflict', fact.source); return;
    }
    const target = fact.targetScope.kind === 'area' ? fact.targetScope.feet + '尺区域内的生物'
      : fact.targetScope.feet + '尺内的生物';
    const status = STATUS[fact.failedStatus.toLowerCase()];
    add(prefix, target + '由目标自选进行DC ' + fact.dc + '智力或感知豁免；失败时'
      + (status ?? '状态待核对') + '，持续' + fact.duration.value + UNIT[fact.duration.unit]
      + '；在其回合' + (fact.repeatAt === 'end' ? '结束' : '开始') + '时再次豁免，由GM核对');
    unknown(prefix + '/application', status ? undefined : fact.failedStatus);
  } else if (fact.kind === 'food-retention') {
    add(prefix, '固体食物只有用海水送服才能留住而不吐出，由GM核对');
    unknown(prefix + '/application');
  }
}

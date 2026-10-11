import type { EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { decodeStatusLifecycleParameters, nativeLifecycleStatusLabel } from '@fvtt-json-generator/contracts/status-lifecycle';
import { localizationText, type EncounterLocalization } from '@fvtt-json-generator/contracts/localization';
import type { EncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { configuredConditionSummary } from './configuredConditions';
import { approvedDisplayTitle } from './encounterReviewNavigation';

const EVIDENCE = [
  ['application', '施加对象与触发'], ['duration', '持续时间'], ['repeatSave', '再次豁免'],
  ['timing', '豁免时机'], ['optionality', '可选或必须'], ['removal', '解除条件'],
] as const;

/** Human-readable projection only. The source report never grants import authority. */
export function encounterReviewCards(report: EncounterIntakeReport | undefined, localized?: EncounterLocalization,
  progress:readonly EncounterLocalizationProgress[]=[]): Array<{
  actorKey: string; actor: string; feature: string; gmManual:boolean; source: string; summary: string; normalized: string; handling: string;
  gmSteps: string[]; evidence: Array<{ label: string; quote: string }>;
  evidenceMissing: boolean;
}> {
  const selection = report?.automation?.selection;
  if (!selection || !Array.isArray(selection.rules)) return [];
  return selection.rules.filter(rule=>rule&&typeof rule==='object'&&typeof rule.actorKey==='string'
    &&typeof rule.featureName==='string'&&typeof rule.quote==='string'&&typeof rule.kind==='string'
    &&rule.parameters&&typeof rule.parameters==='object'&&!Array.isArray(rule.parameters)
    &&Array.isArray(rule.gmSteps)&&rule.gmSteps.every(step=>typeof step==='string')).map(rule => {
    const actor = report.actors.find(item => item.key === rule.actorKey);
    const source = actor?.source ?? '';
    const quote = source.includes(rule.quote) ? rule.quote : '';
    const evidence = EVIDENCE.flatMap(([key, label]) => {
      const value = rule.sourceEvidence?.[key];
      return typeof value === 'string' && value.length <= 2000 && quote.includes(value) ? [{ label, quote: value }] : [];
    });
    const acceptedProgress=progress.find(entry=>entry.actorKey===rule.actorKey && entry.status==='accepted'
      && !entry.findings?.length && entry.translation && 'review'in entry.translation
      && entry.translation.review.verdict==='accepted');
    const actorTranslation=localized?.actors.find(entry=>entry.key===rule.actorKey)?.translation??acceptedProgress?.translation;
    const approved=!!actorTranslation&&('approval'in actorTranslation||'review'in actorTranslation
      &&actorTranslation.review.verdict==='accepted'&&!actorTranslation.review.findings.length);
    const translations=approved&&actorTranslation
      ? new Map(actorTranslation.texts.map(entry=>[entry.id,entry.text])):undefined;
    const originalActor=actor?.analysis?.candidate?.label ?? rule.actorKey;
    const approvedTitle=(original:string):string=>{
      const id=localizationText('title',original).id;
      const translated=translations?.get(id);
      const bound=acceptedProgress?.request.texts.some(entry=>entry.id===id&&entry.kind==='title'&&entry.source===original)
        ||localized?.actors.some(entry=>entry.key===rule.actorKey&&entry.translation.texts.some(text=>text.id===id));
      return translated&&bound&&actorTranslation?approvedDisplayTitle(original,translated,actorTranslation.policy):original;
    };
    return {
      actorKey:rule.actorKey,actor:actor?.analysis?.candidate?.label?approvedTitle(originalActor):originalActor,gmManual:rule.kind==='gm-manual',
      feature: approvedTitle(rule.featureName),
      source: quote || '来源原句缺失，请展开完整来源核对。',
      summary:rule.kind==='status-lifecycle'?safeLifecycleSummary(rule.parameters)
        :rule.kind==='gm-manual'?'此项由 GM 按完整来源原句及下方步骤裁定；工具不自动执行。'
        :`固定能力：${capabilityLabel(rule.kind)}。请结合来源原句和下方 GM 操作核对限制。`,
      normalized: JSON.stringify(rule.parameters, null, 2),
      handling: rule.kind === 'gm-manual' ? 'GM 裁定；工具不自动执行这项规则。' : '工具固定能力；仅在明确启动战斗控制后执行。',
      gmSteps: localized?rule.gmSteps.map(step=>translations?.get(localizationText('body',step).id)
        ??`来源语言（未找到本角色已审核译文）：${step}；请核对下方完整已译规则。`):rule.gmSteps,
      evidence,
      evidenceMissing: !quote || (rule.kind === 'status-lifecycle' && evidence.length !== EVIDENCE.length),
    };
  });
}

function capabilityLabel(kind:string):string{
  return ({'save-summon':'豁免结算后的召唤','turn-start-area':'来源回合开始的范围处理','staged-corruption':'分阶段腐化与力竭',
    'threshold-ward':'伤害阈值守护','ward-break':'消耗次数后守护破裂','save-failure-effect':'豁免失败后的状态效果',
    'gm-activity-lock':'GM 控制能力可用性'} as Record<string,string>)[kind]??'当前规则';
}
function safeLifecycleSummary(parameters:Record<string,unknown>):string{
  try{return statusLifecycleSummary(parameters);}catch{return '状态参数无法形成可读摘要，请核对下方完整参数及原始来源。';}
}
export function statusLifecycleSummary(parameters:Record<string,unknown>):string{
  const p=decodeStatusLifecycleParameters(parameters);
  const abilities:Record<string,string>={str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
  return `攻击命中后向目标施加${p.definition?.name??nativeLifecycleStatusLabel(p.status)}，持续${p.duration.value}${p.duration.unit==='minute'?'分钟':'轮'}。目标每回合结束时${p.repeatSave.optional?'可':'须'}进行 DC ${p.repeatSave.dc} 的${abilities[p.repeatSave.ability]}豁免，成功解除本来源的效果。${p.definition?configuredConditionSummary(p.definition)+'。':''}使用前标记一个目标并启用战斗控制。`;
}

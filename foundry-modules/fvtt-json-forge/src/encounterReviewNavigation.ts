import { localizationText, LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY, type LocalizationPolicy, type LocalizationText } from '@fvtt-json-generator/contracts/localization';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import type { EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { EncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';

export interface EncounterReviewIssue {
  actorKey?: string;
  actor: string;
  field: string;
  kind: string;
  message: string;
  source?: string;
  draft?: string;
  locateStart?: number;
  locateEnd?: number;
  action: 'translate' | 'resume' | 'connection' | 'inspect';
}

/** A display projection. Neither filtering nor issue classification changes review authority. */
export function encounterReviewNavigation(report: EncounterIntakeReport | undefined,
  progress: readonly EncounterLocalizationProgress[], source: string, prepared: boolean,
  bundle?:{label:string;macros:readonly {name:string;notes:string}[];actors:readonly {key:string;label:string;source:string}[]},
  preparedActors?:readonly {key:string;artifact:unknown}[]) {
  const current = report?.source === source && report.sourceHash === hashSource(source) ? report : undefined;
  const advisoryReview=prepared&&current?.status==='ready_for_gm_review';
  // Only the caller's progress verified against a current formal candidate is displayed.
  const currentProgress = prepared && bundle && (!report||current) ? progress : [];
  const actors = current?.actors ?? [];
  const names = new Map((current?.actors.map(actor=>({key:actor.key,label:actor.analysis?.candidate?.label??actor.key}))
    ??bundle?.actors.map(actor=>({key:actor.key,label:actor.label}))??[]).map(actor=>[actor.key,actor.label]));
  const issues: EncounterReviewIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: EncounterReviewIssue) => {
    const identity = JSON.stringify([issue.actorKey, issue.field, issue.kind, issue.message]);
    if (!seen.has(identity)) { seen.add(identity); issues.push(issue); }
  };
  for (const actor of actors) {
    for (const finding of [...(actor.analysis?.findings ?? []), ...(actor.generation?.findings ?? [])]) {
      if (!finding.blocking) continue;
      if(advisoryReview&&finding.origin==='ai-review')continue;
      if (current?.status === 'ready_for_gm_review' && current.automation?.selection
        && ['ACTOR_STAGED_CONDITION_REQUIRES_COMPANION','ACTOR_CONDITION_REQUIRES_GM'].includes(finding.code)) continue;
      const quote = finding.evidence?.find(entry => typeof entry.quote === 'string' && actor.source.includes(entry.quote))?.quote;
      const start = quote ? source.indexOf(quote, actor.start) : -1;
      add({actorKey: actor.key, actor: names.get(actor.key)!, field: finding.path || '角色规则', kind: finding.code || '来源审核',
        message: finding.message, source: quote, ...(start >= actor.start && start + (quote?.length ?? 0) <= actor.end
          && source.indexOf(quote!,start+1) === -1
          ? {locateStart:start, locateEnd:start + quote!.length}:{}), action:'resume'});
    }
    if ((actor.analysis?.status === 'failed' || actor.generation?.status === 'failed') && !issues.some(issue=>issue.actorKey===actor.key))
      add({actorKey:actor.key,actor:names.get(actor.key)!,field:'角色生成',kind:'生成失败',message:'当前角色尚未通过正式生成与审核；请检查完整报告。',action:'resume'});
  }
  for (const entry of currentProgress) {
    if (entry.status === 'accepted' && !entry.findings?.length) continue;
    const unknownActor=!!entry.actorKey&&!names.has(entry.actorKey);
    const actorKey = entry.actorKey && !unknownActor ? entry.actorKey : undefined;
    const actor = unknownActor?'归属待核':actorKey?names.get(actorKey)!:'战斗包';
    const fields = new Map(!unknownActor?entry.request?.texts?.map(field => [field.id, field]) ?? []:[]);
    const drafts = new Map(entry.draft?.texts?.map(field => [field.id, field.text]) ?? []);
    for (const finding of entry.findings?.length ? entry.findings : entry.status === 'needs_review' ? ['译文未通过审核；请检查完整审核记录。'] : []) {
      const ids = [...new Set(finding.match(/text-[0-9a-f]{24}/gu) ?? [])];
      const field = ids.length === 1 ? fields.get(ids[0]!) : undefined;
      const offset = field ? source.indexOf(field.source, actorKey ? actors.find(item => item.key === actorKey)?.start ?? 0 : 0) : -1;
      const owner = actorKey ? actors.find(item => item.key === actorKey) : undefined;
      const locatable = !!current && !unknownActor && !!field && offset >= 0 && source.indexOf(field.source,offset+1) === -1
        && (!owner || offset >= owner.start && offset + field.source.length <= owner.end);
      add({actorKey,actor,field:field ? describeField(field,actorKey ? actors.find(item=>item.key===actorKey) : undefined,bundle,
          actorKey?preparedActors?.find(item=>item.key===actorKey)?.artifact:undefined)
        : ids.length ? '字段归属待核' : '翻译审核',
        kind:field ? '译文审核失败' : '未能定位字段',message:finding,source:field?.source,draft:field ? drafts.get(field.id) : undefined,
        ...(locatable ? {locateStart:offset,locateEnd:offset + field!.source.length}:{}),action:'translate'});
    }
  }
  const automationReview=current?.automationReview;
  for (const finding of !advisoryReview&&automationReview&&'verdict'in automationReview&&automationReview.verdict==='needs_review'
    ?automationReview.findings:[])
    add({actor:'战斗包',field:'自动化规则',kind:'规则审核失败',message:finding,action:'resume'});
  for (const finding of (advisoryReview?[]:(current?.findings??[]))) {
    if (issues.some(issue=>finding.includes(issue.kind) && finding.includes(issue.message))) continue;
    add({actor:'归属待核',field:'审核报告',kind:'待处理',message:finding,action:prepared?'inspect':'resume'});
  }
  if (current && ['failed','needs_review'].includes(current.status) && !issues.length)
    add({actor:'归属待核',field:'审核报告',kind:'未通过',message:'报告尚未通过，且没有可定位的问题；请查看完整审核记录。',action:'inspect'});
  const rules = current?.automation?.selection?.rules ?? [];
  const manual = rules.filter(rule => rule.kind === 'gm-manual').length;
  const automatic = rules.length - manual;
  const accepted = currentProgress.filter(entry => entry.status === 'accepted' && !entry.findings?.length && !!entry.actorKey).length;
  const draftReady=currentProgress.filter(entry=>entry.status==='draft_ready'&&!entry.findings?.length&&!!entry.actorKey).length;
  const packageIssues = issues.filter(issue => !issue.actorKey && issue.actor === '战斗包').length;
  const summary = accepted && packageIssues ? `${accepted} 个角色译文已通过，战斗包 ${packageIssues} 个字段或规则待处理。已通过译文可在继续翻译时复用。`
    :draftReady&&packageIssues?`${draftReady} 个角色中文草稿已通过本地校验（尚未批准），战斗包 ${packageIssues} 个字段或规则待处理。`:undefined;
  return {actorCount:names.size,automatic,manual,blocked:issues.length,issues,summary,
    actors:[...names].map(([key,label]) => ({key,label:approvedActorName(key,label,currentProgress)}))};
}

function describeField(field:LocalizationText, actor:EncounterIntakeReport['actors'][number]|undefined,
  bundle:{label:string;macros:readonly {name:string;notes:string}[]}|undefined, preparedArtifact?:unknown):string {
  if (!actor&&!preparedArtifact) {
    if (bundle && field.id===localizationText('title',bundle.label).id && field.source===bundle.label) return '战斗包名称';
    const macroNames=bundle?.macros.filter(macro=>field.id===localizationText('title',macro.name).id&&field.source===macro.name)??[];
    if (macroNames.length===1) return '控制宏名称';
    if (macroNames.length>1) return '控制宏名称（多处同文，归属待核）';
    const notes=bundle?.macros.filter(macro=>macro.notes.replace(/^原始(?:资料|来源)SHA-256：[^\r\n]*(?:\r?\n|$)/gmu,'').trim()===field.source)??[];
    if (field.kind==='body'&&notes.length===1) return '控制宏说明';
    return field.kind==='title'?'显示标题':'显示正文';
  }
  if (field.kind==='title' && field.source===actor?.analysis?.candidate?.label) return '角色名称';
  const artifact=(preparedArtifact??actor?.generation?.actorProjection) as {name?:string;items?:Array<{name?:string;system?:{description?:{value?:string;chat?:string;unidentified?:string}}}>}|undefined;
  if(field.kind==='title'&&field.source===artifact?.name)return '角色名称';
  const items=artifact?.items??[];
  const named=items.filter(item=>item.name===field.source);
  if (field.kind==='title'&&named.length===1) return `能力名称：${named[0]!.name}`;
  const described=items.filter(item=>Object.values(item.system?.description??{}).includes(field.source));
  if (field.kind==='body'&&described.length===1) return `能力说明：${described[0]!.name??'名称待核'}`;
  return field.kind==='title'?'显示标题（能力归属待核）':'显示正文（能力归属待核）';
}

function approvedActorName(key:string, original:string, progress:readonly EncounterLocalizationProgress[]):string {
  const accepted=progress.find(entry=>entry.actorKey===key && entry.status==='accepted' && !entry.findings?.length
    &&entry.translation&&'review'in entry.translation&&entry.translation.review.verdict==='accepted');
  const id=localizationText('title',original).id;
  if (!accepted?.request.texts.some(field=>field.id===id && field.kind==='title' && field.source===original)) return original;
  const translated=accepted.translation?.texts.find(field=>field.id===id)?.text;
  return translated ? approvedDisplayTitle(original,translated,accepted.translation!.policy) : original;
}

/** Display only; caller must verify the reviewed translation against the current candidate. */
export function approvedDisplayTitle(source:string,translated:string,policy:LocalizationPolicy):string {
  const existingBilingual=/^[\u3400-\u9fff][\s\S]*?[（(]([A-Za-z][^（）()]*)[)）]$/u.exec(source);
  const spacedBilingual=/^[\u3400-\u9fff][^A-Za-z]*\s+([A-Za-z][\s\S]*)$/u.exec(source);
  const alias=/^(.*?)\s*\(([^()]+)\)$/u.exec(source);
  const letters=(value:string)=>value.toLowerCase().replace(/[^a-z]/gu,'');
  const sourceAlias=alias&&letters(alias[1]!)===letters(alias[2]!)?alias[2]:undefined;
  const english=(policy===LOCALIZATION_POLICY?spacedBilingual?.[1]:undefined)
    ??existingBilingual?.[1]??sourceAlias??source.replace(/^[\u3400-\u9fff\s：:]+/u,'').trim();
  if(!/[A-Za-z]/u.test(english))return translated;
  if(policy===LOCALIZATION_POLICY)return `${translated} ${english}`;
  if(policy===LEGACY_LOCALIZATION_POLICY)return `${translated}（${english}）`;
  return source;
}

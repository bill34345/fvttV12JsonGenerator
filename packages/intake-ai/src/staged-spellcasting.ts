import type {AbilityKey,CanonicalSpellcastingGroup,CanonicalSpellUsageGroup,CanonicalSpellRef,EvidenceRef} from './types';
import type {StagedMonsterSource,StagedSourceUnit} from './staged-source';
import {sourceSingleSpellAction,sourceHasSpellList} from '@fvtt-json-generator/models/source-rule-facts';
import {sourceFeatureResources,sourceOperationClauses,sourceActorNameMatches} from '@fvtt-json-generator/models/source-operations';
import {sourceDailySpellAction,sourceDailySpellActionOwnerMatches} from './daily-spell-action';
import {sourceReferencedSpellAction,referencedAtWillSpell,normalizedSourceSpellName} from './source-spell-reference';
import {stagedLegendaryActionCost} from './staged-source';
import {dailySpellGrantLabel,sourceSpellComponentClause} from './spell-grant-label';
import {assessSourceSpellcastingAbility,sourceSpellcastingAbility,withoutSourceSpellcastingAbility} from './spellcasting-ability';
import {sourceSpellGrantRows as grantRows,sourceSpellGrantLabel as grantLabel,sourceSpellGrantTokens,sourceSpellGrantTokenName} from './spell-grant-tokens';

const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/gu,'');
const visible=(s:string)=>s.replace(/[*_]/gu,'');
function ref(source:string,start:number,end:number):EvidenceRef{return{start,end,quote:source.slice(start,end)};}
/** Shared profile metadata ends before the first actual spell grant. Exact
 * original positions keep a spell-local override outside the Actor profile. */
export function sourceSpellcastingIntroduction(source:string,offset=0):EvidenceRef{
  const stack:string[]=[];let end=source.length;
  for(let index=0;index<source.length;index++){
    const character=source[index]!;
    // PDF wrapping may place a grant label after the introductory colon on
    // the same line. Its spells still own every following local override.
    if(!stack.length&&(index===0||/[\s:：;；。.]/u.test(source[index-1]!))&&!/\s/u.test(character)&&grantLabel(source.slice(index))){end=index;break;}
    if(character==='('||character==='（')stack.push(character==='('?')':'）');
    else if(character===')'||character==='）')stack.pop();
  }
  return{start:offset,end:offset+end,quote:source.slice(0,end)};
}
/** Join only an explicitly unfinished grant row. Exact spans still include
 * original PDF line breaks; new labels never join the previous row. Unknown
 * content remains manual rather than becoming guessed spell mechanics. */
function withoutCastingProfile(value:string):string{
  return withoutSourceSpellcastingAbility(value).replace(/(?:使用与施法动作相同的施法属性|(?:spell save|法术豁免)\s*DC\s*\d+|[+]\d+\s+to hit with spell attacks|法术攻击命中加值\s*[+]\d+)/giu,'')
    .replace(/\band\b|并且|且|并/giu,'').replace(/[\s,，;；:：。.（()）*_]/gu,'');
}
/** PDF lines can split a single introductory sentence. Only a closed,
 * independently understood casting preamble is exempt from grant parsing;
 * unknown restrictions before the first grant remain explicit manual rules. */
function knownIntroductionEnd(unit:StagedSourceUnit):number {
  const first=[...unit.quote.matchAll(/[^\r\n]+/gu)].find(row=>grantLabel(row[0]));
  if(!first)return 0;
  let header=visible(unit.quote.slice(0,first.index)).replace(/\s+/gu,' ').trim();
  const title=visible(unit.name??'');
  if(!header.startsWith(title+'.'))return 0;
  header=header.slice(title.length+1).trim();
  const casting=/^(?:The [\p{L}'’ \-]+?|It) casts (?:one of )?the following spells\b/iu.exec(header);
  if(!casting)return 0;
  let tail=header.slice(casting[0].length);
  const component=sourceSpellComponentClause(tail);
  if(component){if(component.ambiguous)return 0;tail=tail.slice(0,component.match.index)+tail.slice(component.match.index+component.match[0].length);}
  return withoutCastingProfile(tail)===''?first.index!:0;
}
/** Only a shared source preamble, never a waiver borrowed from another grant
 * row, manual remainder or neighboring ability. The caller proves the parent. */
export function sourceGroupComponentClause(parent:EvidenceRef,_group:CanonicalSpellcastingGroup){
  const first=[...parent.quote.matchAll(/[^\r\n]+/gu)].find(row=>grantLabel(row[0]));
  const header=first?parent.quote.slice(0,first.index):sourceSingleSpellAction(parent.quote)?parent.quote:'';
  const clause=sourceSpellComponentClause(header);if(!clause)return;
  const before=header.slice(0,clause.match.index).split(/[。.;；]/u).at(-1)?.trim()??'';
  const forward=sourceHasSpellList(before)&&/(?:thefollowingspells|以下(?:一道)?法术|下列法术)$/iu.test(withoutCastingProfile(before));
  const global=/^(?:it|its spellcasting|the creature|the monster|它|该生物)(?:\s+casts?)?\s*$/iu.test(before);
  const after=header.slice(clause.match.index+clause.match[0].length).trim();
  // The only recognized trailing metadata is the independently printed
  // casting profile. Anything else may narrow the waiver or contradict it.
  const single=!first&&!!sourceSingleSpellAction(parent.quote);
  const remaining=single?after.replace(/,?\s*and the duration is \d+ (?:hours?|minutes?|days?)$/iu,''):after;
  const ambiguous=clause.ambiguous||!forward&&!global&&!single||!!withoutCastingProfile(remaining);
  const evidence={start:parent.start+clause.match.index,end:parent.start+clause.match.index+clause.match[0].length,quote:clause.match[0]};
  // A model's manual marker cannot cancel a shared preamble for grants that
  // remain executable. Only a wholly manual group has no refs to inherit it.
  return{...clause,ambiguous,evidence};
}
/** Complete-parent deterministic inheritance of an already supported clause.
 * Explicit malformed or conflicting fields remain for the validator. */
export function bindSourceGroupComponents(source:string,parent:EvidenceRef,group:CanonicalSpellcastingGroup):void{
  if(source.slice(parent.start,parent.end)!==parent.quote||!Array.isArray(group.usageGroups)||!group.usageGroups.length)return;
  const clause=sourceGroupComponentClause(parent,group);if(!clause||clause.ambiguous)return;
  if(Array.isArray(group.componentWaivers)&&!group.componentWaivers.some(waiver=>waiver?.component==='material'))group.componentWaivers.push({component:'material',evidence:[{...clause.evidence}]});
  if(!clause.all)return;
  const exact=(e:EvidenceRef)=>e&&Number.isSafeInteger(e.start)&&Number.isSafeInteger(e.end)&&e.start>=parent.start&&e.end<=parent.end&&e.end>e.start&&source.slice(e.start,e.end)===e.quote;
  for(const grant of group.usageGroups){
    if(!Array.isArray(grant?.evidence)||!grant.evidence.length||!grant.evidence.every(exact)||!Array.isArray(grant.spellRefs))continue;
    for(const entry of grant.spellRefs){
      if(!Array.isArray(entry?.restrictions)||!Array.isArray(entry.evidence)||!entry.evidence.length||!entry.evidence.every(e=>exact(e)&&grant.evidence.some(g=>e.start>=g.start&&e.end<=g.end)))continue;
      if(!entry.restrictions.some(restriction=>restriction?.kind==='casting'&&sourceSpellComponentClause(String(restriction.text))?.all))entry.restrictions.push({kind:'casting',text:clause.evidence.quote,evidence:[{...clause.evidence}]});
    }
  }
  // A provider may redundantly mark just this exact shared component atom as
  // manual. Once every retained real grant carries that same obligation it is
  // no longer a GM-only spell grant. Broader/unknown manual text stays intact.
  const entries=group.usageGroups.flatMap(grant=>Array.isArray(grant?.spellRefs)?grant.spellRefs:[]);
  if(entries.length&&entries.every(entry=>Array.isArray(entry?.restrictions)&&entry.restrictions.some(restriction=>restriction?.kind==='casting'
    &&restriction.text===clause.evidence.quote&&Array.isArray(restriction.evidence)&&restriction.evidence.some(e=>exact(e)&&e.start===clause.evidence.start&&e.end===clause.evidence.end&&e.quote===clause.evidence.quote)))
    &&Array.isArray(group.componentWaivers)&&group.componentWaivers.some(waiver=>waiver?.component==='material'&&Array.isArray(waiver.evidence)&&waiver.evidence.some(e=>exact(e)&&e.start===clause.evidence.start&&e.end===clause.evidence.end&&e.quote===clause.evidence.quote))
    &&Array.isArray(group.manualGrants)){
    group.manualGrants=group.manualGrants.filter(manual=>!(exact(manual)&&manual.start===clause.evidence.start&&manual.end===clause.evidence.end&&manual.quote===clause.evidence.quote));
    if(!group.manualGrants.length)delete group.manualGrants;
  }
}
function ability(unit:StagedSourceUnit,source:string){
  return sourceSpellcastingAbility(source.slice(unit.start,unit.end),unit.start);
}
function spell(source:string,start:number,end:number,id:string):CanonicalSpellRef{
  const raw=source.slice(start,end),parsed=sourceSpellGrantTokenName({start,end,quote:raw});
  if(!parsed)throw Error('UNSUPPORTED_SPELL_NAME');
  const annotationAt=parsed.annotation===undefined?-1:raw.search(/[（(]/u),literalName=(annotationAt>=0?raw.slice(0,annotationAt):raw).trim(),name=parsed.name;
  const en=/[A-Za-z][A-Za-z '’\-]*$/u.exec(name)?.[0]?.trim(),zh=en?name.slice(0,name.length-en.length).trim():/\p{Script=Han}/u.test(name)?name:undefined;
  if(!name||!/^[\p{L}\p{N} '’\-]+$/u.test(name)||/^(?:如果|若|仅当|除非)|\b(?:if|unless|only when)\b/iu.test(name))throw Error('UNSUPPORTED_SPELL_NAME');
  const actualStart=start+raw.indexOf(literalName),restrictions:CanonicalSpellRef['restrictions']=[];
  if(annotationAt>=0){const pos=start+annotationAt;restrictions.push({kind:'casting',text:raw.slice(annotationAt),evidence:[ref(source,pos,end)]});}
  return{refId:id,identifier:key(en??name),originalName:name,...(en?{englishName:en}:{}),...(zh?{chineseName:zh}:{}),aliases:[],restrictions,evidence:[ref(source,actualStart,actualStart+literalName.length)]};
}
export function isSourceSpellcastingFeature(text:string):boolean{
  return Boolean(sourceReferencedSpellAction(text)||sourceDailySpellAction(text)||sourceSingleSpellAction(text))||sourceHasSpellList(text)||/\d+(?:st|nd|rd|th)[- ]level spellcaster/iu.test(visible(text));
}
/** Reuse the established canonical spell/manifest contract. Complex grants keep
 * their exact source as explicit GM work, alongside any supported real spells. */
export interface StagedSpellcastingAbility {ability:AbilityKey;evidence:EvidenceRef}
export function stagedSpellcastingGroups(plan:StagedMonsterSource,proposals:ReadonlyMap<string,StagedSpellcastingAbility>=new Map()):Map<string,CanonicalSpellcastingGroup>{
  const profileFor=(unit:StagedSourceUnit)=>{
    const proposed=proposals.get(unit.id);
    if(!proposed)return ability(unit,plan.source);
    if(!isSourceSpellcastingFeature(unit.quote)||assessSourceSpellcastingAbility(plan.source,proposed.ability,[proposed.evidence],[ref(plan.source,unit.start,unit.end)]).status!=='supported')throw Error('UNPROVEN_STAGED_SPELLCASTING_ABILITY');
    return proposed;
  };
  if([...proposals.keys()].some(id=>!plan.features.some(unit=>unit.id===id)))throw Error('UNBOUND_STAGED_SPELLCASTING_ABILITY');
  const result=new Map<string,CanonicalSpellcastingGroup>(),explicit=plan.features.flatMap(unit=>{const a=profileFor(unit);return a?[a]:[];});
  for(const unit of plan.features){
    if(sourceReferencedSpellAction(unit.quote))continue; // Resolve only after source parents are built.
    const daily=sourceDailySpellAction(unit.quote);
    const single=sourceSingleSpellAction(unit.quote);
    if(!isSourceSpellcastingFeature(unit.quote))continue;
    const parents=daily?plan.features.filter(feature=>feature.name===daily.parent):[];
    if(daily&&(parents.length!==1||!sourceDailySpellActionOwnerMatches(daily,parents[0]!.quote,[plan.base.quote.split(/\r?\n/u)[0]!.trim()],plan.source)))throw Error('UNPROVEN_DAILY_SPELL_ACTION_OWNER');
    const own=profileFor(unit),inherited=!own&&daily?profileFor(parents[0]!):!own&&/使用与施法动作相同的施法属性|same spellcasting ability/iu.test(visible(unit.quote))&&explicit.length===1?explicit[0]:undefined;
    const profile=own??inherited;
    // A missing required fact is unresolved source data, not a complex grant.
    // Never invent an ability or revive the old fake Utility spell counters.
    if(!['trait','action','bonus','reaction','legendary'].includes(unit.section??''))continue;
    if(!profile){if(unit.section==='legendary')continue;throw Error('UNPROVEN_STAGED_SPELLCASTING_ABILITY');}
    const resources=sourceFeatureResources(unit.name!,unit.quote);
    const cost=unit.section==='legendary'?resources.legendaryCost??stagedLegendaryActionCost(plan,unit,[])??1:undefined;
    const group:CanonicalSpellcastingGroup={groupId:'staged-spells-'+unit.id,featureName:unit.name!,description:unit.quote,evidence:[ref(plan.source,unit.start,unit.end)],ability:profile.ability,abilityEvidence:[profile.evidence],componentWaivers:[],usageGroups:[],...(unit.section!=='trait'?{activationType:unit.section as 'action'|'bonus'|'reaction'|'legendary'}:{}),...(resources.recharge?{recharge:resources.recharge}:{}),...(cost!==undefined?{legendaryCost:cost}:{})};
    const profileUnit=daily&&!own?parents[0]!:unit;
    const profileText=sourceSpellcastingIntroduction(profileUnit.quote,profileUnit.start).quote;
    const dc=/(?:法术豁免|spell\s+save)\s*DC\s*(\d+)/iu.exec(profileText);
    if(dc){group.saveDc=Number(dc[1]);group.saveDcEvidence=[ref(plan.source,profileUnit.start+dc.index,profileUnit.start+dc.index+dc[0].length)];}
    const attack=/([+\-]\s*\d+)\s+to\s+hit\s+with\s+spell\s+attacks/iu.exec(profileText);
    if(attack){group.attackBonus=Number(attack[1]!.replace(/\s/gu,''));group.attackBonusEvidence=[ref(plan.source,profileUnit.start+attack.index,profileUnit.start+attack.index+attack[0].length)];}
    if(group.recharge&&group.recharge[1]!==6){delete group.recharge;group.manualGrants=[ref(plan.source,unit.start,unit.end)];result.set(unit.id,group);continue;}
    const componentClause=sourceGroupComponentClause(group.evidence[0]!,group);
    if(componentClause?.ambiguous){group.manualGrants=[ref(plan.source,unit.start,unit.end)];result.set(unit.id,group);continue;}
    if(daily){
      if(resources.uses?.max!==daily.count||resources.uses.period!=='day')throw Error('UNPROVEN_DAILY_SPELL_ACTION_POOL');
      const refs=daily.spells.map((name,index)=>{
        const entry=spell(plan.source,unit.start+name.start,unit.start+name.end,group.groupId+'-choice-'+index);
        if(daily.trigger)entry.restrictions.push({kind:'other',text:daily.trigger.text,evidence:[ref(plan.source,unit.start+daily.trigger.start,unit.start+daily.trigger.end)]});
        return entry;
      });
      group.usageGroups=[{usage:refs.length>1?'daily-shared':'daily-each',count:daily.count,evidence:[ref(plan.source,unit.start,unit.end)],spellRefs:refs}];
    }else if(single){
      const entry=spell(plan.source,unit.start+single.start,unit.start+single.end,group.groupId+'-single');
      // The source's casting clause owns a duration override. Independent
      // spell exceptions/cooldowns stay visible GM rules, never extra effects.
      const clauses=sourceOperationClauses(unit.quote),castClause=clauses.find(quote=>quote.includes(single.name)&&/\bcasts?\b|施展/iu.test(quote));
      const duration=castClause&&/\bthe duration is (\d+) (hours?|minutes?|days?)\b/iu.exec(castClause);
      if(duration){const start=unit.start+unit.quote.indexOf(castClause!)+duration.index;entry.restrictions.push({kind:'casting',text:duration[0],evidence:[ref(plan.source,start,start+duration[0].length)]});}
      const rest=castClause?unit.quote.slice(unit.quote.indexOf(castClause)+castClause.length).trim():'';
      if(rest){const start=unit.start+unit.quote.indexOf(rest);entry.restrictions.push({kind:'other',text:rest,evidence:[ref(plan.source,start,start+rest.length)]});}
      group.usageGroups=[{usage:'at-will',evidence:[ref(plan.source,unit.start,unit.end)],spellRefs:[entry]}];
    }else{
      const caster=/(\d+)(?:st|nd|rd|th)[- ]level spellcaster|(?:施法者等级|施法等级)\s*[:：]?\s*(\d+)/iu.exec(unit.quote);
      if(caster){group.casterLevel=Number(caster[1]??caster[2]);group.casterLevelEvidence=[ref(plan.source,unit.start+caster.index,unit.start+caster.index+caster[0].length)];}
      let grantsStarted=false;
      const introductionEnd=knownIntroductionEnd(unit);
      const manual=(start:number,end:number)=>{(group.manualGrants??=[]).push(ref(plan.source,start,end));};
      for(const row of grantRows(unit.quote)){
        const raw=row.text,daily=dailySpellGrantLabel(raw);
        // Source-derived layout whitespace is already retained in description;
        // it is not a manual spell rule and cannot form a mixed-rule remainder.
        if(!raw.trim())continue;
        if(row.index!<introductionEnd)continue;
        const label=grantLabel(raw);
        const grantStart=unit.start+row.index!,grantEnd=grantStart+raw.length;
        if(!label){
          if(grantsStarted||row.index!>0||/^\s*[*\-•]*\s*(?:shared\b|共享|共用|\d+\s*\/\s*day|每|每日|随意|at[ -]*will|cantrips?|戏法|\d+(?:st|nd|rd|th)?\s*level|\d+\s*环)/iu.test(raw)){
            manual(grantStart,grantEnd);grantsStarted=true;
          }
          continue;
        }
        grantsStarted=true;
        const usage:CanonicalSpellUsageGroup['usage']=daily?(daily.shared?'daily-shared':daily.count===1?'1/day-each':'daily-each'):/cantrip|戏法/iu.test(label[0])?'prepared-cantrip':/slots?|法位/iu.test(label[0])?'prepared-slots':'at-will';
        const refs:CanonicalSpellRef[]=[],tokens=sourceSpellGrantTokens(raw.slice(label[0].length),grantStart+label[0].length);
        if(!tokens){manual(grantStart,grantEnd);continue;}
        try {
          for(const token of tokens){
            refs.push(spell(plan.source,token.start,token.end,group.groupId+'-grant-'+group.usageGroups.length+'-spell-'+(refs.length+1)));
          }
        } catch(error) {
          if(!(error instanceof Error)||error.message!=='UNSUPPORTED_SPELL_NAME')throw error;
          manual(grantStart,grantEnd);continue;
        }
        const unsupported=(entry:CanonicalSpellRef)=>entry.restrictions.some(r=>!/^\(?\s*(?:(?:持续|lasts?(?: for)?|duration\s*:)\s*\d+\s*(?:小时|hours?|分钟|minutes?|天|days?)|level\s+[1-9]\s+version|included in AC)\s*\)?$/iu.test(r.text.normalize('NFKC').replace(/\s+/gu,' ')));
        if(usage==='at-will'&&refs.some(unsupported)&&refs.some(entry=>!unsupported(entry))){
          for(let index=refs.length-1;index>=0;index--)if(unsupported(refs[index]!)){const token=tokens[index]!;manual(token.start,token.end);refs.splice(index,1);}
        }
        const unsupportedRestriction=refs.some(unsupported);
        if(!refs.length||unsupportedRestriction||(daily&&!daily.each&&!daily.shared&&refs.length!==1)||(daily?.shared&&refs.length<2)){
          manual(grantStart,grantEnd);continue;
        }
        const common={evidence:[ref(plan.source,grantStart,grantEnd)],spellRefs:refs};
        const grant:CanonicalSpellUsageGroup=usage==='prepared-slots'?{usage,level:Number(label[0].match(/\d/u)![0]),slots:Number(label[0].match(/[（(]\s*(\d+)/u)![1]),levelEvidence:[ref(plan.source,grantStart,grantStart+label[0].length)],slotsEvidence:[ref(plan.source,grantStart,grantStart+label[0].length)],...common}:usage==='daily-each'||usage==='daily-shared'?{usage,count:daily!.count,...common}:{usage,...common};
        group.usageGroups.push(grant);
      }
      if(!group.usageGroups.length&&!group.manualGrants?.length)group.manualGrants=[ref(plan.source,unit.start,unit.end)];
    }
    bindSourceGroupComponents(plan.source,group.evidence[0]!,group);
    // Existing one-pool-per-feature Resolver contract: preserve independent
    // source pools as separate keyed features, with no duplicate grant.
    const shared=group.usageGroups.filter(usage=>usage.usage==='daily-shared');
    if(shared.length<2)result.set(unit.id,group);
    else {
      const first={...group,usageGroups:group.usageGroups.filter(usage=>usage.usage!=='daily-shared'||usage===shared[0])};
      const additional=shared.slice(1).map((usage,index)=>{
        const label=usage.evidence[0]!.quote.split(/[:：]/u)[0]!.replace(/[*_]/gu,'').trim();
        return {...group,groupId:group.groupId+'-pool-'+(index+2),featureName:group.featureName+' ('+label+')',featureEnglishName:undefined,manualGrants:undefined,usageGroups:[usage]};
      });
      result.set(unit.id,first);
      additional.forEach((extra,index)=>result.set(unit.id+'::pool-'+(index+2),extra));
    }
  }
  // source-derived: an explicit named ability reference inherits only that
  // complete source parent's proved profile/components and at-will grant.
  for(const unit of plan.features){
    const reference=sourceReferencedSpellAction(unit.quote);if(!reference)continue;
    if(!sourceActorNameMatches(reference.caster,[plan.base.quote.split(/\r?\n/u)[0]!.trim()]))continue;
    const parents=plan.features.filter(parent=>normalizedSourceSpellName(parent.name??'')===reference.parent);
    if(parents.length!==1)throw Error('UNPROVEN_REFERENCED_SPELL_PARENT');
    const parentUnit=parents[0]!,parent=result.get(parentUnit.id);
    if(!parent||sourceReferencedSpellAction(parentUnit.quote))throw Error('UNPROVEN_REFERENCED_SPELL_PROFILE');
    const inherited=referencedAtWillSpell(parent,reference);if(!inherited)continue;
    if(!['action','bonus','reaction','legendary'].includes(unit.section??''))continue;
    const cost=unit.section==='legendary'?sourceFeatureResources(unit.name!,unit.quote).legendaryCost??stagedLegendaryActionCost(plan,unit,[])??1:undefined;
    const evidence=ref(plan.source,unit.start,unit.end),groupId='staged-spells-'+unit.id;
    const entry=spell(plan.source,unit.start+reference.start,unit.start+reference.annotationEnd,groupId+'-reference');
    // An omitted child level reuses only a level already stated by its parent;
    // an unannotated parent adds no level and is left to normal spell data.
    if(reference.level===undefined)for(const restriction of inherited.restrictions){
      if(restriction.kind==='casting'&&/^\(?\s*level\s+[1-9]\s+version\s*\)?$/iu.test(restriction.text))entry.restrictions.push(structuredClone(restriction));
    }
    entry.reuseOf={groupId:parent.groupId,refId:inherited.refId};
    const group:CanonicalSpellcastingGroup={groupId,featureName:unit.name!,description:unit.quote,evidence:[evidence],
      ability:parent.ability,abilityEvidence:structuredClone(parent.abilityEvidence),componentWaivers:structuredClone(parent.componentWaivers),
      ...(parent.saveDc===undefined?{}:{saveDc:parent.saveDc,saveDcEvidence:structuredClone(parent.saveDcEvidence)}),
      ...(parent.attackBonus===undefined?{}:{attackBonus:parent.attackBonus,attackBonusEvidence:structuredClone(parent.attackBonusEvidence)}),
      activationType:unit.section as 'action'|'bonus'|'reaction'|'legendary',...(cost===undefined?{}:{legendaryCost:cost}),
      usageGroups:[{usage:'at-will',evidence:[evidence],spellRefs:[entry]}]};
    bindSourceGroupComponents(plan.source,ref(plan.source,parentUnit.start,parentUnit.end),group);
    result.set(unit.id,group);
  }
  return result;
}

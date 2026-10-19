import type {AbilityKey,CanonicalSpellcastingGroup,CanonicalSpellUsageGroup,CanonicalSpellRef,EvidenceRef} from './types';
import type {StagedMonsterSource,StagedSourceUnit} from './staged-source';
import {sourceSingleSpellAction,sourceHasSpellList} from '@fvtt-json-generator/models/source-rule-facts';
import {dailySpellGrantLabel,sourceSpellComponentClause} from './spell-grant-label';
import {assessSourceSpellcastingAbility,sourceSpellcastingAbility,withoutSourceSpellcastingAbility} from './spellcasting-ability';

const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/gu,'');
const visible=(s:string)=>s.replace(/[*_]/gu,'');
function ref(source:string,start:number,end:number):EvidenceRef{return{start,end,quote:source.slice(start,end)};}
function grantLabel(raw:string){return dailySpellGrantLabel(raw)?.match??/^\s*(?:\*{1,3})?\s*(随意|at[ -]*will|cantrips?\s*\(at will\)|戏法\s*[（(]随意[）)]|[1-9](?:st|nd|rd|th)?\s*level\s*\(\d+\s*slots?\)|[1-9]\s*环\s*[（(]\d+\s*法位[）)])\s*[:：]\s*(?:\*{1,3})?\s*/iu.exec(raw);}
function withoutCastingProfile(value:string):string{
  return withoutSourceSpellcastingAbility(value).replace(/(?:使用与施法动作相同的施法属性|(?:spell save|法术豁免)\s*DC\s*\d+|[+]\d+\s+to hit with spell attacks|法术攻击命中加值\s*[+]\d+)/giu,'')
    .replace(/\band\b|并且|且|并/giu,'').replace(/[\s,，;；:：。.（()）*_]/gu,'');
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
  const ambiguous=clause.ambiguous||!forward&&!global&&!single||!!withoutCastingProfile(after);
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
}
function ability(unit:StagedSourceUnit,source:string){
  return sourceSpellcastingAbility(source.slice(unit.start,unit.end),unit.start);
}
function spell(source:string,start:number,end:number,id:string):CanonicalSpellRef{
  const raw=source.slice(start,end),annotation=raw.match(/[（(]([^）)]+)[）)]\s*$/u),name=(annotation?raw.slice(0,annotation.index):raw).trim();
  const en=/[A-Za-z][A-Za-z '’\-]*$/u.exec(name)?.[0]?.trim(),zh=en?name.slice(0,name.length-en.length).trim():/\p{Script=Han}/u.test(name)?name:undefined;
  if(!name||!/^[\p{L}\p{N} '’\-]+$/u.test(name)||/^(?:如果|若|仅当|除非)|\b(?:if|unless|only when)\b/iu.test(name))throw Error('UNSUPPORTED_SPELL_NAME');
  const actualStart=start+raw.indexOf(name),restrictions:CanonicalSpellRef['restrictions']=[];
  if(annotation){const pos=start+annotation.index!;restrictions.push({kind:'casting',text:annotation[0],evidence:[ref(source,pos,end)]});}
  return{refId:id,identifier:key(en??name),originalName:name,...(en?{englishName:en}:{}),...(zh?{chineseName:zh}:{}),aliases:[],restrictions,evidence:[ref(source,actualStart,actualStart+name.length)]};
}
export function isSourceSpellcastingFeature(text:string):boolean{
  return Boolean(sourceSingleSpellAction(text))||sourceHasSpellList(text)||/\d+(?:st|nd|rd|th)[- ]level spellcaster/iu.test(visible(text));
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
    const single=sourceSingleSpellAction(unit.quote);
    if(!isSourceSpellcastingFeature(unit.quote))continue;
    const own=profileFor(unit),inherited=!own&&/使用与施法动作相同的施法属性|same spellcasting ability/iu.test(visible(unit.quote))&&explicit.length===1?explicit[0]:undefined;
    const profile=own??inherited;
    // A missing required fact is unresolved source data, not a complex grant.
    // Never invent an ability or revive the old fake Utility spell counters.
    if(!['trait','action','bonus','reaction'].includes(unit.section??''))continue;
    if(!profile)throw Error('UNPROVEN_STAGED_SPELLCASTING_ABILITY');
    const group:CanonicalSpellcastingGroup={groupId:'staged-spells-'+unit.id,featureName:unit.name!,description:unit.quote,evidence:[ref(plan.source,unit.start,unit.end)],ability:profile.ability,abilityEvidence:[profile.evidence],componentWaivers:[],usageGroups:[],...(unit.section!=='trait'?{activationType:unit.section as 'action'|'bonus'|'reaction'}:{})};
    const dc=/(?:法术豁免|spell save)\s*DC\s*(\d+)/iu.exec(unit.quote);
    if(dc){group.saveDc=Number(dc[1]);group.saveDcEvidence=[ref(plan.source,unit.start+dc.index,unit.start+dc.index+dc[0].length)];}
    const componentClause=sourceGroupComponentClause(group.evidence[0]!,group);
    if(componentClause?.ambiguous){group.manualGrants=[ref(plan.source,unit.start,unit.end)];result.set(unit.id,group);continue;}
    if(single){
      const entry=spell(plan.source,unit.start+single.start,unit.start+single.end,group.groupId+'-single');
      group.usageGroups=[{usage:'at-will',evidence:[ref(plan.source,unit.start,unit.end)],spellRefs:[entry]}];
    }else{
      const caster=/(\d+)(?:st|nd|rd|th)[- ]level spellcaster|(?:施法者等级|施法等级)\s*[:：]?\s*(\d+)/iu.exec(unit.quote);
      if(caster){group.casterLevel=Number(caster[1]??caster[2]);group.casterLevelEvidence=[ref(plan.source,unit.start+caster.index,unit.start+caster.index+caster[0].length)];}
      let grantsStarted=false;
      const manual=(start:number,end:number)=>{(group.manualGrants??=[]).push(ref(plan.source,start,end));};
      for(const row of unit.quote.matchAll(/[^\r\n]+/gu)){
        const raw=row[0],daily=dailySpellGrantLabel(raw);
        // Source-derived layout whitespace is already retained in description;
        // it is not a manual spell rule and cannot form a mixed-rule remainder.
        if(!raw.trim())continue;
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
        const refs:CanonicalSpellRef[]=[];
        try {
          for(const token of raw.slice(label[0].length).matchAll(/[^,，、]+/gu)){
            const rawStart=grantStart+label[0].length+token.index!,trim=token[0].trim(),start=rawStart+token[0].indexOf(trim),end=start+trim.replace(/[;；。.]$/u,'').length;
            refs.push(spell(plan.source,start,end,group.groupId+'-grant-'+group.usageGroups.length+'-spell-'+(refs.length+1)));
          }
        } catch(error) {
          if(!(error instanceof Error)||error.message!=='UNSUPPORTED_SPELL_NAME')throw error;
          manual(grantStart,grantEnd);continue;
        }
        const unsupportedRestriction=refs.some(entry=>entry.restrictions.some(r=>!/^\(?\s*(?:持续|lasts?(?: for)?|duration\s*:)\s*\d+\s*(?:小时|hours?|分钟|minutes?|天|days?)\s*\)?$/iu.test(r.text.normalize('NFKC'))));
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
  return result;
}

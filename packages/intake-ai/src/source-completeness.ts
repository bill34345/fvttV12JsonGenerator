import type { CanonicalFeature, CanonicalSpellcastingGroup, EvidenceRef, IntakeFinding, MonsterIntakeIR } from './types';
import { sourceStatHeader, sourceSectionHeading, sourceFeatureLabel, splitStagedMonsterSource, stagedLegendaryBudgetFromContexts, stagedLegendaryActionCost, stagedLegendaryLedger, type StagedSourceUnit } from './staged-source';
import { stagedManualHeaderFeatures } from './staged-source-facts';
import {sourceCastingGrantPolarity} from '@fvtt-json-generator/models/source-rule-facts';
import {splitBilingualName,displayName} from '@fvtt-json-generator/models/display-name';
import {dailySpellGrantLabel} from './spell-grant-label';
import {sourceAttackTargetClause} from '@fvtt-json-generator/models/source-operations';
import {stagedFeatureMechanics} from './staged-feature-mechanics';

const sections=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'] as const;
const normalize=(value:string)=>value.replace(/<[^>]*>/gu,'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

/** Independently bound only an explicit Legendary Actions preamble. Stop at
 * its first physical ability title or another section; never borrow prose or
 * model-selected coverage when the rest of the source needs line partitioning. */
function sourceLegendaryContexts(source:string,range:{start:number;end:number}):StagedSourceUnit[]{
  const lines=[...source.slice(range.start,range.end).matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)].filter(line=>line[0].length);
  const result:StagedSourceUnit[]=[];
  for(const [index,line]of lines.entries()){
    if(sourceSectionHeading(line[0])!=='legendary')continue;
    const next=lines.slice(index+1).find(row=>sourceSectionHeading(row[0])!==undefined||sourceFeatureLabel(row[0])!==undefined);
    // Without a following physical feature, this is not a proved ledger unit.
    if(!next||sourceSectionHeading(next[0])!==undefined)continue;
    const start=range.start+line.index!,end=range.start+next.index!;
    result.push({id:'legendary-context-'+start,destination:'context',section:'legendary',start,end,quote:source.slice(start,end)});
  }
  return result;
}

/** Presentation equivalence only; exact raw offsets are checked separately. */
export const sourceRuleText=(value:string)=>value.replace(/<[^>]*>/gu,' ').replace(/\*{2,3}/gu,'').replace(/^\s*#{1,6}\s+/gmu,'')
  .replace(/(\b\d+)-[ \t]*\r?\n[ \t]*(foot|feet)\b/giu,'$1-$2').replace(/\s+/gu,' ').trim();

/** A coarse whole-creature coverage row cannot supply a feature boundary.
 * For already supported healing, derive that boundary from the
 * program source graph and require exact body, anchors and source coverage. */
function sourceHealingParentEvidence(source:string,ir:MonsterIntakeIR,feature:CanonicalFeature,path:string,
  range={start:0,end:source.length}):EvidenceRef|undefined{
  if(typeof feature.description!=='string'||!Array.isArray(feature.evidence)||!feature.evidence.length
    ||!Array.isArray(ir.coverage)||!Array.isArray(ir.claims))return;
  try{
    const plan=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'healing-parent',label:ir.creature.identity.name,
      ...range,quote:source.slice(range.start,range.end)}});
    const section=({traits:'trait',actions:'action',bonusActions:'bonus',reactions:'reaction',legendaryActions:'legendary',mythicActions:'mythic'}as Record<string,string>)[path.split('/')[2]!];
    const anchors=[...feature.evidence,...ir.claims.filter(c=>c.path===path).flatMap(c=>c.evidence??[])];
    const units=plan.features.filter(unit=>{
      if(unit.name!==feature.name||unit.section!==section)return false;
      if((unit.contextIds??[]).some(id=>plan.units.find(context=>context.id===id)?.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u,'').trim()))return false;
      const quote=unit.quote.trim(),newline=quote.indexOf('\n'),body=newline<0?undefined:quote.slice(newline+1).trim();
      if(feature.description.trim()!==quote&&feature.description.trim()!==body)return false;
      if(!anchors.every(ref=>ref.start>=unit.start&&ref.end<=unit.end&&ref.end>ref.start&&source.slice(ref.start,ref.end)===ref.quote))return false;
      if(!ir.coverage.some(row=>row.classification==='mechanical'&&row.claimPaths?.includes(path)&&row.start<=unit.start&&row.end>=unit.end
        &&row.start>=range.start&&row.end<=range.end&&source.slice(row.start,row.end)===row.quote))return false;
      const primary=stagedFeatureMechanics(unit.quote,feature.name,ir.creature.identity.name)?.facts;
      return!!primary?.healing&&primary.activationType!==undefined
        ||!!primary?.sourceOperations?.length&&primary.sourceOperations.every(op=>op.type==='heal');
    });
    if(units.length===1)return{start:units[0]!.start,end:units[0]!.end,quote:units[0]!.quote};
  }catch{/* Unrecognized source boundaries remain unproven. */}
}

function sourceHeaderFeatures(source:string,ir:MonsterIntakeIR,range:{start:number;end:number}):CanonicalFeature[]{
  try{
    // Header ownership is independent of later ability boundaries. A source
    // that needs an explicit line partition must retain the same exact header
    // rules; use the shared bounded header scanner, never a whole-source quote.
    const base=sourceStatHeader({source,sourceSha256:ir.source.sha256,candidate:{id:'header-proof',label:ir.creature.identity.name,
      start:range.start,end:range.end,quote:source.slice(range.start,range.end)}});
    return stagedManualHeaderFeatures(base.quote).map(feature=>({...feature,evidence:feature.evidence!.map(ref=>({
      ...ref,start:ref.start+base.start,end:ref.end+base.start,
    }))}));
  }catch{return [];}
}

/** The evidence graph may carry a short parent claim and a complete coverage
 * unit. Neither carrier alone permits extending into an adjacent feature. */
export function completeSourceFeatureEvidence(source:string,ir:MonsterIntakeIR,feature:Pick<CanonicalFeature,'name'|'englishName'|'description'|'evidence'>,path:string,
  range={start:0,end:source.length}):EvidenceRef|undefined{
  if(!feature||typeof feature!=='object'||typeof feature.name!=='string'||typeof feature.description!=='string'
    ||feature.evidence!==undefined&&!Array.isArray(feature.evidence)
    ||!Array.isArray(ir.claims)||!Array.isArray(ir.coverage))return;
  const exact=(ref:EvidenceRef)=>ref&&Number.isInteger(ref.start)&&Number.isInteger(ref.end)
    &&ref.start>=range.start&&ref.end<=range.end&&ref.end>ref.start&&source.slice(ref.start,ref.end)===ref.quote;
  const anchors=[...(feature.evidence??[]),...ir.claims.filter(claim=>claim&&claim.path===path).flatMap(claim=>Array.isArray(claim.evidence)?claim.evidence:[])];
  if(!anchors.length||!anchors.every(exact))return;
  const stripMetadata=(value:string)=>sourceRuleText(value).replace(/\s*[（(][^）)]*[）)]\s*$/u,'');
  const split=splitBilingualName(sourceRuleText(feature.name)),name=stripMetadata(split.name),english=typeof feature.englishName==='string'?stripMetadata(feature.englishName):split.englishName;
  const titles=[sourceRuleText(feature.name),name,english,english?displayName(name,english):undefined,english?name+english:undefined]
    .filter((v):v is string=>typeof v==='string'&&!!v);
  const body=sourceRuleText(feature.description);
  const covered=ir.coverage.filter(entry=>exact(entry)&&entry.classification==='mechanical'&&entry.claimPaths?.includes(path))
    .sort((a,b)=>a.start-b.start||a.end-b.end);
  // Stat-header rules have a shared base coverage owner and exact nested
  // references. Derive their closed boundaries independently from the source
  // graph; a whole-header quote or a header-like feature name alone is insufficient.
  if(/^\/creature\/traits\/\d+$/u.test(path)&&/^(?:Size|(?:Damage |Condition )?(?:Resistances|Vulnerabilities|Immunities)|伤害抗性|抗性|伤害易伤|易伤|状态免疫|伤害免疫|免疫)$/iu.test(feature.name)){
    const header=sourceHeaderFeatures(source,ir,range).find(expected=>expected.name===feature.name&&expected.description===feature.description);
    const ref=header?.evidence?.[0];
    if(ref&&anchors.every(anchor=>anchor.start===ref.start&&anchor.end===ref.end&&anchor.quote===ref.quote)
      &&covered.some(entry=>entry.start<=ref.start&&entry.end>=ref.end))return {...ref};
  }
  const candidates:EvidenceRef[]=[...covered];
  // Same-carrier paragraph coverage is equivalent to one complete span. Merge
  // only connected pieces; substantive gaps and another carrier remain errors.
  let group:EvidenceRef|undefined;
  for(const entry of covered){
    const foreign=entry.claimPaths.some(value=>/^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions|mythicActions)\/\d+(?:\/|$)/u.test(value)
      &&value!==path&&!value.startsWith(path+'/'));
    if(foreign){group=undefined;continue;}
    if(group&&entry.start<=group.end || group&&!source.slice(group.end,entry.start).trim()){
      group={start:group!.start,end:Math.max(group!.end,entry.end),quote:source.slice(group!.start,Math.max(group!.end,entry.end))};
    }else group={start:entry.start,end:entry.end,quote:entry.quote};
    candidates.push(group);
  }
  let standaloneParents:ReturnType<typeof splitStagedMonsterSource>['features']|undefined;
  const standaloneParent=(ref:EvidenceRef,title:string)=>{
    if(standaloneParents===undefined){
      try{standaloneParents=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'title-proof',label:ir.creature.identity.name,start:range.start,end:range.end,quote:source.slice(range.start,range.end)}}).features;}
      catch{standaloneParents=[];}
    }
    const content=(value:EvidenceRef)=>[value.start+value.quote.length-value.quote.trimStart().length,value.end-(value.quote.length-value.quote.trimEnd().length)].join(':');
    const section=({traits:'trait',actions:'action',bonusActions:'bonus',reactions:'reaction',legendaryActions:'legendary',mythicActions:'mythic'}as Record<string,string>)[path.split('/')[2]!];
    // Coverage may own the plain section label together with its first rule.
    // Match the same physical rule after removing only that literal label;
    // substantive shared text and another ability cannot be swallowed.
    const prefix=/^\s*(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?)\s*\r?\n\s*/iu.exec(ref.quote)?.[0]??'';
    const rule={...ref,start:ref.start+prefix.length,quote:ref.quote.slice(prefix.length)};
    return standaloneParents.some(unit=>unit.name===title&&unit.section===section&&content(unit)===content(rule));
  };
  const matches=candidates.filter(ref=>{
    if(!anchors.every(anchor=>anchor.start>=ref.start&&anchor.end<=ref.end))return false;
    const quote=sourceRuleText(ref.quote.replace(/^\s*(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?)\s*\r?\n\s*/iu,'').replace(/\*{2,3}/gu,''))
      .replace(/^\d+\.\s*/u,'');
    return titles.some(title=>{
      if(!quote.startsWith(title))return false;
      const tail=quote.slice(title.length);
      if(!/^(?:[。.]|\s*[（(])/u.test(tail)&&!standaloneParent(ref,title))return false;
      const withoutLabel=tail.replace(/^[。.]\s*/u,'').trim();
      const withoutMetadata=withoutLabel.replace(/^[（(][^）)]*[）)][。.]\s*/u,'');
      return body===quote||body===withoutLabel||body===withoutMetadata;
    });
  });
  const unique=[...new Map(matches.map(ref=>[ref.start+':'+ref.end,ref])).values()];
  if(!unique.length)return /\bhit points?\b/iu.test(feature.description)
    ?sourceHealingParentEvidence(source,ir,feature as CanonicalFeature,path,range):undefined;
  // Boundary whitespace does not create a second rule identity.
  const content=unique.map(ref=>[ref.start+ref.quote.length-ref.quote.trimStart().length,ref.end-(ref.quote.length-ref.quote.trimEnd().length)].join(':'));
  if(new Set(content).size!==1)return;
  const ref=unique.sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]!;
  // Other independent feature anchors cannot be swallowed by a coverage span.
  const others=ir.claims.filter(claim=>claim&&/^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions|mythicActions)\/\d+$/u.test(claim.path)&&claim.path!==path)
    .flatMap(claim=>Array.isArray(claim.evidence)?claim.evidence:[]).filter(exact);
  if(others.some(other=>other.start>ref.start&&other.start<ref.end))return;
  return {start:ref.start,end:ref.end,quote:ref.quote};
}

/** Cost comes from the nearest program-owned context of this complete
 * parent, never a model-supplied string or an unrelated earlier section. */
export function sourceFeatureLegendaryCost(source:string,ir:MonsterIntakeIR,feature:CanonicalFeature,path:string,range={start:0,end:source.length}):number|undefined{
  if(!path.startsWith('/creature/legendaryActions/'))return;
  const parent=completeSourceFeatureEvidence(source,ir,feature,path,range);if(!parent)return;
  try{
    const plan=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'legendary-cost-proof',label:ir.creature.identity.name,...range,quote:source.slice(range.start,range.end)}});
    const content=(value:EvidenceRef)=>[value.start+value.quote.length-value.quote.trimStart().length,value.end-(value.quote.length-value.quote.trimEnd().length)].join(':');
    const unit=plan.features.find(unit=>unit.section==='legendary'&&content(unit)===content(parent));
    return unit?stagedLegendaryActionCost(plan,unit,[ir.creature.identity.name,ir.creature.identity.englishName].filter((value):value is string=>!!value)):undefined;
  }catch{
    // A valid source may require a supplied physical-line partition elsewhere.
    // Bind the default one-use cost to the independent legendary preamble,
    // not to a guessed whole-source split or a model's coverage selection.
    const aliases=[ir.creature.identity.name,ir.creature.identity.englishName].filter((value):value is string=>!!value);
    const context=sourceLegendaryContexts(source,range).find(unit=>unit.end<=parent.start&&stagedLegendaryLedger(unit,aliases));
    if(context){
      const headings=source.slice(context.start,parent.start).split(/\r\n|\n|\r/u).map(sourceSectionHeading).filter(Boolean);
      if(headings.at(-1)==='legendary')return Number(/\bCosts?\s+(\d+)\s+Actions?/iu.exec(parent.quote.split(/\.(?:\s|$)/u)[0]!)?.[1]??1);
    }
    return;
  }
}

/** Source-owned spell parent. Prefer an independent source partition so a
 * model cannot hide a negative declaration by quoting only its grant row. */
export function completeSourceSpellcastingEvidence(source:string,ir:MonsterIntakeIR,group:CanonicalSpellcastingGroup,path:string,
  range={start:0,end:source.length}):EvidenceRef|undefined{
  if(!Array.isArray(group.evidence)||group.abilityEvidence!==undefined&&!Array.isArray(group.abilityEvidence)
    ||!Array.isArray(group.usageGroups)||group.usageGroups.some(usage=>!usage||typeof usage!=='object'||!Array.isArray(usage.evidence)))return;
  const exact=(ref:EvidenceRef)=>ref&&Number.isInteger(ref.start)&&Number.isInteger(ref.end)&&ref.start>=range.start&&ref.end<=range.end&&ref.end>ref.start&&source.slice(ref.start,ref.end)===ref.quote;
  // Casting ability may explicitly inherit from another spellcasting action.
  // Its independent field validator retains that evidence; it cannot enlarge
  // this group's grant parent or cancel this ability's negative predicate.
  const anchors=[...group.evidence,...group.usageGroups.flatMap(usage=>usage.evidence)];
  if(!anchors.length||!anchors.every(exact))return;
  try{
    const plan=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'spell-parent-proof',label:ir.creature.identity.name,...range,quote:source.slice(range.start,range.end)}}),owners=plan.features.filter(unit=>anchors.every(ref=>ref.start>=unit.start&&ref.end<=unit.end));
    return owners.length===1?{start:owners[0]!.start,end:owners[0]!.end,quote:owners[0]!.quote}:undefined;
  }catch{/* Legacy headers retain their established exact evidence graph. */}
  const feature={name:group.featureName,englishName:group.featureEnglishName,description:group.description,evidence:group.evidence};
  const validClaims=Array.isArray(ir.claims)&&ir.claims.every(claim=>claim&&typeof claim.path==='string'&&Array.isArray(claim.evidence));
  const parent=validClaims?completeSourceFeatureEvidence(source,ir,feature,path,range):undefined;
  const grantRow=(quote:string)=>Boolean(dailySpellGrantLabel(quote.split(/\r?\n/u)[0]??''))||/^(?:at[ -]*will|cantrips?\s*[（(]|随意|戏法|\d+(?:st|nd|rd|th)?\s*level\s*[（(])/iu.test(sourceRuleText(quote));
  if(parent&&!grantRow(parent.quote))return parent;
  // Older prepared/header IR can mechanically cover a whole stat block. Its
  // exact complete group span is acceptable only at a literal printed label
  // and an independently visible following boundary, never an ability/row clip.
  const aliases=(name:string,english?:string)=>[name,english,typeof name==='string'&&typeof english==='string'?name+english:undefined,typeof name==='string'&&typeof english==='string'?name+' '+english:undefined].filter((value):value is string=>typeof value==='string'&&!!value).map(value=>normalize(value.replace(/\s*[（(][^）)]*[）)]\s*$/u,'')));
  const label=(quote:string)=>normalize(sourceRuleText(quote).split(/[。.：:]/u)[0]??'');
  const siblings=[...sections.flatMap(section=>(Array.isArray(ir.creature[section])?ir.creature[section]:[]).filter(value=>value&&typeof value.name==='string').map(value=>aliases(value.name,value.englishName))),...(ir.creature.spellcasting??[]).filter(value=>value&&value!==group&&typeof value.featureName==='string').map(value=>aliases(value.featureName,value.featureEnglishName))].flat();
  for(const ref of group.evidence??[]){
    if(!exact(ref)||ref.quote!==group.description||grantRow(ref.quote)||!aliases(group.featureName,group.featureEnglishName).includes(label(ref.quote))||!anchors.every(anchor=>anchor.start>=ref.start&&anchor.end<=ref.end))continue;
    const lineStart=source.lastIndexOf('\n',ref.start-1)+1;if(source.slice(Math.max(range.start,lineStart),ref.start).replace(/[\s*#_\-]/gu,''))continue;
    const polarity=sourceCastingGrantPolarity(ref.quote),heading=label(ref.quote);
    if(polarity==='absent'&&!/(?:spellcasting|施法)$/iu.test(heading)&&!/\d+(?:st|nd|rd|th)[- ]level spellcaster/iu.test(ref.quote))continue;
    const tail=source.slice(ref.end,range.end).trimStart(),structural=/^(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?|特质(?:\s*Traits)?|特性(?:\s*Traits)?|动作(?:\s*Actions)?|附赠动作(?:\s*Bonus Actions)?|反应(?:\s*Reactions)?|参考定义|引用定义|referenced definitions)\s*(?:\r?\n|$)/iu.test(tail);
    if(!tail||structural||siblings.includes(label(tail)))return{...ref};
  }
  return;
}

/** Additional source-backed preservation checks. This does not infer automation
 * or fill an omitted rule; the normal repair/GM boundary handles findings. */
export function sourceSharedTargetBindings(source:string,ir:MonsterIntakeIR,scope={start:0,end:source.length}){
  const bindings:Array<{feature:CanonicalFeature;path:string;range:number;targetSpecial:string;evidence:EvidenceRef[];sourceConflict:boolean}>=[];
  if(!ir.creature||!Array.isArray(ir.claims)||!Array.isArray(ir.coverage))return bindings;
  for(const section of sections){
    const features=Array.isArray(ir.creature[section])?ir.creature[section]!:[];
    for(const [index,parent] of features.entries()){
      const parentPath=`/creature/${section}/${index}`;
      const parentRef=completeSourceFeatureEvidence(source,ir,parent,parentPath,scope);
      if(!parentRef)continue;
      const text=sourceRuleText(parentRef.quote);
      const matches=[...text.matchAll(/\bchoosing (targets it can see) within (\d+) (?:feet|ft\.?):$/giu)];
      if(matches.length!==1||! /\bof the following\b/iu.test(text))continue;
      const range=Number(matches[0]![2]);
      if(range<=0||range>10000)continue;
      const entries=[{feature:parent,path:parentPath,ref:parentRef}];
      let end=parentRef.end,number=1;
      for(let childIndex=index+1;childIndex<features.length;childIndex++){
        const feature=features[childIndex]!,path=`/creature/${section}/${childIndex}`;
        const ref=completeSourceFeatureEvidence(source,ir,feature,path,scope);
        if(!ref||!new RegExp('^'+number+'\\.\\s','u').test(sourceRuleText(ref.quote))
          ||ref.start<end||source.slice(end,ref.start).trim())break;
        entries.push({feature,path,ref});end=ref.end;number++;
      }
      if(entries.length<2)continue;
      for(const entry of entries){
        const explicitDistances=entry.path===parentPath?[]:[...sourceRuleText(entry.ref.quote)
          .matchAll(/\b(?:within|range|reach)\s+(\d+)\s*(?:feet|ft\.?)\b/giu)].map(match=>Number(match[1]));
        bindings.push({feature:entry.feature,path:entry.path,range,targetSpecial:'targets it can see',
          evidence:entry.path===parentPath?[{...parentRef}]:[{...parentRef},{...entry.ref}],
          sourceConflict:explicitDistances.some(value=>value!==range)});
      }
    }
  }
  return bindings;
}

/** Ordinary Attack targets are printed in that Attack's own header, rather
 * than inherited from a numbered placement preamble. Keep these owners apart. */
export function sourceAttackTargetBinding(source:string,ir:MonsterIntakeIR,feature:CanonicalFeature,path:string,scope={start:0,end:source.length}){
  if(!feature.attack||feature.sourceOperations!==undefined||typeof feature.targetSpecial!=='string')return;
  const parent=completeSourceFeatureEvidence(source,ir,feature,path,scope);
  if(!parent)return;
  const clause=sourceAttackTargetClause(parent.quote,feature.attack,feature.targetSpecial);
  if(!clause)return;
  const offset=parent.quote.indexOf(clause);
  if(offset<0||parent.quote.indexOf(clause,offset+1)>=0)return;
  const attack={start:parent.start+offset,end:parent.start+offset+clause.length,quote:clause};
  const claims=ir.claims.filter(claim=>claim&&claim.path===path+'/targetSpecial');
  const same=(actual:EvidenceRef,expected:EvidenceRef)=>actual&&actual.start===expected.start&&actual.end===expected.end&&actual.quote===expected.quote;
  if(claims.some(claim=>claim.value!==feature.targetSpecial||!Array.isArray(claim.evidence)||!claim.evidence.length
    ||claim.evidence.some(ref=>!same(ref,parent)&&!same(ref,attack))))return;
  return{targetSpecial:feature.targetSpecial,evidence:[parent],attackEvidence:attack};
}

/** Check every source title and metadata landing independently of generation. */
export function sourceCompletenessFindings(source:string, ir:MonsterIntakeIR,
  range={start:0,end:source.length}):IntakeFinding[]{
  if(!ir.creature||typeof ir.creature!=='object')return [];
  const findings:IntakeFinding[]=[];
  const add=(code:string,path:string,message:string,evidence:EvidenceRef)=>findings.push({
    id:`${code.toLowerCase()}:${evidence.start}`,code,path,message,blocking:true,origin:'coverage',evidence:[evidence]});
  const features=sections.flatMap(section=>(Array.isArray(ir.creature[section])?ir.creature[section]:[])
    .map((feature,index)=>({feature,path:`/creature/${section}/${index}`})));
  if(Array.isArray(ir.creature.spellcasting))for(const [index,group] of ir.creature.spellcasting.entries())if(group&&typeof group==='object')features.push({feature:{name:group.featureName,englishName:group.featureEnglishName,description:group.description,evidence:group.evidence},path:`/creature/spellcasting/${index}`});
  const text=source.slice(range.start,range.end);
  let inFeatures=false,inDefinitions=false;
  for(const match of text.matchAll(/^([^\r\n]+)$/gmu)){
    const line=match[1]!.trim();
    if(/^(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?|特性|动作|附赠动作|反应|传奇动作|神话动作)\s*$/iu.test(line)){inFeatures=true;continue;}
    if(/^(?:#{1,6}\s*)?(?:referenced definitions|引用定义|补充定义)/iu.test(line)){inFeatures=false;inDefinitions=true;continue;}
    if(inDefinitions)continue;
    const formatted=line.match(/^(?:[-*]\s*)?\*{2,3}(.+?)\*{2,3}\s*[:：.]?/u)?.[1];
    const baseField=/^(?:armor class|ac|hit points|hp|speed|skills|senses|languages|challenge|proficiency bonus|str|dex|con|int|wis|cha|failure|success|trigger|response|hit|护甲等级|生命值|速度|技能|感官|语言|挑战等级|熟练加值|力量|敏捷|体质|智力|感知|魅力|失败|成功|触发|响应|命中)[:：.]?$/iu;
    const bold=formatted&&!baseField.test(formatted.trim())&&(inFeatures||/^[-*]\s+\*{2,3}/u.test(line)||/^\*{2,3}.+?\.\*{2,3}/u.test(line))?formatted:undefined;
    // PDF wrapping puts capitalized prose at column zero too. Plain titles use
    // title structure, while explicitly formatted labels keep their own gate.
    const preceding=text.slice(0,match.index).replace(/[\r\n]+$/u,'').split(/\r?\n/u).at(-1)?.trim();
    const startsUnit=!preceding||/[.!?。！？]$/u.test(preceding)
      ||/^(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?)$/iu.test(preceding);
    const plain=inFeatures&&(startsUnit||/^\d+\.\s/u.test(line))?line.match(/^(?:\d+\.\s*)?((?:\p{Lu}[\p{L}'’\-]*)(?:\s+(?:\p{Lu}[\p{L}'’\-]*|of|the|and|for|to|in|a|an)){0,10}(?:\s*\([^)]*\))?)\.\s+\S/u)?.[1]:undefined;
    const name=(bold??plain)?.replace(/[.。:]$/u,'').replace(/[（(](?:only|recharge|concentration|仅|充能|专注)[^）)]*[）)]/giu,'').trim();
    if(!name)continue;
    const aliases=[name,name.replace(/[（(][^）)]*[）)]/gu,''),...Array.from(name.matchAll(/[（(]([^）)]+)[）)]/gu),entry=>entry[1]!)].map(normalize);
    const found=features.find(({feature})=>[feature.name,feature.englishName].filter(v=>typeof v==='string').some(v=>{
      return [v!,v!.replace(/[（(][^）)]*[）)]/gu,'')].some(candidate=>aliases.includes(normalize(candidate)));}));
    const start=range.start+match.index!,evidence={start,end:start+match[0].length,quote:match[0]};
    if(!found){
      // Numbered subrules stay inside their source-complete manual parent. The
      // parent's target/choice context must not be lost by splitting them.
      const numbered=/^\d+\.\s/u.test(line),cadence=/^(?:随意|At Will|每项\s*\d+\s*[/／]\s*日|\d+\s*\/\s*Day(?:\s+Each)?)\s*[:：]?$/iu.test(name);
      const parent=features.some(({feature,path})=>{
        const ref=completeSourceFeatureEvidence(source,ir,feature,path,range);
        if(!ref||start<=ref.start||evidence.end>ref.end)return false;
        if(numbered)return feature.executionMode==='gm-manual';
        if(cadence)return /(?:施展[^。\n]{0,60}法术|casts? the following spells)/iu.test(sourceRuleText(feature.description));
        // Named children in a source-explicit list remain part of the complete
        // parent. Their native atoms are still checked on that parent; this
        // does not accept a title alone or an omitted/shortened child body.
        const before=source.slice(ref.start,start);
        return /\b(?:these|the following) [\p{L} '\u2019-]+:\s*\r?\n/iu.test(before)
          &&!before.split(/\r\n|\n|\r/u).some(line=>sourceSectionHeading(line)!==undefined)
          &&sourceRuleText(feature.description).includes(sourceRuleText(ref.quote));
      });
      if(!parent)add('SOURCE_FEATURE_OMITTED','/creature',`来源能力“${name}”未在IR能力清单中保留。`,evidence);
      continue;
    }
    const level=line.match(/\bLevel\s+(\d+)\s+Spell\b|\b(\d+)(?:st|nd|rd|th)[ -]+level spell\b|(\d+)\s*环法术/iu);
    if(level){
      const value=level[1]??level[2]??level[3];
      const pattern=new RegExp(`(?:level\\s*${value}\\s*spell|${value}(?:st|nd|rd|th)[ -]+level spell|${value}\\s*环法术)`,'iu');
      const visible=[found.feature.name,found.feature.englishName,found.feature.sourceQualifier,found.feature.description].filter(Boolean).join(' ');
      if(!pattern.test(visible))add('SOURCE_SPELL_LEVEL_OMITTED',`${found.path}/description`,`来源明确标注的${value}环法术等级必须保留在该能力可见名称或说明中。`,evidence);
    }
  }
  // Definition sections are an explicit input boundary. Their complete body must
  // have a real output landing, not merely a narrative/ignored coverage label.
  const definitions=/^(?:#{1,6}\s*)?(?:Referenced definitions[^\r\n]*|引用定义[^\r\n]*|补充定义[^\r\n]*)\r?\n/gimu.exec(text);
  if(definitions){
    const offset=range.start+definitions.index+definitions[0].length;
    const tail=source.slice(offset,range.end);
    const headers:Array<{start:number;bodyStart:number;label:string}>=[];
    let end=range.end;
    const sectionLevel=(definitions[0].match(/^#+/u)?.[0].length)??0;
    for(const line of tail.matchAll(/^([^\r\n]+)(?:\r?\n|$)/gmu)){
      const raw=line[1]!.trim(),markdown=raw.match(/^(#{1,6})\s+(.+)$/u);
      if(markdown&&sectionLevel&&markdown[1]!.length<=sectionLevel){end=offset+line.index!;break;}
      const label=(markdown?.[2]??raw).replace(/^\*{2,3}|\*{2,3}$/gu,'');
      const title=/^\p{Lu}[\p{L}'’-]*(?:\s+(?:\p{Lu}[\p{L}'’-]*|of|the|and)){0,8}$/u.test(label)
        || /^[\p{Script=Han}]{2,20}$/u.test(label)&&!/(?:必须|可以|不能|如果|每个|受到)/u.test(label);
      const prefix=tail.slice(0,line.index);
      const precededByBlank=!prefix.trim()||/(?:\r?\n){2}\s*$/u.test(prefix);
      if((markdown||title&&precededByBlank)&&label.length<=120)headers.push({start:offset+line.index!,bodyStart:offset+line.index!+line[0].length,label});
    }
    const rendered=[ir.creature.biography??'',...features.map(({feature})=>feature.description??'')].map(normalize);
    for(const [index,header] of headers.entries()){
      const limit=headers[index+1]?.start??end;
      const body=source.slice(header.bodyStart,limit).trim();
      if(!body||rendered.some(value=>value.includes(normalize(body))))continue;
      add('SOURCE_DEFINITION_OMITTED','/creature/biography',`引用定义“${header.label}”缺少完整原文落点；不能仅标为叙述或忽略。`,{start:header.start,end:limit,quote:source.slice(header.start,limit)});
    }
  }
  for(const header of sourceHeaderFeatures(source,ir,range)){
    const found=features.find(({feature,path})=>path.startsWith('/creature/traits/')&&feature.executionMode==='gm-manual'
      &&feature.name===header.name&&feature.description===header.description
      &&completeSourceFeatureEvidence(source,ir,feature,path,range));
    if(!found)add('SOURCE_HEADER_RULE_OMITTED','/creature/traits',`来源静态头规则“${header.name}”缺少完整 GM 手动能力。`,header.evidence![0]!);
  }
  let budget:MonsterIntakeIR['creature']['legendary'];
  try{
    let contexts:readonly StagedSourceUnit[];
    try{contexts=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'legendary-budget-proof',label:ir.creature.identity.name,
      start:range.start,end:range.end,quote:source.slice(range.start,range.end)}}).units;}
    catch{contexts=sourceLegendaryContexts(source,range);}
    budget=stagedLegendaryBudgetFromContexts(contexts,[ir.creature.identity.name,ir.creature.identity.englishName].filter((value):value is string=>!!value));
    const foreign=contexts.find(unit=>stagedLegendaryLedger(unit)&&!stagedLegendaryLedger(unit,[ir.creature.identity.name,ir.creature.identity.englishName].filter((value):value is string=>!!value)));
    if(foreign&&ir.creature.legendary!==undefined)add('SOURCE_LEGENDARY_OWNER_CONFLICT','/creature/legendary/max','另一个主体的传奇动作资源不能借给当前Actor。',foreign);
    const conditional=contexts.find(unit=>stagedLegendaryLedger(unit,[ir.creature.identity.name,ir.creature.identity.englishName].filter((value):value is string=>!!value))?.conditional);
    if(conditional&&ir.creature.legendary!==undefined&&(!budget?.lairMax||ir.creature.legendary.lairMax!==budget.lairMax))add('SOURCE_LEGENDARY_MODE_REQUIRED','/creature/legendary/max','条件传奇动作总量必须完整绑定原生base/lair选择，不能成为无条件单值。',conditional);
  }catch{/* Other source formats retain their existing checks. */}
  if(budget&&ir.creature.legendary?.max!==budget.max)add('SOURCE_LEGENDARY_BUDGET_OMITTED','/creature/legendary/max',
    '来源明确的共享传奇动作计数缺失或不符。',budget.evidence![0]!);
  if(budget&&(ir.creature.legendary?.lairMax!==budget.lairMax||ir.creature.legendary?.recovery!==undefined&&ir.creature.legendary.recovery!==budget.recovery||ir.creature.legendary?.lairMax!==undefined&&ir.creature.legendary.recovery!==budget.recovery))add('SOURCE_LEGENDARY_BOUNDARY_DRIFT','/creature/legendary','传奇资源的巢穴选择及来源恢复时机必须保持。',budget.evidence![0]!);
  return findings;
}

import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { candidateSourceOperationShapeErrors, sourceFeatureResources, type SourceOperation, type SourceCandidateReview } from '@fvtt-json-generator/models/source-operations';
import type { CanonicalFeature, CanonicalSpellcastingGroup, MonsterIntakeIR, EvidenceRef } from './types';
import type { DecodedCategoryFormV2, V2Operation, V2Row } from './category-form-v2';
import { inspectCategoryFormV2 } from './category-form-v2-adapter';
import { stagedSpellcastingGroups } from './staged-spellcasting';
import { stagedDamageType, stagedRecharge, stagedManualHeaderFeatures } from './staged-source-facts';
import {assembleStagedResourcePools} from './staged-resource-pools';
import {bindSourceDamageUpgrades} from './source-damage-upgrade';
import { assertStagedSourcePartition, stagedLegendaryBudget, StagedExtractionError, type StagedMonsterSource, type StagedSourceUnit } from './staged-source';

export interface CandidateDiagnostic {code:string;path:string;message?:string}
const collections={trait:'traits',action:'actions',bonus:'bonusActions',reaction:'reactions',legendary:'legendaryActions',mythic:'mythicActions'} as const;
const attackTypes={'近战武器攻击':'mwak','远程武器攻击':'rwak','近战法术攻击':'msak','远程法术攻击':'rsak','近战攻击':'melee','远程攻击':'ranged'} as const;
const shapes={'球体':'sphere','球形':'sphere','半径':'radius','锥形':'cone','线形':'line','立方体':'cube','圆柱体':'cylinder','矩形':'rectangle'} as const;
const evidence=(unit:StagedSourceUnit):EvidenceRef=>({start:unit.start,end:unit.end,quote:unit.quote});
const message=(finding:CandidateDiagnostic)=>finding.message??`检查未通过：${finding.code}（${finding.path}）；保留候选供用户核对。`;
const failure=(error:unknown,path:string):CandidateDiagnostic=>error instanceof StagedExtractionError
  ?{code:error.code,path:error.path}:{code:'CANDIDATE_ASSEMBLY_REVIEW',path,message:'程序未能确认这项规则；完整来源与模型字段仍保留供核对。'};
function review(row:unknown,diagnostics:CandidateDiagnostic[]):SourceCandidateReview{
  return{version:1,findings:diagnostics.map(f=>({...f,message:message(f)})),proposal:structuredClone(row)};
}

/** A decoded V2 row is already a bounded typed value. This projection keeps
 * its printed/model values; it does not turn source proof failures into proof.
 * Unrecognized conditions stay on the complete parent rule, never new hooks. */
function operations(row:V2Row,unit:StagedSourceUnit):SourceOperation[]{
  const result:SourceOperation[]=[];
  const add=(fields:V2Operation,name:string,condition?:string)=>{
    const common={id:'candidate-op-'+result.length,name,relationship:result.length?'follow-up' as const:'primary' as const,
      ...(condition?{condition}:{}),sourceText:unit.quote,evidence:evidence(unit),proof:{}};
    const damage=fields.伤害.map((d,index)=>({formula:d.倍率===1?d.公式:`(${d.公式})*${d.倍率}`,
      type:stagedDamageType(d.伤害类型)??d.伤害类型,relationship:d.生效条件?'conditional' as const:index?'additional' as const:'base' as const,
      ...(d.生效条件?{condition:d.生效条件}:{})}));
    const area=fields.范围?{shape:shapes[fields.范围.形状 as keyof typeof shapes],radius:fields.范围.大小尺}:undefined;
    const range=fields.范围?.距离尺??fields.距离.find(d=>/目标|选择|target|range/iu.test(d.用途))?.尺;
    const geometry={...(area?{aoe:area}:{}),...(range!==null&&range!==undefined?{range}:{}),
      ...(fields.攻击?.目标限制||fields.豁免?.目标限制?{targetSpecial:fields.攻击?.目标限制??fields.豁免!.目标限制!}:{})};
    if(fields.攻击){
      const a=fields.攻击;
      result.push({...common,...geometry,type:'attack',attack:{type:attackTypes[a.类型 as keyof typeof attackTypes],toHit:a.命中加值,
        ...(a.触及尺===null?{}:{reach:a.触及尺}),...(a.射程尺===null?{}:{range:a.射程尺}),...(a.远射程尺===null?{}:{longRange:a.远射程尺})},
        ...(damage.length?{damage}:{}),proof:{attack:unit.quote,...(damage.length?{damage:damage.map(()=>unit.quote)}:{})}});
    }
    if(fields.豁免){
      const s=fields.豁免,multiplier=fields.伤害.find(d=>d.成功时倍率!==null)?.成功时倍率;
      result.push({...common,id:'candidate-op-'+result.length,...geometry,type:'save',
        save:{dc:s.DC,abilities:[...s.属性],choice:s.属性.length>1?'target':'single',outcome:multiplier===0.5?'half':multiplier===1?'full':'none'},
        ...(damage.length?{damage}:{}),proof:{save:unit.quote,...(damage.length?{damage:damage.map(()=>unit.quote)}:{})}});
    }
    if(!fields.攻击&&!fields.豁免&&damage.length)result.push({...common,...geometry,type:'damage',damage,proof:{damage:damage.map(()=>unit.quote)}});
    for(const healing of fields.治疗){
      if(healing.公式===null)continue; // Dynamic value remains complete GM text and in the retained model row.
      result.push({...common,id:'candidate-op-'+result.length,type:'heal',healing:{formula:healing.公式,type:healing.类型==='治疗'?'healing':'temphp',
        target:{type:/^(?:self|自身|自己)$/iu.test(healing.目标)?'self':'creature',count:1,special:healing.目标}},proof:{healing:unit.quote}});
    }
  };
  add(row,row.名称);
  for(const child of row.其他操作)add(child,child.名称,child.条件??unit.quote);
  const shape=candidateSourceOperationShapeErrors(result);
  if(result.length&&shape.length)throw new StagedExtractionError('CANDIDATE_OPERATION_SHAPE','/features/'+unit.id+'/'+shape.join(','));
  return result;
}

function knownRecovery(value:string|null):NonNullable<CanonicalFeature['uses']>['period']|undefined{
  const raw=(value??'').trim();
  if(/^(?:short[ -]?rest|短休|每次短休)$/iu.test(raw))return'shortRest';
  if(/^(?:long[ -]?rest|长休|每次长休)$/iu.test(raw))return'longRest';
  if(/^(?:dawn|黎明|每天黎明)$/iu.test(raw))return'dawn';
  if(/^(?:day|daily|每天|每日)(?:[；;].*)?$/iu.test(raw))return'day';
}
function resourceFields(row:V2Row,unit:StagedSourceUnit):Pick<CanonicalFeature,'uses'|'recharge'|'legendaryCost'|'candidateCounters'>{
  const recharge=stagedRecharge(unit.name??'');
  let period=knownRecovery(row.恢复方式);
  if(period===undefined)try{const actual=sourceFeatureResources(unit.name??'',unit.quote).uses;if(actual?.max===row.使用次数)period=actual.period;}catch{}
  return{...(recharge?{recharge}:row.使用次数!==null&&row.使用次数>0?period?{uses:{max:row.使用次数,period}}:{candidateCounters:[{name:unit.name!,max:row.使用次数,recovery:row.恢复方式}]}:{}),
    ...(row.传奇动作消耗!==null?{legendaryCost:row.传奇动作消耗}:{})};
}
function featureCandidate(row:V2Row,unit:StagedSourceUnit,plan:StagedMonsterSource,diagnostics:CandidateDiagnostic[]):CanonicalFeature{
  const sourceOperations=operations(row,unit),sourceContext=(unit.contextIds??[]).map(id=>plan.units.find(context=>context.id===id)!.quote);
  const activation=unit.section==='mythic'?'legendary':unit.section==='trait'?undefined:unit.section;
  return{name:unit.name!,description:unit.quote,evidence:[evidence(unit)],activityType:'utility',...resourceFields(row,unit),
    ...(activation?{activationType:activation}:{}),candidateReview:review(row,diagnostics),
    ...(sourceOperations.length?{sourceOperations,sourceContext,executionMode:'native-with-gm',nativeRuleText:unit.quote,manualRemainder:unit.quote}:{executionMode:'gm-manual'})};
}

function castingCandidate(row:V2Row,unit:StagedSourceUnit,diagnostics:CandidateDiagnostic[]):CanonicalSpellcastingGroup|undefined{
  const cast=row.施法;if(!cast||!cast.属性||!cast.法术.length)return;
  const ref=evidence(unit),groupId='candidate-spells-'+unit.id;
  const unsupported=cast.法术.filter(spell=>spell.次数!==null?knownRecovery(spell.恢复)!=='day'
    :spell.恢复!==null&&!/^(?:随意|at[ -]*will)$/iu.test(spell.恢复)||/spell slots|法术位|\d+(?:st|nd|rd|th)[- ]level spellcaster/iu.test(unit.quote));
  if(unsupported.length)diagnostics.push({code:'CANDIDATE_SPELL_RECOVERY_REVIEW',path:'/features/'+unit.id+'/spellcasting/recovery',message:'未支持的法术恢复方式保持GM手动计数，不推断为每日恢复或原生施法。'});
  const usageGroups:CanonicalSpellcastingGroup['usageGroups']=cast.法术.filter(spell=>!unsupported.includes(spell)).map((spell,index)=>({
    ...(spell.次数===null?{usage:'at-will' as const}:{usage:'daily-each' as const,count:spell.次数}),evidence:[ref],
    spellRefs:[{refId:groupId+'-'+index,identifier:spell.名称.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/gu,''),
      originalName:spell.名称,...(/[a-z]/iu.test(spell.名称)?{englishName:spell.名称}:{chineseName:spell.名称}),aliases:[],evidence:[ref],
      restrictions:spell.限制?[{kind:'other' as const,text:spell.限制,evidence:[ref]}]:[]}],
  }));
  return{groupId,featureName:unit.name!,description:unit.quote,evidence:[ref],ability:cast.属性,abilityEvidence:[ref],
    ...(cast.豁免DC===null?{}:{saveDc:cast.豁免DC,saveDcEvidence:[ref]}),...(cast.命中加值===null?{}:{attackBonus:cast.命中加值,attackBonusEvidence:[ref]}),
    componentWaivers:cast.无需材料?[{component:'material',evidence:[ref]}]:[],usageGroups,candidateReview:review(row,diagnostics),
    ...(unsupported.length?{manualGrants:[ref],candidateCounters:unsupported.filter(spell=>spell.次数!==null).map(spell=>({name:spell.名称,max:spell.次数!,recovery:spell.恢复}))}:{}),
    ...(unit.section&&unit.section!=='trait'&&unit.section!=='mythic'?{activationType:unit.section}:{}),
    ...(row.传奇动作消耗===null?{}:{legendaryCost:row.传奇动作消耗})};
}

/** Candidate-only assembly. Strict APIs above remain unchanged and are still
 * run first; only successful strict parts retain their accepted projections. */
export function assembleWholeFormCandidate(plan:StagedMonsterSource,base:MonsterIntakeIR,decoded:DecodedCategoryFormV2,diagnostics:CandidateDiagnostic[],assembleFeature:(unit:StagedSourceUnit,proposal:unknown)=>CanonicalFeature):MonsterIntakeIR{
  assertStagedSourcePartition(plan);
  const ir=structuredClone(base),all=[...diagnostics];
  const offset=(value:unknown):void=>{if(!value||typeof value!=='object')return;const r=value as any;if(typeof r.quote==='string'&&Number.isInteger(r.start)&&Number.isInteger(r.end)){r.start+=plan.base.start;r.end+=plan.base.start;}Object.values(r).forEach(offset);};
  offset(ir);ir.source={sha256:plan.sourceSha256,length:plan.source.length};ir.coverage=[];
  // The full original header and all unprojected text stay on the Actor too.
  ir.creature.biography=plan.source;
  for(const collection of Object.values(collections))ir.creature[collection]=[];
  try{const budget=stagedLegendaryBudget(plan,[ir.creature.identity.name]);if(budget){ir.creature.legendary=budget;ir.claims.push({path:'/creature/legendary/max',value:budget.max,valueKind:'explicit',confidence:'high',evidence:budget.evidence});}}
  catch(error){all.push(failure(error,'/creature/legendary'));}
  let groups=new Map<string,CanonicalSpellcastingGroup>();
  try{groups=stagedSpellcastingGroups(plan);}catch(error){all.push(failure(error,'/creature/spellcasting'));}
  const inspected=inspectCategoryFormV2(plan,base,decoded);
  const featurePaths=new Map<string,string[]>();
  for(const[unitIndex,unit]of plan.features.entries()){
    const row=decoded.rows.find(row=>row.编号===unit.id)!;
    const entry=inspected[unitIndex]!,problems:CandidateDiagnostic[]=[];
    if(entry.error)problems.push(entry.error);
    let feature:CanonicalFeature|undefined;
    const existingGroups=[...groups.entries()].filter(([key])=>key===unit.id||key.startsWith(unit.id+'::pool-')).map(([,group])=>group);
    if(existingGroups.length){
      const target=ir.creature.spellcasting??(ir.creature.spellcasting=[]),paths:string[]=[];
      const nativeNames=new Set(existingGroups.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs.map(ref=>ref.originalName.toLowerCase()))));
      const counters=(row.施法?.法术??[]).filter(spell=>spell.次数!==null&&knownRecovery(spell.恢复)!=='day'&&!nativeNames.has(spell.名称.toLowerCase()))
        .map(spell=>({name:spell.名称,max:spell.次数!,recovery:spell.恢复}));
      for(const[index,group]of existingGroups.entries()){
        const path='/creature/spellcasting/'+target.length;paths.push(path);
        target.push(problems.length?{...group,candidateReview:review(row,problems),...(index===0&&counters.length?{candidateCounters:counters}:{})}:group);
        ir.claims.push({path,valueKind:'preserved-literal',confidence:'high',evidence:[evidence(unit)]});
      }
      featurePaths.set(unit.id,paths);all.push(...problems);continue;
    }
    if(entry.proposal){try{feature=assembleFeature(unit,entry.proposal);}catch(error){problems.push(failure(error,'/features/'+unit.id));}}
    if(!feature){
      if(!problems.length)problems.push({code:'CANDIDATE_SOURCE_REVIEW',path:'/features/'+unit.id});
      const group=castingCandidate(row,unit,problems);
      if(group){const target=ir.creature.spellcasting??(ir.creature.spellcasting=[]),path='/creature/spellcasting/'+target.length;target.push(group);featurePaths.set(unit.id,[path]);ir.claims.push({path,valueKind:'preserved-literal',confidence:'low',evidence:[evidence(unit)]});all.push(...problems);continue;}
      feature=featureCandidate(row,unit,plan,problems);
    }
    const collection=collections[unit.section!],target=ir.creature[collection]!,path='/creature/'+collection+'/'+target.length;
    target.push(feature);featurePaths.set(unit.id,[path]);ir.claims.push({path,valueKind:'preserved-literal',confidence:problems.length?'low':'high',evidence:[evidence(unit)]});
    if(feature.sourceContext?.length){const contextPath=path+'/sourceContext',refs=plan.units.filter(u=>feature!.sourceContext!.includes(u.quote)).map(evidence);ir.claims.push({path:contextPath,valueKind:'preserved-literal',confidence:'high',evidence:refs});}
    all.push(...problems);
  }
  for(const feature of stagedManualHeaderFeatures(plan.base.quote)){
    offset(feature);const path='/creature/traits/'+ir.creature.traits.length;ir.creature.traits.push(feature);ir.claims.push({path,valueKind:'preserved-literal',confidence:'high',evidence:feature.evidence!});
  }
  for(const unit of plan.units){
    const paths=featurePaths.get(unit.id)??(unit.destination==='base'?ir.claims.filter(c=>!/^\/creature\/(?:traits|actions|spellcasting)/u.test(c.path)).map(c=>c.path):['/creature/biography']);
    const contextPaths=ir.claims.filter(c=>c.path.endsWith('/sourceContext')&&c.evidence.some(e=>e.start===unit.start&&e.end===unit.end)).map(c=>c.path);
    ir.coverage.push({...evidence(unit),classification:unit.destination==='feature'||unit.destination==='base'?'mechanical':'narrative',claimPaths:[...new Set([...paths,...contextPaths])]});
  }
  // Reuse the ordinary cross-feature binders. A different feature's semantic
  // finding must not detach an independently proven pool or damage upgrade.
  try{assembleStagedResourcePools(plan,ir,inspected.map(entry=>entry.proposal));}
  catch(error){all.push(failure(error,'/creature/sourceResourcePools'));}
  try{bindSourceDamageUpgrades(plan.source,ir,plan.candidate);}
  catch(error){all.push(failure(error,'/creature/damageUpgrades'));}
  const unique=new Map(all.map(f=>[f.code+'\0'+f.path,f]));
  for(const[fingerprint,f]of unique){ir.uncertainties.push({id:'candidate-review-'+sha256(fingerprint).slice(0,12),code:f.code,path:f.path,message:message(f),blocking:true,evidence:[evidence(plan.base)],candidates:[]});}
  return ir;
}

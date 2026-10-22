import yaml from 'js-yaml';
import srd from '../fixtures/forge-template-repeat-v2-srd.json';
import bases from '../fixtures/forge-v2-bw-base-facts.json';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {assembleStagedLinePartition,splitStagedMonsterSource,stagedSourceLines} from '@fvtt-json-generator/intake-ai/staged-source';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';

/** Independently authored, source-owned NEW CONTRACT input. Never reads a model
 * reply or a rubric, and never repairs or re-scores the frozen R4 answers. */
export const wholeVampireSource=srd.cases.find(value=>value.id==='R4')!;
export const wholeVampireCandidate={id:'whole-vampire-new-contract',label:'Vampire',start:0,end:wholeVampireSource.source.length,quote:wholeVampireSource.source};
const sourceRequest={source:wholeVampireSource.source,sourceSha256:hashSource(wholeVampireSource.source),candidate:wholeVampireCandidate};

function originalLineOwnership(){
  const source=wholeVampireSource.source,events:any[]=[{start:0,destination:'base'}],seen=new Set([0]);
  const startOf=(quote:string)=>{
    const matches=[...source.matchAll(new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'gu'))].map(m=>m.index!).filter(at=>at===0||source[at-1]==='\n');
    if(matches.length!==1)throw Error('Original source span is not unique at a line boundary');return matches[0]!;
  };
  for(const unit of wholeVampireSource.units){
    for(const context of unit.context){const start=startOf(context);if(!seen.has(start)){seen.add(start);events.push({start,destination:'context'});}}
    const start=startOf(unit.quote);if(seen.has(start))throw Error('Original source line ownership overlaps');seen.add(start);
    events.push({start,destination:'feature',section:unit.section,name:unit.name});
  }
  for(const match of source.matchAll(/^(?:Actions|Legendary Actions)\r?$/gmu))if(!seen.has(match.index!)){seen.add(match.index!);events.push({start:match.index!,destination:'context'});}
  events.sort((a,b)=>a.start-b.start);
  const offsets:number[]=[];let offset=0;for(const line of stagedSourceLines(sourceRequest)){offsets.push(offset);offset+=line.text.length;}
  return {schemaVersion:1 as const,units:events.map((event,index)=>{
    const firstLine=offsets.indexOf(event.start),lastLine=offsets.findLastIndex(at=>at<(events[index+1]?.start??source.length));
    if(firstLine<0)throw Error('Original source ownership is not a complete line');
    return {firstLine,lastLine,destination:event.destination,...(event.section?{section:event.section,name:event.name}:{})};
  })};
}

export function wholeVampirePlan(){
  try{return {plan:splitStagedMonsterSource(sourceRequest),partition:undefined};}
  catch{return {plan:assembleStagedLinePartition(sourceRequest,originalLineOwnership()),partition:originalLineOwnership()};}
}
export type VampireReference='id'|'name';
export function fillWholeVampireContract(form:any,units:any[],reference:VampireReference){
  const rows=Object.values<any[]>(form).flat(),row=(name:string)=>{
    const matching=rows.filter(value=>value.名称===name);if(matching.length!==1)throw Error('Unproven current source feature: '+name);return matching[0]!;
  };
  for(const value of rows){const source=units.find(unit=>unit.id===value.编号);if(!source||source.name!==value.名称)throw Error('Current unit identity changed');value.特殊规则=source.quote;}
  Object.assign(row('Legendary Resistance (3/Day)'),{使用次数:3,恢复方式:'day'});
  Object.assign(row('Children of the Night (1/Day)'),{使用次数:1,恢复方式:'day'});
  Object.assign(row('Misty Escape'),{治疗:[{公式:'1',取值依据:null,类型:'治疗',目标:'self',生效条件:'After spending 1 hour in its resting place with 0 hit points, it regains 1 hit point.'}]});
  Object.assign(row('Regeneration'),{治疗:[{公式:'20',取值依据:null,类型:'治疗',目标:'self',生效条件:'at the start of its turn if it has at least 1 hit point and isn’t in sunlight or running water'}]});
  Object.assign(row('Vampire Weaknesses'),{伤害:[
    {公式:'20',伤害类型:'acid',生效条件:'if it ends its turn in running water',倍率:1,成功时倍率:null},
    {公式:'20',伤害类型:'radiant',生效条件:'when it starts its turn in sunlight',倍率:1,成功时倍率:null},
  ]});
  Object.assign(row('Unarmed Strike (Vampire Form Only)'),{攻击:{类型:'近战武器攻击',命中加值:9,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'},
    伤害:[{公式:'1d8+4',伤害类型:'bludgeoning',生效条件:null,倍率:1,成功时倍率:null}]});
  const bite=row('Bite (Bat or Vampire Form Only)'),ref=reference==='id'?bite.编号:bite.名称;
  Object.assign(bite,{攻击:{类型:'近战武器攻击',命中加值:9,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one willing creature, or a creature that is grappled by the vampire, incapacitated, or restrained'},
    伤害:[{公式:'1d6+4',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null},{公式:'3d6',伤害类型:'necrotic',生效条件:null,倍率:1,成功时倍率:null}],
    治疗:[{公式:null,取值依据:`等于目标因该次[${ref}]所受死灵伤害的实际数值`,类型:'治疗',目标:'self',生效条件:`[${ref}]命中并造成死灵伤害时`}]});
  Object.assign(row('Charm'),{豁免:{DC:17,属性:['wis'],成功结果:'not charmed',目标限制:'one humanoid it can see within 30 feet of it'},距离:[{用途:'target selection',尺:30,条件:'If the target can see the vampire'}]});
  Object.assign(row('Move'),{距离:[{用途:'move',尺:30,条件:'up to its speed without provoking opportunity attacks'}]});
  for(const value of form.传奇动作){
    const unit=units.find(unit=>unit.id===value.编号);if(unit.context.length!==1)throw Error('Legendary source preamble is not unique');
    Object.assign(value,{传奇动作消耗:value.名称==='Bite (Costs 2 Actions)'?2:1,共享资源:{名称:'legendary actions',上限:3,恢复:'at the start of its turn',限制:unit.context[0]}});
  }
}

export async function runWholeVampireContract(reference:VampireReference,mutate?:(form:any)=>void){
  const {plan,partition}=wholeVampirePlan(),priorFetch=globalThis.fetch,requests:any[]=[],forms:any[]=[];
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);requests.push(payload);let answer:any;
    if(payload.lines&&partition)answer=partition;
    else if(payload.source===plan.base.quote)answer=structuredClone(bases.R4);
    else if(payload.template&&payload.units){
      const form=yaml.load(payload.template);fillWholeVampireContract(form,payload.units,reference);mutate?.(form);forms.push(structuredClone(form));answer={markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
    }else throw Error('Unexpected HTTP operation: no real request, repair, translation or automation is permitted');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:priorFetch.preconnect});
  try{
    const actual=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'whole-vampire-new-contract',protocol:'openai-chat',timeoutMs:10000}).provider;
    const provider={providerName:actual.providerName,extractionModel:actual.extractionModel,reviewModel:actual.reviewModel,
      discover:async()=>({schemaVersion:1 as const,candidates:[wholeVampireCandidate]}),extract:actual.extract.bind(actual),review:actual.review.bind(actual),repair:actual.repair.bind(actual)};
    const result=await generateEncounterFromHumanMarkdown({source:wholeVampireSource.source,label:'Full original Vampire / new contract '+reference,provider,reviewPolicy:'deferred',
      automationProvider:{generate:async()=>{throw Error('Source-owned GM rules must not manufacture a controller');},review:async()=>({verdict:'accepted',findings:[]})}});
    return {result,plan,partition,requests,forms,modelHttp:0 as const};
  }finally{globalThis.fetch=priorFetch;}
}

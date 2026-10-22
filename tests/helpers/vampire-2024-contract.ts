import yaml from 'js-yaml';
import fixture from '../fixtures/forge-vampire-2024-srd521.json';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {assembleStagedLinePartition,splitStagedMonsterSource,stagedSourceLines,type StagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {makeWholeCategoryForm,decodeCategoryFormV2} from '../../packages/intake-ai/src/category-form-v2';
import {inspectCategoryFormV2} from '../../packages/intake-ai/src/category-form-v2-adapter';
import {assembleStagedFeature,validateStagedBaseFacts} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {sourceFeatureBasicOmissions} from '@fvtt-json-generator/models/source-operations';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';

/** Independent hand-filled 2024 interface input. It is neither a model-quality
 * result nor a projection of the official native Actor into final output. */
export const vampire2024=fixture;
export const vampire2024Candidate={id:fixture.id,label:'Vampire 2024 SRD 5.2.1',start:0,end:fixture.source.length,quote:fixture.source};
export const vampire2024Request={source:fixture.source,sourceSha256:hashSource(fixture.source),candidate:vampire2024Candidate};
export const vampire2024BaseFacts={schemaVersion:1,creature:{
  identity:{name:'Vampire',size:'medium',creatureType:'undead',alignment:'lawful evil'},
  abilities:{str:18,dex:18,con:18,int:17,wis:15,cha:18},
  attributes:{ac:16,initiative:14,hp:{value:195,formula:'23d8 + 92'},movement:{walk:40,climb:40},cr:13,xp:10000,proficiencyBonus:5},
  saves:{str:4,dex:9,con:9,int:3,wis:7,cha:9},skills:{perception:7,stealth:9},
  defenses:{resistances:['necrotic'],immunities:[],vulnerabilities:[],conditionImmunities:[]},
  senses:{darkvision:120,passivePerception:17},languages:{values:[],custom:'Common plus two other languages'},
},uncertainties:[]};
export const vampire2024Boundaries={
  baseProjection:'Current single-value facts use the explicitly printed Medium and non-lair XP 10000 defaults. This does not prove a mode was selected or that the alternative rules survived generation.',
  sourceSizeChoices:'Medium or Small',xpChoices:'XP 10,000, or 11,500 in lair',
  resistanceLedger:'3/Day, or 4/Day in Lair',legendaryLedger:'Legendary Action Uses: 3 (4 in Lair)',
  nativeModes:'No lair/non-lair mode is selected or invented. Complete source choices must be visible in the generated artifact or source-semantic acceptance fails.',
  spellDefinitions:'Charm Person and Command remain source spell references; no native Actor JSON is copied and no model/manifest resolver network is permitted.',
};

function fixtureLineOwnership(){
  const source=fixture.source,events:any[]=[{start:0,destination:'base'}];
  for(const section of ['Traits','Actions','Bonus Actions','Legendary Actions']){
    const matches=[...source.matchAll(new RegExp('^'+section+'\\r?$','gmu'))];if(matches.length!==1)throw Error('2024 section must be unique: '+section);
    events.push({start:matches[0]!.index!,destination:'context'});
  }
  for(const unit of fixture.expectedUnits){
    const escaped=unit.name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    const matches=[...source.matchAll(new RegExp('^'+escaped+'\\.','gmu'))];if(matches.length!==1)throw Error('2024 physical feature must be unique: '+unit.name);
    events.push({start:matches[0]!.index!,destination:'feature',section:unit.section,name:unit.name});
  }
  events.sort((a,b)=>a.start-b.start);const offsets:number[]=[];let offset=0;
  for(const line of stagedSourceLines(vampire2024Request)){offsets.push(offset);offset+=line.text.length;}
  return{schemaVersion:1 as const,units:events.map((event,index)=>({
    firstLine:offsets.indexOf(event.start),lastLine:offsets.findLastIndex(at=>at<(events[index+1]?.start??source.length)),
    destination:event.destination,...(event.section?{section:event.section,name:event.name}:{}),
  }))};
}
export function planVampire2024(){
  try{return{plan:splitStagedMonsterSource(vampire2024Request),partition:undefined,splitFailure:undefined};}
  catch(error){const partition=fixtureLineOwnership();return{plan:assembleStagedLinePartition(vampire2024Request,partition),partition,splitFailure:String(error)};}
}

export function fillVampire2024Form(form:any,units:any[]){
  const rows=Object.values<any[]>(form).flat(),find=(name:string)=>rows.find(row=>row.名称===name);
  for(const row of rows){const unit=units.find(unit=>unit.id===row.编号);if(!unit||unit.name!==row.名称)throw Error('2024 current source identity changed');row.特殊规则=unit.quote;}
  const mist=find('Misty Escape');if(mist)mist.治疗=[{公式:'1',取值依据:null,类型:'治疗',目标:'self',生效条件:'after spending 1 hour there'}];
  const weaknesses=find('Vampire Weakness');if(weaknesses)weaknesses.伤害=[
    {公式:'20',伤害类型:'acid',生效条件:'if it ends its turn in running water',倍率:1,成功时倍率:null},
    {公式:'20',伤害类型:'radiant',生效条件:'if it starts its turn in sunlight',倍率:1,成功时倍率:null},
  ];
  const grave=find('Grave Strike (Vampire Form Only)');if(grave)Object.assign(grave,{
    攻击:{类型:'近战攻击',命中加值:9,触及尺:5,射程尺:null,远射程尺:null,目标数量:null,目标限制:null},
    伤害:[{公式:'1d8+4',伤害类型:'bludgeoning',生效条件:null,倍率:1,成功时倍率:null},{公式:'2d6',伤害类型:'necrotic',生效条件:null,倍率:1,成功时倍率:null}],
  });
  const bite=find('Bite (Bat or Vampire Form Only)');if(bite)Object.assign(bite,{
    攻击:null,豁免:{DC:17,属性:['con'],成功结果:'No damage',目标限制:'one creature within 5 feet that is willing or that has the Grappled, Incapacitated, or Restrained condition'},
    距离:[{用途:'target selection',尺:5,条件:null}],
    伤害:[{公式:'1d4+4',伤害类型:'piercing',生效条件:'Failure',倍率:1,成功时倍率:0},{公式:'3d8',伤害类型:'necrotic',生效条件:'Failure',倍率:1,成功时倍率:0}],
    治疗:[{公式:null,取值依据:`等于目标因该次[${bite.编号}]所受死灵伤害的实际数值`,类型:'治疗',目标:'self',生效条件:`[${bite.编号}]目标受到死灵伤害时`}],
  });
  const charm=find('Charm (Recharge 5–6)');if(charm)Object.assign(charm,{使用次数:1,恢复方式:'Recharge 5-6',
    施法:{属性:'cha',豁免DC:17,命中加值:null,无需材料:true,法术:[{名称:'Charm Person',次数:null,恢复:null,限制:'duration is 24 hours'}]},
  });
  const beguile=find('Beguile');if(beguile)beguile.施法={属性:'cha',豁免DC:17,命中加值:null,无需材料:true,法术:[{名称:'Command',次数:null,恢复:null,限制:null}]};
  const deathless=find('Deathless Strike');if(deathless)deathless.距离=[{用途:'move',尺:20,条件:'up to half its Speed'}];
  // Conditional 3/4 ledgers have no unconditional finite maximum in V2.
  // Keep the exact rule, never manufacture a fixed 3/day or fixed 3-use pool.
  for(const row of rows){
    if(row.名称==='Legendary Resistance (3/Day, or 4/Day in Lair)'){row.使用次数=null;row.恢复方式=null;}
    const unit=units.find(unit=>unit.id===row.编号);if(unit.section==='legendary'){row.传奇动作消耗=1;row.共享资源=null;}
  }
}

export function authorVampire2024Form(plan:StagedMonsterSource){
  const request=makeWholeCategoryForm(plan),form=yaml.load(String(request.payload.template)) as any;
  fillVampire2024Form(form,request.payload.units as any[]);
  return{form,reply:{markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})}};
}

export async function runVampire2024FormalChain(){
  const planned=planVampire2024(),priorFetch=globalThis.fetch,requests:any[]=[],replies:any[]=[],stages:any[]=[],unexpectedRequests:any[]=[];
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);requests.push(payload);let answer:any;
    if(payload.lines&&planned.partition)answer=planned.partition;
    else if(payload.source===planned.plan.base.quote)answer=structuredClone(vampire2024BaseFacts);
    else if(payload.template&&payload.units){const form=yaml.load(payload.template);fillVampire2024Form(form,payload.units);answer={markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};}
    else{unexpectedRequests.push({keys:Object.keys(payload)});throw Error('No real HTTP, repair, paid review, translation or spell resolution is permitted');}
    replies.push(answer);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:priorFetch.preconnect});
  try{
    const actual=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'vampire-2024-interface-fixture',protocol:'openai-chat',timeoutMs:10000,onExtractionStage:stage=>{stages.push(stage);}}).provider;
    const provider={providerName:actual.providerName,extractionModel:actual.extractionModel,reviewModel:actual.reviewModel,
      discover:async()=>({schemaVersion:1 as const,candidates:[vampire2024Candidate]}),extract:actual.extract.bind(actual),review:actual.review.bind(actual),repair:actual.repair.bind(actual)};
    const result=await generateEncounterFromHumanMarkdown({source:fixture.source,label:'2024 Vampire / official SRD 5.2.1 / interface retest',provider,reviewPolicy:'deferred',
      automationProvider:{generate:async()=>{throw Error('No invented controller; this retest reports unsupported source rules');},review:async()=>({verdict:'accepted',findings:[]})}});
    return{...planned,result,requests,replies,stages,unexpectedRequests,modelHttp:0 as const};
  }finally{globalThis.fetch=priorFetch;}
}

/** Independent capability diagnostics only. If the actual base gate fails, the
 * scaffold below is explicitly unaccepted and never fed back into generation. */
export function inspectVampire2024Form(plan:StagedMonsterSource){
  const authored=authorVampire2024Form(plan);let base:MonsterIntakeIR,baseStatus:string,baseFailure:string|undefined;
  try{base=validateStagedBaseFacts(plan,vampire2024BaseFacts);baseStatus='SOURCE_VALIDATED';}
  catch(error){
    baseStatus='UNACCEPTED_INSPECTOR_SCAFFOLD';baseFailure=String(error);
    base={schemaVersion:1,source:{sha256:hashSource(plan.base.quote),length:plan.base.quote.length},creature:{...structuredClone(vampire2024BaseFacts.creature),traits:[],actions:[],bonusActions:[],reactions:[],legendaryActions:[]},claims:[],coverage:[],uncertainties:[]} as MonsterIntakeIR;
  }
  const decoded=decodeCategoryFormV2(authored.reply,plan),diagnostics=inspectCategoryFormV2(plan,base,decoded).map(entry=>{
    const unit=plan.features.find(unit=>unit.id===entry.unitId)!;
    if(entry.error)return{unitId:unit.id,name:unit.name,section:unit.section,status:'ADAPTER_BLOCKED',...entry.error};
    try{
      const feature=assembleStagedFeature(plan,unit,entry.proposal,base.creature.identity.name,undefined,{sourceProvenSelfArea:true});
      const omissions=sourceFeatureBasicOmissions(unit.quote.trim(),feature);
      return{unitId:unit.id,name:unit.name,section:unit.section,status:omissions.length?'BASIC_OMISSION_BLOCKED':'CAPABILITY_ASSEMBLED_NOT_WHOLE_ACCEPTANCE',omissions,feature};
    }catch(error){return{unitId:unit.id,name:unit.name,section:unit.section,status:'ASSEMBLY_BLOCKED',error:String(error)};}
  });
  return{scope:'independent-capability-diagnostics-never-a-whole-source-pass',baseStatus,baseFailure,...authored,diagnostics};
}

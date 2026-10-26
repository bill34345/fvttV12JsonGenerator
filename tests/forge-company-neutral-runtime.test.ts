import {describe,test,expect} from 'bun:test';
import yaml from 'js-yaml';
import company from './fixtures/forge-company-pdf-recorded-base.json';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {legacyWholeFormProvider,assertDefaultFullIrReplay} from './helpers/forge-legacy-provider';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import srd from './fixtures/forge-template-repeat-v2-srd.json';
import bases from './fixtures/forge-v2-bw-base-facts.json';
import {writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {prepareFoundryImportArtifact,assertActorSemantics} from '../foundry-modules/fvtt-json-forge/src/runtime';

// A new, explicit source-owned response fixture, not a repaired frozen answer.
// The original 24 frozen answers are replayed separately without these values.
function fillCompany(form:any,units:any[]){
  for(const row of Object.values<any[]>(form).flat())row.特殊规则=units.find(unit=>unit.id===row.编号).quote;
  const find=(name:string)=>Object.values<any[]>(form).flat().find(row=>row.名称.startsWith(name));
  Object.assign(find('Spindly Shred'),{攻击:{类型:'近战攻击',命中加值:10,触及尺:0,射程尺:null,远射程尺:null,目标数量:1,目标限制:null},伤害:[
    {公式:'10d8+4',伤害类型:'slashing',生效条件:'self is not Bloodied',倍率:1,成功时倍率:null},
    {公式:'10d8+4',伤害类型:'slashing',生效条件:'self is Bloodied',倍率:0.5,成功时倍率:null},
  ]});
  Object.assign(find('Weaverot Volley'),{豁免:{DC:18,属性:['dex'],成功结果:'No damage',目标限制:'Each creature in a 15-foot radius Sphere within 60 feet'},范围:{形状:'球体',大小尺:15,距离尺:60,中心:null},伤害:[
    {公式:'4d6',伤害类型:'piercing',生效条件:'Failure',倍率:1,成功时倍率:0},
    {公式:'2d10',伤害类型:'necrotic',生效条件:'Failure',倍率:1,成功时倍率:0},
  ]});
  Object.assign(find('Toxic Emission'),{豁免:{DC:17,属性:['con'],成功结果:'Half damage',目标限制:'each creature within 10 feet of it'},范围:{形状:'半径',大小尺:10,距离尺:0,中心:null},伤害:[
    {公式:'4d8',伤害类型:'poison',生效条件:'Failure',倍率:1,成功时倍率:0.5},
  ]});
  Object.assign(find('Strike-Gate'),{使用次数:1,恢复方式:'day',豁免:{DC:16,属性:['cha'],成功结果:'not teleported',目标限制:'Any creature Grappled by it'},距离:[{用途:'teleport destination',尺:120,条件:null}]});
}

async function runFixedSource<T>(source:string,base:any,fill:(form:any,units:any[])=>void,run:(provider:any,requests:any[])=>Promise<T>,mutate?:(form:any)=>void){
  const candidate={id:'fixed-source',label:base.creature.identity.name,start:0,end:source.length,quote:source};
  const plan=splitStagedMonsterSource({source,sourceSha256:hashSource(source),candidate}),priorFetch=globalThis.fetch,requests:any[]=[];
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);requests.push(payload);
    let answer:any;
    if(payload.source===plan.base.quote)answer=structuredClone(base);
    else if(payload.template&&payload.units){const form=yaml.load(payload.template);fill(form,payload.units);mutate?.(form);answer={markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};}
    else throw Error('No real HTTP, repair or automation operation is permitted');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:priorFetch.preconnect});
  try{
    const actual=legacyWholeFormProvider({model:'fixed-source-fixture'});
    const provider={providerName:actual.providerName,extractionModel:actual.extractionModel,reviewModel:actual.reviewModel,
      discover:async()=>({schemaVersion:1 as const,candidates:[candidate]}),extract:actual.extract.bind(actual),review:actual.review.bind(actual),repair:actual.repair.bind(actual)};
    return await run(provider,requests);
  }finally{globalThis.fetch=priorFetch;}
}
const runCompany=<T>(run:(provider:any,requests:any[])=>Promise<T>,mutate?:(form:any)=>void)=>runFixedSource(company.source,company.recordedBase,fillCompany,run,mutate);

describe('explicit legacy whole-form compatibility; current full-IR controls compare projection only',()=>{
test('Company and current full-IR replay retain neutral attack and explicit outgoing half through the formal chain',async()=>runCompany(async(provider,requests)=>{
  const result=await generateEncounterFromHumanMarkdown({source:company.source,label:'Forge AB Runtime Company 20261020',provider,reviewPolicy:'deferred',
    automationProvider:{generate:async()=>{throw Error('GM source rules must not manufacture a controller');},review:async()=>({verdict:'accepted',findings:[]})}});
  expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(1);expect(requests).toHaveLength(2);
  const actor=result.prepared!.actors[0]!.artifact as any,shred=actor.items.find((item:any)=>item.flags?.fvttJsonGenerator?.manualRule?.sourceOperations?.some((op:any)=>op.attack?.type==='melee'));
  expect(shred.type).not.toBe('weapon');const activities=Object.values<any>(shred.system.activities);
  expect(activities).toHaveLength(2);const roll=activities.find(a=>a.type==='utility')!,damage=activities.find(a=>a.type==='damage')!;
  expect(roll.roll.formula).toBe('1d20+10');expect(roll.range.value).toBe(0);expect(roll.attack).toBeUndefined();
  expect(damage.damage.parts).toHaveLength(1);expect(damage.damage.parts[0]).toMatchObject({number:10,denomination:8,bonus:'4',types:['slashing']});
  expect(damage.flags.fvttJsonGenerator.sourceOperation.damageAdjustment).toMatchObject({multiplier:0.5,actor:'the company'});
  expect(shred.system.description.value).toContain('Bloodied');expect(shred.system.description.value).toContain('Bonus Action');
  expect(damage.activation.type).toBe('special');expect(damage.consumption.targets).toEqual([]);
  const gate=actor.items.find((item:any)=>item.name.includes('Strike-Gate'));expect(gate.system.uses.max).toBe('1');
  const entry=result.report.actors[0]!,generation=entry.generation!,ir=entry.analysis.ir!;
  await assertDefaultFullIrReplay(company.source,ir,{actor,markdown:generation.markdown!});
  const corrupt=structuredClone(actor),changed=corrupt.items[actor.items.indexOf(shred)];Object.values<any>(changed.system.activities).find(a=>a.roll)!.roll.formula='1d20+99';
  expect(verifyMonsterIntake(company.source,ir,generation.markdown!,corrupt,{start:0,end:company.source.length}).findings.some(f=>f.blocking)).toBe(true);
  const midi={modules:{get:(id:string)=>id==='midi-qol'?{active:true,version:'14.0.11'}:undefined}};
  const adapted=prepareFoundryImportArtifact(actor,midi) as any;
  const adaptedActivities=Object.values<any>(adapted.items[actor.items.indexOf(shred)].system.activities);
  expect(adaptedActivities.map(a=>a.type).sort()).toEqual(['damage','utility']);
  for(const activity of adaptedActivities)expect(activity.midiProperties).toMatchObject({otherActivityCompatible:false,triggeredActivityId:'none'});
  expect(()=>assertActorSemantics(adapted,structuredClone(adapted))).not.toThrow();
  expect(()=>prepareFoundryImportArtifact(actor,{modules:{get:()=>({active:true,version:'unverified'})}})).toThrow('unverified Midi');
  for(const mutate of [
    (a:any)=>{Object.values<any>(a.system.activities)[0].flags.fvttJsonGenerator.sourceOperation.role='unknown';},
    (a:any)=>{Object.values<any>(a.system.activities)[0].flags.fvttJsonGenerator.sourceOperation.attackKind='ranged';},
    (a:any)=>{Object.values<any>(a.system.activities)[0].flags.fvttJsonGenerator.sourceOperation.damageAdjustment.multiplier=1;},
    (a:any)=>{Object.values<any>(a.system.activities).find(x=>x.type==='damage')!.flags.fvttJsonGenerator.sourceOperation.relationship='primary';},
    (a:any)=>{const key=Object.keys(a.system.activities)[0]!;a.system.activities.extra=structuredClone(a.system.activities[key]);},
    (a:any)=>{const key=Object.keys(a.system.activities).find(key=>a.system.activities[key].type==='damage')!;delete a.system.activities[key];},
  ]){const bad=structuredClone(actor);mutate(bad.items[actor.items.indexOf(shred)]);expect(()=>prepareFoundryImportArtifact(bad,midi)).toThrow('Unbound source-operation');}
  if(process.env.FORGE_AB_RUNTIME_EVIDENCE_DIR){
    const directory=resolve(process.env.FORGE_AB_RUNTIME_EVIDENCE_DIR);
    if(directory!==resolve('.local/forge-v2-bw-integration-20261020'))throw Error('Runtime evidence must stay in the exact owned directory');
    const stem='company-runtime-'+new Date().toISOString().replace(/[:.]/gu,'-');
    const packagePath=join(directory,stem+'.encounter.json');
    writeFileSync(packagePath,serializeForgeEncounterPackage(result.prepared!.bundle),{flag:'wx'});
    writeFileSync(join(directory,stem+'.source-chain.json'),JSON.stringify({kind:'independent-new-contract-not-frozen-reply',source:company.source,sourceHash:hashSource(company.source),ir,markdown:generation.markdown,actor,report:result.report,packagePath,modelHttp:0,fakeTransportCalls:requests.length,tamperedActorRejected:true},null,2)+'\n',{flag:'wx'});
    console.log('Company runtime package: '+packagePath);
  }
}));

test('whole Company preserves a missing creature target finding alongside the candidate without repairing the reply',async()=>runCompany(async provider=>{
  const candidate={id:'company',label:'Company',start:0,end:company.source.length,quote:company.source};
  const ir=await provider.extract({source:company.source,sourceSha256:hashSource(company.source),candidate});
  expect(ir.uncertainties.map(f=>f.code)).toContain('V2_TARGET_OMITTED');
  expect(ir.creature.actions.some(feature=>feature.sourceOperations?.some(op=>op.type==='save'))).toBe(true);
},form=>{Object.values<any[]>(form).flat().find(row=>row.名称==='Weaverot Volley').豁免.目标限制=null;}));

test('a neutral attack and native Save share one source pool while the damage follow-up consumes nothing',async()=>{
  const source=company.source.replace('Spindly Shred.','Spindly Shred (2/Day). Spindly Shred and Weaverot Volley share 2 daily uses.').replace('Weaverot Volley. A volley','Weaverot Volley (2/Day). A volley');
  await runFixedSource(source,company.recordedBase,(form,units)=>{
    fillCompany(form,units);const rows=Object.values<any[]>(form).flat(),shred=rows.find(row=>row.名称.startsWith('Spindly Shred')),volley=rows.find(row=>row.名称.startsWith('Weaverot Volley'));
    Object.assign(shred,{使用次数:2,恢复方式:'day',共享资源:{名称:'Spindly Shred and Weaverot Volley',上限:2,恢复:'day',限制:null}});
    Object.assign(volley,{使用次数:2,恢复方式:'day'});
  },async provider=>{
    const result=await generateEncounterFromHumanMarkdown({source,label:'Shared Company regression',provider,reviewPolicy:'deferred',
      automationProvider:{generate:async()=>{throw Error('No invented controller');},review:async()=>({verdict:'accepted',findings:[]})}});
    expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');
    const actor=result.prepared!.actors[0]!.artifact as any,shred=actor.items.find((i:any)=>i.name.startsWith('Spindly Shred')),volley=actor.items.find((i:any)=>i.name.startsWith('Weaverot Volley'));
    const rolls=Object.values<any>(shred.system.activities),primary=rolls.find(a=>a.type==='utility')!,damage=rolls.find(a=>a.type==='damage')!,save=Object.values<any>(volley.system.activities)[0]!;
    expect(primary.consumption.targets).toHaveLength(1);expect(save.consumption.targets).toHaveLength(1);
    expect(primary.consumption.targets[0].target).toBe(save.consumption.targets[0].target);expect(primary.consumption.targets[0].value).toBe('1');expect(damage.consumption.targets).toEqual([]);
    expect(shred.system.uses.max).toBe('2');expect(volley.system.uses?.max).not.toBe('2');
  });
});

const vampire=srd.cases.find(c=>c.id==='R4')!,bite=vampire.units.find(unit=>unit.name==='Bite (Bat or Vampire Form Only)')!;
const biteSource=vampire.baseContext.trimEnd()+'\nActions\n'+bite.quote.trimEnd()+'\n';
function fillBite(form:any,units:any[],reference:'id'|'name'){
  const row=form.动作[0],unit=units.find(unit=>unit.id===row.编号),ref=reference==='id'?unit.id:unit.name;
  Object.assign(row,{攻击:{类型:'近战武器攻击',命中加值:9,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one willing creature, or a creature that is grappled by the vampire, incapacitated, or restrained'},
    伤害:[{公式:'1d6+4',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null},{公式:'3d6',伤害类型:'necrotic',生效条件:null,倍率:1,成功时倍率:null}],
    治疗:[{公式:null,取值依据:`等于目标因该次[${ref}]所受死灵伤害的实际数值`,类型:'治疗',目标:'self',生效条件:`[${ref}]命中并造成死灵伤害时`}],特殊规则:unit.quote});
}
for(const reference of ['id','name'] as const)test('historical SRD 5.1 Vampire Bite uses stable '+reference+' and self without a fabricated Heal',async()=>runFixedSource(biteSource,bases.R4,(form,units)=>fillBite(form,units,reference),async(provider,requests)=>{
  const result=await generateEncounterFromHumanMarkdown({source:biteSource,label:'Vampire Bite capability',provider,reviewPolicy:'deferred',
    automationProvider:{generate:async()=>{throw Error('Dynamic HP rules remain explicit GM work');},review:async()=>({verdict:'accepted',findings:[]})}});
  expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');expect(requests).toHaveLength(2);
  const actor=result.prepared!.actors[0]!.artifact as any,entry=result.report.actors[0]!,ir=entry.analysis.ir!,generation=entry.generation!;
  const item=actor.items.find((i:any)=>i.flags?.fvttJsonGenerator?.manualRule?.sourceOperations?.some((op:any)=>op.attack?.type==='mwak'));
  const activities=Object.values<any>(item.system.activities);expect(activities).toHaveLength(1);expect(activities[0].type).toBe('attack');expect(activities[0].damage.parts).toHaveLength(2);
  expect(actor.items.flatMap((i:any)=>Object.values<any>(i.system.activities)).some((a:any)=>a.type==='heal')).toBe(false);
  for(const phrase of ['hit point maximum','regains hit points equal','long rest','vampire spawn'])expect(item.system.description.value.replace(/<br>/gu,' ')).toContain(phrase);
  const corrupt=structuredClone(actor),changed=corrupt.items[actor.items.indexOf(item)];Object.values<any>(changed.system.activities)[0].damage.parts[1].number=99;
  expect(verifyMonsterIntake(biteSource,ir,generation.markdown!,corrupt,{start:0,end:biteSource.length}).findings.some(f=>f.blocking)).toBe(true);
}));

for(const change of ['unbound-owner','wrong-reference','missing-target'])test('historical SRD 5.1 Vampire identity findings survive in a useful unaccepted candidate: '+change,async()=>runFixedSource(biteSource,bases.R4,(form,units)=>fillBite(form,units,'id'),async provider=>{
  const candidate={id:'bite',label:'Bite',start:0,end:biteSource.length,quote:biteSource};
  const ir=await provider.extract({source:biteSource,sourceSha256:hashSource(biteSource),candidate});
  expect(ir.uncertainties.some(f=>f.blocking)).toBe(true);
  expect(ir.creature.actions[0]!.sourceOperations![0]!.damage).toHaveLength(2);
  expect(ir.creature.actions[0]!.sourceOperations!.some(op=>op.type==='heal')).toBe(false);
},form=>{
  const row=form.动作[0];if(change==='unbound-owner')row.治疗[0].目标='吸血鬼';
  if(change==='wrong-reference')row.治疗[0].取值依据='等于目标因该次[Children of the Night]所受死灵伤害的实际数值';
  if(change==='missing-target')row.攻击.目标限制=null;
}));
});

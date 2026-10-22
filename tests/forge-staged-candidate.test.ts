import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {candidateSourceOperationShapeErrors,isSourceCandidateReview} from '@fvtt-json-generator/models/source-operations';
import fixture from './fixtures/forge-damage-upgrade.json';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source=fixture.case.units[0]!.text+'Actions\nNeedle (2/Day). Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\n';
const request={source,sourceSha256:hashSource(source),candidate:{id:'candidate',label:'candidate',start:0,end:source.length,quote:source}};
const plan=splitStagedMonsterSource(request);
const base=()=>({schemaVersion:1,creature:structuredClone(fixture.case.creature),uncertainties:[]});
function whole(payload:any,toHit=6,target=1){
  const form=yaml.load(payload.template) as any;
  Object.assign(form.动作[0],{攻击:{类型:'近战武器攻击',命中加值:toHit,触及尺:5,射程尺:null,远射程尺:null,目标数量:target,目标限制:'one creature'},
    伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}],使用次数:2,恢复方式:'每天'});
  return{markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
}
function wrongRecovery(payload:any){const value=whole(payload),form=yaml.load(value.markdown) as any;form.动作[0].恢复方式='longRest';return{markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};}
async function extract(options:{preserveCandidates?:boolean;maxCorrections?:0|1}={},answer?:(stage:any,count:number)=>unknown){
  const calls:any[]=[],counts={base:0,feature:0};
  const ir=await runStagedMonsterExtraction(request,async stage=>{
    calls.push(stage);await stage.onAttempt(1);
    const count=++counts[stage.stage as 'base'|'feature'];
    const value=answer?answer(stage,count):stage.stage==='base'?base():whole(stage.payload,999);
    if(value instanceof Error)throw value;
    stage.onResponseText?.(JSON.stringify(value));return value;
  },{baseMode:'facts',featureMode:'whole-v2',...options});
  return{ir,calls};
}
async function generated(ir:Awaited<ReturnType<typeof extract>>['ir']){
  const markdown=renderMonsterIntakeMarkdown(ir);
  const response=await convertFinalActorSource(buildForgeActorRequest({content:markdown,displayName:'candidate',requestId:'preserved-candidate',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  expect('result'in response).toBe(true);
  if(!('result'in response))throw Error('Missing result');
  return response.result;
}

test('strict source check remains strict unless candidate preservation is requested',async()=>{
  await expect(extract()).rejects.toThrow();
});
for(const settings of [{toHit:999,target:1},{toHit:6,target:2},{toHit:-4,target:1}])test('typed suspect operations keep damage, counts and original proposal '+JSON.stringify(settings),async()=>{
  const{ir,calls}=await extract({preserveCandidates:true},s=>s.stage==='base'?base():whole(s.payload,settings.toHit,settings.target));
  expect(calls).toHaveLength(2);expect(ir.uncertainties.some(f=>f.blocking)).toBe(true);
  const feature=ir.creature.actions[0]!;
  expect(feature.sourceOperations?.[0]?.attack?.toHit).toBe(settings.toHit);
  expect(feature.sourceOperations?.[0]?.damage).toEqual([{formula:'1d8+3',type:'piercing',relationship:'base'}]);
  expect(feature.uses).toEqual({max:2,period:'day'});
  expect((feature.candidateReview?.proposal as any).攻击.目标数量).toBe(settings.target);
  expect(validateMonsterIntakeIR(source,ir).blocking.length).toBeGreaterThan(0);
  const result=await generated(ir),actor=(result as any).artifact;
  expect(actor,JSON.stringify(result)).toBeDefined();expect(result.status).not.toBe('accepted');
  const item=actor.items.find((i:any)=>i.flags?.fvttJsonGenerator?.candidateReview);
  expect(item.system.uses.max).toBe('2');expect(item.system.description.value).toContain('one creature');
  const activity=Object.values<any>(item.system.activities).find(a=>a.type==='attack');
  expect(activity).toBeDefined();expect(activity.damage.parts[0]).toMatchObject({number:1,denomination:8,bonus:'3'});
  expect(item.flags.fvttJsonGenerator.candidateReview.proposal.攻击.命中加值).toBe(settings.toHit);
});

test('one failed correction retains the original readable candidate and both failures without a third whole request',async()=>{
  const{ir,calls}=await extract({preserveCandidates:true,maxCorrections:1},(s,count)=>s.stage==='base'?base():count===1?wrongRecovery(s.payload):{markdown:'动作: ['});
  expect(calls,JSON.stringify(ir.uncertainties)).toHaveLength(3);expect(calls.filter(c=>c.payload.correction)).toHaveLength(1);
  expect(ir.creature.actions[0]!.sourceOperations![0]!.attack!.toHit).toBe(6);
  expect(ir.creature.actions[0]!.uses).toEqual({max:2,period:'longRest'});
  expect(ir.uncertainties.map(f=>f.code)).toContain('V2_YAML');
  expect(ir.uncertainties.some(f=>f.code!=='V2_YAML')).toBe(true);
});

test('a failed correction transport preserves an already decoded candidate',async()=>{
  const{ir,calls}=await extract({preserveCandidates:true,maxCorrections:1},(s,count)=>s.stage==='base'?base():count===1?wrongRecovery(s.payload):new Error('offline transport'));
  expect(calls,JSON.stringify(ir.uncertainties)).toHaveLength(3);expect(ir.uncertainties.map(f=>f.code)).toContain('MODEL_CORRECTION_FAILED');
  expect(ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.formula).toBe('1d8+3');
});

test('an unreadable original whole reply keeps its readable but disputed correction with both diagnoses',async()=>{
  const{ir,calls}=await extract({preserveCandidates:true,maxCorrections:1},(s,count)=>s.stage==='base'?base():count===1?{markdown:'动作: ['}:wrongRecovery(s.payload));
  expect(calls).toHaveLength(3);expect(ir.uncertainties.map(f=>f.code)).toContain('V2_YAML');
  expect(ir.uncertainties.map(f=>f.code)).toContain('V2_RECOVERY_CONFLICT');
  expect(ir.creature.actions[0]!.sourceOperations![0]!.damage).toHaveLength(1);
});

test('root source findings survive rendering and regeneration even when no feature carries a candidate marker',async()=>{
  const{ir}=await extract({preserveCandidates:true},s=>{if(s.stage==='feature')return whole(s.payload);const value=base();value.creature.attributes.hp.value+=1;return value;});
  expect(ir.creature.actions.every(feature=>!feature.candidateReview)).toBe(true);
  const first=await generated(ir),second=await generated(ir);
  expect(first.status).not.toBe('accepted');expect(second.status).not.toBe('accepted');
  expect((first as any).artifact.flags.fvttJsonGenerator.candidateReview).toEqual((second as any).artifact.flags.fvttJsonGenerator.candidateReview);
  expect((first as any).artifact.flags.fvttJsonGenerator.candidateReview.proposal.source).toBe(source);
  expect(first.diagnostics.map(f=>f.code)).toContain('GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED');
});

async function customSource(text:string,fill:(form:any)=>void){
  return runStagedMonsterExtraction({source:text,sourceSha256:hashSource(text),candidate:{id:'custom',label:'custom',start:0,end:text.length,quote:text}},async stage=>{
    await stage.onAttempt(1);if(stage.stage==='base')return base();
    const form=yaml.load(stage.payload.template as string) as any;fill(form);return{markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
  },{baseMode:'facts',featureMode:'whole-v2',preserveCandidates:true,maxCorrections:0});
}
function fillAttack(row:any,toHit=6){Object.assign(row,{攻击:{类型:'近战武器攻击',命中加值:toHit,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'},伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});}
test('a separate doubtful feature cannot detach a correctly bound shared-use pool',async()=>{
  const text=fixture.case.units[0]!.text+'Actions\nNeedle (2/Day). Needle and Lance share 2 daily uses. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\nLance (2/Day). Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\nDoubt. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\n';
  const ir=await customSource(text,form=>{for(const row of form.动作){fillAttack(row,row.名称==='Doubt'?999:6);if(row.名称!=='Doubt')Object.assign(row,{使用次数:2,恢复方式:'day'});if(row.名称.startsWith('Needle'))row.共享资源={名称:'Needle and Lance',上限:2,恢复:'day',限制:null};}});
  expect(ir.uncertainties.some(f=>f.blocking)).toBe(true);expect(ir.creature.sourceResourcePools).toHaveLength(1);
  const actor=(await generated(ir)as any).artifact,needle=actor.items.find((i:any)=>i.name.startsWith('Needle')),lance=actor.items.find((i:any)=>i.name.startsWith('Lance'));
  const a=Object.values<any>(needle.system.activities)[0]!,b=Object.values<any>(lance.system.activities)[0]!;
  expect(a.consumption.targets[0].target).toBe(b.consumption.targets[0].target);
  expect([needle,lance].filter(i=>i.system.uses?.max==='2')).toHaveLength(1);
});
test('a separate doubtful feature cannot lose an independently source-bound cross-feature damage upgrade',async()=>{
  const text=fixture.case.source+'Actions\nDoubt. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\n';
  const ir=await customSource(text,form=>{for(const row of form.特性)row.特殊规则=fixture.case.features.find(feature=>feature.name===row.名称)!.text;fillAttack(form.动作[0],999);});
  const upgraded=ir.creature.traits.find(f=>f.name===fixture.case.features[0]!.name)!;
  expect(upgraded.sourceOperations?.[0]?.proof.upgrade).toBeDefined();expect(upgraded.sourceOperations![0]!.damage![0]!.formula).toBe('2d8');
  const actor=(await generated(ir)as any).artifact,item=actor.items.find((i:any)=>i.name===upgraded.name);
  expect(Object.values<any>(item.system.activities)[0]!.damage.parts[0].number).toBe(2);
});
test('unknown recovery keeps an actual counter with manual recovery instead of inventing daily recovery',async()=>{
  const text=source.replace('(2/Day)','(2/Week)');
  const ir=await customSource(text,form=>{fillAttack(form.动作[0]);Object.assign(form.动作[0],{使用次数:2,恢复方式:'每周'});});
  expect(ir.creature.actions[0]!.uses).toBeUndefined();expect(ir.creature.actions[0]!.candidateCounters).toEqual([{name:'Needle (2/Week)',max:2,recovery:'每周'}]);
  const actor=(await generated(ir)as any).artifact,item=actor.items.find((i:any)=>i.name.startsWith('Needle'));
  expect(item.system.uses).toMatchObject({max:'2',recovery:[]});
});
test('unsupported weekly spell grants keep GM counters without reinterpreting them as daily native Casts',async()=>{
  const text=fixture.case.units[0]!.text+'Actions\nSpellcasting. The sentinel casts the following spells using Wisdom as the spellcasting ability (spell save DC 12):\n2/week: Fireball\n';
  const ir=await customSource(text,form=>{Object.assign(form.动作[0],{施法:{属性:'wis',豁免DC:12,命中加值:null,无需材料:false,法术:[{名称:'Fireball',次数:2,恢复:'每周',限制:null}]}});});
  const actor=(await generated(ir)as any).artifact,item=actor.items.find((i:any)=>i.name==='Spellcasting');
  expect(item).toBeDefined();const activities=Object.values<any>(item.system.activities);
  expect(activities.some(a=>a.type==='cast')).toBe(false);
  expect(activities.find(a=>a.uses?.max==='2').uses.recovery).toEqual([]);
  expect(activities.find(a=>a.uses?.max==='2').name).toContain('GM次数');
  expect(item.flags.fvttJsonGenerator.candidateReview.proposal.施法.法术[0].恢复).toBe('每周');
});

test('base number doubts retain the model number, full source and usable features with zero correction requests',async()=>{
  const{ir,calls}=await extract({preserveCandidates:true},s=>{if(s.stage==='feature')return whole(s.payload);const value=base();value.creature.attributes.hp.value+=1;return value;});
  expect(calls).toHaveLength(2);expect(ir.creature.attributes.hp.value).toBe(base().creature.attributes.hp.value+1);
  expect(ir.uncertainties.some(f=>f.blocking)).toBe(true);expect(ir.creature.actions[0]).toBeDefined();
  expect((await generated(ir))as any).toHaveProperty('artifact');
});

test('unreadable YAML remains an honest no-candidate result and does not become an empty actor',async()=>{
  await expect(extract({preserveCandidates:true},s=>s.stage==='base'?base():{markdown:'动作: ['})).rejects.toThrow();
});

test('candidate metadata cannot grant automatic source acceptance or unsafe operation shapes',()=>{
  expect(isSourceCandidateReview({version:1,findings:[],proposal:{}})).toBe(false);
  const metadata={version:1,findings:[{code:'REVIEW',path:'/test',message:'review'}],proposal:{constructor:'unsafe'}};
  expect(isSourceCandidateReview(metadata)).toBe(false);
  expect(candidateSourceOperationShapeErrors([{id:'bad',name:'bad',sourceText:'source',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:NaN},proof:{attack:'source'}}])).not.toEqual([]);
});

const brassRoot='.local/forge-new-three-paired-20261022';
const brassPaths=[brassRoot+'/N3/source.md',brassRoot+'/frozen-model-calls/forge-N3-7-reply-0.txt',brassRoot+'/frozen-model-calls/forge-N3-8-reply-0.txt'];
const localFrozenTest=brassPaths.every(path=>existsSync(path))?test:test.skip;
localFrozenTest('unchanged local frozen 2024 Brass Dragon passes source-bound checks with no correction',async()=>{
  const originals=brassPaths.map(path=>readFileSync(path)),hashes=originals.map(bytes=>createHash('sha256').update(bytes).digest('hex'));
  const text=originals[0]!.toString('utf8').replace(/^\uFEFF/u,''),replies=originals.slice(1).map(bytes=>JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,'')));
  const calls:string[]=[];
  const ir=await runStagedMonsterExtraction({source:text,sourceSha256:hashSource(text),candidate:{id:'brass',label:'Adult Brass Dragon',start:0,end:text.length,quote:text}},async stage=>{
    calls.push(stage.stage);await stage.onAttempt(1);return replies[stage.stage==='base'?0:1];
  },{baseMode:'facts',featureMode:'whole-v2',preserveCandidates:true,maxCorrections:0});
  expect(calls).toEqual(['base','feature']);
  expect(ir.uncertainties).toEqual([]);
  const result=await generated(ir),actor=(result as any).artifact;
  expect(actor,JSON.stringify(result.diagnostics)).toBeDefined();expect(result.status).toBe('accepted');
  const rend=actor.items.find((item:any)=>item.name==='Rend'),rendActivities=Object.values<any>(rend.system.activities);
  expect(rendActivities.some(a=>a.type==='utility')).toBe(true);
  expect(rendActivities.find(a=>a.type==='damage').damage.parts).toHaveLength(2);
  const sands=actor.items.find((item:any)=>item.name==='Scorching Sands');
  expect(Object.values<any>(sands.system.activities).some(a=>a.type==='save'&&a.save.dc.formula==='16')).toBe(true);
  expect(sands.system.description.value).toContain('Speed is halved');
  expect(actor.items.find((item:any)=>item.name==='Legendary Resistance (3/Day, or 4/Day in Lair)').system.uses?.max).toBeUndefined();
  expect(actor.system.resources.legres.max).toBe(3);
  expect(ir.creature.spellcasting?.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs)).length).toBeGreaterThan(0);
  expect(brassPaths.map(path=>createHash('sha256').update(readFileSync(path)).digest('hex'))).toEqual(hashes);
});

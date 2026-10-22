import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {analyzeBrowserActorSourceWithAi,analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate,repairBrowserActorIntake} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import damageUpgrade from './fixtures/forge-damage-upgrade.json';
import headerFixtures from './fixtures/forge-v2-bw-base-facts.json';
import srd from './fixtures/forge-template-repeat-v2-srd.json';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {sourceOperationFeatureErrors} from '../packages/intake-ai/src/staged-feature-mechanics';
import {MonsterIntakeProviderError} from '@fvtt-json-generator/intake-ai/provider';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';

const source=damageUpgrade.case.units[0]!.text+'Actions\nNeedle. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\n';
const candidate={id:'single',label:'single',start:0,end:source.length,quote:source};
const plan=splitStagedMonsterSource({source,sourceSha256:hashSource(source),candidate});
async function fixture<T>(run:(env:{provider:ReturnType<typeof createEncounterIntakeProviders>['provider'];stages:any[];requests:any[];sink:any[];controller:AbortController})=>Promise<T>,mutate?:(form:any)=>void,abortBase=false){
  const originalFetch=globalThis.fetch,requests:any[]=[],stages:any[]=[],sink:any[]=[],controller=new AbortController();
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);requests.push(payload);
    let answer:unknown;
    if(payload.source===plan.base.quote){
      answer={schemaVersion:1,creature:structuredClone(damageUpgrade.case.creature),uncertainties:[]};
      if(abortBase)controller.abort();
    }else if(payload.units&&payload.template){
      expect(payload.units).toHaveLength(1);expect(payload.sourceInventory).toHaveLength(1);expect(payload.baseContext).toBe(plan.base.quote);
      const form=yaml.load(payload.template) as any,row=form.动作[0];
      Object.assign(row,{攻击:{类型:'近战武器攻击',命中加值:6,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'},
        伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});
      mutate?.(form);answer={markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
    }else throw Error('No real network or unexpected repair/automation operation is permitted');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:originalFetch.preconnect});
  try{
    const {provider}=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'test-only',model:'fixture',protocol:'openai-chat',timeoutMs:10000,
      onExtractionStage:entry=>{stages.push(entry);},responseEvidence:{record:entry=>{sink.push(entry);}}},controller.signal);
    return await run({provider,requests,stages,sink,controller});
  }finally{globalThis.fetch=originalFetch;}
}

test('actual encounter provider uses base + ONE whole form and reaches browser workflow and package preparation',async()=>fixture(async({provider,requests,stages,sink})=>{
  const fixed={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:provider.reviewModel,
    discover:async()=>({schemaVersion:1 as const,candidates:[candidate]}),extract:provider.extract.bind(provider),review:provider.review.bind(provider),repair:provider.repair.bind(provider)};
  const input={source,sourceName:'Needle',requestId:'bw-browser-chain',fvttVersion:'14.364',systemVersion:'5.3.3'};
  const analysis=await analyzeBrowserActorSourceWithAi(input,fixed);
  expect(analysis.findings).toEqual([]);
  expect(analysis.status).toBe('ready_to_generate');
  const generation=await generateBrowserActorIntakeCandidate(input,analysis,fixed);
  expect(generation.status).toBe('ready_for_gm_review');
  expect(generation.intakeVerificationStatus).toBe('accepted');
  expect(requests).toHaveLength(2);expect(sink).toHaveLength(2);
  expect(stages.filter(s=>s.status==='request').map(s=>[s.stage,s.unitId])).toEqual([['base',plan.base.id],['feature','all']]);
  expect(stages.at(-1)).toMatchObject({stage:'assembly',plannedCalls:2,retryCalls:0,status:'validated'});
  const bundle={schema:'fvtt-json-forge-encounter',version:1,id:'bw-browser-chain',label:'Needle',target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},
    primaryActorKey:'main',actors:[{key:'main',label:'Needle',source:generation.markdown,sourceHash:hashSource(generation.markdown!)}],macros:[],assets:[]};
  const prepared=await prepareForgeEncounter(JSON.stringify(bundle));expect(prepared.actors).toHaveLength(1);
}));
test('wrong whole-form number remains a review finding and a usable candidate; raw response remains captured',async()=>fixture(async({provider,requests,sink})=>{
  const ir=await provider.extract({source,sourceSha256:hashSource(source),candidate});
  expect(ir.uncertainties.some(f=>f.blocking)).toBe(true);
  expect(ir.creature.actions[0]!.sourceOperations![0]!.attack!.toHit).toBe(999);
  expect(requests).toHaveLength(2);expect(sink).toHaveLength(2);expect(sink[1].content).toContain('999');
},form=>{form.动作[0].攻击.命中加值=999;}));
test('cancellation after base does not issue the whole request or silently switch to A',async()=>fixture(async({provider,requests})=>{
  await expect(provider.extract({source,sourceSha256:hashSource(source),candidate})).rejects.toThrow();
  expect(requests).toHaveLength(1);
},undefined,true));

test('browser diagnostics expose independently blocked features and filter private related text',async()=>fixture(async({provider})=>{
  const error=new MonsterIntakeProviderError('invalid_response','private payload',{stagedDiagnostic:{stage:'response',code:'V2_ATTACK_CLASSIFICATION_UNSUPPORTED',path:'/features/unit-1/attack',related:[
    {code:'V2_TARGET_OMITTED',path:'/features/unit-2/target'},
    {code:'private secret',path:'/features/private secret'},
    {code:'V2_INVALID',path:'/features/?api_key=private-secret'},
  ]}});
  const fixed={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:provider.reviewModel,
    discover:async()=>({schemaVersion:1 as const,candidates:[candidate]}),extract:async()=>{throw error;},review:provider.review.bind(provider),repair:provider.repair.bind(provider)};
  const result=await analyzeBrowserActorSourceWithAi({source,sourceName:'diagnostic fixture',requestId:'diagnostic-batch',fvttVersion:'14.364',systemVersion:'5.3.3'},fixed);
  expect(result.status).toBe('failed');expect(result.ir).toBeUndefined();expect(result.findings).toHaveLength(2);
  expect(result.findings[1]).toMatchObject({code:'V2_TARGET_OMITTED',path:'/features/unit-2/target',blocking:true});
  expect(JSON.stringify(result)).not.toContain('private');expect(Object.isFrozen(error.stagedDiagnostic?.related)).toBe(true);
}));
test('human Markdown encounter entry consumes BW provider result without another extraction',async()=>fixture(async({provider,requests})=>{
  const result=await generateEncounterFromHumanMarkdown({source,label:'Needle',provider,
    automationProvider:{generate:async()=>{throw Error('Pure native source must not need invented automation');},review:async()=>({verdict:'accepted',findings:[]})},reviewPolicy:'deferred'});
  expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(1);expect(requests).toHaveLength(2);
}));

test('source-proven self radius stays Self through the browser workflow instead of a movable ft range',async()=>{
  const actorName=damageUpgrade.case.creature.identity.name;
  const text=damageUpgrade.case.units[0]!.text+`Actions\nRing. Each creature within 15 feet of the ${actorName} must make a DC 12 Wisdom saving throw, taking 7 (2d6) psychic damage on a failed save, or half as much damage on a successful one.\n`;
  await fixture(async({provider})=>{
    const ir=await provider.extract({source:text,sourceSha256:hashSource(text),candidate:{id:'ring',label:'Ring',start:0,end:text.length,quote:text}});
    const input={source:text,sourceName:'Ring',requestId:'bw-self-radius',fvttVersion:'14.364',systemVersion:'5.3.3'};
    const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    expect(analysis.status).toBe('ready_to_generate');
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    expect(generated.status).toBe('ready_for_gm_review');
    const activities=(generated.actorProjection as any).items.flatMap((i:any)=>Object.values<any>(i.system.activities));
    expect(activities[0].range.units).toBe('self');expect(activities[0].target.template.size).toBe('15');
  },form=>Object.assign(form.动作[0],{攻击:null,豁免:{DC:12,属性:['wis'],成功结果:'half damage',目标限制:`Each creature within 15 feet of the ${actorName}`},
    范围:{形状:'半径',大小尺:15,距离尺:null,中心:actorName},伤害:[{公式:'2d6',伤害类型:'psychic',生效条件:'failed save',倍率:1,成功时倍率:0.5}]}));
});

test('Actor origin with an awareness qualifier is accepted while target/effect origins stay blocked',()=>{
  const build=(origin:string)=>{
    const quote=`Each creature within 120 feet of the ${origin} and aware of it must succeed on a DC 21 Wisdom saving throw or become frightened for 1 minute.`;
    return {name:'Presence',description:quote,activityType:'utility' as const,executionMode:'native-with-gm' as const,nativeRuleText:quote,manualRemainder:quote,
      sourceOperations:[{id:'save',name:'Save',type:'save' as const,relationship:'primary' as const,sourceText:quote,range:120,targetSpecial:`Each creature within 120 feet of the ${origin} and aware of it`,
        save:{dc:21,abilities:['wis' as const],choice:'single' as const,outcome:'none' as const},proof:{save:quote,range:quote,target:quote}}]};
  };
  expect(sourceOperationFeatureErrors(build('dragon'),'Ancient Red Dragon').filter(e=>e.field.endsWith('/range'))).toEqual([]);
  for(const origin of ['target','flash','dragon statue'])expect(sourceOperationFeatureErrors(build(origin),'Ancient Red Dragon').some(e=>e.field.endsWith('/range'))).toBe(true);
});

test('source-bound actual-damage recovery retains native damage and full GM consequences without a Heal',async()=>{
  const name=damageUpgrade.case.creature.identity.name;
  const text=damageUpgrade.case.units[0]!.text+`Actions\nDrain. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage plus 7 (2d6) necrotic damage. The target's hit point maximum is reduced by an amount equal to the necrotic damage taken, and the ${name} regains hit points equal to that amount. The reduction lasts until the target finishes a long rest. The target dies if this effect reduces its hit point maximum to 0.\n`;
  await fixture(async({provider})=>{
    const ir=await provider.extract({source:text,sourceSha256:hashSource(text),candidate:{id:'drain',label:'Drain',start:0,end:text.length,quote:text}});
    const action=ir.creature.actions![0]!;
    expect(action.manualRemainder).toContain('regains hit points equal to that amount');
    expect(action.healing).toBeUndefined();expect(action.sourceOperations?.map(o=>o.type)).toEqual(['attack']);
    const input={source:text,sourceName:'Drain',requestId:'bw-dynamic-literal',fvttVersion:'14.364',systemVersion:'5.3.3'};
    const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);expect(analysis.status).toBe('ready_to_generate');
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    expect(generated.status).toBe('ready_for_gm_review');expect(generated.intakeVerificationStatus).toBe('accepted');
    const items=(generated.actorProjection as any).items,activities=items.flatMap((i:any)=>Object.values<any>(i.system.activities));
    expect(activities.some((a:any)=>a.type==='heal')).toBe(false);
    expect(activities.some((a:any)=>a.type==='attack'&&a.damage.parts.length===2)).toBe(true);
    expect(items.some((i:any)=>i.system.description.value.includes('hit point maximum to 0'))).toBe(true);
    expect(items.some((i:any)=>i.system.description.value.includes('finishes a long rest'))).toBe(true);
  },form=>Object.assign(form.动作[0],{名称:'Drain',伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null},{公式:'2d6',伤害类型:'necrotic',生效条件:null,倍率:1,成功时倍率:null}],
    治疗:[{公式:null,取值依据:'等于目标实际受到的死灵伤害量',类型:'治疗',目标:'自身',生效条件:'命中时'}],特殊规则:'目标生命值上限降低，直到完成长休；上限降至0时死亡，恢复等于实际死灵伤害的生命值。'}));
});

for(const shape of [
  {type:'近战攻击',header:'Melee Attack Roll: +6, reach 0 ft.',reach:0,range:null,long:null,target:null},
  {type:'远程攻击',header:'Ranged Attack Roll: +6, range 30/60 ft., one object.',reach:null,range:30,long:60,target:'one object'},
  {type:'近战武器攻击',header:'Melee Weapon Attack: +6 to hit, reach 5 ft., one creature.',reach:5,range:null,long:null,target:'one creature'},
  {type:'近战攻击',header:'Melee Attack Roll: +6, reach 5 ft., one creature.',reach:5,range:null,long:null,target:'one creature',uses:2},
] as const)test('neutral/native outgoing half branches reach formal generation without doubled damage: '+shape.type+('uses'in shape?' limited daily':''),async()=>{
  const name=damageUpgrade.case.creature.identity.name;
  const text=damageUpgrade.case.units[0]!.text+`Actions\nNeedle${'uses'in shape?' (2/Day)':''}. ${shape.header} Hit: 7 (1d8+3) piercing damage, or half as much damage if the ${name} is Bloodied, and the target is Grappled (escape DC 18).\n`;
  const request={source:text,sourceSha256:hashSource(text),candidate:{id:'neutral',label:'Neutral',start:0,end:text.length,quote:text}};
  await fixture(async({provider})=>{
    const ir=await provider.extract(request),op=ir.creature.actions![0]!.sourceOperations![0]!;
    expect(op.damage).toHaveLength(1);expect(op.damageAdjustment).toMatchObject({multiplier:0.5,condition:'source-actor-bloodied',actor:'the '+name});
    const input={source:text,sourceName:'Neutral',requestId:'neutral-'+shape.type,fvttVersion:'14.364',systemVersion:'5.3.3'};
    const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);expect(analysis.status).toBe('ready_to_generate');
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);expect(generated.status).toBe('ready_for_gm_review');
    const actor=generated.actorProjection as any,items=actor.items.filter((i:any)=>i.flags?.fvttJsonGenerator?.manualRule?.sourceOperations),activities=items.flatMap((i:any)=>Object.values<any>(i.system.activities));
    const neutral=shape.type!=='近战武器攻击';
    expect(activities).toHaveLength(neutral?2:1);
    expect(activities.filter((a:any)=>a.damage?.parts?.length)).toHaveLength(1);
    const damage=activities.find((a:any)=>a.damage?.parts?.length)!;
    expect(damage.damage.parts).toHaveLength(1);expect(damage.damage.parts[0]).toMatchObject({number:1,denomination:8,bonus:'3'});
    expect(damage.flags.fvttJsonGenerator.sourceOperation.damageAdjustment.multiplier).toBe(0.5);
    expect(items[0].system.description.value).toContain('Bloodied');expect(items[0].system.description.value).toContain('escape DC 18');
    if(neutral){
      const roll=activities.find((a:any)=>a.type==='utility')!;
      expect(roll.roll).toEqual({formula:'1d20+6',name:'GM辅助攻击检定',prompt:true,visible:false});
      expect(roll.attack).toBeUndefined();expect(roll.range.value).toBe(shape.range??shape.reach);
      expect(damage.activation.type).toBe('special');expect(damage.consumption.targets).toEqual([]);
      expect(roll.target.affects.type).toBe(shape.target==='one object'?'object':shape.target==='one creature'?'creature':'any');
      if('uses'in shape){expect(roll.consumption.targets).toHaveLength(1);expect(roll.consumption.targets[0].value).toBe('1');expect(items[0].system.uses.max).toBe('2');}
    }
    for(const mutate of [
      (a:any)=>{const activity=a.items.flatMap((i:any)=>Object.values<any>(i.system.activities)).find((x:any)=>x.flags?.fvttJsonGenerator?.sourceOperation?.damageAdjustment);activity.flags.fvttJsonGenerator.sourceOperation.damageAdjustment.multiplier=1;},
      (a:any)=>{const activity=a.items.flatMap((i:any)=>Object.values<any>(i.system.activities)).find((x:any)=>x.damage?.parts?.length);activity.damage.parts.push(structuredClone(activity.damage.parts[0]));},
    ]){
      const corrupt=structuredClone(actor);mutate(corrupt);expect(verifyMonsterIntake(text,ir,generated.markdown!,corrupt,request.candidate).findings.some(f=>f.blocking)).toBe(true);
    }
    if(neutral){const corrupt=structuredClone(actor),roll=corrupt.items.flatMap((i:any)=>Object.values<any>(i.system.activities)).find((a:any)=>a.roll);roll.roll.formula='1d20+99';expect(verifyMonsterIntake(text,ir,generated.markdown!,corrupt,request.candidate).findings.some(f=>f.blocking)).toBe(true);}
    if(neutral)for(const mutate of [
      (a:any)=>{a.consumption.spellSlot=true;},(a:any)=>{a.consumption.scaling.allowed=true;},
      (a:any)=>{a.target.template={type:'sphere',size:'30',units:'ft'};},(a:any)=>{a.target.affects.count='99';},
      (a:any)=>{a.target.override=false;},(a:any)=>{a.flags.fvttJsonGenerator.sourceOperation.attackClassification='weapon';},
    ]){
      const corrupt=structuredClone(actor),damage=corrupt.items.flatMap((i:any)=>Object.values<any>(i.system.activities)).find((a:any)=>a.type==='damage');mutate(damage);
      expect(verifyMonsterIntake(text,ir,generated.markdown!,corrupt,request.candidate).findings.some(f=>f.blocking)).toBe(true);
    }
  },form=>Object.assign(form.动作[0],{...('uses'in shape?{使用次数:shape.uses,恢复方式:'day'}:{}),攻击:{类型:shape.type,命中加值:6,触及尺:shape.reach,射程尺:shape.range,远射程尺:shape.long,目标数量:1,目标限制:shape.target},
    伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:'自身未处于Bloodied时',倍率:1,成功时倍率:null},{公式:'1d8+3',伤害类型:'piercing',生效条件:'自身处于Bloodied时',倍率:0.5,成功时倍率:null}],特殊规则:'自身处于Bloodied时本次造成的伤害减半；目标被擒抱，逃脱DC18。'}));
});

test('BW fills only absent schema-derived proficiency from source-checked CR, never overwrites a conflicting value',async()=>{
  const text=srd.cases[0]!.baseContext+'\nActions\nNeedle. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage.\n';
  const request={source:text,sourceSha256:hashSource(text),candidate:{id:'high-cr',label:'high-cr',start:0,end:text.length,quote:text}},stages:any[]=[];
  const call=async(stage:any)=>{
    await stage.onAttempt(1);if(stage.stage==='base')return structuredClone(headerFixtures.R3);
    const form=yaml.load(stage.payload.template) as any;
    Object.assign(form.动作[0],{攻击:{类型:'近战武器攻击',命中加值:6,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'},
      伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});return {markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
  };
  const ir=await runStagedMonsterExtraction(request,call,{baseMode:'facts',featureMode:'whole-v2',onStage:e=>{stages.push(e);}});
  expect(ir.creature.attributes.proficiencyBonus).toBe(7);
  expect(ir.claims.find(c=>c.path==='/creature/attributes/proficiencyBonus')?.valueKind).toBe('derived');
  expect(stages.some(s=>s.derivedFacts?.includes('/creature/attributes/proficiencyBonus'))).toBe(true);
  const wrong=structuredClone(headerFixtures.R3) as any;wrong.creature.attributes.proficiencyBonus=8;
  await expect(runStagedMonsterExtraction(request,async()=>wrong,{baseMode:'facts',featureMode:'whole-v2'})).rejects.toThrow('UNPROVEN_BASE_NUMBER');
});


async function correctionFixture<T>(answers:(stage:'base'|'feature',attempt:number,payload:any)=>unknown,
  run:(env:{provider:ReturnType<typeof createEncounterIntakeProviders>['provider'];fixed:any;requests:any[];stages:any[];sink:any[]})=>Promise<T>,text=source){
  const originalFetch=globalThis.fetch,requests:any[]=[],stages:any[]=[],sink:any[]=[],counts={base:0,feature:0};
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);requests.push(payload);
    const stage=payload.template?'feature':'base';
    const answer=answers(stage,++counts[stage],payload);
    if(answer instanceof Error)throw answer;
    return new Response(JSON.stringify({choices:[{message:{content:typeof answer==='string'?answer:JSON.stringify(answer)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:originalFetch.preconnect});
  try{
    const {provider}=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'test-only',model:'fixture',protocol:'openai-chat',timeoutMs:10000,autoCorrect:true,
      onExtractionStage:entry=>{stages.push(entry);},responseEvidence:{record:entry=>{sink.push(entry);}}});
    const fixed={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:provider.reviewModel,
      getExtractionCorrectionCount:provider.getExtractionCorrectionCount!.bind(provider),
      discover:async()=>({schemaVersion:1 as const,candidates:[{...candidate,end:text.length,quote:text}]}),
      extract:provider.extract.bind(provider),review:provider.review.bind(provider),repair:provider.repair.bind(provider)};
    return await run({provider,fixed,requests,stages,sink});
  }finally{globalThis.fetch=originalFetch;}
}
const correctionBase=()=>({schemaVersion:1,creature:structuredClone(damageUpgrade.case.creature),uncertainties:[]});
function correctionWhole(payload:any){
  const form=yaml.load(payload.template) as any;
  Object.assign(form.动作[0],{攻击:{类型:'近战武器攻击',命中加值:6,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'},
    伤害:[{公式:'1d8+3',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});
  return {markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})};
}
const correctionInput={source,sourceName:'Needle',requestId:'pre-ir-correction',fvttVersion:'14.364',systemVersion:'5.3.3'};

test('one malformed base correction retains the reply and source, then passes only the original whole stage',async()=>correctionFixture(
  (stage,attempt,payload)=>stage==='base'&&attempt===1?{schemaVersion:1,creature:{},uncertainties:[]}:stage==='base'?correctionBase():correctionWhole(payload),
  async({provider,fixed,requests,stages,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('ready_to_generate');expect(analysis.repairCount).toBe(1);expect(analysis.calls.repair).toBe(1);
    expect(requests).toHaveLength(3);expect(requests.map(r=>!!r.template)).toEqual([false,false,true]);expect(sink).toHaveLength(3);
    expect(requests[1].source).toBe(plan.base.quote);expect(requests[1].correction.source).toBe(source);
    expect(requests[1].correction.originalReply).toBe(sink[0].content);
    expect(requests[1].correction.diagnostics[0]).toMatchObject({code:'MISSING_BASE_FACT',path:'/base/creature/identity'});
    expect(stages.filter(s=>s.status==='request').map(s=>s.callKind)).toEqual(['planned','correction','planned']);
    expect(stages.at(-1)).toMatchObject({plannedCalls:2,retryCalls:0,correctionCalls:1,correctionCount:1});
    const after=await repairBrowserActorIntake(correctionInput,analysis,provider);
    expect(after.findings.map(f=>f.code)).toContain('REPAIR_BUDGET_EXHAUSTED');expect(requests).toHaveLength(3);
  }));

test('one malformed whole reply corrects only the whole stage and keeps the passed base',async()=>correctionFixture(
  (stage,attempt,payload)=>stage==='base'?correctionBase():attempt===1?{markdown:'动作: ['}:correctionWhole(payload),
  async({fixed,requests,stages,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('ready_to_generate');expect(analysis.repairCount).toBe(1);expect(requests).toHaveLength(3);
    expect(requests.map(r=>!!r.template)).toEqual([false,true,true]);expect(requests[2].correction.originalReply).toBe(sink[1].content);
    expect(requests[2].correction.diagnostics).toEqual([{code:'V2_YAML',path:'/markdown'}]);
    expect(stages.some(s=>s.status==='failed'&&s.errorCode==='V2_YAML')).toBe(true);
    expect(stages.at(-1)).toMatchObject({plannedCalls:2,retryCalls:0,correctionCalls:1});
  }));

test('malformed assistant JSON is captured before its one base correction',async()=>correctionFixture(
  (stage,attempt,payload)=>stage==='base'&&attempt===1?'{':stage==='base'?correctionBase():correctionWhole(payload),
  async({fixed,requests,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('ready_to_generate');expect(analysis.repairCount).toBe(1);expect(sink[0].content).toBe('{');
    expect(requests[1].correction.originalReply).toBe('{');expect(requests[1].correction.diagnostics).toEqual([{code:'MODEL_JSON_INVALID',path:'/reply'}]);
  }));

test('base correction and later whole rejection share one budget and retain the original failure',async()=>correctionFixture(
  (stage,attempt)=>stage==='base'&&attempt===1?{}:stage==='base'?correctionBase():{markdown:'动作: ['},
  async({fixed,requests,stages,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('failed');expect(analysis.ir).toBeUndefined();expect(analysis.repairCount).toBe(1);expect(analysis.calls.repair).toBe(1);
    expect(requests).toHaveLength(3);expect(sink).toHaveLength(3);expect(stages.filter(s=>s.callKind==='correction')).toHaveLength(1);
    expect(stages.some(s=>s.status==='failed'&&s.errorCode==='BASE_FACTS_SCHEMA')).toBe(true);
    expect(stages.at(-1)).toMatchObject({status:'failed',errorCode:'V2_YAML',correctionCalls:1});
  }));

test('a failed correction remains blocked with no third whole reply or later repair',async()=>correctionFixture(
  (stage)=>stage==='base'?correctionBase():{markdown:'动作: ['},
  async({provider,fixed,requests,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('failed');expect(analysis.repairCount).toBe(1);expect(analysis.stages.find(s=>s.stage==='repair')?.status).toBe('failed');
    expect(requests).toHaveLength(3);expect(sink).toHaveLength(3);
    const result=await repairBrowserActorIntake(correctionInput,analysis,provider);
    expect(result.findings.map(f=>f.code)).toContain('REPAIR_BUDGET_EXHAUSTED');expect(requests).toHaveLength(3);
  }));

test('unknown source skill syntax retains a candidate while network failures do not spend a model correction',async()=>{
  const unsupported=source.replace(/^Skills[^\r\n]*/mu,'Skills Astrology +2');
  await correctionFixture((stage,_attempt,payload)=>stage==='base'?correctionBase():correctionWhole(payload),async({fixed,requests,stages})=>{
    const result=await analyzeBrowserActorSourceWithAi({...correctionInput,source:unsupported},fixed);
    expect(result.status).toBe('needs_review');expect(result.ir).toBeDefined();expect(result.repairCount).toBe(0);expect(requests).toHaveLength(2);
    expect(result.ir!.uncertainties.map(f=>f.code)).toContain('UNSUPPORTED_STATIC_FACT');
  },unsupported);
  await correctionFixture(()=>new TypeError('offline fake network failure'),async({fixed,requests})=>{
    const result=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(result.status).toBe('failed');expect(result.repairCount).toBe(0);expect(requests).toHaveLength(1);
  });
});


test('a proven wrong base number is corrected once while the original number stays in evidence',async()=>correctionFixture(
  (stage,attempt,payload)=>{
    if(stage==='feature')return correctionWhole(payload);
    const value=correctionBase();if(attempt===1)value.creature.attributes.hp.value+=1;return value;
  },async({fixed,requests,sink})=>{
    const analysis=await analyzeBrowserActorSourceWithAi(correctionInput,fixed);
    expect(analysis.status).toBe('ready_to_generate');expect(analysis.repairCount).toBe(1);
    expect(requests[1].correction.diagnostics).toEqual([{code:'BASE_NUMBER_CONFLICT',path:'/creature/attributes/hp/value'}]);
    expect(JSON.parse(sink[0].content).creature.attributes.hp.value).toBe(damageUpgrade.case.creature.attributes.hp.value+1);
    expect(analysis.ir?.creature.attributes.hp.value).toBe(damageUpgrade.case.creature.attributes.hp.value);
  }));


test('a metadata callback error cannot buy a correction even if its code resembles model validation',async()=>{
  const request={source,sourceSha256:hashSource(source),candidate};let calls=0;
  await expect(runStagedMonsterExtraction(request,async stage=>{
    calls++;await stage.onAttempt(1);return stage.stage==='base'?correctionBase():correctionWhole(stage.payload);
  },{baseMode:'facts',featureMode:'whole-v2',maxCorrections:1,onStage:metadata=>{
    if(metadata.stage==='feature'&&metadata.status==='validated')throw Object.assign(new Error('metadata observer failed'),{code:'invalid_response'});
  }})).rejects.toThrow('metadata observer failed');
  expect(calls).toBe(2);
});


test('concurrent extraction requests retain independent correction budgets on the same provider',async()=>correctionFixture(
  (stage,attempt,payload)=>stage==='base'&&attempt===1?{}:stage==='base'?correctionBase():correctionWhole(payload),
  async({provider,requests})=>{
    const first={source,sourceSha256:hashSource(source),candidate:{...candidate,id:'first'}};
    const second={source,sourceSha256:hashSource(source),candidate:{...candidate,id:'second'}};
    const values=await Promise.all([provider.extract(first),provider.extract(second)]);
    expect(values.every(ir=>ir.creature.actions.length===1)).toBe(true);
    expect(provider.getExtractionCorrectionCount?.(first)).toBe(1);
    expect(provider.getExtractionCorrectionCount?.(second)).toBe(0);
    expect(requests.filter(r=>r.correction)).toHaveLength(1);expect(requests).toHaveLength(5);
  }));

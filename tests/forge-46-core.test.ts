import {expect,test,setSystemTime} from 'bun:test';
import {readFileSync} from 'node:fs';
import yaml from 'js-yaml';
import {join} from 'node:path';
import {hashSource,hashArtifact,decodeForgeActorResponse,decodeForgeItemResponse,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {OpenAICompatibleMonsterIntakeProvider,normalizeMonsterIntakeProposal} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {ParserFactory} from '@fvtt-json-generator/parser/router';
import {generateActorArtifact} from '@fvtt-json-generator/workflows/generation-pipeline';
import {ActorGenerator,actorGenerationDiagnostics} from '@fvtt-json-generator/generation/actor';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {canonicalizeCreatureSourceText,splitCollection} from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import {buildForgeIntakeReviewBundleV2,decodeForgeIntakeReviewBundleText,serializeForgeIntakeReviewBundleV2} from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {approveBrowserActorIntakeCandidateForGm,analyzeBrowserActorSourceTextDraft,repairBrowserActorIntake} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('Model requests are forbidden');};
const provider={providerName:'frozen-46',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
const input={source:LURKER_SOURCE,sourceName:'46项回归',sourceScope:'single' as const,requestId:'forge-46-core',sourceId:'actor:v1:7d1ada39-7b83-40dc-a109-636f8b1c467b' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
async function generate(ir:any,current=input){
  const analysis=analyzeBrowserActorIntakeDraft(current,ir,provider);
  const generation=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  return {analysis,generation,actor:(generation.candidateResponse as any)?.result?.artifact};
}
const damage=(activity:any)=>activity.damage?.parts?.map((part:any)=>({formula:part.custom?.enabled?part.custom.formula:`${part.number}d${part.denomination}${part.bonus?'+'+part.bonus:''}`,types:part.types}));

test('46 core: a readable flat creature answer survives its missing wrapper and program records',async()=>{
  const ir=buildValidLurkerIr(),raw={schemaVersion:77,...ir.creature,claims:{note:'keep this record'},extra:'source-owned extra'};
  let requests=0;
  const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,
    httpClient:async()=>{requests++;return Response.json({choices:[{message:{content:JSON.stringify(raw)}}]});}});
  const analysis=await analyzeBrowserActorSourceWithAi(input,actual);
  const generation=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(requests).toBe(1);expect(generation.candidateAvailable).toBe(true);
  expect((generation.candidateResponse as any).result.artifact.items.length).toBeGreaterThan(0);
  expect(JSON.stringify(analysis.ir)).toContain('keep this record');
});

test('46 core: an empty metadata shell is an absent AI answer rather than a fabricated creature',async()=>{
  const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,
    httpClient:async()=>Response.json({choices:[{message:{content:'{"schemaVersion":0}'}}]})});
  const analysis=await analyzeBrowserActorSourceWithAi(input,actual);
  expect(analysis.ir).toBeUndefined();expect(analysis.status).toBe('failed');
});

for(const answerKind of ['markdown','fenced-markdown','markdown-wrapper','plaintext'])test(`46 core: one actual provider ${answerKind} answer uses the existing formal text conversion without a replacement IR`,async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const standard=renderMonsterIntakeMarkdown(buildValidLurkerIr()),plain=splitCollection(readFileSync('tests/fixtures/plaintext/月蚀矿腐化生物数据.md','utf8'))[0]!.quote;
    const answer=answerKind==='plaintext'?plain:answerKind==='fenced-markdown'?'```markdown\n'+standard+'```':standard;
    const transportText=answerKind==='markdown-wrapper'?JSON.stringify({markdown:answer}):answer;
    let requests=0;const audits:any[]=[];
    const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:2,timeoutMs:1000,repairTimeoutMs:1000,audit:event=>audits.push(event),
      httpClient:async()=>{requests++;return Response.json({choices:[{message:{content:transportText}}]});}});
    const analysis=await analyzeBrowserActorSourceWithAi(input,actual);
    expect(analysis.ir).toBeUndefined();expect(analysis.sourceText).toBe(transportText);expect(analysis.rawSource).toBe(input.source);expect(analysis.rawSourceHash).toBe(hashSource(input.source));
    expect(analysis.canonicalSource).toBe(canonicalizeCreatureSourceText(transportText));expect(analysis.calls).toEqual({discovery:0,extraction:1,review:0,repair:0});
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    expect(generated.candidateAvailable).toBe(true);
    const formal=await convertFinalActorSource(buildForgeActorRequest({content:analysis.canonicalSource!,sourceId:input.sourceId,displayName:input.sourceName,requestId:input.requestId,fvttVersion:input.fvttVersion,systemVersion:input.systemVersion}),{captureRulePresentation:true});
    expect('result'in formal).toBe(true);if(!('result'in formal)||!('result'in generated.candidateResponse!))throw Error('Expected both formal artifacts.');
    expect(generated.candidateResponse!.result.artifact).toEqual(formal.result.artifact);
    expect(generated.finalSourceHash).toBe(hashSource(generated.finalSource!));expect(generated.candidateResponse!.result.artifactHash).toBe(hashArtifact(formal.result.artifact!));
    const approved=approveBrowserActorIntakeCandidateForGm(input,generated,'gm');expect(approved.response).toBeDefined();
    const restored=analyzeBrowserActorSourceTextDraft(input,analysis.sourceText!,provider),restoredGeneration=await generateBrowserActorIntakeCandidate(input,restored,provider);
    expect(restoredGeneration.actorProjection).toEqual(generated.actorProjection);expect(restoredGeneration.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
    const repaired=await repairBrowserActorIntake(input,generated,provider);expect(repaired.sourceText).toBe(transportText);expect(repaired.calls).toEqual(analysis.calls);
    const bundle=buildForgeIntakeReviewBundleV2({objectKind:'actor',mode:'ai-monster',requestId:input.requestId,attemptId:analysis.attemptId,status:'ready_for_gm_review',rawSource:input.source,rawSourceHash:hashSource(input.source),sourceText:transportText,canonicalSource:generated.finalSource});
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle)).bundle.sourceText).toBe(transportText);
    expect(requests).toBe(1);expect(audits).toContainEqual(expect.objectContaining({extractionMode:'source-text',attempt:1}));
  }finally{setSystemTime();}
});

test('46 core: unsupported returned text keeps its actual format problem and answer without requesting an IR substitute',async()=>{
  let requests=0;
  const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:2,timeoutMs:1000,repairTimeoutMs:1000,
    httpClient:async()=>{requests++;return Response.json({choices:[{message:{content:'A readable creature paragraph outside the existing supported text formats.'}}]});}});
  const analysis=await analyzeBrowserActorSourceWithAi(input,actual),generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(analysis.sourceText).toContain('readable creature');expect(analysis.ir).toBeUndefined();expect(analysis.canonicalSource).toBeUndefined();
  expect(generated.findings).toContainEqual(expect.objectContaining({code:'SOURCE_TEXT_FORMAT_UNSUPPORTED'}));expect(generated.errorCode).toBeUndefined();expect(requests).toBe(1);
});

test('46 core: explicit empty text wrappers are absent answers while an actual creature ignores an empty Markdown annotation',async()=>{
  for(const value of [{markdown:''},{kind:'source-text',sourceText:' \n '},{...buildValidLurkerIr(),markdown:''},{...buildValidLurkerIr().creature,markdown:''}]){
    let requests=0;
    const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:2,timeoutMs:1000,repairTimeoutMs:1000,
      httpClient:async()=>{requests++;return Response.json({choices:[{message:{content:JSON.stringify(value)}}]});}});
    const analysis=await analyzeBrowserActorSourceWithAi(input,actual);
    if('creature'in value||'identity'in value){const result=await generateBrowserActorIntakeCandidate(input,analysis,provider);expect(result.candidateAvailable).toBe(true);expect(analysis.ir?.creature.actions.length).toBeGreaterThan(0);}
    else{expect(analysis.ir).toBeUndefined();expect(analysis.sourceText).toBeUndefined();expect(analysis.errorCode).toBe('invalid_response');}
    expect(requests).toBe(1);
  }
});

test('46 core: a normal creature IR takes priority over colliding unknown sourceText and kind annotations',async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const baseline=await generate(buildValidLurkerIr());
    for(const annotation of [{sourceText:'补充文字'},{kind:'source-text'},{kind:'source-text',sourceText:'补充文字'}]){
      let requests=0;const audits:any[]=[],ir={...buildValidLurkerIr(),...annotation};
      const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',reviewModel:'frozen',maxAttempts:2,timeoutMs:1000,repairTimeoutMs:1000,audit:event=>audits.push(event),
        httpClient:async()=>{requests++;return Response.json({choices:[{message:{content:JSON.stringify(ir)}}]});}});
      const analysis=await analyzeBrowserActorSourceWithAi(input,actual),generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
      expect(analysis.ir?.creature.actions).toEqual(baseline.analysis.ir?.creature.actions);expect(analysis.sourceText).toBeUndefined();
      expect(generated.candidateAvailable).toBe(true);expect((generated.candidateResponse as any).result.artifact).toEqual(baseline.actor);
      expect(JSON.stringify(analysis.ir)).toContain(JSON.stringify(annotation).slice(1,-1));expect(requests).toBe(1);
      expect(audits).toContainEqual(expect.objectContaining({extractionMode:'full-ir',attempt:1}));
    }
  }finally{setSystemTime();}
});

test('46 core: one attack status cannot remove its attack, all damage or its follow-up save',async()=>{
  const ir:any=buildValidLurkerIr();
  ir.creature.actions=[{name:'Status strike',description:'An explicit strike. Poisoned targets save after a Long Rest.',sourceOperations:[
    {name:'Strike',type:'attack',relationship:'primary',attack:{type:'melee',toHit:6,reach:5},damage:[{formula:'2d8+3',type:'piercing',relationship:'base'}],failureStatuses:['poisoned'],proof:{}},
    {name:'Long Rest',type:'save',relationship:'follow-up',condition:'After a Long Rest',save:{dc:15,abilities:['con'],choice:'single',outcome:'none'},proof:{}},
  ]}];
  const result=await generate(ir);
  expect(result.generation.candidateAvailable).toBe(true);
  const item=result.actor.items.find((item:any)=>item.name==='Status strike'),activities=Object.values<any>(item.system.activities);
  expect(activities.some(activity=>activity.roll?.formula==='1d20+6')).toBe(true);
  expect(activities.some(activity=>activity.type==='damage'&&damage(activity)[0].formula==='2d8+3')).toBe(true);
  expect(activities.some(activity=>activity.type==='save'&&activity.save.dc.formula==='15')).toBe(true);
  expect(item.system.description.value).toContain('Poisoned targets save after a Long Rest.');expect(JSON.stringify(result.analysis.ir)).toContain('failureStatuses');
});

test('46 core: more than twelve parts and one unprojectable part preserve every other roll',async()=>{
  const ir:any=buildValidLurkerIr();
  const parts=Array.from({length:14},(_,index)=>({formula:`${index+1}d6`,type:'fire',relationship:index?'additional':'base'}));
  ir.creature.actions=[{name:'Many parts',description:'Fourteen declared damage parts and one unmapped record.',sourceOperations:[{name:'Damage',type:'damage',relationship:'primary',damage:[...parts.slice(0,5),{formula:{unmapped:17},type:'cold'},...parts.slice(5)],proof:{damage:[]}}]}];
  const result=await generate(ir);expect(result.generation.candidateAvailable).toBe(true);
  const item=result.actor.items.find((item:any)=>item.name==='Many parts'),activity=Object.values<any>(item.system.activities).find(activity=>activity.type==='damage');
  expect(activity.damage.parts).toHaveLength(14);expect(damage(activity).map((part:any)=>part.formula)).toEqual(parts.map(part=>part.formula));
  expect(item.system.description.value).toContain('unmapped');expect(JSON.stringify(result.analysis.ir)).toContain('17');
});

test('46 core: repeated technical operation IDs cannot overwrite distinct attacks and damage',async()=>{
  const ir:any=buildValidLurkerIr();
  ir.creature.actions=[{name:'Two strikes',description:'Both explicit strikes remain available.',sourceOperations:[
    {id:'same',name:'First strike',type:'attack',relationship:'primary',attack:{type:'melee',toHit:4},damage:[{formula:'1d6+2',type:'piercing',relationship:'base'}],proof:{}},
    {id:'same',name:'Second strike',type:'attack',relationship:'follow-up',attack:{type:'melee',toHit:7},damage:[{formula:'2d8+3',type:'fire',relationship:'base'}],proof:{}},
  ]}];
  const result=await generate(ir);expect(result.generation.candidateAvailable).toBe(true);
  const item=result.actor.items.find((item:any)=>item.name==='Two strikes'),activities=Object.values<any>(item.system.activities);
  expect(activities.filter(activity=>activity.type==='utility').map(activity=>activity.roll.formula)).toEqual(['1d20+4','1d20+7']);
  expect(activities.filter(activity=>activity.type==='damage').map(activity=>damage(activity)[0].formula)).toEqual(['1d6+2','2d8+3']);
  const action=result.analysis.ir!.creature.actions[0];
  if(!action)throw Error('Expected the preserved two-strike action.');
  expect(new Set(action.sourceOperations!.map(operation=>operation.id)).size).toBe(2);
  expect(JSON.stringify(result.analysis.ir)).toContain('same');
});

test('46 core: unknown damage relationships remain independent GM rolls rather than unconditional attack damage',async()=>{
  const ir:any=buildValidLurkerIr();
  ir.creature.actions=[{name:'Conditional strike',description:'Explicit primary and separately qualified damage.',sourceOperations:[{name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5,reach:5},damage:[
    {formula:'1d8+3',type:'piercing',relationship:'base'},{formula:'2d6',type:'fire',relationship:'on-critical'}],proof:{}}]}];
  const result=await generate(ir),item=result.actor.items.find((item:any)=>item.name==='Conditional strike'),activities=Object.values<any>(item.system.activities);
  const attack=activities.find(activity=>activity.type==='attack'),helper=activities.find(activity=>activity.type==='damage');
  expect(damage(attack)).toEqual([{formula:'1d8+3',types:['piercing']}]);expect(damage(helper)).toEqual([{formula:'2d6',types:['fire']}]);
  expect(helper.activation.condition).toContain('on-critical');expect(helper.consumption.targets).toEqual([]);expect(item.system.description.value).toContain('on-critical');
});

test('46 core: an unknown attack classification remains unclassified, without inventing melee or weapon',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.actions=[{name:'Unknown strike',description:'An explicit attack modifier without a known classification.',sourceOperations:[{name:'Strike',type:'attack',relationship:'primary',attack:{type:'unknown-kind',toHit:5},proof:{}}]}];
  const result=await generate(ir),item=result.actor.items.find((item:any)=>item.name==='Unknown strike'),activity=Object.values<any>(item.system.activities)[0];
  expect(activity.type).toBe('utility');expect(activity.roll.formula).toBe('1d20+5');expect(activity.flags.fvttJsonGenerator.sourceOperation.attackKind).toBe('unclassified');
  expect(activity.attack).toBeUndefined();expect(item.system.description.value).toContain('unknown-kind');
});

test('46 core: ambiguous multi-ability saves stay independent, while an explicit target choice stays a choice',async()=>{
  for(const choice of ['single','sequential','target']){
    const ir:any=buildValidLurkerIr();ir.creature.actions=[{name:'Multiple saves',description:'The original save relationship remains visible.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:16,abilities:['str','dex'],choice,outcome:'none'},proof:{}}]}];
    const result=await generate(ir),item=result.actor.items.find((item:any)=>item.name==='Multiple saves'),activities=Object.values<any>(item.system.activities);
    expect(activities).toHaveLength(choice==='target'?1:2);
    expect(activities.map(activity=>activity.save.ability)).toEqual(choice==='target'?[['str','dex']]:[['str'],['dex']]);
    if(choice!=='target')expect(JSON.stringify(result.analysis.ir)).toContain(choice);
  }
});

test('46 core: healing preserves an explicit recipient count and leaves an unresolved count unrestricted',async()=>{
  for(const count of [2,'two or three']){
    const ir:any=buildValidLurkerIr();ir.creature.traits.push({name:'Shared healing',description:'An explicit healing amount with its recipient declaration.',sourceOperations:[{name:'Heal',type:'heal',relationship:'primary',healing:{formula:'5',type:'healing',target:{type:'creature',count}},proof:{}}]});
    const result=await generate(ir),item=result.actor.items.find((item:any)=>item.name==='Shared healing'),activity=Object.values<any>(item.system.activities)[0];
    expect(activity.target.affects.count).toBe(count===2?'2':'');expect(activity.healing.custom.formula).toBe('5');
    if(count!==2)expect(item.system.description.value).toContain('two or three');
  }
});

test('46 core: declared official statuses retain templates and the underlying save',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.actions=[{name:'States',description:'Declared save and states.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:13,abilities:['con'],choice:'single',outcome:'none'},failureStatuses:['prone','exhaustion'],proof:{}}]}];
  const result=await generate(ir),item=result.actor.items.find((item:any)=>item.name==='States');
  expect(item.effects.flatMap((effect:any)=>effect.statuses)).toEqual(['prone','exhaustion']);expect(JSON.stringify(result.analysis.ir)).toContain('exhaustion');
  expect(Object.values<any>(item.system.activities)[0].save.dc.formula).toBe('13');
});

test('46 core: a malformed shared pool cannot remove another pool, its counter or its activity consumption',async()=>{
  for(const bad of [{max:0,members:[{collection:'actions',index:0,cost:1}]},{max:2,members:[]},{max:2,members:[{collection:'actions',index:999,cost:1}]}]){
    const ir:any=buildValidLurkerIr();ir.creature.sourceResourcePools=[{id:'good-pool',name:'Known pool',max:3,period:'day',members:[{collection:'actions',index:1,cost:1}],evidence:[]},{id:'bad-pool',name:'Unmapped pool',period:'day',evidence:[],...bad}];
    const result=await generate(ir);expect(result.generation.candidateAvailable).toBe(true);
    const carrier=result.actor.items.find((item:any)=>item.flags?.fvttJsonGenerator?.resource?.id==='good-pool');
    expect(carrier).toBeDefined();expect(carrier.system.uses).toMatchObject({max:'3',recovery:[{period:'day',type:'recoverAll'}]});
    expect(Object.values<any>(carrier.system.activities).some(activity=>activity.consumption?.targets?.some((target:any)=>target.type==='itemUses'&&target.target===carrier._id))).toBe(true);
    expect(JSON.stringify(result.analysis.ir)).toContain('bad-pool');
  }
});

function spellGroups(){const evidence=[{start:0,end:input.source.length,quote:input.source}];return ['Light','Mage Hand'].map((name,index)=>({groupId:'group-'+index,featureName:'Spells '+index,description:'The creature casts '+name+'.',ability:'wis',evidence,abilityEvidence:evidence,componentWaivers:[],usageGroups:[{usage:'at-will',evidence,spellRefs:[{refId:'ref-'+index,identifier:name,originalName:name,aliases:index?null:[],restrictions:[],evidence}]}]}));}

test('46 core: a spell alias container problem preserves that spell and every other group',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();
  const result=await generate(ir);expect(result.generation.candidateAvailable).toBe(true);
  const manifest=result.actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(2);expect(manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs.map((ref:any)=>ref.originalName))).toEqual(['Light','Mage Hand']);
  expect(JSON.stringify(result.analysis.ir)).toContain('aliases');
});

for(const carrier of ['intake','portable'])test(`46 core: a malformed alias element preserves both explicit spells in its group and the control group through ${carrier}`,async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();
  const [group,control]=ir.creature.spellcasting;
  const extra={...structuredClone(control.usageGroups[0].spellRefs[0]),refId:'mage-hand',aliases:[null,'Mage Hand alternate']};
  group.usageGroups[0].spellRefs.push(extra);group.description='The creature casts Light and Mage Hand.';
  Object.assign(control.usageGroups[0].spellRefs[0],{identifier:'Guidance',originalName:'Guidance',aliases:[]});control.description='The creature casts Guidance.';
  const original=structuredClone(ir);
  let actor:any,retained:string;
  if(carrier==='intake'){
    const result=await generate(ir);actor=result.actor;retained=JSON.stringify(result.analysis.ir);
    expect(result.generation.findings).toContainEqual(expect.objectContaining({code:'FIELD_PROJECTION_INCOMPLETE',path:'/creature/spellcasting/0/usageGroups/0/spellRefs/1/aliases/0'}));
  }else{
    const normalized=normalizeMonsterIntakeProposal(input.source,ir),document=yaml.load(renderMonsterIntakeMarkdown(normalized).slice(4,-4)) as any;
    document.法术清单.spellcastingGroups[0].spellRefs[1].aliases=[null,'Mage Hand alternate'];
    const markdown='---\n'+yaml.dump(document)+'---\n',parsed=new ParserFactory().parse(markdown);
    const generated=await generateActorArtifact({parsed,sourceText:markdown,route:'chinese',fvttVersion:'14',effectProfile:'core'});
    actor=generated.actor;retained=JSON.stringify(parsed.candidateReview);
    expect(parsed.candidateReview?.findings.some(finding=>finding.path.endsWith('/mage-hand/aliases/0'))).toBe(true);
  }
  const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(2);
  expect(manifest.spellcastingGroups[0].spellRefs.map((ref:any)=>ref.originalName)).toEqual(['Light','Mage Hand']);
  expect(manifest.spellcastingGroups[0].spellRefs[1].aliases).toEqual(['Mage Hand alternate']);
  expect(manifest.spellcastingGroups[1].spellRefs[0].originalName).toBe('Guidance');
  expect(retained).toContain('null');expect(ir).toEqual(original);
});

for(const name of ['',undefined])test(`46 core: a spell without a usable name preserves its same-group Light, shared counter and Guidance with its unresolved reuse ${String(name)}`,async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();
  const [group,control]=ir.creature.spellcasting;
  group.description='Light and an unnamed ritual share three uses. The unnamed ritual can be used after sunset.';
  const bad={...structuredClone(group.usageGroups[0].spellRefs[0]),refId:'unmapped-ref',identifier:'unmapped-token',originalName:name};
  if(name===undefined)delete bad.originalName;
  group.usageGroups[0].spellRefs.push(bad);Object.assign(group.usageGroups[0],{usage:'daily-shared',count:3});
  Object.assign(control.usageGroups[0].spellRefs[0],{identifier:'Guidance',originalName:'Guidance',aliases:[],reuseOf:{groupId:group.groupId,refId:bad.refId}});
  control.description='The creature casts Guidance; its unresolved imported relationship remains in the source record.';
  const original=structuredClone(ir),normalized=normalizeMonsterIntakeProposal(input.source,ir);
  const markdown=renderMonsterIntakeMarkdown(normalized),parsed=new ParserFactory().parse(markdown);
  expect(parsed.spellManifest?.spellcastingGroups[0]?.spellRefs.map(ref=>ref.originalName)).toEqual(['Light']);
  expect(parsed.spellManifest?.spellcastingGroups[1]?.spellRefs[0]?.originalName).toBe('Guidance');
  expect(parsed.spellManifest?.spellcastingGroups[1]?.spellRefs[0]?.reuseOf).toBeUndefined();
  expect(JSON.stringify(parsed.candidateReview)).toContain('unmapped-token');
  expect(JSON.stringify(parsed.candidateReview)).toContain('unmapped-ref');
  const generated=await generateActorArtifact({parsed,sourceText:markdown,route:'chinese',fvttVersion:'14',effectProfile:'core'});
  const manifest=generated.actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(2);
  expect(manifest.spellcastingGroups[0].spellRefs.map((ref:any)=>ref.originalName)).toEqual(['Light']);
  expect(manifest.spellcastingGroups[1].spellRefs[0].originalName).toBe('Guidance');
  const feature=generated.actor.items.find((item:any)=>item.name==='Spells 0');
  expect(feature.system.description.value).toContain('after sunset');expect(feature.system.uses.max).toBe('3');
  expect(feature.flags.fvttJsonGenerator.spellcastingUsesParent).toBe(true);
  expect(manifest.spellcastingGroups[0].spellRefs[0].uses).toEqual({value:3,recovery:'day',shared:false});
  expect(generated.actor.system.details.biography.value).toContain('unmapped-token');expect(ir).toEqual(original);
});

test('46 core: an unmapped reference preserves the two remaining native members of one shared spell pool',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();
  const [group,control]=ir.creature.spellcasting;
  group.description='Light and Mage Hand share three daily uses with the unnamed original rule.';
  const mage={...structuredClone(control.usageGroups[0].spellRefs[0]),refId:'mage-hand',aliases:[]};
  group.usageGroups[0].spellRefs.push(mage,{...structuredClone(mage),refId:'unmapped-ref',identifier:'unmapped-token',originalName:''});
  Object.assign(group.usageGroups[0],{usage:'daily-shared',count:3});
  Object.assign(control.usageGroups[0].spellRefs[0],{identifier:'Guidance',originalName:'Guidance',aliases:[]});
  const result=await generate(ir),manifest=result.actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(2);
  expect(manifest.spellcastingGroups[0].spellRefs.map((ref:any)=>ref.originalName)).toEqual(['Light','Mage Hand']);
  expect(manifest.spellcastingGroups[0].spellRefs.every((ref:any)=>ref.uses.value===3&&ref.uses.recovery==='day'&&ref.uses.shared)).toBe(true);
  expect(result.actor.items.find((item:any)=>item.name==='Spells 0').system.uses.max).toBe('3');
  expect(manifest.spellcastingGroups[1].spellRefs[0].originalName).toBe('Guidance');
});

test('46 core: an unmapped same-group reference does not break a valid cross-group spell reuse',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();
  const [group,control]=ir.creature.spellcasting,original=group.usageGroups[0].spellRefs[0];
  group.usageGroups[0].spellRefs.push({...structuredClone(original),refId:'unmapped-ref',identifier:'unmapped-token',originalName:''});
  Object.assign(control.usageGroups[0].spellRefs[0],{identifier:'Guidance',originalName:'Guidance',aliases:[]});
  const reuse=structuredClone(group);reuse.groupId='reuse-group';reuse.featureName='Light reuse';
  reuse.usageGroups[0].spellRefs=[{...structuredClone(original),refId:'light-reuse',reuseOf:{groupId:group.groupId,refId:original.refId},evidence:[{start:0,end:1,quote:input.source.slice(0,1)}]}];
  ir.creature.spellcasting.push(reuse);
  const result=await generate(ir),manifest=result.actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(3);
  expect(manifest.spellcastingGroups[0].spellRefs.map((ref:any)=>ref.originalName)).toEqual(['Light']);
  expect(manifest.spellcastingGroups[1].spellRefs[0].originalName).toBe('Guidance');
  expect(manifest.spellcastingGroups[2].spellRefs[0].reuseOf).toEqual({groupId:group.groupId,refId:original.refId});
});

test('46 core: a missing spell carrier only leaves that connection unresolved, while another complete group stays native',async()=>{
  const ir:any=buildValidLurkerIr();ir.creature.spellcasting=spellGroups();ir.creature.spellcasting[1].usageGroups[0].spellRefs[0].aliases=[];
  const normalized=normalizeMonsterIntakeProposal(input.source,ir),document=yaml.load(renderMonsterIntakeMarkdown(normalized).slice(4,-4)) as any;
  document.法术清单.spellcastingGroups[1].featureItemKey='missing-feature';
  const markdown='---\n'+yaml.dump(document)+'---\n',parsed=new ParserFactory().parse(markdown);
  const result=await generateActorArtifact({parsed,sourceText:markdown,route:'chinese',fvttVersion:'14',effectProfile:'core'});
  const manifest=result.actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups).toHaveLength(1);expect(manifest.spellcastingGroups[0].spellRefs[0].originalName).toBe('Light');
  expect(result.actor.items.find((item:any)=>item.name==='Spells 1').system.description.value).toContain('Mage Hand');
  expect(JSON.stringify(result.actor)).toContain('missing-feature');expect(result.diagnostics.some(diagnostic=>diagnostic.code==='FIELD_PROJECTION_INCOMPLETE')).toBe(true);
});

test('46 core: unknown YAML and a bad skill total retain the other real Actor fields',async()=>{
  const ir=buildValidLurkerIr();
  const current={...input,renderMarkdown:()=>renderMonsterIntakeMarkdown(ir)+'\n'};
  const base=await generate(ir);
  const parsed=new ParserFactory().parse(renderMonsterIntakeMarkdown(ir).replace('类型: npc','类型: npc\n新字段: 保留这段原文'));
  const generated=await generateActorArtifact({parsed,sourceText:current.source,route:'chinese',fvttVersion:'14',effectProfile:'core'});
  expect(generated.actor.items).toHaveLength(base.actor.items.length);expect(generated.actor.system.attributes.hp.value).toBe(base.actor.system.attributes.hp.value);
  expect(generated.actor.system.details.biography.value).toContain('保留这段原文');
});

test('46 core: a failing inner icon report returns the exact already-generated Actor',async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
  const markdown=renderMonsterIntakeMarkdown(buildValidLurkerIr()),parsed=new ParserFactory().parse(markdown);
  const options={parsed,sourceText:markdown,route:'chinese' as const,fvttVersion:'14' as const,effectProfile:'core' as const};
  const baseline=await generateActorArtifact(options);
  const result=await generateActorArtifact({...options,iconWorkflow:{createResolutionSession:()=>({mode:'off',entries:[],report:()=>{throw Error('icon report unavailable');}})}});
  expect(result.actor).toEqual(baseline.actor);expect(result.verification.status).toBe('needs_review');
  expect(result.diagnostics.some(diagnostic=>diagnostic.code==='ICON_REPORT_INCOMPLETE')).toBe(true);
  }finally{setSystemTime();}
});

for(const phase of ['callback','normalizer'])test(`46 core: a failing rule-presentation ${phase} preserves the completed Actor inside its owner`,()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const markdown=renderMonsterIntakeMarkdown(buildValidLurkerIr()),parsed=new ParserFactory().parse(markdown);
    const baseline=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(parsed);
    const generator=new ActorGenerator({fvttVersion:'14',effectProfile:'core',rulePresentationSource:markdown,
      onRulePresentationPlan:()=>{if(phase==='callback')throw Error('presentation callback unavailable');},
      rulePresentationActorNormalizer:actor=>{if(phase==='normalizer')throw Error('presentation normalizer unavailable');return actor;}});
    const actor=generator.generate(parsed);
    expect(actor).toEqual(baseline);expect(actorGenerationDiagnostics(actor).some(diagnostic=>diagnostic.message.includes('presentation '+phase+' unavailable'))).toBe(true);
  }finally{setSystemTime();}
});

test('46 core: internal report defects and nonaccepted hashes cannot hide an Actor artifact',async()=>{
  const result=await generate(buildValidLurkerIr()),response:any=structuredClone(result.generation.candidateResponse),artifact=structuredClone(response.result.artifact);
  response.result.status='needs_review';response.result.verification={status:'failed',mechanicsCoverage:[]};response.result.diagnostics={invalid:'report'};
  response.result.artifactHash=hashArtifact(artifact);
  const decoded=decodeForgeActorResponse(response);expect(decoded.ok).toBe(true);
  if(decoded.ok&&'result'in decoded.value){expect(decoded.value.result.artifact).toEqual(artifact);expect(decoded.value.result.artifactHash).toBe(hashArtifact(artifact));}
  expect(decodeForgeItemResponse(response).ok).toBe(false);
});

test('46 core: report recovery preserves an existing error, coverage and warning before adding its own notice',async()=>{
  const result=await generate(buildValidLurkerIr()),response:any=structuredClone(result.generation.candidateResponse);
  const coverage=structuredClone(response.result.verification.mechanicsCoverage);
  response.result.diagnostics=[{code:'HP_DRIFT',severity:'error',stage:'semantic',path:'actor',message:'HP changed during projection.'}];
  response.result.actorVerification.warnings=['existing warning'];response.result.actorVerification.items=null;
  const decoded=decodeForgeActorResponse(response);expect(decoded.ok).toBe(true);
  if(decoded.ok&&'result'in decoded.value){const record=decoded.value.result;expect(record.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({code:'HP_DRIFT',severity:'error'}),expect.objectContaining({code:'FORGE_REPORT_INCOMPLETE'})]));expect(record.verification.mechanicsCoverage).toEqual(coverage);expect(record.actorVerification.warnings).toContain('existing warning');expect(record.artifact).toEqual(response.result.artifact);}
});

test('46 core: a malformed program source ID is rebound rather than blocking a returned creature',async()=>{
  const result=await generate(buildValidLurkerIr(),{...input,sourceId:'actor:v1:invalid' as ForgeSourceId});
  expect(result.generation.candidateAvailable).toBe(true);expect(result.generation.findings.some(finding=>finding.code==='PROGRAM_SOURCE_ID_REBOUND')).toBe(true);
  expect((result.generation.candidateResponse as any).result.sourceIdentity.sourceId).toMatch(/^actor:v1:[0-9a-f-]{36}$/u);
});

const frozen=process.env.FORGE_46_FROZEN_ROOT;
for(const id of ['member-mimic','member-otyugh'])test.skipIf(!frozen)(`46 core: actual frozen ${id} retains all declared mechanics`,async()=>{
  const original=readFileSync(join(frozen!,'results',id,'raw-answer.txt'),'utf8'),prior=JSON.parse(readFileSync(join(frozen!,'results',id,'analysis.json'),'utf8'));
  const current={...input,source:prior.candidate.quote,sourceName:id},ir=JSON.parse(original),before=structuredClone(ir);
  const result=await generate(ir,current);expect(result.generation.candidateAvailable).toBe(true);expect(ir).toEqual(before);
  if(id==='member-mimic'){
    const item=result.actor.items.find((item:any)=>item.name==='Bite'),activities=Object.values<any>(item.system.activities);
    expect(activities.filter(activity=>activity.flags?.fvttJsonGenerator?.sourceOperation?.role==='attack-roll')).toHaveLength(1);
    const ordinary=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceOperation?.damageMode==='ordinary'),alternative=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceOperation?.damageMode==='alternative');
    expect(damage(ordinary)).toEqual([{formula:'1d8+3',types:['piercing']},{formula:'1d8',types:['acid']}]);
    expect(damage(alternative)).toEqual([{formula:'2d8+3',types:['piercing']},{formula:'1d8',types:['acid']}]);
    expect(result.generation.findings.filter(finding=>/DAMAGE_DRIFT|COUNT_DRIFT|GM_ATTACK_IDENTITY/u.test(finding.code))).toEqual([]);
  }else{
    expect(result.actor.items.map((item:any)=>item.name)).toEqual(expect.arrayContaining(['Bite','Tentacle','Tentacle Slam']));
    const acts=result.actor.items.flatMap((item:any)=>Object.values<any>(item.system.activities));
    expect(acts.filter((activity:any)=>activity.type==='damage')).toHaveLength(2);
    expect(acts.some((activity:any)=>activity.type==='save'&&activity.save.dc.formula==='15')).toBe(true);
    expect(acts.some((activity:any)=>activity.type==='save'&&activity.save.dc.formula==='14')).toBe(true);
  }
  expect(readFileSync(join(frozen!,'results',id,'raw-answer.txt'),'utf8')).toBe(original);
});

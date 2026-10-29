import {test,expect} from 'bun:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate,approveBrowserActorIntakeCandidateForGm} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {OpenAICompatibleMonsterIntakeProvider,parseStrictJson} from '@fvtt-json-generator/intake-ai/provider';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {revalidateIntakeCandidate} from '../foundry-modules/fvtt-json-forge/src/intakeCandidateRecovery';
import {renderMonsterIntakeMarkdown,prepareMonsterCandidateDelivery} from '@fvtt-json-generator/intake-ai/renderer';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import ankheg from './fixtures/forge-2024-ankheg-shared-proof.json';
import {expectSourceConditionEffects,withoutApprovedConditionEffects,expectFrozenSourceDescriptions} from './helpers/forge-approved-projections';

const noCall=async():Promise<never>=>{throw Error('Model requests are forbidden');};
const provider={providerName:'frozen',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
const input={source:LURKER_SOURCE,sourceName:'preserved candidate',requestId:'preservation-regression',sourceId:'actor:v1:362fd104-ae9b-48ba-b057-c9fbe4789d87' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
const analyze=(current=input)=>analyzeBrowserActorIntakeDraft(current,buildValidLurkerIr(),provider);

test('the former delivery fallback preserves every original field even for invalid operations and literal=true callers',()=>{
  const ir=structuredClone(ankheg.ir);ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.formula='not a die';
  const before=structuredClone(ir);
  for(const literal of [false,true]){
    const result=prepareMonsterCandidateDelivery(ir as MonsterIntakeIR,ankheg.source,literal);
    expect<MonsterIntakeIR|typeof before>(result.ir).toEqual(before);expect(result.findings).toEqual([]);expect(ir).toEqual(before);
  }
});

test('an unprojectable formula retains its Actor, source, attack, other damage and abilities',async()=>{
  const ir=structuredClone(ankheg.ir);ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.formula='not a die';
  const current={...input,source:ankheg.source},analysis=analyzeBrowserActorIntakeDraft(current,ir as any,provider),before=structuredClone(analysis);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.status).toBe('ready_for_gm_review');expect(result.candidateAvailable).toBe(true);expect(result.candidateResponse).toBeDefined();
  expect(result.analysis.ir).toEqual(before.ir);expect(result.analysis.evidence).toEqual(before.evidence);
  expect(result.analysis.candidate?.quote).toBe(ankheg.source);expect(analysis).toEqual(before);
  expect(result.findings.some(f=>f.code==='INVALID_STRUCTURE')).toBe(true);
  expect(JSON.stringify(result.actorProjection)).toContain('not a die');
  expect(result.findings.some(f=>/LITERAL_DELIVERY/u.test(f.code))).toBe(false);
});

test('malformed optional Markdown retains normal Actor generation and reports its display failure',async()=>{
  let renders=0;const malformed='---\n名称: [unterminated\n---\n';
  const current={...input,renderMarkdown:()=>{renders++;return malformed;}},analysis=analyze(current),before=structuredClone(analysis.ir);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.status).toBe('ready_for_gm_review');expect(result.candidateAvailable).toBe(true);expect(result.candidateResponse).toBeDefined();
  expect(result.analysis.ir).toEqual(before);expect(result.analysis.candidate?.quote).toBe(LURKER_SOURCE);expect(renders).toBe(1);
  expect(result.findings.some(f=>f.code==='CUSTOM_RENDER_INCOMPLETE')).toBe(true);
});

test('new projection findings remain outside the Actor and do not cause a second render or conversion',async()=>{
  let renders=0;
  const current={...input,renderMarkdown:(ir:any)=>{renders++;return renderMonsterIntakeMarkdown(ir).replace(/护甲等级: \d+/u,'护甲等级: 99');}};
  const analysis=analyze(current),before=structuredClone(analysis.ir);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.candidateAvailable).toBe(true);expect((result.actorProjection as any).system.attributes.ac.flat).toBe(99);
  expect(result.findings.some(f=>f.code==='ACTOR_AC_DRIFT')).toBe(true);expect(result.intakeVerificationStatus).toBe('needs_review');
  expect(renders).toBe(1);expect(result.finalSource).not.toContain('ACTOR_AC_DRIFT');expect(result.analysis.ir).toEqual(before);
  expect(approveBrowserActorIntakeCandidateForGm(current,result,'gm').candidateResponse).toEqual(result.candidateResponse);
});

test('an unexpected formal conversion exception retains the already-rendered canonical source',async()=>{
  const analysis=analyze(),current={...input};
  Object.defineProperty(current,'systemVersion',{get:()=>{throw Error('target lookup unavailable');}});
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.status).toBe('failed');expect(result.candidateAvailable).toBe(false);expect(result.candidateResponse).toBeUndefined();
  expect(result.finalSource).toContain('forge-source-id: '+input.sourceId);expect(result.markdown).toBe(result.finalSource);
  expect(result.analysis.ir).toEqual(analysis.ir);expect(result.analysis.candidate?.quote).toBe(input.source);
  expect(result.findings.some(f=>f.code==='ACTOR_CONVERSION_FAILED'&&f.message.includes('Actor JSON 转换失败：target lookup unavailable'))).toBe(true);
});

for(const failedStage of ['generate','finalize'])test(`a ${failedStage} reporting exception after formal generation retains the exact already-created Actor JSON`,async()=>{
  const baseline=await generateBrowserActorIntakeCandidate(input,analyze(),provider);
  let renders=0;
  const current={...input,renderMarkdown:(ir:any)=>{renders++;return renderMonsterIntakeMarkdown(ir);},
    onStage:(stage:any)=>{if(stage.stage===failedStage&&stage.status!=='running')throw Error('completion report unavailable');}};
  const result=await generateBrowserActorIntakeCandidate(current,analyze(current),provider);
  expect(result.status).toBe('ready_for_gm_review');expect(result.candidateAvailable).toBe(true);
  expect(result.candidateResponse).toEqual(baseline.candidateResponse);expect(result.actorProjection).toEqual(baseline.actorProjection);
  expect(hashArtifact(result.actorProjection as any)).toBe(hashArtifact(baseline.actorProjection as any));
  expect(result.modelReviewStatus).toBe('not_requested');expect(result.intakeVerificationStatus).toBe('needs_review');
  expect(result.findings.some(f=>f.code==='GENERATION_CHECK_INCOMPLETE'&&f.message.includes('completion report unavailable'))).toBe(true);
  expect(renders).toBe(1);expect(result.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
  expect(approveBrowserActorIntakeCandidateForGm(current,result,'gm').gmApproval).toBeDefined();
});

const frozenRoot=process.env.FORGE_FROZEN_GENERATION_ROOT;
const frozenDraftRoot=process.env.FORGE_FROZEN_DRAFT_ROOT;
test.skipIf(!frozenDraftRoot)('actual saved v1/v2 candidate records revalidate unchanged through the current restore input boundary',async()=>{
  const rows:any[]=[],originalFetch=globalThis.fetch;globalThis.fetch=Object.assign(noCall,{preconnect:()=>{throw Error('This regression forbids network preconnect');}});
  try{
    for(const name of ['v1-record.json','v2-record.json']){
      const text=readFileSync(`${frozenDraftRoot}/${name}`,'utf8'),record=JSON.parse(text),before=structuredClone(record);
      const restored=await revalidateIntakeCandidate(record,record.input,Date.parse(record.savedAt)+1000);
      expect(restored).toEqual(before);expect(record).toEqual(before);expect(readFileSync(`${frozenDraftRoot}/${name}`,'utf8')).toBe(text);
      rows.push({file:name,storageVersion:record.version,generationContract:record.generationContract??null,checksum:record.checksum,unchanged:true});
    }
  }finally{globalThis.fetch=originalFetch;}
  if(process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT)writeFileSync(`${process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT}/frozen-draft-restoration.json`,JSON.stringify({status:'PASS',rows,actualNetwork:0},null,2)+'\n');
});
for(const caseId of ['ankheg','roper','unicorn','spirit-naga'])test.skipIf(!frozenRoot)(`four actual first replies: ${caseId} ${caseId==='unicorn'||caseId==='spirit-naga'?'matches its complete historical Actor without false findings':'preserves its full artifact except source-confirmed condition increments'}`,async()=>{
  const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
  const capture=read(`${frozenRoot}/browser/first-answer-final-capture.json`),identities=read(`${frozenRoot}/continuation-identities.json`);
  const manifest=read(`${frozenRoot}/sources/manifest.json`),entry=manifest.cases.find((row:any)=>row.id===caseId);
  expect(entry).toBeDefined();
  const files=[`${frozenRoot}/browser/first-answer-final-capture.json`,`${frozenRoot}/continuation-identities.json`,
    `${frozenRoot}/sources/manifest.json`,`${frozenRoot}/sources/${caseId}/source.md`,`${frozenRoot}/continuation-1/${caseId}/candidate.json`];
  const fileHash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const before=files.map((file:string)=>({file,sha256:fileHash(file)}));
  const originalFetch=globalThis.fetch;globalThis.fetch=Object.assign(noCall,{preconnect:()=>{throw Error('This regression forbids network preconnect');}});
  let comparison:any;
  try{
      const prior=capture.cases.find((row:any)=>row.id===entry.id),rawReply=prior.evidence[0].content;
      let requests=0;
      const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',apiKey:'fake-only',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,
        httpClient:async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:rawReply}}]}));}});
      const current={source:prior.capture.source,sourceName:entry.name,sourceScope:'single' as const,
        requestId:prior.capture.generation?.candidateResponse?.requestId??`forge-current-${entry.id}`,sourceId:identities[entry.id],fvttVersion:'14.368',systemVersion:'5.3.3'};
      const analysis=await analyzeBrowserActorSourceWithAi(current,actual),rawBefore=JSON.stringify(prior.capture.analysis.ir);
      const generated=await generateBrowserActorIntakeCandidate(current,analysis,actual);
      const old=read(`${frozenRoot}/continuation-1/${entry.id}/candidate.json`);
      const actor=generated.actorProjection as any;
      expect(analysis.status).toBe('ready_to_generate');expect(analysis.findings).toEqual([]);expect(generated.findings).toEqual([]);
      expectFrozenSourceDescriptions(actor,analysis.ir,caseId==='ankheg'?{'Acid Spray':'Acid Spray Recharge 6'}:{});
      let historical=actor;
      if(caseId==='ankheg'){
        const bite=actor.items.find((item:any)=>item.name==='Bite'),feature=analysis.ir!.creature.actions.find(item=>item.name==='Bite')!;
        const condition='If the target is a Large or smaller creature, it has the Grappled condition (escape DC 13).';
        expect(feature.description).toContain(condition);
        expectSourceConditionEffects(bite,'bite-attack',[{id:'9489713d62bf3628',status:'grappled',sourceText:feature.description,condition:condition+'\nDM确认此GM攻击已命中后应用状态模板。'}],
          {'2f728f60d7442be1':[{_id:'9489713d62bf3628'}]});
        expect(bite.system.activities['2f728f60d7442be1'].type).toBe('damage');
        historical=withoutApprovedConditionEffects(actor,[{item:'Bite',ids:['9489713d62bf3628']}]);
      }else if(caseId==='roper'){
        const tentacle=actor.items.find((item:any)=>item.name==='Tentacle'),feature=analysis.ir!.creature.actions.find(item=>item.name==='Tentacle')!;
        const condition='Hit: The target has the Grappled condition (escape DC 14) from one of six tentacles, and the target has the Poisoned condition until the grapple ends.';
        expect(feature.description).toContain(condition);
        expectSourceConditionEffects(tentacle,'tentacle-attack',[
          {id:'10a3876bc17465e8',status:'grappled',sourceText:feature.description,condition:condition+'\nDM确认此GM攻击已命中后应用状态模板。'},
          {id:'27683a3a3b0532ae',status:'poisoned',sourceText:feature.description,condition:condition+'\nDM确认此GM攻击已命中后应用状态模板。'},
        ],{'d3030315e29715c4':[{_id:'10a3876bc17465e8'},{_id:'27683a3a3b0532ae'}]});
        expect(tentacle.system.activities['d3030315e29715c4']).toMatchObject({type:'utility',roll:{formula:'1d20+7'},range:{value:60,units:'ft'},flags:{fvttJsonGenerator:{sourceOperation:{role:'attack-roll'}}}});
        expect(tentacle.system.activities['d3030315e29715c4'].damage).toBeUndefined();
        expect(Object.values<any>(tentacle.system.activities).filter(activity=>activity.type==='damage')).toEqual([]);
        historical=withoutApprovedConditionEffects(actor,[{item:'Tentacle',ids:['10a3876bc17465e8','27683a3a3b0532ae']}]);
      }else{
        const history=analysis.ir!.creature.candidateReview!;
        expect(history.findings).toEqual([]);
        expect((history.proposal as any).original).toEqual(parseStrictJson(rawReply));
        expect(generated.finalSource).not.toContain('intake-candidate-review');
        expect(actor.flags?.fvttJsonGenerator?.candidateReview).toBeUndefined();
      }
      expect(historical).toEqual(old);
      expect(generated.candidateAvailable).toBe(true);expect(generated.calls).toEqual({discovery:0,extraction:1,review:0,repair:0});
      expect(requests).toBe(1);expect(JSON.stringify(prior.capture.analysis.ir)).toBe(rawBefore);
      comparison={id:entry.id,baseline:'original continuation-1',beforeHash:hashArtifact(old),afterHash:hashArtifact(actor),items:old.items.length,
        fullArtifactEqual:caseId==='unicorn'||caseId==='spirit-naga',historicalViewEqual:true,approvedIncrement:caseId==='ankheg'?['bite Grappled template and damage link']:caseId==='roper'?['tentacle Grappled/Poisoned templates and no-damage attack-roll links']:[],fakeResponseReads:requests,review:0,repair:0};
  }finally{globalThis.fetch=originalFetch;}
  for(const file of before)expect(fileHash(file.file)).toBe(file.sha256);
  if(process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT)writeFileSync(`${process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT}/frozen-first-reply-${caseId}.json`,JSON.stringify({status:'PASS',comparison,originalFilesUnchanged:before,actualNetwork:0},null,2)+'\n');
});

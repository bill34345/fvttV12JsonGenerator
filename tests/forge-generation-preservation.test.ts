import {test,expect} from 'bun:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate,approveBrowserActorIntakeCandidateForGm} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {revalidateIntakeCandidate} from '../foundry-modules/fvtt-json-forge/src/intakeCandidateRecovery';
import {renderMonsterIntakeMarkdown,prepareMonsterCandidateDelivery} from '@fvtt-json-generator/intake-ai/renderer';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import ankheg from './fixtures/forge-2024-ankheg-shared-proof.json';

const noCall=async():Promise<never>=>{throw Error('Model requests are forbidden');};
const provider={providerName:'frozen',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
const input={source:LURKER_SOURCE,sourceName:'preserved candidate',requestId:'preservation-regression',sourceId:'actor:v1:362fd104-ae9b-48ba-b057-c9fbe4789d87' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
const analyze=(current=input)=>analyzeBrowserActorIntakeDraft(current,buildValidLurkerIr(),provider);

test('the former delivery fallback preserves every original field even for invalid operations and literal=true callers',()=>{
  const ir=structuredClone(ankheg.ir);ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.formula='not a die';
  const before=structuredClone(ir);
  for(const literal of [false,true]){
    const result=prepareMonsterCandidateDelivery(ir as any,ankheg.source,literal);
    expect(result.ir).toEqual(before);expect(result.findings).toEqual([]);expect(ir).toEqual(before);
  }
});

test('invalid operation conversion reports no Actor and retains complete source, attack, damage and other abilities',async()=>{
  const ir=structuredClone(ankheg.ir);ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.formula='not a die';
  const current={...input,source:ankheg.source},analysis=analyzeBrowserActorIntakeDraft(current,ir as any,provider),before=structuredClone(analysis);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.status).toBe('failed');expect(result.candidateAvailable).toBe(false);expect(result.candidateResponse).toBeUndefined();
  expect(result.analysis.ir).toEqual(before.ir);expect(result.analysis.evidence).toEqual(before.evidence);
  expect(result.analysis.candidate?.quote).toBe(ankheg.source);expect(analysis).toEqual(before);
  expect(result.findings.some(f=>f.code==='FORGE_WORKFLOW_FAILED')).toBe(true);
  expect(result.findings.some(f=>/LITERAL_DELIVERY/u.test(f.code))).toBe(false);
});

test('malformed canonical Markdown reports its rendering failure without retrying or rewriting the source',async()=>{
  let renders=0;const malformed='---\n名称: [unterminated\n---\n';
  const current={...input,renderMarkdown:()=>{renders++;return malformed;}},analysis=analyze(current),before=structuredClone(analysis.ir);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.status).toBe('failed');expect(result.candidateAvailable).toBe(false);expect(result.candidateResponse).toBeUndefined();
  expect(result.analysis.ir).toEqual(before);expect(result.analysis.candidate?.quote).toBe(LURKER_SOURCE);expect(renders).toBe(1);
  expect(result.findings.some(f=>f.code==='CANONICAL_RENDER_FAILED'&&f.message.includes('规范资料转换失败'))).toBe(true);
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
  const rows:any[]=[],originalFetch=globalThis.fetch;globalThis.fetch=noCall as typeof fetch;
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
test.skipIf(!frozenRoot)('four actual first replies preserve their complete previous formal artifacts through the simplified provider chain',async()=>{
  const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
  const capture=read(`${frozenRoot}/browser/first-answer-final-capture.json`),identities=read(`${frozenRoot}/continuation-identities.json`);
  const manifest=read(`${frozenRoot}/sources/manifest.json`),rows:any[]=[];
  const files=[`${frozenRoot}/browser/first-answer-final-capture.json`,`${frozenRoot}/continuation-identities.json`,
    ...manifest.cases.flatMap((entry:any)=>[`${frozenRoot}/sources/${entry.id}/source.md`,`${frozenRoot}/continuation-1/${entry.id}/candidate.json`])];
  const fileHash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const before=files.map((file:string)=>({file,sha256:fileHash(file)}));
  const originalFetch=globalThis.fetch;globalThis.fetch=noCall as typeof fetch;
  try{
    for(const entry of manifest.cases){
      const prior=capture.cases.find((row:any)=>row.id===entry.id),rawReply=prior.evidence[0].content;
      let requests=0;
      const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',apiKey:'fake-only',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,
        httpClient:async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:rawReply}}]}));}});
      const current={source:prior.capture.source,sourceName:entry.name,sourceScope:'single' as const,
        requestId:prior.capture.generation?.candidateResponse?.requestId??`forge-current-${entry.id}`,sourceId:identities[entry.id],fvttVersion:'14.368',systemVersion:'5.3.3'};
      const analysis=await analyzeBrowserActorSourceWithAi(current,actual),rawBefore=JSON.stringify(prior.capture.analysis.ir);
      const generated=await generateBrowserActorIntakeCandidate(current,analysis,actual);
      const old=read(`${frozenRoot}/continuation-1/${entry.id}/candidate.json`);
      expect(generated.actorProjection).toEqual(old);expect(generated.findings).toEqual([]);
      expect(generated.candidateAvailable).toBe(true);expect(generated.calls).toEqual({discovery:0,extraction:1,review:0,repair:0});
      expect(requests).toBe(1);expect(JSON.stringify(prior.capture.analysis.ir)).toBe(rawBefore);
      rows.push({id:entry.id,beforeHash:hashArtifact(old),afterHash:hashArtifact(generated.actorProjection as any),items:old.items.length,fullArtifactEqual:true,fakeResponseReads:requests,review:0,repair:0});
    }
  }finally{globalThis.fetch=originalFetch;}
  for(const file of before)expect(fileHash(file.file)).toBe(file.sha256);
  expect(rows).toHaveLength(4);
  if(process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT)writeFileSync(`${process.env.FORGE_SIMPLIFICATION_EVIDENCE_ROOT}/frozen-four-artifact-comparison.json`,JSON.stringify({status:'PASS',rows,originalFilesUnchanged:before,actualNetwork:0},null,2)+'\n');
});

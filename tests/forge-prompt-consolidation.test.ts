import {describe,test,expect} from 'bun:test';
import {OpenAICompatibleMonsterIntakeProvider,INTAKE_PROMPT_VERSIONS} from '@fvtt-json-generator/intake-ai/provider';
import {buildRatWarlockIr,RAT_WARLOCK_SOURCE} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {FULL_IR_SOURCE_OPERATION_SCHEMA,SOURCE_OPERATION_SCHEMA} from '../packages/intake-ai/src/source-operation-contract';

const source=RAT_WARLOCK_SOURCE,candidate={id:'one',label:'Fixture',start:0,end:source.length,quote:source};
function fixture(stage:'extract'|'review'|'repair',answer:unknown){
 const bodies:any[]=[];
 const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid',apiKey:'fixture-only',model:'fixture',reviewModel:'fixture',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,evidenceAnchoring:'exact-quotes',httpClient:async(_url,init)=>{
  bodies.push(JSON.parse(String(init.body)));return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(answer)}}]})};}});
 const read=()=>{expect(bodies).toHaveLength(1);const body=bodies[0];return{system:body.messages.find((m:any)=>m.role==='system').content as string,payload:JSON.parse(body.messages.find((m:any)=>m.role==='user').content)};};
 return{provider,read};
}

describe('default complete-IR prompts follow the AI/content and program/preservation boundary',()=>{
 test('extract sends one source with one quote protocol and no legacy stage catalogs',async()=>{
  const ir=buildRatWarlockIr(),before=structuredClone(ir),{provider,read}=fixture('extract',ir);
  const result=await provider.extract({source,sourceSha256:ir.source.sha256,candidate});const {system,payload}=read();
  expect(payload).toEqual({source,sourceSha256:ir.source.sha256,candidate:{id:candidate.id,label:candidate.label,start:0,end:source.length},sourceLength:source.length});
  for(const field of ['sourceLines','sourceProofClauses','sourceSpellGrants','sourceInventory','template'])expect(payload).not.toHaveProperty(field);
  expect(system).toContain('EvidenceRef is {start:-1,end:-1,quote:string}');
  for(const stale of ['firstLineId','lastLineId','clauseId','request.sourceProofClauses','sourceInventory','FEATURE response','manual/facts:{}','MISSING_SOURCE_FEATURES','multiple unqualified spells remain complete manualGrants'])expect(system).not.toContain(stale);
  expect(system).toContain('The literal word Shared/each is not required');
  expect(system).toContain('Unmapped casting qualifiers remain complete GM restrictions');
  expect(system).toContain('supplies empty claims/coverage records when omitted');
  expect(system).toContain(FULL_IR_SOURCE_OPERATION_SCHEMA);
  expect(system).toContain('target:{type:self|creature|any,count?:number');
  expect(system).not.toContain('target:{type:self|creature,count:1');
  expect(system).not.toContain('failureStatuses?:');
  expect(SOURCE_OPERATION_SCHEMA).toContain('target:{type:self|creature,count:1');
  expect(SOURCE_OPERATION_SCHEMA).toContain('failureStatuses?:');
  expect(system).toContain('a wholly manual feature adds activityType:utility,executionMode:gm-manual without sourceOperations');
  expect(system).not.toContain('ordinary-gear-out-of-scope');
  expect(system).toContain('Use sourceOperations for every executable basic');
  expect(system).toContain('近战攻击检定／远程攻击检定');
  expect(system).not.toContain('Flat attack:');
  expect(result.creature).toEqual(before.creature);expect(ir).toEqual(before);
  // Guard against accidentally appending the complete legacy instructions.
  // This is a character budget, not a token/cost/quality claim.
  expect(system.length).toBeLessThan(20000);
  expect(INTAKE_PROMPT_VERSIONS.extract).toBe('monster-intake-extract-v54-prompt-consolidation');
 });
 test('review uses program scope even with an empty model coverage ledger',async()=>{
  const ir=buildRatWarlockIr();ir.coverage=[];const {provider,read}=fixture('review',{schemaVersion:1,verdict:'accepted',findings:[]});
  await provider.review({source,candidate,ir,markdown:'',actorProjection:{},deterministicFindings:[]});const {system,payload}=read();
  expect(payload.candidate).toEqual({id:candidate.id,label:candidate.label,start:0,end:source.length});expect(payload.ir.coverage).toEqual([]);
  expect(system).toContain('model-authored coverage ledger must not shrink');
  expect(system).toContain('Abyssal/深渊语 maps to abyssal');expect(system).toContain('Deep Speech/深潜语 maps to deep');
  expect(system.length).toBeLessThan(8000);
 });
 test('repair has one Patch output contract and preserves request-owned scope',async()=>{
  const ir=buildRatWarlockIr(),{provider,read}=fixture('repair',{schemaVersion:1,operations:[]});
  const result=await provider.repair({stage:'deterministic-validation',source,candidate,ir,deterministicFindings:[]});const {system,payload}=read();
  expect(payload.candidate).toEqual({id:candidate.id,label:candidate.label,start:0,end:source.length});
  expect(system).toContain('Return exactly {schemaVersion:1,operations:');expect(system).not.toContain('Return exactly {schemaVersion:1,source:');
  expect(system).toContain('never edit request source identity, final Actor JSON');expect(system).toContain('at most 64');expect(result).toEqual(ir);
  expect(system).toContain('actual nonempty historical records with valid references');
  expect(system).toContain('Historical flat Feature fields and failureStatuses remain readable');
  expect(system).toContain('ordinary-gear-out-of-scope');
  expect(system).not.toContain('Return the canonical IR');
  expect(system.length).toBeLessThan(21000);
 });
 test('review anchors a quote unique inside the selected candidate even when another creature repeats it',async()=>{
  const scopedSource='Alpha\nShared rule.\nBeta\nShared rule.',start=scopedSource.indexOf('Beta');
  const scopedCandidate={id:'beta',label:'Beta',start,end:scopedSource.length,quote:scopedSource.slice(start)};
  const answer={schemaVersion:1,verdict:'revise',findings:[{id:'one',code:'CONTENT',path:'/creature',message:'Concrete content defect',blocking:true,evidence:[{start:-1,end:-1,quote:'Shared rule.'}]}]};
  const {provider}=fixture('review',answer);
  const result=await provider.review({source:scopedSource,candidate:scopedCandidate,ir:buildRatWarlockIr(),markdown:'',actorProjection:{},deterministicFindings:[]});
  expect(result.findings[0]!.evidence).toEqual([{start:scopedSource.lastIndexOf('Shared rule.'),end:scopedSource.length,quote:'Shared rule.'}]);
  expect(answer.findings[0]!.evidence[0]!.start).toBe(-1);
 });
 test('default quote anchoring resolves exact unique source without changing mechanics',async()=>{
  const ir=buildRatWarlockIr(),expected=structuredClone(ir),ref=ir.creature.spellcasting![0]!.evidence[0]!;
  ref.start=-1;ref.end=-1;const {provider}=fixture('extract',ir);
  const result=await provider.extract({source,sourceSha256:ir.source.sha256,candidate});
  expect(result.creature).toEqual(expected.creature);expect(ir.creature.spellcasting![0]!.evidence[0]!.start).toBe(-1);
 });
 test('historical Line references remain readable without requesting that protocol again',async()=>{
  const ir=buildRatWarlockIr();(ir.creature.actions[0] as any).description={firstLineId:'L1',lastLineId:'L1'};
  (ir.creature.actions[0] as any).evidence=[{firstLineId:'L1',lastLineId:'L1'}];const {provider,read}=fixture('extract',ir);
  const result=await provider.extract({source,sourceSha256:ir.source.sha256,candidate}),first=source.split(/\r?\n/u)[0]!;
  expect(result.creature.actions[0]!.description.trim()).toBe(first.trim());expect(result.creature.actions[0]!.attack).toEqual(ir.creature.actions[0]!.attack);
  expect(read().payload).not.toHaveProperty('sourceLines');
 });
 test('a real AI uncertainty is retained rather than cleared by the shorter instructions',async()=>{
  const ir=buildRatWarlockIr();ir.uncertainties=[{id:'ai-note',code:'AI_UNCERTAIN',path:'/creature',message:'AI cannot decide this reading.',blocking:true,evidence:[]}];
  const {provider}=fixture('extract',ir);const result=await provider.extract({source,sourceSha256:ir.source.sha256,candidate});
  expect(result.uncertainties).toEqual(ir.uncertainties);
 });
});

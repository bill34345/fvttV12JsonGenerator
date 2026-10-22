import {describe,test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {hashSource,hashArtifact,decodeForgeActorResponse} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate,generateAndReviewBrowserActorIntake,approveBrowserActorIntakeCandidateForGm,reviewBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {buildForgeIntakeReviewBundleV2,serializeForgeIntakeReviewBundleV2,decodeForgeIntakeReviewBundleText} from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {encodeForgeEncounterPackageZip,decodeForgeEncounterPackageZip,serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';

const input={source:LURKER_SOURCE,sourceName:'candidate fixture',requestId:'candidate-output',fvttVersion:'14.364',systemVersion:'5.3.3'};
const noCall=async():Promise<never>=>{throw Error('Unexpected model request');};
function fixture(){
  const ir=buildValidLurkerIr();
  ir.creature.attributes.hp.value=999;
  ir.uncertainties.push({id:'unresolved',code:'FIXTURE_REVIEW',path:'/creature/attributes/hp',message:'HP needs source review',blocking:true,evidence:[]});
  const provider:MonsterIntakeAiProvider={providerName:'offline',extractionModel:'frozen',reviewModel:'frozen',discover:async()=>({schemaVersion:1,candidates:[{id:'fixture',label:'fixture',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE}]}),extract:async()=>structuredClone(ir),repair:noCall,review:noCall};
  return{ir,provider};
}
describe('Forge candidate delivery is separate from verification',()=>{
  test('ordinary Actor retains source, useful mechanics and strict findings through explicit GM approval',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    expect(analysis.status).toBe('needs_review');
    const result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    expect(result.status).toBe('ready_for_gm_review');expect(result.candidateAvailable).toBe(true);
    expect(result.intakeVerificationStatus).toBe('needs_review');
    expect(result.findings.some(f=>f.blocking)).toBe(true);
    expect((result.actorProjection as any).system.attributes.hp.max).toBe(999);
    expect((result.actorProjection as any).items.length).toBeGreaterThan(3);
    const approved=approveBrowserActorIntakeCandidateForGm(input,result,'gm');
    expect(approved.status).not.toBe('accepted');expect(approved.gmApproval?.artifactHash).toBe(hashArtifact(result.actorProjection as any));
    expect(approved.findings).toEqual(result.findings);
    expect(decodeForgeActorResponse(result.candidateResponse).ok).toBe(true);
  });
  test('failed optional AI review leaves the exact candidate and all local findings available',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const candidate=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    const reviewed=await reviewBrowserActorIntakeCandidate(input,candidate,provider);
    expect(reviewed.modelReviewStatus).toBe('failed');expect(reviewed.candidateHash).toBe(candidate.candidateHash);
    expect(reviewed.candidateResponse).toEqual(candidate.candidateResponse);expect(reviewed.findings).toEqual(candidate.findings);
  });
  test('combined generation and optional review retains a generated candidate when that review fails',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const generated=await generateAndReviewBrowserActorIntake(input,analysis,provider);
    expect(generated.candidateAvailable).toBe(true);expect(generated.modelReviewStatus).toBe('failed');
    expect(generated.candidateResponse).toBeDefined();expect(generated.actorProjection).toBeDefined();
    expect(generated.finalSource).toContain('intake-candidate-review');expect(generated.findings.some(f=>f.blocking)).toBe(true);
  });
  test('current source identity remains mandatory even for a user-reviewed candidate',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const candidate=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    expect(()=>approveBrowserActorIntakeCandidateForGm({...input,source:input.source+'\n'},candidate,'gm')).toThrow();
  });
  test('encounter default makes no repair/review call and exports a re-preparable candidate package',async()=>{
    const {provider}=fixture();
    const output=await generateEncounterFromHumanMarkdown({source:LURKER_SOURCE,label:'unresolved source',provider,
      automationProvider:{generate:noCall,review:noCall},reviewPolicy:'deferred'});
    expect(output.report.status).toBe('ready_for_gm_review');expect(output.prepared?.actors.length).toBe(1);
    expect(output.report.findings.length).toBeGreaterThan(0);
    const bundle=await decodeForgeEncounterPackageZip(await encodeForgeEncounterPackageZip(output.prepared!.bundle));
    const restored=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    expect(restored.actors[0]!.artifactHash).toBe(output.prepared!.actors[0]!.artifactHash);
    expect(restored.actors[0]!.status).not.toBe('accepted');expect(restored.reviewFindings!.length).toBeGreaterThan(0);
    expect(JSON.stringify(restored.actors[0]!.artifact)).toContain('FIXTURE_REVIEW');
  });
  test('source review feedback survives default-off generation, package export and fresh preparation',async()=>{
    const {provider}=fixture(),ir=buildValidLurkerIr();
    const output=await generateEncounterFromHumanMarkdown({source:LURKER_SOURCE,label:'feedback',provider,reviewPolicy:'deferred',
      drafts:[{key:'actor-1',source:LURKER_SOURCE,ir}],draftParentHash:hashSource('prior'),
      sourceFeedback:[{actorKey:'actor-1',path:'/creature/attributes/hp',message:'HP must be checked against the original source'}],
      automationProvider:{generate:noCall,review:noCall}});
    expect(output.prepared).toBeDefined();
    const restored=await prepareForgeEncounter(serializeForgeEncounterPackage(output.prepared!.bundle));
    expect(restored.actors[0]!.status).toBe('needs_review');
    expect(JSON.stringify(restored.actors[0]!.artifact)).toContain('SOURCE_REVIEW_FEEDBACK');
    expect(JSON.stringify(restored.actors[0]!.artifact)).toContain('HP must be checked');
    expect(restored.reviewFindings!.join('\n')).toContain('SOURCE_REVIEW_FEEDBACK');
  });
  test('portable review exports remain truthful and readable before and after GM adopts an unaccepted Actor',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const candidate=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    const response=candidate.candidateResponse!;if(!('result'in response)||!response.result.artifact)throw Error('Expected candidate');
    const result=response.result,target=result.target;
    const base={objectKind:'actor' as const,mode:'ai-monster' as const,requestId:response.requestId,attemptId:analysis.attemptId,
      rawSource:input.source,rawSourceHash:hashSource(input.source),canonicalSource:candidate.finalSource!,candidateHash:candidate.candidateHash,
      sourceIdentity:{sourceId:result.sourceIdentity.sourceId,finalSourceHash:candidate.finalSourceHash!},
      target:{generatorVersion:target.generatorVersion,fvttVersion:target.fvttRuntimeVersion,systemId:target.systemId,systemVersion:target.systemVersionObserved,generatorProfile:target.generatorProfile,effectProfile:target.effectProfile,iconMode:target.iconMode},
      calls:candidate.calls,modelReviewStatus:candidate.modelReviewStatus,deterministicFindings:candidate.deterministicFindings,
      candidateResponse:{requestId:response.requestId,status:result.status,artifactHash:hashArtifact(result.artifact),verificationStatus:result.verification.status,
        diagnostics:result.diagnostics.map(d=>({severity:d.severity,code:d.code,message:d.message}))}};
    const preview=buildForgeIntakeReviewBundleV2({...base,status:'ready_for_gm_review'});
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(preview)).bundle.status).toBe('ready_for_gm_review');
    const approved=approveBrowserActorIntakeCandidateForGm(input,candidate,'gm');
    const adopted=buildForgeIntakeReviewBundleV2({...base,status:'reviewed_candidate',gmApproval:approved.gmApproval});
    const saved=decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(adopted)).bundle;
    expect(saved.status).toBe('reviewed_candidate');expect(saved.candidateResponse!.status).not.toBe('accepted');
    expect(saved.deterministicFindings.some(f=>f.blocking)).toBe(true);expect(saved.gmApproval!.gmId).toBe('gm');
    expect(()=>buildForgeIntakeReviewBundleV2({...base,status:'accepted',gmApproval:approved.gmApproval})).toThrow();
  });
});

// Private captures are optional for clean checkouts. The current worktree runs
// them unchanged; this code never calls a live provider or writes the captures.
for(const {caseId,captureRoot,meterPath} of [
  ...['N2','N3'].map(caseId=>({caseId,captureRoot:'.local/forge-new-three-paired-20261022',meterPath:`chrome/meter-after-${caseId}.json`})),
])test.skipIf(!existsSync(`${captureRoot}/${meterPath}`))(`frozen ${caseId} reaches actual Forge candidate/package with corrections disabled`,async()=>{
  const source=readFileSync(`${captureRoot}/${caseId}/source.md`,'utf8');
  const meter=JSON.parse(readFileSync(`${captureRoot}/${meterPath}`,'utf8'));
  // The original N2 tail is normalized locally. Never consume its historical
  // model correction or alter the saved request/correction record.
  const answers=meter.requests.filter((q:any)=>q.caseId===caseId).slice(0,2).map((q:any)=>q.replies[0].content);
  const originalFetch=globalThis.fetch;let count=0;
  globalThis.fetch=Object.assign(async()=>{
    if(count>=answers.length)throw Error('Unexpected extra correction or real network');
    const content=answers[count++];
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:originalFetch.preconnect});
  try{
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'frozen',protocol:'openai-chat',timeoutMs:1000,autoCorrect:false});
    const output=await generateEncounterFromHumanMarkdown({source,label:caseId,...providers,reviewPolicy:'deferred'});
    expect(count).toBe(2);expect(output.prepared?.actors).toHaveLength(1);
    expect(output.report.findings).toEqual([]);
    expect(output.prepared!.actors[0]!.status).toBe('accepted');
    const actor=output.prepared!.actors[0]!.artifact as any;
    if(caseId==='N3')expect(actor.items.length).toBeGreaterThan(5);
    else{
      expect(actor.items).toHaveLength(3);
      expect(actor.items.map((item:any)=>item.name)).toContain('Spiritual Weapon (2/Day)');
      const groups=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups;
      expect(groups.flatMap((group:any)=>group.spellRefs)).toHaveLength(5);
      const spiritual=groups.find((group:any)=>group.spellRefs.some((ref:any)=>ref.identifier==='spiritual-weapon'));
      expect(spiritual.spellRefs).toHaveLength(1);
      expect(spiritual.spellRefs[0]).toMatchObject({method:'innate',uses:{value:2,recovery:'day',shared:false}});
      expect(spiritual).toMatchObject({ability:'wis',saveDc:12,attackBonus:4});
    }
    expect(actor.items.some((item:any)=>Object.values<any>(item.system?.activities??{}).some(activity=>['damage','attack'].includes(activity.type)))).toBe(true);
    expect(output.prepared!.bundle.actors[0]!.sourceHash).toBe(hashSource(output.prepared!.bundle.actors[0]!.source));
  }finally{globalThis.fetch=originalFetch;}
});

import {describe,test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {hashSource,hashArtifact,decodeForgeActorResponse} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate,generateAndReviewBrowserActorIntake,approveBrowserActorIntakeCandidateForGm,reviewBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {buildForgeIntakeReviewBundleV2,serializeForgeIntakeReviewBundleV2,decodeForgeIntakeReviewBundleText} from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {encodeForgeEncounterPackageZip,decodeForgeEncounterPackageZip,serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {actorReadbackWarnings} from '../foundry-modules/fvtt-json-forge/src/runtime';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';
import {prepareMonsterCandidateDelivery} from '../packages/intake-ai/src/candidate-delivery';
import {ORDINARY_GEAR_IGNORE_REASON} from '../packages/intake-ai/src/monster-gear-policy';
import {validateMonsterIntakeIR,auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';

const input={source:LURKER_SOURCE,sourceName:'candidate fixture',requestId:'candidate-output',fvttVersion:'14.364',systemVersion:'5.3.3'};
const noCall=async():Promise<never>=>{throw Error('Unexpected model request');};

// Regeneration deliberately adds program-owned literal metadata, deterministic
// activity IDs and literal HTML. Compare native mechanics separately from those
// display/identity representations; the default verifier checks IR links/text.
function frozenNativeMechanics(value:any):any {
  if(Array.isArray(value))return value.map(frozenNativeMechanics);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key,entry])=>{
    if(['_id','_stats','img','name','description','flags'].includes(key))return[];
    if(key==='activities')return[[key,Object.values(entry as any).map(frozenNativeMechanics).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]];
    return[[key,frozenNativeMechanics(entry)]];
  }));
}
function expectFrozenMechanics(actual:any,expected:any):void{
  expect(actual.name).toBe(expected.name);expect(actual.items.map((item:any)=>item.name)).toEqual(expected.items.map((item:any)=>item.name));
  expect(frozenNativeMechanics(actual)).toEqual(frozenNativeMechanics(expected));
}

describe('monster output intentionally omits ordinary inventory',()=>{
  function inventory(quote:string,reason=ORDINARY_GEAR_IGNORE_REASON){
    const source=LURKER_SOURCE+'\n'+quote,ir=buildValidLurkerIr();
    ir.source={sha256:hashSource(source),length:source.length};
    ir.coverage.push({start:LURKER_SOURCE.length,end:source.length,quote:'\n'+quote,
      classification:'ignored-with-reason',claimPaths:[],reason});
    return{source,ir};
  }
  test('scope-labelled ordinary gear is valid coverage without an omission warning or data rewrite',async()=>{
    const {source,ir}=inventory('Gear Shield, Spears (3), Studded Leather Armor'),before=JSON.stringify(ir);
    expect(validateMonsterIntakeIR(source,ir).findings.filter(f=>f.path.startsWith('/coverage'))).toEqual([]);
    const delivery=prepareMonsterCandidateDelivery(ir,source);
    expect(delivery.findings.filter(f=>f.code==='SOURCE_PART_NOT_PROJECTED')).toEqual([]);
    const {provider}=fixture(),current={...input,source},analysis=analyzeBrowserActorIntakeDraft(current,ir,provider);
    const result=await generateBrowserActorIntakeCandidate(current,analysis,provider),actor=result.actorProjection as any;
    expect(result.findings.filter(f=>f.code==='SOURCE_PART_NOT_PROJECTED')).toEqual([]);
    expect(actor.system.attributes.ac).toMatchObject({calc:'flat',flat:ir.creature.attributes.ac});
    expect(actor.items.some((item:any)=>['equipment','loot'].includes(item.type))).toBe(false);
    expect(actor.items.some((item:any)=>/^(?:Shield|Spear|Studded Leather Armor)$/u.test(item.name))).toBe(false);
    expect(actor.items.find((item:any)=>item.name.includes(ir.creature.actions[0]!.name))?.type).toBe('feat');
    expect(JSON.stringify(ir)).toBe(before);
  });
  test('default delivery preserves AI classification without rereading raw magic or combat text',()=>{
    for(const quote of ['Gear Spear +1','Shield Bash. DC 15 Strength saving throw. Failure: 2d4 + 4 damage.']){
      const {source,ir}=inventory(quote,'unresolved mechanic'),before=structuredClone(ir);
      expect(prepareMonsterCandidateDelivery(ir,source).findings).toEqual([]);
      expect(ir).toEqual(before);
    }
    const {source,ir}=inventory('Gear Shield');ir.coverage.at(-1)!.start++;
    expect(validateMonsterIntakeIR(source,ir).findings.some(f=>f.code==='EVIDENCE_MISMATCH')).toBe(true);
  });
  test('legacy omission judgment is explicit source audit, never the default structure check',()=>{
    const {source,ir}=inventory('Actions\nShield Bash. Strength Saving Throw: DC 15, one creature. Failure: 9 (2d4 + 4) Bludgeoning damage.');
    expect(validateMonsterIntakeIR(source,ir).findings.some(f=>f.code==='SOURCE_FEATURE_OMITTED')).toBe(false);
    expect(auditMonsterIntakeSource(source,ir).findings.some(f=>f.code==='SOURCE_FEATURE_OMITTED')).toBe(true);
  });
});
function fixture(){
  const ir=buildValidLurkerIr();
  ir.creature.attributes.hp.value=999;
  ir.uncertainties.push({id:'unresolved',code:'FIXTURE_REVIEW',path:'/creature/attributes/hp',message:'HP needs source review',blocking:true,evidence:[]});
  const provider:MonsterIntakeAiProvider={providerName:'offline',extractionModel:'frozen',reviewModel:'frozen',discover:async()=>({schemaVersion:1,candidates:[{id:'fixture',label:'fixture',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE}]}),extract:async()=>structuredClone(ir),repair:noCall,review:noCall};
  return{ir,provider};
}

// Exact UI IR from the preceding genuine AI run. Never edit the captures or
// substitute fixture output for a new model reply.
const gearCapture=process.env.FORGE_GEAR_POLICY_CAPTURE;
for(const name of ['gladiator','priest'])test.skipIf(!gearCapture)(`saved gear-policy ${name}: source checks clear without changing the Actor`,async()=>{
  const read=(suffix:string)=>JSON.parse(readFileSync(`${gearCapture}/${name}-${suffix}.json`,'utf8'));
  const ir=read('source-ir'),source=read('ui-pre')[6],oldActor=read('candidate'),before=JSON.stringify(ir);
  expect(validateMonsterIntakeIR(source,ir).findings).toEqual([]);
  const provider={...fixture().provider,discover:noCall,extract:noCall},current={...input,source,requestId:'gear-check-'+name};
  const result=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider);
  expect(result.findings).toEqual([]);expectFrozenMechanics(result.actorProjection,oldActor);expect(JSON.stringify(ir)).toBe(before);
  expect(result.calls.extraction).toBe(0);expect(result.calls.review).toBe(0);expect(result.calls.repair).toBe(0);
  if(name==='priest')for(const mutate of [(p:any)=>{p.creature.spellcasting[1].saveDc=14;},(p:any)=>{p.creature.spellcasting[1].ability='cha';},(p:any)=>{p.creature.spellcasting[1].usageGroups[0].count=4;},(p:any)=>{p.creature.spellcasting[1].usageGroups[0].usage='daily-each';},(p:any)=>{p.creature.spellcasting[1].usageGroups[0].spellRefs.pop();}]){
    const changed=structuredClone(ir);mutate(changed);expect(verifyMonsterIntake(source,changed,renderMonsterIntakeMarkdown(changed),oldActor).findings.some(f=>f.blocking)).toBe(true);
  }
});
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
    expect(JSON.stringify(restored.actors[0]!.artifact)).not.toContain('FIXTURE_REVIEW');
    expect(restored.reviewFindings!.join('\n')).toContain('FIXTURE_REVIEW');
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
    expect(JSON.stringify(restored.actors[0]!.artifact)).not.toContain('SOURCE_REVIEW_FEEDBACK');
    expect(JSON.stringify(restored.actors[0]!.artifact)).not.toContain('HP must be checked');
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
      calls:candidate.calls,modelReviewStatus:candidate.modelReviewStatus,deterministicFindings:candidate.deterministicFindings?.map(finding=>({...finding,evidence:finding.evidence??[]})),
      candidateResponse:{requestId:response.requestId,status:result.status,artifactHash:hashArtifact(result.artifact!),verificationStatus:result.verification.status,
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

// Replays the four real DS extraction results from the preserved first pass.
// This verifies delivery changes, not a new model run or prompt success rate.
const officialCapture=process.env.FORGE_OFFICIAL_2024_CAPTURE;
const emanationCapture=process.env.FORGE_EMANATION_CAPTURE;
for(const suffix of ['','/repaired'])test.skipIf(!emanationCapture)(`frozen Fire Elemental${suffix}: singleton proof recovery changes only Self range and its proof wrapper`,async()=>{
  const base=`${emanationCapture}/two-followups-en-zh/fire-elemental-en/browser`,directory=base+suffix;
  const ir=JSON.parse(readFileSync(`${directory}/source-ir.json`,'utf8')),before=structuredClone(ir),saved=JSON.parse(readFileSync(`${directory}/candidate.json`,'utf8'));
  const raw=readFileSync(`${directory}/source.md`,'utf8'),pre=JSON.parse(readFileSync(`${base}/ui-pre.json`,'utf8'));
  const source=[raw,raw.trim(),raw.replaceAll('\r\n','\n').trim(),...pre.filter((s:unknown)=>typeof s==='string')].find(s=>s.length===ir.source.length&&hashSource(s)===ir.source.sha256)!;
  expect(source).toBeDefined();let localResponses=0;
  // Replay the saved structured result through the actual provider parser.
  // This adapter never sends HTTP or claims a new model/prompt success.
  const replay=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'fixture-only',baseUrl:'https://fixture.invalid',model:'saved-reply',reviewModel:'saved-reply',timeoutMs:60000,repairTimeoutMs:60000,httpClient:async()=>{
    localResponses++;return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(ir)}}]})};
  }});
  const normalized=await replay.extract({source,sourceSha256:hashSource(source),candidate:{id:'frozen',label:'Fire Elemental',start:0,end:source.length,quote:source}});
  const expectedIr=structuredClone(ir),quote=expectedIr.creature.traits[0].sourceOperations[0].proof.aoe;
  expect(quote).toHaveLength(1);expect(typeof quote[0]).toBe('string');expectedIr.creature.traits[0].sourceOperations[0].proof.aoe=quote[0];
  expect(normalized).toEqual(expectedIr);expect(ir).toEqual(before);expect(localResponses).toBe(1);
  const provider={...fixture().provider,discover:noCall,extract:noCall,review:noCall,repair:noCall},current={...input,source,requestId:'fire-proof-recovery'+suffix};
  const generated=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,normalized,provider),provider);
  expect(generated.candidateAvailable).toBe(true);expect(generated.findings).toEqual([]);
  // Only mutate a test expectation, never a generated Actor or frozen file.
  const expected=structuredClone(saved),aura=expected.items.find((item:any)=>item.name==='Fire Aura'),activity=Object.values<any>(aura.system.activities)[0]!;
  expect(activity.range).toMatchObject({units:'spec',special:'GM 按原文目标或效应位置确定范围。'});
  activity.range.units='self';activity.range.special='';aura.flags.fvttJsonGenerator.manualRule.sourceOperations[0].proof.aoe=quote[0];
  expectFrozenMechanics(generated.actorProjection,expected);expect(generated.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
});
for(const caseId of ['balor-2024','behir-2024','druid-2024'])test.skipIf(!emanationCapture)(`2024 area representation keeps frozen ${caseId} data and complete non-area fields`,async()=>{
  const directory=caseId==='balor-2024'?`${emanationCapture}/balor-2024-third/browser`:`${emanationCapture}/bounded-expansion/new-three-browser/${caseId}`;
  const ir=JSON.parse(readFileSync(`${directory}/source-ir.json`,'utf8')),before=structuredClone(ir),saved=JSON.parse(readFileSync(`${directory}/candidate.json`,'utf8'));
  const pre=JSON.parse(readFileSync(`${directory}/ui-pre.json`,'utf8'));
  const raw=readFileSync(`${directory}/source.md`,'utf8');
  const source=[raw,raw.trim(),raw.replaceAll('\r\n','\n').trim(),...pre.filter((s:unknown)=>typeof s==='string')].find(s=>s.length===ir.source.length&&hashSource(s)===ir.source.sha256)!;
  expect(source).toBeDefined();
  const provider={...fixture().provider,extract:noCall,discover:noCall,review:noCall,repair:noCall},current={...input,source,requestId:'emanation-'+caseId};
  const generated=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider),actor=generated.actorProjection as any;
  expect(generated.candidateAvailable).toBe(true);expect(ir).toEqual(before);
  const expected=structuredClone(saved);
  if(caseId==='balor-2024'){
    for(const name of ['Death Throes','Fire Aura']){
      const original=expected.items.find((item:any)=>item.name===name),native=Object.values<any>(original.system.activities)[0]!;
      expect(native.target.template.type).toBe('sphere');native.target.template.type='radius';
      const actual=actor.items.find((item:any)=>item.name===name);expect(Object.values<any>(actual.system.activities)[0]!.target.template.type).toBe('radius');
    }
    expect(generated.findings.filter(f=>f.path.includes('/sourceOperations')&&f.path.endsWith('/aoe'))).toEqual([]);
    expect(generated.findings.some(f=>f.path.endsWith('/condition'))).toBe(false);
    const auraPath='/creature/traits/1';
    expect(generated.findings.filter(f=>f.path===auraPath&&['SOURCE_BASIC_OPERATION_OMITTED','MIXED_FEATURE_SOURCE_CONFLICT'].includes(f.code))).toEqual([]);
  }else if(caseId==='behir-2024'){
    expect(generated.findings.some(f=>f.path.endsWith('/inventory/damage-omitted'))).toBe(false);
    expect(generated.findings.some(f=>f.path.endsWith('/inventory/save-omitted'))).toBe(false);
  }
  expectFrozenMechanics(actor,expected);expect(generated.calls).toMatchObject({review:0,repair:0});
});
for(const caseId of ['gladiator','priest','medusa'])test.skipIf(!officialCapture)(`official ${caseId}: source findings do not veto output or enter Actor JSON`,async()=>{
  const source=readFileSync(`${officialCapture}/live/${caseId}/source.md`,'utf8');
  const ir=JSON.parse(readFileSync(`${officialCapture}/live/${caseId}/ir.json`,'utf8'));
  const original=JSON.stringify(ir),current={...input,source,requestId:`delivery-${caseId}`};
  const provider={...fixture().provider,extract:noCall,discover:noCall};
  const analysis=analyzeBrowserActorIntakeDraft(current,ir,provider);
  expect(analysis.ir!.creature).toEqual(ir.creature);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.candidateAvailable).toBe(true);
  expect(result.status).toBe('ready_for_gm_review');
  const actor=result.actorProjection as any,serialized=JSON.stringify(actor);
  expect(actor.system.attributes.hp.max).toBe(ir.creature.attributes.hp.value);
  expect(actor.system.attributes.hp.formula.replace(/\s/g,'')).toBe(ir.creature.attributes.hp.formula.replace(/\s/g,''));
  for(const marker of ['candidateReview','deliveryReview','待审候选','ACTOR_LITERAL_DELIVERY'])expect(serialized).not.toContain(marker);
  expect(result.findings.some(f=>f.code==='ACTOR_LITERAL_DELIVERY')).toBe(false);
  if(caseId!=='lion')expect(result.findings.length).toBeGreaterThan(0);
  if(caseId==='medusa'){
    const snake=actor.items.find((item:any)=>item.name==='Snake Hair');
    const damage=Object.values(snake.system.activities).flatMap((activity:any)=>activity.damage?.parts??[]);
    expect(damage.some((part:any)=>part.number===4&&part.denomination===6&&part.types.includes('poison'))).toBe(true);
  }
  if(caseId==='priest'){
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
    const casts=manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs.map((ref:any)=>{
      const feature=actor.items.find((i:any)=>i.flags?.fvttJsonGenerator?.spellcastingFeatureKey===group.featureItemKey);
      return buildCastActivitySource({manifestId:manifest.manifestId,featureId:feature._id??'PriestFeature001',group,ref,
        selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',activationType:feature.flags.fvttJsonGenerator.spellcastingActivationType});
    }));
    expect(casts).toHaveLength(7);
    expect(casts.every((cast:any)=>cast.activity.spell.ability==='wis'&&cast.activity.spell.challenge.save==='13')).toBe(true);
    const aid=casts.filter((cast:any)=>cast.activity.activation?.type==='bonus');
    expect(aid).toHaveLength(4);
    expect(aid.every((cast:any)=>cast.activity.consumption.targets[0]?.type==='itemUses')).toBe(true);
    expect(aid.every((cast:any)=>cast.literalRestrictions[0]?.text==='using the same spellcasting ability as Spellcasting.')).toBe(true);
  }
  if(caseId==='gladiator'){
    expect(actor.items.find((item:any)=>item.name==='Spear').type).toBe('feat');
    const spear=actor.items.find((item:any)=>item.name==='Spear');
    const activities=Object.values<any>(spear.system.activities);
    const rolls=activities.filter(activity=>activity.type==='utility');
    expect(rolls).toHaveLength(2);
    expect(rolls.map(a=>a.range.value).sort((a,b)=>a-b)).toEqual([5,20]);
    expect(rolls.every(a=>a.roll.formula==='1d20+7')).toBe(true);
    expect(rolls.find(a=>a.range.value===20).range.special).toBe('远射程 60 尺');
    expect(activities.every(a=>!Object.hasOwn(a.range,'long'))).toBe(true);
    expect(activities.filter(a=>a.type==='damage')).toHaveLength(1);
    expect(actorReadbackWarnings(actor,structuredClone(actor))).toEqual([]);
    expect(JSON.stringify(actor)).toBe(serialized);
  }
  expect(result.findings.filter(f=>f.code==='SOURCE_PART_NOT_PROJECTED').some(f=>/Section heading|Repeated ability table header/u.test(f.message))).toBe(false);
  expect(approveBrowserActorIntakeCandidateForGm(current,result,'gm').gmApproval).toBeDefined();
  expect(JSON.stringify(ir)).toBe(original);
  expect(result.calls.review).toBe(0);expect(result.calls.repair).toBe(0);
});

test('a projection error still delivers literal actions and reports missing automation outside the Actor',async()=>{
  const {ir,provider}=fixture();
  const current={...input,renderMarkdown:()=>{throw Error('projection unavailable');}};
  const result=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider);
  expect(result.candidateAvailable).toBe(true);
  expect(result.findings.some(f=>f.code==='ACTOR_LITERAL_DELIVERY')).toBe(true);
  const actor=result.actorProjection as any;
  expect(actor.system.attributes.hp.max).toBe(999);
  expect(actor.items.some((item:any)=>item.name.startsWith(ir.creature.actions[0]!.name))).toBe(true);
  expect(JSON.stringify(actor)).not.toContain('candidateReview');
  expect(JSON.stringify(actor)).not.toContain('ACTOR_LITERAL_DELIVERY');
  expect(result.formalStatus).not.toBe('accepted');
});

// Private captures are optional for clean checkouts. The current worktree runs
// them unchanged; this code never calls a live provider or writes the captures.
for(const {caseId,captureRoot,meterPath} of [
  ...['N2','N3'].map(caseId=>({caseId,captureRoot:'.local/forge-new-three-paired-20261022',meterPath:`chrome/meter-after-${caseId}.json`})),
])test.skipIf(!existsSync(`${captureRoot}/${meterPath}`))(`frozen ${caseId} replays assembled historical IR through current full-IR provider with corrections disabled`,async()=>{
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
    // Build an offline canonical fixture from the original two-stage replies.
    // Only this explicitly selected historical helper uses V2; the current
    // public provider below must consume one complete IR reply.
    const historical=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'frozen',reviewModel:'frozen',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,evidenceAnchoring:'exact-quotes',stagedExtraction:{baseMode:'facts',featureMode:'whole-v2',preserveCandidates:true,maxCorrections:0}});
    const ir=await historical.extract({source,sourceSha256:hashSource(source),candidate:{id:caseId,label:caseId,start:0,end:source.length,quote:source}});
    expect(count).toBe(2);answers.splice(0,answers.length,JSON.stringify(ir));count=0;
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'frozen',protocol:'openai-chat',timeoutMs:1000,autoCorrect:false});
    const output=await generateEncounterFromHumanMarkdown({source,label:caseId,...providers,reviewPolicy:'deferred'});
    expect(count).toBe(1);expect(output.prepared?.actors).toHaveLength(1);
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

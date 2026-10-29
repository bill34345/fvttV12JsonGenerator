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
import {OpenAICompatibleMonsterIntakeProvider,parseStrictJson} from '@fvtt-json-generator/intake-ai/provider';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {adaptParsedActorToCanonical} from '@fvtt-json-generator/generation/adapters';
import {verifyGeneratedDocument} from '@fvtt-json-generator/generation/verification';
import {expectSourceConditionEffects,withoutApprovedConditionEffects,expectFrozenSourceDescriptions} from './helpers/forge-approved-projections';

const input={source:LURKER_SOURCE,sourceName:'candidate fixture',requestId:'candidate-output',fvttVersion:'14.364',systemVersion:'5.3.3'};
const noCall=async():Promise<never>=>{throw Error('Unexpected model request');};

test('typed native resistance contract verifies count and consumption without an independent pool',async()=>{
  const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
  ir.creature.traits=[{name:'Legendary Resistance',description:'If this creature fails a saving throw, it can choose to succeed instead.',activationType:'special',uses:{max:3,period:'day'}}];
  const provider={...fixture().provider,extract:noCall,discover:noCall,review:noCall,repair:noCall};
  const generated=await generateBrowserActorIntakeCandidate(input,analyzeBrowserActorIntakeDraft(input,ir,provider),provider);
  expect(generated.candidateAvailable).toBe(true);
  const actor=generated.actorProjection as any,canonical=adaptParsedActorToCanonical(new YamlParser().parse(generated.finalSource!));
  const mechanic=canonical.mechanics.find(entry=>entry.kind==='uses'&&(entry.value as any)?.actorResource==='legres');
  expect(mechanic).toBeDefined();expect(mechanic!.value).toEqual({max:3,period:'day',actorResource:'legres'});
  const checked=(output:any)=>verifyGeneratedDocument({canonical,output,target:'14',effectProfile:'core'});
  expect(checked(actor).mechanicsCoverage.find(entry=>entry.mechanicId===mechanic!.id)?.status).toBe('projected');
  for(const mutate of [
    (copy:any)=>{copy.system.resources.legres.max=0;},
    (copy:any)=>{copy.system.resources.legres.spent=1;},
    (copy:any)=>{const item=copy.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');item.system.uses.max='3';},
    (copy:any)=>{const item=copy.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');Object.values<any>(item.system.activities)[0]!.consumption.targets[0].target='resources.legact.value';},
    (copy:any)=>{const item=copy.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');Object.values<any>(item.system.activities)[0]!.consumption.targets[0].value='2';},
  ]){
    const copy=structuredClone(actor);mutate(copy);const result=checked(copy);
    expect(result.mechanicsCoverage.find(entry=>entry.mechanicId===mechanic!.id)?.status).toBe('missing');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'GEN_MECHANIC_NOT_PROJECTED',path:mechanic!.path}));
  }
});

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
  for(const [index,item] of expected.items.entries())for(const [id,activity] of Object.entries<any>(item.system.activities??{}))if(activity.flags?.fvttJsonGenerator?.sourceOperation){
    expect(actual.items[index].system.activities[id]?._id).toBe(id);
    expect(actual.items[index].system.activities[id]?.flags).toEqual(activity.flags);
  }
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
for(const name of ['gladiator','priest'])test.skipIf(!gearCapture)(`saved gear-policy ${name}: only source-confirmed conditions change frozen Actor mechanics`,async()=>{
  const read=(suffix:string)=>JSON.parse(readFileSync(`${gearCapture}/${name}-${suffix}.json`,'utf8'));
  const ir=read('source-ir'),source=read('ui-pre')[6],oldActor=read('candidate'),before=JSON.stringify(ir);
  expect(validateMonsterIntakeIR(source,ir).findings).toEqual([]);
  const provider={...fixture().provider,discover:noCall,extract:noCall},current={...input,source,requestId:'gear-check-'+name};
  const result=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider);
  const actor=result.actorProjection as any;
  expect(result.findings).toEqual([]);expectFrozenSourceDescriptions(actor,ir);
  let historical=actor;
  if(name==='gladiator'){
    const shield=actor.items.find((item:any)=>item.name==='Shield Bash'),feature=ir.creature.actions.find((item:any)=>item.name==='Shield Bash');
    const condition='If the target is a Me-\ndium or smaller creature, it has the Prone condition.';
    expect(feature.description).toContain(condition);
    expectSourceConditionEffects(shield,'shield-bash-save',[{id:'1681bb1ed665c371',status:'prone',sourceText:feature.description.slice('Shield Bash. '.length),condition}],
      {'5d2db9cbdfeb3fa4':[{_id:'1681bb1ed665c371',onSave:false}]});
    expect(shield.system.activities['5d2db9cbdfeb3fa4'].save).toEqual({ability:['str'],dc:{calculation:'',formula:'15'}});
    historical=withoutApprovedConditionEffects(actor,[{item:'Shield Bash',ids:['1681bb1ed665c371']}]);
  }
  expectFrozenMechanics(historical,oldActor);expect(JSON.stringify(ir)).toBe(before);
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
  test('disabled direct review leaves the exact candidate and all local findings available [review disabled]',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const candidate=await generateBrowserActorIntakeCandidate(input,analysis,provider);
    const before=structuredClone(candidate);
    await expect(reviewBrowserActorIntakeCandidate(input,candidate,provider)).rejects.toThrow('AI 内容复核已暂时关闭');
    expect(candidate).toEqual(before);expect(candidate.calls.review).toBe(0);
  });
  test('legacy combined generation retains a GM-pending candidate without review [review disabled]',async()=>{
    const {ir,provider}=fixture(),analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
    const generated=await generateAndReviewBrowserActorIntake(input,analysis,provider);
    expect(generated.candidateAvailable).toBe(true);expect(generated.modelReviewStatus).toBe('not_requested');expect(generated.calls.review).toBe(0);
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
    expect(buildForgeIntakeReviewBundleV2({...base,status:'accepted',gmApproval:approved.gmApproval}).status).toBe('reviewed_candidate');
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
for(const caseId of ['balor-2024','behir-2024','druid-2024'])test.skipIf(!emanationCapture)(`2024 area representation: frozen ${caseId} preserves other mechanics and complete source text`,async()=>{
  const directory=caseId==='balor-2024'?`${emanationCapture}/balor-2024-third/browser`:`${emanationCapture}/bounded-expansion/new-three-browser/${caseId}`;
  const ir=JSON.parse(readFileSync(`${directory}/source-ir.json`,'utf8')),before=structuredClone(ir),saved=JSON.parse(readFileSync(`${directory}/candidate.json`,'utf8'));
  const pre=JSON.parse(readFileSync(`${directory}/ui-pre.json`,'utf8'));
  const raw=readFileSync(`${directory}/source.md`,'utf8');
  const source=[raw,raw.trim(),raw.replaceAll('\r\n','\n').trim(),...pre.filter((s:unknown)=>typeof s==='string')].find(s=>s.length===ir.source.length&&hashSource(s)===ir.source.sha256)!;
  expect(source).toBeDefined();
  const provider={...fixture().provider,extract:noCall,discover:noCall,review:noCall,repair:noCall},current={...input,source,requestId:'emanation-'+caseId};
  const generated=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider),actor=generated.actorProjection as any;
  expect(generated.candidateAvailable).toBe(true);expect(ir).toEqual(before);expectFrozenSourceDescriptions(actor,ir);
  const expected=structuredClone(saved);
  let historical=actor;
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
    const whip=actor.items.find((item:any)=>item.name==='Flame Whip'),feature=ir.creature.actions.find((item:any)=>item.name==='Flame Whip');
    const condition='If\nthe target is a Huge or smaller creature, the balor pulls\nthe target up to 25 feet straight toward itself, and the\ntarget has the Prone condition.';
    expect(feature.description).toContain(condition);
    expectSourceConditionEffects(whip,'flame-whip-attack',[{id:'43a05c7c8a3a1614',status:'prone',sourceText:feature.description.slice('Flame Whip. '.length),condition:condition+'\nDM确认此GM攻击已命中后应用状态模板。'}],
      {'c0b4840650927666':[{_id:'43a05c7c8a3a1614'}]});
    expect(whip.system.activities['f3db14751e1902cd']).toMatchObject({type:'utility',roll:{formula:'1d20+14'},range:{value:30,units:'ft'}});
    expect(whip.system.activities['c0b4840650927666'].type).toBe('damage');
    historical=withoutApprovedConditionEffects(actor,[{item:'Flame Whip',ids:['43a05c7c8a3a1614']}]);
    const resistance=historical.items.find((item:any)=>item.name==='Legendary Resistance (3/Day)');
    const oldResistance=expected.items.find((item:any)=>item.name==='Legendary Resistance (3/Day)');
    expect(resistance).toBeDefined();expect(oldResistance).toBeDefined();
    expect(oldResistance.system.uses).toEqual({max:'3',spent:0,recovery:[{period:'day',type:'recoverAll'}]});
    expect(actor.system.resources.legres).toEqual({max:3,spent:0});
    expect(resistance.system.identifier).toBe('legendary-resistance');
    expect(resistance.system.uses).toEqual({max:'',spent:0,recovery:[]});
    const resistanceActivities=Object.values<any>(resistance.system.activities);
    expect(resistanceActivities).toHaveLength(1);
    expect(resistanceActivities[0]!.consumption).toEqual({targets:[{type:'attribute',target:'resources.legres.value',value:'1',scaling:{mode:'',formula:''}}],spellSlot:false,scaling:{allowed:false,max:''}});
    expect(generated.findings.filter(f=>f.code==='GEN_MECHANIC_NOT_PROJECTED')).toEqual([]);
    // Compare the remainder against the untouched historical snapshot after
    // checking each field of the intentionally unified native resource.
    historical.system.resources.legres=structuredClone(expected.system.resources.legres);
    resistance.system.uses=structuredClone(oldResistance.system.uses);
    delete resistance.system.identifier;
    resistanceActivities[0]!.consumption=structuredClone(Object.values<any>(oldResistance.system.activities)[0]!.consumption);
  }else if(caseId==='behir-2024'){
    expect(generated.findings.some(f=>f.path.endsWith('/inventory/damage-omitted'))).toBe(false);
    expect(generated.findings.some(f=>f.path.endsWith('/inventory/save-omitted'))).toBe(false);
    const constrict=actor.items.find((item:any)=>item.name==='Constrict'),constrictSource=ir.creature.actions.find((item:any)=>item.name==='Constrict');
    const constrictCondition='The target has the\nGrappled condition (escape DC 16), and it has the Restrained condition until the grapple ends.';
    expect(constrictSource.description).toContain(constrictCondition);
    expectSourceConditionEffects(constrict,'constrict',[
      {id:'82fc36ea6f8f24ba',status:'grappled',sourceText:constrictSource.description.slice('Constrict. '.length),condition:constrictCondition},
      {id:'d41a207ffe287d95',status:'restrained',sourceText:constrictSource.description.slice('Constrict. '.length),condition:constrictCondition},
    ],{'f9b4ccc58e733c59':[{_id:'82fc36ea6f8f24ba',onSave:false},{_id:'d41a207ffe287d95',onSave:false}]});
    const swallow=actor.items.find((item:any)=>item.name==='Swallow'),swallowSource=ir.creature.bonusActions.find((item:any)=>item.name==='Swallow');
    const swallowed='While swallowed, a creature has the Blinded and\nRestrained conditions, has Total Cover against attacks\nand other effects outside the behir, and takes 21 (6d6)\nAcid damage at the start of each of the behir’s turns.';
    const exit='If the behir takes 30 damage or more on a single turn\nfrom the swallowed creature, the behir must succeed\non a DC 14 Constitution saving throw at the end of that\nturn or regurgitate the creature, which falls in a space\nwithin 10 feet of the behir and has the Prone condition.\nIf the behir dies, a swallowed creature is no longer Restrained and can escape from the corpse by using 15\nfeet of movement, exiting Prone.';
    expect(swallowSource.description).toContain(swallowed);expect(swallowSource.description).toContain(exit);
    expectSourceConditionEffects(swallow,'swallow',[
      {id:'8345b9a062b312d7',status:'restrained',sourceText:swallowSource.description.slice('Swallow. '.length),condition:swallowed},
      {id:'a6e760feccb4b286',status:'blinded',sourceText:swallowSource.description.slice('Swallow. '.length),condition:swallowed},
      {id:'c2d84bee0e4827dd',status:'prone',sourceText:exit,condition:exit,staged:true},
    ],{'150d807673175049':[{_id:'8345b9a062b312d7',onSave:false},{_id:'a6e760feccb4b286',onSave:false}],'627e53c09e4b87be':[{_id:'c2d84bee0e4827dd'}]});
    expect(swallow.system.activities['150d807673175049'].type).toBe('save');
    expect(swallow.system.activities['627e53c09e4b87be']).toEqual({_id:'627e53c09e4b87be',type:'utility',name:'退出时状态 Exit Conditions',
      description:{chatFlavor:'<p>'+exit.replaceAll('\n','<br>')+'</p>'},
      flags:{fvttJsonGenerator:{sourceLogicalPath:'structuredActions/附赠动作/0/Swallow/source-operation/swallow/condition-stage/prone',sourceConditionStage:{version:1,source:exit,sourceOperationId:'swallow'}}},
      activation:{type:'special',value:null,override:true,condition:exit},consumption:{targets:[],spellSlot:false,scaling:{allowed:false,max:''}},
      effects:[{_id:'c2d84bee0e4827dd'}],img:'icons/magic/movement/portal-vortex-orange.webp'});
    historical=withoutApprovedConditionEffects(actor,[{item:'Constrict',ids:['82fc36ea6f8f24ba','d41a207ffe287d95']},{item:'Swallow',ids:['8345b9a062b312d7','a6e760feccb4b286','c2d84bee0e4827dd']}]);
    delete historical.items.find((item:any)=>item.name==='Swallow').system.activities['627e53c09e4b87be'];
  }
  expectFrozenMechanics(historical,expected);expect(generated.calls).toMatchObject({review:0,repair:0});
});
for(const caseId of ['gladiator','priest','medusa'])test.skipIf(!officialCapture)(`official ${caseId}: valid source preserves native output without manufactured findings`,async()=>{
  const source=readFileSync(`${officialCapture}/live/${caseId}/source.md`,'utf8');
  const ir=JSON.parse(readFileSync(`${officialCapture}/live/${caseId}/ir.json`,'utf8'));
  const original=JSON.stringify(ir),current={...input,source,requestId:`delivery-${caseId}`};
  const provider={...fixture().provider,extract:noCall,discover:noCall};
  const analysis=analyzeBrowserActorIntakeDraft(current,ir,provider);
  const expectedCreature=structuredClone(ir.creature);
  if(caseId==='medusa'){
    const operation=expectedCreature.actions.find((feature:any)=>feature.name==='Snake Hair').sourceOperations[0];
    expect(operation.damage).toEqual([{formula:'1d4+3',type:'piercing',relationship:'base'},{formula:'4d6',type:'poison',relationship:'additional'}]);
    expect(operation.proof.damage).toHaveLength(1);
    const quote=operation.proof.damage[0];
    expect(source.slice(operation.evidence.start,operation.evidence.end)).toBe(operation.evidence.quote);
    expect(operation.evidence.quote).toContain(quote);
    expect(quote).toContain('1d4 + 3');expect(quote).toContain('4d6');
    operation.proof.damage=[quote,quote];
  }
  expect(analysis.ir!.creature).toEqual(expectedCreature);
  const result=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(result.candidateAvailable).toBe(true);
  expect(result.status).toBe('ready_for_gm_review');
  const actor=result.actorProjection as any,serialized=JSON.stringify(actor);
  expect(actor.system.attributes.hp.max).toBe(ir.creature.attributes.hp.value);
  expect(actor.system.attributes.hp.formula.replace(/\s/g,'')).toBe(ir.creature.attributes.hp.formula.replace(/\s/g,''));
  for(const marker of ['candidateReview','deliveryReview','待审候选','ACTOR_LITERAL_DELIVERY'])expect(serialized).not.toContain(marker);
  expect(result.findings.some(f=>f.code==='ACTOR_LITERAL_DELIVERY')).toBe(false);
  expect(result.findings).toEqual([]);expectFrozenSourceDescriptions(actor,ir);
  if(caseId==='medusa'){
    const snake=actor.items.find((item:any)=>item.name==='Snake Hair');
    const activities=Object.values<any>(snake.system.activities),damage=activities.filter(activity=>activity.type==='damage');
    expect(activities.filter(activity=>activity.type==='utility')).toHaveLength(1);
    expect(activities.find(activity=>activity.type==='utility')).toMatchObject({roll:{formula:'1d20+6'},range:{value:5,units:'ft'}});
    expect(damage).toHaveLength(1);expect(damage[0].damage.parts).toHaveLength(2);
    expect(damage[0].damage.parts[0]).toMatchObject({number:1,denomination:4,bonus:'3',types:['piercing']});
    expect(damage[0].damage.parts[1]).toMatchObject({number:4,denomination:6,bonus:'',types:['poison']});
  }
  if(caseId==='priest'){
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
    const casts=manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs.map((ref:any)=>{
      const feature=actor.items.find((i:any)=>i.flags?.fvttJsonGenerator?.spellcastingFeatureKey===group.featureItemKey);
      return {...buildCastActivitySource({manifestId:manifest.manifestId,featureId:feature._id??'PriestFeature001',group,ref,
        selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',activationType:feature.flags.fvttJsonGenerator.spellcastingActivationType}),ref,group,feature};
    }));
    expect(casts).toHaveLength(7);
    expect(actor.system.abilities.wis.value).toBe(16);
    expect(casts.every((cast:any)=>cast.activity.spell.ability==='wis'&&cast.activity.spell.challenge.save==='13')).toBe(true);
    expect(casts.map((cast:any)=>cast.ref.refId).sort()).toEqual(['bless','dispel-magic','healing-word','lesser-restoration','light','spirit-guardians','thaumaturgy']);
    const independent=casts.find((cast:any)=>cast.ref.refId==='spirit-guardians');
    expect(independent.ref.uses).toEqual({value:1,recovery:'day',shared:false});
    expect(independent.activity.uses).toEqual({spent:0,max:'1',recovery:[{period:'day',type:'recoverAll'}]});
    expect(independent.activity.consumption).toEqual({spellSlot:false,targets:[{type:'activityUses',value:'1'}]});
    expect(independent.activity.activation).toBeUndefined();
    for(const atWill of casts.filter((cast:any)=>['light','thaumaturgy'].includes(cast.ref.refId))){
      expect(atWill.activity.uses).toBeUndefined();expect(atWill.activity.consumption).toEqual({spellSlot:false,targets:[]});
    }
    const aid=casts.filter((cast:any)=>cast.activity.activation?.type==='bonus');
    expect(aid).toHaveLength(4);
    expect(aid.every((cast:any)=>cast.group.groupId==='divine-aid')).toBe(true);
    for(const cast of aid){
      expect(cast.ref.uses).toEqual({value:3,recovery:'day',shared:true});
      expect(cast.feature.system.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});
      expect(cast.activity.uses).toBeUndefined();expect(cast.activity.consumption).toEqual({spellSlot:false,targets:[{type:'itemUses',value:'1'}]});
      expect(cast.activity.activation).toEqual({type:'bonus',value:1,override:true});
    }
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
    const damage=activities.find(a=>a.type==='damage').damage.parts;
    expect(damage).toHaveLength(1);expect(damage[0]).toMatchObject({number:2,denomination:6,bonus:'4',types:['piercing']});
    expect(actorReadbackWarnings(actor,structuredClone(actor))).toEqual([]);
    expect(JSON.stringify(actor)).toBe(serialized);
  }
  expect(result.findings.filter(f=>f.code==='SOURCE_PART_NOT_PROJECTED').some(f=>/Section heading|Repeated ability table header/u.test(f.message))).toBe(false);
  expect(approveBrowserActorIntakeCandidateForGm(current,result,'gm').gmApproval).toBeDefined();
  expect(JSON.stringify(ir)).toBe(original);
  expect(result.calls.review).toBe(0);expect(result.calls.repair).toBe(0);
});

test.skipIf(!officialCapture)('official priest: a concrete FIXTURE_REVIEW finding preserves the complete deliverable Actor',async()=>{
  const source=readFileSync(`${officialCapture}/live/priest/source.md`,'utf8'),ir=JSON.parse(readFileSync(`${officialCapture}/live/priest/ir.json`,'utf8'));
  const current={...input,source,requestId:'official-priest-review-counterexample'},provider={...fixture().provider,extract:noCall,discover:noCall};
  const baseline=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider);
  const disputed=structuredClone(ir);
  disputed.uncertainties.push({id:'official-priest-hp-review',code:'FIXTURE_REVIEW',path:'/creature/attributes/hp',message:'HP needs source review',blocking:true,evidence:[]});
  const result=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,disputed,provider),provider);
  expect(result.candidateAvailable).toBe(true);expect(result.status).toBe('ready_for_gm_review');expect(result.intakeVerificationStatus).toBe('needs_review');
  expect(result.findings.some(f=>f.code==='FIXTURE_REVIEW'&&f.path==='/creature/attributes/hp'&&f.blocking)).toBe(true);
  expect(result.actorProjection).toEqual(baseline.actorProjection);expect(JSON.stringify(result.actorProjection)).not.toContain('FIXTURE_REVIEW');
  expect(decodeForgeActorResponse(result.candidateResponse).ok).toBe(true);expect(result.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
});

test('a companion projection error retains basic Actor generation and the original proposal',async()=>{
  const {ir,provider}=fixture();
  const original=structuredClone(ir);let renderCalls=0;
  const current={...input,renderMarkdown:()=>{renderCalls++;throw Error('projection unavailable');}};
  const result=await generateBrowserActorIntakeCandidate(current,analyzeBrowserActorIntakeDraft(current,ir,provider),provider);
  expect(result.status).toBe('ready_for_gm_review');expect(result.candidateAvailable).toBe(true);
  expect(result.candidateResponse).toBeDefined();expect((result.actorProjection as any).items.length).toBeGreaterThan(0);
  expect(result.analysis.ir).toEqual(original);expect(ir).toEqual(original);
  expect(result.findings.some(f=>f.code==='CUSTOM_RENDER_INCOMPLETE'&&f.message.includes('projection unavailable'))).toBe(true);
  expect(renderCalls).toBe(1);expect(result.calls.review).toBe(0);expect(result.calls.repair).toBe(0);
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
    const ir=await runStagedMonsterExtraction({source,sourceSha256:hashSource(source),candidate:{id:caseId,label:caseId,start:0,end:source.length,quote:source}},async stage=>{
      await stage.onAttempt(1);return parseStrictJson(answers[count++]!);
    },{baseMode:'facts',featureMode:'whole-v2',preserveCandidates:true,maxCorrections:0});
    expect(count).toBe(2);answers.splice(0,answers.length,JSON.stringify(ir));count=0;
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'frozen',protocol:'openai-chat',timeoutMs:1000,autoCorrect:false});
    const output=await generateEncounterFromHumanMarkdown({source,label:caseId,...providers,reviewPolicy:'deferred'});
    expect(count).toBe(1);expect(output.prepared?.actors).toHaveLength(1);
    expect(output.report.findings).toEqual([]);
    expect(output.prepared!.actors[0]!.artifact).toBeDefined();
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

import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {OpenAICompatibleMonsterIntakeProvider,normalizeMonsterIntakeProposal,INTAKE_PROMPT_VERSIONS} from '@fvtt-json-generator/intake-ai/provider';
import {anchorIrEvidence} from '@fvtt-json-generator/intake-ai/orchestrator';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {compileEncounterSelection} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';

const candidate={id:'one',label:'Fixture',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE};
function provider():MonsterIntakeAiProvider{return {providerName:'offline-fixture',extractionModel:'fixture',reviewModel:'fixture',
 discover:async request=>({schemaVersion:1,candidates:[{id:'one',label:'Owner',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
 {id:'two',label:'Related summon',start:RAT_WARLOCK_SOURCE.length,end:request.source.length,quote:LURKER_SOURCE}]}),
 extract:async request=>request.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():buildValidLurkerIr(),
 repair:async request=>request.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};}

describe('AI owns default creature content across program boundaries',()=>{
 test('provider and orchestration only normalize notation, citations and technical identities',async()=>{
  const original=buildRatWarlockIr();const before=structuredClone(original);
  const normalized=normalizeMonsterIntakeProposal(RAT_WARLOCK_SOURCE,original,candidate);
  expect(normalized).toEqual(original);expect(original).toEqual(before);
  expect(anchorIrEvidence(RAT_WARLOCK_SOURCE,candidate,original).creature).toEqual(before.creature);
  let payload:any;let system='';
  const httpProvider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-placeholder',baseUrl:'https://example.test',model:'fixture',reviewModel:'fixture',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,
   httpClient:async(_url,init)=>{const body=JSON.parse(String(init?.body));system=body.messages[0].content;payload=JSON.parse(body.messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(original)}}]}),{status:200});}});
  const result=await httpProvider.extract({source:RAT_WARLOCK_SOURCE,sourceSha256:hashSource(RAT_WARLOCK_SOURCE),candidate});
  expect(payload.sourceSpellGrants).toBeUndefined();expect(payload.sourceLines.length).toBeGreaterThan(0);
  expect(system).toContain('You own all mechanics');expect(system).not.toContain('let the program bind condition');
  expect(result.creature).toEqual(original.creature);expect(INTAKE_PROMPT_VERSIONS.extract).toContain('ai-owned-content');
 });
 test('an explicitly manual casting group normalizes only its omitted empty list and retains valid attacks',async()=>{
  const original=buildRatWarlockIr(),group=original.creature.spellcasting![0]!;
  group.manualGrants=structuredClone(group.evidence);delete (group as any).usageGroups;
  original.uncertainties=[{id:'ai-casting',code:'AI_UNCERTAIN_USES',path:'/creature/spellcasting/0',message:'The AI requests GM handling',blocking:true,evidence:[]}];
  const before=structuredClone(original),normalized=normalizeMonsterIntakeProposal(RAT_WARLOCK_SOURCE,original,candidate),expected=structuredClone(original);
  expected.creature.spellcasting![0]!.usageGroups=[];expect(normalized).toEqual(expected);expect(original).toEqual(before);
  const input={source:RAT_WARLOCK_SOURCE,sourceName:'manual-casting',requestId:'manual-casting',fvttVersion:'14.364',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,original,provider());
  expect(analysis.findings.map(f=>f.code)).toEqual(['AI_UNCERTAIN_USES']);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider());
  expect(generated.candidateAvailable).toBe(true);expect(generated.findings.some(f=>f.code==='ACTOR_LITERAL_DELIVERY')).toBe(false);
  const items=(generated.actorProjection as any).items;
  expect(items.some((item:any)=>Object.values<any>(item.system.activities??{}).some(activity=>activity.type==='attack'))).toBe(true);
  expect(generated.findings.map(f=>f.code)).toContain('AI_UNCERTAIN_USES');
 });
 test('program-generated IDs remain unique without overwriting model IDs',()=>{
  const ir=buildRatWarlockIr();const one=ir.creature.spellcasting![0]!;const two=structuredClone(one);
  ir.creature.spellcasting=[one,two];delete (one as any).groupId;two.groupId='casting-1';
  for(const group of ir.creature.spellcasting)for(const usage of group.usageGroups)for(const ref of usage.spellRefs)delete (ref as any).refId;
  two.usageGroups[0]!.spellRefs[0]!.refId='spell-1-1-1';
  const normalized=normalizeMonsterIntakeProposal(RAT_WARLOCK_SOURCE,ir,candidate);
  const groups=normalized.creature.spellcasting!,ids=groups.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs.map(ref=>ref.refId)));
  expect(new Set(ids).size).toBe(ids.length);expect(new Set(groups.map(group=>group.groupId)).size).toBe(2);
  expect(groups[1]!.groupId).toBe('casting-1');expect(groups[1]!.usageGroups[0]!.spellRefs[0]!.refId).toBe('spell-1-1-1');
 });
 test('saved proposal uses the same data boundary and keeps AI uncertainty and fixed AC',async()=>{
  const ir=buildRatWarlockIr();ir.uncertainties=[{id:'ai-note',code:'AI_NOTE',path:'/creature',message:'AI requests GM review',blocking:false,evidence:[]}];
  const input={source:RAT_WARLOCK_SOURCE,displayName:'Owner',sourceName:'fixture',requestId:'ai-owned-save',fvttVersion:'14.364',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider());
  expect(analysis.ir?.creature).toEqual(ir.creature);expect(analysis.ir?.uncertainties).toEqual(ir.uncertainties);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider());
  expect(generated.candidateAvailable).toBe(true);
  expect((generated.actorProjection as any).system.attributes.ac.flat).toBe(ir.creature.attributes.ac);
  expect(generated.findings.filter(finding=>finding.blocking)).toEqual([]);
 });
 test('owner and associated summon use identical extraction, structure and conversion gates',async()=>{
  const source=RAT_WARLOCK_SOURCE+LURKER_SOURCE;const result=await generateEncounterFromHumanMarkdown({source,label:'Synthetic owner and related summon',provider:provider(),reviewPolicy:'deferred',
   automationProvider:{generate:async request=>compileEncounterSelection({version:2,name:'Fixture control',notes:'Closed offline fixture',rules:[],manualSteps:[]},request),
    review:async()=>({verdict:'accepted',findings:[]})}});
  expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(2);
  expect(result.report.actors.map(actor=>actor.generation?.intakeVerificationStatus)).toEqual(['accepted','accepted']);
  expect(result.report.actors.map(actor=>actor.generation?.calls.review)).toEqual([0,0]);
  expect(result.report.actors[0]!.analysis.ir!.creature).toEqual(buildRatWarlockIr().creature);
  expect(result.report.actors[1]!.analysis.ir!.creature).toEqual(buildValidLurkerIr().creature);
 });
});

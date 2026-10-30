import {expect,test} from 'bun:test';
import mezz from './fixtures/forge-facts-history/mezzoloth.json';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {FACT_LOCALIZATION_POLICY,type LocalizationRequest} from '@fvtt-json-generator/contracts/localization';
import type {MonsterIntakeAiProvider,MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {draftForgeEncounterLocalization} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {actorRulePresentation} from '../packages/forge-browser-runtime/src/actorRulePresentationContext';

test('failed formal Actor keeps its generated rule plan through saved preparation and localization requests',async()=>{
  let modelCalls=0;
  const forbidden=async():Promise<never>=>{modelCalls++;throw Error('Unexpected model or paid-review request');};
  const provider:MonsterIntakeAiProvider={providerName:'saved-ir-only',extractionModel:'offline',reviewModel:'disabled',
    discover:forbidden,extract:forbidden,review:forbidden,repair:forbidden};
  const before=structuredClone(mezz),ir=structuredClone(mezz.ir) as unknown as MonsterIntakeIR;
  const result=await generateEncounterFromHumanMarkdown({source:mezz.source,label:'Saved failed Mezzoloth',
    reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source:mezz.source,ir}],
    draftParentHash:hashSource(JSON.stringify(ir)),provider,automationProvider:{generate:forbidden,review:forbidden}});
  const response=result.report.actors[0]?.generation?.candidateResponse;
  if(!response||!('result'in response)||!response.result.artifact)throw Error('Expected the actual formal Actor response and its retained artifact.');
  expect(response.result.status).toBe('failed');
  expect(response.result.diagnostics.some(finding=>finding.severity==='error')).toBe(true);
  const generatedPlan=actorRulePresentation(response);
  expect(generatedPlan).toBeDefined();
  expect(generatedPlan!.fields.length).toBeGreaterThan(0);
  const prepared=result.prepared!;
  expect(prepared.actors).toHaveLength(1);
  expect(prepared.actors[0]!.rulePresentation).toEqual(generatedPlan);
  expect(prepared.actors[0]!.artifact).toEqual(response.result.artifact);
  expect(prepared.actors[0]!.status).not.toBe('accepted');
  const restored=await prepareForgeEncounter(serializeForgeEncounterPackage(prepared.bundle));
  expect(restored.actors[0]!.artifact).toEqual(prepared.actors[0]!.artifact);
  expect(restored.actors[0]!.rulePresentation).toEqual(generatedPlan);
  expect(restored.actors[0]!.reviewFindings).toEqual(prepared.actors[0]!.reviewFindings);
  const requests:LocalizationRequest[]=[];
  await expect(draftForgeEncounterLocalization({prepared:restored,service:{model:'request-capture',reviewModel:'disabled',
    translate:async request=>{requests.push(request);throw Error('LOCAL_TRANSLATION_REQUEST_REACHED');},review:forbidden,
  }})).rejects.toThrow('LOCAL_TRANSLATION_REQUEST_REACHED');
  expect(requests).toHaveLength(1);
  expect(requests[0]!.policy).toBe(FACT_LOCALIZATION_POLICY);
  expect(requests[0]!.texts.length).toBeGreaterThan(0);
  expect(result.report.actors[0]!.analysis.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
  expect(modelCalls).toBe(0);
  expect(mezz).toEqual(before);
});

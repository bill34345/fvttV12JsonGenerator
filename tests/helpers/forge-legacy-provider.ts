import {expect,spyOn} from 'bun:test';
import {OpenAICompatibleMonsterIntakeProvider,type OpenAICompatibleMonsterIntakeOptions} from '@fvtt-json-generator/intake-ai/provider';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';

/** Test-owned opt-in for the historical base/whole-form protocol. The public
 * Forge factory deliberately remains on its current single complete-IR route. */
export function legacyWholeFormProvider(options:Partial<OpenAICompatibleMonsterIntakeOptions>={}){
  return new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',
    model:'legacy-whole-form-control',reviewModel:'legacy-whole-form-control',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,
    evidenceAnchoring:'exact-quotes',transport:{protocol:'openai-chat',authScheme:'bearer',structuredOutput:{mode:'json_object'}},
    httpClient:(url,init)=>fetch(url,init),...options,
    stagedExtraction:{baseMode:'facts',featureMode:'whole-v2',preserveCandidates:true,
      ...(typeof options.stagedExtraction==='object'?options.stagedExtraction:{})}});
}

/** A synthetic fixed full-IR reply, assembled from this test's explicit legacy
 * controls, exercises the current public factory and real formal workflow on
 * the SAME source. This is projection evidence, never model-quality evidence. */
export async function assertDefaultFullIrReplay(source:string,ir:MonsterIntakeIR,expected:{actor:unknown;markdown:string;discoveryCalls?:0|1}){
  const previousFetch=globalThis.fetch,requests:any[]=[],before=structuredClone(ir);
  const sourceId=/^forge-source-id: actor:v1:([a-f0-9-]+)$/mu.exec(expected.markdown)?.[1];expect(sourceId).toBeDefined();
  // Both independent formal runs receive the same test-owned source identity,
  // so identity fields are compared rather than erased from the comparison.
  const identity=spyOn(globalThis.crypto,'randomUUID').mockReturnValue(sourceId as `${string}-${string}-${string}-${string}-${string}`);
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages.find((entry:any)=>entry.role==='user').content);
    requests.push(payload);
    const reply=payload.sourceLines?{schemaVersion:1,candidates:[{id:'fixed-full-source',label:ir.creature.identity.name,
      firstLineId:payload.sourceLines[0].id,lastLineId:payload.sourceLines.at(-1).id}]}:before;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]}),{headers:{'Content-Type':'application/json'}});
  },{preconnect:previousFetch.preconnect});
  try{
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'synthetic-full-ir-control',timeoutMs:10000});
    const result=await generateEncounterFromHumanMarkdown({source,label:'Current default / fixed full IR',...providers,reviewPolicy:'deferred',outputLanguage:'source'});
    const discoveryCalls=expected.discoveryCalls??0,extracts=requests.filter(payload=>!payload.sourceLines);
    expect(requests).toHaveLength(1+discoveryCalls);expect(extracts).toHaveLength(1);
    expect(extracts[0].source).toBe(source);expect(extracts[0].sourceSha256).toBe(hashSource(source));
    expect(extracts[0].template).toBeUndefined();expect(extracts[0].units).toBeUndefined();
    expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.discovery).toEqual({mode:discoveryCalls?'ai-discovery':'single-statblock',providerCalls:discoveryCalls});
    expect(result.report.actors[0]!.analysis.ir).toEqual(before);expect(ir).toEqual(before);
    expect(result.prepared?.actors).toHaveLength(1);expect(result.prepared!.bundle.actors[0]!.source).toBe(expected.markdown);
    // The formal workflow already clears volatile Actor clocks. Nothing is
    // removed from either Actor for this complete structural comparison.
    expect(result.prepared!.actors[0]!.artifact).toEqual(expected.actor);
  }finally{globalThis.fetch=previousFetch;identity.mockRestore();}
}

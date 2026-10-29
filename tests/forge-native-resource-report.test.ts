import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {decodeForgeActorResponse,hashSource,projectForgeVerificationSummary,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {isSafeForgeDocumentFieldPath} from '../packages/forge-gateway-protocol/src/wireSafety';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {adaptParsedActorToCanonical} from '@fvtt-json-generator/generation/adapters';
import {verifyGeneratedDocument} from '@fvtt-json-generator/generation/verification';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const forbidden=async():Promise<never>=>{throw Error('This report regression forbids model and network calls');};
const offline={providerName:'frozen-native-resource-report',extractionModel:'frozen',reviewModel:'disabled',discover:forbidden,extract:forbidden,review:forbidden,repair:forbidden};
const sourceId='actor:v1:76f8213f-310c-4f65-ae8c-82b535d89253' as ForgeSourceId;
const readJson=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
const input=(source:string,id:string)=>({source,sourceName:id,sourceScope:'single' as const,sourceId,requestId:'native-report-'+id,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false});

function expectFormalReport(generated:Awaited<ReturnType<typeof generateBrowserActorIntakeCandidate>>,max:number){
  expect(generated.candidateAvailable).toBe(true);expect(generated.formalStatus).not.toBe('failed');
  expect(generated.findings.filter(f=>f.code==='FORGE_WORKFLOW_FAILED')).toEqual([]);
  const response=generated.candidateResponse;expect(response&&'result'in response).toBe(true);
  if(!response||!('result'in response))throw Error('Missing formal candidate result');
  expect(response.result.status).not.toBe('failed');
  expect(response.result.diagnostics.filter(f=>['FORGE_WORKFLOW_FAILED','FORGE_REPORT_INCOMPLETE'].includes(f.code))).toEqual([]);
  const coverage=response.result.verification.mechanicsCoverage.filter(entry=>entry.outputPaths.includes('actor/system/resources/legres'));
  expect(coverage).toHaveLength(1);expect(coverage[0]!.status).toBe('projected');
  expect(coverage[0]!.outputPaths.every(isSafeForgeDocumentFieldPath)).toBe(true);
  const serialized=JSON.stringify(response),decoded=decodeForgeActorResponse(JSON.parse(serialized));
  expect(decoded.ok).toBe(true);if(!decoded.ok)throw Error('Formal response failed schema decoding');
  expect(decoded.value).toEqual(response);
  const actor=response.result.artifact as any,item=actor.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');
  expect(actor.system.resources.legres).toEqual({max,spent:0});expect(item).toBeDefined();
  expect(item.system.uses).toEqual({max:'',spent:0,recovery:[]});
  const activities=Object.values<any>(item.system.activities);expect(activities).toHaveLength(1);
  expect(activities[0]!.consumption.targets).toEqual([{type:'attribute',target:'resources.legres.value',value:'1',scaling:{mode:'',formula:''}}]);
  return {response,actor};
}

describe('native Actor resource reports survive the actual browser candidate wire boundary',()=>{
  const captures=[['balor','FORGE_MORE_FRESH_ROOT'],['unicorn','FORGE_SIX_FRESH_ROOT']] as const;
  for(const [id,setting] of captures)test.skipIf(!process.env[setting])('unchanged real '+id+' first answer retains a truthful formal report',async()=>{
    const root=process.env[setting]!,entry=readJson(join(root,'sources.json')).cases.find((row:any)=>row.id===id);
    expect(entry).toBeDefined();const source=readFileSync(entry.sourcePath,'utf8');expect(hashSource(source)).toBe(entry.sourceHash);
    const raw=readFileSync(join(root,'results',id,'raw-answer.txt'),'utf8');let reads=0;
    const replay=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:60000,repairTimeoutMs:60000,
      httpClient:async()=>{expect(++reads).toBe(1);return Response.json({choices:[{message:{content:raw},finish_reason:'stop'}]});}});
    const provider={...offline,extract:replay.extract.bind(replay),extractAnswer:replay.extractAnswer.bind(replay)},request=input(source,id);
    const analysis=await analyzeBrowserActorSourceWithAi(request,provider);
    const generated=await generateBrowserActorIntakeCandidate(request,analysis,offline);
    expectFormalReport(generated,3);expect(reads).toBe(1);
    expect(generated.calls.review).toBe(0);expect(generated.calls.repair).toBe(0);
  });

  for(const max of [1,3,5])test('legal native resistance count '+max+' and mutated counter use the same closed report contract',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.traits=[{name:'Legendary Resistance',description:'If this creature fails a saving throw, it can choose to succeed instead.',activationType:'special',uses:{max,period:'day'}}];
    const request=input(LURKER_SOURCE,'control-'+max),analysis=analyzeBrowserActorIntakeDraft(request,ir,offline);
    const generated=await generateBrowserActorIntakeCandidate(request,analysis,offline),{actor}=expectFormalReport(generated,max);
    const canonical=adaptParsedActorToCanonical(new YamlParser().parse(generated.finalSource!));
    const wrong=structuredClone(actor);wrong.system.resources.legres.max=max+1;
    const checked=verifyGeneratedDocument({canonical,output:wrong,target:'14',effectProfile:'core'});
    expect(checked.status).toBe('failed');expect(checked.diagnostics.some(d=>d.code==='GEN_MECHANIC_NOT_PROJECTED')).toBe(true);
    const projected=projectForgeVerificationSummary(checked);expect(projected.status).toBe('failed');
    expect(projected.mechanicsCoverage.some(entry=>entry.kind==='uses'&&entry.status==='missing')).toBe(true);
  });

  for(const max of [1,3,5])test('ledger-only native resistance count '+max+' retains its consumption and formal report',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:max};
    ir.creature.traits=[{name:'Legendary Resistance',sourceQualifier:`(${max}/Day)`,description:'If this creature fails a saving throw, it can choose to succeed instead.',activationType:'special',activityType:'utility',executionMode:'gm-manual'}];
    const before=structuredClone(ir),request=input(LURKER_SOURCE,'ledger-'+max),analysis=analyzeBrowserActorIntakeDraft(request,ir,offline);
    const generated=await generateBrowserActorIntakeCandidate(request,analysis,offline),{actor}=expectFormalReport(generated,max);
    expect(ir).toEqual(before);expect(analysis.ir!.creature.traits[0]!.uses).toBeUndefined();
    const canonical=adaptParsedActorToCanonical(new YamlParser().parse(generated.finalSource!));
    const linkage=canonical.mechanics.filter(mechanic=>mechanic.kind==='uses');
    expect(linkage).toHaveLength(1);expect(linkage[0]!.path).toBe('actor/structuredActions/特性/0/actorResource');
    expect(linkage[0]!.value).toEqual({max,period:'day',actorResource:'legres',nativeResistanceLedgerOnly:true});
    for(const change of ['counter','consumption'] as const){
      const wrong=structuredClone(actor),item=wrong.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');
      if(change==='counter')wrong.system.resources.legres.max=max+1;
      else Object.values<any>(item.system.activities)[0]!.consumption.targets=[];
      const checked=verifyGeneratedDocument({canonical,output:wrong,target:'14',effectProfile:'core'});
      expect(checked.status).toBe('failed');expect(checked.mechanicsCoverage.some(entry=>entry.kind==='uses'&&entry.status==='missing')).toBe(true);
      expect(projectForgeVerificationSummary(checked).status).toBe('failed');
    }
  });

  for(const path of ['actor/system/resources/anything','actor/system/resources/legres/spent/private','actor/system/resources/../legres','actor/system/attributes/hp','H:/private/source.json','documents/0/../../secret'])test('rejects an undeclared report path without broadening resource paths: '+path,()=>{
    expect(isSafeForgeDocumentFieldPath(path)).toBe(false);
    expect(()=>projectForgeVerificationSummary({status:'accepted',mechanicsCoverage:[{mechanicId:'bad',kind:'uses',sourcePath:'actor/structuredActions/特性/0/uses',status:'projected',outputPaths:[path]}]})).toThrow();
  });
});

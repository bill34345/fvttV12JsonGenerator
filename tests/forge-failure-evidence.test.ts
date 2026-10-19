import {afterAll,afterEach,beforeAll,describe,expect,test} from 'bun:test';
import {mkdir,mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {createBrowserAiProvider} from '../packages/forge-browser-runtime/src/ai';
import {createEncounterIntakeProviders} from '../packages/forge-browser-runtime/src/encounterIntake';
import type {ProviderResponseEvidence} from '@fvtt-json-generator/intake-ai/provider';
import {requestIntakeProvider,type IntakeProviderActivity} from '@fvtt-json-generator/intake-ai/transport';
import {localizationRequest,localizationText} from '@fvtt-json-generator/contracts/localization';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const originalFetch=globalThis.fetch,encoder=new TextEncoder();
const connection={baseUrl:'https://evidence.invalid/v1',apiKey:'fixture-private-key',model:'offline-model'};
const source='Proof CR 1\nMedium construct\nArmor Class 15\nHit Points 20\nSpeed 30 ft.\nSTR 10 DEX 10 CON 10 INT 10 WIS 10 CHA 10\nChallenge 1\nActions\nSlam. One target takes 3 damage.\n';
const baseSource=source.slice(0,source.indexOf('Actions\n'));
let evidenceRoot:string;
beforeAll(async()=>{
  const configured=process.env.FVTT_FAILURE_EVIDENCE_TEST_ROOT;
  const parent=configured?resolve(configured):tmpdir();await mkdir(parent,{recursive:true});
  evidenceRoot=await mkdtemp(join(parent,'forge-failure-evidence-'));
});
afterEach(()=>{globalThis.fetch=originalFetch;});
afterAll(async()=>{
  if(process.env.FVTT_FAILURE_EVIDENCE_TEST_ROOT)return;
  if(dirname(evidenceRoot)!==resolve(tmpdir())||!basename(evidenceRoot).startsWith('forge-failure-evidence-'))throw Error('Unsafe test cleanup path');
  await rm(evidenceRoot,{recursive:true});
});

const serviceError=JSON.stringify({error:{code:'server_busy',type:'server_error',message:'service unavailable fixture-private-key'}});
type Case={name:string;status?:number;chunks:Array<string|Uint8Array>;drop?:boolean;reason:NonNullable<IntakeProviderActivity['failureReason']>;complete:boolean;find:string};
const cases:Case[]=[
  {name:'http200-error-after-keepalive',status:200,chunks:['\n'.repeat(14),serviceError],reason:'provider_error',complete:true,find:'server_busy'},
  {name:'http503-json',status:503,chunks:[serviceError],reason:'http_error',complete:true,find:'server_busy'},
  {name:'http429-json',status:429,chunks:[serviceError],reason:'http_error',complete:true,find:'server_busy'},
  {name:'http502-html',status:502,chunks:['<html>Upstream unavailable</html>'],reason:'http_error',complete:true,find:'Upstream unavailable'},
  {name:'http503-disconnect',status:503,chunks:['partial upstream error'],drop:true,reason:'http_error',complete:false,find:'partial upstream error'},
  {name:'unreadable-json',status:200,chunks:['{"choices": [broken reply'],reason:'invalid_json',complete:true,find:'broken reply'},
  {name:'invalid-utf8',status:200,chunks:[Uint8Array.of(0xff,0xfe,65)],reason:'invalid_encoding',complete:false,find:'\\xff'},
  {name:'blank-body',status:200,chunks:['\n\r\n'],reason:'empty_response',complete:true,find:'\n'},
  {name:'unexpected-envelope',status:200,chunks:['{"unrelated":"diagnostic-marker"}'],reason:'unexpected_response',complete:true,find:'diagnostic-marker'},
  {name:'empty-answer',status:200,chunks:['{"choices":[{"message":{"content":""}}]}'],reason:'empty_response',complete:true,find:'choices'},
  {name:'partial-disconnect',status:200,chunks:['{"choices":[{"message":{"content":"partial marker'],drop:true,reason:'response_interrupted',complete:false,find:'partial marker'},
  {name:'valid-json-but-disconnect',status:200,chunks:['{"choices":[{"message":{"content":"{}"}}]}'],drop:true,reason:'response_interrupted',complete:false,find:'choices'},
  {name:'no-connection',chunks:[],reason:'connection_failed',complete:false,find:''},
];

describe('real private evidence files from failed formal Forge calls, zero network',()=>{
  for(const factory of ['actor','encounter'] as const)for(const scenario of cases)test(`${factory}: ${scenario.name}`,async()=>{
    let calls=0;const activities:IntakeProviderActivity[]=[],files:string[]=[];
    globalThis.fetch=(async()=>{
      calls++;if(scenario.status===undefined)throw new TypeError('offline connection failure');
      async function* chunks(){for(const chunk of scenario.chunks)yield chunk;if(scenario.drop)throw new TypeError('offline body disconnected');}
      return {ok:scenario.status>=200&&scenario.status<300,status:scenario.status,body:chunks(),json:async()=>{throw Error('Do not read twice');}};
    }) as unknown as typeof fetch;
    const options={...connection,onActivity:(entry:IntakeProviderActivity)=>activities.push(entry),responseEvidence:{record:async(event:ProviderResponseEvidence)=>{
      const path=join(evidenceRoot,`${factory}-${scenario.name}-${files.length}.json`);await writeFile(path,JSON.stringify(event),{flag:'wx'});files.push(path);
    }}};
    const provider=factory==='actor'?createBrowserAiProvider(options):createEncounterIntakeProviders(options).provider;
    const outcome=await (factory==='actor'
      ?provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length})
      :provider.extract({source,sourceSha256:sha256(source),candidate:{id:'proof',label:'Proof',start:0,end:source.length,quote:source}})).catch(error=>error);
    expect(outcome).toBeInstanceOf(Error);expect(calls).toBe(1);expect(files).toHaveLength(1);
    const saved=JSON.parse(await readFile(files[0]!,'utf8')) as ProviderResponseEvidence;
    expect(saved.kind).toBe('transport-failure');expect(saved.content).toContain(scenario.find);
    expect(saved.transportFailure).toMatchObject({reason:scenario.reason,bodyComplete:scenario.complete});
    expect(saved.transportFailure?.elapsedMs).toBeNumber();
    expect(saved.sourceHash).toBe(sha256(factory==='actor'?source:baseSource));
    expect(saved.requestHash).toMatch(/^[a-f0-9]{64}$/u);expect(saved.attempt).toBe(1);
    if(scenario.status)expect(saved.transportFailure?.httpStatus).toBe(scenario.status);
    if(scenario.name==='http200-error-after-keepalive')expect(saved.transportFailure).toMatchObject({providerCode:'server_busy',providerType:'server_error'});
    if(scenario.name==='invalid-utf8')expect(saved.transportFailure?.representation).toBe('escaped-bytes');
    if(scenario.name==='http503-disconnect')expect(saved.transportFailure?.bodyReadFailure).toBe('interrupted');
    expect(JSON.stringify(saved)).not.toContain(connection.apiKey);
    expect(activities.at(-1)?.failureEvidenceStatus).toBe('saved');
    expect(activities.at(-1)?.failureReason).toBe(scenario.reason);
    expect(JSON.stringify(activities)).not.toContain(scenario.name==='partial-disconnect'?'partial marker':'diagnostic-marker');
  });

  test('private capture removes credentials and reasoning even from a broken envelope',async()=>{
    const path=join(evidenceRoot,'redacted-broken.json');
    const nested=JSON.stringify({password:'nested-secret'});
    const raw='{"error":{"code":"broken","message":"fixture-private-key Bearer other-token https://evidence.invalid/v1"},"debug":'+JSON.stringify(nested)+',"reasoning_content":"do not retain this unfinished chain';
    const provider=createBrowserAiProvider({...connection,responseEvidence:{record:event=>writeFile(path,JSON.stringify(event),{flag:'wx'})}});
    globalThis.fetch=(async()=>new Response(raw)) as unknown as typeof fetch;
    await expect(provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length})).rejects.toThrow();
    const saved=JSON.parse(await readFile(path,'utf8'));
    for(const secret of ['fixture-private-key','other-token','https://evidence.invalid/v1','nested-secret','do not retain this unfinished chain'])expect(JSON.stringify(saved)).not.toContain(secret);
    expect(saved.redacted).toBe(true);expect(saved.content).toContain('[redacted]');
    expect(saved.responseHash).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  test('storage failure is explicit, preserves the original category and never reposts',async()=>{
    let calls=0,storageFailures=0;const activities:IntakeProviderActivity[]=[];
    globalThis.fetch=(async()=>{calls++;return new Response(serviceError);}) as unknown as typeof fetch;
    const provider=createBrowserAiProvider({...connection,onActivity:event=>activities.push(event),responseEvidence:{
      record:async()=>{throw Error('private disk/path failure');},onStorageFailure:()=>{storageFailures++;}}});
    const error=await provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length}).catch(error=>error);
    expect(error.transportFailure).toMatchObject({reason:'provider_error',evidenceStatus:'save_failed'});
    expect(activities.at(-1)?.failureEvidenceStatus).toBe('save_failed');expect(calls).toBe(1);expect(storageFailures).toBe(1);
    expect(JSON.stringify(error)).not.toContain('private disk/path failure');
  });

  test('no configured sink is clearly reported without leaking a body into ordinary errors',async()=>{
    const activities:IntakeProviderActivity[]=[];
    globalThis.fetch=(async()=>new Response(serviceError)) as unknown as typeof fetch;
    const provider=createBrowserAiProvider({...connection,onActivity:event=>activities.push(event)});
    const error=await provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length}).catch(error=>error);
    expect(error.transportFailure).toMatchObject({reason:'provider_error',evidenceStatus:'not_configured'});
    expect(activities.at(-1)?.failureEvidenceStatus).toBe('not_configured');
    expect(JSON.stringify(error)).not.toContain('service unavailable');
  });

  test('oversized failures retain both ends and explicitly mark the omitted middle',async()=>{
    const path=join(evidenceRoot,'bounded.json'),body='HEAD-MARKER'+'.'.repeat(1_100_000)+'TAIL-MARKER';
    const provider=createBrowserAiProvider({...connection,responseEvidence:{record:event=>writeFile(path,JSON.stringify(event),{flag:'wx'})}});
    globalThis.fetch=(async()=>new Response(body)) as unknown as typeof fetch;
    await expect(provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length})).rejects.toThrow();
    const saved=JSON.parse(await readFile(path,'utf8'));
    expect(saved.content).toContain('HEAD-MARKER');expect(saved.content).toContain('TAIL-MARKER');expect(saved.truncated).toBe(true);
    expect(saved.transportFailure.capturedBytes).toBe(1_000_000);expect(saved.transportFailure.receivedBytes).toBe(encoder.encode(body).length);
  });

  test('direct transport evidence is sanitized too; cancellation saves a received prefix',async()=>{
    let markReady!:()=>void;const controller=new AbortController(),ready=new Promise<void>(resolve=>{markReady=resolve;});
    let saved:any;const prefix='{"message":"fixture-private-key partial-before-cancel';
    async function* chunks(){yield prefix;await new Promise<never>(()=>{});}
    const pending=requestIntakeProvider({...connection,systemPrompt:'fixture',userContent:'{}',signal:controller.signal,
      httpClient:async()=>({ok:true,status:200,json:async()=>null,body:chunks()}),onActivity:event=>{if(event.receivedBytes)markReady();},
      onFailureEvidence:event=>{saved=event;}}).catch(error=>error);
    await ready;controller.abort();await pending;
    expect(saved.diagnostic).toMatchObject({reason:'user_cancelled',bodyComplete:false});
    expect(saved.content).toContain('partial-before-cancel');expect(saved.content).not.toContain(connection.apiKey);
  });

  test('automation and Chinese translation persist service error envelopes through the same real factory',async()=>{
    let calls=0;const paths:string[]=[];
    globalThis.fetch=(async()=>{calls++;return new Response(serviceError);}) as unknown as typeof fetch;
    const ports=createEncounterIntakeProviders({...connection,responseEvidence:{record:async event=>{
      const path=join(evidenceRoot,`forward-${paths.length}.json`);await writeFile(path,JSON.stringify(event),{flag:'wx'});paths.push(path);
    }}});
    await expect(ports.automationProvider.generate({source:LURKER_SOURCE,actors:[{key:'actor-1',source:LURKER_SOURCE,
      ir:buildValidLurkerIr(),artifact:{items:[]}}]})).rejects.toThrow();
    const input=localizationRequest(sha256(source),[localizationText('body','A rule.')]);
    await expect(ports.translationService.translate(input)).rejects.toThrow();
    expect(calls).toBe(2);expect(paths).toHaveLength(2);
    const saved=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
    expect(saved.map(event=>event.stage)).toEqual(['automation-generate','translate']);
    expect(saved.every(event=>event.kind==='transport-failure'&&event.transportFailure.reason==='provider_error')).toBe(true);
    expect(saved[1].localizationRequestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved[1].textIds).toEqual([input.texts[0]!.id]);
  });

  test('failed Responses streams omit reasoning deltas from private evidence',async()=>{
    let saved:any;
    const stream='data: '+JSON.stringify({type:'response.reasoning_text.delta',sequence_number:0,delta:'PRIVATE THINKING DO NOT SAVE'})+'\n\n'+'data: invalid-json\n\n';
    await expect(requestIntakeProvider({...connection,protocol:'openai-responses',stream:true,systemPrompt:'fixture',userContent:'{}',
      httpClient:async()=>new Response(stream),onFailureEvidence:event=>{saved=event;}})).rejects.toThrow();
    expect(saved.content).toContain('invalid-json');expect(saved.content).not.toContain('PRIVATE THINKING DO NOT SAVE');
    expect(saved.redacted).toBe(true);
  });

  test('a legacy JSON-only adapter cannot falsely claim a missing raw body was saved',async()=>{
    const activities:IntakeProviderActivity[]=[];let saved:any;
    const error=await requestIntakeProvider({...connection,systemPrompt:'fixture',userContent:'{}',
      httpClient:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('legacy parser rejected reply');}}),
      onActivity:event=>activities.push(event),onFailureEvidence:event=>{saved=event;}}).catch(error=>error);
    expect(error.failure).toMatchObject({evidenceStatus:'metadata_only',representation:'unavailable',hashScope:'unavailable'});
    expect(saved.content).toBe('');expect(activities.at(-1)?.failureEvidenceStatus).toBe('metadata_only');
  });

  test('a credential cut off mid-value is masked while its response prefix remains useful',async()=>{
    const path=join(evidenceRoot,'partial-secret.json'),raw='{"error":{"message":"offline failure fixture-priv';
    globalThis.fetch=(async()=>new Response(raw)) as unknown as typeof fetch;
    const provider=createBrowserAiProvider({...connection,responseEvidence:{record:event=>writeFile(path,JSON.stringify(event),{flag:'wx'})}});
    await expect(provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length})).rejects.toThrow();
    const saved=JSON.parse(await readFile(path,'utf8'));
    expect(saved.content).not.toContain('fixture-priv');expect(saved.content).toContain('offline failure');expect(saved.redacted).toBe(true);
  });

  test('all written fixture artifacts can be read back as diagnostic records',async()=>{
    const files=(await readdir(evidenceRoot)).filter(name=>name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(20);
    for(const name of files){const event=JSON.parse(await readFile(join(evidenceRoot,name),'utf8'));expect(event.kind).toBe('transport-failure');}
    if(process.env.FVTT_FAILURE_EVIDENCE_TEST_ROOT)console.log(`Persisted ${files.length} safe failure fixtures at ${evidenceRoot}`);
  });

  test('saved service errors, unreadable bodies and interrupted prefixes reproduce their classification offline',async()=>{
    for(const name of ['http200-error-after-keepalive','unreadable-json','partial-disconnect']){
      const saved=JSON.parse(await readFile(join(evidenceRoot,`actor-${name}-0.json`),'utf8'));
      let calls=0;
      globalThis.fetch=(async()=>{calls++;async function* chunks(){yield saved.content;if(!saved.transportFailure.bodyComplete)throw new TypeError('replayed disconnect');}
        return {ok:true,status:saved.transportFailure.httpStatus,body:chunks(),json:async()=>null};}) as unknown as typeof fetch;
      const provider=createBrowserAiProvider(connection);
      const error=await provider.discover({source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length}).catch(error=>error);
      expect(error.transportFailure.reason).toBe(saved.transportFailure.reason);expect(calls).toBe(1);
    }
  });
});

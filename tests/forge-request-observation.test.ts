import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { requestIntakeProvider, type IntakeProviderActivity, type IntakeTransportRequest } from '../packages/intake-ai/src/transport';
import { createBrowserAiProvider } from '../packages/forge-browser-runtime/src/ai';
import { createEncounterIntakeProviders } from '../packages/forge-browser-runtime/src/encounterIntake';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import savedFailure from './fixtures/forge-request-observation-failure.json';

const originalFetch = globalThis.fetch;
const base = { baseUrl:'https://fixture.invalid/v1', apiKey:'fixture-secret-never-log', model:'fixture', systemPrompt:'fixture', userContent:'{}' };
const envelope = (content = '{"名字":"完整中文"}') => JSON.stringify({ choices:[{ message:{content}, finish_reason:'stop' }] });
let restoreClock: (() => void) | undefined;
beforeEach(() => { globalThis.fetch = (async () => { throw new Error('Unexpected network access prohibited'); }) as unknown as typeof fetch; });
afterEach(() => { globalThis.fetch = originalFetch; restoreClock?.(); restoreClock = undefined; });

function deferred<T>() {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>(done => { resolve=done; });
  return {promise,resolve};
}
function bodyFixture() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(value){controller=value;}, cancel(){cancelled=true;} });
  return { body, send:(value:string)=>controller.enqueue(new TextEncoder().encode(value)), close:()=>controller.close(),
    fail:()=>controller.error(new TypeError('fixture-secret-never-log connection broke')), wasCancelled:()=>cancelled };
}
function request(body:ReadableStream<Uint8Array>, activities:IntakeProviderActivity[], extra:Partial<IntakeTransportRequest>={}) {
  return requestIntakeProvider({...base, httpClient:async()=>({ok:true,status:200,json:async()=>{throw Error('Body must be read once');},body}),
    onActivity:event=>activities.push(event), ...extra});
}

describe('Forge observed JSON replies, entirely offline', () => {
  test('observes headers and blank connection hints without declaring output or completion', async () => {
    const fixture=bodyFixture(), activities:IntakeProviderActivity[]=[], heartbeat=deferred<void>();
    let settled=false;
    const pending=request(fixture.body,activities,{onActivity:event=>{activities.push(event);if(event.keepAliveCount)heartbeat.resolve();}})
      .finally(()=>{settled=true;});
    fixture.send('\r\n\n'); await heartbeat.promise;
    const last=activities.at(-1)!;
    expect(last).toMatchObject({phase:'receiving_response',transport:'body_open',providerActivity:'unknown',receivedBytes:3,keepAliveCount:1,outputCharactersReceived:0});
    expect(last.responseHeadersAtMs).toBeNumber(); expect(last.firstDataAtMs).toBeNumber();
    expect(last.bodyCompletedAtMs).toBeUndefined(); expect(settled).toBe(false);
    fixture.send(envelope()); fixture.close();
    expect((await pending).content).toBe('{"名字":"完整中文"}');
    expect(activities.at(-1)?.phase).toBe('completed');
    expect(JSON.stringify(activities)).not.toContain('fixture-secret-never-log');
    expect(JSON.stringify(activities)).not.toContain('完整中文');
  });

  test('decodes Chinese split across individual UTF-8 bytes and parses only after EOF', async () => {
    const activities:IntakeProviderActivity[]=[];
    const bytes=new TextEncoder().encode(envelope());
    async function* chunks(){for(const byte of bytes)yield Uint8Array.of(byte);}
    const result=await requestIntakeProvider({...base,httpClient:async()=>({ok:true,status:200,json:async()=>null,body:chunks()}),onActivity:event=>activities.push(event)});
    expect(result.content).toBe('{"名字":"完整中文"}');
    expect(activities.at(-1)).toMatchObject({receivedBytes:bytes.length,outputCharactersReceived:result.content.length,phase:'completed'});
    expect(activities.at(-1)?.bodyCompletedAtMs).toBeNumber();
  });

  test('does not accept even a complete JSON body until the response closes', async () => {
    const fixture=bodyFixture(), received=deferred<void>(), activities:IntakeProviderActivity[]=[];
    let settled=false;
    const pending=request(fixture.body,activities,{onActivity:event=>{activities.push(event);if(event.receivedBytes)received.resolve();}}).then(value=>{settled=true;return value;});
    fixture.send(envelope());await received.promise;
    expect(settled).toBe(false);expect(activities.at(-1)?.phase).toBe('receiving_response');
    fixture.close(); expect((await pending).content).toContain('完整中文');
  });

  for (const content of ['\n\r\n','{"choices":[', 'not json']) test(`blocks incomplete or invalid response ${JSON.stringify(content)}`,async()=>{
    const fixture=bodyFixture(), activities:IntakeProviderActivity[]=[];
    const pending=request(fixture.body,activities);fixture.send(content);fixture.close();
    await expect(pending).rejects.toMatchObject({code:'invalid_response'});
    expect(activities.at(-1)).toMatchObject({failureReason:content.trim()?'invalid_json':'empty_response',phase:'failed'});
    expect(activities.at(-1)?.bodyCompletedAtMs).toBeNumber();
  });

  test('distinguishes a broken response from invalid JSON, even if it already contained a whole object', async()=>{
    const fixture=bodyFixture(), gotData=deferred<void>(), activities:IntakeProviderActivity[]=[];
    const pending=request(fixture.body,activities,{onActivity:event=>{activities.push(event);if(event.receivedBytes)gotData.resolve();}});
    fixture.send(envelope());await gotData.promise;fixture.fail();
    await expect(pending).rejects.toMatchObject({code:'network',message:'AI provider response was interrupted before completion.'});
    expect(activities.at(-1)).toMatchObject({failureReason:'response_interrupted',phase:'failed'});
    expect(activities.at(-1)?.bodyCompletedAtMs).toBeUndefined();
    expect(JSON.stringify(activities)).not.toContain('fixture-secret-never-log');
  });

  test('distinguishes a failure before connection',async()=>{
    const activities:IntakeProviderActivity[]=[];
    await expect(requestIntakeProvider({...base,httpClient:async()=>{throw new TypeError('fixture-secret-never-log');},onActivity:event=>activities.push(event)})).rejects.toMatchObject({code:'network'});
    expect(activities.at(-1)).toMatchObject({failureReason:'connection_failed'});
    expect(activities.at(-1)?.responseHeadersAtMs).toBeUndefined();
  });

  for(const afterHeaders of [false,true])for(const timedOut of [false,true])test(`classifies ${timedOut?'explicit deadline':'caller cancellation'} ${afterHeaders?'after':'before'} headers`,async()=>{
    const controller=new AbortController(),fixture=bodyFixture(),activities:IntakeProviderActivity[]=[],ready=deferred<void>();
    const pending=requestIntakeProvider({...base,signal:controller.signal,
      httpClient:async()=>{if(!afterHeaders){ready.resolve();return new Promise<never>(()=>{});}return {ok:true,status:200,json:async()=>null,body:fixture.body};},
      onActivity:event=>{activities.push(event);if(event.responseHeadersAtMs)ready.resolve();}});
    const outcome=pending.catch(error=>error);
    await ready.promise;controller.abort(new DOMException(timedOut?'deadline':'cancelled',timedOut?'TimeoutError':'AbortError'));
    expect(await outcome).toMatchObject({code:timedOut?'timeout':'network',retryable:timedOut});
    expect(activities.at(-1)).toMatchObject({failureReason:timedOut?'deadline_exceeded':'user_cancelled',phase:timedOut?'failed':'stopped'});
    if(afterHeaders)expect(fixture.wasCancelled()).toBe(true);
  });

  test('rejects an already cancelled request without invoking its client',async()=>{
    const controller=new AbortController();controller.abort();let calls=0;
    await expect(requestIntakeProvider({...base,signal:controller.signal,httpClient:async()=>{calls++;throw Error('unreachable');}})).rejects.toMatchObject({code:'network',retryable:false});
    expect(calls).toBe(0);
  });

  test('keeps legacy structural JSON adapters usable',async()=>{
    const activities:IntakeProviderActivity[]=[];
    const result=await requestIntakeProvider({...base,httpClient:async()=>({ok:true,status:200,json:async()=>JSON.parse(envelope())}),onActivity:event=>activities.push(event)});
    expect(result.content).toContain('完整中文');expect(activities.at(-1)?.bodyCompletedAtMs).toBeNumber();
  });

  test('rejects a provider token-limit stop even when the partial content happens to be valid JSON',async()=>{
    const fixture=bodyFixture(),activities:IntakeProviderActivity[]=[];
    const pending=request(fixture.body,activities);
    fixture.send(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'length'}]}));fixture.close();
    await expect(pending).rejects.toMatchObject({code:'invalid_response'});
    expect(activities.at(-1)).toMatchObject({failureReason:'provider_incomplete',phase:'incomplete'});
  });

  test('finishes if the original request settles while a decision callback remains open',async()=>{
    const fixture=bodyFixture(), decisionOpened=deferred<void>(),activities:IntakeProviderActivity[]=[];
    const pending=request(fixture.body,activities,{waitPolicy:{cycleMs:1,cyclesBeforeDecision:1,onDecision:async()=>{decisionOpened.resolve();return new Promise<never>(()=>{});}}});
    await decisionOpened.promise;fixture.send(envelope());fixture.close();
    expect((await pending).content).toContain('完整中文');
  });

  for(const encounter of [false,true])test(`${encounter?'encounter':'Actor'} formal factory keeps one request past the saved five-minute failure boundary`,async()=>{
    const fixture=bodyFixture(), heartbeat=deferred<void>(),headers=deferred<void>();let calls=0;let requestSignal:AbortSignal|undefined;
    let now=1_000;const clock=spyOn(Date,'now').mockImplementation(()=>now);
    const scheduled:number[]=[];const nativeTimeout=globalThis.setTimeout;
    const timers=spyOn(globalThis,'setTimeout').mockImplementation(((callback:any,delay?:number,...args:any[])=>{
      scheduled.push(delay??0);return nativeTimeout(callback,delay,...args);
    }) as typeof setTimeout);
    restoreClock=()=>{clock.mockRestore();timers.mockRestore();};
    globalThis.fetch=(async(_url:any,init:any)=>{calls++;requestSignal=init.signal;return new Response(fixture.body,{status:200});}) as typeof fetch;
    const activities:IntakeProviderActivity[]=[];
    const options={baseUrl:base.baseUrl,apiKey:base.apiKey,model:'fixture',onActivity:(event:IntakeProviderActivity)=>{activities.push(event);if(event.responseHeadersAtMs)headers.resolve();if(event.keepAliveCount)heartbeat.resolve();}};
    const provider=encounter?createEncounterIntakeProviders(options).provider:createBrowserAiProvider(options);
    const source='Unstructured creature source';
    const pending=provider.discover({source,sourceSha256:hashSource(source),chunkStart:0,chunkEnd:source.length});
    await headers.promise;now+=savedFailure.durationMs+1;fixture.send('\n');await heartbeat.promise;
    expect(requestSignal?.aborted).toBe(false);expect(calls).toBe(savedFailure.actualRequests);
    expect(scheduled).not.toContain(savedFailure.knownOuterDeadlineMs);
    expect(scheduled).not.toContain(600_000);
    expect(scheduled).toContain(180_000); // observation timer, not a request-ending timer
    expect(activities.at(-1)!.elapsedMs).toBeGreaterThan(300_000);
    expect(activities.at(-1)?.providerActivity).toBe('unknown');
    fixture.send(envelope('{"schemaVersion":1,"candidates":[]}'));fixture.close();
    expect((await pending).candidates).toEqual([]);expect(calls).toBe(1);
  });

  for(const encounter of [false,true])for(const failure of ['network','http','json'] as const)test(`${encounter?'encounter':'Actor'} formal factory never reposts ${failure} failure`,async()=>{
    let calls=0;
    globalThis.fetch=(async()=>{calls++;if(failure==='network')throw new TypeError('offline connection failure');return new Response(failure==='json'?'invalid json':'',{status:failure==='http'?503:200});}) as unknown as typeof fetch;
    const options={baseUrl:base.baseUrl,apiKey:base.apiKey,model:'fixture'};
    const provider=encounter?createEncounterIntakeProviders(options).provider:createBrowserAiProvider(options);
    const source='Unstructured creature source';
    await expect(provider.discover({source,sourceSha256:hashSource(source),chunkStart:0,chunkEnd:source.length})).rejects.toBeInstanceOf(Error);
    expect(calls).toBe(1);
  });

  for(const encounter of [false,true])for(const timedOut of [false,true])test(`${encounter?'encounter':'Actor'} caller reason survives its native response body`,async()=>{
    const controller=new AbortController(),fixture=bodyFixture(),ready=deferred<void>(),activities:IntakeProviderActivity[]=[];
    globalThis.fetch=(async()=>new Response(fixture.body,{status:200})) as unknown as typeof fetch;
    const options={baseUrl:base.baseUrl,apiKey:base.apiKey,model:'fixture',onActivity:(event:IntakeProviderActivity)=>{activities.push(event);if(event.responseHeadersAtMs)ready.resolve();}};
    const provider=encounter?createEncounterIntakeProviders(options,controller.signal).provider:createBrowserAiProvider(options,controller.signal);
    const source='Unstructured creature source';
    const outcome=provider.discover({source,sourceSha256:hashSource(source),chunkStart:0,chunkEnd:source.length}).catch(error=>error);
    await ready.promise;controller.abort(new DOMException('offline abort',timedOut?'TimeoutError':'AbortError'));
    const error=await outcome;
    if(!encounter&&!timedOut)expect(error).toMatchObject({name:'AbortError'});
    else expect(error).toMatchObject({code:timedOut?'timeout':'network',retryable:timedOut});
    expect(activities.at(-1)?.failureReason).toBe(timedOut?'deadline_exceeded':'user_cancelled');
  });
});

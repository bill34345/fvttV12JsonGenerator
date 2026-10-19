import {describe,expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import fixture from './fixtures/forge-archivist-discovery-failure.json';
import {singleCreatureSourceCandidate,normalizeDiscovery,partitionDiscoveryCandidates} from '@fvtt-json-generator/intake-ai/discovery';
import {MonsterIntakeProviderError,OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {splitStagedMonsterSource,stagedSourceBiography} from '@fvtt-json-generator/intake-ai/staged-source';
import type {DiscoveryRequest,ExtractionRequest} from '@fvtt-json-generator/intake-ai/types';

const source=fixture.source;
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const forbidden=async():Promise<never>=>{throw Error('Unexpected offline stage');};
const request=(text:string,start=0,end=text.length):DiscoveryRequest=>({source:text,sourceSha256:hash(text),chunkStart:start,chunkEnd:end});

function localProvider(reply:(payload:any)=>unknown,staged=false){
  const calls:Array<{payload:any;prompt:string}>=[];
  const provider=new OpenAICompatibleMonsterIntakeProvider({baseUrl:'https://offline.invalid/v1',apiKey:'offline-fixture-only',
    authMode:'api-key',reviewModel:'offline-fixture',model:'offline-fixture',timeoutMs:1000,repairTimeoutMs:1000,
    stagedExtraction:staged?{baseMode:'facts',featureMode:'source'}:false,httpClient:async(_url,init)=>{
      const body=JSON.parse(init.body);
      const payload=JSON.parse(body.messages.find((m:any)=>m.role==='user').content);
      calls.push({payload,prompt:body.messages.find((m:any)=>m.role==='system').content});
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(reply(payload))}}]})};
    }});
  return {provider,calls};
}

describe('saved first discovery failure and source ownership',()=>{
  test('fixture is the unchanged public failure source and complete original reply',()=>{
    expect(hash(source)).toBe(fixture.sourceSha256);
    expect(fixture.discovery.candidates[0]!.start).toBe(2130);
    expect(source.indexOf('## Archivist Grim cr 10')).toBe(2129);
    expect(fixture.discovery.candidates[0]!.quote).not.toBe(source.slice(2130));
  });

  test.each(['cr','CR','Cr','cR'])('local source envelope accepts challenge heading %s without a model',variant=>{
    const input=source.replace('## Archivist Grim cr 10',`## Archivist Grim ${variant} 10`);
    expect(singleCreatureSourceCandidate(input)).toMatchObject({label:'Archivist Grim',start:0,end:input.length,quote:input});
  });
  test.each(['SPEED','speed','Speed'])('local source envelope accepts %s',variant=>{
    const input=source.replace('Speed      Fly',`${variant}      Fly`);
    expect(singleCreatureSourceCandidate(input)?.quote).toBe(input);
  });
  test.each(['crlf','unicode-prefix','long-labels'])('source representation %s retains exact raw bytes',variant=>{
    const input=variant==='crlf'?source.replaceAll('\n','\r\n'):variant==='unicode-prefix'?'😀 来源\n'+source
      :source.replace(/^AC[ \t]+/mu,'Armor Class: ').replace(/^HP[ \t]+/mu,'Hit Points: ');
    expect(singleCreatureSourceCandidate(input)?.quote).toBe(input);
  });
  test('does not treat two complete statblocks as one local creature',()=>{
    expect(singleCreatureSourceCandidate(source+'\n'+source)).toBeUndefined();
  });

  test('saved model whitespace and position errors map back to the complete original source',()=>{
    const candidates=normalizeDiscovery(source,structuredClone(fixture.discovery.candidates));
    expect(candidates[0]).toMatchObject({start:2129,end:source.length,quote:source.slice(2129)});
    expect(partitionDiscoveryCandidates(source,candidates).map(c=>c.quote).join('')).toBe(source);
  });
  test.each(['number','negation','missing-rule'])('does not accept a real %s change in the saved quote',variant=>{
    const candidates=structuredClone(fixture.discovery.candidates);
    candidates[0]!.quote=variant==='number'?candidates[0]!.quote.replace('5,900','5,901')
      :variant==='negation'?candidates[0]!.quote.replace('is not destroyed','is destroyed')
      :candidates[0]!.quote.replace('The spell ends if the book is opened or destroyed.','The spell ends.');
    expect(()=>normalizeDiscovery(source,candidates)).toThrow();
  });
  test('whitespace equivalence must still have one unique occurrence',()=>{
    expect(()=>normalizeDiscovery('Hit  17 damage.\nHit   17 damage.',[
      {id:'x',label:'x',start:-1,end:-1,quote:'Hit    17 damage.'},
    ])).toThrow();
  });
  test('whitespace matching does not join separate number tokens',()=>{
    expect(()=>normalizeDiscovery('Damage 1 7.',[{id:'x',label:'x',start:-1,end:-1,quote:'Damage 17.'}])).toThrow();
  });

  test('real Forge entry skips discovery and supplies the entire seven-ability source to extraction',async()=>{
    let discoveries=0;let extracted:ExtractionRequest|undefined;
    const result=await generateEncounterFromHumanMarkdown({source,label:'offline saved discovery failure',reviewPolicy:'deferred',outputLanguage:'source',
      provider:{providerName:'offline-probe',extractionModel:'offline',reviewModel:'disabled',
        discover:async()=>{discoveries++;throw Error('Paid discovery must not be needed');},
        extract:async r=>{extracted=r;throw Error('NO_SAVED_BASE_REPLY_STOP');},review:forbidden,repair:forbidden},
      automationProvider:{generate:forbidden,review:forbidden}});
    expect(discoveries).toBe(0);
    expect(result.report.discovery).toEqual({mode:'single-statblock',providerCalls:0});
    expect(extracted?.source).toBe(source);
    expect(extracted?.candidate.quote).toBe(source);
    const plan=splitStagedMonsterSource(extracted!);
    expect(plan.features).toHaveLength(7);
    expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);
    expect(stagedSourceBiography(plan)).toContain('### Lore');
    expect(stagedSourceBiography(plan)).toContain('### Tactics');
    for(const name of ['Chained Vigil','Stifling Aura','Multiattack','Inkwrought Bonds',"Scribe's Mastery",'Consign to Myth','Fictive Twist'])
      expect(plan.features.some(unit=>unit.quote.includes(name))).toBe(true);
    expect(result.prepared).toBeUndefined(); // No invented base or Chinese response.
  });
  test('unknown mechanical headings remain rejected after the stat table',()=>{
    const input=source.replace('### Traits','### Unknown Combat Rules');
    expect(()=>splitStagedMonsterSource({source:input,sourceSha256:hash(input),candidate:{id:'x',label:'Archivist Grim',start:0,end:input.length,quote:input}})).toThrow('UNKNOWN_HEADING');
  });
  test.each(['Treasure','Habitat and Society','Local Traditions','宝藏与传闻'])('retains arbitrary pre-stat narrative heading %s without losing source',heading=>{
    const input=source.replace('### Lore',`### ${heading}`);
    const plan=splitStagedMonsterSource({source:input,sourceSha256:hash(input),candidate:{id:'narrative',label:'Gate Sentinel',start:0,end:input.length,quote:input}});
    expect(plan.units.map(unit=>unit.quote).join('')).toBe(input);
    expect(stagedSourceBiography(plan)).toContain(`### ${heading}`);
    expect(plan.features).toHaveLength(7);
  });
  test('a supported narrative position does not admit an unsupported mechanical section',()=>{
    for(const input of [source.replace('### Traits','### Treasure'),source.replace('### Lore','### Lair Actions')])
      expect(()=>splitStagedMonsterSource({source:input,sourceSha256:hash(input),candidate:{id:'unsafe',label:'Gate Sentinel',start:0,end:input.length,quote:input}})).toThrow('UNKNOWN_HEADING');
  });
  test('actual public provider entry reports a local source error with code and path before any request',async()=>{
    const input=source.replace('### Traits','### Unresolved Combat Options');
    const previousFetch=globalThis.fetch;let calls=0;
    globalThis.fetch=Object.assign(async()=>{calls++;throw Error('A source error must not reach the network');},{preconnect:previousFetch.preconnect});
    try{
      const providers=createEncounterIntakeProviders({apiKey:'offline-only',baseUrl:'https://offline.invalid/v1',model:'offline-only'});
      const output=await generateEncounterFromHumanMarkdown({source:input,label:'Gate Sentinel',...providers,reviewPolicy:'deferred',outputLanguage:'source'});
      expect(calls).toBe(0);expect(output.prepared).toBeUndefined();
      expect(output.report.actors[0]!.analysis.errorCode).toBe('invalid_source');
      expect(output.report.actors[0]!.analysis.findings[0]!.path).toMatch(/^\/source\/\d+$/u);
      expect(output.report.findings.join(' ')).toContain('UNKNOWN_HEADING');
      expect(output.report.findings.join(' ')).toContain('/source/');
      expect(output.report.findings.join(' ')).not.toContain('AI provider');
    }finally{globalThis.fetch=previousFetch;}
  });
  test('staged diagnostic metadata excludes arbitrary source text and unsafe paths',()=>{
    const error=new MonsterIntakeProviderError('invalid_source','untrusted source secret',{
      stagedDiagnostic:{stage:'source',code:'UNKNOWN_HEADING secret',path:'/source/<script>'},
    });
    expect(error.stagedDiagnostic).toBeUndefined();expect(error.diagnosticMessage).toBeUndefined();
  });
  test('a malformed base answer remains a response validation failure after one actual stub request',async()=>{
    const env=localProvider(()=>({schemaVersion:1,creature:{},uncertainties:[]}),true);
    await expect(env.provider.extract({source,sourceSha256:hash(source),candidate:{id:'response',label:'Gate Sentinel',start:0,end:source.length,quote:source}}))
      .rejects.toMatchObject({code:'invalid_response',stagedDiagnostic:{stage:'response'}});
    expect(env.calls).toHaveLength(1);
  });
});

describe('provider chooses program-owned source lines',()=>{
  test('sends numbered source lines and materializes exact offsets/quote without model copying',async()=>{
    const raw='前言😀\r\nMonster\r\nAC 14\r\n能力。\n';
    const env=localProvider(p=>({schemaVersion:1,candidates:[{id:'m',label:'Monster',firstLineId:p.sourceLines?.[0]?.id??'L1',lastLineId:p.sourceLines?.at(-1)?.id??'L3'}]}));
    const start=raw.indexOf('Monster');
    const result=await env.provider.discover(request(raw,start));
    expect(env.calls).toHaveLength(1);
    expect(env.calls[0]!.payload.sourceLines).toEqual([{id:'L1',text:'Monster'},{id:'L2',text:'AC 14'},{id:'L3',text:'能力。'}]);
    expect(env.calls[0]!.payload.source).toBeUndefined();
    expect(env.calls[0]!.prompt).not.toContain('UTF-16');
    expect(result.candidates).toEqual([{id:'m',label:'Monster',start,end:raw.length,quote:raw.slice(start)}]);
  });
  test('two selections have distinct exact raw source ranges',async()=>{
    const raw='One\nAC 10\nTwo\r\nAC 17';
    const env=localProvider(()=>({schemaVersion:1,candidates:[
      {id:'one',label:'One',firstLineId:'L1',lastLineId:'L2'},
      {id:'two',label:'Two',firstLineId:'L3',lastLineId:'L4'},
    ]}));
    const result=await env.provider.discover(request(raw));
    expect(result.candidates.map(c=>c.quote)).toEqual(['One\nAC 10\n','Two\r\nAC 17']);
  });
  test.each(['unknown','reverse','missing','legacy-coordinates'])('rejects %s selection without another request',async variant=>{
    const selection:any={id:'m',label:'Monster',firstLineId:'L1',lastLineId:'L2'};
    if(variant==='unknown')selection.lastLineId='L99';
    if(variant==='reverse'){selection.firstLineId='L2';selection.lastLineId='L1';}
    if(variant==='missing')delete selection.firstLineId;
    if(variant==='legacy-coordinates'){selection.start=0;selection.end=10;selection.quote='made up';}
    const env=localProvider(()=>({schemaVersion:1,candidates:[selection]}));
    await expect(env.provider.discover(request('Monster\nAC 14'))).rejects.toThrow();
    expect(env.calls).toHaveLength(1);
  });
});

import {test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {parseStrictJson,MonsterIntakeProviderError,OpenAICompatibleMonsterIntakeProvider,type ProviderResponseEvidence,type IntakeProviderAuditEvent} from '@fvtt-json-generator/intake-ai/provider';

const suffixes=['}','}}',"'}",'"}'] as const;
const bodies=[
  {schemaVersion:1,candidates:[],zero:0},
  {name:'Amber Watcher',values:{ac:14,hp:31},notes:'Literal } and ] stay inside the JSON string.'},
  {name:'银色信使',entries:[{text:'An escaped "quote", a backslash \\, and nested {[ delimiters.'}],enabled:false},
];
for(const [index,body]of bodies.entries())test('only the short closed delimiter tail is removed without changing neutral body '+index,()=>{
  const json=JSON.stringify(body);
  for(const suffix of suffixes)expect(parseStrictJson(json+suffix)).toEqual(body);
  expect(parseStrictJson(json+' }\n } ')).toEqual(body);
  expect(parseStrictJson(json)).toEqual(body);
});

test('existing reasoning/fence wrappers remain compatible with bounded suffix recovery',()=>{
  const body={schemaVersion:1,candidates:[],value:17},json=JSON.stringify(body);
  expect(parseStrictJson('<analysis>private thoughts</analysis>```json\n'+json+"'}"+'\n```')).toEqual(body);
});

for(const [label,raw]of [
  ['second object','{"a":1} {"b":2}'],
  ['empty second object','{"a":1}{}'],
  ['second scalar','{"a":1} null'],
  ['trailing prose','{"a":1} explanation'],
  ['prose before suffix',"{\"a\":1} explanation'}"],
  ['comment','{"a":1} /* comment */'],
  ['long tail','{"a":1}}}}'],
  ['three-character quote tail',"{\"a\":1}'}}"],
  ['arbitrary punctuation','{"a":1};'],
  ['internal tail whitespace',"{\"a\":1}' }"],
  ['missing value',"{\"a\":}'}"],
  ['missing comma',"{\"a\":1 \"b\":2}'}"],
  ['truncated object','{"a":{"b":2}'],
  ['truncated string','{"a":"unfinished }'],
  ['mismatched container',"{\"a\":[1,2}'}"],
  ['top-level array',"[1,2]'}"],
  ['top-level null',"null'}"],
  ['top-level number',"17'}"],
  ['top-level quoted object',JSON.stringify('{"a":1}')+"'}"],
  ['leading prose','Here is JSON: {"a":1}'],
  ['unresolved reasoning','{"a":"<think>"}'],
] as const)test('format recovery fails closed for '+label,()=>{
  expect(()=>parseStrictJson(raw)).toThrow(MonsterIntakeProviderError);
});

const frozenRoot='.local/forge-new-three-paired-20261022/frozen-model-calls';
const frozenPaths=[`${frozenRoot}/forge-N2-5-reply-0.txt`,`${frozenRoot}/forge-N2-6-reply-0.txt`];
const frozenTest=frozenPaths.every(existsSync)?test:test.skip;
frozenTest('the unchanged original N2 response has exactly the saved correction object plus two terminal characters',()=>{
  const before=frozenPaths.map(path=>readFileSync(path,'utf8')),raw=before[0]!.trim(),prefix=raw.slice(0,-2);
  expect(raw.slice(-2)).toBe("'}");expect(prefix.length).toBe(1505);
  expect(sha256(prefix)).toBe('0b61d7524f0abb9a4feef125277507d31fe7ed5dda23816435cbd600438e75e7');
  expect(prefix).toBe(before[1]!.trim());expect(parseStrictJson(before[0]!)).toEqual(JSON.parse(before[1]!));
  expect(frozenPaths.map(path=>readFileSync(path,'utf8'))).toEqual(before);
});

const connection={authMode:'api-key' as const,baseUrl:'https://format.invalid/v1',apiKey:'format-private-key',model:'format-model',reviewModel:'format-model',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1 as const};
const source='A private format-recovery fixture.',request={source,sourceSha256:sha256(source),chunkStart:0,chunkEnd:source.length};
const response=(content:string)=>new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200});

test('one local recovery records the full original response and verifiable syntax receipt without another request',async()=>{
  const value={schemaVersion:1 as const,candidates:[]},prefix=JSON.stringify(value),raw=prefix+"'}",events:ProviderResponseEvidence[]=[],audits:IntakeProviderAuditEvent[]=[];let calls=0;
  const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,httpClient:async()=>{calls++;return response(raw);},responseEvidence:{record:event=>{events.push(event);}},audit:event=>{audits.push(event);}});
  expect(await provider.discover(request)).toEqual(value);expect(calls).toBe(1);expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({content:raw,responseHash:sha256(raw),attempt:1,truncated:false,redacted:false,
    formatRecovery:{version:1,kind:'drop-json-terminal-delimiters',originalResponseHash:sha256(raw),parsedObjectHash:sha256(prefix),objectLength:prefix.length,removedTail:"'}"}});
  expect(JSON.stringify(audits)).not.toContain('formatRecovery');expect(JSON.stringify(audits)).not.toContain(raw);
});

test('unmodified and rejected JSON still capture the original text once and have no recovery receipt',async()=>{
  for(const raw of ['{"schemaVersion":1,"candidates":[]}','{"schemaVersion":1} prose','{"schemaVersion":']){
    const events:ProviderResponseEvidence[]=[];let calls=0;
    const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,httpClient:async()=>{calls++;return response(raw);},responseEvidence:{record:event=>{events.push(event);}}});
    if(raw.endsWith('[]}'))await expect(provider.discover(request)).resolves.toEqual({schemaVersion:1,candidates:[]});else await expect(provider.discover(request)).rejects.toThrow(MonsterIntakeProviderError);
    expect(calls).toBe(1);expect(events).toHaveLength(1);expect(events[0]!.content).toBe(raw);expect(events[0]!.responseHash).toBe(sha256(raw));expect(events[0]!.formatRecovery).toBeUndefined();
  }
});

test('syntax recovery does not make an unsafe stage shape valid and evidence storage failure cannot add requests',async()=>{
  for(const brokenSink of [false,true]){
    const raw='{"schemaVersion":1,"candidates":{}}'+"'}",events:ProviderResponseEvidence[]=[];let calls=0,storageFailures=0;
    const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,httpClient:async()=>{calls++;return response(raw);},responseEvidence:{record:event=>{events.push(event);if(brokenSink)throw Error('private evidence storage error');},onStorageFailure:()=>{storageFailures++;}}});
    await expect(provider.discover(request)).rejects.toThrow(MonsterIntakeProviderError);expect(calls).toBe(1);expect(events).toHaveLength(1);expect(events[0]!.content).toBe(raw);expect(events[0]!.formatRecovery?.removedTail).toBe("'}");expect(storageFailures).toBe(brokenSink?1:0);
  }
});

test('format receipts retain only hashes and fixed punctuation when the original content requires secret redaction',async()=>{
  const prefix=JSON.stringify({schemaVersion:1,candidates:[],secret:connection.apiKey}),raw=prefix+"'}",events:ProviderResponseEvidence[]=[];
  const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,httpClient:async()=>response(raw),responseEvidence:{record:event=>{events.push(event);}}});
  await provider.discover(request);expect(events[0]!.redacted).toBe(true);expect(events[0]!.responseHash).toBe(sha256(raw));expect(events[0]!.formatRecovery?.parsedObjectHash).toBe(sha256(prefix));expect(JSON.stringify(events)).not.toContain(connection.apiKey);
});

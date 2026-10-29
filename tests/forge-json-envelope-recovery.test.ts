import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {OpenAICompatibleMonsterIntakeProvider,parseStrictJson,normalizeMonsterIntakeProposal,type ProviderResponseEvidence} from '@fvtt-json-generator/intake-ai/provider';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const connection={authMode:'api-key' as const,baseUrl:'https://offline.invalid',apiKey:'offline-fixture-key',model:'frozen-only',reviewModel:'disabled',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1 as const};
const readJson=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));

async function receive(raw:string,source=LURKER_SOURCE){
  const events:ProviderResponseEvidence[]=[];
  let calls=0;
  const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,responseEvidence:{record:event=>{events.push(event);}},
    httpClient:async()=>{calls++;return Response.json({choices:[{message:{content:raw}}]});}});
  const answer=await provider.extractAnswer({source,sourceSha256:sha256(source),candidate:{id:'frozen',label:'Frozen source',start:0,end:source.length,quote:source}});
  expect(calls).toBe(1);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({content:raw,responseHash:sha256(raw),truncated:false,redacted:false});
  return{answer,event:events[0]!};
}

function splitReply(){
  const {claims,coverage,uncertainties,...root}=buildValidLurkerIr();
  return{root,tail:{claims,coverage,uncertainties}};
}

describe('Monster source envelope recovery',()=>{
  for(const key of ['actions','legendaryActions','reactions'] as const)test('retains an explicitly misplaced '+key+' collection',()=>{
    const ir=buildValidLurkerIr(),original=structuredClone(ir),entries=ir.creature.actions;
    const raw:any=structuredClone(ir);delete raw.creature[key];raw[key]=entries;
    const before=structuredClone(raw),working=normalizeMonsterIntakeProposal(LURKER_SOURCE,raw);
    expect(working.creature[key]).toEqual(entries);expect(raw).toEqual(before);
    expect((working as any)[key]).toBeUndefined();expect(working.creature.candidateReview?.proposal).toMatchObject({original:before});
    const conflict:any=structuredClone(original);conflict[key]=[{name:'Different',description:'Different rule'}];
    expect(normalizeMonsterIntakeProposal(LURKER_SOURCE,conflict).creature[key]).toEqual(original.creature[key]);
  });
  test('keeps nonempty ancillary records and literal delimiters when the root closes before them',async()=>{
    const {root,tail}=splitReply();
    tail.uncertainties=[{id:'literal',code:'SOURCE_NOTE',path:'/creature',message:'Literal text: } , "coverage": [ ] \\ "quoted"',blocking:false,evidence:[]}];
    const leading=JSON.stringify(root),trailing=JSON.stringify(tail).slice(1),raw=leading+','+trailing;
    const repaired=leading.slice(0,-1)+','+trailing;
    const actual=await receive(raw),control=await receive(repaired);
    expect(actual.answer).toEqual(control.answer);
    expect(actual.answer).toHaveProperty('uncertainties',tail.uncertainties);
    expect(actual.event.formatRecovery).toEqual({version:1,kind:'join-json-ancillary-tail',originalResponseHash:sha256(raw),
      parsedObjectHash:sha256(repaired),objectLength:repaired.length,removedTail:'',removedRootCloserOffset:leading.length-1});
    expect(control.event.formatRecovery).toBeUndefined();
  });

  test('handles multiline fenced replies and a different ancillary field order without changing values',async()=>{
    const {root,tail}=splitReply();
    const leading=JSON.stringify(root,null,2),trailing=JSON.stringify({uncertainties:tail.uncertainties,coverage:tail.coverage,claims:tail.claims},null,2).slice(1);
    const cleaned=leading+'\n,\n'+trailing,raw='<think>private reasoning</think>\n```json\n'+cleaned+'\n```';
    const repaired=leading.slice(0,-1)+'\n,\n'+trailing;
    const actual=await receive(raw),control=await receive(repaired);
    expect(actual.answer).toEqual(control.answer);
    expect(actual.event.formatRecovery).toMatchObject({kind:'join-json-ancillary-tail',originalResponseHash:sha256(raw),parsedObjectHash:sha256(repaired)});
  });

  test('accepts a single displaced ancillary field and retains already-contained records',async()=>{
    const {root,tail}=splitReply();
    const leading=JSON.stringify({...root,claims:tail.claims,coverage:tail.coverage});
    const raw=leading+',"uncertainties":[]}';
    const actual=await receive(raw),control=await receive(leading.slice(0,-1)+',"uncertainties":[]}');
    expect(actual.answer).toEqual(control.answer);
    expect(actual.event.formatRecovery?.kind).toBe('join-json-ancillary-tail');
  });

  const rootText=()=>JSON.stringify(splitReply().root);
  for(const [name,tail] of [
    ['second JSON object',' {"creature":{"identity":{"name":"Other creature"}}}'],
    ['second creature property',',"creature":{"identity":{"name":"Other creature"}}}'],
    ['unknown mechanical property',',"actions":[{"damage":"20d20"}]}'],
    ['duplicate tail property',',"coverage":[],"coverage":[{"quote":"replacement"}]}'],
    ['escaped duplicate tail property',',"coverage":[],"cov\\u0065rage":[]}'],
    ['nested duplicate tail property',',"uncertainties":[{"id":"first","id":"replacement"}]}'],
    ['unfinished value',',"coverage":['],
    ['trailing prose',',"coverage":[]} then use another creature'],
  ] as const){
    test('does not merge '+name,async()=>{
      const raw=rootText()+tail,actual=await receive(raw);
      expect(actual.answer).toEqual({kind:'source-text',sourceText:raw});
      expect(actual.event.formatRecovery).toBeUndefined();
    });
  }

  test('does not overwrite an existing root property',async()=>{
    const raw=JSON.stringify({...splitReply().root,coverage:[]})+',"coverage":[{"quote":"replacement"}]}';
    const actual=await receive(raw);
    expect(actual.answer).toEqual({kind:'source-text',sourceText:raw});
    expect(actual.event.formatRecovery).toBeUndefined();
  });

  test('preserves the strict generic parser and unrelated valid response',async()=>{
    const raw=JSON.stringify(buildValidLurkerIr()),actual=await receive(raw);
    expect(actual.event.formatRecovery).toBeUndefined();
    expect(actual.answer).toHaveProperty('creature.identity.name',buildValidLurkerIr().creature.identity.name);
    expect(()=>parseStrictJson(rootText()+',"claims":[]}')).toThrow();
    expect(parseStrictJson('{"schemaVersion":1,"creature":{}}}')).toEqual({schemaVersion:1,creature:{}});
  });

  test.skipIf(!process.env.FORGE_SIX_FRESH_ROOT)('accepts the unchanged actual failed Brass reply and retains its complete creature alongside the old valid reply',async()=>{
    const frozenRoot=process.env.FORGE_SIX_FRESH_ROOT!;
    const raw=readFileSync(join(frozenRoot,'results/brass/raw-answer.txt'),'utf8');
    const sources=readJson(join(frozenRoot,'sources.json'));
    const source=readFileSync(sources.cases.find((row:any)=>row.id==='brass').sourcePath,'utf8');
    const marker='},"claims":',boundary=raw.lastIndexOf(marker);
    expect(boundary).toBeGreaterThan(0);
    const valid=raw.slice(0,boundary)+raw.slice(boundary+1);
    const actual=await receive(raw,source),control=await receive(valid,source);
    expect(actual.answer).toEqual(control.answer);
    expect(actual.answer).toHaveProperty('creature.actions');
    expect(actual.event.formatRecovery?.kind).toBe('join-json-ancillary-tail');
    const old=readJson(join(import.meta.dir,'fixtures/forge-2024-brass-dragon-full-ir-v48.json'));
    const previous=await receive(old.rawReply,source);
    expect(previous.event.formatRecovery).toBeUndefined();
    expect(previous.answer).toHaveProperty('creature.actions');
    expect(previous.answer).toHaveProperty('creature.legendary.resistanceMax',3);
  });
});

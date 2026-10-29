import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {compareMonsterIntakeProjection} from '@fvtt-json-generator/intake-ai/verifier';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import type {ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';

async function generate(values:string[],custom='',version:'12'|'14'='14'){
  return new ActorGenerator({fvttVersion:version,effectProfile:'core',translationService:null}).generate({
    name:'Language visibility',type:'npc',abilities:{},attributes:{hp:{value:30,max:30},ac:{value:12,calc:'flat'}},
    details:{},traits:{languages:values,languagesCustom:custom},items:[],
  });
}

describe('v14 language visibility follows registered identities without dropping literal languages',()=>{
  test('an unregistered name stays visible beside the complete existing note',async()=>{
    const note='telepathy 120 ft. (does not permit a reply)';
    const actor=await generate(['Unknown Deep Tongue'],note);
    expect(actor.system.traits.languages).toEqual({value:[],custom:'Unknown Deep Tongue; '+note});
  });
  test('mixed known aliases and unknown names retain their native and visible portions',async()=>{
    const note='  a literal qualification; preserved exactly  ';
    const actor=await generate(['Common','旧星语','原初语','Deep Speech'],note);
    expect(actor.system.traits.languages).toEqual({value:['common','primordial','deep'],custom:'旧星语; '+note});
  });
  test('qualified known-looking text does not become an unqualified native language',async()=>{
    const actor=await generate(['Common (understands only)','Celestial'],'cannot speak the first language');
    expect(actor.system.traits.languages).toEqual({value:['celestial'],custom:'Common (understands only); cannot speak the first language'});
  });
  test('ALL and dialect identities preserve source order and case-normalized keys',async()=>{
    const actor=await generate(['ALL','Ignan','Terran','Elvish','Custom Tongue']);
    expect(actor.system.traits.languages).toEqual({value:['ALL','ignan','terran','elvish'],custom:'Custom Tongue'});
  });
  test('a literal custom entry already carries an unknown name without duplication',async()=>{
    const actor=await generate(['Custom Tongue','Custom Tongue','Common','Common'],'Custom Tongue; complete note');
    expect(actor.system.traits.languages).toEqual({value:['common','common'],custom:'Custom Tongue; complete note'});
  });
  test('prototype keys remain plain visible language text',async()=>{
    const actor=await generate(['constructor','__proto__']);
    expect(actor.system.traits.languages).toEqual({value:[],custom:'constructor; __proto__'});
  });
  test('explicit none and an existing literal None note remain non-languages',async()=>{
    expect((await generate(['None','无'],'None')).system.traits.languages).toEqual({value:[],custom:'None'});
    expect((await generate([],'None')).system.traits.languages).toEqual({value:[],custom:'None'});
  });
  test('the established YAML none marker does not become visible internal control text',async()=>{
    const result=await convertMarkdownContentToJson({content:'---\n名称: Language visibility\n类型: npc\n语言: [无]\n语言备注: None\n---\n',fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
    expect((result.rawJson as any).system.traits.languages).toEqual({value:[],custom:'None'});
  });
  test('v12 retains its established language projection',async()=>{
    expect((await generate(['Unknown Deep Tongue','Common'],'literal note','12')).system.traits.languages)
      .toEqual({value:['Unknown Deep Tongue','Common'],custom:'literal note'});
  });
});

const moreRoot=process.env.FORGE_MORE_FRESH_ROOT,firstRoot=process.env.FORGE_SIX_FRESH_ROOT;
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
const forbidden=async():Promise<never>=>{throw Error('Frozen language checks forbid model services');};
async function replay(root:string,id:string){
  const entry=json(join(root,'sources.json')).cases.find((row:any)=>row.id===id);
  const source=readFileSync(entry.sourcePath,'utf8'),raw=readFileSync(join(root,'results',id,'raw-answer.txt'),'utf8');
  let reads=0;
  const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'frozen',baseUrl:'https://offline.invalid',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:60_000,repairTimeoutMs:60_000,
    httpClient:async()=>{expect(++reads).toBe(1);return Response.json({choices:[{message:{content:raw}}]});}});
  const allowed={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:'disabled',discover:forbidden,extract:provider.extract.bind(provider),extractAnswer:provider.extractAnswer.bind(provider),review:forbidden,repair:forbidden};
  const input={source,sourceName:entry.name,sourceScope:'single' as const,sourceId:'actor:v1:61382994-656d-4438-99af-66069e8bd233' as ForgeSourceId,requestId:'frozen-language-visibility-'+id,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
  const analysis=await analyzeBrowserActorSourceWithAi(input,allowed);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,{...allowed,extract:forbidden,extractAnswer:forbidden});
  expect(generated.candidateAvailable).toBe(true);
  const actor=(generated.candidateResponse as any)?.result?.artifact;
  expect(actor).toBeDefined();expect(reads).toBe(1);expect(readFileSync(join(root,'results',id,'raw-answer.txt'),'utf8')).toBe(raw);
  return {actor,old:json(join(root,'results',id,'actor.json')),analysis,generated,source};
}
function sameExceptTime(current:any,expected:any){
  current._stats.createdTime=expected._stats.createdTime;current._stats.modifiedTime=expected._stats.modifiedTime;
  expect(current).toEqual(expected);
}
test.skipIf(!moreRoot)('the actual Otyugh raw reply changes only its visible language projection and detects real loss',async()=>{
  const {actor,old,analysis,generated,source}=await replay(moreRoot!,'otyugh');
  const custom=old.system.traits.languages.custom;
  expect(actor.system.traits.languages).toEqual({value:[],custom:'Otyugh; '+custom});
  expect(analysis.ir!.creature.languages.values).toEqual(['Otyugh']);
  const languageCodes=(findings:{code:string}[])=>findings.map(finding=>finding.code).filter(code=>['ACTOR_LANGUAGE_DRIFT','ACTOR_LANGUAGE_NOTE_DRIFT'].includes(code));
  expect(languageCodes(generated.findings)).toEqual([]);
  const compare=(candidate:any,ir:MonsterIntakeIR=analysis.ir!)=>languageCodes(compareMonsterIntakeProjection(source,ir,generated.markdown!,candidate,analysis.validation!).findings);
  const missingUnknown=structuredClone(actor);
  missingUnknown.system.traits.languages.custom=custom;
  expect(compare(missingUnknown)).toContain('ACTOR_LANGUAGE_NOTE_DRIFT');
  const missingNote=structuredClone(actor);
  missingNote.system.traits.languages.custom='Otyugh';
  expect(compare(missingNote)).toContain('ACTOR_LANGUAGE_NOTE_DRIFT');
  const mixedIr=structuredClone(analysis.ir!);
  mixedIr.creature.languages.values.unshift('Common');
  const mixedActor=structuredClone(actor);
  mixedActor.system.traits.languages.value=['common'];
  expect(compare(mixedActor,mixedIr)).toEqual([]);
  mixedActor.system.traits.languages.value=[];
  expect(compare(mixedActor,mixedIr)).toContain('ACTOR_LANGUAGE_DRIFT');
  actor.system.traits.languages=old.system.traits.languages;
  sameExceptTime(actor,old);
});
test.skipIf(!firstRoot)('the unrelated complete Roper Actor remains unchanged',async()=>{
  const {actor,old}=await replay(firstRoot!,'roper');sameExceptTime(actor,old);
});

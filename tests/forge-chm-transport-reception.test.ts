import {expect,test,setSystemTime} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {hashSource,hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {OpenAICompatibleMonsterIntakeProvider,normalizeMonsterIntakeProposal,parseStrictJson,type ProviderResponseEvidence} from '@fvtt-json-generator/intake-ai/provider';
import {requestIntakeProvider,createContinuousIntakeWaitPolicy} from '@fvtt-json-generator/intake-ai/transport';
import {OpenAICompatibleItemIntakeProvider} from '@fvtt-json-generator/intake-ai/item-provider';
import {OpenAICompatibleSpeciesIntakeProvider} from '@fvtt-json-generator/intake-ai/species-provider';
import {analyzeBrowserActorSourceWithAi,analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('No extra model request is permitted');};
const offline={providerName:'local-only',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
const input={source:LURKER_SOURCE,sourceName:'Reception fixture',sourceScope:'single' as const,requestId:'reception-fixture',sourceId:'actor:v1:22600a3f-8819-41e1-ade8-998768910011' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
const connection={authMode:'api-key' as const,baseUrl:'https://fixture.invalid',apiKey:'fixture-key',model:'fixture',reviewModel:'fixture',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1 as const};
function completed(content:string){return 'event: response.completed\ndata: '+JSON.stringify({type:'response.completed',sequence_number:0,response:{id:'fixture-response',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:content}]}]}})+'\n\n';}
function stream(body:string){return new Response(body,{status:200,headers:{'content-type':'text/event-stream'}});}
function actorProvider(body:string){
  const evidence:ProviderResponseEvidence[]=[],bodies:any[]=[];
  const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,transport:{protocol:'openai-responses',stream:true},structuredOutput:{mode:'json_object'},
    httpClient:async(_url,init)=>{bodies.push(JSON.parse(init.body));return stream(body);},responseEvidence:{record:event=>{evidence.push(event);}}});
  return{provider,evidence,bodies};
}
async function generate(ir:ReturnType<typeof buildValidLurkerIr>){return generateBrowserActorIntakeCandidate(input,analyzeBrowserActorIntakeDraft(input,ir,offline),offline);}

test('completed Actor Markdown reaches existing text conversion despite a requested JSON output hint',async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const markdown=renderMonsterIntakeMarkdown(buildValidLurkerIr()),fixture=actorProvider(completed(markdown));
    const analysis=await analyzeBrowserActorSourceWithAi(input,fixture.provider),result=await generateBrowserActorIntakeCandidate(input,analysis,offline),baseline=await generate(buildValidLurkerIr());
    expect(analysis.sourceText).toBe(markdown);expect(analysis.ir).toBeUndefined();expect(result.candidateAvailable).toBe(true);
    expect((result.candidateResponse as any).result.artifact).toEqual((baseline.candidateResponse as any).result.artifact);
    expect(fixture.bodies).toHaveLength(1);expect(fixture.bodies[0].text.format.type).toBe('json_object');
    expect(fixture.evidence[0]).toMatchObject({content:markdown,truncated:false});expect(fixture.evidence[0]?.kind).toBeUndefined();
  }finally{setSystemTime();}
});

test('only missing terminal containers are completed at Actor reception without changing any literal field or raw reply',async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const ir={...buildValidLurkerIr(),literalTail:{text:'Braces } ] and an escaped "quote" remain literal.',values:[0,17]}};
    const original=structuredClone(ir),full=JSON.stringify(ir),raw=full.slice(0,-2),fixture=actorProvider(completed(raw));
    const analysis=await analyzeBrowserActorSourceWithAi(input,fixture.provider),result=await generateBrowserActorIntakeCandidate(input,analysis,offline),baseline=await generate(buildValidLurkerIr());
    expect(analysis.ir).toBeDefined();expect(analysis.sourceText).toBeUndefined();expect((analysis.ir as any).literalTail).toEqual(ir.literalTail);
    expect(result.candidateAvailable).toBe(true);expect((result.candidateResponse as any).result.artifact).toEqual((baseline.candidateResponse as any).result.artifact);
    expect(fixture.evidence).toHaveLength(1);expect(fixture.evidence[0]).toMatchObject({content:raw,responseHash:hashSource(raw),truncated:false,
      formatRecovery:{kind:'complete-json-terminal-delimiters',originalResponseHash:hashSource(raw),parsedObjectHash:hashSource(full),addedTail:'}}',removedTail:''}});
    expect(fixture.bodies).toHaveLength(1);expect(ir).toEqual(original);expect(()=>parseStrictJson(raw)).toThrow();
  }finally{setSystemTime();}
});

for(const raw of ['{"creature":{"identity":{"name":"unfinished','{"creature":{"identity":}'])test('unavailable literal values are not invented while the returned text remains available: '+raw,async()=>{
  const fixture=actorProvider(completed(raw)),answer=await fixture.provider.extractAnswer({source:input.source,sourceSha256:hashSource(input.source),candidate:{id:'one',label:'one',start:0,end:input.source.length,quote:input.source}});
  expect(answer).toEqual({kind:'source-text',sourceText:raw});expect(fixture.evidence[0]?.formatRecovery).toBeUndefined();expect(fixture.bodies).toHaveLength(1);
});

test('default transport and independent Item/Species reception retain their existing structured JSON contract',async()=>{
  const raw='{"schemaVersion":1',request={source:input.source,sourceSha256:hashSource(input.source),candidate:{id:'one',label:'one',start:0,end:input.source.length,quote:input.source}};
  await expect(requestIntakeProvider({...connection,protocol:'openai-responses',stream:true,structuredOutput:{mode:'json_object'},systemPrompt:'fixture',userContent:'{}',httpClient:async()=>stream(completed(raw))})).rejects.toMatchObject({failure:{reason:'invalid_json',bodyComplete:true}});
  const item=new OpenAICompatibleItemIntakeProvider({...connection,transport:{protocol:'openai-responses',stream:true},waitPolicy:createContinuousIntakeWaitPolicy(),httpClient:async()=>stream(completed(raw))});
  await expect(item.extract(request)).rejects.toMatchObject({code:'invalid_response'});
  const species=new OpenAICompatibleSpeciesIntakeProvider({...connection,httpClient:async()=>Response.json({choices:[{message:{content:raw}}]})});
  await expect(species.extract(request)).rejects.toMatchObject({code:'invalid_response'});
  expect(()=>parseStrictJson(raw)).toThrow();
});

test('existing strict consumers retain terminal-extra-punctuation recovery without accepting missing values or trailing objects',()=>{
  const value={name:'Literal } and ]',parts:[{formula:'2d6+3',amount:17}]},text=JSON.stringify(value);
  for(const tail of ['}','}}',"'}",'"}'])expect(parseStrictJson(text+tail)).toEqual(value);
  expect(()=>parseStrictJson(text.slice(0,-1))).toThrow();expect(()=>parseStrictJson(text+'{}')).toThrow();
});

test('Actor content deferral cannot turn HTTP failures, no response or an empty response body into an answer',async()=>{
  for(const[kind,code,reason]of[['http','http_error','http_error'],['network','network','connection_failed'],['empty','invalid_response','empty_response']] as const){
    let requests=0;
    const provider=new OpenAICompatibleMonsterIntakeProvider({...connection,transport:{protocol:'openai-responses',stream:true},structuredOutput:{mode:'json_object'},httpClient:async()=>{
      requests++;if(kind==='network')throw new TypeError('fixture offline');return new Response(kind==='empty'?'':'fixture service failure',{status:kind==='http'?503:200});
    }});
    await expect(provider.extractAnswer({source:input.source,sourceSha256:hashSource(input.source),candidate:{id:'one',label:'one',start:0,end:input.source.length,quote:input.source}})).rejects.toMatchObject({code,transportFailure:{reason}});
    expect(requests).toBe(1);
  }
});

for(const[reason,body]of[
  ['provider_incomplete','event: response.incomplete\ndata: '+JSON.stringify({type:'response.incomplete',sequence_number:0,response:{status:'incomplete'}})+'\n\n'],
  ['provider_incomplete','event: response.output_text.delta\ndata: '+JSON.stringify({type:'response.output_text.delta',sequence_number:0,delta:'readable partial answer'})+'\n\n'],
  ['empty_response',completed('')],
] as const)test('a real transport completion/answer failure keeps its specific reason '+reason,async()=>{
  const fixture=actorProvider(body);
  await expect(fixture.provider.extractAnswer({source:input.source,sourceSha256:hashSource(input.source),candidate:{id:'one',label:'one',start:0,end:input.source.length,quote:input.source}})).rejects.toMatchObject({code:'invalid_response',transportFailure:{reason}});
  expect(fixture.bodies).toHaveLength(1);expect(fixture.evidence[0]?.kind).toBe('transport-failure');
});

const frozenRoot=process.env.FORGE_CHM_FROZEN_ROOT;
test.skipIf(!frozenRoot)('the Berserker failure-evidence excerpt can be replayed as a labelled synthetic completed input, without changing original evidence',async()=>{
  const answerPath=join(frozenRoot!,'results','berserker','raw-answer.txt'),before=readFileSync(answerPath,'utf8'),source=readFileSync(join(frozenRoot!,'sources-r2','berserker.md'),'utf8');
  const fixture=actorProvider(completed(before)),current={...input,source,sourceName:'Berserker evidence-excerpt synthetic replay'};
  const analysis=await analyzeBrowserActorSourceWithAi(current,fixture.provider),result=await generateBrowserActorIntakeCandidate(current,analysis,offline),actor=(result.candidateResponse as any)?.result?.artifact;
  expect(result.candidateAvailable).toBe(true);expect(actor.system.attributes.hp.value).toBe(67);expect(actor.system.attributes.ac.flat).toBe(13);
  expect(actor.items.some((item:any)=>item.name.includes('Bloodied Fury'))).toBe(true);const attack=actor.items.find((item:any)=>item.name.includes('Greataxe'));
  const activities=Object.values<any>(attack.system.activities);expect(activities.some(activity=>activity.roll?.formula==='1d20+5')).toBe(true);
  expect(activities.some(activity=>activity.damage?.parts?.some((part:any)=>part.number===1&&part.denomination===12&&part.bonus==='3'&&part.types.includes('slashing')))).toBe(true);
  expect(fixture.evidence[0]).toMatchObject({content:before,formatRecovery:{kind:'complete-json-terminal-delimiters',addedTail:'}'}});
  expect(fixture.bodies).toHaveLength(1);expect(readFileSync(answerPath,'utf8')).toBe(before);expect((result.candidateResponse as any).result.artifactHash).toBe(hashArtifact(actor));
});

test('usage recovery preserves the AI value without inferring it from evidence, preserving members and counts',()=>{
  for(const[quote,explicit,expected]of[
    ['鬼婆必须完成一次长休后才能再次用此特质施展其所选的法术。',undefined,'longRest'],
    ['The creature regains its uses after finishing a short rest.',undefined,'shortRest'],
    ['Uses recover on finishing a Long Rest.',undefined,'longRest'],
    ['Uses are regained after a Long Rest.',undefined,'longRest'],
    ['每项1/日：某法术，效应持续至下一次长休。',undefined,undefined],
    ['每项2/日：完成长休后才能再次施展该法术。',undefined,undefined],
    ['Each spell 2/day. Uses recover after a Long Rest.',undefined,undefined],
    ['某法术的效应持续至下一次长休。',undefined,undefined],
    ['The effect lasts until the next Short Rest.',undefined,undefined],
    ['无需完成长休后才能再次施展该法术。',undefined,undefined],
    ['不需要完成一次短休后才能再次施展该法术。',undefined,undefined],
    ['这些法术共享一次使用，不会在完成长休后恢复。',undefined,undefined],
    ['这些法术共享一次使用，完成短休后不会恢复。',undefined,undefined],
    ['这些法术共享一次使用，完成长休后不恢复。',undefined,undefined],
    ['The creature does not require a Long Rest to use the spell again.',undefined,undefined],
    ['Uses do not recover after finishing a Short Rest.',undefined,undefined],
    ["Uses don't recover after finishing a Long Rest.",undefined,undefined],
    ['Uses never recover on finishing a Long Rest.',undefined,undefined],
    ['Once per day, or after a long rest.',undefined,undefined],
    ['After a short rest or a long rest.',undefined,undefined],
    ['Two uses.',undefined,undefined],
    ['After a long rest.','day','day'],
  ] as const){
    const ir:any=buildValidLurkerIr();ir.creature.spellcasting=[{groupId:'group',featureName:'Long Rest title is not evidence',description:'A long rest in the description does not imply recovery.',ability:'wis',evidence:[],abilityEvidence:[],componentWaivers:[],usageGroups:[{usage:'daily-shared',count:2,...(explicit?{recovery:explicit}:{}),evidence:[{start:0,end:quote.length,quote}],spellRefs:[{refId:'light',identifier:'Light',originalName:'Light',aliases:[],restrictions:[],evidence:[]}]}]}];
    const before=structuredClone(ir),normalized=normalizeMonsterIntakeProposal('Unrelated whole source mentions a day and a long rest.',ir),usage:any=normalized.creature.spellcasting![0]!.usageGroups[0];
    expect(usage.recovery).toBe(explicit);expect(usage.count).toBe(2);expect(usage.usage).toBe('daily-shared');expect(usage.spellRefs.map((ref:any)=>ref.refId)).toEqual(['light']);expect(ir).toEqual(before);
    if(expected&&!explicit)expect(normalized.creature.candidateReview?.findings??[]).not.toContainEqual(expect.objectContaining({path:'/creature/spellcasting/0/usageGroups/0/recovery'}));
    expect(normalizeMonsterIntakeProposal('Unrelated whole source mentions a day and a long rest.',normalized)).toEqual(normalized);
  }
});

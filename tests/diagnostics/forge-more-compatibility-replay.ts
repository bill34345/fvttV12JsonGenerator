import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {decodeForgeActorResponse,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';

const root=process.env.FORGE_MORE_FRESH_ROOT!,out=process.env.FORGE_MORE_FIX_OUTPUT!;
assert(root&&out&&root!==out);
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
const save=(path:string,data:unknown)=>{mkdirSync(join(out,path,'..'),{recursive:true});writeFileSync(join(out,path),JSON.stringify(data,null,2)+'\n',{flag:'wx'});};
const forbidden=async():Promise<never>=>{throw Error('Frozen replay forbids network/model calls');};
globalThis.fetch=Object.assign(forbidden,{preconnect:()=>{throw Error('No network');}});
if(process.env.FORGE_MORE_FIX_READ_EXISTING==='1'){
  const cases=read(join(root,'sources.json')).cases;
  for(const entry of cases){
    const generated=read(join(out,entry.id,'generation.json'));
    const decoded=decodeForgeActorResponse(generated.candidateResponse);
    assert(decoded.ok,'Saved formal response must pass the real wire schema: '+entry.id);
    assert.deepEqual(generated.candidateResponse.result.artifact,read(join(out,entry.id,'actor.json')));
  }
  console.log(JSON.stringify({mode:'read-existing',verifiedFormalResponses:cases.length,generationRuns:0,realModelRequests:0,outputWrites:0}));
  process.exit(0);
}
const rows:any[]=[];
for(const entry of read(join(root,'sources.json')).cases){
  const id=entry.id,source=readFileSync(entry.sourcePath,'utf8'),raw=readFileSync(join(root,'results',id,'raw-answer.txt'),'utf8');
  assert.equal(source.length,entry.sourceLength);
  const oldGeneration=read(join(root,'results',id,'generation.json'));
  const sourceId=oldGeneration.candidateResponse.result.sourceIdentity.sourceId as ForgeSourceId;
  const requestId=oldGeneration.candidateResponse.requestId as string;
  let reads=0;const evidence:any[]=[];
  const p=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:60000,repairTimeoutMs:60000,
    responseEvidence:{record:e=>{evidence.push(e);}},
    httpClient:async()=>{assert.equal(++reads,1);return Response.json({choices:[{message:{content:raw},finish_reason:'stop'}]});}});
  const provider={providerName:p.providerName,extractionModel:p.extractionModel,reviewModel:'disabled',discover:forbidden,extract:p.extract.bind(p),extractAnswer:p.extractAnswer.bind(p),review:forbidden,repair:forbidden};
  const input={source,sourceName:entry.name,sourceScope:'single' as const,requestId,sourceId,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
  try{
    const analysis=await analyzeBrowserActorSourceWithAi(input,provider);
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,{...provider,extract:forbidden,extractAnswer:forbidden});
    save(id+'/analysis.json',analysis);save(id+'/generation.json',generated);save(id+'/response-evidence.json',evidence);
    if(generated.finalSource)writeFileSync(join(out,id,'generated-source.md'),generated.finalSource,{flag:'wx'});
    const actor=generated.candidateResponse&&'result'in generated.candidateResponse?generated.candidateResponse.result.artifact as any:undefined;
    assert(actor,'Expected preserved Actor');save(id+'/actor.json',actor);
    const oldPath=join(root,'results',id,'actor.json'),diffs=existsSync(oldPath)?JSON.stringify(actor)===JSON.stringify(read(oldPath))?[]:['/actor']:null;
    rows.push({id,status:'passed',frozenResponseReads:reads,realModelRequests:0,requestId,sourceId,changes:diffs,findings:generated.findings,items:actor.items.length});
  }catch(error){rows.push({id,status:'failed',frozenResponseReads:reads,realModelRequests:0,requestId,sourceId,error:String(error)});}
  console.log(JSON.stringify(rows.at(-1)));
}
save('summary.json',{rows,realModelRequests:0,identitySource:'baseline generation candidateResponse'});
assert(rows.every(row=>row.status==='passed'),'Frozen acceptance failures preserved');

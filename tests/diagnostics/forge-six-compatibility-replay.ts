import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {hashSource,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';

const root=process.env.FORGE_SIX_FRESH_ROOT!,out=process.env.FORGE_FOUR_FIX_OUTPUT!;
assert(root&&out&&root!==out);
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
const save=(path:string,data:unknown)=>{mkdirSync(join(out,path,'..'),{recursive:true});writeFileSync(join(out,path),JSON.stringify(data,null,2)+'\n',{flag:'wx'});};
const forbidden=async():Promise<never>=>{throw Error('Frozen replay forbids network/model calls');};
globalThis.fetch=Object.assign(forbidden,{preconnect:()=>{throw Error('No network');}});
const sourceId=(id:string)=>{const h=hashSource('forge-six-fresh-first-answers-20261029:'+id);return `actor:v1:${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}` as ForgeSourceId;};
const differences=(a:any,b:any,path=''):string[]=>{
  if(JSON.stringify(a)===JSON.stringify(b))return[];
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>differences(a[key],b[key],path+'/'+key));
  return ['/ _stats/createdTime','/ _stats/modifiedTime'].map(x=>x.replace(' ','')).includes(path)?[]:[path];
};
const rows:any[]=[];
for(const entry of read(join(root,'sources.json')).cases){
  const id=entry.id,source=readFileSync(entry.sourcePath,'utf8'),raw=readFileSync(join(root,'results',id,'raw-answer.txt'),'utf8');
  assert.equal(hashSource(source),entry.sourceHash);
  let reads=0;const evidence:any[]=[];
  const p=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:60000,repairTimeoutMs:60000,
    responseEvidence:{record:e=>{evidence.push(e);}},
    httpClient:async()=>{assert.equal(++reads,1);return Response.json({choices:[{message:{content:raw},finish_reason:'stop'}]});}});
  const provider={providerName:p.providerName,extractionModel:p.extractionModel,reviewModel:'disabled',discover:forbidden,extract:p.extract.bind(p),extractAnswer:p.extractAnswer.bind(p),review:forbidden,repair:forbidden};
  const input={source,sourceName:entry.name,sourceScope:'single' as const,requestId:`six-fresh-20261029-${id}`,sourceId:sourceId(id),fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
  try{
    const analysis=await analyzeBrowserActorSourceWithAi(input,provider);
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,{...provider,extract:forbidden,extractAnswer:forbidden});
    save(id+'/analysis.json',analysis);save(id+'/generation.json',generated);save(id+'/response-evidence.json',evidence);
    if(generated.finalSource)writeFileSync(join(out,id,'generated-source.md'),generated.finalSource,{flag:'wx'});
    const actor=generated.candidateResponse&&'result'in generated.candidateResponse?generated.candidateResponse.result.artifact as any:undefined;
    assert(actor,'Expected preserved Actor');save(id+'/actor.json',actor);
    const oldPath=join(root,'results',id,'actor.json'),diffs=existsSync(oldPath)?differences(read(oldPath),actor):null;
    if(id==='priest'||id==='roper')assert.deepEqual(diffs,[]);
    if(id==='magma-mephit')assert.deepEqual(actor.system.traits.languages,{value:['primordial'],custom:'Primordial (Ignan, Terran)'});
    if(id==='unicorn'){
      assert.deepEqual(actor.system.resources.legres,{max:3,spent:0});
      const item=actor.items.find((i:any)=>i.system.identifier==='legendary-resistance');assert(item);
      assert.equal(item.system.uses.max,'');assert.equal((Object.values(item.system.activities)[0] as any).consumption.targets[0].target,'resources.legres.value');
      assert(!generated.findings.some(f=>f.code==='GEN_MECHANIC_NOT_PROJECTED'));
      assert(analysis.ir&&generated.finalSource);
      const mutations=[];
      for(const kind of ['count','target','duplicate-pool']){
        const changed=structuredClone(actor),trait=changed.items.find((i:any)=>i.system.identifier==='legendary-resistance');
        if(kind==='count')changed.system.resources.legres.max=0;
        if(kind==='target')(Object.values(trait.system.activities)[0] as any).consumption.targets[0].target='resources.legact.value';
        if(kind==='duplicate-pool')trait.system.uses.max='3';
        const findings=verifyMonsterIntake(source,analysis.ir,generated.finalSource,changed).findings;
        assert(findings.some(f=>/RESOURCE|RESISTANCE/u.test(f.code)),kind);mutations.push({kind,codes:findings.map(f=>f.code)});
      }
      save(id+'/native-resource-mutations.json',mutations);
    }
    if(id==='brass'){
      assert(analysis.ir);assert(analysis.ir.creature.legendaryActions.length>0,'Outer legendary actions must survive');
      for(const feature of analysis.ir.creature.legendaryActions)assert(actor.items.some((item:any)=>item.name.includes(feature.name)),'Missing '+feature.name);
    }
    if(id==='behir'){
      const item=actor.items.find((i:any)=>/Swallow/.test(i.name));assert(item);
      const acid=Object.values<any>(item.system.activities).find(a=>/Acid/.test(a.name));assert(acid);assert.deepEqual(acid.effects??[],[]);
    }
    rows.push({id,status:'passed',frozenResponseReads:reads,realModelRequests:0,changes:diffs,findings:generated.findings,items:actor.items.length});
  }catch(error){rows.push({id,status:'failed',frozenResponseReads:reads,realModelRequests:0,error:String(error)});}
  console.log(JSON.stringify(rows.at(-1)));
}
save('summary.json',{rows,realModelRequests:0});
assert(rows.every(row=>row.status==='passed'),'Frozen acceptance failures preserved');

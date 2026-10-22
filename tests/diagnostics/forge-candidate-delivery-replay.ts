/** Exact saved model answers only. No live HTTP and no edits to frozen inputs. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hashSource,hashArtifact} from '@fvtt-json-generator/forge-gateway-protocol';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {serializeForgeEncounterPackage,encodeForgeEncounterPackageZip} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';

const output=resolve('.local/forge-candidate-output-20261022');mkdirSync(output,{recursive:true});
const paired='.local/forge-new-three-paired-20261022';
const specifications=[
  {id:'N3',source:`${paired}/N3/source.md`,meter:`${paired}/chrome/meter-after-N3.json`,autoCorrect:false},
  {id:'N2',source:`${paired}/N2/source.md`,meter:`${paired}/chrome/meter-after-N2.json`,autoCorrect:true},
  {id:'Mage',source:'.local/forge-fresh-2024-pilot-20261021/P2/source.md',autoCorrect:false},
];
const protectedHashes:Record<string,string>={};
const read=(path:string)=>{const value=readFileSync(path,'utf8').replace(/^\uFEFF/u,'');protectedHashes[path]=hashSource(readFileSync(path,'utf8'));return value;};
const cases:any[]=[];
for(const spec of specifications){
  const source=read(spec.source),requests:any[]=[],stages:any[]=[];
  let replies:string[];
  if(spec.meter){const meter=JSON.parse(read(spec.meter));replies=meter.requests.filter((q:any)=>q.caseId===spec.id).map((q:any)=>q.replies[0].content);}
  else replies=[read('.local/forge-fresh-2024-pilot-20261021/model-requests/006/reply-1.txt'),read('.local/forge-common-boundary-20261021/P2-continuation/reply-1.txt')];
  const discovery=spec.id==='Mage'?read('.local/forge-fresh-2024-pilot-20261021/model-requests/005/reply-1.txt'):undefined;
  let responseIndex=0;const priorFetch=globalThis.fetch;
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);
    const isDiscovery=Number.isInteger(payload.chunkStart)&&Number.isInteger(payload.chunkEnd)
      ||Array.isArray(payload.sourceLines);
    const content=isDiscovery&&discovery!==undefined?discovery:replies[responseIndex++];
    if(typeof content!=='string')throw Error('No saved response for this stage. Live network is forbidden.');
    requests.push({stage:isDiscovery?'discover':payload.template?'whole':'base',correction:!!payload.correction,responseHash:hashSource(content)});
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:priorFetch.preconnect});
  try{
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'offline-fixture',model:'saved-reply',protocol:'openai-chat',timeoutMs:10000,
      autoCorrect:spec.autoCorrect,onExtractionStage:metadata=>{stages.push(metadata);}});
    const generated=await generateEncounterFromHumanMarkdown({source,label:`${spec.id} saved reply candidate`,...providers,reviewPolicy:'deferred'});
    writeFileSync(resolve(output,`${spec.id}.report.json`),JSON.stringify(generated.report,null,2)+'\n');
    if(!generated.prepared)throw Error(`${spec.id} has no package: ${generated.report.findings.join('; ')}`);
    // A fresh package identity owns only this batch's future test documents.
    // Actor sources/artifacts still come exclusively from the formal workflow.
    const bundle={...generated.prepared.bundle,id:`candidate-${spec.id.toLowerCase()}-${randomUUID().slice(0,8)}`};
    const text=serializeForgeEncounterPackage(bundle),prepared=await prepareForgeEncounter(text);
    writeFileSync(resolve(output,`${spec.id}.forge-encounter.json`),text);
    writeFileSync(resolve(output,`${spec.id}.forge-encounter.zip`),await encodeForgeEncounterPackageZip(bundle));
    writeFileSync(resolve(output,`${spec.id}.actor.json`),JSON.stringify(prepared.actors[0]!.artifact,null,2)+'\n');
    const actor:any=prepared.actors[0]!.artifact,items=actor.items??[];
    cases.push({id:spec.id,sourceHash:hashSource(source),packageId:bundle.id,packageHash:prepared.hash,
      strictStatus:prepared.actors[0]!.status,reviewFindings:prepared.reviewFindings,actorHash:hashArtifact(actor),
      items:items.map((item:any)=>({name:item.name,uses:item.system?.uses,activities:Object.values<any>(item.system?.activities??{}).map(a=>({type:a.type,attack:a.attack,damage:a.damage,save:a.save,uses:a.uses}))})),
      manifestSpells:actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest?.spellcastingGroups?.flatMap((g:any)=>g.spellRefs.map((s:any)=>s.identifier)),
      requests,stages,liveModelCalls:0});
  }finally{globalThis.fetch=priorFetch;}
}
for(const[path,expected]of Object.entries(protectedHashes))if(hashSource(readFileSync(path,'utf8'))!==expected)throw Error('Frozen input changed: '+path);
writeFileSync(resolve(output,'replay-receipt.json'),JSON.stringify({at:new Date().toISOString(),cases,protectedHashes,liveModelCalls:0},null,2)+'\n');
console.log(JSON.stringify({liveModelCalls:0,frozenFilesChecked:Object.keys(protectedHashes).length,cases:cases.map(c=>({id:c.id,status:c.strictStatus,items:c.items.length,requests:c.requests.length,corrections:c.requests.filter((r:any)=>r.correction).length,findings:c.reviewFindings.length}))}));

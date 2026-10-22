/** Current formal Forge chain using only the exact saved N3/N2 responses. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {hashSource,hashArtifact} from '@fvtt-json-generator/forge-gateway-protocol';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {serializeForgeEncounterPackage,encodeForgeEncounterPackageZip} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';

const output=resolve('.local/forge-brass-cast-20261022');mkdirSync(output,{recursive:true});
const verifyExisting=process.argv.includes('--verify-existing');
if(!verifyExisting&&['replay-receipt.json',...['N3','N2'].flatMap(id=>[`${id}.report.json`,`${id}.actor.json`,`${id}.forge-encounter.json`,`${id}.forge-encounter.zip`])]
  .some(name=>existsSync(resolve(output,name))))throw Error('Existing proof artifacts are protected; run forge:brass-cast:verify to check them without replacement.');
const baseline=JSON.parse(readFileSync(resolve(output,'frozen-before.json'),'utf8'));
const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const protectedBefore=baseline.files as Array<{path:string;sha256:string}>;
function verifyFrozen(){
  const mismatches=protectedBefore.filter(file=>sha(file.path)!==file.sha256);
  if(mismatches.length)throw Error('Protected frozen evidence changed: '+mismatches.map(file=>file.path).join(', '));
  return{historicalProtectedFiles:baseline.historicalProtectedFiles,additionalCurrentMeters:baseline.additionalCurrentMeters,mismatches:[]};
}
verifyFrozen();
const cases:any[]=[];
for(const id of ['N3','N2'] as const){
  const root=resolve('.local/forge-new-three-paired-20261022');
  const source=readFileSync(resolve(root,id,'source.md'),'utf8');
  const meter=JSON.parse(readFileSync(resolve(root,'chrome',`meter-after-${id}.json`),'utf8'));
  const saved=meter.requests.filter((request:any)=>request.caseId===id);
  const requests:any[]=[];let cursor=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const entry=saved[cursor++];
    if(!entry?.replies?.[0]?.content)throw Error('No matching frozen response; live network is forbidden.');
    const body=JSON.parse(String(init?.body));const payload=JSON.parse(body.messages[1].content);
    const content=entry.replies[0].content;
    requests.push({savedIndex:entry.index,correction:!!payload.correction,responseHash:hashSource(content)});
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:originalFetch.preconnect});
  try{
    const provider=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'saved-reply',protocol:'openai-chat',
      autoCorrect:id==='N2',timeoutMs:10000});
    const result=await generateEncounterFromHumanMarkdown({source,label:`${id} source-proof Cast verification`,...provider,reviewPolicy:'deferred'});
    if(!verifyExisting)writeFileSync(resolve(output,`${id}.report.json`),JSON.stringify(result.report,null,2)+'\n');
    if(!result.prepared)throw Error(`${id}: no formal candidate: ${result.report.findings.join('; ')}`);
    const bundle=verifyExisting?JSON.parse(readFileSync(resolve(output,`${id}.forge-encounter.json`),'utf8'))
      :{...result.prepared.bundle,id:`proof-${id.toLowerCase()}-${randomUUID().slice(0,8)}`};
    const text=serializeForgeEncounterPackage(bundle),prepared=await prepareForgeEncounter(text);
    if(!verifyExisting){
      writeFileSync(resolve(output,`${id}.forge-encounter.json`),text);
      writeFileSync(resolve(output,`${id}.forge-encounter.zip`),await encodeForgeEncounterPackageZip(bundle));
    }
    const artifact:any=prepared.actors[0]!.artifact;
    if(verifyExisting){
      const saved=JSON.parse(readFileSync(resolve(output,`${id}.actor.json`),'utf8'));
      if(hashArtifact(artifact)!==hashArtifact(saved)||hashArtifact(result.prepared.actors[0]!.artifact)!==hashArtifact(saved))
        throw Error(`${id}: final formal Actor changed from the reviewed saved package.`);
    }else writeFileSync(resolve(output,`${id}.actor.json`),JSON.stringify(artifact,null,2)+'\n');
    const analysis=result.report.actors[0]!.analysis;
    const manifest=artifact.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest;
    const row={id,sourceHash:hashSource(source),packageId:bundle.id,packageHash:prepared.hash,actorHash:hashArtifact(artifact),
      analysisStatus:analysis?.status,blocking:analysis?.validation?.blocking??[],formalStatus:prepared.actors[0]!.status,
      findings:prepared.reviewFindings,requests,corrections:requests.filter(request=>request.correction).length,
      itemCount:artifact.items.length,spellGroups:manifest?.spellcastingGroups,sourceLedger:artifact.flags?.fvttJsonGenerator?.sourceLegendaryLedger,
      items:artifact.items.map((item:any)=>({name:item.name,uses:item.system?.uses,activities:item.system?.activities,flags:item.flags})),liveModelCalls:0};
    cases.push(row);
    if(row.blocking.length)throw Error(`${id}: strict source findings remain: ${row.blocking.map((f:any)=>f.code).join(', ')}`);
    if(row.formalStatus!=='accepted'||row.findings.length)throw Error(`${id}: formal preparation retained findings or did not accept the Actor.`);
    const refs=manifest?.spellcastingGroups.flatMap((group:any)=>group.spellRefs)??[];
    if(id==='N2'&&!refs.some((ref:any)=>ref.identifier==='spiritual-weapon'&&ref.method==='innate'&&ref.uses?.value===2))throw Error('N2: independent daily Cast grant absent.');
    if(id==='N3'&&!refs.some((ref:any)=>ref.reuseOf&&ref.identifier==='scorching-ray'))throw Error('N3: existing at-will reference absent.');
    if(id==='N3'){
      const resistance=artifact.items.find((item:any)=>/^Legendary Resistance\b/iu.test(item.name));
      if(artifact.system.resources?.legres?.max!==3||String(resistance?.system.uses?.max??''))throw Error('N3: the single Actor resistance ledger was omitted or duplicated by an Item pool.');
    }
  }finally{globalThis.fetch=originalFetch;}
}
const frozen=verifyFrozen();
writeFileSync(resolve(output,verifyExisting?'frozen-after-final.json':'frozen-after.json'),JSON.stringify({status:'PASS',...frozen},null,2)+'\n');
writeFileSync(resolve(output,verifyExisting?'replay-final-verification.json':'replay-receipt.json'),JSON.stringify({at:new Date().toISOString(),bun:Bun.version,verifyExisting,liveModelCalls:0,cases,frozen},null,2)+'\n');
console.log(JSON.stringify({liveModelCalls:0,cases:cases.map(row=>({id:row.id,analysis:row.analysisStatus,formal:row.formalStatus,items:row.itemCount,
  requests:row.requests.length,corrections:row.corrections,findings:row.findings.length}))}));

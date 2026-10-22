/** Recheck unchanged saved replies with model correction disabled. New evidence
 * stays in this batch; prior reports, reply files and packages remain untouched. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {hashSource,hashArtifact} from '@fvtt-json-generator/forge-gateway-protocol';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {decodeForgeEncounterPackageZip,serializeForgeEncounterPackage,encodeForgeEncounterPackageZip} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';

const out=resolve('.local/forge-offline-followup-20261022');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const protectedEvidence=read(resolve(out,'protected-before.json'));
const frozen=()=>{
  const changed=protectedEvidence.files.filter((file:any)=>digest(file.path)!==file.sha256);
  if(changed.length)throw Error('Protected evidence changed: '+changed.map((file:any)=>file.path).join(', '));
  return{status:'PASS',count:protectedEvidence.files.length,changed:[]};
};
if(existsSync(resolve(out,'frozen-formal.json')))throw Error('This batch already has a frozen formal receipt; do not overwrite it.');
frozen();
const cases:any[]=[];
for(const id of ['N3','N2'] as const){
  const capture=resolve('.local/forge-new-three-paired-20261022');
  const source=readFileSync(resolve(capture,id,'source.md'),'utf8');
  const meter=read(resolve(capture,'chrome',`meter-after-${id}.json`));
  // N2's first feature reply is used exactly as recorded. Its historical
  // correction is excluded, so another request cannot accidentally pass.
  const replies=meter.requests.filter((entry:any)=>entry.caseId===id).slice(0,2);
  const requests:any[]=[],responseEvidence:any[]=[];let cursor=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=Object.assign(async(_url:any,init?:RequestInit)=>{
    const saved=replies[cursor++];if(!saved?.replies?.[0]?.content)throw Error('Unexpected request; no live provider or correction is permitted.');
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.messages[1].content);
    if(payload.correction)throw Error('Model correction is disabled for this batch.');
    const content=saved.replies[0].content;
    requests.push({savedIndex:saved.index,responseHash:hashSource(content),correction:false});
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  },{preconnect:originalFetch.preconnect});
  try{
    const providers=createEncounterIntakeProviders({baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'saved-reply',protocol:'openai-chat',
      autoCorrect:false,timeoutMs:10000,responseEvidence:{record:e=>{responseEvidence.push({stage:e.stage,responseHash:e.responseHash,
        formatRecovery:e.formatRecovery??null,truncated:e.truncated,redacted:e.redacted});}}});
    const output=await generateEncounterFromHumanMarkdown({source,label:`${id} source-proof Cast verification`,...providers,reviewPolicy:'deferred',
      requestedOptions:{protocol:'openai-chat',reasoning:'auto',autoCorrect:false}});
    if(!output.prepared)throw Error(`${id}: no prepared result: ${JSON.stringify(output.report.findings)}`);
    const artifact=output.prepared.actors[0]!.artifact;
    const previousRoot=resolve('.local/forge-brass-cast-20261022');
    const previousActor=read(resolve(previousRoot,`${id}.actor.json`));
    const priorPackage=await prepareForgeEncounter(readFileSync(resolve(previousRoot,`${id}.forge-encounter.json`),'utf8'));
    const oldHash=hashArtifact(previousActor),currentHash=hashArtifact(artifact);
    if(oldHash!==currentHash||hashArtifact(priorPackage.actors[0]!.artifact)!==oldHash)throw Error(`${id}: formal Actor drifted from the previously verified artifact.`);
    if(cursor!==2||output.prepared.actors[0]!.status!=='accepted'||output.report.findings.length||(output.prepared.reviewFindings??[]).length)
      throw Error(`${id}: unexpected request count or strict findings: ${JSON.stringify(output.report.findings)}`);
    const recoveries=responseEvidence.filter(entry=>entry.formatRecovery);
    if(recoveries.length!==(id==='N2'?1:0))throw Error(`${id}: unexpected syntax recovery count.`);
    if(id==='N2'){
      const correction=readFileSync(resolve(capture,'frozen-model-calls','forge-N2-6-reply-0.txt'),'utf8').trim();
      if(recoveries[0].formatRecovery.parsedObjectHash!==hashSource(correction))throw Error('N2 local recovery does not equal the existing correction payload.');
    }
    const zip=await encodeForgeEncounterPackageZip(output.prepared.bundle);
    const restored=await prepareForgeEncounter(serializeForgeEncounterPackage(await decodeForgeEncounterPackageZip(zip)));
    if(restored.actors[0]!.artifactHash!==currentHash)throw Error(`${id}: export/reprepare changed the Actor.`);
    writeFileSync(resolve(out,`${id}.report.json`),JSON.stringify(output.report,null,2)+'\n');
    writeFileSync(resolve(out,`${id}.actor.json`),JSON.stringify(artifact,null,2)+'\n');
    writeFileSync(resolve(out,`${id}.forge-encounter.json`),serializeForgeEncounterPackage(output.prepared.bundle));
    writeFileSync(resolve(out,`${id}.forge-encounter.zip`),zip);
    cases.push({id,sourceHash:hashSource(source),actorHash:currentHash,priorActorHash:oldHash,formalStatus:output.prepared.actors[0]!.status,
      findings:output.report.findings,requests,modelCorrections:0,localFormatRecoveries:recoveries.length,responseEvidence,liveModelCalls:0});
  }finally{globalThis.fetch=originalFetch;}
}
const receipt={at:new Date().toISOString(),bun:Bun.version,liveModelCalls:0,defaultAutoCorrect:false,cases,protectedEvidence:frozen()};
writeFileSync(resolve(out,'frozen-formal.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({liveModelCalls:0,protectedCount:receipt.protectedEvidence.count,cases:cases.map(row=>({id:row.id,status:row.formalStatus,
  requests:row.requests.length,modelCorrections:row.modelCorrections,localFormatRecoveries:row.localFormatRecoveries,actorUnchanged:row.actorHash===row.priorActorHash}))}));

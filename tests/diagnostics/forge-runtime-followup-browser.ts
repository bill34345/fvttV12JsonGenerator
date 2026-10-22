/** Task-only normal-Application UI harness. Frozen provider ports only; never HTTP AI.
 * Uses the production IndexedDB store under an isolated QA scope. Formal generation,
 * UI events, candidate/review bindings and reload validation are real product code.
 */
import {createForgeEncounterApplicationClass} from '../../foundry-modules/fvtt-json-forge/src/encounterApplication';
import {IndexedDbEncounterRecoveryStore} from '../../foundry-modules/fvtt-json-forge/src/encounterRecoveryStore';
import {hashSource,hashArtifact} from '@fvtt-json-generator/forge-gateway-protocol';
import {encounterActorCandidate} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type {MonsterIntakeAiProvider,MonsterIntakeIR} from '@fvtt-json-generator/intake-ai';

const TASK='forge-runtime-followup-20261022-b87a1f';
const KEY='fvtt-json-forge.qa.'+TASK+'.provider';
const GLOBAL='__forgeRuntimeFollowup20261022';
type Mode='partial'|'single';
type Seed={source:string;sourceHash:string;ir:MonsterIntakeIR;artifactHash?:string};
type Seeds={N2:Seed;N3:Seed;Mage:Seed;review:{schemaVersion:1;verdict:'accepted';findings:[]}};
function target(){const e=globalThis as any;
  if(location.origin!=='http://127.0.0.1:30001'||e.game.world.id!=='cor-cotn'||e.game.version!=='14.368'
    ||e.game.system.version!=='5.3.3'||!e.game.user?.isGM)throw Error('Wrong local QA target.');return e;}
function state(){const value=JSON.parse(localStorage.getItem(KEY)??'null');
  if(!value||value.task!==TASK)throw Error('QA provider state missing; refusing automatic recapture.');return value;}
function save(value:any){localStorage.setItem(KEY,JSON.stringify(value));}
function scope(mode:Mode){const e=target();return `${e.game.world.id}:${e.game.user.id}:qa:${TASK}:${mode}`;}
async function seeds():Promise<Seeds>{const response=await fetch('modules/fvtt-json-forge/scripts/qa-runtime-seed-b87a1f.json');
  if(!response.ok)throw Error('Frozen seed unavailable.');const data=await response.json();
  for(const seed of [data.N2,data.N3,data.Mage])if(hashSource(seed.source)!==seed.sourceHash||seed.ir.source.sha256!==seed.sourceHash
    ||seed.ir.source.length!==seed.source.length)throw Error('Frozen seed identity mismatch.');return data;}
export async function openCase(mode:Mode){const e=target();
  if(e.foundry.applications.instances.has('fvtt-json-forge-encounter'))throw Error('Close the previous Forge window first.');
  const data=await seeds();let saved=localStorage.getItem(KEY);
  if(saved===null){save({task:TASK,calls:{discover:0,extract:[],review:[],repair:0,automation:0,liveModel:0},secondFailed:false});}
  else state();
  const units=mode==='partial'?[data.N2,data.N3]:[data.Mage];
  const source=units.map(seed=>seed.source).join('');
  const count=(kind:string,value?:any)=>{const s=state();if(Array.isArray(s.calls[kind]))s.calls[kind].push(value);else s.calls[kind]++;save(s);};
  const provider:MonsterIntakeAiProvider={providerName:'frozen-runtime-followup',extractionModel:'saved-ir-v1',reviewModel:'existing-accepted-test-fixture-v1',
    discover:async request=>{if(request.source!==source)throw Error('Unexpected QA discovery source.');count('discover');let offset=0;
      return{schemaVersion:1,candidates:units.map((unit,i)=>{const start=offset;offset+=unit.source.length;
        return{id:`frozen-${i+1}`,label:unit.ir.creature.identity.name,start,end:offset,quote:unit.source};})};},
    extract:async request=>{const unit=units.find(seed=>seed.source===request.source&&seed.sourceHash===request.sourceSha256);
      if(!unit)throw Error('Unexpected QA extraction source.');count('extract',{sourceHash:unit.sourceHash,irHash:hashSource(JSON.stringify(unit.ir))});
      if(mode==='partial'&&unit===data.N3){const s=state();if(!s.secondFailed){s.secondFailed=true;save(s);throw Error('Controlled QA interruption of the second frozen reply; no network request.');}}
      return structuredClone(unit.ir);},
    review:async request=>{count('review',{sourceHash:hashSource(request.source),replyHash:hashSource(JSON.stringify(data.review)),fixture:true});
      return structuredClone(data.review);},
    repair:async()=>{count('repair');throw Error('Correction disabled in runtime acceptance.');}};
  const automationProvider={generate:async()=>{count('automation');throw Error('No frozen controller reply supplied; retain complete Actor candidates.');},
    review:async()=>{throw Error('Actors-only QA must not request automation review.');}};
  const App=createForgeEncounterApplicationClass({game:e.game,foundry:e.foundry,ui:e.ui,window:e.window,
    getAiOptions:()=>({apiKey:'fixture-only',baseUrl:'https://frozen.invalid/v1',model:provider.extractionModel,
      reviewModel:provider.reviewModel,protocol:'openai-chat',autoCorrect:false}),
    getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),
    recoveryStore:new IndexedDbEncounterRecoveryStore(scope(mode)),
    createEncounterIntakeProviders:()=>({provider,automationProvider} as any)});
  const app=new App();e[GLOBAL]={app,mode,source,scope:scope(mode),boundary:'Frozen IR and existing accepted review fixture; real Application/formal/UI/IndexedDB, isolated QA scope, zero live AI.'};
  await app.render({force:true});
  // Inputs remain normal UI controls. This is a convenience source display, not a generation call.
  return{mode,source,sourceHash:hashSource(source),scope:scope(mode)};
}
export async function readback(){const e=target(),current=e[GLOBAL];
  if(!current)throw Error('No QA case in this page; open its same mode after reload.');
  const app=current.app,report=app.aiReport??app.recoveryReport;
  await app.pendingSave;
  const context=await app._prepareContext();
  const candidates=(report?.actors??[]).map((actor:any)=>{try{const candidate=encounterActorCandidate(report,actor.key);
    return{key:actor.key,sourceHash:hashSource(candidate.source),artifactHash:hashArtifact(candidate.artifact),artifact:candidate.artifact};}
    catch(error){return{key:actor.key,error:String(error)};}});
  return{task:TASK,at:new Date().toISOString(),mode:current.mode,scope:current.scope,boundary:current.boundary,
    provider:state(),status:app.status,error:app.error,report,prepared:app.prepared?{hash:app.prepared.hash,
      bundle:app.prepared.bundle,actors:app.prepared.actors}:null,candidates,
    textView:app.textView??null,context:{partialCandidates:context.partialCandidates,hasPackage:context.hasPackage,
      canImport:context.canImport,canReviewCandidate:context.canReviewCandidate,modelReviewState:context.modelReviewState,
      actorDeliveries:context.actorDeliveries,recoveryAvailable:context.recoveryAvailable}};
}
export async function showReadback(){const e=target();const result=await readback();
  new e.Dialog({title:'Forge Runtime QA Readback',content:`<textarea aria-label="QA JSON" style="width:100%;height:500px">${JSON.stringify(result,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;')}</textarea>`,
    buttons:{close:{label:'Close QA readback'}}},{width:1000,height:650}).render(true);return result;}
export async function showSource(mode:Mode){const e=target(),data=await seeds();const source=mode==='partial'?data.N2.source+data.N3.source:data.Mage.source;
  new e.Dialog({title:'Frozen QA source',content:`<textarea aria-label="Frozen source" style="width:100%;height:400px">${source.replaceAll('&','&amp;').replaceAll('<','&lt;')}</textarea>`,
    buttons:{close:{label:'Close source'}}},{width:850,height:530}).render(true);}
export async function disposeQa(){const e=target();if(e.foundry.applications.instances.has('fvtt-json-forge-encounter'))throw Error('Close Forge first.');
  // Exact owned scope cleanup; original GM recovery key is never touched by this harness.
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('fvtt-json-forge-encounter-recovery',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('checkpoints','readwrite'),store=tx.objectStore('checkpoints');
    for(const mode of ['partial','single'] as const)store.delete(scope(mode));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const before=state();localStorage.removeItem(KEY);return{task:TASK,removedScopes:[scope('partial'),scope('single')],provider:before,originalRecoveryUntouched:true};}

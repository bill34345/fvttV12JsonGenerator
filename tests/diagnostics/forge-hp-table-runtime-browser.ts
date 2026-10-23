/** Bounded native HP acceptance, invoked from the normal Foundry Macro UI.
 * Fixed source-owned IR only; actual validation, formal generation and Forge
 * create/readback. No connection settings, persistent queue or live models. */
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate,approveBrowserActorIntakeCandidateForGm} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {hashArtifact,hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {createAcceptedForgeActor} from '../../foundry-modules/fvtt-json-forge/src/runtime';
import type {MonsterIntakeIR,MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai';

const TASK='forge-hp-c3a81f',MACRO='Forge HP Table QA c3a81f';
let before:ReturnType<typeof protection>|undefined,created:any,proof:any;
function target():any{
  const e=globalThis as any;
  if(location.origin!=='http://127.0.0.1:30001'||e.game.world.id!=='cor-cotn'||e.game.version!=='14.368'||e.game.system.version!=='5.3.3'||!e.game.user?.isGM)throw Error('Wrong HP QA target.');
  return e;
}
const digest=(value:any)=>hashArtifact(JSON.parse(JSON.stringify(value)));
function protection(){
  const e=target();
  return {collections:Object.fromEntries(['actors','items','scenes','macros','journal','tables','playlists','cards','folders','combats','messages'].map(key=>[key,(e.game[key]?.contents??[]).filter((d:any)=>key!=='macros'||d.name!==MACRO).map((d:any)=>[d.id,digest(d.toObject())]).sort()])),
    view:{scene:e.canvas.scene?.id,position:e.canvas.scene?._viewPosition,time:e.game.time.worldTime,paused:e.game.paused,targets:[...e.game.user.targets].map((t:any)=>t.id).sort(),controlled:e.canvas.tokens.controlled.map((t:any)=>t.id).sort()}};
}
function show(value:unknown,title:string){const e=target(),text=JSON.stringify(value,null,2).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');new e.Dialog({title,content:`<textarea aria-label="HP QA JSON" style="width:100%;height:450px">${text}</textarea>`,buttons:{close:{label:'关闭'}}},{width:850,height:580}).render(true);}
export async function controls(){
  const e=target();
  if(!before){if(e.game.actors.contents.some((a:any)=>a.name==='HP Table Probe'))throw Error('QA Actor name collision.');before=protection();}
  new e.Dialog({title:'HP Table QA c3a81f',content:'<p>HTML实体表格 → 正式Intake生成 → Forge创建读回；最后核对并清理本任务Actor。</p>',buttons:{
    run:{label:'生成创建并读回HP',callback:async()=>{
      if(created)throw Error('Already created.');
      const r=await fetch('/modules/fvtt-json-forge/scripts/qa-hp-seed-c3a81f.json');if(!r.ok)throw Error('Missing source seed.');
      const seed:{source:string;sourceHash:string;ir:MonsterIntakeIR}=await r.json();
      if(hashSource(seed.source)!==seed.sourceHash||seed.ir.source.sha256!==seed.sourceHash)throw Error('Seed identity mismatch.');
      const provider:MonsterIntakeAiProvider={providerName:TASK,extractionModel:'fixed-ir',reviewModel:'disabled',discover:async()=>({schemaVersion:1,candidates:[{id:TASK,label:'HP Table Probe',start:0,end:seed.source.length,quote:seed.source}]}),extract:async()=>structuredClone(seed.ir),review:async()=>{throw Error('No review model.');},repair:async()=>{throw Error('No repair model.');}};
      const input={source:seed.source,sourceName:'HP Table Probe',displayName:'HP Table Probe',requestId:TASK,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
      const analysis=await analyzeBrowserActorSourceWithAi(input,provider),candidate=await generateBrowserActorIntakeCandidate(input,analysis,provider);
      const generation=approveBrowserActorIntakeCandidateForGm(input,candidate,e.game.user.id);
      if(!generation.response||!('result' in generation.response)||generation.response.result.status!=='accepted'||generation.findings.length)throw Error(`Not accepted: ${JSON.stringify(generation.findings)}`);
      const result=await createAcceptedForgeActor({game:e.game,response:generation.response,rawSourceHash:generation.rawSourceHash});
      if(result.status!=='created')throw Error('Refuse reuse of existing Actor.');created=result.actor;
      const dto=created.toObject(),hp=dto.system.attributes.hp;
      if(hp.value!==7||hp.max!==7||hp.formula!=='3d4')throw Error('Native HP differs.');
      proof={task:TASK,target:{core:e.game.version,system:e.game.system.version,world:e.game.world.id},sourceHash:seed.sourceHash,rawRow:seed.source.split('\n').find(line=>line.includes('&#x37;')),status:generation.response.result.status,findings:generation.findings,calls:generation.calls,liveModel:0,actor:{id:created.id,name:created.name,hp,forge:dto.flags['fvtt-json-forge']},dtoHash:digest(dto)};
      show(proof,'HP Table Native Readback');
    }},
    cleanup:{label:'最终读回后清理本任务Actor',callback:async()=>{
      if(!created||!proof||created.id!==proof.actor.id||digest(created.toObject())!==proof.dtoHash||created.flags['fvtt-json-forge'].sourceHash!==proof.actor.forge.sourceHash)throw Error('Missing matching final readback.');
      await created.delete();const after=protection();
      if(JSON.stringify(after)!==JSON.stringify(before))throw Error('World protection differs after QA cleanup.');
      show({...proof,cleanup:{actorAbsent:!e.game.actors.has(proof.actor.id),originalDocumentsAndViewUnchanged:true,protectionHash:digest(before)}},'HP Table Cleanup Verified');
    }},close:{label:'关闭'}
  }},{width:850}).render(true);
}

import {decodeEncounterRuntimeConfiguration} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {validateFixedEncounterEntry} from './encounterRuntime';
import {installEncounterAutomation} from './encounterAutomationRuntime';
import {assertExactRuntime,assertGm,MODULE_ID} from './runtime';

/** No timers or code execution from world flags: resume only exact compiled, enabled data. */
export function createEncounterAutomationLifecycle(env:any,install=installEncounterAutomation){
  const runtimes=new Map<string,any>(),pending=new Map<string,Promise<any>>(),hashes=new Map<string,string>();
  const key='fixedAutomation';
  async function start(context:any,input:unknown,options:{persist?:boolean;showPanel?:boolean}={}){
    assertGm(env.game);assertExactRuntime(env.game);
    const config=decodeEncounterRuntimeConfiguration(input);
    const macro:any=validateFixedEncounterEntry(env.game,context,config);
    const id=context.packageId;
    if(pending.has(id))return pending.get(id);
    const current=runtimes.get(id);
    if(current&&hashes.get(id)===context.packageHash){if(options.showPanel!==false)await current.showPanel();return current;}
    if(current)await current.stop();
    const promise=(async()=>{
      const runtime=await install(env,{packageId:id,packageHash:context.packageHash,bindings:context.actors,config});
      try{
        if(options.persist!==false)await macro.setFlag(MODULE_ID,key,{version:1,enabled:true,context,config});
        const originalStop=runtime.stop.bind(runtime);
        runtime.stop=async()=>{await originalStop();runtimes.delete(id);hashes.delete(id);};
        runtimes.set(id,runtime);
        hashes.set(id,context.packageHash);
        if(options.showPanel!==false)await runtime.showPanel();
        return runtime;
      }catch(error){await runtime.stop();runtimes.delete(id);throw error;}
    })();
    pending.set(id,promise);try{return await promise;}finally{pending.delete(id);}
  }
  async function stop(packageId:string){
    assertGm(env.game);assertExactRuntime(env.game);
    try{await pending.get(packageId);}catch{}
    const macro=Array.from(env.game.macros.contents??[]).find((m:any)=>m.flags?.[MODULE_ID]?.encounter?.packageId===packageId&&m.flags?.[MODULE_ID]?.encounter?.key==='battle-control') as any;
    if(macro)await macro.setFlag(MODULE_ID,`${key}.enabled`,false);
    await runtimes.get(packageId)?.stop();
  }
  async function resume(){
    if(!env.game?.user?.isGM||!env.canvas?.ready)return;
    for(const macro of env.game.macros.contents??[]){
      const saved=macro.flags?.[MODULE_ID]?.[key];
      if(saved?.version!==1||saved.enabled!==true)continue;
      try{await start(saved.context,saved.config,{persist:false,showPanel:false});}
      catch(error){env.ui?.notifications?.warn?.(`战斗自动化未恢复：${error instanceof Error?error.message:String(error)}`);}
    }
  }
  return {start,stop,resume,runtimes};
}

import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {fixedEncounterCommand} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {importForgeEncounter,validateFixedEncounterEntry} from '../src/encounterRuntime';
import {createEncounterAutomationLifecycle} from '../src/encounterAutomationLifecycle';
import {readLocalIntakeSettings} from '../src/settings';
import {encounterFixture} from '../../../tests/helpers/forge-encounter';

async function fixture(){
  const config={version:1 as const,rules:[],legendaryRecovery:[]};const bundle:any=encounterFixture();
  bundle.macros[0]!.key='battle-control';bundle.macros[0]!.command=fixedEncounterCommand(config);bundle.macros[0]!.commandHash=hashSource(bundle.macros[0]!.command);
  function collection(kind:string){const contents:any[]=[];return {contents,get:(id:string)=>contents.find(d=>d.id===id),documentClass:{async create(data:any){const doc:any={id:data._id,uuid:`${kind}.${data._id}`,flags:data.flags,toObject:()=>data,execute:async()=>{},delete:async()=>contents.splice(contents.indexOf(doc),1),async setFlag(scope:string,key:string,value:any){const parts=key.split('.');let target=data.flags[scope]??={};for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)!]=value;}};contents.push(doc);return doc;}}};}
  const game:any={version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},actors:collection('Actor'),macros:collection('Macro')};
  const prepared=await prepareForgeEncounter(JSON.stringify(bundle));await importForgeEncounter({game,prepared,reviewed:true,assets:{async ensure(){throw Error('unexpected upload');}}});
  const macro=game.macros.contents[0],identity=macro.flags['fvtt-json-forge'].encounter;
  const context={packageId:identity.packageId,packageHash:identity.packageHash,actors:identity.bindings,bindingKeys:identity.bindingKeys,covers:identity.covers};
  return {game,macro,config,context,env:{game,canvas:{ready:true},ui:{notifications:{warn(){}}}}};
}
describe('fixed automation activation and resume',()=>{
  test('imports inert, starts once, persists reviewed data and restores without executing stored macro code',async()=>{
    const f=await fixture();let starts=0,stops=0,panels=0;
    const install:any=async()=>{starts++;return {stop(){stops++;},showPanel(){panels++;},history:[]};};
    const lifecycle=createEncounterAutomationLifecycle(f.env,install);expect(f.macro.flags['fvtt-json-forge'].fixedAutomation).toBeUndefined();
    await Promise.all([lifecycle.start(f.context,f.config),lifecycle.start(f.context,f.config)]);expect(starts).toBe(1);expect(panels).toBe(1);
    expect(f.macro.flags['fvtt-json-forge'].fixedAutomation.enabled).toBe(true);
    await lifecycle.runtimes.get(f.context.packageId).stop();const reloaded=createEncounterAutomationLifecycle(f.env,install);
    f.macro.execute=()=>{throw Error('must not execute stored code on resume');};await reloaded.resume();expect(starts).toBe(2);expect(panels).toBe(1);
    await reloaded.stop(f.context.packageId);expect(stops).toBe(2);expect(f.macro.flags['fvtt-json-forge'].fixedAutomation.enabled).toBe(false);
    await reloaded.resume();expect(starts).toBe(2);
  });
  test('rejects tampered configuration, actor binding and command before activating',async()=>{
    const f=await fixture();expect(validateFixedEncounterEntry(f.game,f.context,f.config)).toBe(f.macro);
    expect(()=>validateFixedEncounterEntry(f.game,{...f.context,packageHash:'changed'},f.config)).toThrow();
    expect(()=>validateFixedEncounterEntry(f.game,f.context,{...f.config,code:'evil'})).toThrow();
    f.macro.toObject().command+='\nmalicious();';expect(()=>validateFixedEncounterEntry(f.game,f.context,f.config)).toThrow();
  });
  test('local DS defaults never forward another provider key and remote preferences remain unchanged',()=>{
    const settings={providerId:'openai',endpoint:'https://api.openai.com/v1',model:'other',apiKey:'foreign-key',persistApiKey:true};
    const storage:any={getItem:()=>JSON.stringify(settings)};
    const local=readLocalIntakeSettings('127.0.0.1',storage);expect(local).toMatchObject({providerId:'deepseek',model:'deepseek-flash',apiKey:'',persistApiKey:false});
    expect(readLocalIntakeSettings('example.org',storage)).toMatchObject({providerId:'openai',model:'other'});
  });
});

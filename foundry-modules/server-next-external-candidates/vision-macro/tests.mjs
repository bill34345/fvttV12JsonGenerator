import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {convertUnits,toFeet} from './sources/vision/scripts/utils.mjs';
const read=async path=>(await readFile(new URL(path,import.meta.url),'utf8')).replaceAll('\r\n','\n');
const strip=code=>code.replace(/^import .*;\n/gm,'');

const vision=await read('./sources/vision/scripts/actor.mjs');
const visionContext=vm.createContext({defaultHearingRange:60,convertUnits,toFeet,Matcher:class{match(){return undefined}},Hooks:{once:()=>{}},
 game:{release:{generation:14},system:{version:'6.0.2'}},foundry:{utils:{isNewerVersion:(a,b)=>a.localeCompare(b,undefined,{numeric:true})>0}},
 CONFIG:{specialStatusEffects:{MAGICAL:'magical',POISONOUS:'poisonous',THINKING:'thinking',OBJECT:'object',PETRIFIED:'petrified'}}});
vm.runInContext(strip(vision).replace('export default (Actor) =>','globalThis.ActorMixin = (Actor) =>')+'\nglobalThis.poison=isPoisonousAttack;',visionContext);
test('Vision recognizes poison in the actual dnd5e6 critical bonus schema',()=>{
 assert.equal(visionContext.poison({type:'attack',damage:{parts:[],critical:{bonus:'1d6[poison]'}}}),true);
 assert.equal(visionContext.poison({type:'attack',damage:{parts:[],critical:{bonus:'1d6[fire]'}}}),false);
});
test('Vision existing senses-ranges and effect reading already match dnd5e6',()=>{
 class Actor{constructor(){this.type='npc';this.statuses=new Set();this.items=[];this.appliedEffects=[{name:'Test',system:{magical:true},statuses:new Set(),flags:{}}];this.system={attributes:{senses:{units:'ft',ranges:{darkvision:60,blindsight:10,truesight:30,tremorsense:0}}},traits:{languages:{value:new Set(['common'])}}}}prepareDerivedData(){}}
 const actor=new (visionContext.ActorMixin(Actor))();actor.prepareDerivedData();
 assert.deepEqual(JSON.parse(JSON.stringify(actor.detectionModes)),{lightPerception:null,basicSight:60,seeAll:30,blindsight:10,hearing:60});
 assert.equal(actor.detectionModes.lightPerception,Infinity);assert.ok(actor.statuses.has('magical'));assert.ok(actor.statuses.has('thinking'));
});

const config=await read('./sources/macro/scripts/ItemMacroConfig.mjs');
class Macro{constructor(data){Object.assign(this,data)}toObject(){return {...this}}updateSource(data){Object.assign(this,data)}}
class Sheet{constructor({document}){this._doc=document}get document(){return this._doc}async submit(){}}
class ItemMacro extends Macro{}
const configContext=vm.createContext({ItemMacro,logger:{debug:()=>{}},game:{user:{id:'gm'}},foundry:{applications:{sheets:{MacroConfig:Sheet}}}});
vm.runInContext(strip(config).replace('export class ItemMacroConfig','globalThis.ItemMacroConfig = class ItemMacroConfig'),configContext);
test('Item Macro V14 sheet updates its actual synthetic document after save',async()=>{
 const document=new Macro({name:'Test',type:'script',command:'old'});let saved;
 const item={name:'Test',getMacro:()=>document,setMacro:async macro=>{saved=macro}};
 const sheet=new configContext.ItemMacroConfig({document,item});await sheet.updateMacro({command:'return 42;',type:'script'});
 assert.equal(saved.command,'return 42;');assert.equal(sheet.document.command,'return 42;');
});
test('Item Macro manual Execute passes a scoped event and awaits execution',async()=>{
 const event=new Event('click');let received,finished=false;
 const item={executeMacro:async scope=>{received=scope;await Promise.resolve();finished=true}};
 const sheet=new configContext.ItemMacroConfig({document:new Macro({}),item});
 await configContext.ItemMacroConfig._onExecute.call(sheet,event);
 assert.equal(received.event,event);assert.equal(finished,true);
});

const handler=await read('./sources/macro/scripts/systems/handlers/DND5e.mjs');
const handlerContext=vm.createContext({BaseSystem:class{},settings:{value:()=>true}});
vm.runInContext(strip(handler).replace('export class DND5e','globalThis.DND5e = class DND5e'),handlerContext);
test('existing activity hook synchronously cancels and resumes exactly once with preserved configs',async()=>{
 let captured,calls=0;const usage={},dialog={configure:false},message={create:false};
 const activity={item:{hasMacro:()=>true,executeMacro:async scope=>{captured=scope;return true}},use:(u,d,m)=>{calls++;assert.equal(u,usage);assert.equal(d,dialog);assert.equal(m,message)}};
 assert.equal(new handlerContext.DND5e().preUseActivity(activity,usage,dialog,message),false);
 await Promise.resolve();assert.equal(captured.activity,activity);assert.equal(calls,1);assert.equal(usage.skipItemMacro,true);
 assert.equal(new handlerContext.DND5e().preUseActivity(activity,usage,dialog,message),true);assert.equal(calls,1);
});

const runtime=await read('./sources/macro/scripts/ItemMacro.mjs');
const runtimeContext=vm.createContext({Macro:class{constructor(data){Object.assign(this,data);this.canExecute=true}},Event,
 logger:{debug:()=>{},error:e=>{throw e}},settings:{i18n:x=>x},SystemManager:{instance:{systemMigration:()=>{},systemValidation:()=>true}},
 game:{actors:new Map(),user:{character:{id:'character'}}},canvas:{tokens:new Map([['token',{id:'token'}]])},
 ChatMessage:{getSpeaker:()=>({actor:'actor',token:'token'})},ui:{notifications:{error:()=>{},warn:()=>{}}},event:new Event('unrelated-global')});
vm.runInContext(strip(runtime).replace('export default class ItemMacro','globalThis.ItemMacro = class ItemMacro'),runtimeContext);
test('actual Item Macro execution preserves explicit event, activity and positional arguments without global event',async()=>{
 const item={actor:{id:'actor'}},event=new Event('click');
 const macro=new runtimeContext.ItemMacro({name:'Test',type:'script',command:'return {eventType:event?.type,activityId:args.activity?.id,value:args[0],actorId:actor.id};'},{item});
 const result=await macro.execute({event,activity:{id:'activity'}},42);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{eventType:'click',activityId:'activity',value:42,actorId:'actor'});
 const withoutEvent=await macro.execute({activity:{id:'activity'}},7);assert.equal(withoutEvent.eventType,undefined);
});

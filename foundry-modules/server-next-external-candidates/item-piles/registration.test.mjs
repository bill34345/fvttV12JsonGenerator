import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as utils from 'file:///F:/FoundryLab/foundry-v14/app/14.368/common/utils/helpers.mjs';
const read=async path=>(await readFile(new URL(path,import.meta.url),'utf8')).replaceAll('\r\n','\n');
test('real registration path selects dnd5e6 before synchronous ready consumers cache it',async()=>{
 const game={system:{id:'dnd5e',version:'6.0.2'},settings:{get:()=> '1.0.6'}};
 const foundry={utils};
 const systemSource=await read('./sources/base/src/systems.js');
 const SYSTEMS=new Function('game','foundry',systemSource.replace('export const SYSTEMS =','return '))(game,foundry);
 const constantsSource=await read('./sources/base/src/constants/constants.js');
 const CONSTANTS=new Function(constantsSource.replace('export default CONSTANTS;','return CONSTANTS;'))();
 const apiSource=await read('./sources/base/src/API/api.js');
 const start=apiSource.indexOf('static addSystemIntegration('),end=apiSource.indexOf('\n\t}',start)+3;
 const add=new Function('game','foundry','Helpers','SYSTEMS','CONSTANTS',apiSource.slice(start,end).replace('static addSystemIntegration','function addSystemIntegration')+'\nreturn addSystemIntegration;')(
  game,foundry,{isFunction:fn=>typeof fn==='function',custom_error:msg=>new Error(msg),debug:()=>{}},SYSTEMS,CONSTANTS);
 const calls=[];game.itempiles={CONSTANTS,API:{addSystemIntegration:(data,version)=>{calls.push(version);return add(data,version)}}};
 let ready;
 const path=process.env.ITEMPILES_REGISTRATION_SOURCE??'./dist-local2/itempilesdnd5e/dist/module.js';
 const script=await read(path);
 new Function('Hooks','game','foundry','CONFIG','Item',script)({once:(name,fn)=>{assert.equal(name,'item-piles-ready');ready=fn}},game,foundry,{DND5E:{attunementTypes:{required:'Required',optional:'Optional'}}},class{});
 // Foundry Hooks.callAll does not await listeners. Base module immediately calls
 // registerSystemLibwrappers(), which reads SYSTEMS.DATA and fills its cache.
 const pending=ready();const selectedSynchronously=SYSTEMS.DATA;
 await pending;
 assert.equal(selectedSynchronously.VERSION,'1.0.10');
 assert.equal(SYSTEMS.DATA.VERSION,'1.0.10');
 assert.deepEqual(calls,['6.0.2']);
 const transformed=await SYSTEMS.DATA.ITEM_TRANSFORMER({type:'weapon',system:{attunement:'required',attuned:true}});
 assert.equal(transformed.system.attunement,'required');assert.equal(transformed.system.attuned,false);
 assert.deepEqual(SYSTEMS.DATA.SOFT_MIGRATIONS['1.0.6-1.0.10'],{});
 const settingsSource=await read('./sources/base/src/settings.js');
 const extract=name=>{const start=settingsSource.indexOf(`export async function ${name}(`),end=settingsSource.indexOf('\n}',start)+2;return settingsSource.slice(start,end).replace('export async function','async function')};
 const values=new Map([['systemVersion','1.0.6'],['systemFound',false],['currencies',[{custom:'preserve'}]]]);const writes=[];
 const check=new Function('SYSTEMS','SETTINGS','Helpers','game','foundry',extract('applySoftMigration')+'\n'+extract('checkSystem')+'\nconst applyDefaultSettings=()=>{throw Error("Unexpected bulk reset")};return checkSystem;')(
  SYSTEMS,{SYSTEM_VERSION:'systemVersion',SYSTEM_FOUND:'systemFound'},
  {getSetting:key=>values.get(key),setSetting:async(key,value)=>{values.set(key,value);writes.push([key,value])},debug:()=>{}},game,foundry);
 await check();assert.deepEqual(writes,[['systemVersion','1.0.10']]);assert.deepEqual(values.get('currencies'),[{custom:'preserve'}]);
});

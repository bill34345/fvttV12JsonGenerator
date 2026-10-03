import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile(new URL('./acceptance-macro.js',import.meta.url),'utf8');

function harness(port='30002'){
 const dialogs=[];let writes=0;
 const state={dispatchId:'NEXT-PILES-20260929-02',phase:'prepared',operations:{blade:{status:'started'}},baseline:{source:{items:[]}}};
 const game={world:{id:'cor-cotn'},version:'14.368',system:{version:'6.0.2'},user:{isGM:true},actors:new Map(),folders:new Map(),
  modules:new Map([['item-piles',{version:'3.3.4+servernext.1'}],['itempilesdnd5e',{version:'1.1.0+servernext.1'}]]),
  itempiles:{API:{transferItems:()=>{writes++}}}};
 const context=vm.createContext({game,location:{hostname:'127.0.0.1',port},
 foundry:{utils:{deepClone:structuredClone},applications:{api:{DialogV2:class{constructor(options){dialogs.push(options)}render(){}}}}},
 document:{createElement:()=>({textContent:'',get outerHTML(){return this.textContent}})}});
 const macro={getFlag:()=>state,setFlag:()=>{writes++}};
 const run=()=>vm.runInContext(`(async function(){${code}\nglobalThis.testOperation=operation;})`,context).call(macro);
 return {run,dialogs,context,writes:()=>writes};
}
test('prepared tool rejects wrong instance before writes',async()=>{const h=harness('30001');await assert.rejects(h.run(),/Exact ServerNext/);assert.equal(h.writes(),0)});
test('uncertain started operation is read back, never replayed after reload',async()=>{const h=harness();await h.run();await assert.rejects(h.context.testOperation('blade',()=>{throw Error('must not run')}),/already started/);assert.equal(h.writes(),0)});

const getProperty=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
const setProperty=(obj,path,value)=>{const keys=path.split('.'),leaf=keys.pop();let t=obj;for(const k of keys)t=t[k]??={};t[leaf]=value};
function extract(name){const start=code.indexOf(`function ${name}(`),end=code.indexOf('\n}',start)+2;assert.ok(start>=0&&end>start);return code.slice(start,end)}
function comparison(actual){
 const original={_id:'old',_stats:{createdTime:1,modifiedTime:1,lastModifiedBy:'gm'},name:'Fixture-Loose',system:{quantity:5},effects:[{_id:'effect',disabled:true}],ownership:{default:0},flags:{world:{keep:'unchanged'}}};
 const ctx=vm.createContext({state:{baseline:{source:{items:[original]}}},prefix:'Fixture',ids:{target:'target'},copy:structuredClone,
 getActor:()=>({items:[{name:'Fixture-Loose',toObject:()=>structuredClone(actual)}]}),foundry:{utils:{getProperty,setProperty}}});
 vm.runInContext(extract('differences')+'\n'+extract('verifyTransferred')+'\nglobalThis.verify=verifyTransferred',ctx);
 return ctx.verify('Loose',1);
}
test('only exact empty item-piles metadata addition is accepted; flags/effects/permissions stay strict',()=>{
 const actual={_id:'new',_stats:{createdTime:2,modifiedTime:2,lastModifiedBy:'gm'},name:'Fixture-Loose',system:{quantity:1},effects:[{_id:'effect',disabled:true}],ownership:{default:0},flags:{world:{keep:'unchanged'},'item-piles':{item:{}}}};
 assert.equal(comparison(actual).pass,true);
 for(const mutate of [d=>d.flags['item-piles'].item.surprise=true,d=>d.flags.world.keep='changed',d=>d.effects=[],d=>d.ownership.default=3]){
  const changed=structuredClone(actual);mutate(changed);assert.equal(comparison(changed).pass,false);
 }
});
test('guarded recovery requires exact failure, unchanged source and absent target; preserves completed currency',async()=>{
 const original={_id:'blade',name:'Blade',system:{quantity:1},flags:{world:{keep:true}}};
 const state={baseline:{source:{items:[original]}},operations:{blade:{status:'failed',error:"TypeError: Cannot use 'in' operator to search for 'flags.item-piles.item' in blade"},currency:{status:'completed'}}};
 let current=structuredClone(original),targetItems=[],calls=[];
 const source={items:{get:()=>current?{toObject:()=>current}:undefined}};
 const target={items:{some:predicate=>targetItems.some(predicate)}};
 const ctx=vm.createContext({state,ids:{source:'s',target:'t'},dispatchId:'batch',getActor:id=>id==='s'?source:target,
 operation:async(name,fn)=>{calls.push(name);return fn()},api:{transferItems:async(s,t,items)=>{assert.equal(s,source);assert.equal(t,target);calls.push(JSON.parse(JSON.stringify(items)))}}});
 vm.runInContext(extract('differences')+'\nasync '+extract('retryUnwritten')+'\nglobalThis.retry=retryUnwritten',ctx);
 await ctx.retry('blade',['blade']);assert.deepEqual(calls,['blade-object-v2',[{_id:'blade',quantity:1}]]);
 assert.equal(state.operations.currency.status,'completed');assert.equal(state.operations.blade.status,'failed');
 calls=[];current.system.quantity=0;await assert.rejects(ctx.retry('blade',['blade']),/source blade changed/);assert.equal(calls.length,0);
 current=structuredClone(original);targetItems=[{id:'other',name:'Blade'}];await assert.rejects(ctx.retry('blade',['blade']),/target already contains/);assert.equal(calls.length,0);
 targetItems=[];state.operations.blade.status='started';await assert.rejects(ctx.retry('blade',['blade']),/recorded pre-socket/);assert.equal(calls.length,0);
});

test('actual Item Piles API mapper rejects string IDs before socket but accepts object payload on Foundry14',async()=>{
 const apiSource=(await readFile(new URL('./sources/base/src/API/api.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 const start=apiSource.indexOf('static transferItems('),end=apiSource.indexOf('\n\t}',start)+3;
 const method=apiSource.slice(start,end).replace('static transferItems','function transferItems');
 const helpers=(await readFile('F:/FoundryLab/foundry-v14/app/14.368/common/utils/helpers.mjs','utf8')).replaceAll('\r\n','\n');
 const hs=helpers.indexOf('export function getProperty('),he=helpers.indexOf('\n}',hs)+2;
 let socketCalls=0;
 const item={id:'blade',toObject:()=>({_id:'blade',system:{quantity:1}})},actor={uuid:'Actor.fixture'};
 const ctx=vm.createContext({Utilities:{getActor:()=>actor,getUuid:a=>a.uuid,getItemQuantity:()=>1},
  PileUtilities:{getActorItems:()=>[item],isItemPileVault:()=>false},Helpers:{custom_error:m=>new Error(m)},game:{user:{id:'gm'}},
  CONSTANTS:{FLAGS:{ITEM:'flags.item-piles.item'}},Item:class{},ItemPileSocket:{HANDLERS:{TRANSFER_ITEMS:'transfer'},executeAsGM:()=>{socketCalls++}}});
 vm.runInContext(helpers.slice(hs,he).replace('export function','function')+'\nconst foundry={utils:{getProperty}};\n'+method+'\nglobalThis.transfer=transferItems;',ctx);
 assert.throws(()=>ctx.transfer('s','t',['blade']),/in.*flags.item-piles.item/);assert.equal(socketCalls,0);
 ctx.transfer('s','t',[{_id:'blade',quantity:1}]);assert.equal(socketCalls,1);
});

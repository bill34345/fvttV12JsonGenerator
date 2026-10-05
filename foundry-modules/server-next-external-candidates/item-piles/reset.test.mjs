import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const code=await readFile(new URL('./acceptance-macro.js',import.meta.url),'utf8');
const evidence='F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929/';
const unwrap=r=>r.receipt??r;
const before=unwrap(JSON.parse(await readFile(evidence+'prepare-readback.json','utf8')));
const partial=unwrap(JSON.parse(await readFile(evidence+'bag-container-v2-readback.json','utf8')));
class Collection extends Map{map(fn){return [...this.values()].map(fn)}some(fn){return [...this.values()].some(fn)}find(fn){return [...this.values()].find(fn)}}
function getProperty(v,p){return p.split('.').reduce((a,k)=>a?.[k],v)}
function setProperty(v,p,value){const keys=p.split('.'),last=keys.pop();let target=v;for(const k of keys)target=target[k]??={};target[last]=value}
function block(name,next){return code.slice(code.indexOf(`async function ${name}(`),code.indexOf(`\nasync function ${next}(`))}
function harness({drift=false,partialCreate=false}={}){
 const actors=new Map(),deleted=[],created=[];
 const ids={source:'NXPiles2901SrcAA',target:'NXPiles2901DstAA',blade:'NXPiles2901Blade',bag:'NXPiles2901BagAA',pouch:'NXPiles2901Pouch',rope:'NXPiles2901RopeA',gem:'NXPiles2901GemAA'};
 function document(data){return {id:data._id,name:data.name,getFlag:(ns,key)=>data.flags?.[ns]?.[key],toObject:()=>structuredClone(data)}}
 for(const source of partial.actors){
  const actor={id:source.id,system:{currency:structuredClone(source.wallet)},items:new Collection(source.items.map(i=>[i._id,document(structuredClone(i))]))};
  actor.deleteEmbeddedDocuments=async(type,ids)=>{for(const id of ids){deleted.push(id);actor.items.delete(id)}};
  actor.createEmbeddedDocuments=async(type,docs)=>{for(const doc of docs){if(partialCreate&&created.length===2)throw Error('Simulated partial restore');const data=structuredClone(doc);data._stats.modifiedTime=999;created.push(data._id);actor.items.set(data._id,document(data))}};
  actors.set(actor.id,actor);
 }
 if(drift){const old=actors.get(ids.source).items.get(ids.gem).toObject();old.flags.world.semanticSentinel='unexpected';actors.get(ids.source).items.set(ids.gem,document(old))}
 const baselineSource=before.actors.find(a=>a.id===ids.source);
 const state={phase:'prepared',operations:structuredClone(partial.operations),baseline:{source:structuredClone(baselineSource)}};
 const ctx=vm.createContext({ids,state,crypto:webcrypto,TextEncoder,copy:structuredClone,
  owned:d=>d?.getFlag('world','nextPilesDispatch')==='NEXT-PILES-20260929-02',getActor:id=>actors.get(id),wallet:a=>structuredClone(a.system.currency),
  save:async()=>{},readback:async()=>state,validateAdapter:async()=>({pass:true}),foundry:{utils:{getProperty,setProperty}}});
 const difference=code.slice(code.indexOf('function differences('),code.indexOf('\nfunction verifyTransferred('));
 const helperLines=code.split('\n').filter(l=>l.startsWith('const partialV2=')||l.startsWith('function canonical(')||l.startsWith('async function dataHash(')).join('\n');
 vm.runInContext(helperLines+'\n'+difference+'\n'+block('operation','retryUnwritten')+'\n'+block('assertPartialState','snapshotV3')+'\n'+block('resetOwnedItems','transferReset')+'\nglobalThis.reset=resetOwnedItems;',ctx);
 return {ctx,state,actors,ids,deleted,created};
}
test('exact real partial receipt resets only four owned items, keeping actors, Loose and wallets',async()=>{
 const h=harness();const source=h.actors.get(h.ids.source),target=h.actors.get(h.ids.target);
 await h.ctx.reset();assert.equal(h.state.operations['reset-v3'].status,'completed');assert.equal(h.deleted.length,4);assert.equal(h.created.length,4);
 assert.equal(h.actors.get(h.ids.source),source);assert.equal(h.actors.get(h.ids.target),target);assert.equal(source.items.size,6);assert.equal(target.items.size,1);
 assert.equal(source.items.get('NXPiles2901LootA').toObject().system.quantity,4);assert.equal(target.items.get('Os5CcPjSUxIea1Sl').toObject().system.quantity,1);
 assert.deepEqual(source.system.currency,{pp:0,gp:7,ep:0,sp:3,cp:0});assert.deepEqual(target.system.currency,{pp:0,gp:4,ep:0,sp:2,cp:0});
 assert.equal(source.items.get(h.ids.gem).toObject().system.container,h.ids.pouch);
 await assert.rejects(h.ctx.reset(),/already started/);assert.equal(h.deleted.length,4);
});
test('drift prevents deletion; partial restore records failed stage and cannot be blindly repeated',async()=>{
 const drift=harness({drift:true});await assert.rejects(drift.ctx.reset(),/Partial-state document changed/);assert.equal(drift.deleted.length,0);
 const partial=harness({partialCreate:true});await assert.rejects(partial.ctx.reset(),/Simulated partial restore/);assert.equal(partial.state.resetStage,'target-removed');assert.equal(partial.state.operations['reset-v3'].status,'failed');
 await assert.rejects(partial.ctx.reset(),/already started/);assert.equal(partial.created.length,2);
});

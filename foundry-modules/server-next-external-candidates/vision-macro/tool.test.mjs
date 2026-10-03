import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('./acceptance-macro.js',import.meta.url),'utf8');
const ids=vm.runInNewContext('('+code.match(/const ids=(\{[^;]+\});/)[1]+')');
test('all explicit fixture document IDs have valid Foundry length',()=>{for(const value of Object.values(ids))assert.match(value,/^[A-Za-z0-9]{16}$/)});
test('prepared token embedding preserves the explicit owned ID even if prototype carries another ID',async()=>{
 const line=code.split('\n').find(l=>l.startsWith('async function embedded('));
 const created=[];const collection=new Map();const parent={getEmbeddedCollection:()=>collection,createEmbeddedDocuments:async(type,docs)=>{created.push(...docs);for(const doc of docs)collection.set(doc._id,doc)}};
 const ctx=vm.createContext({flags:{world:{nextVMDispatch:'test'}},copy:structuredClone,owned:()=>true});
 vm.runInContext(line+'\nglobalThis.run=embedded;',ctx);
 await ctx.run(parent,'Token','NXVM2901ObsToken',{_id:null,x:200,y:500});
 assert.equal(created[0]._id,'NXVM2901ObsToken');await ctx.run(parent,'Token','NXVM2901ObsToken',{_id:'different'});assert.equal(created.length,1);
});
test('activity acceptance waits for the correct resumed native activity rather than cancelled initial use',async()=>{
 const start=code.indexOf('async function activityAPI()'),end=code.indexOf('\nasync function cleanup()',start);
 let listener,removed=false,records=[];
 const item={getFlag:()=>records,system:{activities:new Map()}};
 const activity={id:ids.activity,item:{id:ids.item,actor:{id:ids.observer}},use:async(u,d,m)=>{
  assert.equal(u.consume,false);assert.equal(d.configure,false);assert.equal(m.create,false);
  queueMicrotask(()=>{listener({id:'foreign',item:{id:'other',actor:{id:ids.observer}}});records.push({activityId:ids.activity,marker:'activity-api'});listener(activity)});
 }};item.system.activities.set(ids.activity,activity);
 const ctx=vm.createContext({ids,testItem:()=>item,operation:async(name,fn)=>fn(),setTimeout,clearTimeout,Promise,
 Hooks:{on:(name,fn)=>{listener=fn;return 1},off:(name,id)=>{assert.equal(id,1);removed=true}}});
 vm.runInContext(code.slice(start,end)+'\nglobalThis.run=activityAPI;',ctx);
 const result=await ctx.run();assert.equal(result.pass,true);assert.equal(result.added,1);assert.equal(removed,true);
});

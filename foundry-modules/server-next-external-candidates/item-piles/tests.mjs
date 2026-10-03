import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const relative=process.env.ITEMPILES_SOURCE==='official'?'./upstream/item-piles-dnd5e/package/dist/module.js':'./dist-local2/itempilesdnd5e/dist/module.js';
const script=await readFile(new URL(relative,import.meta.url),'utf8');
const getProperty=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
const setProperty=(obj,path,value)=>{const keys=path.split('.');const leaf=keys.pop();let target=obj;for(const key of keys)target=target[key]??={};target[leaf]=value;};
const registrations=new Map();let hook;
const methods={IS_CONTAINED:'isContained',IS_CONTAINED_PATH:'isContainedPath',HAS_CURRENCY:'hasCurrency',CONTENTS:'contents',TRANSFER:'transfer'};
class Item {static implementation={createScrollFromSpell:async()=>{throw new Error('not in this fixture')}}}
const context=vm.createContext({Hooks:{once:(name,fn)=>{assert.equal(name,'item-piles-ready');hook=fn}},
  game:{system:{version:'6.0.2'},settings:{get:()=> '1.0.6'},itempiles:{CONSTANTS:{ITEM_TYPE_METHODS:methods},API:{addSystemIntegration:async(data,version)=>registrations.set(version,data)}}},
  foundry:{utils:{getProperty,setProperty,isNewerVersion:(a,b)=>a.localeCompare(b,undefined,{numeric:true})>0}},
  CONFIG:{DND5E:{attunementTypes:{required:'DND5E.AttunementRequired',optional:'DND5E.AttunementOptional'}}},Item});
vm.runInContext(script,context);await hook();
const config=registrations.get('6.0.2')??registrations.get('5.0.0');

test('target adapter preserves string attunement and resets holder state without losing item payload',async()=>{
  const data={name:'Attuned test blade',type:'weapon',system:{attunement:'required',attuned:true,equipped:true,proficient:1,prepared:true,quantity:2,price:{value:12,denomination:'gp'},activities:{attack:{type:'attack'}},rarities:['uncommon']},effects:[{_id:'keepEffect000001'}],flags:{world:{keep:'exact'}}};
  const expected=structuredClone(data);delete expected.system.equipped;delete expected.system.proficient;delete expected.system.prepared;expected.system.attuned=false;
  const actual=await config.ITEM_TRANSFORMER(structuredClone(data));
  assert.equal(actual.system.attunement,'required');assert.equal(actual.system.attuned,false);
  assert.deepEqual(actual,expected);
});

test('container transfer mutates caller list and retains direct/nested contents exactly once',()=>{
  function item(id,type,container){return {id,type,system:{container},toObject(){return {_id:id,type,system:{container}}}}}
  const bag=item('bag','container',null),pouch=item('pouch','container','bag'),gem=item('gem','loot','pouch'),rope=item('rope','loot','bag'),outside=item('outside','loot',null);
  const all=[bag,pouch,gem,rope,outside];all.forEach(i=>i.parent={items:all});
  const result=[bag.toObject()];config.ITEM_TYPE_HANDLERS.container.transfer({item:bag,items:result});
  assert.deepEqual(result.map(i=>i._id).sort(),['bag','gem','pouch','rope']);
  config.ITEM_TYPE_HANDLERS.container.transfer({item:bag,items:result});
  assert.equal(result.length,4);
  assert.equal(result.find(i=>i._id==='gem').system.container,'pouch');
  const raw=[];config.ITEM_TYPE_HANDLERS.container.transfer({item:bag,items:raw,raw:true});
  assert.equal(raw.find(i=>i.id==='gem'),gem);
});

test('currency and price adapter match unchanged dnd5e6 scalar field paths',()=>{
  assert.equal(config.ITEM_QUANTITY_ATTRIBUTE,'system.quantity');
  assert.equal(config.ITEM_PRICE_ATTRIBUTE,'system.price.value');
  const currencies=config.CURRENCIES;
  assert.deepEqual(Array.from(currencies,c=>[c.data.path,c.exchangeRate]),[['system.currency.pp',10],['system.currency.gp',1],['system.currency.ep',0.5],['system.currency.sp',0.1],['system.currency.cp',0.01]]);
  assert.equal(config.ITEM_COST_TRANSFORMER({system:{price:{value:25,denomination:'sp'}}},currencies),2.5);
});

test('base remapping preserves nested container references while generating new IDs',async()=>{
  const source=(await readFile(new URL('./dist-local1/item-piles/dist/item-piles.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('function ensureValidIds(');
  const end=source.indexOf('\n}\n',start)+3;
  assert.ok(start>=0&&end>start);
  let serial=0;
  const ctx=vm.createContext({game:{system:{id:'dnd5e',version:'6.0.2'}},
    CONSTANTS:{ITEM_TYPE_METHODS:{CONTENTS:'contents',IS_CONTAINED:'isContained',IS_CONTAINED_PATH:'isContainedPath',CONTAINER_TRANSFORMER:'containerTransformer'}},
    foundry:{utils:{getProperty,setProperty}},
    hasItemTypeHandler:(method,type)=>!!config.ITEM_TYPE_HANDLERS[type]?.[method],
    getItemTypeHandler:(method,type='GLOBAL')=>config.ITEM_TYPE_HANDLERS[type]?.[method],
    createUniqueId:()=>`new-${++serial}`,
    Helpers:{custom_error:message=>new Error(message)}});
  vm.runInContext(source.slice(start,end).replace('export function','function')+'\nglobalThis.remap=ensureValidIds;',ctx);
  const input=[{_id:'bag',type:'container',system:{container:null}},{_id:'pouch',type:'container',system:{container:'bag'}},{_id:'gem',type:'loot',system:{container:'pouch'}}];
  const output=ctx.remap({items:new Map()},input);
  assert.equal(output.length,3);
  const [bag,pouch,gem]=output;
  assert.equal(pouch.system.container,bag._id);
  assert.equal(gem.system.container,pouch._id);
});

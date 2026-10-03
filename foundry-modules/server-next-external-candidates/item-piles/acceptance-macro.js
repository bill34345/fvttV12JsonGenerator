const dispatchId="NEXT-PILES-20260929-02",macro=this,key="nextPilesBatch",owner="nextPilesDispatch";
// Tool revision 3: exact partial-state guard, selected-adapter probe and owned-item reset.
const ids={folder:"NXPiles2901FldAA",source:"NXPiles2901SrcAA",target:"NXPiles2901DstAA",loose:"NXPiles2901LootA",blade:"NXPiles2901Blade",bag:"NXPiles2901BagAA",pouch:"NXPiles2901Pouch",rope:"NXPiles2901RopeA",gem:"NXPiles2901GemAA"};
const prefix="CodexTemp-NEXT-PILES-2901";
if(location.hostname!=="127.0.0.1"||location.port!=="30002"||game.world.id!=="cor-cotn"||game.version!=="14.368"||game.system.version!=="6.0.2"||!game.user.isGM)throw Error("Exact ServerNext GM gate failed");
if(game.modules.get("item-piles")?.version!=="3.3.4+servernext.1"||!["1.1.0+servernext.1","1.1.0+servernext.2"].includes(game.modules.get("itempilesdnd5e")?.version)||!game.itempiles?.API)throw Error("Candidate not loaded");
const partialV2={actors:{NXPiles2901SrcAA:{wallet:{pp:0,gp:7,ep:0,sp:3,cp:0},items:{NXPiles2901LootA:"fd65e2af79114ce696ba36b254048905570bb7503bfb8e09060daa4aa0959c8c",NXPiles2901GemAA:"caa97de62a31006735c6476470de34b9dc845e03c06540c90f6c3278b0a374c0"}},NXPiles2901DstAA:{wallet:{pp:0,gp:4,ep:0,sp:2,cp:0},items:{Os5CcPjSUxIea1Sl:"ad19939445bc6b2b31cbcec3243243a4d238eaed9a61a3bcff6775d12d0c97d0",qOnTuRMoS9KgcDiE:"19217baee1f16d7b94889cc2b7545fe7f561c8b99beb5d442385b23a3d6630a5",C4tS9mNQfBnD4sKm:"e6ed648f65badc874c6abf2bac6ce152788ec7f4a2b85136ad26454c182956ba",HYc9eHYJgXMBcV0T:"80b2e2e1b84450d15017b9bded2651ed7138f747f874778c76fb9ff24bb99303",Mha2sBvWES6JRGu9:"aae26f9cb2ea37fe5a96ebfc5b30887e7d957cdc9f0cfcbd6c9eda9d650590e9"}}}};
const api=game.itempiles.API,copy=v=>foundry.utils.deepClone(v),flags={world:{[owner]:dispatchId}};
let state=copy(macro.getFlag("world",key));if(state&&state.dispatchId!==dispatchId)throw Error("Foreign ledger");
const save=()=>macro.setFlag("world",key,copy(state)),owned=d=>d?.getFlag("world",owner)===dispatchId;
const getActor=id=>{const a=game.actors.get(id);if(!owned(a))throw Error(`Missing/foreign actor ${id}`);return a};
const wallet=a=>Object.fromEntries(["pp","gp","ep","sp","cp"].map(k=>[k,a.system.currency[k]]));
const copper=c=>c.pp*1000+c.gp*100+c.ep*50+c.sp*10+c.cp;
async function ensure(collection,cls,id,data){let d=collection.get(id);if(d){if(!owned(d))throw Error(`Foreign ID ${id}`);return d}d=await cls.create({_id:id,...data,flags:copy(flags)},{keepId:true});if(d?.id!==id||!owned(collection.get(id)))throw Error(`Readback failed ${id}`);return d}
function itemData(id,label,type,system){return {_id:id,name:`${prefix}-${label}`,type,img:"icons/svg/item-bag.svg",system,flags:{world:{[owner]:dispatchId,semanticSentinel:`keep-${label}`}}}}
async function prepare(){
 if(!state){state={dispatchId,phase:"preparing",operations:{},baseline:null};await save()}
 if(state.phase==="cleaned")throw Error("Already cleaned; no recreation");
 if(state.baseline)return readback();
 await ensure(game.folders,Folder,ids.folder,{name:prefix,type:"Actor"});
 const source=await ensure(game.actors,Actor,ids.source,{name:`${prefix}-Source`,type:"character",folder:ids.folder,system:{currency:{pp:0,gp:10,ep:0,sp:5,cp:0}}});
 const target=await ensure(game.actors,Actor,ids.target,{name:`${prefix}-Receiver`,type:"character",folder:ids.folder,system:{currency:{pp:0,gp:1,ep:0,sp:0,cp:0}}});
 const definitions=[
  itemData(ids.loose,"Loose","loot",{quantity:5,price:{value:2,denomination:"sp"},weight:{value:1,units:"lb"}}),
  itemData(ids.blade,"Blade","weapon",{quantity:1,type:{value:"simpleM"},attunement:"required",attuned:true,equipped:true,rarities:["uncommon"],price:{value:12,denomination:"gp"}}),
  itemData(ids.bag,"Bag","container",{quantity:1,currency:{pp:0,gp:2,ep:0,sp:0,cp:0}}),
  itemData(ids.pouch,"Pouch","container",{quantity:1,container:ids.bag,currency:{pp:0,gp:0,ep:0,sp:0,cp:3}}),
  itemData(ids.rope,"Rope","loot",{quantity:3,container:ids.bag,price:{value:1,denomination:"gp"}}),
  itemData(ids.gem,"Gem","loot",{quantity:2,container:ids.pouch,price:{value:25,denomination:"sp"}})
 ];
 for(const definition of definitions){const old=source.items.get(definition._id);if(old){if(!owned(old))throw Error("Foreign embedded item");continue}await source.createEmbeddedDocuments("Item",[definition],{keepId:true});if(!source.items.has(definition._id))throw Error("Partial embedded creation; inspect before retry")}
 await api.updateItemPile(source,{enabled:true,type:"pile",deleteWhenEmpty:"false",shareItemsEnabled:false,shareCurrenciesEnabled:false});
 state.baseline={source:source.toObject(),target:target.toObject()};state.phase="prepared";await save();return readback();
}
function differences(a,b,path="",out=[]){
 if(Object.is(a,b))return out;
 if(a&&b&&typeof a==="object"&&typeof b==="object"){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[k],b[k],path?`${path}.${k}`:k,out);
 }else out.push({path,before:a,after:b});return out;
}
function verifyTransferred(label,quantity,container){
 const expected=copy(state.baseline.source.items.find(i=>i.name===`${prefix}-${label}`));
 const matches=getActor(ids.target).items.filter(i=>i.name===expected.name);if(matches.length!==1)return {pass:false,error:`Expected exactly one ${label}`,count:matches.length};
 const actual=matches[0].toObject();
 const permitted=["_id","_stats.createdTime","_stats.modifiedTime","_stats.lastModifiedBy"];
 for(const path of permitted)foundry.utils.setProperty(expected,path,foundry.utils.getProperty(actual,path));
 expected.system.quantity=quantity;
 if(container!==undefined)expected.system.container=container;
 if(Object.hasOwn(expected.system,"equipped"))expected.system.equipped=false;
 if(Object.hasOwn(expected.system,"attuned"))expected.system.attuned=false;
 const defaultFlag=foundry.utils.getProperty(actual,"flags.item-piles.item");
 const exactMetadataAdditions=[];
 if(foundry.utils.getProperty(expected,"flags.item-piles.item")===undefined&&defaultFlag&&typeof defaultFlag==="object"&&!Array.isArray(defaultFlag)&&Object.keys(defaultFlag).length===0){
  foundry.utils.setProperty(expected,"flags.item-piles.item",{});
  exactMetadataAdditions.push({path:"flags.item-piles.item",value:{},source:"Item Piles Transaction.prepare creates cleanFlagData even when empty"});
 }
 const diff=differences(expected,actual);
 return {pass:diff.length===0,id:actual._id,differences:diff,precisePermittedMetadata:permitted,exactMetadataAdditions};
}
async function readback(){
 const source=game.actors.get(ids.source),target=game.actors.get(ids.target);
 const result={dispatchId,toolRevision:3,comparisonRevision:1,world:game.world.id,core:game.version,system:game.system.version,phase:state?.phase,operations:state?.operations,systemSettings:systemSettings(),systemBeforeV3:state?.systemBeforeV3,adapterProbeV3:state?.adapterProbeV3,resetStage:state?.resetStage,resetEvidenceV3:state?.resetEvidenceV3,
  modules:Object.fromEntries(["item-piles","itempilesdnd5e","socketlib","lib-wrapper"].map(id=>[id,{version:game.modules.get(id)?.version,active:game.modules.get(id)?.active}])),
  actors:[source,target].filter(Boolean).map(a=>({id:a.id,name:a.name,owned:owned(a),wallet:wallet(a),items:a.items.map(i=>i.toObject())})),folderPresent:game.folders.has(ids.folder)};
 if(state?.baseline&&source&&target){
  result.walletTotalCopper=copper(wallet(source))+copper(wallet(target));
  result.walletTotalConserved=result.walletTotalCopper===1150;
  const total=label=>[source,target].flatMap(a=>a.items.filter(i=>i.name===`${prefix}-${label}`)).reduce((n,i)=>n+i.system.quantity,0);
  result.quantities=Object.fromEntries(["Loose","Blade","Bag","Pouch","Rope","Gem"].map(n=>[n,total(n)]));
  result.looseUI={source:source.items.find(i=>i.name===`${prefix}-Loose`)?.system.quantity??0,target:target.items.find(i=>i.name===`${prefix}-Loose`)?.system.quantity??0};
  if(result.looseUI.target)result.loosePayload=verifyTransferred("Loose",result.looseUI.target);
  if(target.items.some(i=>i.name===`${prefix}-Blade`))result.bladePayload=verifyTransferred("Blade",1);
  const bag=target.items.find(i=>i.name===`${prefix}-Bag`),pouch=target.items.find(i=>i.name===`${prefix}-Pouch`);
  if(bag){result.containerPayload={bag:verifyTransferred("Bag",1,null),pouch:verifyTransferred("Pouch",1,bag.id),rope:verifyTransferred("Rope",3,bag.id),gem:verifyTransferred("Gem",2,pouch?.id)};result.containersAbsentFromSource=[ids.bag,ids.pouch,ids.rope,ids.gem].every(id=>!source.items.has(id))}
 }
 return result;
}
async function operation(name,fn){
 if(!state?.baseline||state.phase==="cleaned")throw Error("Prepare first");
 if(state.operations[name])throw Error(`${name} already started or completed; Readback, never blindly replay`);
 state.operations[name]={status:"started"};await save();
 try{await fn();state.operations[name]={status:"completed"};await save();return readback()}
 catch(error){state.operations[name]={status:"failed",error:String(error)};await save();throw error}
}
async function retryUnwritten(originalName,itemIds){
 const expectedError=`TypeError: Cannot use 'in' operator to search for 'flags.item-piles.item' in ${itemIds[0]}`;
 if(!state?.baseline||state.operations[originalName]?.status!=="failed"||state.operations[originalName].error!==expectedError)throw Error("Recovery only accepts the recorded pre-socket argument failure");
 const source=getActor(ids.source),target=getActor(ids.target);
 for(const id of itemIds){
  const original=state.baseline.source.items.find(i=>i._id===id),current=source.items.get(id);
  if(!original||!current||differences(original,current.toObject()).length)throw Error(`Recovery refused: source ${id} changed or missing`);
  if(target.items.some(i=>i.id===id||i.name===original.name))throw Error(`Recovery refused: target already contains ${id}`);
 }
 return operation(`${originalName}-object-v2`,()=>api.transferItems(source,target,[{_id:itemIds[0],quantity:1}],{interactionId:`${dispatchId}-${originalName}-object-v2`}));
}
function canonical(value){if(value&&typeof value==="object")return Array.isArray(value)?"["+value.map(canonical).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";return JSON.stringify(value)}
async function dataHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(JSON.parse(JSON.stringify(value)))))),x=>x.toString(16).padStart(2,"0")).join("")}
function systemSettings(){return Object.fromEntries(["systemVersion","currencies","secondaryCurrencies","itemQuantityAttribute","itemPriceAttribute","itemFilters","itemSimilarities","unstackableItemTypes","pileDefaults","tokenFlagDefaults"].map(k=>[k,copy(game.settings.get("item-piles",k))]))}
async function assertPartialState(){
 for(const [actorId,expected]of Object.entries(partialV2.actors)){
  const actor=getActor(actorId);if(differences(expected.wallet,wallet(actor)).length)throw Error("Wallet changed; no reset");
  if(canonical(actor.items.map(i=>i.id).sort())!==canonical(Object.keys(expected.items).sort()))throw Error("Item ID set changed; no reset");
  for(const [id,hash]of Object.entries(expected.items)){const item=actor.items.get(id);if(!owned(item)||await dataHash(item.toObject())!==hash)throw Error(`Partial-state document changed: ${id}`)}
 }
}
async function snapshotV3(){
 await assertPartialState();if(!state.systemBeforeV3){state.systemBeforeV3=systemSettings();await save()}return readback();
}
function normalizeCurrencyRuntimeMarkers(expected,current){
 const normalized=[];
 const paths=["system.currency.pp","system.currency.gp","system.currency.ep","system.currency.sp","system.currency.cp"];
 if(expected.currencies?.length!==5||current.currencies?.length!==5)return normalized;
 for(let index=0;index<5;index++){
  const a=expected.currencies[index],b=current.currencies[index];
  if(a.type!=="attribute"||b.type!=="attribute"||a.data?.path!==paths[index]||b.data?.path!==paths[index])continue;
  const before=Object.hasOwn(a,"secondary"),after=Object.hasOwn(b,"secondary");
  if(before&&!after&&a.secondary===false){delete a.secondary;normalized.push(`currencies.${index}.secondary:false->absent`)}
  else if(!before&&after&&b.secondary===false){a.secondary=false;normalized.push(`currencies.${index}.secondary:absent->false`)}
 }
 return normalized;
}
async function validateAdapter(){
 if(game.modules.get("itempilesdnd5e").version!=="1.1.0+servernext.2")throw Error("Install adapter2 before probe/reset");
 if(!state?.systemBeforeV3)throw Error("Capture original system settings before maintenance");
 const current=systemSettings(),expected=copy(state.systemBeforeV3);expected.systemVersion="1.0.10";
 const normalizedRuntimeMetadata=normalizeCurrencyRuntimeMarkers(expected,current);
 const configDifferences=differences(expected,current);if(configDifferences.length)throw Error("Unexpected settings migration: "+JSON.stringify(configDifferences));
 const target=getActor(ids.target),before=await dataHash(target.toObject());
 const probe=copy(state.baseline.source.items.find(i=>i._id===ids.blade));probe._id="NXPilesProbe0001";probe.name=prefix+"-AdapterProbe";
 const transaction=new game.itempiles.Transaction(target);
 await transaction.appendItemChanges([{item:probe,quantity:1}]);
 const transformed=transaction.itemsToCreate[0];
 const result={systemVersion:current.systemVersion,configDifferences,normalizedRuntimeMetadata,attunement:transformed?.system.attunement,attuned:transformed?.system.attuned,equipped:transformed?.system.equipped,receiverUnchanged:before===await dataHash(target.toObject()),committed:false};
 result.pass=transaction.itemsToCreate.length===1&&result.attunement==="required"&&result.attuned===false&&result.receiverUnchanged;
 state.adapterProbeV3=result;await save();return result;
}
async function resetOwnedItems(){return operation("reset-v3",async()=>{
 await assertPartialState();const probe=await validateAdapter();if(!probe.pass)throw Error("Selected adapter still incorrect; no reset");
 const source=getActor(ids.source),target=getActor(ids.target);
 const remove=["qOnTuRMoS9KgcDiE","C4tS9mNQfBnD4sKm","HYc9eHYJgXMBcV0T","Mha2sBvWES6JRGu9"];
 const restore=[ids.blade,ids.bag,ids.pouch,ids.rope].map(id=>copy(state.baseline.source.items.find(i=>i._id===id)));
 if(restore.some(i=>!i||source.items.has(i._id)))throw Error("Invalid restore boundary");
 state.resetStage="validated-before-removal";await save();
 await target.deleteEmbeddedDocuments("Item",remove);
 if(remove.some(id=>target.items.has(id)))throw Error("Partial target removal; preserve and read back");
 state.resetStage="target-removed";await save();
 await source.createEmbeddedDocuments("Item",restore,{keepId:true});
 const metadata=["_stats.createdTime","_stats.modifiedTime","_stats.lastModifiedBy"];
 const resetDiffs=[];state.resetSourceHashes={};
 for(const id of[ids.blade,ids.bag,ids.pouch,ids.rope,ids.gem]){
  const actual=source.items.get(id)?.toObject();if(!actual)throw Error("Partial source restore; preserve");
  const expected=copy(state.baseline.source.items.find(i=>i._id===id));for(const p of metadata)foundry.utils.setProperty(expected,p,foundry.utils.getProperty(actual,p));
  const diff=differences(expected,actual);if(diff.length)throw Error(`Source reset mismatch ${id}: ${JSON.stringify(diff)}`);
  resetDiffs.push({id,differences:diff});state.resetSourceHashes[id]=await dataHash(actual);
 }
 state.resetEvidenceV3={resetDiffs,sourceActorId:source.id,targetActorId:target.id,removedReceiverIds:remove,preciseResetMetadata:metadata,looseAndCurrencyNotReplayed:true};state.resetStage="source-restored";await save();return state.resetEvidenceV3;
})}
async function transferReset(name,itemIds){
 if(state.operations["reset-v3"]?.status!=="completed"||!state.adapterProbeV3?.pass)throw Error("Completed exact reset and adapter validation required");
 const source=getActor(ids.source),target=getActor(ids.target);
 for(const id of itemIds){const item=source.items.get(id);if(!item||await dataHash(item.toObject())!==state.resetSourceHashes[id])throw Error("Reset source changed; do not replay");if(target.items.some(i=>i.name===item.name))throw Error("Target already has transfer counterpart")}
 return operation(`${name}-object-v3`,()=>api.transferItems(source,target,[{_id:itemIds[0],quantity:1}],{interactionId:`${dispatchId}-${name}-object-v3`}));
}
async function cleanup(){
 if(!state?.baseline)throw Error("Missing baseline; preserve partial objects");
 for(const id of [ids.source,ids.target]){const a=game.actors.get(id);if(a&&(!owned(a)||a.items.some(i=>!owned(i))))throw Error("Foreign actor/item; preserve and report")}
 const folder=game.folders.get(ids.folder);if(folder&&(!owned(folder)||folder.contents.some(a=>![ids.source,ids.target].includes(a.id))))throw Error("Foreign folder contents");
 const source=game.actors.get(ids.source);if(source)await api.unrenderItemPileInterface(source);
 for(const id of [ids.source,ids.target]){const a=game.actors.get(id);if(a)await a.delete()}
 if(folder)await folder.delete();state.phase="cleaned";await save();return readback();
}
async function show(fn){let result;try{result=await fn()}catch(error){result={dispatchId,error:String(error),readback:await readback()}}const pre=document.createElement("pre");pre.textContent=JSON.stringify(result,null,2);new foundry.applications.api.DialogV2({window:{title:`${dispatchId} receipt`},content:pre.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true})}
new foundry.applications.api.DialogV2({window:{title:dispatchId+" recovery3"},content:"<p>Snapshot settings before maintenance. After adapter2: Validate, exact owned-item reset, then corrected transfers once. Never repeat Loose/currency or recreate actors.</p>",buttons:[
 {action:"snapshot-v3",label:"Snapshot before update",callback:()=>show(snapshotV3)},
 {action:"open",label:"Open Pile",callback:()=>api.renderItemPileInterface(getActor(ids.source),{inspectingTarget:getActor(ids.target),useDefaultCharacter:false})},
 {action:"read",label:"Readback",callback:()=>show(readback)},
 {action:"probe-v3",label:"Validate selected adapter",callback:()=>show(validateAdapter)},
 {action:"reset-v3",label:"Reset exact owned items",callback:()=>show(resetOwnedItems)},
 {action:"blade-v3",label:"Transfer Blade v3",callback:()=>show(()=>transferReset("blade",[ids.blade]))},
 {action:"bag-v3",label:"Transfer Bag v3",callback:()=>show(()=>transferReset("bag",[ids.bag,ids.pouch,ids.rope,ids.gem]))},
 {action:"cleanup",label:"Cleanup",callback:()=>show(cleanup)}
]}).render({force:true});

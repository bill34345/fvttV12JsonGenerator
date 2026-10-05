const dispatchId="NEXT-VM-20260929-03",macro=this,owner="nextVMDispatch",key="nextVMBatch",prefix="CodexTemp-NEXT-VM-2901";
const ids={observer:"NXVM2901Observer",target:"NXVM2901TargetAA",scene:"NXVM2901SceneAAA",folder:"NXVM2901FolderAA",player:"NXVM2901PlayerAA",observerToken:"NXVM2901ObsToken",near:"NXVM2901NearTokn",far:"NXVM2901FarToken",item:"NXVM2901MacroItm",activity:"NXVM2901Activity",weapon:"NXVM2901PoisonWp",poisonActivity:"NXVM2901PoisonAc",inaudible:"NXVM2901SilentAA",magical:"NXVM2901MagEffAA"};
if(location.hostname!=="127.0.0.1"||location.port!=="30002"||game.world.id!=="cor-cotn"||game.version!=="14.368"||game.system.version!=="6.0.2"||!game.user.isGM)throw Error("Exact Next GM gate failed");
if(game.modules.get("vision-5e")?.version!=="3.2.2+servernext.1"||game.modules.get("itemacro")?.version!=="3.0.1+servernext.1")throw Error("Wrong candidate");
const copy=v=>foundry.utils.deepClone(v),flags={world:{[owner]:dispatchId}},owned=d=>d?.getFlag("world",owner)===dispatchId;
let state=copy(macro.getFlag("world",key));if(state&&state.dispatchId!==dispatchId)throw Error("Foreign ledger");
const save=()=>macro.setFlag("world",key,copy(state));
async function ensure(collection,cls,id,data){let d=collection.get(id);if(d){if(!owned(d))throw Error(`Foreign ID ${id}`);return d}d=await cls.create({_id:id,...data,flags:copy(flags)},{keepId:true});if(d?.id!==id||!owned(collection.get(id)))throw Error(`Readback failed ${id}`);return d}
async function embedded(parent,type,id,data){const collection=parent.getEmbeddedCollection(type);if(collection.has(id)){if(!owned(collection.get(id)))throw Error("Foreign embedded ID");return collection.get(id)}await parent.createEmbeddedDocuments(type,[{...data,_id:id,flags:copy(flags)}],{keepId:true});return collection.get(id)}
function observer(){const a=game.actors.get(ids.observer);if(!owned(a))throw Error("Observer missing/foreign");return a}
function testItem(){const i=observer().items.get(ids.item);if(!owned(i))throw Error("Test Item missing/foreign");return i}
async function prepare(){
 if(!state){state={dispatchId,phase:"preparing",originalActive:game.scenes.active?.id??null,originalViewed:canvas.scene?.id??null,originalPaused:game.paused,originalDefaultMacro:game.settings.get("itemacro","defaultmacro"),operations:{}};await save()}
 if(state.phase==="cleaned")throw Error("Already cleaned; no recreation");
 if(state.phase==="prepared")return readback();
 await ensure(game.folders,Folder,ids.folder,{name:prefix,type:"Actor"});
 const player=await ensure(game.users,User,ids.player,{name:`${prefix}-Player`,role:CONST.USER_ROLES.PLAYER,password:""});
 const a=await ensure(game.actors,Actor,ids.observer,{name:`${prefix}-Observer`,type:"character",folder:ids.folder,ownership:{default:0,[player.id]:3},system:{attributes:{senses:{units:"ft",ranges:{darkvision:60,blindsight:0,truesight:0,tremorsense:0}}}},prototypeToken:{actorLink:true,texture:{src:"icons/svg/mystery-man.svg"},sight:{enabled:true,visionMode:"darkvision"}}});
 const t=await ensure(game.actors,Actor,ids.target,{name:`${prefix}-Target`,type:"npc",folder:ids.folder,prototypeToken:{actorLink:true,texture:{src:"icons/svg/skull.svg"},sight:{enabled:false}}});
 await embedded(a,"Item",ids.item,{name:`${prefix}-MacroItem`,type:"feat",system:{activities:{[ids.activity]:{_id:ids.activity,type:"utility",name:"VM Activity"}}}});
 const item=a.items.get(ids.item);
 if(!item.hasMacro()){const m=item.getMacro();m.updateSource({type:"script",command:"return true;"});await item.setMacro(m)}
 await embedded(t,"Item",ids.weapon,{name:`${prefix}-CriticalPoison`,type:"weapon",system:{type:{value:"natural"},activities:{[ids.poisonActivity]:{_id:ids.poisonActivity,type:"attack",damage:{includeBase:false,parts:[],critical:{bonus:"1d6[poison]"}}}}}});
 await embedded(t,"ActiveEffect",ids.inaudible,{name:`${prefix}-Inaudible`,type:"base",statuses:["inaudible"],disabled:false});
 await embedded(a,"ActiveEffect",ids.magical,{name:`${prefix}-Magical`,type:"base",system:{magical:true},disabled:false});
 const scene=await ensure(game.scenes,Scene,ids.scene,{name:prefix,width:2200,height:1200,padding:0,active:false,navigation:true,tokenVision:true,grid:{type:1,size:100,distance:5,units:"ft"},environment:{darknessLevel:1,globalLight:{enabled:false}},fog:{mode:CONST.FOG_EXPLORATION_MODES.DISABLED}});
 for(const [id,actor,name,x]of[[ids.observerToken,a,"VM Observer",200],[ids.near,t,"VM Near 30ft",800],[ids.far,t,"VM Far 80ft",1800]]){
  if(scene.tokens.has(id)){if(!owned(scene.tokens.get(id)))throw Error("Foreign token");continue}
  const token=await actor.getTokenDocument({name,x,y:500,actorLink:true,level:"defaultLevel0000",displayName:CONST.TOKEN_DISPLAY_MODES.ALWAYS});
  await embedded(scene,"Token",id,token.toObject());
 }
 await player.update({character:a.id});
 await game.settings.set("itemacro","defaultmacro",true);
 await scene.activate();await scene.view();
 state.phase="prepared";await save();return readback();
}
async function readback(){
 const a=game.actors.get(ids.observer),t=game.actors.get(ids.target),s=game.scenes.get(ids.scene),i=a?.items.get(ids.item);
 return {dispatchId,phase:state?.phase,world:game.world.id,core:game.version,system:game.system.version,operations:state?.operations,original:{active:state?.originalActive,viewed:state?.originalViewed,paused:state?.originalPaused,defaultmacro:state?.originalDefaultMacro},
  modules:Object.fromEntries(["vision-5e","itemacro"].map(id=>[id,{version:game.modules.get(id)?.version,active:game.modules.get(id)?.active}])),
  actorIds:{observer:a?.id??null,target:t?.id??null},observerSenses:a?.system.attributes.senses,observerDetection:a?.detectionModes,observerStatuses:a?[...a.statuses]:[],targetStatuses:t?[...t.statuses]:[],targetCritical:t?.items.get(ids.weapon)?.system.activities.get(ids.poisonActivity)?.damage.critical,
  activeScene:game.scenes.active?.id,viewedScene:canvas.scene?.id,scene:s?{id:s.id,darkness:s.environment.darknessLevel,globalLight:s.environment.globalLight.enabled,tokenVision:s.tokenVision,grid:{size:s.grid.size,distance:s.grid.distance,units:s.grid.units},tokens:s.tokens.map(d=>({id:d.id,actorId:d.actorId,x:d.x,y:d.y,level:d._source.level,sight:d.sight,detectionModes:d.detectionModes}))}:null,
  player:game.users.has(ids.player)?{id:ids.player,character:game.users.get(ids.player).character?.id}:null,macroItem:i?{id:i.id,command:i.getMacro().command,activityId:ids.activity,records:i.getFlag("world","nextVMExecutions")??[]}:null,defaultmacro:game.settings.get("itemacro","defaultmacro")};
}
async function operation(name,fn){if(!state||state.phase!=="prepared")throw Error("Prepare first");if(state.operations[name])throw Error("Already started/completed; Readback rather than replay");state.operations[name]={status:"started"};await save();try{state.operations[name]={status:"completed",result:await fn()};await save();return readback()}catch(error){state.operations[name]={status:"failed",error:String(error)};await save();throw error}}
async function senses(){return operation("senses",async()=>{const a=observer(),s=game.scenes.get(ids.scene);const before={actor:a.detectionModes.basicSight,token:s.tokens.get(ids.observerToken).sight.range};await a.update({"system.attributes.senses.ranges.darkvision":90});const ninety={actor:a.detectionModes.basicSight,token:s.tokens.get(ids.observerToken).sight.range};await a.update({"system.attributes.senses.ranges.darkvision":60});const restored={actor:a.detectionModes.basicSight,token:s.tokens.get(ids.observerToken).sight.range};return {before,ninety,restored,pass:before.actor===60&&before.token===60&&ninety.actor===90&&ninety.token===90&&restored.actor===60&&restored.token===60}})}
async function manualAPI(){return operation("manual-api",async()=>{const i=testItem();const before=(i.getFlag("world","nextVMExecutions")??[]).length;await i.executeMacro({event:new Event("next-vm-api"),nextVMMarker:"manual-api"},42);const records=i.getFlag("world","nextVMExecutions")??[];return {added:records.length-before,record:records.at(-1),pass:records.length===before+1&&records.at(-1)?.eventType==="next-vm-api"&&records.at(-1)?.positional===42}})}
async function activityAPI(){return operation("activity-api",async()=>{
 const i=testItem(),a=i.system.activities.get(ids.activity);const before=(i.getFlag("world","nextVMExecutions")??[]).length;let hookId,timer;
 try{await new Promise((resolve,reject)=>{hookId=Hooks.on("dnd5e.postUseActivity",activity=>{if(activity.item.actor?.id===ids.observer&&activity.item.id===ids.item&&activity.id===ids.activity)resolve()});timer=setTimeout(()=>reject(Error("Owned activity did not reach postUse within10s; read ledger, never replay blindly")),10000);Promise.resolve(a.use({consume:false,create:false,subsequentActions:false,nextVMMarker:"activity-api"},{configure:false},{create:false})).catch(reject)})}finally{clearTimeout(timer);Hooks.off("dnd5e.postUseActivity",hookId)}
 const records=i.getFlag("world","nextVMExecutions")??[];return {added:records.length-before,record:records.at(-1),pass:records.length===before+1&&records.at(-1)?.activityId===ids.activity&&records.at(-1)?.marker==="activity-api"};
})}
async function cleanup(){
 if(!state)throw Error("No ledger");if(game.users.get(ids.player)?.active)throw Error("Log out owned test player first");
 for(const [collection,id]of[[game.actors,ids.observer],[game.actors,ids.target],[game.scenes,ids.scene],[game.folders,ids.folder],[game.users,ids.player]]){const d=collection.get(id);if(d&&!owned(d))throw Error("Foreign object; preserve")}
 const scene=game.scenes.get(ids.scene);if(scene?.tokens.some(t=>!owned(t)))throw Error("Foreign token; preserve");
 for(const id of[ids.observer,ids.target]){const a=game.actors.get(id);if(a&&(a.items.some(i=>!owned(i))||a.effects.some(e=>!owned(e))))throw Error("Foreign embedded document; preserve")}
 if(game.folders.get(ids.folder)?.contents.some(a=>![ids.observer,ids.target].includes(a.id)))throw Error("Foreign folder content");
 if(state.originalActive)await game.scenes.get(state.originalActive)?.activate();if(state.originalViewed)await game.scenes.get(state.originalViewed)?.view();
 await game.settings.set("itemacro","defaultmacro",state.originalDefaultMacro);if(game.paused!==state.originalPaused)await game.togglePause(state.originalPaused,true);
 for(const [collection,id]of[[game.scenes,ids.scene],[game.actors,ids.observer],[game.actors,ids.target],[game.folders,ids.folder],[game.users,ids.player]]){const d=collection.get(id);if(d)await d.delete()}
 state.phase="cleaned";await save();return readback();
}
async function show(fn){let result;try{result=await fn()}catch(error){result={dispatchId,error:String(error),readback:await readback()}}const p=document.createElement("pre");p.textContent=JSON.stringify(result,null,2);new foundry.applications.api.DialogV2({window:{title:dispatchId+" receipt"},content:p.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true})}
new foundry.applications.api.DialogV2({window:{title:dispatchId},content:"<p>Prepare once, edit/execute Item Macro through its real sheet UI, then run bounded API probes. One player login for darkvision near/far and reload.</p>",buttons:[
 {action:"prepare",label:"Prepare",callback:()=>show(prepare)},{action:"read",label:"Readback",callback:()=>show(readback)},
 {action:"item",label:"Open owned Item",callback:()=>testItem().sheet.render({force:true})},
 {action:"senses",label:"Sense update API",callback:()=>show(senses)},{action:"manual",label:"Manual arguments API",callback:()=>show(manualAPI)},
 {action:"activity",label:"Activity API",callback:()=>show(activityAPI)},{action:"cleanup",label:"Cleanup",callback:()=>show(cleanup)}
]}).render({force:true});

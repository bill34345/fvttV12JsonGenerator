// Normal Foundry Macro UI consumer; lifecycle reused from server-next-external-candidates/acceptance-macro.js.
const batch = "NXTSTS20261003A";
const moduleId = "fvtt-selected-token-sync";
const macro = this;
const ledgerKey = "selectedSyncAcceptance";
const ownerKey = "nextExternalDispatch";
const ids = { scene: "STS1003SceneAA01", a: "STS1003ActorAA01", b: "STS1003ActorBB01", c: "STS1003ActorCC01",
  a1: "STS1003TokenA001", a2: "STS1003TokenA002", as: "STS1003TokenS001", b1: "STS1003TokenB001", cs: "STS1003TokenC001" };
for (const id of Object.values(ids)) if (!/^[a-zA-Z0-9]{16}$/.test(id)) throw new Error("Invalid fixture ID");
if (location.hostname !== "127.0.0.1" || location.port !== "30002" || game.world.id !== "cor-cotn" || game.version !== "14.368" || game.system.id !== "dnd5e" || game.system.version !== "6.0.5" || !game.user.isGM) throw new Error("Exact ServerNext/GM gate failed");
if (!macro?.getFlag || macro.type !== "script" || !macro.name.startsWith("CodexTemp-SelectedSync-1003")) throw new Error("Execute from owned Macro");
const copy = value => foundry.utils.deepClone(value);
const flags = {world:{[ownerKey]:batch}};
const owned = doc => doc?.getFlag("world",ownerKey) === batch;
let state = copy(macro.getFlag("world",ledgerKey));
if (state && state.batch !== batch) throw new Error("Foreign ledger");
const save = async () => macro.setFlag("world",ledgerKey,copy(state));
const actorIds = [ids.a,ids.b,ids.c];
const tokenIds = [ids.a1,ids.a2,ids.as,ids.b1,ids.cs];
const statuses = ["exhaustion","poisoned","prone"];
const scene = () => game.scenes.get(ids.scene);
const token = id => scene()?.tokens.get(id);
const level = actor => Number(actor?.effects.get(CONFIG.statusEffects.exhaustion?._id)?.system.level ?? 0);
const stable = value => JSON.stringify(value);
function worldIds() {
  return Object.fromEntries(["actors","items","scenes","macros","tables","journal","messages"].map(key => [key,game[key].contents.map(d=>d.id).filter(id=>id!==macro.id && !actorIds.includes(id) && id!==ids.scene).sort()]));
}
function activeModules() { return game.modules.contents.filter(m=>m.active).map(m=>`${m.id}@${m.version}`).sort(); }
function assertPrepared() {
  if (!state || state.phase === "cleaned" || !owned(scene()) || actorIds.some(id=>!owned(game.actors.get(id)))) throw new Error("No prepared owned batch");
  if (game.modules.get(moduleId)?.version !== "0.2.0" || !game.modules.get(moduleId)?.active) throw new Error("Candidate not active");
}
async function ensure(collection, cls, id, data) {
  const existing=collection.get(id);
  if (existing) { if (!owned(existing)) throw new Error(`Protected ID collision ${id}`); return existing; }
  const result=await cls.create({_id:id,...data,flags:copy(flags)},{keepId:true});
  if (result?.id!==id || !owned(collection.get(id))) throw new Error(`Birth readback failed ${id}; do not replay`);
  return result;
}
function actorResult(actor) {
  return !actor ? null : {id:actor.id,uuid:actor.uuid,isToken:actor.isToken,level:level(actor),exhaustion:actor.system.attributes.exhaustion,conditions:copy(actor.system.conditions),
    statuses:[...actor.statuses],movement:copy(actor.system.attributes.movement),storedMovement:copy(actor.toObject().system.attributes.movement),
    effects:actor.effects.contents.map(e=>({id:e.id,name:e.name,statuses:[...e.statuses],level:e.system.level,overlay:e.getFlag("core","overlay")}))};
}
async function readback() {
  return {ok:true,batch,macroId:macro.id,target:{world:game.world.id,core:game.version,system:game.system.version},
    module:{active:game.modules.get(moduleId)?.active,version:game.modules.get(moduleId)?.version},
    enabled:game.modules.get(moduleId)?.active ? game.settings.get(moduleId,"enabled") : null,
    activeModules:activeModules(),activeUsers:game.users.contents.filter(u=>u.active).map(u=>({id:u.id,name:u.name,role:u.role})),
    state,worldIds:worldIds(),baselinePreserved:state ? stable(worldIds())===stable(state.originalIds) : null,
    worldTime:game.time.worldTime,paused:game.paused,viewedScene:canvas.scene?.id,
    controlled:canvas.tokens?.controlled.map(t=>t.id),
    worldActors:actorIds.map(id=>actorResult(game.actors.get(id))),
    tokens:tokenIds.map(id=>({id,present:!!token(id),actorLink:token(id)?.actorLink,movementAction:token(id)?.movementAction,storedMovementAction:token(id)?.toObject().movementAction,actor:actorResult(token(id)?.actor)})),
    permissionProbe:state?.permissionProbe ?? null};
}
async function prepare() {
  if (state) throw new Error("Prepare is one-shot; use Readback or case reset");
  if (game.modules.get(moduleId)?.version!=="0.2.0" || !game.modules.get(moduleId)?.active) throw new Error("Enable exact candidate first");
  for (const [collection,id] of [[game.scenes,ids.scene],...actorIds.map(id=>[game.actors,id])]) if(collection.has(id)) throw new Error(`Protected ID collision ${id}`);
  state={batch,phase:"preparing",originalIds:worldIds(),originalModules:activeModules(),originalEnabled:game.settings.get(moduleId,"enabled"),originalViewedScene:canvas.scene?.id ?? null,originalPaused:game.paused,originalWorldTime:game.time.worldTime};
  await save();
  for (const [id,label] of [[ids.a,"A"],[ids.b,"B"],[ids.c,"C"]]) await ensure(game.actors,Actor,id,{name:`CodexTemp-SelectedSync-1003-${label}`,type:"npc",img:"icons/svg/mystery-man.svg",ownership:{default:0},system:{attributes:{hp:{value:20,max:20},movement:{walk:30,fly:30,swim:20,climb:20,burrow:10}}},prototypeToken:{name:`STS-${label}`,texture:{src:"icons/svg/mystery-man.svg"}}});
  const s=await ensure(game.scenes,Scene,ids.scene,{name:"CodexTemp-SelectedSync-1003",width:1600,height:1000,padding:0.1,active:false,navigation:true,tokenVision:false,grid:{type:1,size:100}});
  const entries=[[ids.a1,ids.a,true,200],[ids.a2,ids.a,true,400],[ids.as,ids.a,false,600],[ids.b1,ids.b,true,800],[ids.cs,ids.c,false,1000]];
  const docs=[];
  for(const [id,actorId,linked,x] of entries) {
    const doc=await game.actors.get(actorId).getTokenDocument({_id:id,name:id.slice(7),actorLink:linked,x,y:400,flags:copy(flags)});
    docs.push(doc.toObject());
  }
  await s.createEmbeddedDocuments("Token",docs,{keepId:true});
  if (tokenIds.some(id=>!owned(s.tokens.get(id)))) throw new Error("Token birth mismatch");
  const player=game.users.contents.find(u=>!u.isGM);
  state.permissionProbe=player ? {userId:player.id,role:player.role,ownedActors:actorIds.map(id=>({id,canUpdate:game.actors.get(id).canUserModify(player,"update")}))} : {status:"NO_EXISTING_PLAYER"};
  state.phase="prepared"; await save();
  await s.view();
  return readback();
}
async function select() {
  assertPrepared();
  if (canvas.scene?.id!==ids.scene) await scene().view();
  canvas.tokens.releaseAll();
  for(const id of tokenIds) canvas.tokens.get(id).control({releaseOthers:false});
  await canvas.tokens.hud.bind(canvas.tokens.get(ids.a1));
  return readback();
}
async function setLevel(actor,wanted) {
  // Native 6.0.5 create-from-zero starts exhaustion at 1; never seed a higher level in one call.
  let current=level(actor);
  if(current===wanted) return;
  if(current===0 && wanted>0) {await actor.toggleStatusEffect("exhaustion",{levels:1}); current=level(actor);}
  if(current!==wanted) await actor.toggleStatusEffect("exhaustion",{levels:wanted-current});
  if(level(actor)!==wanted) throw new Error(`Fixture level preparation not settled: ${actor.uuid}`);
}
async function resetCase(kind) {
  assertPrepared();
  const cases={zero:[0,0,0,0],mixed:[1,3,2,4],max:[6,6,2,4],floor:[0,0,2,1],rapid:[1,3,2,4]};
  const wanted=cases[kind]; if(!wanted) throw new Error("Unknown case");
  const actors=[game.actors.get(ids.a),token(ids.as).actor,game.actors.get(ids.b),token(ids.cs).actor];
  for(const actor of actors) for(const id of ["poisoned","prone"]) await actor.toggleStatusEffect(id,{active:false});
  for(let i=0;i<actors.length;i++) await setLevel(actors[i],wanted[i]);
  await scene().updateEmbeddedDocuments("Token",tokenIds.map(_id=>({_id,movementAction:null})));
  state.lastPreparation={kind,levels:actors.map(a=>level(a)),at:Date.now()}; await save();
  return select();
}
async function programmatic() {
  assertPrepared();
  await game.actors.get(ids.b).toggleStatusEffect("poisoned",{active:true});
  return readback();
}
async function cleanup() {
  if(!state || state.batch!==batch) throw new Error("No ownership ledger; refusing cleanup");
  for(const [collection,id] of [[game.scenes,ids.scene],...actorIds.map(id=>[game.actors,id])]) {
    const doc=collection.get(id); if(doc && !owned(doc)) throw new Error(`Ownership changed ${id}`);
  }
  if(stable(worldIds())!==stable(state.originalIds)) throw new Error("Foreign world ID drift; preserve and inspect");
  if(stable(activeModules())!==stable(state.originalModules)) throw new Error("Module drift; preserve and inspect");
  if(game.time.worldTime!==state.originalWorldTime) throw new Error("World time changed; do not silently restore");
  const s=scene();
  if(s?.tokens.some(t=>!tokenIds.includes(t.id)||!owned(t))) throw new Error("Foreign token in fixture");
  if(s && (s.walls.size||s.drawings.size||s.tiles.size||s.lights.size||s.sounds.size||s.regions.size||s.notes.size)) throw new Error("Foreign scene content");
  for(const actor of [...actorIds.map(id=>game.actors.get(id)),...tokenIds.map(id=>token(id)?.actor)].filter(Boolean)) {
    if(actor.items.size || actor.effects.some(e=>![...e.statuses].some(s=>statuses.includes(s)))) throw new Error("Unexpected fixture children; preserve");
  }
  state.phase="cleaning"; await save();
  if(state.originalViewedScene) await game.scenes.get(state.originalViewedScene)?.view();
  await game.settings.set(moduleId,"enabled",state.originalEnabled);
  if(s) await s.delete();
  for(const id of actorIds) if(game.actors.has(id)) await game.actors.get(id).delete();
  if(game.paused!==state.originalPaused) await game.togglePause(state.originalPaused,true);
  state.phase="cleaned"; await save();
  return readback();
}
async function finalize() {
  if(state?.phase!=="cleaned" || actorIds.some(id=>game.actors.has(id)) || game.scenes.has(ids.scene)) throw new Error("Cleanup receipt required first");
  if(stable(worldIds())!==stable(state.originalIds)) throw new Error("Foreign world ID drift");
  const receipt=await readback();
  receipt.ownedMacroEvidence=macro.toObject();
  await macro.delete();
  receipt.macroAbsent=!game.macros.has(macro.id);
  return receipt;
}
async function show(action) {
  let result; try {result=await action();} catch(error) {result={ok:false,batch,error:String(error),state};}
  const field=document.createElement("textarea");field.name="selected-sync-report";field.readOnly=true;field.style="width:100%;height:420px";field.textContent=JSON.stringify(result,null,2);
  new foundry.applications.api.DialogV2({window:{title:`${batch} receipt`},content:field.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true});
}
new foundry.applications.api.DialogV2({window:{title:`${batch} controls`},content:'<p>Readback first. Case reset only prepares owned fixtures; use real HUD clicks to verify behavior.</p><select name="case"><option value="zero">zero</option><option value="mixed">mixed</option><option value="max">max</option><option value="floor">floor</option><option value="rapid">rapid</option></select>',buttons:[
  {action:"read",label:"Readback",callback:()=>show(readback)},
  {action:"prepare",label:"Prepare once",callback:()=>show(prepare)},
  {action:"case",label:"Reset case",callback:(_event,button)=>show(()=>resetCase(button.form.elements.case.value))},
  {action:"select",label:"Select and HUD",callback:()=>show(select)},
  {action:"negative",label:"Programmatic B only",callback:()=>show(programmatic)},
  {action:"cleanup",label:"Cleanup",callback:()=>show(cleanup)},
  {action:"finalize",label:"Finalize Macro",callback:()=>show(finalize)}
]}).render({force:true});

// Import this prepared Macro through Foundry's normal UI. It survives reloads.
const dispatchId = "NEXT-EXT-20260929-01";
const macro = this;
const flagKey = "nextExternalBatch";
const ownerKey = "nextExternalDispatch";
const names = {folder:"CodexTemp-NEXT-EXT-2901",scene:"CodexTemp-NEXT-EXT-2901",player:"CodexTemp-NEXT-EXT-2901-Player",publicClock:"CodexTemp-NEXT-EXT-2901-Public",privateClock:"CodexTemp-NEXT-EXT-2901-Private"};
const ids = {folder:"NXExt2901FolderA",scene:"NXExt2901SceneAA",actorA:"NXExt2901ActorAA",actorB:"NXExt2901ActorBB",player:"NXExt2901PlayerA"};
if (location.hostname !== "127.0.0.1" || location.port !== "30002" || game.world.id !== "cor-cotn" || game.version !== "14.368" || game.system.id !== "dnd5e" || game.system.version !== "6.0.2" || !game.user.isGM) throw new Error("ServerNext exact-target/GM gate failed");
if (!macro?.getFlag || macro.type !== "script") throw new Error("Execute as the imported Macro document");
const copy = value => foundry.utils.deepClone(value);
let state = copy(macro.getFlag("world",flagKey));
if (state && state.dispatchId !== dispatchId) throw new Error("Foreign macro ledger");
const save = async () => macro.setFlag("world",flagKey,copy(state));
const owned = doc => doc?.getFlag("world",ownerKey) === dispatchId;
const flags = {world:{[ownerKey]:dispatchId}};
async function ensureDocument(collection, cls, id, data) {
  let doc = collection.get(id);
  if (doc) {if (!owned(doc)) throw new Error(`Protected ID collision ${id}`); return doc;}
  doc = await cls.create({_id:id,...data,flags:copy(flags)},{keepId:true});
  if (doc?.id !== id || !owned(collection.get(id))) throw new Error(`Readback failed ${id}; stop and inspect, do not replay`);
  return doc;
}
async function readback() {
  const clocks = game.settings.get("global-progress-clocks","activeClocks");
  if (state) {
    for (const clock of Object.values(clocks)) {
      if ([names.publicClock,names.privateClock].includes(clock.name) && !state.originalClockIds.includes(clock.id)) {
        if (state.clockIds[clock.name] && state.clockIds[clock.name] !== clock.id) throw new Error("Duplicate owned clock name; preserve and inspect");
        state.clockIds[clock.name] = clock.id;
      }
    }
    await save();
  }
  return {dispatchId,world:game.world.id,core:game.version,system:game.system.version,user:{id:game.user.id,name:game.user.name,role:game.user.role},
    modules:Object.fromEntries(["dfreds-convenient-effects","dfreds-droppables","global-progress-clocks","socketlib","lib-dfreds-ui-extender","lib-dfreds-migrations"].map(id=>[id,{version:game.modules.get(id)?.version,active:game.modules.get(id)?.active}])),
    state,viewedScene:canvas.scene?.id,paused:game.paused,folder:game.folders.get(ids.folder)?.toObject(),
    actors:[ids.actorA,ids.actorB].map(id=>({id,present:game.actors.has(id),owned:owned(game.actors.get(id))})),
    tokens:game.scenes.get(ids.scene)?.tokens.contents.map(t=>({id:t.id,actorId:t.actorId,x:t.x,y:t.y,elevation:t.elevation,level:t.level?.id ?? t._source.level})),
    clocks:Object.values(clocks).filter(c=>state?.clockIds[c.name]===c.id),
    dropStyle:game.settings.get("dfreds-droppables","dropStyle"),lastUsedDropStyle:game.settings.get("dfreds-droppables","lastUsedDropStyle")};
}
async function prepare() {
  if (!state) {
    state = {dispatchId,phase:"preparing",originalViewedScene:canvas.scene?.id ?? null,originalPaused:game.paused,
      originalDropStyle:game.settings.get("dfreds-droppables","dropStyle"),originalLastStyle:game.settings.get("dfreds-droppables","lastUsedDropStyle"),
      originalClockIds:Object.keys(game.settings.get("global-progress-clocks","activeClocks")),clockIds:{}};
    await save();
  }
  if (state.phase === "cleaned") throw new Error("Batch already cleaned; do not recreate");
  await ensureDocument(game.folders,Folder,ids.folder,{name:names.folder,type:"Actor"});
  for (const [id,label] of [[ids.actorA,"A"],[ids.actorB,"B"]]) {
    await ensureDocument(game.actors,Actor,id,{name:`${names.folder}-${label}`,type:"npc",folder:ids.folder,img:"icons/svg/mystery-man.svg",prototypeToken:{name:`NEXT-EXT-${label}`,actorLink:false,texture:{src:"icons/svg/mystery-man.svg"}}});
  }
  const scene = await ensureDocument(game.scenes,Scene,ids.scene,{name:names.scene,width:1800,height:1200,padding:0.1,active:false,navigation:true,tokenVision:false,grid:{type:1,size:100}});
  await ensureDocument(game.users,User,ids.player,{name:names.player,role:CONST.USER_ROLES.PLAYER,password:""});
  await game.settings.set("dfreds-droppables","dropStyle","dialog");
  await scene.view();
  state.phase="prepared";
  await save();
  return readback();
}
async function cleanup() {
  if (!state) throw new Error("No ownership ledger; refusing cleanup");
  await readback();
  // Validate all owned IDs before deleting anything. Never touch historical objects.
  for (const [collection,id] of [[game.scenes,ids.scene],[game.actors,ids.actorA],[game.actors,ids.actorB],[game.folders,ids.folder],[game.users,ids.player]]) {
    const doc=collection.get(id); if (doc && !owned(doc)) throw new Error(`Ownership changed: ${id}`);
  }
  const scene=game.scenes.get(ids.scene);
  if (scene?.tokens.some(t=>![ids.actorA,ids.actorB].includes(t.actorId))) throw new Error("Foreign token in fixture scene; preserve and report");
  if (game.folders.get(ids.folder)?.contents.some(a=>![ids.actorA,ids.actorB].includes(a.id))) throw new Error("Foreign actor in fixture folder; preserve and report");
  if (game.users.get(ids.player)?.active) throw new Error("Log out the owned Player before cleanup");
  if (state.originalViewedScene) await game.scenes.get(state.originalViewedScene)?.view();
  await game.settings.set("dfreds-droppables","dropStyle",state.originalDropStyle);
  await game.settings.set("dfreds-droppables","lastUsedDropStyle",state.originalLastStyle);
  const clocks=copy(game.settings.get("global-progress-clocks","activeClocks"));
  for (const [name,id] of Object.entries(state.clockIds)) {
    if (clocks[id] && (clocks[id].name!==name || state.originalClockIds.includes(id))) throw new Error("Clock ownership changed");
    delete clocks[id];
  }
  await game.settings.set("global-progress-clocks","activeClocks",clocks);
  for (const [collection,id] of [[game.scenes,ids.scene],[game.actors,ids.actorA],[game.actors,ids.actorB],[game.folders,ids.folder],[game.users,ids.player]]) {
    const doc=collection.get(id); if (doc) await doc.delete();
  }
  if (game.paused!==state.originalPaused) await game.togglePause(state.originalPaused,true);
  state.phase="cleaned"; await save();
  return readback();
}
async function show(action) {
  let result;
  try {result=await action();} catch(error) {result={dispatchId,error:String(error),state};}
  const pre=document.createElement("pre"); pre.textContent=JSON.stringify(result,null,2);
  new foundry.applications.api.DialogV2({window:{title:`${dispatchId} receipt`},content:pre.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true});
}
new foundry.applications.api.DialogV2({window:{title:`${dispatchId} controls`},content:"<p>Prepare once; Readback after reload or errors; Cleanup only after evidence.</p>",buttons:[
  {action:"prepare",label:"Prepare",callback:()=>show(prepare)},
  {action:"read",label:"Readback",callback:()=>show(readback)},
  {action:"cleanup",label:"Cleanup",callback:()=>show(cleanup)}
]}).render({force:true});

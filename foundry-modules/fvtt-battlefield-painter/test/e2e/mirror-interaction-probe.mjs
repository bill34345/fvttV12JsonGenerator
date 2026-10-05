// Draft: import into the existing owned Macro, execute through native Foundry UI.
// This source makes no document, setting, permission, audio or movement writes.
// Optional Hooks subscriptions only observe movement in this client until disarmed/reload.
const SCOPE = "BP368-20261003";
const MODULE = "fvtt-battlefield-painter";
const OWNER = "01a1010c-9d38-7421-9098-596a96bc261a";
const MACRO_ID = "puIFWM0hN5bYj1BE";
const ACTOR_ID = "THbzE5Bx63iYwvev";
const SY_ID = "HF1ShlQokLfqMCJ6";
const SCENES = [
  { id: "n4GlkkCP76cM3DIx", key: "Square", gridType: CONST.GRID_TYPES.SQUARE, tokenId: "nc4CgB94DEnEQsQk" },
  { id: "oNceQnvSjVetnKOM", key: "HexRows", gridType: CONST.GRID_TYPES.HEXODDR },
  { id: "5oOy7j0CehbuT0t0", key: "HexCols", gridType: CONST.GRID_TYPES.HEXODDQ },
];
const OBSERVER_KEY = "__BP368_PHASE13_INPUT_OBSERVER__";
const macro = game.macros.get(MACRO_ID);
if (game.world?.id !== "cor-cotn" || game.system?.id !== "dnd5e"
    || game.system.version !== "5.3.3" || game.version !== "14.368"
    || location.hostname !== "127.0.0.1" || location.port !== "30001"
    || ![SY_ID, "FccwB5HfAhy1F49a"].includes(game.user?.id)
    || (!game.user.isGM && game.user.id !== SY_ID)
    || !macro || macro.getFlag(MODULE, "testScope") !== SCOPE
    || macro.getFlag(MODULE, "controllerThreadId") !== OWNER) {
  throw new Error("Phase11 requires the exact owned Macro, authorized Mirror and GM/SY account.");
}
const marked = (doc, kind) => doc?.flags?.[MODULE]?.testScope === SCOPE
  && doc?.flags?.[MODULE]?.controllerThreadId === OWNER
  && doc?.flags?.[MODULE]?.fixtureKind === kind;
const actor = game.actors.get(ACTOR_ID);
if (!marked(actor, "actor")) throw new Error("Exact synthetic Actor is absent or unmarked.");
const sceneRows = SCENES.map(item => ({ ...item, doc: game.scenes.get(item.id) ?? null }));
for (const row of sceneRows) {
  if (row.doc && (!marked(row.doc, "scene") || row.doc.grid?.type !== row.gridType
      || row.doc.flags?.[MODULE]?.gridCase !== row.key)) {
    throw new Error(`Fixture Scene ${row.id} no longer matches its scope/grid marker.`);
  }
  if (game.user.isGM && !row.doc) throw new Error(`GM cannot see fixture Scene ${row.id}.`);
}
const viewed = sceneRows.find(row => row.id === canvas.scene?.id);
if (!viewed || !viewed.doc) {
  throw new Error("The client must view one of the exact marked fixture Scenes.");
}
const tokenRows = sceneRows.filter(row => row.doc).map(row => {
  const matches = [...row.doc.tokens].filter(token => marked(token, "token") && token.actorId === actor.id);
  if (matches.length !== 1 || (row.tokenId && matches[0].id !== row.tokenId)) {
    throw new Error(`Fixture Token mismatch in ${row.id}.`);
  }
  return { sceneId: row.id, gridCase: row.key, token: matches[0] };
});
const ownToken = doc => tokenRows.some(row => row.token.id === doc?.id && row.sceneId === doc?.parent?.id);
const simple = value => {
  if (value === undefined || value === null) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
};
// BEGIN_GRID_MEASUREMENT_SERIALIZATION
// Core BaseGrid.measurePath links waypoint.forward/backward to segments and
// segment.from/to back to those waypoints. Project public metrics and indexes.
const measurementMetrics = value => Object.fromEntries(
  ["distance", "cost", "spaces", "diagonals", "euclidean"].map(key => {
    const scalar = value?.[key];
    return [key, typeof scalar === "number" && !Number.isFinite(scalar) ? String(scalar) : scalar ?? null];
  }));
const gridMeasurement = value => {
  if (!value || typeof value !== "object" || !Array.isArray(value.waypoints) || !Array.isArray(value.segments)) {
    throw new Error("Core movement measurement must provide waypoints, segments and public totals.");
  }
  const waypointIndexes = new Map(value.waypoints.map((waypoint, index) => [waypoint, index]));
  const segmentIndexes = new Map(value.segments.map((segment, index) => [segment, index]));
  return { ...measurementMetrics(value),
    waypoints: value.waypoints.map(waypoint => ({ ...measurementMetrics(waypoint),
      backwardSegment: segmentIndexes.get(waypoint.backward) ?? null,
      forwardSegment: segmentIndexes.get(waypoint.forward) ?? null })),
    segments: value.segments.map(segment => ({ ...measurementMetrics(segment),
      fromWaypoint: waypointIndexes.get(segment.from) ?? null,
      toWaypoint: waypointIndexes.get(segment.to) ?? null })),
  };
};
// END_GRID_MEASUREMENT_SERIALIZATION
const waypoints = section => ({
  distance: section?.distance ?? null, cost: section?.cost ?? null,
  spaces: section?.spaces ?? null, diagonals: section?.diagonals ?? null,
  waypoints: (section?.waypoints ?? []).map(point => ({
    x: point.x, y: point.y, elevation: point.elevation, level: point.level,
    action: point.action, cost: point.cost ?? null,
    terrainPresent: Boolean(point.terrain), intermediate: point.intermediate === true,
  })),
});
const movement = data => data ? ({
  id: data.id ?? null, state: data.state ?? null, method: data.method ?? null,
  userId: data.user?.id ?? null, origin: simple(data.origin), destination: simple(data.destination),
  constrained: data.constrained ?? null, recorded: data.recorded ?? null,
  passed: waypoints(data.passed), pending: waypoints(data.pending),
  history: data.history ? { distance: data.history.distance, cost: data.history.cost,
    recorded: waypoints(data.history.recorded), unrecorded: waypoints(data.history.unrecorded) } : null,
  finishedPromisePresent: typeof data.finished?.then === "function",
}) : null;
const currentToken = token => ({
  sceneId: token.parent?.id ?? null, id: token.id, actorId: token.actorId,
  source: { x: token.toObject().x, y: token.toObject().y,
    elevation: token.toObject().elevation, level: token.toObject().level,
    movementAction: token.toObject().movementAction ?? null },
  prepared: { x: token.x, y: token.y, elevation: token.elevation,
    movementAction: token.movementAction ?? null, isOwner: token.isOwner ?? null },
  movement: movement(token.movement),
});
const soundView = sound => sound ? ({
  id: sound.id ?? null, src: sound.src ?? null, playing: sound.playing ?? null,
  loaded: sound.loaded ?? null, duration: sound.duration ?? null,
  currentTime: sound.currentTime ?? null, volume: sound.volume ?? null,
  loop: sound.loop ?? null,
}) : null;
const observations = globalThis[OBSERVER_KEY];
const observer = observations?.scope === SCOPE && observations?.owner === OWNER
  ? observations : { scope: SCOPE, owner: OWNER, preHook: null, moveHook: null, events: [] };
globalThis[OBSERVER_KEY] = observer;

// Passive canvas input observation only. Public manager fields verified against
// exact Core14.368 client/canvas/interaction/mouse-handler.mjs.
const INPUT_TYPES=["pointerdown","pointermove","pointerup","pointercancel","mousedown","mousemove","mouseup"];
const inputPoint=value=>value?{x:value.x??null,y:value.y??null}:null;
const inputState=()=>{
  const row=tokenRows.find(row=>row.sceneId===canvas.scene?.id);
  const doc=row?.token,object=doc?.object,manager=object?.mouseInteractionManager;
  const center=object?.center,screen=center?canvas.stage?.worldTransform?.apply(center):null;
  const board=document.getElementById("board"),rect=board?.getBoundingClientRect();
  return {sceneId:canvas.scene?.id,tokenId:doc?.id,
    source:doc?{x:doc.toObject().x,y:doc.toObject().y}:null,
    controlled:object?.controlled??null,hover:object?.hover??null,
    controlledIds:(canvas.tokens?.controlled??[]).filter(t=>ownToken(t.document)).map(t=>t.id),
    activeLayer:canvas.activeLayer?.constructor?.name??null,
    activeTool:typeof ui.controls?.tool==="string"?ui.controls.tool:ui.controls?.tool?.name??null,
    worldCenter:inputPoint(center),canvasScreenCenter:inputPoint(screen),
    board:rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:null,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    manager:manager?{state:manager.state,isDragging:manager.isDragging,
      dragResistance:manager.options?.dragResistance??null,
      origin:inputPoint(manager.interactionData?.origin),
      destination:inputPoint(manager.interactionData?.destination)}:null};
};
const armInput=()=>{
  if(observer.inputHandler)return;
  const board=document.getElementById("board");if(!board)throw new Error("Owned canvas board absent");
  observer.inputEvents=[];observer.inputFrames=new Set();observer.inputBoard=board;
  observer.inputHandler=event=>{
    if(!observer.inputHandler||!sceneRows.some(row=>row.id===canvas.scene?.id))return;
    const entry={type:event.type,at:new Date().toISOString(),button:event.button,buttons:event.buttons,
      clientX:event.clientX,clientY:event.clientY,pointerType:event.pointerType??null,
      trusted:event.isTrusted,modifiers:{alt:event.altKey,ctrl:event.ctrlKey,shift:event.shiftKey,meta:event.metaKey},
      target:{tag:event.target?.tagName??null,id:event.target?.id??null},before:inputState(),after:null};
    observer.inputEvents.push(entry);observer.inputEvents=observer.inputEvents.slice(-128);
    const frame=requestAnimationFrame(()=>{observer.inputFrames.delete(frame);if(observer.inputHandler)entry.after=inputState();});
    observer.inputFrames.add(frame);
  };
  for(const type of INPUT_TYPES)board.addEventListener(type,observer.inputHandler,{capture:true,passive:true});
};
const disarmInput=()=>{
  if(observer.inputHandler)for(const type of INPUT_TYPES)observer.inputBoard?.removeEventListener(type,observer.inputHandler,true);
  for(const frame of observer.inputFrames??[])cancelAnimationFrame(frame);
  observer.inputFrames?.clear();observer.inputHandler=null;observer.inputBoard=null;
};

const recordableToken = doc => ownToken(doc);
const arm = () => {
  armInput();
  if (observer.preHook !== null || observer.moveHook !== null) return;
  observer.preHook = Hooks.on("preMoveToken", (doc, move, options) => {
    if (!recordableToken(doc)) return;
    observer.events.push({ kind: "preMoveToken", seenAt: new Date().toISOString(), tokenId: doc.id,
      sceneId: doc.parent?.id, method: move?.method ?? options?.method ?? null,
      requested: { origin: simple(move?.origin), destination: simple(move?.destination),
        waypoints: simple(move?.waypoints) } });
    observer.events = observer.events.slice(-40);
  });
  observer.moveHook = Hooks.on("moveToken", (doc, move, _operation, user) => {
    if (!recordableToken(doc)) return;
    const entry = { kind: "moveToken", seenAt: new Date().toISOString(), tokenId: doc.id,
      sceneId: doc.parent?.id, movingUserId: user?.id ?? null,
      movement: movement(move), finishedResult: "PENDING" };
    observer.events.push(entry);
    observer.events = observer.events.slice(-40);
    if (typeof move?.finished?.then === "function") {
      void move.finished.then(result => {
        entry.finishedResult = result === true;
        entry.completedMovement = movement(move);
        entry.after = currentToken(doc);
      }, error => { entry.finishedResult = `ERROR: ${String(error)}`; });
    }
  });
};
const disarm = () => {
  disarmInput();
  if (observer.preHook !== null) Hooks.off("preMoveToken", observer.preHook);
  if (observer.moveHook !== null) Hooks.off("moveToken", observer.moveHook);
  observer.preHook = null;
  observer.moveHook = null;
};
const materialAudits = () => {
  const api = game.modules.get(MODULE)?.api;
  const result = {};
  for (const name of ["auditScene", "auditEffects", "auditFrostEffects", "auditBrambleEffects",
    "auditAcidMotion", "auditSpiderwebSheet", "auditTerrainSheets", "auditFloodingMotion", "auditLavaMotion"]) {
    try { result[name] = typeof api?.[name] === "function" ? simple(api[name]()) : { unavailable: true }; }
    catch (error) { result[name] = { error: String(error) }; }
  }
  return result;
};
const report = (action, detail = {}) => {
  const currentScene = sceneRows.find(row => row.id === canvas.scene?.id)?.doc ?? null;
  if (!currentScene || !marked(currentScene, "scene")) throw new Error("Readback requires the current marked fixture Scene.");
  const sceneSoundPaths = new Set([...currentScene?.sounds ?? []].map(doc => doc.path).filter(Boolean));
  const sy = game.users.get(SY_ID);
  const panel = foundry.applications.instances.get("fvtt-battlefield-painter-controls");
  return {
    scope: SCOPE, action, observedAt: new Date().toISOString(),
    identity: { core: game.version, system: `${game.system.id}@${game.system.version}`,
      world: game.world.id, userId: game.user.id, isGM: game.user.isGM,
      activeSceneId: game.scenes.active?.id ?? null, viewedSceneId: canvas.scene?.id ?? null,
      canvasReady: canvas.ready === true },
    painter: { state: simple(game.modules.get(MODULE)?.api?.getState?.()),
      window: panel ? { id: panel.id, rendered: panel.rendered, minimized: panel.minimized,
        className: panel.element?.className ?? null } : null },
    clock: { worldTime: game.time.worldTime, paused: game.paused,
      combat: game.combat ? { id: game.combat.id, started: game.combat.started } : null,
      calendaria: Object.fromEntries(["syncClockPause", "clockLocked", "timeSpeedMultiplier",
        "timeSpeedIncrement", "clockRunDuringCombat"].filter(key => game.settings.settings.has(`calendaria.${key}`))
        .map(key => [key, game.settings.get("calendaria", key)])) },
    permissions: { currentMacroCanExecute: macro.canExecute,
      macroOwnership: simple(macro.ownership),
      syCanExecuteThisMacro: sy ? macro.canUserExecute(sy) : null,
      syHasMacroScriptPermission: sy?.hasPermission?.("MACRO_SCRIPT") ?? null,
      currentHasMacroScriptPermission: game.user.hasPermission?.("MACRO_SCRIPT") ?? null,
      currentActorOwner: actor.isOwner ?? null,
      currentCanSeeScene: Boolean(currentScene) },
    fixtures: { expectedSceneIds: SCENES.map(item => item.id),
      availableScenes: sceneRows.map(row => ({ id: row.id, gridCase: row.key,
        available: Boolean(row.doc), marked: row.doc ? marked(row.doc, "scene") : null })),
      actorId:actor.id, actorSourceAttributes:{hp:simple(actor.toObject().system?.attributes?.hp),movement:simple(actor.toObject().system?.attributes?.movement)},
      actorPreparedAttributes:{hp:simple(actor.system?.attributes?.hp),movement:simple(actor.system?.attributes?.movement)},
      tokens: tokenRows.map(row => currentToken(row.token)) },
    observer: { armed: observer.preHook !== null && observer.moveHook !== null,
      clientOnly: true, events: simple(observer.events) },
    interaction: {snapshot:inputState(), inputEvents:simple(observer.inputEvents??[])},
    sounds: { audioLocked: game.audio?.locked ?? null,
      listeners: simple(canvas.sounds?.getListenerPositions?.() ?? []),
      sourceCount: canvas.sounds?.sources?.size ?? null,
      documents: [...currentScene?.sounds ?? []].map(doc => ({
        id: doc.id, path: doc.path, x: doc.x, y: doc.y, radius: doc.radius,
        documentVolume: doc.volume, repeat: doc.repeat, easing: doc.easing,
        painterFlag: simple(doc.flags?.[MODULE] ?? null),
        originalFlag: simple(doc.flags?.["tile-arsenal"] ?? null),
        placeableSound: soundView(doc.object?.sound),
      })),
      playingForScenePaths: [...(game.audio?.playing?.values?.() ?? [])]
        .filter(sound => sceneSoundPaths.has(sound.src)).map(soundView),
    },
    materials: { audits: materialAudits(),
      sceneTiles: [...currentScene?.tiles ?? []].map(doc => ({ id: doc.id,
        path: doc.texture?.src ?? null, painterFlag: simple(doc.flags?.[MODULE] ?? null),
        originalFlag: simple(doc.flags?.["tile-arsenal"] ?? null),
        renderable: doc.object?.mesh?.renderable ?? null,
        meshTextureValid: doc.object?.mesh?.texture?.valid ?? null,
        materialClass: doc.object?.mesh?.material?.constructor?.name ?? null,
      })) },
    boundary: "API/document/audio state only; native UI drag, visuals and audible playback need separate evidence.",
    ...detail,
  };
};
const show = async (action, detail = {}) => {
  const json = JSON.stringify(report(action, detail), null, 2);
  const escaped = json.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  await new foundry.applications.api.DialogV2({
    window: { title: `BP368 Phase13 input ${action}` }, position: { width: 850, height: 670 },
    content: `<p>Complete client-side, read-only receipt. Read this textarea through official Chrome DOM.</p><textarea id="bp368-phase11-receipt" readonly style="width:100%;height:500px">${escaped}</textarea>`,
    buttons: [{ action: "close", label: "Close" }],
  }).render({ force: true });
};
const measure = async () => {
  await new foundry.applications.api.DialogV2({
    window: { title: "BP368 read-only Core path calculation" }, position: { width: 600 },
    content: `<p>Grid offsets use i=row, j=column. Calculation does not move the Token.</p>
      <label>From row <input name="fromI" type="number" value="8"></label>
      <label>From column <input name="fromJ" type="number" value="18"></label>
      <label>To row <input name="toI" type="number" value="9"></label>
      <label>To column <input name="toJ" type="number" value="18"></label>`,
    buttons: [{ action: "measure", label: "Calculate without moving", callback: async (_event, _button, dialog) => {
      const values = Object.fromEntries(["fromI", "fromJ", "toI", "toJ"].map(name =>
        [name, Number(dialog.element.querySelector(`[name="${name}"]`).value)]));
      if (!Object.values(values).every(value => Number.isInteger(value) && value >= 0 && value <= 100)) {
        throw new Error("Use integer grid offsets in the fixture range 0–100.");
      }
      const scene = sceneRows.find(row => row.id === canvas.scene?.id)?.doc;
      if (!scene || !marked(scene, "scene")) throw new Error("Calculate only in the viewed marked Scene.");
      const doc = tokenRows.find(row => row.sceneId === scene.id)?.token;
      const token = doc?.object;
      if (!token) throw new Error("The exact fixture Token must have a canvas placeable.");
      const source = doc.toObject();
      const from = { i: values.fromI, j: values.fromJ };
      const to = { i: values.toI, j: values.toJ };
      const position = offset => ({ ...source, ...doc.getSnappedPosition(scene.grid.getTopLeftPoint(offset)) });
      const origin = position(from), destination = position(to);
      const calculations = {};
      for (const action of ["walk", "fly"]) {
        const path = token.createTerrainMovementPath([{ ...origin, action }, { ...destination, action }]);
        calculations[action] = { path: simple(path), measured: gridMeasurement(token.measureMovementPath(path)) };
      }
      const centerFrom = doc.getMovementOrigin(origin), centerTo = doc.getMovementOrigin(destination);
      const collision = Object.fromEntries(["move", "sight"].map(type =>
        [type, token.checkCollision(centerTo, { origin: centerFrom, type, mode: "any" })]));
      await show("calculated-path", { calculatedOnly: { from, to,
        positions: { origin: { x: origin.x, y: origin.y }, destination: { x: destination.x, y: destination.y } },
        calculations, collision, tokenSourceUnchanged: doc.x === source.x && doc.y === source.y } });
    } }, { action: "close", label: "Close" }],
  }).render({ force: true });
};
await new foundry.applications.api.DialogV2({
  window: { title: "BP368 Phase13 input read-only observer" }, position: { width: 580 },
  content: `<p>Arm before a native mouse drag. Inspect after it; disarm before leaving. No API movement is invoked.</p>`,
  buttons: [
    { action: "inspect", label: "Inspect", callback: () => show("inspect") },
    { action: "measure", label: "Measure Core path (read-only)", callback: measure },
    { action: "arm", label: "Arm local hooks", callback: async () => { arm(); await show("armed"); } },
    { action: "disarm", label: "Disarm local hooks", callback: async () => { disarm(); await show("disarmed"); } },
    { action: "close", label: "Close" },
  ],
}).render({ force: true });

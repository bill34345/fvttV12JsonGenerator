// Import into the existing BP368-20261003-PREFLIGHT Script Macro, then use Execute Macro.
// All mutations below are limited to new, marked test fixtures in cor-cotn.
const SCOPE = "BP368-20261003";
const MODULE = "fvtt-battlefield-painter";
const MACRO_ID = "puIFWM0hN5bYj1BE";
const SOURCE_SCENE_ID = "9hf5fBoXZL71RKcW";
const OWNER_THREAD = "01a1010c-9d38-7421-9098-596a96bc261a";
const PLAYER_ID = "HF1ShlQokLfqMCJ6"; // SY, a pre-existing player; only fixture Actor ownership is changed.
const GRID_CASES = [
  { key: "Square", type: CONST.GRID_TYPES.SQUARE },
  { key: "HexRows", type: CONST.GRID_TYPES.HEXODDR },
  { key: "HexCols", type: CONST.GRID_TYPES.HEXODDQ },
];
const macro = game.macros.get(MACRO_ID);
if (!game.user?.isGM || game.world?.id !== "cor-cotn" || game.system?.id !== "dnd5e"
    || game.system.version !== "5.3.3" || game.version !== "14.368"
    || location.hostname !== "127.0.0.1" || location.port !== "30001"
    || !macro || macro.getFlag(MODULE, "testScope") !== SCOPE
    || macro.getFlag(MODULE, "controllerThreadId") !== OWNER_THREAD) {
  throw new Error("BP368 fixture tool requires the exact Mirror target, GM, and owned Macro.");
}
const ownedFlag = (kind, extra = {}) => ({ testScope: SCOPE, controllerThreadId: OWNER_THREAD, fixtureKind: kind, ...extra });
const marker = doc => doc?.flags?.[MODULE];
const isOwned = (doc, kind) => marker(doc)?.testScope === SCOPE
  && marker(doc)?.controllerThreadId === OWNER_THREAD && marker(doc)?.fixtureKind === kind;
const stableValue = value => Array.isArray(value) ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
    : value;
const same = (a, b) => JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
// Foundry flag updates expand dotted keys into namespace objects. Preserve each setting value intact.
function normalizeBaselineSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Captured settings are malformed.");
  const result = {};
  const add = (key, value) => {
    if (Object.hasOwn(result, key)) throw new Error(`Captured setting appears twice: ${key}`);
    result[key] = value;
  };
  for (const [key, value] of Object.entries(settings)) {
    if (["core", "tile-arsenal", MODULE].includes(key)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Captured namespace is malformed: ${key}`);
      for (const [setting, storedValue] of Object.entries(value)) add(`${key}.${setting}`, storedValue);
    } else add(key, value);
  }
  return result;
}
// END_BASELINE_SETTING_NORMALIZATION
const ownedScenes = () => game.scenes.filter(scene => isOwned(scene, "scene"));
const ownedActors = () => game.actors.filter(actor => isOwned(actor, "actor"));
const sourceScene = () => {
  const usable = scene => !isOwned(scene, "scene") && scene.width >= 1800 && scene.height >= 1200
    && Boolean(scene.initialLevel?.background?.src);
  const preferred = game.scenes.get(SOURCE_SCENE_ID);
  if (preferred && usable(preferred)) return preferred;
  return game.scenes.filter(usable).sort((a, b) =>
    Number(b.grid.type === CONST.GRID_TYPES.SQUARE) - Number(a.grid.type === CONST.GRID_TYPES.SQUARE)
    || a.id.localeCompare(b.id))[0] ?? null;
};
const collections = ["tiles", "regions", "tokens", "walls", "lights", "sounds", "drawings", "notes"];
const embedded = scene => Object.fromEntries(collections.map(key => [key, [...(scene[key] ?? [])].map(doc => ({
  id: doc.id, name: doc.name ?? null, flags: doc.flags?.[MODULE] ?? null,
  originalFlags: doc.flags?.["tile-arsenal"] ?? null,
  ...(key === "tiles" ? { src: doc.texture?.src, x: doc.x, y: doc.y, width: doc.width, height: doc.height } : {}),
  ...(key === "regions" ? { shapes: doc.shapes?.map(shape => shape.toObject?.() ?? shape) ?? [], behaviors: doc.behaviors?.map(behavior => behavior.toObject?.() ?? behavior) ?? [] } : {}),
  ...(key === "sounds" ? { path: doc.path, x: doc.x, y: doc.y, radius: doc.radius, volume: doc.volume,
    repeat: doc.repeat, easing: doc.easing, walls: doc.walls, hidden: doc.hidden,
    placeableAvailable: Boolean(doc.object), isAudible: doc.object?.isAudible ?? null,
    sourceActive: doc.object?.source?.active ?? null,
    playback: doc.object?.sound ? { id: doc.object.sound.id ?? null, playing: doc.object.sound.playing, loaded: doc.object.sound.loaded,
      duration: doc.object.sound.duration, currentTime: doc.object.sound.currentTime,
      volume: doc.object.sound.volume, loop: doc.object.sound.loop } : null } : {}),
  ...(key === "lights" ? { x: doc.x, y: doc.y, config: doc.config?.toObject?.() ?? doc.config } : {}),
  ...(key === "walls" ? { c: doc.c, move: doc.move, sight: doc.sight, light: doc.light } : {}),
  ...(key === "tokens" ? { actorId: doc.actorId, x: doc.x, y: doc.y, width: doc.width,
    height: doc.height, sight: doc.sight?.toObject?.() ?? doc.sight } : {}),
}))]));
const watchedSettings = () => Object.fromEntries([...game.settings.settings.keys()]
  .filter(key => key.startsWith(`${MODULE}.`) || key.startsWith("tile-arsenal.")
    || ["core.globalAmbientVolume", "core.globalPlaylistVolume", "core.globalInterfaceVolume"].includes(key))
  .sort().map(key => { const [namespace, setting] = key.split(".", 2); return [key, game.settings.get(namespace, setting)]; }));
const worldState = () => ({
  activeSceneId: game.scenes.active?.id ?? null,
  viewedSceneId: canvas.scene?.id ?? null,
  paused: game.paused,
  worldTime: game.time.worldTime,
  viewport: { x: canvas.stage?.pivot?.x, y: canvas.stage?.pivot?.y, scale: canvas.stage?.scale?.x },
  controlledTokenIds: (canvas.tokens?.controlled ?? []).map(token => token.id).sort(),
  targetTokenIds: [...game.user.targets].map(token => token.id).sort(),
  savedModuleConfiguration: game.settings.get("core", "moduleConfiguration"),
  watchedSettings: watchedSettings(),
});
const baselineOf = () => {
  const fromMacro = macro.getFlag(MODULE, "harnessBaseline");
  const normalize = value => ({ ...value, watchedSettings: normalizeBaselineSettings(value.watchedSettings) });
  if (fromMacro) return normalize(fromMacro);
  const fromFixtures = [...ownedScenes(), ...ownedActors()].map(doc => marker(doc)?.harnessBaseline).filter(Boolean).map(normalize);
  if (fromFixtures.length && fromFixtures.every(value => same(value, fromFixtures[0]))) return fromFixtures[0];
  return null;
};
const receipt = (action, detail = {}) => ({
  scope: SCOPE, action, observedAt: new Date().toISOString(), core: game.version,
  system: game.system.version, world: game.world.id, macroId: macro.id,
  user: { id: game.user.id, name: game.user.name, isGM: game.user.isGM },
  activeUsers: game.users.filter(user => user.active).map(user => ({ id: user.id, name: user.name, isGM: user.isGM })),
  baseline: baselineOf(), current: worldState(),
  modules: [...game.modules.values()].map(module => ({ id: module.id, version: module.version, active: module.active })),
  sourceScene: (() => { const source = sourceScene(); return source ? {
    id: source.id, name: source.name, gridType: source.grid.type, width: source.width,
    height: source.height, background: source.initialLevel?.background?.src ?? null,
  } : null; })(),
  fixtures: {
    actors: ownedActors().map(actor => ({ id: actor.id, name: actor.name, type: actor.type, ownership: actor.ownership,
      sourceAttributes: actor.toObject().system?.attributes,
      preparedHp: actor.system?.attributes?.hp, preparedMovement: actor.system?.attributes?.movement,
      effectIds: actor.effects.map(effect => effect.id), itemIds: actor.items.map(item => item.id) })),
    scenes: ownedScenes().map(scene => ({ id: scene.id, name: scene.name, gridType: scene.grid.type,
      width: scene.width, height: scene.height, gridSize: scene.grid.size, gridDistance: scene.grid.distance,
      background: scene.initialLevel?.background?.src ?? null, embedded: embedded(scene) })),
  },
  canvas: { sceneId: canvas.scene?.id ?? null, levelId: canvas.level?.id ?? null,
    audio: { locked: game.audio?.locked, environmentState: game.audio?.environment?.state,
      sourceCount: canvas.sounds?.sources?.size, livePreview: canvas.sounds?.livePreview,
      playingPainterSounds: [...(game.audio?.playing?.values?.() ?? [])]
        .filter(sound => String(sound.src).includes(`modules/${MODULE}/assets/audio/`))
        .map(sound => ({ id: sound.id, src: sound.src, playing: sound.playing, loaded: sound.loaded,
          duration: sound.duration, currentTime: sound.currentTime, volume: sound.volume, loop: sound.loop })),
      listeners: canvas.sounds?.getListenerPositions?.() ?? [] },
    stageTransform: canvas.stage ? Object.fromEntries(["a", "b", "c", "d", "tx", "ty"]
      .map(key => [key, canvas.stage.worldTransform[key]])) : null },
  ...detail,
});
const show = async (action, detail = {}) => {
  const report = receipt(action, detail);
  report.servedScripts = {};
  for (const [id, path] of [[MODULE, `modules/${MODULE}/scripts/main.js`], ["tile-arsenal", "modules/tile-arsenal/dist/index.js"]]) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to read served ${id} script: ${response.status}`);
      report.servedScripts[id] = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer())))
        .map(byte => byte.toString(16).padStart(2, "0")).join("");
    } catch (error) { report.servedScripts[id] = { error: String(error?.message ?? error) }; }
  }
  const painterApi = game.modules.get(MODULE)?.api;
  report.painterAudits = {};
  for (const method of ["getState", "auditScene", "auditEffects", "auditFrostEffects", "auditBrambleEffects",
    "auditAcidMotion", "auditSpiderwebSheet", "auditTerrainSheets"]) {
    if (typeof painterApi?.[method] !== "function") continue;
    try { report.painterAudits[method] = await painterApi[method](); }
    catch (error) { report.painterAudits[method] = { error: String(error?.message ?? error) }; }
  }
  const json = JSON.stringify(report, null, 2);
  const escaped = json.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  await new foundry.applications.api.DialogV2({
    window: { title: `BP368 ${action} receipt` }, position: { width: 840, height: 670 },
    content: `<p>Read the complete textarea through the official Chrome DOM. UI and audio acceptance need separate evidence.</p><textarea id="bp368-fixture-receipt" readonly style="width:100%;height:500px">${escaped}</textarea>`,
    buttons: [
      { action: "export", label: "Export JSON", callback: () => saveDataToFile(json, "application/json", `BP368-${action}.json`) },
      { action: "close", label: "Close" },
    ],
  }).render({ force: true });
};
const prepare = async () => {
  if (ownedScenes().length || ownedActors().length || baselineOf()) throw new Error("Fixtures or baseline already exist; inspect and clean them first.");
  if (game.users.some(user => user.active && user.id !== game.user.id)) throw new Error("Another user is active; wait before creating fixtures.");
  const source = sourceScene();
  const sourceData = source?.toObject();
  const level = sourceData?.levels?.find(item => item._id === sourceData.initialLevel) ?? sourceData?.levels?.[0];
  if (!source || !level?.background?.src || source.width < 1800 || source.height < 1200) {
    throw new Error("An existing source map with usable initial background Level and required canvas size is absent.");
  }
  if (!game.users.get(PLAYER_ID) || !game.modules.get("tile-arsenal")?.active || !game.modules.get(MODULE)?.active) {
    throw new Error("SY player or the two active painter modules are absent.");
  }
  const baseline = worldState();
  await macro.setFlag(MODULE, "harnessBaseline", baseline);
  const levelData = foundry.utils.deepClone(level);
  delete levelData.flags;
  const common = {
    width: sourceData.width, height: sourceData.height, padding: sourceData.padding,
    shiftX: sourceData.shiftX, shiftY: sourceData.shiftY, initial: foundry.utils.deepClone(sourceData.initial),
    grid: foundry.utils.deepClone(sourceData.grid), levels: [levelData], initialLevel: levelData._id,
    tokenVision: sourceData.tokenVision, fog: foundry.utils.deepClone(sourceData.fog),
    environment: foundry.utils.deepClone(sourceData.environment),
    navigation: false, active: false, ownership: { default: 0 },
  };
  const actor = await Actor.create({ name: `${SCOPE} synthetic movement actor`, type: "character",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30, units: "ft" } } },
    ownership: { default: 0, [PLAYER_ID]: 3 }, flags: { [MODULE]: ownedFlag("actor", { harnessBaseline: baseline }) } });
  if (!actor || !isOwned(actor, "actor")) throw new Error("Synthetic Actor creation did not return the owned document.");
  for (const gridCase of GRID_CASES) {
    const scene = await Scene.create({ ...common, name: `${SCOPE} ${gridCase.key}`,
      grid: { ...common.grid, type: gridCase.type },
      flags: { [MODULE]: ownedFlag("scene", { gridCase: gridCase.key, sourceSceneId: source.id, harnessBaseline: baseline }) },
    });
    if (!scene || !isOwned(scene, "scene")) throw new Error(`Scene creation failed at ${gridCase.key}`);
    const size = scene.grid.size;
    const cx = Math.round((scene.width / 3) / size) * size;
    const cy = Math.round((scene.height / 2) / size) * size;
    const outer = [cx - 3 * size, cy - 3 * size, cx + 3 * size, cy - 3 * size,
      cx + 3 * size, cy + 3 * size, cx - 3 * size, cy + 3 * size];
    const inner = [cx - size, cy - size, cx + size, cy - size,
      cx + size, cy + size, cx - size, cy + size];
    const [region] = await scene.createEmbeddedDocuments("Region", [{ name: `${SCOPE} ${gridCase.key} hole selection`,
      shapes: [{ type: "polygon", points: outer, hole: false }, { type: "polygon", points: inner, hole: true }],
      flags: { [MODULE]: ownedFlag("region") },
    }]);
    if (!region || !isOwned(region, "region")) throw new Error("Region creation did not return the owned document.");
    const [sentinel] = await scene.createEmbeddedDocuments("Tile", [{ name: `${SCOPE} foreign sentinel`,
      x: 2 * size, y: 2 * size, width: size, height: size, texture: { src: "icons/svg/hazard.svg" },
      flags: { [MODULE]: ownedFlag("sentinel-tile") },
    }]);
    if (!sentinel || !isOwned(sentinel, "sentinel-tile")) throw new Error("Sentinel Tile creation did not return the owned document.");
    await scene.setFlag(MODULE, "sentinelExpected", {
      id: sentinel.id, x: sentinel.x, y: sentinel.y, width: sentinel.width,
      height: sentinel.height, src: sentinel.texture?.src,
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: `${SCOPE} movement token`,
      actorId: actor.id, actorLink: true, x: 3 * size, y: 3 * size,
      texture: { src: "icons/svg/mystery-man.svg" }, sight: { enabled: true, range: 60, visionMode: "basic" },
      flags: { [MODULE]: ownedFlag("token") },
    }]);
    if (!token || !isOwned(token, "token")) throw new Error("Token creation did not return the owned document.");
  }
  await show("prepared", { note: "Use native UI for view, painting, history, Region selection, player access and audio." });
};
const cleanup = async () => {
  const baseline = baselineOf();
  if (!baseline) throw new Error("No durable baseline; refuse deletion.");
  if (game.users.some(user => user.active && user.id !== game.user.id)) throw new Error("Another user remains active; refuse deletion.");
  const scenes = ownedScenes();
  const actors = ownedActors();
  if (scenes.length > GRID_CASES.length || actors.length > 1
      || new Set(scenes.map(scene => marker(scene).gridCase)).size !== scenes.length
      || scenes.some(scene => !GRID_CASES.some(item => item.key === marker(scene).gridCase))) {
    throw new Error("Fixture cardinality or grid markers differ; inspect before cleanup.");
  }
  if (actors.some(actor => actor.items.size || actor.effects.size)) {
    throw new Error("Synthetic Actor still has Item/ActiveEffect children; inspect and reset own probe first.");
  }
  const sentinelsChanged = scenes.filter(scene => {
    const expected = marker(scene).sentinelExpected;
    const sentinel = scene.tiles.get(expected?.id);
    if (!expected) return scene.tiles.some(tile => isOwned(tile, "sentinel-tile"));
    return !sentinel || !isOwned(sentinel, "sentinel-tile")
      || ["x", "y", "width", "height"].some(key => sentinel[key] !== expected[key])
      || sentinel.texture?.src !== expected.src;
  }).map(scene => scene.id);
  if (sentinelsChanged.length) { await show("cleanup-blocked", { reason: "Sentinel changed unexpectedly.", sentinelsChanged }); return; }
  const foreign = scenes.flatMap(scene => collections.flatMap(key => [...(scene[key] ?? [])]
    .filter(doc => !isOwned(doc, key === "tiles" ? "sentinel-tile" : key === "regions" ? "region" : key === "tokens" ? "token" : "never"))
    .map(doc => ({ sceneId: scene.id, collection: key, id: doc.id }))));
  if (foreign.length) { await show("cleanup-blocked", { reason: "Unmarked documents remain; erase by native painter UI and inspect.", foreign }); return; }
  const now = worldState();
  const restoreKeys = ["activeSceneId", "viewedSceneId", "paused", "worldTime", "viewport", "controlledTokenIds", "targetTokenIds", "savedModuleConfiguration", "watchedSettings"];
  const matches = key => key === "viewport"
    ? ["x", "y", "scale"].every(axis => Math.abs(now.viewport[axis] - baseline.viewport[axis]) < 0.01)
    : same(now[key], baseline[key]);
  const differences = restoreKeys.filter(key => !matches(key));
  if (differences.length) { await show("cleanup-blocked", { reason: "Restore view, activity, pause, time, camera, targets and settings through native UI first.", differences }); return; }
  const deleted = { scenes: scenes.map(scene => scene.id), actors: actors.map(actor => actor.id) };
  await Scene.deleteDocuments(deleted.scenes);
  await Actor.deleteDocuments(deleted.actors);
  if (ownedScenes().length || ownedActors().length) throw new Error("Owned fixtures remain after deleteDocuments.");
  await macro.unsetFlag(MODULE, "harnessBaseline");
  const finalState = worldState();
  await show("cleaned", { deleted, matchesBaseline: restoreKeys.every(key => key === "viewport"
    ? ["x", "y", "scale"].every(axis => Math.abs(finalState.viewport[axis] - baseline.viewport[axis]) < 0.01)
    : same(finalState[key], baseline[key])) });
};
const restore = async () => {
  const baseline = baselineOf();
  if (!baseline || game.users.some(user => user.active && user.id !== game.user.id)) {
    throw new Error("Restoration requires a durable baseline and no other active user.");
  }
  if (!same(worldState().savedModuleConfiguration, baseline.savedModuleConfiguration)) {
    throw new Error("Saved module switches changed; inspect instead of silently replacing them.");
  }
  for (const [key, value] of Object.entries(baseline.watchedSettings)) {
    if (!game.settings.settings.has(key)) throw new Error(`Captured setting is no longer registered: ${key}`);
    const [namespace, setting] = key.split(".", 2);
    if (!same(game.settings.get(namespace, setting), value)) await game.settings.set(namespace, setting, value);
  }
  const active = game.scenes.get(baseline.activeSceneId);
  const viewed = game.scenes.get(baseline.viewedSceneId);
  if (!active || !viewed) throw new Error("Captured active/viewed Scene is absent; refuse restoration.");
  if (game.scenes.active?.id !== active.id) await active.activate();
  if (canvas.scene?.id !== viewed.id) await viewed.view();
  if (canvas.scene?.id !== viewed.id || canvas.loading) throw new Error("Captured view did not finish loading.");
  canvas.tokens?.releaseAll();
  for (const id of baseline.controlledTokenIds) {
    const token = canvas.tokens?.get(id);
    if (!token) throw new Error(`Captured controlled Token is absent: ${id}`);
    token.control({ releaseOthers: false });
  }
  const currentTargets = [...game.user.targets].map(token => token.id).sort();
  if (!same(currentTargets, baseline.targetTokenIds)) {
    for (const token of [...game.user.targets]) token.setTarget(false, { releaseOthers: false });
    for (const id of baseline.targetTokenIds) {
      const token = canvas.tokens?.get(id);
      if (!token) throw new Error(`Captured targeted Token is absent: ${id}`);
      token.setTarget(true, { releaseOthers: false });
    }
  }
  if (game.time.worldTime !== baseline.worldTime) await game.time.advance(baseline.worldTime - game.time.worldTime);
  if (game.paused !== baseline.paused) game.togglePause(baseline.paused, { broadcast: true });
  canvas.pan(baseline.viewport);
  await show("restored", { note: "Only captured test settings, active/viewed Scene, time, pause, camera and selection restored. Recheck after reload before cleanup." });
};
const run = async action => {
  try {
    if (action === "prepare") await prepare();
    else if (action === "cleanup") await cleanup();
    else if (action === "restore") await restore();
    else await show("inspect");
  } catch (error) {
    await show(`${action}-error`, { error: String(error?.stack ?? error) });
  }
};
await new foundry.applications.api.DialogV2({
  window: { title: "BP368 fixture tool" }, position: { width: 560 },
  content: `<p>Scope ${SCOPE}. Prepare once, inspect after each UI action/reload, and clean once after UI restoration.</p>`,
  buttons: [
    { action: "inspect", label: "Inspect", callback: () => run("inspect") },
    { action: "prepare", label: "Prepare fixtures", callback: () => run("prepare") },
    { action: "restore", label: "Restore captured baseline", callback: () => run("restore") },
    { action: "cleanup", label: "Clean owned fixtures", callback: () => run("cleanup") },
    { action: "close", label: "Close" },
  ],
}).render({ force: true });

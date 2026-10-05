// Import this source as a task-owned Foundry Script Macro through the normal UI.
// It reads the live application and displays a receipt; it does not change gameplay state.
const scope = "BP368-20261003";
if (!game.user?.isGM || game.world?.id !== "cor-cotn" || game.system?.id !== "dnd5e"
    || game.system.version !== "5.3.3" || !["14.364", "14.368"].includes(game.version)
    || location.hostname !== "127.0.0.1" || location.port !== "30001") {
  throw new Error("Painter preflight requires the exact authorized Mirror target and GM.");
}
const modules = [...game.modules.values()].map(module => ({
  id: module.id, version: module.version, active: module.active, compatibility: module.compatibility,
})).sort((a, b) => a.id.localeCompare(b.id));
const stableValue = value => Array.isArray(value) ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stableValue(value[key])]))
    : value;
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(stableValue(value)))))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const documentHashes = {};
for (const [kind, collection] of [["Actor", game.actors], ["Item", game.items], ["Scene", game.scenes], ["Macro", game.macros]]) {
  documentHashes[kind] = await Promise.all(collection
    .filter(document => !(kind === "Macro" && document.flags?.["fvtt-battlefield-painter"]?.testScope === scope))
    .map(async document => ({ id: document.id, sha256: await digest(document.toObject()) })));
  documentHashes[kind].sort((a, b) => a.id.localeCompare(b.id));
}
const data = {
  scope, observedAt: new Date().toISOString(), core: game.version,
  system: { id: game.system.id, version: game.system.version }, world: game.world.id,
  user: { id: game.user.id, name: game.user.name, role: game.user.role, isGM: game.user.isGM },
  users: [...game.users].map(user => ({ id: user.id, name: user.name, role: user.role, active: user.active })),
  modules, savedModuleConfiguration: game.settings.get("core", "moduleConfiguration"),
  documentHashes,
  strict364MacroGates: game.macros.filter(macro => /(?:game|env\.game)\.version\s*!==\s*["']14\.364["']/.test(macro.command))
    .map(macro => ({ id: macro.id, name: macro.name, forgeFlags: macro.flags?.["fvtt-json-forge"] ?? null })),
  restoration: {
    paused: game.paused, activeScene: game.scenes.active?.id ?? null,
    worldTime: game.time.worldTime,
    viewport: { x: canvas.stage?.pivot?.x, y: canvas.stage?.pivot?.y, scale: canvas.stage?.scale?.x },
    viewedScene: canvas.scene?.id ?? null,
    controlledTokens: (canvas.tokens?.controlled ?? []).map(token => token.id),
    targets: [...game.user.targets].map(token => token.id),
    sceneIds: game.scenes.map(scene => scene.id).sort(),
    actorIds: game.actors.map(actor => actor.id).sort(),
    itemIds: game.items.map(item => item.id).sort(),
    // This preflight Macro is the only task-owned object introduced by this phase.
    foreignMacroIds: game.macros.filter(macro => !macro.name.startsWith(scope)).map(macro => macro.id).sort(),
  },
  loadedModuleResources: performance.getEntriesByType("resource")
    .map(entry => new URL(entry.name, location.href))
    .filter(url => url.origin === location.origin && url.pathname.includes("/modules/"))
    .map(url => url.pathname),
};
const json = JSON.stringify(data, null, 2);
const escaped = json.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
await new foundry.applications.api.DialogV2({
  window: { title: "BP368 Mirror Preflight Receipt" },
  position: { width: 760, height: 640 },
  content: `<p>Live application receipt. Export or read the complete JSON.</p><textarea id="bp368-preflight-receipt" readonly style="width:100%;height:470px">${escaped}</textarea>`,
  buttons: [
    { action: "export", label: "Export receipt JSON", callback: () => saveDataToFile(json, "application/json", "BP368-preflight-live.json") },
    { action: "close", label: "Close" },
  ],
}).render({ force: true });

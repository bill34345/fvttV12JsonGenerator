const scope = "BP368-20261003";
if (!game.user?.isGM || game.world?.id !== "cor-cotn" || game.version !== "14.368"
    || game.system?.id !== "dnd5e" || game.system.version !== "5.3.3"
    || location.hostname !== "127.0.0.1" || location.port !== "30001") {
  throw new Error("Restore requires the exact authorized upgraded Mirror and GM.");
}
const keys = ["fvtt-selected-token-sync", "fvtt-blood-hunter-2024", "dnd5e_classpack", "fvtt-session-monitor", "fvtt-homebrew-species"];
const before = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
for (const key of keys) {
  if (before[key] !== undefined && before[key] !== false) throw new Error(`Unexpected enabled value for ${key}; do not restore blindly.`);
  if (game.modules.get(key)?.active) throw new Error(`Unexpected active module ${key}`);
}
const activeBefore = [...game.modules.values()].filter(module => module.active).map(module => module.id).sort();
if (activeBefore.length !== 79 || !activeBefore.includes("tile-arsenal")) throw new Error("Expected the verified 79-module installed checkpoint.");
const restored = { ...before, ...Object.fromEntries(keys.map(key => [key, false])) };
await game.settings.set("core", "moduleConfiguration", restored);
const after = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
for (const key of Object.keys(restored)) if (after[key] !== restored[key]) throw new Error(`Settings readback mismatch for ${key}`);
const activeAfter = [...game.modules.values()].filter(module => module.active).map(module => module.id).sort();
if (JSON.stringify(activeAfter) !== JSON.stringify(activeBefore)) throw new Error("Active module set changed while restoring disabled keys.");
const json = JSON.stringify({ scope, action: "restore-five-disabled-keys", before, after, activeBefore, activeAfter, restoredKeys: keys, observedAt: new Date().toISOString() }, null, 2);
const escaped = json.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
await new foundry.applications.api.DialogV2({
  window: { title: "BP368 Disabled Switch Restoration" }, position: { width: 760, height: 640 },
  content: `<textarea id="bp368-restoration-receipt" readonly style="width:100%;height:480px">${escaped}</textarea>`,
  buttons: [{ action: "close", label: "Close" }],
}).render({ force: true });

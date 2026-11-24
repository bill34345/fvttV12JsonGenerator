const moduleId = "fvtt-boss-combat-reminders";
const packModuleId = "dnd-monster-manual";
const worldId = "boss-reminders-native-20261123";
const host = location.hostname;
const relevantModules = [
  moduleId, packModuleId, "5e_chn", "babele", "midi-qol", "dae", "chris-premades", "cat",
  "monks-combat-details", "monks-bloodsplats", "monks-tokenbar", "monks-active-tiles",
  "monks-little-details", "item-piles", "autoanimations", "sequencer",
  "fvtt-custom-conditions", "fvtt-injury-fading-spirits", "fvtt-trigger-engine",
];
const stackModules = ["midi-qol", "dae", "monks-combat-details", "monks-bloodsplats"];
const mode = config?.mode;
const expectedBossVersion = config?.expectedBossVersion;
const requiredActiveIds = config?.requiredActiveIds ?? [];
if (!["bare", "stack"].includes(mode) || typeof expectedBossVersion !== "string" || !expectedBossVersion
  || !Array.isArray(requiredActiveIds) || requiredActiveIds.some(id => typeof id !== "string")) {
  throw Error("Expected fixture mode, exact candidate version and optional active module IDs");
}
if (!["127.0.0.1", "localhost"].includes(host) || location.port !== "30002"
  || game.world.id !== worldId || !game.user.isActiveGM || game.version !== "14.370"
  || game.system.id !== "dnd5e" || game.system.version !== "6.1.1"
  || !game.modules.get(moduleId)?.active || game.modules.get(moduleId).version !== expectedBossVersion
  || !game.modules.get(packModuleId)?.active || game.modules.get(packModuleId).version !== "1.4.0") {
  throw Error("Defeat fixture target mismatch");
}
const active = id => game.modules.get(id)?.active === true;
const baselineIds = new Set([moduleId, packModuleId, "5e_chn"]);
const unexpectedlyActive = relevantModules.filter(id => !baselineIds.has(id) && active(id));
const missing = [...new Set([...requiredActiveIds, ...(mode === "stack" ? stackModules : [])])]
  .filter(id => !active(id));
if (missing.length || (mode === "bare" && unexpectedlyActive.length)) {
  throw Error(JSON.stringify({ mode, missing, unexpectedlyActive: mode === "bare" ? unexpectedlyActive : [] }));
}
const sceneName = "BCR Defeat Order Fixture " + mode;
if (globalThis.bcrDefeatFixture || game.scenes.some(scene => scene.name === sceneName)) {
  throw Error("A defeat fixture already exists");
}

const pack = game.packs.get(packModuleId + ".actors");
if (pack?.documentName !== "Actor") throw Error("Official Actor pack is unavailable");
const cases = [
  { key: "balor", actorId: "mmBalor000000000", itemId: "mmDeathThroes000", initiative: 18 },
  { key: "zombie", actorId: "mmZombie00000000", itemId: "mmUndeadFortitud", initiative: 13 },
  { key: "control", initiative: 8 },
];
const prior = {
  scene: canvas.scene,
  active: game.scenes.active,
  combat: game.combats.active,
  targets: Array.from(game.user.targets, target => target.document.uuid),
};

const actors = new Map();
const tokens = new Map();
const originals = new Map();
const events = [];
const chats = new Set();
const handlers = [];
let scene;
let combat;
let closed = false;

try {
  for (const row of cases) {
    if (!row.actorId) {
      actors.set(row.key, await Actor.create({
        name: "BCR Ordinary Hostile",
        type: "npc",
        system: { attributes: { hp: { value: 8, max: 8 } } },
      }, { renderSheet: false }));
      continue;
    }
    const original = await pack.getDocument(row.actorId);
    const sourceItem = original?.items.get(row.itemId);
    if (!sourceItem) throw Error("Official source or Item is missing for " + row.key);
    const actor = await game.actors.importFromCompendium(pack, row.actorId, {}, { renderSheet: false });
    actors.set(row.key, actor);
    const importedItem = actor.items.get(row.itemId);
    if (!importedItem || !foundry.utils.objectsEqual(sourceItem.toObject().system, importedItem.toObject().system)) {
      throw Error("Imported Item differs from the official source for " + row.key);
    }
    originals.set(row.key, {
      actorId: row.actorId,
      itemId: row.itemId,
      uuid: original.uuid,
      source: JSON.stringify(original.toObject()),
      actor: JSON.stringify(actor.toObject()),
      itemSystem: JSON.stringify(importedItem.toObject().system),
    });
  }

  scene = await Scene.create({
    name: sceneName,
    width: 1250,
    height: 900,
    padding: 0,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });
  const placements = [];
  for (const [index, row] of cases.entries()) {
    const actor = actors.get(row.key);
    const token = await actor.getTokenDocument({
      x: 100 + index * 350, y: 200, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    });
    placements.push(token.toObject());
  }
  const placed = await scene.createEmbeddedDocuments("Token", placements);
  for (const row of cases) {
    const token = placed.find(document => document.actorId === actors.get(row.key).id);
    if (!token?.actor?.isToken || token.actorLink || token.actor.system.attributes.hp.value <= 0) {
      throw Error("Expected an independent, living Token for " + row.key);
    }
    const original = originals.get(row.key);
    if (original && JSON.stringify(token.actor.items.get(row.itemId)?.toObject().system) !== original.itemSystem) {
      throw Error("Placed Item differs from the imported Item for " + row.key);
    }
    tokens.set(row.key, token);
  }
  await scene.activate();
  await waitFor(() => canvas.ready && canvas.scene?.id === scene.id, "fixture canvas");
  combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", cases.map(row => {
    const token = tokens.get(row.key);
    return { tokenId: token.id, actorId: token.actorId, sceneId: scene.id, initiative: row.initiative };
  }));
  if (game.combats.active?.id !== combat.id) throw Error("Fixture combat is inactive");

  on("updateActor", (actor, delta, options) => {
    const key = actorKey(actor);
    if (key) record("updateActor", key, {
      hp: actor.system.attributes.hp.value,
      previousHP: options.dnd5e?.hp?.value ?? null,
      hpChanged: delta.system?.attributes?.hp?.value !== undefined,
      pending: actor.getFlag(moduleId, "pendingDefeat") ?? null,
    });
  });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    on(hook, effect => {
      const key = actorKey(effect.parent);
      if (key && (effect.statuses.has("dead") || effect.statuses.has("unconscious"))) {
        record(hook, key, { statuses: Array.from(effect.statuses), disabled: effect.disabled });
      }
    });
  }
  on("updateCombatant", (combatant, delta) => {
    if (combatant.parent?.id !== combat.id) return;
    const key = tokenKey(combatant.tokenId);
    if (key) record("updateCombatant", key, {
      defeated: combatant.defeated, effectiveDefeated: combatant.isDefeated,
      defeatedChanged: delta.defeated !== undefined,
    });
  });
  on("updateToken", (document, delta) => {
    if (document.parent.id !== scene.id) return;
    const key = tokenKey(document.id);
    if (key && (delta.hidden !== undefined || delta.alpha !== undefined || delta.flags?.["monks-bloodsplats"])) {
      record("updateToken", key, { hidden: document.hidden, alpha: document.alpha });
    }
  });
  on("deleteToken", document => {
    if (document.parent.id !== scene.id) return;
    const key = tokenKey(document.id);
    if (key) record("deleteToken", key);
  });
  on("createChatMessage", message => {
    const key = message.speaker.scene === scene.id ? tokenKey(message.speaker.token) : undefined;
    if (!key) return;
    chats.add(message.id);
    const itemUuid = message.system.item?.uuid ?? message.getFlag("dnd5e", "item.uuid");
    record("createChatMessage", key, {
      id: message.id,
      type: message.type,
      item: itemUuid ? fromUuidSync(itemUuid, { strict: false })?.name ?? null : null,
      rolls: message.rolls.map(roll => ({ total: roll.total, dc: roll.options.target ?? null, success: roll.isSuccess })),
    });
  });
  on("combatTurnChange", (changedCombat, previous, current) => {
    if (changedCombat.id === combat.id) {
      record("combatTurnChange", tokenKey(changedCombat.combatant?.tokenId), {
        round: current?.round ?? changedCombat.round, turn: current?.turn ?? changedCombat.turn,
        previousTurn: previous?.turn ?? null,
      });
    }
  });
  await combat.startCombat();
  globalThis.bcrDefeatFixture = Object.freeze({
    mode,
    snapshot,
    damage,
    target,
    restore,
    nextTurn,
    verifySources,
    cleanup,
  });
  return snapshot("ready");
} catch (error) {
  await cleanup();
  throw error;
}

function on(hook, listener) {
  handlers.push([hook, Hooks.on(hook, listener)]);
}

function record(event, key, detail = {}) {
  events.push({ sequence: events.length + 1, at: performance.now(), event, key: key ?? null, ...detail });
}

function tokenKey(id) {
  return Array.from(tokens).find(([, token]) => token.id === id)?.[0];
}

function actorKey(actor) {
  return Array.from(tokens).find(([, token]) => actor?.uuid === token.actor?.uuid)?.[0];
}

function tokenFor(key) {
  const original = tokens.get(key);
  const token = scene?.tokens.get(original?.id);
  if (closed || !token) throw Error("Fixture Token is unavailable for " + key);
  return token;
}

async function waitFor(predicate, name) {
  const deadline = performance.now() + 8000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw Error("Timed out waiting for " + name);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function snapshot(label) {
  const cards = Array.from(document.querySelectorAll("#fvtt-boss-combat-reminders-window .boss-reminder-card"))
    .map(card => ({
      kind: card.dataset.kind,
      title: card.getAttribute("aria-label"),
      groups: Array.from(card.querySelectorAll(".boss-reminder-group"), group => ({
        label: group.getAttribute("aria-label"),
        choices: Array.from(group.querySelectorAll(".boss-reminder-action"), button => ({
          id: button.dataset.choice ?? null,
          text: button.textContent,
          disabled: button.disabled,
        })),
      })),
    }));
  const result = {
    label,
    mode,
    world: game.world.id,
    core: game.version,
    system: game.system.version,
    activeModules: Array.from(game.modules.filter(module => module.active), module => module.id).sort(),
    relevantModules: Object.fromEntries(relevantModules.map(id => {
      const module = game.modules.get(id);
      return [id, { active: module?.active ?? false, version: module?.version ?? null }];
    })),
    settings: readSettings(),
    combat: {
      id: combat?.id,
      active: game.combats.active?.id === combat?.id,
      started: combat?.started,
      round: combat?.round,
      turn: combat?.turn,
      current: tokenKey(combat?.combatant?.tokenId) ?? null,
    },
    cards,
    tokens: Object.fromEntries(cases.map(({ key }) => [key, readToken(key)])),
    events: structuredClone(events),
  };
  console.info("BCR_DEFEAT_FIXTURE " + JSON.stringify(result));
  return result;
}

function readSettings() {
  const read = (id, key) => game.settings.settings.has(id + "." + key) ? game.settings.get(id, key) : null;
  const midi = read("midi-qol", "ConfigSettings");
  return {
    autoApplyDowned: read("dnd5e", "autoApplyDowned"),
    skipDefeated: combat?.settings.skipDefeated ?? null,
    monks: {
      autoDefeated: read("monks-combat-details", "auto-defeated"),
      invisibleDead: read("monks-combat-details", "invisible-dead"),
      hideDefeated: read("monks-combat-details", "hide-defeated"),
      hideDefeatedMain: read("monks-combat-details", "hide-defeated-main"),
      showBloodsplat: read("monks-bloodsplats", "show-bloodsplat"),
      defeatedStatus: read("monks-bloodsplats", "defeated-status"),
      disabledBloodsplats: read("monks-bloodsplats", "disabled-bloodsplats"),
      defeatedTokensDisabled: read("monks-bloodsplats", "defeated-tokens-disabled"),
      removeOverlay: read("monks-bloodsplats", "remove-overlay"),
      removeEffects: read("monks-bloodsplats", "remove-effects"),
    },
    midi: midi && {
      autoCheckSaves: midi.autoCheckSaves,
      autoApplyDamage: midi.autoApplyDamage,
      addDead: midi.addDead,
      checkSaveText: midi.checkSaveText,
    },
  };
}

function readToken(key) {
  const placement = tokens.get(key);
  const token = placement && scene.tokens.get(placement.id);
  if (!token) return { present: false };
  const actor = token.actor;
  const view = token.object;
  const participant = combat.combatants.find(entry => entry.tokenId === token.id);
  const hp = actor.system.attributes.hp;
  const splat = view?.bloodsplat;
  return {
    present: true,
    token: token.uuid,
    actor: actor.uuid,
    hp: hp.value,
    maxHp: hp.effectiveMax,
    important: actor.system.traits.important,
    dead: actor.statuses.has("dead"),
    unconscious: actor.statuses.has("unconscious"),
    defeated: participant?.defeated ?? null,
    effectiveDefeated: participant?.isDefeated ?? null,
    pending: actor.getFlag(moduleId, "pendingDefeat") ?? null,
    hidden: token.hidden,
    alpha: token.alpha,
    meshAlpha: view?.mesh?.alpha ?? null,
    visibleToGM: view?.isVisible ?? null,
    targetedByGM: view ? game.user.targets.has(view) : null,
    targetUsers: view?.targeted?.size ?? null,
    eventMode: view?.eventMode ?? null,
    interactive: view?.interactive ?? null,
    bloodsplat: splat === "loading" ? "loading" : Boolean(splat),
    bloodsplatVisible: splat?.visible ?? null,
    bloodsplatAlpha: splat?.alpha ?? null,
  };
}

async function damage(key, { amount, type = "bludgeoning" } = {}) {
  const actor = tokenFor(key).actor;
  const hp = actor.system.attributes.hp.value;
  amount ??= hp;
  if (!Number.isInteger(amount) || amount <= 0) throw Error("A positive integral damage amount is required");
  record("damageRequested", key, { hp, amount, type });
  await actor.applyDamage([{ value: amount, type }]);
  return snapshot("returned from damage: " + key);
}

function target(key) {
  const object = tokenFor(key).object;
  if (!object) throw Error("Fixture Token has no canvas object");
  object.setTarget(true, { releaseOthers: false });
  return snapshot("target: " + key);
}

async function restore(key, hp = 1) {
  const actor = tokenFor(key).actor;
  if (!Number.isInteger(hp) || hp <= 0 || hp > actor.system.attributes.hp.effectiveMax) {
    throw Error("Restore HP must be a positive integer at or below max HP");
  }
  record("restoreRequested", key, { hp });
  await actor.update({ "system.attributes.hp.value": hp });
  return snapshot("returned from restore: " + key);
}

async function nextTurn() {
  if (closed || game.combats.active?.id !== combat.id) throw Error("Fixture combat is inactive");
  await combat.nextTurn();
  return snapshot("next turn");
}

async function verifySources() {
  return Object.fromEntries(await Promise.all(Array.from(originals, async ([key, original]) => [
    key, {
      uuid: original.uuid,
      originalUnchanged: original.source === JSON.stringify((await pack.getDocument(original.actorId)).toObject()),
      importedActorUnchanged: original.actor === JSON.stringify(actors.get(key).toObject()),
      tokenItemUnchanged: original.itemSystem === JSON.stringify(tokenFor(key).actor.items.get(original.itemId)?.toObject().system),
    },
  ])));
}

async function cleanup() {
  if (closed) return;
  closed = true;
  for (const [hook, handler] of handlers) Hooks.off(hook, handler);
  delete globalThis.bcrDefeatFixture;
  if (prior.active && game.scenes.has(prior.active.id)) await prior.active.activate();
  if (prior.scene && game.scenes.has(prior.scene.id)) {
    await waitFor(() => !canvas.loading, "previous scene switch");
    if (canvas.scene?.id !== prior.scene.id) await prior.scene.view();
    await waitFor(() => canvas.ready && canvas.scene?.id === prior.scene.id, "previous canvas");
  }
  if (combat && game.combats.has(combat.id)) {
    await combat.update({ active: false, round: 0, turn: null });
    await combat.delete();
  }
  if (prior.combat && game.combats.has(prior.combat.id)) await prior.combat.activate();
  if (scene && game.scenes.has(scene.id)) await scene.delete();
  for (const actor of actors.values()) if (game.actors.has(actor.id)) await actor.delete();
  for (const id of chats) await game.messages.get(id)?.delete();
  const restored = await Promise.all(prior.targets.map(uuid => fromUuid(uuid)));
  canvas.tokens?.setTargets(restored.filter(token => token?.parent?.id && token.parent.id === canvas.scene?.id).map(token => token.id));
  const result = {
    sceneRemoved: !scene || !game.scenes.has(scene.id),
    combatRemoved: !combat || !game.combats.has(combat.id),
    actorsRemoved: Array.from(actors.values()).every(actor => !game.actors.has(actor.id)),
    chatsRemoved: Array.from(chats).every(id => !game.messages.has(id)),
    activeSceneRestored: !prior.active || game.scenes.active?.id === prior.active.id,
    viewedSceneRestored: !prior.scene || canvas.scene?.id === prior.scene.id,
    combatRestored: !prior.combat || game.combats.active?.id === prior.combat.id,
  };
  console.info("BCR_DEFEAT_FIXTURE_CLEANUP " + JSON.stringify(result));
  return result;
}

const moduleId = "fvtt-boss-combat-reminders";
const packModuleId = "dnd-monster-manual";
const mode = config?.mode ?? "bare";
const expectedBossVersion = config?.expectedBossVersion;
const requiredActiveIds = config?.requiredActiveIds ?? [];
if (!["bare", "stack"].includes(mode) || typeof expectedBossVersion !== "string" || !expectedBossVersion
  || !Array.isArray(requiredActiveIds) || requiredActiveIds.some(id => typeof id !== "string")) {
  throw Error("Expected fixture mode, exact candidate version and optional active module IDs");
}
const active = id => game.modules.get(id)?.active === true;
if (!["127.0.0.1", "localhost"].includes(location.hostname) || location.port !== "30002"
  || game.world.id !== "boss-reminders-native-20261123" || !game.user.isActiveGM || game.version !== "14.370"
  || game.system.id !== "dnd5e" || game.system.version !== "6.1.1"
  || !active(moduleId) || game.modules.get(moduleId).version !== expectedBossVersion
  || !active(packModuleId) || game.modules.get(packModuleId).version !== "1.4.0") {
  throw Error("Bloodied fixture target mismatch");
}
if (requiredActiveIds.some(id => !active(id)) || (mode === "bare" && ["midi-qol", "dae", "babele", "cat",
  "chris-premades", "monks-combat-details", "monks-bloodsplats"].some(active))) {
  throw Error("Bloodied fixture module activation mismatch");
}
const sceneName = "BCR Bloodied Order Fixture " + mode;
if (globalThis.bcrBloodiedFixture || game.scenes.some(scene => scene.name === sceneName)) {
  throw Error("A bloodied fixture already exists");
}

const pack = game.packs.get(packModuleId + ".actors");
if (pack?.documentName !== "Actor") throw Error("Official Actor pack is unavailable");
const cases = [
  { key: "golem", name: "Clay Golem", id: /^mmClayGolem0+$/, rule: "Berserk", initiative: 18 },
  { key: "berserker", name: "Berserker", id: /^mmBerserker0+$/, rule: "Bloodied Frenzy", initiative: 13 },
  { key: "pudding", name: "Black Pudding", id: /^mmBlackPudding0+$/, rule: "Split", initiative: 8 },
];
const index = await pack.getIndex();
const previous = {
  activeScene: game.scenes.active,
  viewedScene: canvas.scene,
  combat: game.combats.active,
  targets: Array.from(game.user.targets, target => target.document.uuid),
};
const fixtures = new Map();
const hooks = [];
const events = [];
const chats = new Set();
let scene;
let combat;
let closed = false;

try {
  for (const row of cases) {
    const record = index.find(entry => row.id.test(entry._id)) ?? index.find(entry => entry.name === row.name);
    const original = record && await pack.getDocument(record._id);
    if (!original?.uuid) throw Error("Official Actor not found: " + row.name);
    const trait = original.items.find(item => item.name === row.rule || item._source.flags?.babele?.originalName === row.rule)
      ?? original.items.find(item => item.id.toLowerCase().includes(row.rule.replace(/\s/g, "").toLowerCase()));
    if (!trait) throw Error("Official Item not found: " + row.rule);
    const saved = {
      row, originalId: original.id, original: original.toObject(), uuid: original.uuid, itemId: trait.id,
      item: itemSource(trait), activities: activitySource(trait),
    };
    const actor = await game.actors.importFromCompendium(pack, original.id, {}, { renderSheet: false });
    fixtures.set(row.key, { ...saved, actor, actorSource: actor.toObject() });
    const item = actor.items.get(saved.itemId);
    // dnd5e gives an Actor its default identifier on creation if the source leaves it blank.
    const importedSystem = { ...saved.original.system, identifier: original.identifier };
    if (!item || !equal(importedSystem, actor.toObject().system)
      || !equal(saved.item, itemSource(item)) || !equal(saved.activities, activitySource(item))) {
      throw Error("Imported Actor, Item or Activity source differs for " + row.name);
    }
  }

  scene = await Scene.create({
    name: sceneName, width: 1200, height: 800, padding: 0,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });
  const placements = [];
  for (const [i, fixture] of Array.from(fixtures.values()).entries()) {
    const token = await fixture.actor.getTokenDocument({
      x: 100 + i * 350, y: 100, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    });
    placements.push(token.toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", placements);
  for (const fixture of fixtures.values()) {
    const token = tokens.find(document => document.actorId === fixture.actor.id);
    const actor = token?.actor;
    if (!actor?.isToken || token.actorLink || actor.system.attributes.hp.value <= 0) {
      throw Error("Expected independent, living NPC: " + fixture.row.name);
    }
    const item = actor.items.get(fixture.itemId);
    if (!item || !equal(fixture.item, itemSource(item)) || !equal(fixture.activities, activitySource(item))) {
      throw Error("Placed Item or Activity source differs for " + fixture.row.name);
    }
    fixture.token = token;
  }
  await scene.activate();
  await waitFor(() => canvas.ready && canvas.scene?.id === scene.id, "fixture canvas");
  combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", Array.from(fixtures.values(), fixture => ({
    tokenId: fixture.token.id, actorId: fixture.actor.id, sceneId: scene.id, initiative: fixture.row.initiative,
  })));
  if (game.combats.active?.id !== combat.id) throw Error("Fixture combat is inactive");

  on("updateActor", (actor, delta, options) => {
    const key = actorKey(actor);
    if (key && delta.system?.attributes?.hp) {
      recordEvent("updateActor", key, {
        before: options.dnd5e?.hp?.value ?? null, current: actor.system.attributes.hp.value,
      });
    }
  });
  for (const event of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    on(event, effect => {
      const actor = effect.parent?.documentName === "Actor" ? effect.parent : effect.parent?.actor;
      const key = actorKey(actor);
      if (key) recordEvent(event, key, { effect: effectView(effect) });
    });
  }
  on("combatTurnChange", (changed, previousTurn, currentTurn) => {
    if (changed.id !== combat.id) return;
    recordEvent("combatTurnChange", tokenKey(changed.combatant?.tokenId), {
      from: { turn: previousTurn?.turn, round: previousTurn?.round },
      to: { turn: currentTurn?.turn, round: currentTurn?.round },
    });
  });
  on("createChatMessage", message => {
    if (message.speaker.scene !== scene.id) return;
    const key = tokenKey(message.speaker.token);
    if (!key) return;
    chats.add(message.id);
    recordEvent("createChatMessage", key, {
      id: message.id, type: message.type, rolls: message.rolls.map(rollView),
    });
  });

  await combat.startCombat();
  globalThis.bcrBloodiedFixture = Object.freeze({
    mode, snapshot, border, restore, nextTurn, rollAttack, rollSave, verifySources, cleanup,
  });
  return snapshot("ready");
} catch (error) {
  await cleanup();
  throw error;
}

function on(name, callback) {
  hooks.push([name, Hooks.on(name, callback)]);
}

function actorKey(actor) {
  return Array.from(fixtures).find(([, fixture]) => fixture.token?.actor?.uuid === actor?.uuid)?.[0];
}

function tokenKey(id) {
  return Array.from(fixtures).find(([, fixture]) => fixture.token?.id === id)?.[0];
}

function tokenFor(key) {
  const token = scene?.tokens.get(fixtures.get(key)?.token?.id);
  if (closed || !token) throw Error("Fixture Token unavailable: " + key);
  return token;
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, i) => equal(value, b[i]));
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function itemSource(item) {
  const { _stats, ownership, sort, folder, effects, ...payload } = item.toObject();
  return { ...payload, effects: effects.map(({ _stats, ownership, ...effect }) => effect) };
}

function activitySource(item) {
  return item.toObject().system.activities;
}

function recordEvent(event, key, detail = {}) {
  events.push({ sequence: events.length + 1, at: performance.now(), event, key: key ?? null, ...detail });
}

function effectView(effect) {
  const source = effect.toObject();
  return {
    id: effect.id, name: effect.name, owner: effect.parent?.uuid ?? null,
    ownerType: effect.parent?.documentName ?? null, origin: effect.origin ?? null,
    type: effect.type, transfer: effect.transfer, disabled: effect.disabled, active: effect.active,
    statuses: Array.from(effect.statuses), changes: source.system?.changes ?? source.changes ?? [],
    flags: Object.fromEntries(["dnd5e", "midi-qol", "cat", moduleId]
      .filter(key => source.flags?.[key] !== undefined).map(key => [key, source.flags[key]])),
  };
}

function rollView(roll) {
  return {
    total: roll.total,
    advantageMode: roll.options.advantageMode ?? null,
    hasAdvantage: roll.hasAdvantage ?? null,
    hasDisadvantage: roll.hasDisadvantage ?? null,
    advantage: roll.options.advantage ?? null,
    disadvantage: roll.options.disadvantage ?? null,
    die: roll.d20?.results?.map(result => ({ result: result.result, active: result.active })) ?? [],
  };
}

function speaker(token) {
  return ChatMessage.getSpeaker({ actor: token.actor, token, scene });
}

async function waitFor(predicate, name) {
  const deadline = performance.now() + 8000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw Error("Timed out waiting for " + name);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function snapshot(label) {
  const state = {
    label, mode, world: game.world.id, core: game.version, system: game.system.version,
    modules: Object.fromEntries(game.modules.filter(module => module.active).map(module => [module.id, module.version])),
    bloodiedSetting: game.settings.get("dnd5e", "bloodied"),
    turn: { round: combat?.round, turn: combat?.turn, key: tokenKey(combat?.combatant?.tokenId) ?? null },
    cards: Array.from(document.querySelectorAll("#fvtt-boss-combat-reminders-window .boss-reminder-card"), card => ({
      id: card.dataset.card ?? null, kind: card.dataset.kind, title: card.getAttribute("aria-label"),
      choices: Array.from(card.querySelectorAll(".boss-reminder-action"), button => ({
        id: button.dataset.choice ?? null, label: button.textContent, disabled: button.disabled,
      })),
    })),
    actors: Object.fromEntries(Array.from(fixtures, ([key, fixture]) => {
      const actor = tokenFor(key).actor;
      const hp = actor.system.attributes.hp;
      const item = actor.items.get(fixture.itemId);
      return [key, {
        name: actor.name, uuid: actor.uuid, official: fixture.uuid, hp: hp.value, max: hp.effectiveMax,
        bloodied: actor.statuses.has("bloodied"), size: actor.system.traits.size,
        rule: {
          id: item.id, name: item.name, flags: item.toObject().flags,
          activities: Array.from(item.system.activities, activity => ({
            id: activity.id, type: activity.type, name: activity.name,
            activation: activity.activation.type, condition: activity._source.activation?.condition ?? null,
          })),
        },
        ownedEffects: actor.effects.map(effectView),
        appliedEffects: Array.from(actor.appliedEffects, effectView),
        ruleItemEffects: item.effects.map(effectView),
      }];
    })),
    events: structuredClone(events),
  };
  console.info("BCR_BLOODIED_FIXTURE " + JSON.stringify(state));
  return state;
}

async function border(key, hp) {
  const actor = tokenFor(key).actor;
  const current = actor.system.attributes.hp.value;
  hp ??= Math.floor(actor.system.attributes.hp.effectiveMax / 2);
  if (!Number.isInteger(hp) || hp <= 0 || hp >= current) throw Error("Choose a positive HP below current HP");
  recordEvent("damageRequested", key, { current, targetHP: hp, damageType: "force" });
  await actor.applyDamage([{ value: current - hp, type: "force" }]);
  if (actor.system.attributes.hp.value !== hp) throw Error("Native damage did not reach expected HP for " + key);
  return snapshot("damage: " + key);
}

async function restore(key, hp) {
  const actor = tokenFor(key).actor;
  const current = actor.system.attributes.hp.value;
  const max = actor.system.attributes.hp.effectiveMax;
  hp ??= max;
  if (!Number.isInteger(hp) || hp <= current || hp > max) throw Error("Choose an HP above current and at most max");
  recordEvent("healingRequested", key, { current, targetHP: hp });
  await actor.applyDamage([{ value: hp - current, type: "healing" }]);
  if (actor.system.attributes.hp.value !== hp) throw Error("Native healing did not reach expected HP for " + key);
  return snapshot("restore: " + key);
}

async function nextTurn() {
  if (closed || game.combats.active?.id !== combat.id) throw Error("Fixture combat is inactive");
  await combat.nextTurn();
  return snapshot("next turn");
}

async function rollAttack(key, itemId, activityId) {
  const token = tokenFor(key);
  const items = itemId ? [token.actor.items.get(itemId)] : token.actor.items.contents;
  const activity = items.flatMap(item => Array.from(item?.system.activities ?? []))
    .find(entry => entry.type === "attack" && (!activityId || activityId === entry.id));
  if (!activity) throw Error("Original attack Activity unavailable for " + key);
  const result = await activity.rollAttack({}, { configure: false }, { data: { speaker: speaker(token) } });
  recordEvent("attackReturned", key, { item: activity.item.name, rolls: (result ?? []).map(rollView) });
  return snapshot("attack: " + key);
}

async function rollSave(key, ability = "wis") {
  const token = tokenFor(key);
  const result = await token.actor.rollSavingThrow({ ability }, { configure: false }, { data: { speaker: speaker(token) } });
  recordEvent("saveReturned", key, { ability, rolls: (result ?? []).map(rollView) });
  return snapshot("save: " + key);
}

async function verifySources() {
  return Object.fromEntries(await Promise.all(Array.from(fixtures, async ([key, fixture]) => {
    const tokenItem = tokenFor(key).actor.items.get(fixture.itemId);
    return [key, {
      uuid: fixture.uuid,
      originalUnchanged: equal(fixture.original, (await pack.getDocument(fixture.originalId)).toObject()),
      importedActorUnchanged: equal(fixture.actorSource, fixture.actor.toObject()),
      tokenItemUnchanged: equal(fixture.item, itemSource(tokenItem)),
      tokenActivitiesUnchanged: equal(fixture.activities, activitySource(tokenItem)),
    }];
  })));
}

async function cleanup() {
  if (closed) return;
  closed = true;
  for (const [name, hook] of hooks) Hooks.off(name, hook);
  delete globalThis.bcrBloodiedFixture;
  if (previous.activeScene && game.scenes.has(previous.activeScene.id)) await previous.activeScene.activate();
  if (previous.viewedScene && game.scenes.has(previous.viewedScene.id)) {
    await waitFor(() => !canvas.loading, "previous scene switch");
    if (canvas.scene?.id !== previous.viewedScene.id) await previous.viewedScene.view();
    await waitFor(() => canvas.ready && canvas.scene?.id === previous.viewedScene.id, "previous canvas");
  }
  if (combat && game.combats.has(combat.id)) {
    await combat.update({ active: false, round: 0, turn: null });
    await combat.delete();
  }
  if (previous.combat && game.combats.has(previous.combat.id)) await previous.combat.activate();
  if (scene && game.scenes.has(scene.id)) await scene.delete();
  for (const { actor } of fixtures.values()) if (game.actors.has(actor.id)) await actor.delete();
  for (const id of chats) await game.messages.get(id)?.delete();
  const previousTargets = await Promise.all(previous.targets.map(uuid => fromUuid(uuid)));
  canvas.tokens?.setTargets(previousTargets.filter(token => token?.parent?.id && token.parent.id === canvas.scene?.id)
    .map(token => token.id));
  const result = {
    sceneRemoved: !scene || !game.scenes.has(scene.id),
    combatRemoved: !combat || !game.combats.has(combat.id),
    actorsRemoved: Array.from(fixtures.values()).every(({ actor }) => !game.actors.has(actor.id)),
    chatsRemoved: Array.from(chats).every(id => !game.messages.has(id)),
    activeSceneRestored: !previous.activeScene || game.scenes.active?.id === previous.activeScene.id,
    viewedSceneRestored: !previous.viewedScene || canvas.scene?.id === previous.viewedScene.id,
    combatRestored: !previous.combat || game.combats.active?.id === previous.combat.id,
  };
  console.info("BCR_BLOODIED_FIXTURE_CLEANUP " + JSON.stringify(result));
  return result;
}

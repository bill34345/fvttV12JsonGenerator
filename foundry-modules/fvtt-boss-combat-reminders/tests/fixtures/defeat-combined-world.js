const moduleId = "fvtt-boss-combat-reminders";
const mode = config?.mode ?? "basic";
const expectedBossVersion = config?.expectedBossVersion ?? "0.4.0";
const moduleVersion = id => game.modules.get(id)?.active ? game.modules.get(id).version : null;
const compatibilityVersions = {
  basic: {},
  dae: { "midi-qol": "14.7.0+local.1", dae: "14.6.10.1" },
  cpr: { "midi-qol": "14.7.0+local.1", cat: "0.1.9+local.1", "chris-premades": "2.1.8+local.2" },
};
if (!["127.0.0.1", "localhost"].includes(location.hostname) || location.port !== "30002"
  || game.world.id !== "boss-reminders-native-20261123" || !game.user.isActiveGM
  || game.version !== "14.370" || game.system.id !== "dnd5e" || game.system.version !== "6.1.1"
  || moduleVersion(moduleId) !== expectedBossVersion || !Object.hasOwn(compatibilityVersions, mode)
  || Object.entries(compatibilityVersions[mode]).some(([id, version]) => moduleVersion(id) !== version)) {
  throw Error("Combined defeat fixture target or version mismatch");
}
if (mode === "dae" && typeof globalThis.DAE?.expireEffect !== "function") throw Error("DAE is not ready");
if (mode === "cpr" && !globalThis.cat?.lib?.constants?.macros
  ?.getFnMacros("chris-premades", "all", "useOnDeath", "effect", "actorCreated")?.macros.length) {
  throw Error("CAT/CPR death macro is not registered yet");
}
const sceneName = "BCR Combined Defeat Fixture " + mode;
if (globalThis.bcrCombinedDefeatFixture || globalThis.bcrDefeatFixture || game.scenes.some(scene => scene.name === sceneName)) {
  throw Error("An existing defeat fixture must be cleaned up first");
}

const creatureName = "BCR Combined Adversary";
const prior = {
  active: game.scenes.active,
  viewed: canvas.scene,
  combat: game.combats.active,
  targets: Array.from(game.user.targets, token => token.document.uuid),
};
const ids = {
  zero: foundry.utils.randomID(),
  death: foundry.utils.randomID(),
  activity: foundry.utils.randomID(),
  bloodiedAtZero: foundry.utils.randomID(),
  bloodiedOnly: foundry.utils.randomID(),
};
const expiryNames = { direct: "BCR Direct Token Expiry", ordinary: "BCR Ordinary Zero HP Expiry" };
const handlers = [];
const events = [];
const ownedActors = [];
const messages = new Set();
let scene;
let combat;
let token;
let effects;
let closed = false;

try {
  const adversary = await createActor(creatureName, 12, [
    {
      _id: ids.zero, name: "BCR Hold Fast", type: "feat",
      system: { description: { value: "<p>When damage reduces the BCR Combined Adversary to 0 Hit Points, the GM decides whether it stands.</p>" } },
    },
    {
      _id: ids.death, name: "BCR Final Cry", type: "feat",
      system: {
        description: { value: "<p>When the BCR Combined Adversary dies, it lets out a final cry.</p>" },
        activities: {
          [ids.activity]: {
            _id: ids.activity, type: "utility", name: "BCR Final Cry",
            activation: { type: "special", value: 1 },
          },
        },
      },
      ...(mode === "cpr" ? { flags: { cat: { macros: { effect: [
        { source: "chris-premades", identifier: "useOnDeath", rules: "all" },
      ] } } } } : {}),
    },
    ...(mode === "basic" ? [
      bloodiedItem(ids.bloodiedAtZero, "BCR Critical Flare", true),
      bloodiedItem(ids.bloodiedOnly, "BCR Normal Bloodied Flare", false),
    ] : []),
  ]);
  const anchor = await createActor("BCR Combined Turn Anchor", 8);
  scene = await Scene.create({
    name: sceneName, width: 1100, height: 800, padding: 0,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });
  const placements = await Promise.all([adversary, anchor].map((actor, index) =>
    actor.getTokenDocument({
      x: 100 + 400 * index, y: 150, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    })));
  const placed = await scene.createEmbeddedDocuments("Token", placements.map(document => document.toObject()));
  token = placed.find(document => document.actorId === adversary.id);
  if (!token?.actor?.isToken || token.actorLink || !token.actor.items.has(ids.zero) || !token.actor.items.has(ids.death)) {
    throw Error("Combined fixture requires independent Token with stable Item IDs");
  }
  if (mode === "dae") {
    const created = await token.actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: expiryNames.direct, type: "base", transfer: false,
        flags: { dae: { specialDuration: ["zeroHP"], expiryMode: "delete" } },
        system: { changes: [{ key: "flags.dae.deleteUuid", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: token.uuid }] },
      },
      {
        name: expiryNames.ordinary, type: "base", transfer: false,
        flags: { dae: { specialDuration: ["zeroHP"], expiryMode: "delete" } },
      },
    ]);
    const direct = created.find(effect => effect.name === expiryNames.direct);
    const ordinary = created.find(effect => effect.name === expiryNames.ordinary);
    if (!direct?.system.changes.some(change => change.key === "flags.dae.deleteUuid" && change.value === token.uuid)
      || !ordinary || !Array.from(token.actor.appliedEffects).some(effect => effect.id === direct.id)) {
      throw Error("DAE effect data did not survive native creation");
    }
    effects = { direct: direct.id, ordinary: ordinary.id };
  }
  await scene.activate();
  await waitFor(() => canvas.ready && canvas.scene?.id === scene.id, "owned canvas");
  combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", placed.map(document => ({
    tokenId: document.id, actorId: document.actorId, sceneId: scene.id,
    initiative: document.id === token.id ? 12 : 8,
  })));
  await combat.startCombat();
  if (game.combats.active?.id !== combat.id) throw Error("Combined fixture combat did not start");

  listen("updateActor", (actor, delta) => {
    if (actor.uuid === token.actor?.uuid) record("actor", {
      hp: actor.system.attributes.hp.value,
      hpChanged: delta.system?.attributes?.hp?.value !== undefined,
      stage: actor.getFlag(moduleId, "pendingDefeat")?.stage ?? null,
    });
  });
  listen("createActiveEffect", effect => {
    if (effect.parent?.uuid === token.actor?.uuid && effect.statuses.has("dead")) record("dead");
  });
  listen("deleteActiveEffect", (effect, options) => {
    if (effect.parent?.uuid === token.actor?.uuid && effects && Object.values(effects).includes(effect.id)) {
      record(effect.id === effects.direct ? "direct-effect-expired" : "ordinary-effect-expired", { reason: options["expiry-reason"] ?? null });
    }
  });
  listen("updateCombatant", (entry, delta) => {
    if (entry.id === participant()?.id && delta.defeated === true) record("defeated");
  });
  listen("updateToken", (document, delta) => {
    if (document.uuid === token.uuid && delta.hidden === true) record("hidden");
  });
  listen("deleteToken", document => {
    if (document.uuid === token.uuid) record("removed");
  });
  listen("createChatMessage", message => {
    if (message.speaker.scene !== scene.id || !placed.some(document => document.id === message.speaker.token)) return;
    messages.add(message.id);
    const itemUuid = message.system.item?.uuid ?? message.getFlag("dnd5e", "item.uuid");
    if (itemUuid && message.speaker.token === token.id && itemUuid === token.actor?.items.get(ids.death)?.uuid) record("death-card");
  });
  listen("midi-qol.RollComplete", workflow => {
    if (workflow.actor?.uuid === token.actor?.uuid && workflow.item?.id === ids.death) {
      record("death-workflow", { aborted: workflow.aborted === true });
    }
  });

  globalThis.bcrCombinedDefeatFixture = Object.freeze({ damage, nextTurn, assertStage, snapshot, cleanup });
  return snapshot("ready");
} catch (error) {
  await cleanup();
  throw error;
}

async function createActor(name, hp, items = []) {
  const actor = await Actor.create({
    name, type: "npc", items, system: { attributes: { hp: { value: hp, max: hp } } },
  }, { keepEmbeddedIds: true, renderSheet: false });
  ownedActors.push(actor);
  return actor;
}

function listen(hook, callback) {
  handlers.push([hook, Hooks.on(hook, callback)]);
}

function bloodiedItem(id, name, atZero) {
  return {
    _id: id, name, type: "feat",
    system: {
      description: { value: "<p>When the BCR Combined Adversary becomes Bloodied, it flares.</p>" },
      activities: { [id]: { _id: id, name, type: "utility", activation: { type: "special", value: 1 } } },
    },
    ...(atZero ? { flags: { [moduleId]: { healthTrigger: { kind: "bloodied", atZero: true } } } } : {}),
  };
}

function record(event, detail = {}) {
  events.push({ sequence: events.length + 1, event, ...detail });
}

function participant() {
  return combat?.combatants.find(entry => entry.tokenId === token?.id);
}

function read() {
  const document = scene?.tokens.get(token?.id);
  const actor = document?.actor;
  const entry = participant();
  const cards = Array.from(globalThis.document.querySelectorAll("#fvtt-boss-combat-reminders-window .boss-reminder-card [role=group]"))
    .filter(group => group.getAttribute("aria-label") === creatureName)
    .map(group => ({
      kind: group.closest(".boss-reminder-card")?.dataset.kind,
      choices: Array.from(group.querySelectorAll("button[data-choice]"), button => button.dataset.choice),
    }));
  const choices = cards.filter(card => card.kind === "death").flatMap(card => card.choices);
  return {
    mode, version: moduleVersion(moduleId), combat: { id: combat?.id, round: combat?.round, turn: combat?.turn },
    tokenPresent: Boolean(document), hp: actor?.system.attributes.hp.value ?? null,
    stage: actor?.getFlag(moduleId, "pendingDefeat")?.stage ?? null,
    dead: actor?.statuses.has("dead") ?? null, markedDefeated: entry?.defeated ?? null,
    effectiveDefeated: entry?.isDefeated ?? null, hidden: document?.hidden ?? null,
    bloodsplat: Boolean(document?.object?.bloodsplat),
    targetRetained: Boolean(document?.object && game.user.targets.has(document.object)),
    zeroSheetOpened: actor?.items.get(ids.zero)?.sheet?.rendered ?? false,
    dae: effects && { directPresent: actor?.effects.has(effects.direct) ?? false, ordinaryPresent: actor?.effects.has(effects.ordinary) ?? false },
    choices, allChoices: cards.flatMap(card => card.choices), ids,
    events: structuredClone(events),
  };
}

function snapshot(label) {
  const evidence = { label, ...read() };
  console.info("BCR_COMBINED_DEFEAT_FIXTURE " + JSON.stringify(evidence));
  return evidence;
}

async function waitFor(test, name) {
  const until = performance.now() + 8000;
  while (!test()) {
    if (performance.now() >= until) throw Error("Timed out: " + name);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function damage() {
  if (closed || game.combats.active?.id !== combat.id) throw Error("Not the owned active combat");
  const document = scene.tokens.get(token.id);
  if (!document || document.actor.system.attributes.hp.value !== 12) throw Error("Adversary already damaged");
  document.object?.setTarget(true, { releaseOthers: false });
  await document.actor.applyDamage([{ value: 12, type: "bludgeoning" }]);
  return snapshot("damage returned");
}

async function nextTurn() {
  if (closed || game.combats.active?.id !== combat.id) throw Error("Not the owned active combat");
  await combat.nextTurn();
  return snapshot("next turn");
}

async function assertStage(expected) {
  if (!["zero", "viewed", "death", "used", "finished"].includes(expected)) throw Error("Unknown fixture assertion");
  const departure = new Set(["dead", "defeated", "hidden", "direct-effect-expired", "removed"]);
  const deathChoice = ids.death + "." + ids.activity;
  const atZeroChoice = ids.bloodiedAtZero + "." + ids.bloodiedAtZero;
  const ordinaryChoice = ids.bloodiedOnly + "." + ids.bloodiedOnly;
  const test = state => {
    if (expected === "finished") {
      const after = state.events.findIndex(event => event.event === "checked-death" || event.event === "checked-used");
      const departed = state.events.findIndex(event => departure.has(event.event));
      if (after < 0 || departed <= after || state.stage || state.choices.length) return false;
      if (mode === "dae") {
        return !state.tokenPresent && state.events.some(event =>
          event.event === "direct-effect-expired" && event.reason === "midi-qol:zeroHP");
      }
      if (!state.tokenPresent || !state.dead || !state.markedDefeated) return false;
      return mode !== "cpr" || (state.events.filter(event => event.event === "death-workflow" && !event.aborted).length === 1
        && state.events.filter(event => event.event === "death-card").length === 1);
    }
    if (!state.tokenPresent || state.hp !== 0 || state.dead || state.markedDefeated || state.effectiveDefeated
      || state.hidden || state.bloodsplat || state.events.some(event => departure.has(event.event))) return false;
    if (mode === "dae" && (!state.dae.directPresent || state.dae.ordinaryPresent)) return false;
    if (expected === "zero" || expected === "viewed") {
      return state.stage === "zero" && state.choices.includes(ids.zero) && state.choices.includes("defeat-confirm")
        && !state.choices.includes(deathChoice) && !state.choices.includes("defeat-finish")
        && (mode !== "basic" || (state.choices.includes(atZeroChoice) && !state.allChoices.includes(ordinaryChoice)
          && state.allChoices.filter(choice => choice === atZeroChoice).length === 1))
        && (expected !== "viewed" || state.zeroSheetOpened);
    }
    if (state.stage !== "death" || state.choices.includes(ids.zero) || !state.choices.includes(deathChoice)
      || state.allChoices.includes(atZeroChoice) || state.allChoices.includes(ordinaryChoice)
      || !state.choices.includes("defeat-finish")) return false;
    if (mode === "cpr") {
      return expected === "used"
        ? state.events.filter(event => event.event === "death-workflow" && !event.aborted).length === 1
          && !state.choices.includes("defeat-auto:" + ids.death)
        : state.choices.includes("defeat-auto:" + ids.death);
    }
    return expected !== "used" || state.events.some(event => event.event === "death-card");
  };
  try {
    await waitFor(() => test(read()), expected);
    if (expected === "finished" && mode === "cpr") {
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (!test(read())) throw Error("A late duplicate death workflow ran");
    }
  } catch (error) {
    snapshot("failed " + expected);
    throw error;
  }
  record("checked-" + expected);
  return snapshot("checked " + expected);
}

async function cleanup() {
  if (closed) return;
  for (const [hook, id] of handlers) Hooks.off(hook, id);
  delete globalThis.bcrCombinedDefeatFixture;
  const actor = scene?.tokens.get(token?.id)?.actor;
  if (actor?.getFlag(moduleId, "pendingDefeat")) await actor.update({ "system.attributes.hp.value": 1 });
  if (combat && game.combats.has(combat.id)) await combat.delete();
  if (prior.active && game.scenes.has(prior.active.id)) await prior.active.activate();
  if (prior.viewed && game.scenes.has(prior.viewed.id)) {
    await waitFor(() => !canvas.loading, "previous scene switch");
    if (canvas.scene?.id !== prior.viewed.id) await prior.viewed.view();
    await waitFor(() => canvas.ready && canvas.scene?.id === prior.viewed.id, "previous canvas");
  }
  if (prior.combat && game.combats.has(prior.combat.id)) await prior.combat.activate();
  if (scene && game.scenes.has(scene.id)) await scene.delete();
  for (const actor of ownedActors) if (game.actors.has(actor.id)) await actor.delete();
  for (const id of messages) await game.messages.get(id)?.delete();
  const targets = await Promise.all(prior.targets.map(uuid => fromUuid(uuid)));
  canvas.tokens?.setTargets(targets.filter(document => document?.parent?.id && document.parent.id === canvas.scene?.id)
    .map(document => document.id));
  closed = true;
  const evidence = {
    sceneRemoved: !scene || !game.scenes.has(scene.id), combatRemoved: !combat || !game.combats.has(combat.id),
    actorsRemoved: ownedActors.every(actor => !game.actors.has(actor.id)), chatsRemoved: [...messages].every(id => !game.messages.has(id)),
    activeSceneRestored: !prior.active || game.scenes.active?.id === prior.active.id,
    viewedSceneRestored: !prior.viewed || canvas.scene?.id === prior.viewed.id,
    combatRestored: !prior.combat || game.combats.active?.id === prior.combat.id,
  };
  console.info("BCR_COMBINED_DEFEAT_FIXTURE_CLEANUP " + JSON.stringify(evidence));
  return evidence;
}

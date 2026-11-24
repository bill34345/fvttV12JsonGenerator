const moduleId = "fvtt-boss-combat-reminders";
const worldId = "boss-reminders-native-20261123";
const sceneName = "BCR Bloodied Attack Fixture";
const expectedBossVersion = typeof config === "undefined" ? undefined : config?.expectedBossVersion;
if (!["127.0.0.1", "localhost"].includes(location.hostname) || location.port !== "30002"
  || game.world.id !== worldId || !game.user.isActiveGM || game.version !== "14.370"
  || game.system.id !== "dnd5e" || game.system.version !== "6.1.1"
  || !expectedBossVersion || !game.modules.get(moduleId)?.active || game.modules.get(moduleId).version !== expectedBossVersion
  || ["midi-qol", "dae", "cat", "chris-premades", "monks-combat-details", "monks-bloodsplats"]
    .some(id => game.modules.get(id)?.active)) {
  throw Error("Bloodied attack probe requires the exact native local test world and registered candidate version");
}
if (globalThis.bcrBloodiedAttacksFixture || game.scenes.some(scene => scene.name === sceneName)) {
  throw Error("A Bloodied attack fixture already exists");
}

const previous = {
  activeScene: game.scenes.active,
  viewedScene: canvas.scene,
  combat: game.combats.active,
  automatic: game.settings.get("dnd5e", "bloodied"),
  targets: Array.from(game.user.targets, target => target.document.uuid),
  controlled: Array.from(canvas.tokens.controlled, token => token.document.uuid),
};
const actors = new Map();
const tokens = new Map();
const items = new Map();
const chats = new Set();
const hooks = [];
const events = [];
let scene;
let combat;
let closed = false;
let sheet;

try {
  const identities = [
    { key: "boss", name: "BCR 浴血爪击 Boss", ac: 15, initiative: 18, x: 100, y: 100 },
    { key: "hit", name: "BCR 爪击命中目标", ac: 5, initiative: 12, x: 200, y: 100 },
    { key: "miss", name: "BCR 爪击未中目标", ac: 40, initiative: 6, x: 100, y: 200 },
  ];
  for (const entry of identities) {
    const actor = await Actor.create({
      name: entry.name,
      type: "npc",
      system: { attributes: { hp: { value: 100, max: 100 }, ac: { calc: "flat", flat: entry.ac } } },
    }, { renderSheet: false });
    actors.set(entry.key, actor);
    if (entry.key === "boss") await createAttacks(actor);
    const placement = await actor.getTokenDocument({
      x: entry.x, y: entry.y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    });
    if (!scene) {
      scene = await Scene.create({
        name: sceneName, width: 1000, height: 600, padding: 0,
        grid: { type: 1, size: 100, distance: 5, units: "ft" },
      });
    }
    const [token] = await scene.createEmbeddedDocuments("Token", [placement.toObject()]);
    if (token) tokens.set(entry.key, token);
    if (token?.actorLink || !token?.actor?.isToken || token.actor.system.attributes.hp.value !== 100
      || token.actor.system.attributes.ac.value !== entry.ac) {
      throw Error("Unexpected prepared Token fields for " + entry.key);
    }
  }
  await scene.activate();
  await waitFor(() => canvas.ready && canvas.scene?.id === scene.id, "fixture scene");
  combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", identities.map(entry => {
    const token = tokenFor(entry.key);
    return { tokenId: token.id, actorId: token.actorId, sceneId: scene.id, initiative: entry.initiative };
  }));
  if (game.combats.active?.id !== combat.id) throw Error("Fixture combat did not activate");
  observe("createChatMessage", message => {
    const token = message.getAssociatedToken?.();
    const sceneId = token?.parent?.id ?? message.speaker.scene;
    const tokenId = token?.id ?? message.speaker.token;
    if (sceneId !== scene.id || !Array.from(tokens.values()).some(entry => tokenId === entry.id)) return;
    chats.add(message.id);
    events.push({ name: "createChatMessage", id: message.id, type: message.type });
  });
  for (const event of ["createActiveEffect", "deleteActiveEffect"]) {
    observe(event, effect => {
      if (Array.from(tokens.values()).every(token => token.actor?.uuid !== effect.parent?.uuid)) return;
      events.push({ name: event, effect: effect.name, statuses: Array.from(effect.statuses), actor: effect.parent.uuid });
    });
  }
  await combat.startCombat();

  globalThis.bcrBloodiedAttacksFixture = Object.freeze({
    snapshot, hp, setAutomatic, select, use, roll, setVariantMode, openBoss, cleanup,
  });
  return snapshot("ready");
} catch (error) {
  await cleanup();
  throw error;
}

function attack(name, range = 5, count = 1) {
  return {
    _id: foundry.utils.randomID(),
    type: "attack",
    name,
    activation: { type: "action", value: 1, condition: "" },
    attack: { ability: "none", flat: true, bonus: "6", type: { value: "melee", classification: "weapon" } },
    range: { value: String(range), units: "ft" },
    target: { affects: { type: "creature", count: String(count) } },
    damage: { includeBase: false, parts: [{ number: 2, denomination: 6, bonus: "3", types: ["slashing"] }] },
  };
}

async function createAttacks(actor) {
  const proneAttack = attack("爪击 · 倒地");
  const prone = {
    _id: foundry.utils.randomID(),
    type: "base",
    name: "浴血爪击 · 倒地",
    img: CONFIG.statusEffects.prone.img,
    statuses: ["prone"],
    disabled: false,
    transfer: false,
  };
  const damageAttack = attack("爪击 · 黯蚀");
  const extra = {
    _id: foundry.utils.randomID(),
    type: "damage",
    name: "浴血爪击 · 黯蚀伤害",
    activation: { type: "special", value: 1 },
    target: { affects: { type: "creature", count: "" } },
    damage: { parts: [{ number: 1, denomination: 6, types: ["necrotic"] }] },
  };
  const standard = attack("爪击 · 普通", 5, 1);
  const expanded = attack("爪击 · 浴血扩展", 15, 2);
  const ordinary = "<p>攻击命中 +6，命中时造成 2d6+3 的挥砍伤害。</p>";
  const rows = [
    { key: "prone", name: "爪击 · 倒地", body: "<p>当浴血时：命中时额外对目标造成倒地效果。</p>",
      activities: [proneAttack], effects: [prone], binding: { rider: { effectId: prone._id } } },
    { key: "damage", name: "爪击 · 黯蚀", body: "<p>当浴血时：命中时伤害额外增加 1d6 黯蚀伤害。</p>",
      activities: [damageAttack, extra], binding: { rider: { activityId: extra._id } } },
    { key: "variant", name: "爪击 · 扩展", body: "<p>当浴血时：触及 15 尺，可以选择两个目标。</p>",
      activities: [standard, expanded], binding: { variant: { id: expanded._id, mode: "replace" } } },
  ];
  const made = await actor.createEmbeddedDocuments("Item", rows.map(row => ({
    name: row.name,
    type: "feat",
    effects: row.effects ?? [],
    system: {
      description: { value: ordinary + row.body },
      activities: Object.fromEntries(row.activities.map(activity => [activity._id, activity])),
    },
    flags: { [moduleId]: { bloodiedAttacks: { [row.activities[0]._id]: row.binding } } },
  })), { keepEmbeddedIds: true });
  for (const row of rows) {
    const item = made.find(document => document.name === row.name);
    if (!item || !row.activities.every(activity => item.system.activities.has(activity._id))
      || !((row.effects ?? []).every(effect => item.effects.has(effect._id)))) {
      throw Error("Fixture source IDs were not preserved: " + JSON.stringify({
        name: row.name, itemNames: made.map(document => document.name),
        expectedActivities: row.activities.map(activity => activity._id),
        actualActivities: Array.from(item?.system.activities ?? [], activity => activity.id),
        expectedEffects: (row.effects ?? []).map(effect => effect._id),
        actualEffects: Array.from(item?.effects ?? [], effect => effect.id),
      }));
    }
    items.set(row.key, { id: item.id, base: row.activities[0]._id, alternate: row.activities[1]?._id });
  }
}

function tokenFor(key) {
  const token = scene?.tokens.get(tokens.get(key)?.id);
  if (closed || !token) throw Error("Fixture Token unavailable: " + key);
  return token;
}

function itemFor(key) {
  const entry = items.get(key);
  const token = tokenFor("boss");
  const item = token.actor.items.get(entry?.id);
  if (!item || !entry) throw Error("Unknown fixture attack: " + key);
  return { item, entry, token };
}

function observe(name, callback) {
  hooks.push([name, Hooks.on(name, callback)]);
}

async function waitFor(predicate, label) {
  const deadline = performance.now() + 8000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw Error("Timed out waiting for " + label);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function speaker(token) {
  return ChatMessage.getSpeaker({ actor: token.actor, token, scene });
}

function messageState(message) {
  const native = message.system;
  return {
    id: message.id, type: message.type, visible: message.visible, whisper: Array.from(message.whisper),
    item: message.getAssociatedItem?.()?.name ?? null,
    activity: message.getAssociatedActivity?.()?.name ?? null,
    description: native.description ?? null,
    rolls: message.rolls.map(roll => ({ total: roll.total, formula: roll.formula, critical: roll.isCritical, fumble: roll.isFumble })),
    targets: Array.from(native.evaluatedTargets ?? native.targets ?? [], target => ({
      token: target.token, name: target.name, ac: target.ac, miss: target.isMiss,
    })),
  };
}

function snapshot(label = "snapshot") {
  const state = {
    label, core: game.version, dnd5e: game.system.version, registeredVersion: game.modules.get(moduleId).version,
    scene: scene.id, combat: combat?.id, automatic: game.settings.get("dnd5e", "bloodied"),
    selected: Array.from(game.user.targets, target => target.name),
    items: Object.fromEntries(items),
    actors: Object.fromEntries(Array.from(tokens.keys(), key => {
      const token = tokenFor(key);
      const actor = token.actor;
      return [key, { token: token.uuid, actor: actor.uuid, name: actor.name, ac: actor.system.attributes.ac.value,
        hp: actor.system.attributes.hp.value, threshold: actor.system.attributes.hp.bloodied, statuses: Array.from(actor.statuses),
        effects: actor.effects.map(effect => ({ id: effect.id, name: effect.name,
          statuses: Array.from(effect.statuses), flags: effect.toObject().flags?.[moduleId] ?? null })) }];
    })),
    cards: Array.from(document.querySelectorAll("#fvtt-boss-combat-reminders-window .boss-reminder-card"), card => ({
      id: card.dataset.card, text: card.textContent,
      choices: Array.from(card.querySelectorAll("[data-choice]"), choice => ({ id: choice.dataset.choice, text: choice.textContent })),
    })),
    targeting: Array.from(document.querySelectorAll("[data-bcr-bloodied-targeting]"), node => node.textContent),
    panels: Array.from(document.querySelectorAll("[data-bcr-bloodied-attack]"), node => ({
      messageId: node.closest("[data-message-id]")?.dataset.messageId,
      kind: node.dataset.bcrBloodiedAttack, hidden: node.hidden, text: node.textContent,
      confirmations: Array.from(node.querySelectorAll("input[type=checkbox]"), box => ({ label: box.parentElement.textContent, checked: box.checked })),
      buttons: Array.from(node.querySelectorAll("[data-bcr-bloodied-apply]"), button => ({ text: button.textContent, disabled: button.disabled })),
    })),
    messages: Array.from(chats, id => game.messages.get(id)).filter(Boolean).map(messageState),
    events: structuredClone(events),
  };
  console.info("BCR_BLOODIED_ATTACKS_FIXTURE " + JSON.stringify(state));
  return state;
}

async function hp(value) {
  const actor = tokenFor("boss").actor;
  const before = actor.system.attributes.hp.value;
  if (!Number.isInteger(value) || value < 1 || value > 100) throw Error("Fixture HP must be within 1..100");
  if (value !== before) await actor.applyDamage([{ value: Math.abs(value - before), type: value > before ? "healing" : "force" }]);
  await waitFor(() => tokenFor("boss").actor.system.attributes.hp.value === value, "prepared fixture HP");
  return snapshot("hp " + value);
}

async function setAutomatic(mode) {
  if (!["all", "player", "none"].includes(mode)) throw Error("Unknown dnd5e bloodied setting");
  tokenFor("boss");
  await game.settings.set("dnd5e", "bloodied", mode);
  return snapshot("automatic " + mode);
}

function select(keys = ["hit", "miss"]) {
  canvas.tokens.setTargets(keys.map(key => tokenFor(key).id));
  return snapshot("targets " + keys.join(","));
}

async function use(key) {
  const { item, entry, token } = itemFor(key);
  await item.system.activities.get(entry.base).use({}, { configure: false }, { data: { speaker: speaker(token) } });
  return snapshot("use " + key);
}

async function roll(key, usageId) {
  const { item, entry, token } = itemFor(key);
  const usage = usageId && chats.has(usageId) ? game.messages.get(usageId) : undefined;
  if (usageId && usage?.type !== "usage") throw Error("Fixture usage card unavailable");
  const activity = usage?.getAssociatedActivity?.() ?? item.system.activities.get(entry.base);
  if (activity?.item?.id !== item.id || activity?.type !== "attack") throw Error("Not an attack from this fixture item");
  // With attack totals 7..26, fixture AC 5 and 40 give a stable hit and miss. Disable critical/fumble
  // overrides for this diagnostic roll through dnd5e's supported Roll config, while rolling a real d20.
  await activity.rollAttack({
    rolls: [{ options: { criticalSuccess: 21, criticalFailure: -1 } }],
  }, { configure: false }, {
    data: { speaker: speaker(token), ...(usage ? { system: { origin: usage.id } } : {}) },
  });
  return snapshot("attack " + key);
}

async function setVariantMode(mode) {
  if (!["replace", "choice"].includes(mode)) throw Error("Unknown variant mode");
  const { item, entry } = itemFor("variant");
  await item.setFlag(moduleId, "bloodiedAttacks", { [entry.base]: { variant: { id: entry.alternate, mode } } });
  return snapshot("variant " + mode);
}

async function openBoss() {
  sheet = tokenFor("boss").actor.sheet;
  await sheet.render({ force: true });
  return snapshot("boss sheet");
}

async function cleanup() {
  if (closed) return;
  closed = true;
  for (const [name, hook] of hooks) Hooks.off(name, hook);
  delete globalThis.bcrBloodiedAttacksFixture;
  if (sheet?.rendered) await sheet.close();
  if (previous.activeScene && game.scenes.has(previous.activeScene.id)) await previous.activeScene.activate();
  if (combat && game.combats.has(combat.id)) {
    await combat.update({ active: false, round: 0, turn: null });
    await combat.delete();
  }
  if (previous.combat && game.combats.has(previous.combat.id)) await previous.combat.activate();
  if (scene && game.scenes.has(scene.id)) await scene.delete();
  for (const actor of actors.values()) if (game.actors.has(actor.id)) await actor.delete();
  for (const id of chats) await game.messages.get(id)?.delete();
  if (game.settings.get("dnd5e", "bloodied") !== previous.automatic) {
    await game.settings.set("dnd5e", "bloodied", previous.automatic);
  }
  if (previous.viewedScene && game.scenes.has(previous.viewedScene.id)) {
    await waitFor(() => !canvas.loading, "prior scene switch");
    if (canvas.scene?.id !== previous.viewedScene.id) await previous.viewedScene.view();
    await waitFor(() => canvas.ready && canvas.scene?.id === previous.viewedScene.id, "prior scene canvas");
  }
  const targets = await Promise.all(previous.targets.map(uuid => fromUuid(uuid)));
  canvas.tokens?.setTargets(targets.filter(token => token?.parent?.id === canvas.scene?.id).map(token => token.id));
  const controlled = await Promise.all(previous.controlled.map(uuid => fromUuid(uuid)));
  for (const token of controlled) {
    if (token?.parent?.id === canvas.scene?.id) token.object?.control({ releaseOthers: false });
  }
  const result = {
    sceneRemoved: !scene || !game.scenes.has(scene.id),
    combatRemoved: !combat || !game.combats.has(combat.id),
    actorsRemoved: Array.from(actors.values()).every(actor => !game.actors.has(actor.id)),
    chatsRemoved: Array.from(chats).every(id => !game.messages.has(id)),
    activeSceneRestored: !previous.activeScene || game.scenes.active?.id === previous.activeScene.id,
    viewedSceneRestored: !previous.viewedScene || canvas.scene?.id === previous.viewedScene.id,
    combatRestored: !previous.combat || game.combats.active?.id === previous.combat.id,
    settingRestored: game.settings.get("dnd5e", "bloodied") === previous.automatic,
    targetsRestored: Array.from(game.user.targets, token => token.document.uuid).sort().join() === previous.targets.sort().join(),
  };
  console.info("BCR_BLOODIED_ATTACKS_FIXTURE_CLEANUP " + JSON.stringify(result));
  return result;
}

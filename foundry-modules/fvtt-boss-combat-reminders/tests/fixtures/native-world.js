if (!game.user.isActiveGM || !["127.0.0.1", "localhost"].includes(location.hostname)
  || location.port !== "30002" || game.world.id !== "boss-reminders-native-20261123"
  || game.version !== "14.370" || game.system.version !== "6.1.1"
  || !game.modules.get("fvtt-boss-combat-reminders")?.active || game.modules.get("midi-qol")?.active) {
  throw new Error("Boss reminders fixture target mismatch");
}
if (game.scenes.some(scene => scene.name === "BCR Fixture")) throw new Error("Fixture already exists");

const fixtureScene = await Scene.create({
  name: "BCR Fixture", width: 1200, height: 800, padding: 0,
  grid: { type: 1, size: 100, distance: 5, units: "ft" },
});

function activity(name, type, condition = "") {
  const id = foundry.utils.randomID();
  return [id, { _id: id, type: "utility", name, activation: { type, value: 1, condition } }];
}

const definitions = [
  { name: "BCR Hero", pc: true, initiative: 25, hp: 35 },
  { name: "BCR Watcher", initiative: 20, hp: 30 },
  {
    name: "BCR Dragon", initiative: 18, hp: 40,
    resources: { legact: { max: 3, spent: 0 }, legres: { max: 2, spent: 0 }, lair: { value: true, inside: true } },
    features: [["Tail Swipe", [activity("Tail Swipe", "legendary")]], ["Quaking Lair", [activity("Quaking Lair", "lair")]],
      ["Bloodied Roar", [activity("Bloodied Roar", "special", "When the creature first becomes Bloodied")]]],
  },
  {
    name: "BCR Lich", initiative: 14, hp: 32,
    resources: { legact: { max: 2, spent: 0 } },
    features: [["Spectral Stride", [activity("Spectral Stride", "legendary")]]],
  },
  {
    name: "BCR Burst A", initiative: 8, hp: 8,
    features: [["Mixed Burst", [activity("Ordinary Feint", "action"), activity("Death Burst", "special", "When the creature dies")]]],
  },
  {
    name: "BCR Burst B", initiative: 6, hp: 8,
    features: [["Death Burst", [activity("Death Burst", "special", "When the creature dies")]]],
  },
];

const actors = [];
const tokens = [];
for (const [index, row] of definitions.entries()) {
  const actor = await Actor.create({
    name: row.name,
    type: row.pc ? "character" : "npc",
    system: { attributes: { hp: { value: row.hp, max: row.hp } }, ...(row.resources ? { resources: row.resources } : {}) },
  });
  if (row.features) {
    await actor.createEmbeddedDocuments("Item", row.features.map(([name, acts]) => ({
      name, type: "feat", system: { activities: Object.fromEntries(acts) },
    })));
  }
  actors.push(actor);
  const token = await actor.getTokenDocument({
    x: 100 + 200 * (index % 3), y: 100 + 200 * Math.floor(index / 3), actorLink: false,
  });
  tokens.push(token.toObject());
}
const documents = await fixtureScene.createEmbeddedDocuments("Token", tokens);
await fixtureScene.activate();
const encounter = await Combat.create({ scene: fixtureScene.id, active: true });
const initiativeByActor = new Map(actors.map((actor, index) => [actor.id, definitions[index].initiative]));
await encounter.createEmbeddedDocuments("Combatant", documents.map(token => ({
  tokenId: token.id, actorId: token.actorId, sceneId: fixtureScene.id, initiative: initiativeByActor.get(token.actorId),
})));
const player = await User.create({ name: "BCR Player", role: CONST.USER_ROLES.PLAYER });
await actors[0].update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
await player.update({ character: actors[0].id });

const common = `if (!game.user.isActiveGM || game.world.id !== "boss-reminders-native-20261123") throw Error("fixture world");
const combat = game.combats.active;
const find = name => combat.combatants.find(x => x.name === name);`;
const actions = [
  ["BCR Fail Save", `const target = find("BCR Dragon");
await target.actor.rollSavingThrow({ ability: "dex", target: 50 }, { configure: false }, {
  data: { speaker: ChatMessage.getSpeaker({ actor: target.actor, token: target.token, scene: combat.scene }) },
});`],
  ["BCR Bloodied", `const actor = find("BCR Dragon").actor;
await actor.applyDamage(actor.system.attributes.hp.value - 20);`],
  ["BCR Heal Dragon", `await find("BCR Dragon").actor.update({ "system.attributes.hp.value": 40 });`],
  ["BCR Burst Pair", `for (const name of ["BCR Burst A", "BCR Burst B"]) {
  const actor = find(name).actor;
  await actor.applyDamage(actor.system.attributes.hp.value + 1);
}`],
  ["BCR Status", `const dragon = find("BCR Dragon").actor;
const saves = game.messages.filter(message => message.type === "save").map(message => Boolean(message.system.resisted));
const state = {
  round: combat.round, active: combat.combatant?.name,
  legendary: dragon.system.resources.legact.value, resistances: dragon.system.resources.legres.value,
  inside: dragon.system.resources.lair.inside, hp: dragon.system.attributes.hp.value, saves,
  burst: ["BCR Burst A", "BCR Burst B"].map(name => find(name).actor.system.attributes.hp.value),
};
await ChatMessage.create({ whisper: [game.user.id], content: "<p>BCR evidence</p><pre>" + JSON.stringify(state) + "</pre>" });`],
];
for (const [index, [name, command]] of actions.entries()) {
  const macro = await Macro.create({ name, type: "script", command: common + "\n" + command });
  await game.user.assignHotbarMacro(macro, index + 1);
}
await encounter.startCombat();
ui.notifications.info("BCR fixture initialized. Select combat tracker and advance from BCR Hero.");

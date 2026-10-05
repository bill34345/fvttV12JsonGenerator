// Draft only. Import into existing task Macro after the fixture Macro prepared its marked Actor and Scenes.
const SCOPE = "BP368-20261003";
const MODULE = "fvtt-battlefield-painter";
const OWNER_THREAD = "01a1010c-9d38-7421-9098-596a96bc261a";
const MACRO_ID = "puIFWM0hN5bYj1BE";
const macro = game.macros.get(MACRO_ID);
if (!game.user?.isGM || game.world?.id !== "cor-cotn" || game.system?.id !== "dnd5e"
    || game.system.version !== "5.3.3" || game.version !== "14.368"
    || location.hostname !== "127.0.0.1" || location.port !== "30001"
    || !macro || macro.getFlag(MODULE, "testScope") !== SCOPE
    || macro.getFlag(MODULE, "controllerThreadId") !== OWNER_THREAD) {
  throw new Error("Core probe requires the exact authorized Mirror target and owned Macro.");
}
const isOwned = (doc, kind) => doc?.flags?.[MODULE]?.testScope === SCOPE
  && doc?.flags?.[MODULE]?.controllerThreadId === OWNER_THREAD
  && doc?.flags?.[MODULE]?.fixtureKind === kind;
const isTestEffect = effect => {
  const flag = effect?.flags?.[MODULE]?.coreProbe;
  return flag?.testScope === SCOPE && flag?.controllerThreadId === OWNER_THREAD
    && flag?.fixtureKind === "core-probe-effect";
};
const actors = game.actors.filter(actor => isOwned(actor, "actor"));
const actor = actors.length === 1 ? actors[0] : null;
const tokenRefs = actor ? game.scenes.filter(scene => isOwned(scene, "scene"))
  .flatMap(scene => [...scene.tokens].filter(token => isOwned(token, "token") && token.actorId === actor.id)
    .map(token => ({ sceneId: scene.id, tokenId: token.id }))) : [];
if (!actor || !tokenRefs.length) throw new Error("One existing scope-marked synthetic Actor and Token are required.");
const cc = game.modules.get("fvtt-custom-conditions")?.api;
const ifs = game.modules.get("fvtt-injury-fading-spirits")?.api;
const house = game.fvttHouseRules;
if (!game.modules.get("fvtt-custom-conditions")?.active || !cc
    || typeof cc.apply !== "function" || typeof cc.list !== "function"
    || typeof cc.remove !== "function" || typeof cc.injury?.getState !== "function") {
  throw new Error("Custom Conditions public API is absent; no probe mutation allowed.");
}
const checkWriter = () => {
  if (game.users.activeGM?.id !== game.user.id || game.user.active === false) throw new Error("Active GM ownership changed.");
  if (game.users.some(user => user.active && user.id !== game.user.id)) throw new Error("Other user active; run writes after player session.");
};
const probeEntry = conditionId => cc.list(actor).filter(entry => entry.instance?.conditionId === conditionId
  && entry.instance?.source === SCOPE && entry.origin === actor.uuid);
const effectView = effect => ({
  id: effect.id, name: effect.name, disabled: effect.disabled, active: effect.active,
  isSuppressed: effect.isSuppressed, statuses: [...(effect.statuses ?? [])],
  changes: effect.changes?.map(change => change.toObject?.() ?? change) ?? [],
  sourceStart: effect.toObject?.().start ?? null,
  sourceDuration: effect.toObject?.().duration ?? null,
  preparedDuration: effect.duration ? { value: effect.duration.value, units: effect.duration.units,
    expiry: effect.duration.expiry, expired: effect.duration.expired,
    secondsRemaining: effect.duration.secondsRemaining } : null,
  ccInstance: effect.flags?.["fvtt-custom-conditions"]?.condition ?? null,
});
const snapshot = () => {
  const apiEntries = cc.list(actor).filter(entry => entry.instance?.source === SCOPE);
  const injury = cc.injury.getState(actor);
  return {
    scope: SCOPE, observedAt: new Date().toISOString(), actorId: actor.id,
    actorUuid: actor.uuid, tokenRefs,
    actorSource: { hp: actor.toObject().system?.attributes?.hp,
      movement: actor.toObject().system?.attributes?.movement },
    actorPrepared: { hp: actor.system?.attributes?.hp,
      movement: actor.system?.attributes?.movement,
      statuses: [...(actor.statuses ?? [])] },
    allEffectIds: [...actor.effects].map(effect => effect.id).sort(),
    priorityEffects: [...actor.effects].filter(effect => isTestEffect(effect)
      && effect.flags[MODULE].coreProbe.probeKind === "default-priority").map(effectView),
    testEffects: apiEntries.map(entry => ({ id: entry.id, conditionId: entry.instance.conditionId,
      disabled: entry.disabled, source: entry.instance.source, origin: entry.origin,
      effect: effectView(entry.effect) })),
    injuryEnabled: cc.injury.isEnabled?.() ?? null, injury,
    ifs: game.modules.get("fvtt-injury-fading-spirits")?.active && typeof ifs?.getState === "function"
      ? { injuryOwner: ifs.injuryOwner, state: ifs.getState(actor) } : null,
    house: house ? { locked: house.runtime?.locked?.(), authority: house.runtime?.authority?.(),
      features: house.setup?.features?.() } : null,
    worldTime: game.time.worldTime, activeSceneId: game.scenes.active?.id ?? null,
    viewedSceneId: canvas.scene?.id ?? null,
  };
};
const show = async (action, extra = {}) => {
  const json = JSON.stringify({ action, ...snapshot(), ...extra }, null, 2);
  const escaped = json.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  await new foundry.applications.api.DialogV2({
    window: { title: `BP368 Core probe ${action}` }, position: { width: 840, height: 650 },
    content: `<p>Read complete JSON in the official Chrome DOM. This records observed state, not an acceptance verdict.</p><textarea id="bp368-core-probe-receipt" readonly style="width:100%;height:490px">${escaped}</textarea>`,
    buttons: [
      { action: "export", label: "Export JSON", callback: () => saveDataToFile(json, "application/json", `BP368-core-${action}.json`) },
      { action: "close", label: "Close" },
    ],
  }).render({ force: true });
};
const applyCondition = async conditionId => {
  checkWriter();
  if (probeEntry(conditionId).length) throw new Error(`${conditionId} test instance already exists.`);
  const created = await cc.apply(actor, conditionId, {}, { source: SCOPE, origin: actor.uuid });
  if (!created?.id) throw new Error(`Public API did not return a ${conditionId} ActiveEffect.`);
  await created.setFlag(MODULE, "coreProbe", {
    testScope: SCOPE, controllerThreadId: OWNER_THREAD, fixtureKind: "core-probe-effect",
  });
  await show(`${conditionId}-applied`, { createdId: created.id });
};
const expireDazed = async () => {
  checkWriter();
  const entries = probeEntry("dazed");
  if (entries.length !== 1 || !isTestEffect(entries[0].effect)) {
    throw new Error("One marked Dazed instance is required before setting its timed source.");
  }
  const before = entries[0].effect.toObject();
  if (before.duration?.value != null) throw new Error("Dazed already has timed duration data; preserve it.");
  const start = { time: game.time.worldTime - 10 };
  const duration = { value: 1, units: "seconds", expiry: null };
  await actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: entries[0].id, start, duration }]);
  await show("dazed-timed-source", { timedId: entries[0].id, requestedStart: start, requestedDuration: duration,
    note: "No world clock advancement was performed. Read Core expired/active state and actual effect persistence." });
};
const removeCondition = async conditionId => {
  checkWriter();
  const entries = probeEntry(conditionId);
  if (entries.some(entry => !isTestEffect(entry.effect))) {
    throw new Error("Found unmarked instance; refuse removal.");
  }
  for (const entry of entries) await cc.remove(actor, entry.id);
  await show(`${conditionId}-removed`, { removedIds: entries.map(entry => entry.id) });
};
const applyPriority = async () => {
  checkWriter();
  if (actor.effects.size || actor.system?.attributes?.movement?.walk !== 30) {
    throw new Error("Priority probe requires the clean synthetic Actor and prepared walk30.");
  }
  const mark = { [MODULE]: { coreProbe: { testScope: SCOPE, controllerThreadId: OWNER_THREAD,
    fixtureKind: "core-probe-effect", probeKind: "default-priority" } } };
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [
    { name: `${SCOPE} ADD10 default priority`, changes: [{ key: "system.attributes.movement.walk",
      mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "10" }], flags: mark },
    { name: `${SCOPE} MULTIPLY0.5 default priority`, changes: [{ key: "system.attributes.movement.walk",
      mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5" }], flags: mark },
  ]);
  if (created.length !== 2 || created.some(effect => !isTestEffect(effect))) throw new Error("Priority effect ownership/readback differs.");
  await show("priority-applied", { createdIds: created.map(effect => effect.id),
    note: "Inputs have no explicit change priority. Read actual source/default priorities and prepared walk; no expected outcome was written." });
};
const removePriority = async (showReceipt = true) => {
  checkWriter();
  const owned = [...actor.effects].filter(effect => isTestEffect(effect)
    && effect.flags[MODULE].coreProbe.probeKind === "default-priority");
  if (owned.length) await actor.deleteEmbeddedDocuments("ActiveEffect", owned.map(effect => effect.id));
  const removedIds = owned.map(effect => effect.id);
  if (showReceipt) await show("priority-removed", { removedIds });
  return removedIds;
};
const setInjury = async stacks => {
  checkWriter();
  if (cc.injury.isEnabled?.() !== true || typeof cc.injury.setStacks !== "function") {
    throw new Error("CC injury is not enabled; preserve settings and report this as not executed.");
  }
  const before = cc.injury.getState(actor);
  if (before.episode?.open || (stacks === 1 && before.stacks !== 0)
      || (stacks === 0 && before.stacks !== 1)) {
    throw new Error("Injury state differs from the planned 0→1→0 synthetic sequence.");
  }
  await cc.injury.setStacks(actor, stacks, `${SCOPE}:core-probe`);
  await show(`injury-${stacks}`, { before });
};
const reset = async () => {
  checkWriter();
  const entries = cc.list(actor).filter(entry => entry.instance?.source === SCOPE);
  if (entries.some(entry => !isTestEffect(entry.effect))) throw new Error("Unmarked scoped effect; refuse reset.");
  for (const entry of entries) await cc.remove(actor, entry.id);
  const removedPriorityIds = await removePriority(false);
  if (cc.injury.isEnabled?.() === true) {
    const injury = cc.injury.getState(actor);
    if (injury.episode?.open || injury.stacks > 1) throw new Error("Unexpected injury state; preserve and inspect.");
    if (injury.stacks === 1) await cc.injury.setStacks(actor, 0, `${SCOPE}:core-probe-reset`);
  }
  await show("reset", { removedEffectIds: [...entries.map(entry => entry.id), ...removedPriorityIds] });
};
const run = async action => {
  try {
    if (action === "apply-dazed") await applyCondition("dazed");
    else if (action === "time-dazed") await expireDazed();
    else if (action === "remove-dazed") await removeCondition("dazed");
    else if (action === "apply-slowed") await applyCondition("slowed");
    else if (action === "remove-slowed") await removeCondition("slowed");
    else if (action === "priority") await applyPriority();
    else if (action === "remove-priority") await removePriority();
    else if (action === "injury-one") await setInjury(1);
    else if (action === "injury-zero") await setInjury(0);
    else if (action === "reset") await reset();
    else await show("inspect");
  } catch (error) {
    await show(`${action}-error`, { error: String(error?.stack ?? error) });
  }
};
await new foundry.applications.api.DialogV2({
  window: { title: "BP368 Core compatibility probe" }, position: { width: 680 },
  content: `<p>Use only the existing marked synthetic Actor. Each button yields a visible receipt. Restore the fixture Macro before final fixture cleanup.</p>`,
  buttons: [
    { action: "inspect", label: "Inspect", callback: () => run("inspect") },
    { action: "apply-dazed", label: "Apply Dazed", callback: () => run("apply-dazed") },
    { action: "time-dazed", label: "Set Dazed timed source", callback: () => run("time-dazed") },
    { action: "remove-dazed", label: "Remove Dazed", callback: () => run("remove-dazed") },
    { action: "apply-slowed", label: "Apply Slowed", callback: () => run("apply-slowed") },
    { action: "remove-slowed", label: "Remove Slowed", callback: () => run("remove-slowed") },
    { action: "priority", label: "Default priority probe", callback: () => run("priority") },
    { action: "remove-priority", label: "Remove priority probe", callback: () => run("remove-priority") },
    { action: "injury-one", label: "Injury 1", callback: () => run("injury-one") },
    { action: "injury-zero", label: "Injury 0", callback: () => run("injury-zero") },
    { action: "reset", label: "Reset own effects", callback: () => run("reset") },
    { action: "close", label: "Close" },
  ],
}).render({ force: true });

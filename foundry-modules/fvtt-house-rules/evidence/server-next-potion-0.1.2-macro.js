await (async () => {
  const MODULE_ID = "fvtt-house-rules";
  const PREFIX = "SN-HR-POTION-012-20260924";
  const ACTOR_ID = "SnHrPt012240924A";
  const ACTOR_NAME = `${PREFIX}-Actor`;
  const ITEM_NAME = `${PREFIX}-Potion`;
  const equals = globalThis.foundry?.utils?.equals;
  const emptyMap = value => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 0;
  let actor = null;
  let item = null;
  let stage = "preflight";
  let failure = null;
  let previewCount = 0;
  let appliedCount = 0;
  let restoredCount = -1;
  const fail = code => { failure = code; throw new Error(code); };

  try {
    const url = new URL(globalThis.location.href);
    const module = game?.modules?.get(MODULE_ID);
    const api = game?.fvttHouseRules;
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || module?.active !== true || module?.version !== "0.1.2"
      || typeof api?.runtime?.locked !== "function" || api.runtime.locked() !== true
      || typeof api?.runtime?.authority !== "function" || api.runtime.authority() !== true
      || api?.setup?.features?.()?.featurePotion !== true
      || typeof api?.potion?.configure !== "function" || typeof equals !== "function"
      || typeof Actor?.create !== "function" || !Array.isArray(game?.actors?.contents)) fail("TARGET_OR_API_MISMATCH");
    if (game.actors.get(ACTOR_ID) || game.actors.contents.some(existing => existing.name?.startsWith(PREFIX))) {
      fail("PRIOR_FIXTURE_EXISTS");
    }

    stage = "actor-create";
    actor = await Actor.create({
      _id: ACTOR_ID, name: ACTOR_NAME, type: "character",
      flags: { world: { codexServerNextMigration: {
        fixture: "house-rules-potion-0.1.2", prefix: PREFIX
      } } }
    }, { keepId: true });
    if (!actor || actor.id !== ACTOR_ID || actor.name !== ACTOR_NAME || actor.pack
      || actor.getFlag("world", "codexServerNextMigration")?.fixture !== "house-rules-potion-0.1.2") {
      fail("ACTOR_READBACK_FAILED");
    }

    stage = "item-create";
    const created = await actor.createEmbeddedDocuments("Item", [{
      name: ITEM_NAME,
      type: "consumable",
      system: { activities: {} },
      flags: { [MODULE_ID]: { potion: { healing: true,
        dice: { number: 2, denomination: 4, bonus: "2" } } } }
    }]);
    item = created?.length === 1 ? created[0] : null;
    if (!item || item.name !== ITEM_NAME || item.type !== "consumable" || item.actor?.id !== ACTOR_ID
      || !emptyMap(item.toObject()?.system?.activities)) fail("ITEM_READBACK_FAILED");

    stage = "preview";
    const preview = await api.potion.configure(item, "preview");
    previewCount = Object.keys(preview?.activities ?? {}).length;
    if (previewCount !== 3 || !Object.values(preview.activities).every(activity => activity?.type === "heal")) {
      fail("PREVIEW_FAILED");
    }

    stage = "apply";
    const applied = await api.potion.configure(item, "apply");
    const afterApply = item.toObject()?.system?.activities;
    const snapshot = item.getFlag(MODULE_ID, "potionSnapshot");
    appliedCount = Object.keys(afterApply ?? {}).length;
    if (applied?.applied !== true || appliedCount !== 3 || snapshot?.schema !== 2
      || !emptyMap(snapshot.activities) || !equals(snapshot.appliedActivities, afterApply)) {
      fail("APPLY_OR_SNAPSHOT_FAILED");
    }

    stage = "restore";
    const restored = await api.potion.configure(item, "restore");
    const afterRestore = item.toObject()?.system?.activities;
    restoredCount = Object.keys(afterRestore ?? {}).length;
    if (restored?.restored !== true || !emptyMap(afterRestore)
      || item.getFlag(MODULE_ID, "potionSnapshot") != null) fail("RESTORE_FAILED");
  } catch {
    failure ??= `UNEXPECTED_${stage.toUpperCase()}`;
  }

  const status = failure === null ? "PASS" : "FAIL";
  const actorId = actor?.id ?? "none";
  let actorMarked = false;
  try {
    actorMarked = actor?.getFlag?.("world", "codexServerNextMigration")?.fixture === "house-rules-potion-0.1.2";
  } catch {
    // A failed marker read must not hide the ID returned by this invocation's Actor.create.
  }
  const itemId = item?.id ?? "none";
  const detail = failure ?? `preview=${previewCount}, apply=${appliedCount}, restore=${restoredCount}, snapshot=cleared`;
  const message = `House Rules 0.1.2 potion ${status}: ${detail}; actor=${actorId}; actorMarked=${actorMarked}; item=${itemId}`;
  if (actor) {
    try {
      await ChatMessage.create({ content: `<p>${message}</p>` });
    } catch {
      // The task-owned Actor remains available for UI inspection and precise cleanup.
    }
  }
  if (failure) ui?.notifications?.error?.(message);
  else ui?.notifications?.info?.(message);
  return { status, failure, actorId, itemId, previewCount, appliedCount, restoredCount };
})();

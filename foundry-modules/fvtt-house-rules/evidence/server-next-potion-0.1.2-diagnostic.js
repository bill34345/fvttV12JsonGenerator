await (async () => {
  const MODULE_ID = "fvtt-house-rules";
  const PREFIX = "SN-HR-POTION-012-DIAG-20260924";
  const ACTOR_ID = "SnHrPt012240924B";
  const FIXTURE = "house-rules-potion-0.1.2-diagnostic";
  const equals = globalThis.foundry?.utils?.equals;
  const emptyMap = value => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 0;
  const safeToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value)
    ? value : "unsafe";
  const errorClass = error => safeToken(error?.constructor?.name ?? error?.name ?? "Unknown");
  const report = {
    status: "FAIL", failure: "NOT_STARTED", stage: "preflight", error: "none",
    errorStage: "none", readbackError: "none",
    actor: "none", actorMarked: false, item: "none", previewCount: -1,
    previewAllHeal: false, applyReturn: "not_called", activityCount: -1,
    activityKeys: [], activityTypes: [], flagReadback: "not_read",
    snapshotSchema: "not_read", originalEmpty: null, appliedEqualsCurrent: null,
    restoreReturn: "not_called", restoredCount: -1, flagAfterRestore: "not_read"
  };
  let actor = null;
  let item = null;

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
      || typeof Actor?.create !== "function" || !Array.isArray(game?.actors?.contents)) {
      report.failure = "TARGET_OR_API_MISMATCH";
      throw new Error(report.failure);
    }
    if (game.actors.get(ACTOR_ID) || game.actors.contents.some(existing => existing.name?.startsWith(PREFIX))) {
      report.failure = "PRIOR_FIXTURE_EXISTS";
      throw new Error(report.failure);
    }

    report.stage = "actor_create";
    actor = await Actor.create({
      _id: ACTOR_ID, name: `${PREFIX}-Actor`, type: "character",
      flags: { world: { codexServerNextMigration: { fixture: FIXTURE, prefix: PREFIX } } }
    }, { keepId: true });
    report.actor = actor?.id ?? "none";
    if (!actor || actor.id !== ACTOR_ID || actor.name !== `${PREFIX}-Actor` || actor.pack
      || actor.getFlag("world", "codexServerNextMigration")?.fixture !== FIXTURE) {
      report.failure = "ACTOR_READBACK_FAILED";
      throw new Error(report.failure);
    }

    report.stage = "item_create";
    const created = await actor.createEmbeddedDocuments("Item", [{
      name: `${PREFIX}-Potion`, type: "consumable", system: { activities: {} },
      flags: { [MODULE_ID]: { potion: { healing: true,
        dice: { number: 2, denomination: 4, bonus: "2" } } } }
    }]);
    item = created?.length === 1 ? created[0] : null;
    report.item = item?.id ?? "none";
    if (!item || item.name !== `${PREFIX}-Potion` || item.type !== "consumable"
      || item.actor?.id !== ACTOR_ID || !emptyMap(item.toObject()?.system?.activities)) {
      report.failure = "ITEM_READBACK_FAILED";
      throw new Error(report.failure);
    }

    report.stage = "preview";
    const preview = await api.potion.configure(item, "preview");
    report.previewCount = Object.keys(preview?.activities ?? {}).length;
    report.previewAllHeal = report.previewCount === 3
      && Object.values(preview.activities).every(activity => activity?.type === "heal");
    if (!report.previewAllHeal) {
      report.failure = "PREVIEW_FAILED";
      throw new Error(report.failure);
    }

    report.stage = "apply";
    try {
      const applied = await api.potion.configure(item, "apply");
      report.applyReturn = applied?.applied === true ? "applied_true"
        : applied === null ? "null" : applied === undefined ? "undefined" : "other";
    } catch (error) {
      report.failure = "APPLY_THROW";
      report.error = errorClass(error);
      report.errorStage = "apply";
    }

    report.stage = "apply_readback";
    try {
      const current = item.toObject()?.system?.activities;
      const keys = current && typeof current === "object" && !Array.isArray(current)
        ? Object.keys(current) : [];
      report.activityCount = keys.length;
      report.activityKeys = keys.slice(0, 12).map(safeToken);
      report.activityTypes = keys.slice(0, 12).map(key => safeToken(current[key]?.type));
      const snapshot = item.getFlag(MODULE_ID, "potionSnapshot");
      report.flagReadback = snapshot == null ? "absent" : "present";
      report.snapshotSchema = snapshot == null ? "none"
        : Number.isInteger(snapshot.schema) ? String(snapshot.schema) : "other";
      report.originalEmpty = snapshot == null ? null : Boolean(emptyMap(snapshot.activities));
      report.appliedEqualsCurrent = snapshot?.appliedActivities == null || !current
        ? null : Boolean(equals(snapshot.appliedActivities, current));
    } catch (error) {
      if (report.failure === "NOT_STARTED") {
        report.failure = "APPLY_READBACK_THROW";
        report.error = errorClass(error);
        report.errorStage = "apply_readback";
      } else report.readbackError = errorClass(error);
    }

    if (report.failure === "NOT_STARTED" && (report.applyReturn !== "applied_true"
      || report.activityCount !== 3 || report.snapshotSchema !== "2"
      || report.originalEmpty !== true || report.appliedEqualsCurrent !== true)) {
      report.failure = "APPLY_CHECK_FAILED";
    }
    // An apply or snapshot failure must leave the Item untouched for UI Export Data/readback.
    if (report.failure !== "NOT_STARTED") return;

    report.stage = "restore";
    const restored = await api.potion.configure(item, "restore");
    report.restoreReturn = restored?.restored === true ? "restored_true"
      : restored === null ? "null" : restored === undefined ? "undefined" : "other";
    const afterRestore = item.toObject()?.system?.activities;
    report.restoredCount = Object.keys(afterRestore ?? {}).length;
    report.flagAfterRestore = item.getFlag(MODULE_ID, "potionSnapshot") == null ? "absent" : "present";
    if (report.restoreReturn !== "restored_true" || !emptyMap(afterRestore)
      || report.flagAfterRestore !== "absent") {
      report.failure = "RESTORE_CHECK_FAILED";
      return;
    }
    report.status = "PASS";
    report.failure = "none";
  } catch (error) {
    if (report.failure === "NOT_STARTED") report.failure = "UNEXPECTED_THROW";
    if (report.errorStage === "none") {
      report.error = errorClass(error);
      report.errorStage = report.stage;
    }
  } finally {
    try {
      report.actorMarked = actor?.getFlag?.("world", "codexServerNextMigration")?.fixture === FIXTURE;
    } catch {
      report.actorMarked = false;
    }
    const message = [
      `House Rules 0.1.2 diagnostic ${report.status}`,
      `failure=${report.failure}`, `stage=${report.stage}`,
      `error=${report.error}@${report.errorStage}`, `readbackError=${report.readbackError}`,
      `actor=${report.actor}`, `marked=${report.actorMarked}`, `item=${report.item}`,
      `preview=${report.previewCount}/${report.previewAllHeal}`,
      `apply=${report.applyReturn}`, `count=${report.activityCount}`,
      `keys=${report.activityKeys.join(",")}`, `types=${report.activityTypes.join(",")}`,
      `flag=${report.flagReadback}`, `schema=${report.snapshotSchema}`,
      `originalEmpty=${report.originalEmpty}`, `appliedEquals=${report.appliedEqualsCurrent}`,
      `restore=${report.restoreReturn}`, `restoredCount=${report.restoredCount}`,
      `flagAfterRestore=${report.flagAfterRestore}`
    ].join("; ");
    if (actor) {
      try {
        await ChatMessage.create({ content: `<p>${message}</p>` });
      } catch {
        // The returned Actor ID and marker remain in the notification for precise UI cleanup.
      }
    }
    if (report.status === "PASS") ui?.notifications?.info?.(message);
    else ui?.notifications?.error?.(message);
  }
})();

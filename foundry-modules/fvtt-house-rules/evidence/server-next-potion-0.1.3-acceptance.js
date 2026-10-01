await (async () => {
  const moduleId = "fvtt-house-rules";
  const prefix = "SN-HR-POTION-013-20260925";
  const actorId = "SnHrPt013250925A";
  const marker = "house-rules-potion-0.1.3-acceptance";
  const report = { status: "FAIL", stage: "preflight", failure: null, actorId, itemId: null,
    previewCount: null, appliedCount: null, applyReturn: null, rawEquals: null,
    changedRestoreReturn: null, changedNameRetained: null, restoreReturn: null,
    restoredCount: null, snapshotCleared: null };
  let recipient = null;
  try {
    const url = new URL(globalThis.location.href);
    const module = game?.modules?.get(moduleId);
    const api = game?.fvttHouseRules;
    const equals = foundry?.utils?.equals;
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || module?.active !== true || module?.version !== "0.1.3"
      || api?.runtime?.locked?.() !== true || api?.runtime?.authority?.() !== true
      || api?.setup?.features?.()?.featurePotion !== true
      || typeof api?.potion?.configure !== "function" || typeof equals !== "function")
      throw Error("TARGET_OR_API_MISMATCH");
    recipient = game.user.id;
    const existing = game.actors.get(actorId);
    if (existing) {
      report.stage = "reloaded_readback";
      const flag = existing.getFlag("world", "codexServerNextMigration");
      if (existing.name !== `${prefix}-Actor` || flag?.fixture !== marker
        || flag?.phase1Complete !== true || typeof flag.itemId !== "string")
        throw Error("PRIOR_FIXTURE_NOT_COMPLETE");
      const item = existing.items.get(flag.itemId);
      report.itemId = item?.id ?? null;
      if (!item || item.name !== `${prefix}-Potion` || item.type !== "consumable")
        throw Error("RELOADED_ITEM_MISMATCH");
      const current = item.toObject()?.system?.activities;
      report.restoredCount = current && typeof current === "object" ? Object.keys(current).length : null;
      report.snapshotCleared = item.getFlag(moduleId, "potionSnapshot") == null;
      if (report.restoredCount !== 0 || report.snapshotCleared !== true)
        throw Error("RELOADED_PERSISTENCE_FAIL");
      report.status = "PERSISTENCE_PASS";
    } else {
      if (game.actors.contents.some(actor => actor.name?.startsWith(prefix)))
        throw Error("PREFIX_COLLISION");
      report.stage = "create";
      const actor = await Actor.create({ _id: actorId, name: `${prefix}-Actor`, type: "character",
        flags: { world: { codexServerNextMigration: { fixture: marker, prefix } } } },
      { keepId: true });
      if (!actor || actor.id !== actorId || actor.name !== `${prefix}-Actor`
        || actor.pack || actor.getFlag("world", "codexServerNextMigration")?.fixture !== marker)
        throw Error("ACTOR_READBACK_FAIL");
      const created = await actor.createEmbeddedDocuments("Item", [{
        name: `${prefix}-Potion`, type: "consumable", system: { activities: {} },
        flags: { [moduleId]: { potion: { healing: true,
          dice: { number: 2, denomination: 4, bonus: "2" } } } }
      }]);
      const item = created?.length === 1 ? created[0] : null;
      report.itemId = item?.id ?? null;
      if (!item || item.name !== `${prefix}-Potion` || item.actor?.id !== actorId
        || Object.keys(item.toObject()?.system?.activities ?? {}).length !== 0)
        throw Error("ITEM_READBACK_FAIL");
      report.stage = "preview";
      const preview = await api.potion.configure(item, "preview");
      report.previewCount = Object.keys(preview?.activities ?? {}).length;
      if (report.previewCount !== 3 || !Object.values(preview.activities).every(x => x?.type === "heal"))
        throw Error("PREVIEW_FAIL");
      report.stage = "apply";
      const applied = await api.potion.configure(item, "apply");
      report.applyReturn = applied?.applied === true ? "applied_true" : String(applied);
      const afterApply = item.toObject()?.system?.activities;
      const snapshot = item.getFlag(moduleId, "potionSnapshot");
      report.appliedCount = Object.keys(afterApply ?? {}).length;
      report.rawEquals = equals(snapshot?.appliedActivities, afterApply);
      if (report.applyReturn !== "applied_true" || report.appliedCount !== 3
        || snapshot?.schema !== 2 || Object.keys(snapshot.activities ?? {}).length !== 0
        || JSON.stringify(snapshot.appliedActivities) !== JSON.stringify(afterApply))
        throw Error("APPLY_OR_SNAPSHOT_FAIL");
      report.stage = "manual_edit_protection";
      const baselineName = snapshot.appliedActivities.hrPotionFeed?.name;
      if (typeof baselineName !== "string" || !baselineName) throw Error("BASELINE_NAME_MISSING");
      await item.update({ "system.activities.hrPotionFeed.name": `${prefix}-GM-Edit` });
      if (item.toObject()?.system?.activities?.hrPotionFeed?.name !== `${prefix}-GM-Edit`)
        throw Error("MANUAL_EDIT_NOT_PERSISTED");
      const rejected = await api.potion.configure(item, "restore");
      report.changedRestoreReturn = rejected == null ? String(rejected) : "other";
      report.changedNameRetained = item.toObject()?.system?.activities?.hrPotionFeed?.name === `${prefix}-GM-Edit`;
      if (rejected !== null || !report.changedNameRetained
        || item.getFlag(moduleId, "potionSnapshot")?.schema !== 2)
        throw Error("MANUAL_EDIT_PROTECTION_FAIL");
      report.stage = "restore";
      await item.update({ "system.activities.hrPotionFeed.name": baselineName });
      if (JSON.stringify(item.toObject()?.system?.activities) !== JSON.stringify(snapshot.appliedActivities))
        throw Error("BASELINE_NOT_RESTORED");
      const restored = await api.potion.configure(item, "restore");
      report.restoreReturn = restored?.restored === true ? "restored_true" : String(restored);
      report.restoredCount = Object.keys(item.toObject()?.system?.activities ?? {}).length;
      report.snapshotCleared = item.getFlag(moduleId, "potionSnapshot") == null;
      if (report.restoreReturn !== "restored_true" || report.restoredCount !== 0
        || report.snapshotCleared !== true) throw Error("RESTORE_FAIL");
      await actor.setFlag("world", "codexServerNextMigration",
        { fixture: marker, prefix, phase1Complete: true, itemId: item.id });
      if (actor.getFlag("world", "codexServerNextMigration")?.phase1Complete !== true)
        throw Error("PHASE_MARKER_FAIL");
      report.status = "PHASE1_PASS";
    }
  } catch (error) {
    report.failure = String(error?.message ?? error);
  } finally {
    if (recipient && game?.user?.id === recipient && game.user.isGM === true) {
      const safe = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${safe}</pre>`, whisper: [recipient] }); } catch {}
      ui?.notifications?.[report.status === "FAIL" ? "error" : "info"]?.(`House potion 0.1.3 ${report.status}`);
    }
  }
})();

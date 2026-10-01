await (async () => {
  const moduleId = "fvtt-json-generator-spell-resolver";
  const actorId = "YiTnD0a3j4AtXxSp";
  const report = { status: "FAIL", failure: null, actorId, resolutionStatus: null,
    error: null, residualCount: null, residualPaths: [], residualTypes: [],
    managedSpellCount: null, unownedCacheCount: null, uniqueSpellCount: null };
  let recipient = null;
  const kind = value => value === undefined ? "missing" : value === null ? "null"
    : Array.isArray(value) ? "array" : typeof value;
  try {
    const url = new URL(globalThis.location.href);
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || game?.modules?.get(moduleId)?.version !== "0.1.6")
      throw Error("TARGET_MISMATCH");
    recipient = game.user.id;
    const actor = game.actors.get(actorId);
    if (!actor || actor.name !== "鼠神邪术师 (Warlock of the Rat God)"
      || actor.flags?.[moduleId]?.spellManifest?.manifestId
        !== "intake-55dc6bc354df0709-warlock-of-the-rat-god-innate-spellcasting-448")
      throw Error("ACTOR_SOURCE_MISMATCH");
    const state = actor.flags[moduleId]?.spellResolution;
    report.resolutionStatus = state?.status ?? null;
    report.error = typeof state?.error === "string" ? state.error.slice(0, 400) : null;
    const residual = Array.isArray(state?.residualDifferences) ? state.residualDifferences : [];
    report.residualCount = residual.length;
    report.residualPaths = residual.map(entry => String(entry?.path ?? "<invalid>")).slice(0, 80);
    report.residualTypes = residual.slice(0, 80).map(entry => ({
      path: String(entry?.path ?? "<invalid>"), beforeType: kind(entry?.before), afterType: kind(entry?.after)
    }));
    const spells = actor.items.contents.filter(item => item.type === "spell");
    report.managedSpellCount = spells.filter(item => item.flags?.[moduleId]?.managed === true).length;
    report.unownedCacheCount = spells.filter(item => item.flags?.dnd5e?.cachedFor
      && item.flags?.[moduleId]?.managed !== true).length;
    report.uniqueSpellCount = new Set(spells.map(item => item.id)).size;
    report.status = "OBSERVED";
  } catch (error) {
    report.failure = String(error?.message ?? error);
  } finally {
    if (recipient && game?.user?.id === recipient && game.user.isGM === true) {
      const safe = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${safe}</pre>`, whisper: [recipient] }); } catch {}
      ui?.notifications?.[report.status === "OBSERVED" ? "info" : "error"]?.(`Resolver Undo residual ${report.status}`);
    }
  }
})();

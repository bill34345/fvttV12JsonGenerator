await (async () => {
  const report = { status: "FAIL", failure: null, originPairs: [] };
  let recipient = null;
  try {
    const url = new URL(globalThis.location.href);
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true
      || game?.modules?.get("fvtt-json-generator-spell-resolver")?.version !== "0.1.6")
      throw Error("TARGET_MISMATCH");
    recipient = game.user.id;
    const actor = game.actors.get("YiTnD0a3j4AtXxSp");
    if (!actor || actor.name !== "鼠神邪术师 (Warlock of the Rat God)"
      || actor.flags?.["fvtt-json-generator-spell-resolver"]?.spellResolution?.status
        !== "failed-recovery-required") throw Error("ACTOR_STATUS_MISMATCH");
    const residual = actor.flags["fvtt-json-generator-spell-resolver"].spellResolution.residualDifferences;
    if (!Array.isArray(residual)) throw Error("NO_RESIDUALS");
    report.originPairs = residual.filter(entry => typeof entry?.path === "string" && entry.path.endsWith("/origin"))
      .map(entry => ({ path: entry.path,
        before: typeof entry.before === "string" ? entry.before.slice(0, 180) : typeof entry.before,
        after: typeof entry.after === "string" ? entry.after.slice(0, 180) : typeof entry.after }));
    report.status = "OBSERVED";
  } catch (error) {
    report.failure = String(error?.message ?? error);
  } finally {
    if (recipient && game?.user?.id === recipient && game.user.isGM === true) {
      const safe = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${safe}</pre>`, whisper: [recipient] }); } catch {}
    }
  }
})();

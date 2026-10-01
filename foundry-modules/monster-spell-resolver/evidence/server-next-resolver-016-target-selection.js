await (async () => {
  const sceneId = "mHpQkwDz3t2tGRgf";
  const casterActorId = "YiTnD0a3j4AtXxSp";
  const targetActorId = "4R9dJhJyu87QZPkq";
  const report = { status: "FAIL", failure: null, sceneId, casterActorId, targetActorId,
    casterTokenId: null, targetTokenId: null, controlledTokenIds: [], targetTokenIds: [], targetHP: null };
  let recipient = null;
  try {
    const url = new URL(globalThis.location.href);
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || canvas?.scene?.id !== sceneId
      || game?.modules?.get("fvtt-json-generator-spell-resolver")?.version !== "0.1.6"
      || typeof canvas?.tokens?.setTargets !== "function") throw Error("TARGET_OR_API_MISMATCH");
    recipient = game.user.id;
    const tokens = canvas.tokens.placeables;
    const casterMatches = tokens.filter(token => token.actor?.id === casterActorId);
    const targetMatches = tokens.filter(token => token.actor?.id === targetActorId);
    if (casterMatches.length !== 1 || targetMatches.length !== 1) throw Error("TOKEN_IDENTITY_NOT_UNIQUE");
    const caster = casterMatches[0], target = targetMatches[0];
    report.casterTokenId = caster.id;
    report.targetTokenId = target.id;
    report.targetHP = { value: target.actor.system?.attributes?.hp?.value,
      max: target.actor.system?.attributes?.hp?.max };
    if (!caster.control({ releaseOthers: true })) throw Error("CASTER_CONTROL_FAILED");
    canvas.tokens.setTargets([target.id], { mode: "replace" });
    report.controlledTokenIds = canvas.tokens.controlled.map(token => token.id);
    report.targetTokenIds = [...game.user.targets].map(token => token.id);
    if (report.controlledTokenIds.length !== 1 || report.controlledTokenIds[0] !== caster.id
      || report.targetTokenIds.length !== 1 || report.targetTokenIds[0] !== target.id)
      throw Error("TARGET_SELECTION_READBACK_FAILED");
    report.status = "PASS";
  } catch (error) {
    report.failure = String(error?.message ?? error);
  } finally {
    if (recipient && game?.user?.id === recipient && game.user.isGM === true) {
      const safe = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${safe}</pre>`, whisper: [recipient] }); } catch {}
      ui?.notifications?.[report.status === "PASS" ? "info" : "error"]?.(`Resolver target selection ${report.status}`);
    }
  }
})();

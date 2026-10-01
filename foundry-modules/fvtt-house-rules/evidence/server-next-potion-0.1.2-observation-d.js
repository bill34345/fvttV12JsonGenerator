await (async () => {
  const MOD = "fvtt-house-rules", PREFIX = "SN-HR-POTION-012-OBS-D-20260925";
  const ID = "SnHrPt012250925D", MARK = "house-rules-potion-0.1.2-observation-d";
  const u = globalThis.foundry?.utils;
  const token = x => typeof x === "string" && /^[\w-]{1,80}$/.test(x) ? x : "unsafe";
  const type = x => token(u.getType(x));
  const plain = x => x && typeof x === "object" && !Array.isArray(x);
  const canonical = x => Array.isArray(x) ? x.map(canonical) : plain(x)
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
  const diff = (a, b, p = "", n = 0) => {
    if (u.equals(a, b)) return null;
    const at = (path, leftType, rightType) => ({
      path: (path || "/").slice(0, 160), leftType, rightType
    });
    const leftType = type(a), rightType = type(b);
    if (n < 24 && leftType === rightType && plain(a) && plain(b)) {
      for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const path = `${p}/${token(k)}`;
        if (!Object.hasOwn(a, k) || !Object.hasOwn(b, k)) return at(path,
          Object.hasOwn(a, k) ? type(a[k]) : "Missing",
          Object.hasOwn(b, k) ? type(b[k]) : "Missing");
        const found = diff(a[k], b[k], path, n + 1);
        if (found) return found;
      }
    } else if (n < 24 && leftType === rightType && Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return at(`${p}/length`, "Number", "Number");
      for (let i = 0; i < a.length; i++) {
        const found = diff(a[i], b[i], `${p}/${i}`, n + 1);
        if (found) return found;
      }
    }
    return at(p, leftType, rightType);
  };
  const compare = (a, b) => ({
    types: [type(a), type(b)], equals: Boolean(u.equals(a, b)),
    jsonEqual: JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)),
    firstDiff: diff(a, b)
  });
  const out = { status: "FAIL", stage: "preflight", failure: "NOT_STARTED",
    actor: "none", item: "none", previewCount: -1, previewAllHeal: false,
    applyReturn: "not_called", immediate: null, nextTurn: null };
  let actor, item, gm, original;
  const observe = () => {
    const current = item.toObject()?.system?.activities;
    const snap = item.getFlag(MOD, "potionSnapshot");
    const stored = actor.items.get(item.id)?.toObject()?.system?.activities;
    return { count: plain(current) ? Object.keys(current).length : -1,
      types: [type(snap), type(snap?.appliedActivities), type(current)],
      schema: Number.isInteger(snap?.schema) ? snap.schema : "none",
      original: snap ? compare(snap.activities, original) : null,
      applied: snap?.appliedActivities == null ? null : compare(snap.appliedActivities, current),
      collection: snap?.appliedActivities == null ? null : compare(snap.appliedActivities, stored) };
  };
  try {
    const url = new URL(globalThis.location.href), api = game?.fvttHouseRules;
    const mod = game?.modules?.get(MOD);
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || mod?.active !== true || mod?.version !== "0.1.2"
      || api?.runtime?.locked?.() !== true || api?.runtime?.authority?.() !== true
      || api?.setup?.features?.()?.featurePotion !== true
      || typeof api?.potion?.configure !== "function" || typeof u?.equals !== "function"
      || typeof u?.getType !== "function" || typeof Actor?.create !== "function"
      || !Array.isArray(game?.actors?.contents)) throw Error("TARGET_OR_API_MISMATCH");
    gm = game.user.id;
    if (!/^[A-Za-z0-9]{16}$/.test(gm) || game.users?.get?.(gm) !== game.user)
      throw Error("GM_RECIPIENT_UNAVAILABLE");
    if (game.actors.get(ID) || game.actors.contents.some(a => a.name?.startsWith(PREFIX)))
      throw Error("PRIOR_FIXTURE_EXISTS");
    out.stage = "actor_create";
    actor = await Actor.create({ _id: ID, name: `${PREFIX}-Actor`, type: "character",
      flags: { world: { codexServerNextMigration: { fixture: MARK, prefix: PREFIX } } } },
    { keepId: true });
    out.actor = token(actor?.id);
    if (actor?.id !== ID || actor.name !== `${PREFIX}-Actor` || actor.pack
      || actor.getFlag("world", "codexServerNextMigration")?.fixture !== MARK)
      throw Error("ACTOR_READBACK_FAILED");
    out.stage = "item_create";
    const created = await actor.createEmbeddedDocuments("Item", [{ name: `${PREFIX}-Potion`,
      type: "consumable", system: { activities: {} }, flags: { [MOD]: { potion: {
        healing: true, dice: { number: 2, denomination: 4, bonus: "2" } } } } }]);
    item = created?.length === 1 ? created[0] : null;
    out.item = token(item?.id);
    original = item?.toObject()?.system?.activities;
    if (!item || item.name !== `${PREFIX}-Potion` || item.actor?.id !== ID
      || !plain(original) || Object.keys(original).length !== 0)
      throw Error("ITEM_READBACK_FAILED");
    out.stage = "preview";
    const preview = await api.potion.configure(item, "preview");
    out.previewCount = Object.keys(preview?.activities ?? {}).length;
    out.previewAllHeal = out.previewCount === 3
      && Object.values(preview.activities).every(a => a?.type === "heal");
    if (!out.previewAllHeal) throw Error("PREVIEW_FAILED");
    out.stage = "apply";
    try {
      const result = await api.potion.configure(item, "apply");
      out.applyReturn = result?.applied === true ? "applied_true"
        : result == null ? String(result) : "other";
    } catch (e) { out.applyReturn = `threw_${token(e?.name)}`; }
    out.stage = "immediate";
    out.immediate = observe();
    out.stage = "next_turn";
    await new Promise(resolve => setTimeout(resolve, 0));
    out.nextTurn = observe();
    out.status = out.applyReturn === "applied_true" ? "OBSERVED" : "FAIL";
    out.failure = out.status === "OBSERVED" ? "none" : "APPLY_NOT_CONFIRMED";
  } catch (e) { out.failure = token(e?.message); }
  finally {
    const validGM = gm && game?.user?.id === gm && game.user.isGM === true
      && game.users?.get?.(gm) === game.user;
    if (validGM) {
      const content = JSON.stringify(out).replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${content}</pre>`, whisper: [gm] }); }
      catch { /* The marked Actor remains for UI readback. */ }
      ui?.notifications?.[out.status === "OBSERVED" ? "info" : "error"]?.(
        `House Rules observation D ${out.status}; actor=${out.actor}; item=${out.item}`);
    }
  }
})();

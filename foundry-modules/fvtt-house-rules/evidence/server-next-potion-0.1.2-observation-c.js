await (async () => {
  const MODULE_ID = "fvtt-house-rules";
  const PREFIX = "SN-HR-POTION-012-OBS-C-20260924";
  const ACTOR_ID = "SnHrPt012240924C";
  const FIXTURE = "house-rules-potion-0.1.2-observation-c";
  const utils = globalThis.foundry?.utils;
  const safeToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
    ? value : "unsafe";
  const errorClass = error => safeToken(error?.constructor?.name ?? error?.name ?? "Unknown");
  const type = value => {
    try { return safeToken(utils.getType(value)); }
    catch { return "TypeError"; }
  };
  const emptyMap = value => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 0;
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  };
  const jsonEqual = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  const pointerSegment = key => safeToken(key).replaceAll("~", "~0").replaceAll("/", "~1");
  const firstDiff = (left, right, path = "", depth = 0) => {
    if (depth > 32) return { path: path || "/", leftType: type(left), rightType: type(right) };
    if (utils.equals(left, right)) return null;
    if (type(left) !== type(right)) {
      return { path: (path || "/").slice(0, 240), leftType: type(left), rightType: type(right) };
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return { path: `${path}/length`, leftType: "Number", rightType: "Number" };
      for (let i = 0; i < left.length; i++) {
        const diff = firstDiff(left[i], right[i], `${path}/${i}`, depth + 1);
        if (diff) return diff;
      }
    } else if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        const next = `${path}/${pointerSegment(key)}`;
        if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
          return {
            path: next.slice(0, 240),
            leftType: Object.hasOwn(left, key) ? type(left[key]) : "Missing",
            rightType: Object.hasOwn(right, key) ? type(right[key]) : "Missing"
          };
        }
        const diff = firstDiff(left[key], right[key], next, depth + 1);
        if (diff) return diff;
      }
    }
    return { path: (path || "/").slice(0, 240), leftType: type(left), rightType: type(right) };
  };
  const compare = (left, right) => {
    const equals = Boolean(utils.equals(left, right));
    return {
      leftType: type(left), rightType: type(right),
      equals, jsonEqual: jsonEqual(left, right),
      firstDiff: equals ? null : firstDiff(left, right)
    };
  };
  const report = {
    status: "FAIL", failure: "NOT_STARTED", stage: "preflight", error: "none",
    actor: "none", actorMarked: false, item: "none",
    arrayEqualsType: safeToken(typeof [].equals), emptyArrayEquals: null,
    previewCount: -1, previewAllHeal: false, applyReturn: "not_called",
    immediate: null, nextTurn: null
  };
  let actor = null;
  let item = null;
  let original = null;
  let gmRecipient = null;
  const observe = () => {
    const current = item.toObject()?.system?.activities;
    const snapshot = item.getFlag(MODULE_ID, "potionSnapshot");
    const applied = snapshot?.appliedActivities;
    const collected = actor.items.get(item.id);
    const collectionCurrent = collected?.toObject()?.system?.activities;
    const keys = current && typeof current === "object" && !Array.isArray(current)
      ? Object.keys(current) : [];
    return {
      activityCount: keys.length,
      activityKeys: keys.slice(0, 12).map(safeToken),
      activityTypes: keys.slice(0, 12).map(key => safeToken(current[key]?.type)),
      snapshotSchema: Number.isInteger(snapshot?.schema) ? snapshot.schema : "none",
      originalEmpty: snapshot == null ? null : Boolean(emptyMap(snapshot.activities)),
      originalComparison: snapshot == null ? null : compare(snapshot.activities, original),
      appliedComparison: applied == null || current == null ? null : compare(applied, current),
      collectionSameReference: collected === item,
      collectionComparison: applied == null || collectionCurrent == null
        ? null : compare(applied, collectionCurrent)
    };
  };

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
      || typeof api?.potion?.configure !== "function" || typeof utils?.equals !== "function"
      || typeof utils?.getType !== "function" || typeof Actor?.create !== "function"
      || !Array.isArray(game?.actors?.contents)) {
      report.failure = "TARGET_OR_API_MISMATCH";
      throw new Error(report.failure);
    }
    report.emptyArrayEquals = Boolean(utils.equals([], []));
    const gmId = game.user.id;
    if (typeof gmId !== "string" || !/^[A-Za-z0-9]{16}$/.test(gmId)
      || game.users?.get?.(gmId) !== game.user || game.user.isGM !== true) {
      report.failure = "GM_RECIPIENT_UNAVAILABLE";
      throw new Error(report.failure);
    }
    gmRecipient = gmId;
    if (game.actors.get(ACTOR_ID) || game.actors.contents.some(existing => existing.name?.startsWith(PREFIX))) {
      report.failure = "PRIOR_FIXTURE_EXISTS";
      throw new Error(report.failure);
    }

    report.stage = "actor_create";
    actor = await Actor.create({
      _id: ACTOR_ID, name: `${PREFIX}-Actor`, type: "character",
      flags: { world: { codexServerNextMigration: { fixture: FIXTURE, prefix: PREFIX } } }
    }, { keepId: true });
    report.actor = safeToken(actor?.id);
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
    report.item = safeToken(item?.id);
    if (!item || item.name !== `${PREFIX}-Potion` || item.type !== "consumable"
      || item.actor?.id !== ACTOR_ID || !emptyMap(item.toObject()?.system?.activities)) {
      report.failure = "ITEM_READBACK_FAILED";
      throw new Error(report.failure);
    }
    original = structuredClone(item.toObject().system.activities);

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
    const applied = await api.potion.configure(item, "apply");
    report.applyReturn = applied?.applied === true ? "applied_true"
      : applied === null ? "null" : applied === undefined ? "undefined" : "other";
    report.stage = "immediate_readback";
    report.immediate = observe();
    report.stage = "next_turn_readback";
    await new Promise(resolve => setTimeout(resolve, 0));
    report.nextTurn = observe();
    report.status = report.applyReturn === "applied_true" ? "OBSERVED" : "FAIL";
    report.failure = report.applyReturn === "applied_true" ? "none" : "APPLY_NOT_CONFIRMED";
  } catch (error) {
    if (report.failure === "NOT_STARTED") report.failure = "UNEXPECTED_THROW";
    report.error = errorClass(error);
  } finally {
    try {
      report.actorMarked = actor?.getFlag?.("world", "codexServerNextMigration")?.fixture === FIXTURE;
    } catch { report.actorMarked = false; }
    const content = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const message = `House Rules 0.1.2 observation C ${report.status}; actor=${report.actor}; item=${report.item}`;
    if (actor && gmRecipient && game?.user?.id === gmRecipient
      && game.user.isGM === true && game.users?.get?.(gmRecipient) === game.user) {
      try { await ChatMessage.create({ content: `<pre>${content}</pre>`, whisper: [gmRecipient] }); }
      catch { /* The marked Actor remains for normal UI export. */ }
    }
    if (report.status === "OBSERVED") ui?.notifications?.info?.(message);
    else ui?.notifications?.error?.(message);
  }
})();

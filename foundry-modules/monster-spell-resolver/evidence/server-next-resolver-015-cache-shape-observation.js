await (async () => {
  const actorId = "dG5rm8PFnZTD7yue";
  const featureId = "tn9d8dAJBVMEZVro";
  const activityId = "99c3995d7b593c31";
  const cacheId = "leBO9trhDQNNlDu4";
  const resolverId = "fvtt-json-generator-spell-resolver";
  const expectedManifestId = "intake-55dc6bc354df0709-warlock-of-the-rat-god-innate-spellcasting-448";
  const report = { status: "NOT_EXECUTED", actorId, featureId, activityId, cacheId,
    featurePresent: false, activityPresent: false, cachePresent: false,
    cacheHasResolverFlags: null, cachedForMatches: null, selectedUuidMatches: null,
    firstDifferences: [], failure: null };
  let recipient = null;
  const kind = value => value === undefined ? "undefined" : value === null ? "null"
    : Array.isArray(value) ? "array" : typeof value;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
  const skip = new Set(["sort", "ownership", "folder", "chat", "runtime", "timestamps",
    "createdTime", "modifiedTime", "lastModifiedBy", "exportSource", "duplicateSource"]);
  const top = new Set(["_stats", "name", "type", "img", "system", "effects", "flags",
    "activation", "consumption", "duration", "range", "target", "uses", "spell",
    "description", "attack", "save"]);
  function source(document) {
    const value = typeof document?.toObject === "function" ? document.toObject() : structuredClone(document);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    delete value._id;
    delete value.id;
    if (value.flags && typeof value.flags === "object") delete value.flags[resolverId];
    if (value.system?.description) {
      for (const key of ["value", "chat"]) {
        if (typeof value.system.description[key] === "string")
          value.system.description[key] = value.system.description[key].replaceAll("&amp;", "&");
      }
    }
    for (const effect of value.effects ?? []) {
      if (typeof effect?.description === "string") effect.description = effect.description.replaceAll("&amp;", "&");
    }
    return value;
  }
  function walk(left, right, path = []) {
    if (report.firstDifferences.length >= 16) return;
    if (Array.isArray(left)) {
      if (!Array.isArray(right) || left.length !== right.length) {
        report.firstDifferences.push({ path: `/${path.join("/")}`, leftType: `array:${left.length}`, rightType: kind(right) });
        return;
      }
      left.forEach((entry, index) => walk(entry, right[index], [...path, String(index)]));
      return;
    }
    if (left && typeof left === "object") {
      if (!right || typeof right !== "object" || Array.isArray(right)) {
        report.firstDifferences.push({ path: `/${path.join("/")}`, leftType: "object", rightType: kind(right) });
        return;
      }
      for (const key of Object.keys(left).sort()) {
        if (skip.has(key) || (path.length === 0 && !top.has(key))
          || (path.at(-1) === "uses" && key === "spent")
          || (path.at(-1) === "_stats" && ["coreVersion", "systemVersion"].includes(key))
          || (path[0] === "flags" && key !== "dnd5e" && path.length === 1)
          || (path.join("/") === "flags/dnd5e" && key !== "cachedFor")
          || left[key] === undefined) continue;
        if (!own(right, key)) report.firstDifferences.push({ path: `/${[...path, key].join("/")}`, leftType: kind(left[key]), rightType: "missing" });
        else walk(left[key], right[key], [...path, key]);
        if (report.firstDifferences.length >= 16) break;
      }
      return;
    }
    if (left !== right) report.firstDifferences.push({ path: `/${path.join("/")}`, leftType: kind(left), rightType: kind(right) });
  }
  try {
    const url = new URL(globalThis.location.href);
    const module = game?.modules?.get(resolverId);
    if (url.origin !== "http://127.0.0.1:30002" || url.pathname !== "/game"
      || game?.world?.id !== "cor-cotn" || game?.version !== "14.368"
      || game?.system?.id !== "dnd5e" || game?.system?.version !== "6.0.2"
      || game?.user?.isGM !== true || module?.active !== true || module?.version !== "0.1.5")
      throw Error("TARGET_MISMATCH");
    recipient = game.user.id;
    const actor = game.actors.get(actorId);
    if (!actor || actor.name !== "鼠神邪术师 (Warlock of the Rat God)"
      || actor.flags?.[resolverId]?.spellManifest?.manifestId !== expectedManifestId)
      throw Error("ACTOR_SOURCE_MISMATCH");
    const feature = actor.items.get(featureId);
    const cache = actor.items.get(cacheId);
    const activity = feature?.system?.activities?.get?.(activityId);
    report.featurePresent = !!feature;
    report.activityPresent = !!activity;
    report.cachePresent = !!cache;
    if (!feature || !activity || !cache || typeof activity.getCachedSpellData !== "function")
      throw Error("EXPECTED_DOCUMENTS_MISSING");
    report.cacheHasResolverFlags = cache.flags?.[resolverId] !== undefined;
    report.cachedForMatches = cache.flags?.dnd5e?.cachedFor === activity.relativeUUID;
    report.selectedUuidMatches = cache._stats?.compendiumSource === activity.spell?.uuid;
    const expected = source(await activity.getCachedSpellData());
    const actual = source(cache);
    if (!expected || !actual) throw Error("PUBLIC_SOURCE_UNAVAILABLE");
    walk(expected, actual);
    report.status = "OBSERVED";
  } catch (error) {
    report.status = "FAIL";
    report.failure = String(error?.message ?? error);
  } finally {
    if (recipient && game?.user?.id === recipient && game.user.isGM === true) {
      const safe = JSON.stringify(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      try { await ChatMessage.create({ content: `<pre>${safe}</pre>`, whisper: [recipient] }); } catch {}
      ui?.notifications?.[report.status === "FAIL" ? "error" : "info"]?.(`Resolver cache shape ${report.status}`);
    }
  }
})();

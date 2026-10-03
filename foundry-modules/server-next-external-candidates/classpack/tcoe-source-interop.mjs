const TARGET_PACK = "dnd5e_classpack.classes-new";
const TARGET_ID = "6Ce5hGue5OSI2jKj";

function isPlainMap(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function entriesById(value, label) {
  const result = new Map();
  const entries = Array.isArray(value) ? value.map(entry => [entry?._id, entry]) : Object.entries(value);
  for (const [key, entry] of entries) {
    const id = entry?._id;
    if (typeof id !== "string" || !id || key !== id || result.has(id)) {
      throw new Error(`${label} has a missing, duplicate or mismatched Advancement ID`);
    }
    result.set(id, entry);
  }
  return result;
}

/** Register narrowly scoped public hooks before TCoE registers its source callback. */
export function registerClasspackTcoeSourceInterop({ Hooks, getGame, expectedAdvancementIds }) {
  if (typeof Hooks?.on !== "function" || typeof Hooks?.once !== "function" || typeof getGame !== "function") {
    throw new TypeError("Public Hooks and getGame are required");
  }
  const expected = new Set(expectedAdvancementIds);
  if (!expected.size || [...expected].some(id => typeof id !== "string" || !id)) {
    throw new Error("Expected Ranger Advancement IDs are required");
  }
  const tracked = new WeakMap();
  const pending = new Set();
  const sourceWireCases = new Set();
  const failures = [];
  let preConverted = 0;
  let postRestored = 0;

  const eligible = (data, options) => {
    if (options?.pack !== TARGET_PACK || data?._id !== TARGET_ID || data.type !== "class"
      || data.system?.source?.rules !== "2014") return false;
    const game = getGame();
    const module = game?.modules?.get("dnd-tashas-cauldron");
    return module?.active === true && module.version === "4.0.0"
      && game.settings.get("dnd-tashas-cauldron", "insertOptionals") === true;
  };

  Hooks.on("dnd5e.initializeItemSource", (_item, data, options) => {
    let matches;
    try { matches = eligible(data, options); }
    catch (error) {
      failures.push(`Ranger eligibility check: ${error.message}`);
      return;
    }
    if (!matches) return;
    const advancement = data.system.advancement;
    if (Array.isArray(advancement)) {
      sourceWireCases.add("legacy-array");
      return; // Keep dnd5e's _needsAdvancementMigration flag truthful.
    }
    sourceWireCases.add(isPlainMap(advancement) ? "id-map" : "other");
    if (!isPlainMap(advancement)) return;
    try {
      const entries = entriesById(advancement, "Ranger source ID map");
      tracked.set(data, true);
      pending.add(data);
      data.system.advancement = [...entries.values()];
      preConverted += 1;
    } catch (error) {
      failures.push(`Ranger pre-hook: ${error.message}`);
    }
  });

  // This setup callback runs after TCoE's init-time registrations. The added
  // source callback therefore runs after the vendor's three public callbacks.
  Hooks.once("setup", () => {
    Hooks.on("dnd5e.initializeItemSource", (_item, data) => {
      if (!tracked.has(data)) return;
      try {
        if (!Array.isArray(data.system?.advancement)) throw new Error("vendor did not leave an Advancement array");
        const entries = entriesById(data.system.advancement, "Ranger post-overlay array");
        const missing = [...expected].filter(id => !entries.has(id));
        const unexpected = [...entries.keys()].filter(id => !expected.has(id));
        if (missing.length || unexpected.length) {
          throw new Error(`overlay Advancement IDs differ: missing=${missing.join(",")}; unexpected=${unexpected.join(",")}`);
        }
        data.system.advancement = Object.fromEntries(entries);
        tracked.delete(data);
        pending.delete(data);
        postRestored += 1;
      } catch (error) {
        failures.push(`Ranger post-hook: ${error.message}`);
      }
    });
  });

  return {
    assertValid() {
      if (failures.length || pending.size || !sourceWireCases.has("id-map") && !sourceWireCases.has("legacy-array")) {
        throw new Error(`Classpack TCoE source interop invalid: ${JSON.stringify({ failures,
          pending: pending.size, sourceWireCases: [...sourceWireCases] })}`);
      }
      return true;
    },
    diagnostic() {
      return { preConverted, postRestored, pending: pending.size,
        failures: [...failures], sourceWireCases: [...sourceWireCases].sort() };
    },
  };
}

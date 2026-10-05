// Applied to plain document sources; the caller supplies Foundry's mergeObject.
const has = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const idOf = value => value?._id ?? value?.id;

function byId(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const map = new Map();
  for (const entry of entries) {
    const id = idOf(entry);
    if (typeof id !== "string" || !id || map.has(id)) throw new Error(`${label} has a missing or duplicate ID`);
    map.set(id, entry);
  }
  return map;
}

function mergeEmbedded(source, update, mergeFn, label) {
  if (!has(update, "items") && !has(update, "effects")) return update;
  const result = { ...update };
  for (const key of ["items", "effects"]) {
    if (!has(update, key)) continue;
    const originals = byId(source[key] ?? [], `${label}.${key}`);
    const patches = byId(update[key], `${label}.${key} update`);
    for (const id of patches.keys()) if (!originals.has(id)) {
      throw new Error(`${label}.${key} native update added unreviewed ID ${id}`);
    }
    result[key] = (source[key] ?? []).map(original => {
      const id = idOf(original);
      const patch = patches.get(id);
      return patch ? mergeFn(original, mergeEmbedded(original, patch, mergeFn, `${label}.${key}.${id}`),
        { inplace: false, applyOperators: true }) : original;
    });
  }
  return result;
}

function authoredRules(source, label) {
  const entries = [];
  if (has(source?.system?.source, "rules")) entries.push({ id: idOf(source), path: label, rules: source.system.source.rules });
  for (const item of source?.items ?? []) {
    if (has(item?.system?.source, "rules")) entries.push({ id: idOf(item), path: `${label}.items.${idOf(item)}`, rules: item.system.source.rules });
  }
  return entries;
}

function assertIdentity(original, projected, label) {
  if (idOf(original) !== idOf(projected) || original.name !== projected.name) {
    throw new Error(`${label} ID or name changed`);
  }
  const oldItems = byId(original.items ?? [], `${label}.items source`);
  const newItems = byId(projected.items ?? [], `${label}.items projected`);
  if (oldItems.size !== newItems.size) throw new Error(`${label} embedded Item count changed`);
  for (const [id, item] of oldItems) {
    if (!newItems.has(id) || item.name !== newItems.get(id).name) throw new Error(`${label} embedded Item ${id} ID or name changed`);
  }
}

function sourceSafeAdvancementById(value, label) {
  if (value == null) return new Map();
  if (Array.isArray(value)) return byId(value, label);
  if (typeof value !== "object") throw new Error(`${label} is not an Advancement collection`);
  const result = new Map();
  for (const [key, entry] of Object.entries(value)) {
    const id = idOf(entry) ?? key;
    if (id !== key || result.has(id)) throw new Error(`${label} has a mismatched or duplicate ID`);
    result.set(id, entry);
  }
  return result;
}

function structuralRows(source, label) {
  const rows = [[label, idOf(source), source.name]];
  const walk = (document, path) => {
    for (const [id, effect] of byId(document.effects ?? [], `${path}.effects`)) {
      rows.push([`${path}.effects`, id, effect.name]);
    }
    for (const [id, advancement] of sourceSafeAdvancementById(document.system?.advancement, `${path}.advancement`)) {
      rows.push([`${path}.advancement`, id, advancement.name]);
    }
  };
  walk(source, label);
  for (const [id, item] of byId(source.items ?? [], `${label}.items`)) {
    rows.push([`${label}.items`, id, item.name]);
    walk(item, `${label}.items.${id}`);
  }
  return rows.sort(([a, b], [c, d]) => `${a}:${b}`.localeCompare(`${c}:${d}`));
}

function assertProjectedStructure(expected, actual, label) {
  if (JSON.stringify(structuralRows(expected, label)) !== JSON.stringify(structuralRows(actual, label))) {
    throw new Error(`${label} Actor/Item/effect/Advancement IDs or names differ from projection`);
  }
}

function hasEntries(value) {
  return value != null && (typeof value.size === "number" ? value.size > 0
    : typeof value.length === "number" ? value.length > 0 : Object.keys(value).length > 0);
}

function assertNoInvalid(document, label) {
  const check = (entry, path) => {
    if (hasEntries(entry?.invalidDocumentIds)) throw new Error(`${path} has invalidDocumentIds`);
    // Core DataModel exposes a sealed {fields:null, joint:null} even when valid.
    // The container's keys are not failures; only actual field/joint failures are.
    const failures = entry?.validationFailures;
    if (failures && Object.values(failures).some(value => value != null)) {
      throw new Error(`${path} has validationFailures`);
    }
  };
  check(document, label);
  check(document.items, `${label}.items`);
  check(document.effects, `${label}.effects`);
  for (const item of document.items ?? []) {
    check(item, `${label}.items.${item.id}`);
    check(item.effects, `${label}.items.${item.id}.effects`);
    check(item.system?.advancement, `${label}.items.${item.id}.advancement`);
  }
  check(document.system?.advancement, `${label}.advancement`);
}

function assertRulesPreserved(source, actual, label) {
  const items = byId(actual.items ?? [], `${label}.items`);
  for (const entry of authoredRules(source, idOf(source))) {
    const target = entry.path === entry.id ? actual : items.get(entry.id);
    if (target?.system?.source?.rules !== entry.rules) {
      throw new Error(`${label} authored rules differ: ${entry.path}`);
    }
  }
}

/** Materialize a dnd5e native update without losing source fields or authored rules. */
export function buildSourcePreservingMigration(source, nativeUpdate, mergeFn) {
  if (!source || typeof source !== "object" || !nativeUpdate || typeof nativeUpdate !== "object"
    || typeof mergeFn !== "function") throw new TypeError("Source, native update and Foundry mergeObject are required");
  const id = idOf(source);
  if (typeof id !== "string" || !id) throw new Error("Source document has no ID");
  const rules = authoredRules(source, id);
  const projectedSource = mergeFn(source, mergeEmbedded(source, nativeUpdate, mergeFn, id),
    { inplace: false, applyOperators: true });
  const projectedItems = byId(projectedSource.items ?? [], `${id}.items projected`);
  for (const entry of rules) {
    const target = entry.path === id ? projectedSource : projectedItems.get(entry.id);
    if (!target) throw new Error(`Authored rules target missing: ${entry.path}`);
    target.system ??= {};
    target.system.source ??= {};
    target.system.source.rules = entry.rules;
  }
  assertIdentity(source, projectedSource, id);
  return { projectedSource, audit: { documentId: id, preservedRules: rules } };
}

/** Plan and validate a document before any pack write. */
export function prepareSourcePreservingMigration(document, pack, migrationData, {
  foundry, migrations, removedDuplicateEffects = [], legacyAdvancementArrays = false, verifySource,
} = {}) {
  if (!["Actor", "Item"].includes(pack?.documentName)) throw new Error("Native source migration requires an Actor or Item pack");
  if (!foundry?.utils?.mergeObject || !migrations?.migrateActorData || !migrations?.migrateItemData) {
    throw new Error("dnd5e native migration helpers and Foundry mergeObject are required");
  }
  const source = document.toObject();
  const id = idOf(source);
  try {
    const flags = { bypassVersionCheck: false, persistSourceMigration: false };
    const nativeUpdate = pack.documentName === "Actor"
      ? migrations.migrateActorData(document, source, migrationData, flags, { actorUuid: document.uuid })
      : migrations.migrateItemData(document, source, migrationData, flags);
    const { projectedSource, audit } = buildSourcePreservingMigration(source, nativeUpdate, foundry.utils.mergeObject);
    const allowedRemoved = new Set(removedDuplicateEffects);
    const deleteEffectIds = (projectedSource.effects ?? []).filter(effect =>
      allowedRemoved.has(`${document.uuid}.ActiveEffect.${idOf(effect)}`)).map(idOf);
    if (deleteEffectIds.length) projectedSource.effects = projectedSource.effects.filter(effect => !deleteEffectIds.includes(idOf(effect)));
    const wireSource = structuredClone(projectedSource);
    if (legacyAdvancementArrays) {
      if (!["class", "subclass"].includes(wireSource.type) || wireSource.system?.source?.rules !== "2014") {
        throw new Error("Legacy advancement wire shape requires an explicitly reviewed 2014 class/subclass");
      }
      const advancements = sourceSafeAdvancementById(wireSource.system.advancement, `${id}.advancement`);
      for (const [key, entry] of advancements) if (idOf(entry) !== key) {
        throw new Error("Reviewed legacy advancement wire entry is missing its exact source ID");
      }
      wireSource.system.advancement = [...advancements.values()];
    }
    // Only the reviewed active TCoE interoperability cases use its required input
    // array. dnd5e6 migrateStorage normalizes this into the same complete ID map.
    const candidate = new pack.documentClass(structuredClone(wireSource), { pack: pack.collection });
    if (candidate.validate({ strict: true, dropInvalidEmbedded: false }) === false) {
      throw new Error("projected source failed strict validation");
    }
    assertNoInvalid(candidate, `${id} candidate`);
    const candidateSource = candidate.toObject();
    assertProjectedStructure(projectedSource, candidateSource, `${id} candidate`);
    assertRulesPreserved(source, candidateSource, `${id} candidate`);
    verifySource?.(source, candidateSource, `${id} candidate`);
    return { projectedSource, wireSource, audit, deleteEffectIds, source };
  } catch (error) {
    throw new Error(`Native source projection failed in ${pack.collection} document ${id ?? document.id}: ${error.message}`, { cause: error });
  }
}

/** Apply one Actor or Item compendium pack, stopping on the first unverified document. */
export async function migrateSourcePreservingPack(pack, { game, foundry,
  migrations = game?.dnd5e?.migrations, removedDuplicateEffects = [], legacyAdvancementArrayUuids = [], verifySource } = {}) {
  if (!["Actor", "Item"].includes(pack?.documentName)) throw new Error("Native source migration requires an Actor or Item pack");
  if (!foundry?.utils?.mergeObject || !migrations?.getMigrationData || !migrations?.migrateActorData
    || !migrations?.migrateItemData) throw new Error("dnd5e native migration helpers and Foundry mergeObject are required");
  const wasLocked = pack.locked;
  const completed = [];
  try {
    await pack.configure({ locked: false });
    const migrationData = await migrations.getMigrationData();
    const documents = await pack.getDocuments();
    // Project every document before the first write, including native new-effect guards.
    const plans = documents.map(document => ({ document, ...prepareSourcePreservingMigration(
      document, pack, migrationData, { foundry, migrations, removedDuplicateEffects,
        legacyAdvancementArrays: legacyAdvancementArrayUuids.includes(document.uuid), verifySource }
    ) }));
    for (const { document, source, projectedSource, wireSource, audit, deleteEffectIds } of plans) {
      const id = idOf(source);
      try {
        await document.update(wireSource, { diff: false, recursive: false, render: false });
        if (deleteEffectIds.length) await document.deleteEmbeddedDocuments("ActiveEffect", deleteEffectIds);
        const storedDocuments = await pack.getDocuments({ _id: id });
        const storedDocument = storedDocuments.find(entry => entry.id === id);
        if (!storedDocument) throw new Error("backend reread did not return document");
        assertNoInvalid(storedDocument, `${id} backend`);
        if (storedDocument.validate({ strict: true, dropInvalidEmbedded: false }) === false) {
          throw new Error("backend source failed strict validation");
        }
        const stored = storedDocument.toObject();
        assertProjectedStructure(projectedSource, stored, `${id} backend`);
        assertIdentity(source, stored, id);
        assertRulesPreserved(source, stored, `${id} backend`);
        verifySource?.(source, stored, `${id} backend`);
        completed.push({ ...audit, removedDuplicateEffects: deleteEffectIds });
      } catch (error) {
        throw new Error(`Native source migration failed in ${pack.collection} document ${id ?? document.id}: ${error.message}`, { cause: error });
      }
    }
    return { collection: pack.collection, completed };
  } finally {
    await pack.configure({ locked: wasLocked });
  }
}

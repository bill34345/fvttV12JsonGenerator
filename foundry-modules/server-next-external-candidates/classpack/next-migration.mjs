// DND5E_CLASSPACK_SERVER_NEXT_RUNTIME_1
const MODULE_ID = "dnd5e_classpack";
const EXPECTED_PACK_COUNT = 21;
const ACTOR_ITEM_TYPES = new Set(["Actor", "Item"]);
const EXPECTED_FOUNDRY_VERSION = "14.368";
const EXPECTED_DND5E_VERSION = "6.0.5";
const EXPECTED_DAE_VERSION = "14.0.14+servernext.1";
const EXPECTED_MIDI_VERSION = "14.6.0-beta.4338eeab.local.10";
const MIGRATION_REVISION = 4;
const EXPECTED_PACK_NAMES = [
  "rtable", "moditems", "loots", "extra-ability", "class-table", "classes-new",
  "class-abilityphb", "new-icon", "racial-traits", "races", "itempack",
  "spell-table", "feats-all", "subclass", "BackgroundList", "BackgroundFeature",
  "monsterspack", "races-item", "summons", "monster", "macro",
];
const TOP_PREFIX = { Actor: "!actors!", Item: "!items!", JournalEntry: "!journal!", RollTable: "!tables!", Macro: "!macros!" };
let migrationRunning = false;

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function advancementById(value) {
  if (!value || typeof value !== "object") return {};
  const entries = Array.isArray(value) ? value.map(entry => [entry?._id ?? entry?.id, entry]) : Object.entries(value);
  return Object.fromEntries(entries.map(([key, entry]) => {
    const id = entry?._id ?? entry?.id ?? key;
    if (typeof id !== "string" || !id) throw new Error("Classpack Advancement has no source ID");
    if (!Array.isArray(value) && key !== id) throw new Error("Classpack Advancement storage key differs from source ID");
    return [id, entry];
  }));
}

function sourceTextFields(value, path = "") {
  const result = [];
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    if (["items", "effects", "pages", "results"].includes(key)) continue;
    const next = path ? `${path}.${key}` : key;
    if (typeof child === "string" && /(?:description|biography|text|content)(?:\.|$)/i.test(next)) {
      result.push([next, child]);
    } else if (child && typeof child === "object") result.push(...sourceTextFields(
      key === "advancement" ? advancementById(child) : child, next));
  }
  return result.sort(([left], [right]) => left.localeCompare(right));
}

async function sourceTextMatches(source, record) {
  const paths = record.canonicalTextFieldPaths ?? record.textFieldPaths;
  if (!Array.isArray(paths) || paths.some(path => typeof path !== "string")
    || new Set(paths).size !== paths.length) {
    throw new Error(`Classpack source text paths are missing or invalid: ${record.key}`);
  }
  const expectedPaths = new Set(paths);
  const actualFields = canonicalSourceTextFields(source, record.kind);
  const authoredFields = actualFields.filter(([path]) => expectedPaths.has(path));
  // Core/dnd5e/Midi initialize additional empty text fields in the real models.
  // Preserve every original path, including blank values; reject nonempty extras.
  if (authoredFields.length !== expectedPaths.size
    || actualFields.some(([path, value]) => !expectedPaths.has(path) && value !== "")) return false;
  return await sha256(JSON.stringify(authoredFields)) === (record.canonicalTextSha256 ?? record.textSha256);
}

function canonicalSourceTextFields(source, kind) {
  return sourceTextFields(source)
    .filter(([path, value]) => !(source.type === "feat" && path === "system.description.unidentified" && value === ""))
    .map(([path, value]) => {
      // Core14 TableResult migrates the legacy text field into description.
      if (kind === "!tables.results!" && path === "text") path = "description";
      const htmlField = path === "description" || path === "text.content"
        || /^system\.description\.(?:value|chat)$/.test(path)
        || /^system\.details\.biography\.(?:value|public)$/.test(path);
      if (htmlField) value = value.replace(/<(br|hr|img|input|wbr|source|track|meta|link|area|base|embed|col|param)(\b[^<>]*?)\s*\/>/gi, "<$1$2>").trim();
      if (/^system\.activities\.[^.]+\.(?:useConditionText|effectConditionText|description\.chatFlavor|midiProperties\.triggeredActivityConditionText|overTimeProperties\.(?:pre|post)RemoveConditionText)$/.test(path)) value = value.trim();
      return [path, value];
    }).sort(([left], [right]) => left.localeCompare(right));
}

function advancementIds(value) {
  const advancement = value?.system?.advancement;
  return Object.keys(advancementById(advancement)).sort();
}

function activeUuids(value) {
  const system = value?.system;
  const found = [];
  const walk = (entry, path) => {
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      const next = path ? `${path}.${key}` : key;
      if (key === "uuid" && typeof child === "string" && child !== "") found.push([next, child]);
      else walk(child, next);
    }
  };
  for (const key of ["advancement", "activities", "spells"]) {
    walk(key === "advancement" ? advancementById(system?.[key]) : system?.[key], `system.${key}`);
  }
  return found.sort(([left], [right]) => left.localeCompare(right));
}

function findById(collection, id) {
  if (typeof collection?.get === "function") return collection.get(id);
  return [...(collection ?? [])].find(document => document.id === id);
}

function resolveSourceRecord(documents, record) {
  const ids = record.key.slice(record.kind.length).split(".");
  const root = documents.get(ids[0]);
  if (!root) return null;
  switch (record.kind) {
    case "!actors!": case "!items!": case "!journal!": case "!tables!": case "!macros!": return root;
    case "!actors.effects!": case "!items.effects!": return findById(root.effects, ids[1]);
    case "!actors.items!": return findById(root.items, ids[1]);
    case "!actors.items.effects!": return findById(findById(root.items, ids[1])?.effects, ids[2]);
    case "!journal.pages!": return findById(root.pages, ids[1]);
    case "!tables.results!": return findById(root.results, ids[1]);
    default: throw new Error(`Unexpected classpack source record kind ${record.kind}`);
  }
}

async function sourceBaseline() {
  const flags = game.modules.get(MODULE_ID)?.flags?.classpackNext;
  const expected = flags?.sourceBaselineSha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) throw new Error("Classpack source baseline hash missing from candidate manifest");
  if (!/^[a-f0-9]{64}$/.test(flags?.runtimeSha256 ?? "")) throw new Error("Classpack runtime hash missing from candidate manifest");
  const response = await fetch(`/modules/${MODULE_ID}/source-baseline.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Classpack source baseline unavailable: HTTP ${response.status}`);
  const text = await response.text();
  if (await sha256(text) !== expected) throw new Error("Classpack source baseline hash differs from candidate manifest");
  const runtimeResponse = await fetch(`/modules/${MODULE_ID}/scripts/next-migration.mjs`, { cache: "no-store" });
  if (!runtimeResponse.ok || await sha256(await runtimeResponse.text()) !== flags.runtimeSha256) {
    throw new Error("Classpack runtime source differs from candidate manifest");
  }
  const baseline = JSON.parse(text);
  if (baseline.moduleId !== MODULE_ID || baseline.upstreamVersion !== "4.3.4"
    || baseline.packs?.length !== EXPECTED_PACK_COUNT) throw new Error("Classpack source baseline identity differs");
  return baseline;
}

function assertMigrationRuntime() {
  if (game.version !== EXPECTED_FOUNDRY_VERSION) {
    throw new Error(`Classpack migration requires Foundry ${EXPECTED_FOUNDRY_VERSION}; found ${game.version}`);
  }
  if (game.system.id !== "dnd5e" || game.system.version !== EXPECTED_DND5E_VERSION) {
    throw new Error(`Classpack migration requires dnd5e ${EXPECTED_DND5E_VERSION}; found ${game.system.id} ${game.system.version}`);
  }
  const daeModule = game.modules.get("dae");
  if (daeModule?.active && daeModule.version !== EXPECTED_DAE_VERSION) {
    throw new Error(`Classpack migration requires DAE ${EXPECTED_DAE_VERSION} when DAE is active; found ${daeModule.version}`);
  }
  const midiModule = game.modules.get("midi-qol");
  if (midiModule?.active && midiModule.version !== EXPECTED_MIDI_VERSION) {
    throw new Error(`Classpack migration requires Midi-QOL ${EXPECTED_MIDI_VERSION} when Midi-QOL is active; found ${midiModule.version}`);
  }
}

function classpackPacks() {
  return game.packs
    .filter(pack => pack.metadata.packageName === MODULE_ID)
    .sort((left, right) => left.collection.localeCompare(right.collection));
}

function documentIdentity(document) {
  const identity = [document.uuid];
  for (const effect of document.effects ?? []) identity.push(effect.uuid);
  for (const item of document.items ?? []) {
    identity.push(item.uuid);
    for (const effect of item.effects ?? []) identity.push(effect.uuid);
  }
  for (const page of document.pages ?? []) identity.push(page.uuid);
  for (const result of document.results ?? []) identity.push(result.uuid);
  return identity;
}

async function collectInventory({ strictValidation = false } = {}) {
  const packs = classpackPacks();
  if (packs.length !== EXPECTED_PACK_COUNT) {
    throw new Error(`Expected ${EXPECTED_PACK_COUNT} ${MODULE_ID} packs, found ${packs.length}`);
  }
  const names = packs.map(pack => pack.metadata.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...EXPECTED_PACK_NAMES].sort())) {
    throw new Error(`Unexpected ${MODULE_ID} pack identities: ${JSON.stringify(names)}`);
  }
  const report = [];
  for (const pack of packs) {
    const documents = await pack.getDocuments();
    if (strictValidation) {
      for (const document of documents) {
        try {
          if (document.validate({ strict: true, dropInvalidEmbedded: false }) === false) {
            throw new Error("validate returned false");
          }
        } catch (error) {
          throw new Error(`Classpack schema preflight failed in ${pack.collection} ${document.id}: ${error.message}`, { cause: error });
        }
      }
    }
    if (pack.documentName === "Macro") {
      const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
      for (const macro of documents) new AsyncFunction("args", "actor", "token", macro.command);
    }
    report.push({
      collection: pack.collection,
      documentName: pack.documentName,
      documentCount: documents.length,
      identities: documents.flatMap(documentIdentity).sort(),
    });
  }
  return report;
}

async function inventory() { return collectInventory(); }

async function tcoeOverlayEnabled(baseline) {
  const module = game.modules.get("dnd-tashas-cauldron");
  if (!module?.active || !game.settings.get("dnd-tashas-cauldron", "insertOptionals")) return false;
  const expected = baseline.runtimeOverlays?.tcoe;
  if (!expected || module.version !== expected.version) throw new Error("Classpack Tasha overlay version differs from reviewed source projection");
  const response = await fetch("/modules/dnd-tashas-cauldron/scripts/modules/optional-features.mjs", { cache: "no-store" });
  if (!response.ok || await sha256(await response.text()) !== expected.scriptSha256) {
    throw new Error("Classpack Tasha overlay code differs from reviewed source projection");
  }
  return true;
}

async function verifyDaeCompendiumSourceGuard(baseline) {
  const dae = game.modules.get("dae");
  if (!dae?.active) return null;
  const expected = baseline.nativeMigrationPolicy?.daeCompendiumGuardSha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")
    || dae.flags?.serverNextLocal?.compendiumSourceGuardRevision !== 1
    || dae.flags.serverNextLocal.scriptSha256 !== expected) {
    throw new Error("Classpack DAE compendium source guard metadata differs");
  }
  const response = await fetch("/modules/dae/module/dae.js", { cache: "no-store" });
  if (!response.ok || await sha256(await response.text()) !== expected) {
    throw new Error("Classpack DAE compendium source guard code differs");
  }
  return expected;
}

function assertSourceMigrationSemantics(original, actual, label) {
  const check = (before, after, path) => {
    const fields = canonicalSourceTextFields(before, "!items!");
    const paths = new Set(fields.map(([key]) => key));
    const loaded = canonicalSourceTextFields(after, "!items!");
    if (JSON.stringify(fields) !== JSON.stringify(loaded.filter(([key]) => paths.has(key)))
      || loaded.some(([key, value]) => !paths.has(key) && value !== "")) {
      throw new Error(`${path} source prose differs after native projection/persistence`);
    }
    if (JSON.stringify(activeUuids(before)) !== JSON.stringify(activeUuids(after))) {
      throw new Error(`${path} active grants/spells differ after native projection/persistence`);
    }
  };
  check(original, actual, label);
  for (const item of original.items ?? []) {
    const loaded = (actual.items ?? []).find(entry => entry._id === item._id);
    if (!loaded) throw new Error(`${label} source embedded Item disappeared`);
    check(item, loaded, `${label}.items.${item._id}`);
  }
}
async function preflight({ migrationRemovedEffects } = {}) {
  assertMigrationRuntime();
  const baseline = await sourceBaseline();
  const tcoeEnabled = await tcoeOverlayEnabled(baseline);
  const daeCompendiumGuardSha256 = await verifyDaeCompendiumSourceGuard(baseline);
  const packs = await collectInventory({ strictValidation: true });
  const receipt = game.settings.get(MODULE_ID, "nextMigrationReceipt");
  const completed = receipt?.status === "COMPLETE" && matchesFingerprint(receipt, migrationFingerprint());
  const allowedRemoved = new Set(migrationRemovedEffects ?? (completed ? receipt.removedDuplicateEffects ?? [] : []));
  let sourceRecordsValidated = 0;
  let removedDuplicateRecordsVerified = 0;
  let detachedSourceRecordsVerified = 0;
  let authored2024NativeConflictsProtected = 0;
  let projectedDocumentsValidated = 0;
  const legacyAdvancementArrayUuids = [];
  if (typeof prepareSourcePreservingMigration !== 'function'
    || typeof migrateSourcePreservingPack !== 'function'
    || typeof game.dnd5e.migrations.getMigrationData !== 'function') {
    throw new Error('Classpack source-preserving native adapter is unavailable');
  }
  const migrationData = await game.dnd5e.migrations.getMigrationData();
  for (const pack of classpackPacks()) {
    const expected = baseline.packs.find(entry => entry.name === pack.metadata.name);
    if (!expected || expected.type !== pack.documentName) {
      throw new Error(`Classpack source baseline missing pack ${pack.collection}`);
    }
    const documents = new Map((await pack.getDocuments()).map(document => [document.id, document]));
    const topLevel = expected.records.filter(record => record.kind === TOP_PREFIX[pack.documentName]);
    if (documents.size !== topLevel.length || topLevel.some(record => !documents.has(record.id))) {
      throw new Error(`Classpack loaded document IDs/count differ from source in ${pack.collection}`);
    }
    for (const record of expected.records) {
      const document = resolveSourceRecord(documents, record);
      if (record.detachedFromParent === true) {
        if (document) throw new Error(`Classpack detached source row unexpectedly attached in ${pack.collection}: ${record.key}`);
        detachedSourceRecordsVerified += 1;
        continue;
      }
      if (!document || document.id !== record.id) {
        const ids = record.key.slice(record.kind.length).split(".");
        const removedUuid = `Compendium.${pack.collection}.Actor.${ids[0]}.ActiveEffect.${ids[1]}`;
        if (!document && record.kind === "!actors.effects!" && allowedRemoved.has(removedUuid)) {
          removedDuplicateRecordsVerified += 1;
          continue;
        }
        throw new Error(`Classpack embedded document missing from ${pack.collection}: ${record.key}`);
      }
      const source = document.toObject();
      if (record.sourceRules != null && source.system?.source?.rules !== record.sourceRules) {
        throw new Error(`Classpack authored rules edition differs in ${pack.collection}: ${record.key}`);
      }
      if (["!actors!", "!items!", "!actors.items!"].includes(record.kind)
        && source.system?.source?.rules === "2024"
        && foundry.utils.isNewerVersion("4.0.0", source._stats?.systemVersion)) {
        authored2024NativeConflictsProtected += 1;
      }
      if (record.name !== null && source.name !== record.name) {
        throw new Error(`Classpack source name differs in ${pack.collection}: ${record.key}`);
      }
      if (document.validate({ strict: true, dropInvalidEmbedded: false }) === false) {
        throw new Error(`Classpack schema validation failed in ${pack.collection}: ${record.key}`);
      }
      if (!await sourceTextMatches(source, record)) {
        throw new Error(`Classpack source text differs in ${pack.collection}: ${record.key}`);
      }
      const expectedAdvancementIds = tcoeEnabled && record.tcoeProjection ? record.tcoeProjection.advancementIds : record.advancementIds;
      const expectedActiveUuids = tcoeEnabled && record.tcoeProjection ? record.tcoeProjection.activeUuids : record.activeUuids;
      if (JSON.stringify(advancementIds(source)) !== JSON.stringify(expectedAdvancementIds)) {
        throw new Error(`Classpack Advancement IDs differ in ${pack.collection}: ${record.key}`);
      }
      if (JSON.stringify(activeUuids(source)) !== JSON.stringify(expectedActiveUuids)) {
        throw new Error(`Classpack active UUID references differ in ${pack.collection}: ${record.key}`);
      }
      sourceRecordsValidated += 1;
    }
    if (ACTOR_ITEM_TYPES.has(pack.documentName)) {
      for (const document of documents.values()) {
        prepareSourcePreservingMigration(document, pack, migrationData, {
          foundry, migrations: game.dnd5e.migrations, removedDuplicateEffects: [...allowedRemoved],
          verifySource: assertSourceMigrationSemantics,
        });
        projectedDocumentsValidated += 1;
      }
    }
  }
  if (tcoeEnabled) classpackSourceInterop.assertValid();
  return {
    ok: true,
    moduleId: MODULE_ID,
    core: game.version,
    dnd5e: game.system.version,
    packCount: packs.length,
    validatedDocuments: packs.reduce((sum, pack) => sum + pack.documentCount, 0),
    sourceRecordsValidated,
    removedDuplicateRecordsVerified,
    detachedSourceRecordsVerified,
    tcoeOverlayEnabled: tcoeEnabled,
    projectedDocumentsValidated,
    authored2024NativeConflictsProtected,
    legacyAdvancementArrayUuids,
    tcoeSourceInterop: tcoeEnabled ? classpackSourceInterop.diagnostic() : null,
    daeCompendiumGuardSha256,
    sourceBaselineSha256: game.modules.get(MODULE_ID).flags.classpackNext.sourceBaselineSha256,
    packs,
  };
}

async function waitForWorldMigrations() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const dnd5eVersion = game.settings.get("dnd5e", "systemMigrationVersion");
    const dnd5eReady = !foundry.utils.isNewerVersion(
      game.system.flags.needsMigrationVersion,
      dnd5eVersion || game.world.flags.dnd5e?.version || "0",
    );
    const daeModule = game.modules.get("dae");
    const daeAutoMigration = daeModule?.active
      ? game.settings.get("dae", "enableAutoMigration")
      : false;
    const daeReady = !daeModule?.active
      || !daeAutoMigration
      || game.settings.get("dae", "migrationVersion") === daeModule.version;
    if (dnd5eReady && daeReady) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for dnd5e/DAE world migration ownership");
}

function compareIdentity(before, after, allowedRemoved) {
  const stablePacks = value => JSON.stringify(value.map(pack => ({
    collection: pack.collection,
    documentName: pack.documentName,
  })));
  if (stablePacks(before) !== stablePacks(after)) {
    throw new Error("Classpack pack identity changed during migration");
  }
  const beforeIdentities = new Set(before.flatMap(pack => pack.identities));
  const afterIdentities = new Set(after.flatMap(pack => pack.identities));
  const added = [...afterIdentities].filter(identity => !beforeIdentities.has(identity));
  const removed = [...beforeIdentities].filter(identity => !afterIdentities.has(identity));
  const unexpectedRemoved = removed.filter(identity => !allowedRemoved.has(identity));
  if (added.length || unexpectedRemoved.length) {
    throw new Error(`Unexpected classpack identity change: ${JSON.stringify({ added, removed: unexpectedRemoved })}`);
  }
  return removed.sort();
}

async function duplicatedTransferredEffectUuids() {
  const duplicateUuids = new Set();
  for (const pack of classpackPacks().filter(pack => pack.documentName === "Actor")) {
    for (const actor of await pack.getDocuments()) {
      const source = actor.toObject();
      if (!source.effects || !source.items
        || !foundry.utils.isNewerVersion("3.0.3", source._stats?.systemVersion)) continue;
      const claimed = new Set();
      for (const item of source.items ?? []) {
        for (const effect of item.effects ?? []) {
          if (!effect.transfer) continue;
          const match = source.effects?.find(candidate => {
            const diff = foundry.utils.diffObject(candidate, effect);
            return candidate.origin?.endsWith(`Item.${item._id}`)
              && !("changes" in diff)
              && !claimed.has(candidate._id);
          });
          if (!match) continue;
          if (JSON.stringify(match.system?.changes ?? []) !== JSON.stringify(effect.system?.changes ?? [])) {
            throw new Error(`Ambiguous transferred effect changes in ${actor.uuid} Item.${item._id}`);
          }
          claimed.add(match._id);
          duplicateUuids.add(`${actor.uuid}.ActiveEffect.${match._id}`);
        }
      }
    }
  }
  return duplicateUuids;
}

async function migrateDaeDocuments(pack, migration) {
  const wasLocked = pack.locked;
  const errors = [];
  let effectsMigrated = 0;
  try {
    await pack.configure({ locked: false });
    for (const document of await pack.getDocuments()) {
      const result = pack.documentName === "Actor"
        ? await migration.migrateActor(document)
        : await migration.migrateItem(document);
      effectsMigrated += result.effectsMigrated;
      errors.push(...result.errors);
    }
  } finally {
    await pack.configure({ locked: wasLocked });
  }
  if (errors.length) throw new Error(`DAE migration failed: ${errors.join("; ")}`);
  return effectsMigrated;
}

function migrationFingerprint() {
  const module = game.modules.get(MODULE_ID);
  const flags = module?.flags?.classpackNext;
  if (!flags?.sourceBaselineSha256 || !flags?.runtimeSha256) {
    throw new Error("Classpack candidate source identity is missing");
  }
  return {
    revision: MIGRATION_REVISION,
    core: EXPECTED_FOUNDRY_VERSION,
    dnd5e: EXPECTED_DND5E_VERSION,
    daeVersion: game.modules.get("dae")?.active ? game.modules.get("dae").version : null,
    midiVersion: game.modules.get("midi-qol")?.active ? game.modules.get("midi-qol").version : null,
    moduleVersion: module.version,
    sourceBaselineSha256: flags.sourceBaselineSha256,
    runtimeSha256: flags.runtimeSha256,
    daeCompendiumGuardSha256: game.modules.get("dae")?.active ? game.modules.get("dae").flags?.serverNextLocal?.scriptSha256 : null,
    tcoeVersion: game.modules.get("dnd-tashas-cauldron")?.active ? game.modules.get("dnd-tashas-cauldron").version : null,
    tcoeInsertOptionals: game.modules.get("dnd-tashas-cauldron")?.active ? Boolean(game.settings.get("dnd-tashas-cauldron", "insertOptionals")) : false,
  };
}

function matchesFingerprint(receipt, fingerprint) {
  return Object.entries(fingerprint).every(([key, value]) => receipt?.[key] === value);
}

async function saveReceipt(receipt, { claim = false } = {}) {
  const current = game.settings.get(MODULE_ID, "nextMigrationReceipt");
  if (claim ? Boolean(current?.status) : current?.runId !== receipt.runId) {
    throw new Error("Classpack migration ownership changed; refusing receipt overwrite");
  }
  await game.settings.set(MODULE_ID, "nextMigrationReceipt", receipt);
  const readback = game.settings.get(MODULE_ID, "nextMigrationReceipt");
  if (readback?.runId !== receipt.runId || readback?.status !== receipt.status) {
    throw new Error("Classpack migration receipt readback differs; refusing further mutation");
  }
}

/** Confirm a separately restored, fully processed run without replaying any pack. */
async function confirmRecovery({ failedRunId, expectedFailedReceiptSha256, restoredUuid } = {}) {
  assertMigrationRuntime();
  if (!game.user?.isActiveGM) throw new Error("Classpack recovery requires the active GM");
  const failed = game.settings.get(MODULE_ID, "nextMigrationReceipt");
  const failedText = JSON.stringify(failed);
  if (failed?.status !== "FAILED" || failed.runId !== failedRunId
    || failed.failingPack !== "post-migration-identity-validation"
    || await sha256(failedText) !== expectedFailedReceiptSha256) {
    throw new Error("Exact failed migration receipt differs; no recovery confirmation written");
  }
  const completed = failed.completedPacks?.map(pack => pack.collection).sort();
  const expectedPacks = classpackPacks().map(pack => pack.collection).sort();
  if (JSON.stringify(completed) !== JSON.stringify(expectedPacks)) throw new Error("Recovery cannot skip unfinished packs");
  if (restoredUuid !== "Compendium.dnd5e_classpack.summons.Actor.4XOCbibDwZcdgbhV.ActiveEffect.dnd5einvisible00") {
    throw new Error("Recovery object is outside the reviewed source restoration");
  }
  if (game.settings.get(MODULE_ID, "nextMigrationRecoveryReceipt")?.status) {
    throw new Error("Recovery confirmation already exists; inspect it without rewriting");
  }
  const proof = await preflight();
  if (JSON.stringify(game.settings.get(MODULE_ID, "nextMigrationReceipt")) !== failedText
    || !game.user.isActiveGM) throw new Error("Failed receipt or recovery owner changed during validation");
  const recovery = { ...migrationFingerprint(), status: "COMPLETE", failedRunId,
    failedReceiptSha256: expectedFailedReceiptSha256, originalFailurePreserved: true,
    restoredUuids: [restoredUuid], confirmedAt: new Date().toISOString(), ownerId: game.user.id,
    sourceRecordsValidated: proof.sourceRecordsValidated,
    detachedSourceRecordsVerified: proof.detachedSourceRecordsVerified,
    identitySha256: await sha256(JSON.stringify(proof.packs)), migrationReplayed: false };
  await game.settings.set(MODULE_ID, "nextMigrationRecoveryReceipt", recovery);
  if (JSON.stringify(game.settings.get(MODULE_ID, "nextMigrationRecoveryReceipt")) !== JSON.stringify(recovery)
    || JSON.stringify(game.settings.get(MODULE_ID, "nextMigrationReceipt")) !== failedText) {
    throw new Error("Recovery receipt readback differs");
  }
  return { ok: true, recovery, sourceAcceptance: proof };
}

function migrationReport(inventoryReport, daeModule, migrated, migrationSkipped) {
  return {
    ok: true,
    moduleId: MODULE_ID,
    foundryVersion: game.version,
    systemVersion: game.system.version,
    daeVersion: daeModule?.active ? daeModule.version : null,
    packCount: inventoryReport.length,
    topLevelDocumentCount: inventoryReport.reduce((sum, pack) => sum + pack.documentCount, 0),
    identityCount: inventoryReport.reduce((sum, pack) => sum + pack.identities.length, 0),
    migrationSkipped,
    migrated,
  };
}

async function migrate() {
  if (migrationRunning) throw new Error("Classpack migration is already running in this client");
  migrationRunning = true;
  try {
  assertMigrationRuntime();
  const { packs: before, legacyAdvancementArrayUuids } = await preflight();
  const packs = classpackPacks();
  const daeModule = game.modules.get("dae");
  const fingerprint = migrationFingerprint();
  const existingReceipt = game.settings.get(MODULE_ID, "nextMigrationReceipt");
  const recovery = game.settings.get(MODULE_ID, "nextMigrationRecoveryReceipt");
  if (existingReceipt?.status === "FAILED" && recovery?.status === "COMPLETE"
    && recovery.failedRunId === existingReceipt.runId && matchesFingerprint(recovery, fingerprint)
    && recovery.failedReceiptSha256 === await sha256(JSON.stringify(existingReceipt))) {
    return { ...migrationReport(before, daeModule, [], true), recovery };
  }
  if (existingReceipt?.status === "COMPLETE" && matchesFingerprint(existingReceipt, fingerprint)) {
    const report = migrationReport(before, daeModule, [], true);
    console.info(`${MODULE_ID} | ServerNext migration already complete; verified without rewriting`, report);
    Hooks.callAll("dnd5eClasspackNextMigrated", report);
    return report;
  }
  if (existingReceipt?.status) {
    throw new Error(`Classpack migration receipt is ${existingReceipt.status}; inspect it before any replay`);
  }
  if (!game.user?.isActiveGM) throw new Error("Classpack migration requires the active GM");
  await waitForWorldMigrations();
  const allowedRemoved = await duplicatedTransferredEffectUuids();
  const daeMigration = daeModule?.active
    ? await import("/modules/dae/module/migration.js")
    : null;
  const migrated = [];
  const receipt = {
    ...fingerprint,
    status: "IN_PROGRESS",
    runId: crypto.randomUUID(),
    ownerId: game.user.id,
    startedAt: new Date().toISOString(),
    completedPacks: [],
    failingPack: null,
    error: null,
  };
  if (!game.user?.isActiveGM || game.settings.get(MODULE_ID, "nextMigrationReceipt")?.status) {
    throw new Error("Classpack migration owner or receipt changed during preflight; refusing first write");
  }
  // This is a single-executor latch, not an atomic cross-client mutex.
  await saveReceipt(receipt, { claim: true });
  let currentPack = null;
  try {
  for (const pack of packs) {
    currentPack = pack.collection;
    const current = game.settings.get(MODULE_ID, "nextMigrationReceipt");
    if (current?.runId !== receipt.runId || current?.ownerId !== game.user.id) {
      throw new Error("Classpack migration ownership changed; refusing further pack mutation");
    }
    let daeEffectsMigrated = 0;
    let packResultNative = null;
    if (ACTOR_ITEM_TYPES.has(pack.documentName)) {
      const native = await migrateSourcePreservingPack(pack, {
        game, foundry, removedDuplicateEffects: [...allowedRemoved],
        legacyAdvancementArrayUuids, verifySource: assertSourceMigrationSemantics,
      });
      // Only counts and precise changes enter the world receipt; per-document rules
      // are already protected and verified against backend storage by the adapter.
      packResultNative = { documents: native.completed.length,
        preservedRules: native.completed.reduce((sum, entry) => sum + entry.preservedRules.length, 0) };
      if (daeMigration) daeEffectsMigrated = await migrateDaeDocuments(pack, daeMigration);
    }
    const packResult = {
      collection: pack.collection,
      documentName: pack.documentName,
      daeEffectsMigrated,
      sourcePreservingNative: packResultNative,
    };
    migrated.push(packResult);
    receipt.completedPacks = [...migrated];
    await saveReceipt(receipt);
  }
  currentPack = "post-migration-identity-validation";
  const after = await collectInventory({ strictValidation: true });
  const removedDuplicateEffects = compareIdentity(before, after, allowedRemoved);
  currentPack = "post-migration-source-validation";
  const sourceAcceptance = await preflight({ migrationRemovedEffects: removedDuplicateEffects });
  const report = {
    ...migrationReport(after, daeModule, migrated, false),
    removedDuplicateEffects,
    sourceAcceptance: { sourceRecordsValidated: sourceAcceptance.sourceRecordsValidated,
      detachedSourceRecordsVerified: sourceAcceptance.detachedSourceRecordsVerified,
      removedDuplicateRecordsVerified: sourceAcceptance.removedDuplicateRecordsVerified,
      projectedDocumentsValidated: sourceAcceptance.projectedDocumentsValidated },
  };
  receipt.status = "COMPLETE";
  receipt.migratedAt = new Date().toISOString();
  receipt.removedDuplicateEffects = removedDuplicateEffects;
  await saveReceipt(receipt);
  console.info(`${MODULE_ID} | ServerNext migration complete`, report);
  Hooks.callAll("dnd5eClasspackNextMigrated", report);
  return report;
  } catch (error) {
    receipt.status = "FAILED";
    receipt.failingPack = currentPack;
    receipt.error = error instanceof Error ? error.message : String(error);
    try { await saveReceipt(receipt); }
    catch (receiptError) { throw new AggregateError([error, receiptError], "Classpack migration failed and failure receipt could not be verified"); }
    throw error;
  }
  } finally { migrationRunning = false; }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "nextMigrationReceipt", {
    scope: "world", config: false, type: Object, default: {},
  });
  game.settings.register(MODULE_ID, "nextMigrationRecoveryReceipt", {
    scope: "world", config: false, type: Object, default: {},
  });
});

Hooks.once("ready", () => {
  const api = Object.freeze({ inventory, preflight: () => preflight(), migrate, confirmRecovery,
    sourceInteropDiagnostic: () => classpackSourceInterop.diagnostic() });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.dnd5eClasspackNext = api;
  console.info(`${MODULE_ID} | ServerNext migration API ready`);
});

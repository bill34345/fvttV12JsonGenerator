// DND5E_CLASSPACK_V14_RUNTIME_1
const MODULE_ID = "dnd5e_classpack";
const EXPECTED_PACK_COUNT = 21;
const ACTOR_ITEM_TYPES = new Set(["Actor", "Item"]);
const EXPECTED_FOUNDRY_VERSION = "14.364";
const EXPECTED_DND5E_VERSION = "5.3.3";
const EXPECTED_DAE_VERSION = "14.0.12";

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

async function inventory() {
  const packs = classpackPacks();
  if (packs.length !== EXPECTED_PACK_COUNT) {
    throw new Error(`Expected ${EXPECTED_PACK_COUNT} ${MODULE_ID} packs, found ${packs.length}`);
  }
  const report = [];
  for (const pack of packs) {
    const documents = await pack.getDocuments();
    if (pack.documentName === "Macro") {
      for (const macro of documents) Function("args", "actor", "token", macro.command);
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

function migrationComplete() {
  return game.modules.get(MODULE_ID)?.flags?.classpackV14?.dataMigrationComplete === true;
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

async function migrate({ force = false } = {}) {
  assertMigrationRuntime();
  const before = await inventory();
  const packs = classpackPacks();
  const daeModule = game.modules.get("dae");
  if (migrationComplete() && !force) {
    const report = migrationReport(before, daeModule, [], true);
    console.info(`${MODULE_ID} | v14 migration already complete; verified without rewriting`, report);
    Hooks.callAll("dnd5eClasspackV14Migrated", report);
    return report;
  }
  if (!game.user?.isActiveGM) throw new Error("Classpack migration requires the active GM");
  await waitForWorldMigrations();
  const allowedRemoved = await duplicatedTransferredEffectUuids();
  const daeMigration = daeModule?.active
    ? await import("/modules/dae/module/migration.js")
    : null;
  const migrated = [];
  for (const pack of packs) {
    let daeEffectsMigrated = 0;
    if (ACTOR_ITEM_TYPES.has(pack.documentName)) {
      await game.dnd5e.migrations.migrateCompendium(pack, {
        bypassVersionCheck: true,
        strict: true,
      });
      if (daeMigration) daeEffectsMigrated = await migrateDaeDocuments(pack, daeMigration);
    }
    migrated.push({
      collection: pack.collection,
      documentName: pack.documentName,
      daeEffectsMigrated,
    });
  }
  const after = await inventory();
  const removedDuplicateEffects = compareIdentity(before, after, allowedRemoved);
  const report = {
    ...migrationReport(after, daeModule, migrated, false),
    removedDuplicateEffects,
  };
  console.info(`${MODULE_ID} | v14 migration complete`, report);
  Hooks.callAll("dnd5eClasspackV14Migrated", report);
  return report;
}

Hooks.once("ready", () => {
  const api = Object.freeze({ inventory, migrate });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.dnd5eClasspackV14 = api;
  console.info(`${MODULE_ID} | Foundry v14 compatibility API ready`);
});

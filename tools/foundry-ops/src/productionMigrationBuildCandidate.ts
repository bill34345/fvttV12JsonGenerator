// Product-owned entrypoint for building a local offline migration candidate.
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  APPROVED_LOCAL_SETTING_KEYS,
  assertProductionMigrationExecutionId,
  CHAPTER_PACK_NAME,
  EXCLUDED_TEST_PACK_NAME,
  FINAL_MODULE_STATE_OVERRIDES,
  PRODUCTION_MIGRATION_EXECUTION_ID,
  RESOLVER_INDEX_SETTING_KEY,
  mergeCompendiumConfiguration,
  mergeModuleConfiguration,
  mergeSceneStorageRecord,
  mergeWorldMetadata,
  parseSettingValue,
  withSettingValue,
  type StoredDocument,
  type WorldMetadata,
} from "./production-migration/buildCandidateSemantics";
import { hashTree } from "./world-audit/snapshot";

// Historical one-shot candidate builder for the 2026-07-28 pre-DLC cutover.
// The execution ID gate prevents its frozen module decisions from being reused
// as current production configuration.
interface CliOptions {
  executionId: string;
  localWorld: string;
  productionWorld: string;
  auditFile: string;
  appRoot: string;
  outputWorld: string;
  privateReport: string;
  redactedReport: string;
}

interface AuditPayload {
  executionId?: unknown;
  conflictCount?: unknown;
  sourceTrees?: {
    local?: unknown;
    production?: unknown;
  };
  decisions?: Array<{
    id?: unknown;
    collection?: unknown;
    decision?: unknown;
  }>;
}

interface ClassicLevelDatabase {
  iterator(): AsyncIterable<[string, Record<string, unknown>]>;
  batch(operations: Array<
    | { type: "put"; key: string; value: Record<string, unknown> }
    | { type: "del"; key: string }
  >): Promise<void>;
  close(): Promise<void>;
}

interface ClassicLevelModule {
  ClassicLevel?: new (
    location: string,
    options: { createIfMissing: false; keyEncoding: "utf8"; valueEncoding: "json" },
  ) => ClassicLevelDatabase;
}

interface RecordSelectionReport {
  collection: string;
  productionRestored: number;
  localOnlyDeleted: number;
  unchanged: number;
}

const REQUIRED_FLAGS = [
  "--execution-id",
  "--local-world",
  "--production-world",
  "--audit-file",
  "--app-root",
  "--output-world",
  "--private-report",
  "--redacted-report",
] as const;
const ALL_FLAGS = new Set<string>(REQUIRED_FLAGS);
const RECORD_COLLECTIONS = ["actors", "folders", "journal", "scenes"] as const;
const PRODUCTION_WHOLE_COLLECTIONS = ["users", "fog", "settings"] as const;
const LOCAL_WHOLE_COLLECTIONS = ["messages", "combats"] as const;

export async function runProductionMigrationBuildCandidate(options: CliOptions): Promise<void> {
  assertProductionMigrationExecutionId(options.executionId);
  const resolved = resolveOptions(options);
  await assertInputsAndOutputs(resolved);
  const classicLevelEntry = join(resolved.appRoot, "node_modules", "classic-level", "index.js");
  if (!(await lstat(classicLevelEntry)).isFile()) {
    throw new Error(`classic-level entry is not a file: ${classicLevelEntry}`);
  }
  const audit = JSON.parse(await readFile(resolved.auditFile, "utf8")) as AuditPayload;
  if (audit.executionId !== PRODUCTION_MIGRATION_EXECUTION_ID) {
    throw new Error("Three-way audit execution ID does not match the frozen migration");
  }
  if (audit.conflictCount !== 0) throw new Error("Three-way audit has unresolved conflicts");
  if (!Array.isArray(audit.decisions)) throw new Error("Three-way audit decisions are missing");

  const [localHash, productionHash] = await Promise.all([
    hashTree(resolved.localWorld),
    hashTree(resolved.productionWorld),
  ]);
  if (
    audit.sourceTrees?.local !== localHash.treeHash
    || audit.sourceTrees?.production !== productionHash.treeHash
  ) {
    throw new Error("Three-way audit source hashes no longer match the frozen worlds");
  }

  const expectedLocalOnly = new Set(
    audit.decisions
      .filter((decision) => (
        isApprovedCandidateOnlyDeletion(decision.collection, decision.decision)
        && typeof decision.id === "string"
        && decision.id.startsWith("world|")
      ))
      .map((decision) => decision.id as string),
  );

  await mkdir(dirname(resolved.outputWorld), { recursive: true });
  const stagingParent = await mkdtemp(join(dirname(resolved.outputWorld), ".production-candidate-"));
  const stagingWorld = join(stagingParent, "world");
  const productionWorkingWorld = join(stagingParent, "production-reference");
  let promoted = false;
  try {
    await Promise.all([
      cp(resolved.localWorld, stagingWorld, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      }),
      cp(resolved.productionWorld, productionWorkingWorld, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      }),
    ]);
    const [copiedLocalHash, copiedProductionHash, localHashAfterCopy, productionHashAfterCopy] = await Promise.all([
      hashTree(stagingWorld),
      hashTree(productionWorkingWorld),
      hashTree(resolved.localWorld),
      hashTree(resolved.productionWorld),
    ]);
    if (
      copiedLocalHash.treeHash !== localHash.treeHash
      || localHashAfterCopy.treeHash !== localHash.treeHash
    ) {
      throw new Error("Candidate staging copy does not match the frozen local world");
    }
    if (
      copiedProductionHash.treeHash !== productionHash.treeHash
      || productionHashAfterCopy.treeHash !== productionHash.treeHash
    ) {
      throw new Error("Production working copy does not match the frozen production snapshot");
    }

    const localSettingRecords = await readDatabase(
      join(stagingWorld, "data", "settings"),
      classicLevelEntry,
    );
    const expectedLocalMioPaths = countMioPaths(await readDatabase(
      join(stagingWorld, "data", "scenes"),
      classicLevelEntry,
    ));
    for (const collection of PRODUCTION_WHOLE_COLLECTIONS) {
      const destination = join(stagingWorld, "data", collection);
      assertContained(stagingWorld, destination, "Candidate collection");
      await rm(destination, { recursive: true, force: true });
      await cp(join(productionWorkingWorld, "data", collection), destination, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
    }

    const excludedPack = join(stagingWorld, "packs", EXCLUDED_TEST_PACK_NAME);
    assertContained(stagingWorld, excludedPack, "Excluded test pack");
    await rm(excludedPack, { recursive: true, force: true });

    const recordReports: RecordSelectionReport[] = [];
    for (const collection of RECORD_COLLECTIONS) {
      recordReports.push(await reconcileProductionOwnedRecords(
        collection,
        stagingWorld,
        productionWorkingWorld,
        classicLevelEntry,
        expectedLocalOnly,
      ));
    }
    if (expectedLocalOnly.size > 0) {
      throw new Error(`Audit local-add records were not reconciled: ${[...expectedLocalOnly].slice(0, 3).join(", ")}`);
    }

    const settingsReport = await mergeSettings(
      localSettingRecords,
      join(stagingWorld, "data", "settings"),
      classicLevelEntry,
    );
    await writeMergedWorldMetadata(stagingWorld, productionWorkingWorld, stagingWorld);
    const verification = await verifyCandidate({
      localWorld: resolved.localWorld,
      productionWorkingWorld,
      candidateWorld: stagingWorld,
      classicLevelEntry,
      recordReports,
      settingsReport,
      expectedLocalMioPaths,
    });
    const finalHash = await hashTree(stagingWorld);
    const privatePayload = {
      executionId: PRODUCTION_MIGRATION_EXECUTION_ID,
      target: {
        worldId: "cor-cotn",
        foundry: "14.364",
        dnd5e: "5.3.3",
      },
      paths: {
        localWorld: resolved.localWorld,
        productionWorld: resolved.productionWorld,
        outputWorld: resolved.outputWorld,
      },
      sourceHashes: {
        local: localHash.treeHash,
        production: productionHash.treeHash,
      },
      finalHash: finalHash.treeHash,
      files: {
        count: finalHash.entries.length,
        bytes: finalHash.entries.reduce((total, entry) => total + entry.bytes, 0),
      },
      recordReports,
      settingsReport,
      verification,
    };
    const redactedPayload = {
      executionId: privatePayload.executionId,
      target: privatePayload.target,
      sourceHashes: privatePayload.sourceHashes,
      finalHash: privatePayload.finalHash,
      files: privatePayload.files,
      recordReports,
      settingsReport,
      verification,
    };
    await writeAtomically(resolved.privateReport, stableJson(privatePayload));
    await writeAtomically(resolved.redactedReport, stableJson(redactedPayload));
    await rename(stagingWorld, resolved.outputWorld);
    promoted = true;
  } finally {
    await rm(stagingParent, { recursive: true, force: true });
    if (!promoted) {
      await rm(resolved.privateReport, { force: true });
      await rm(resolved.redactedReport, { force: true });
    }
  }
}

export function isApprovedCandidateOnlyDeletion(
  collection: unknown,
  decision: unknown,
): boolean {
  if (!RECORD_COLLECTIONS.includes(collection as typeof RECORD_COLLECTIONS[number])) return false;
  if (decision === "production-delete") return true;
  return decision === "local-add" && (collection === "actors" || collection === "scenes");
}

async function reconcileProductionOwnedRecords(
  collection: typeof RECORD_COLLECTIONS[number],
  candidateWorld: string,
  productionWorkingWorld: string,
  classicLevelEntry: string,
  expectedLocalOnly: Set<string>,
): Promise<RecordSelectionReport> {
  const local = await readDatabase(join(candidateWorld, "data", collection), classicLevelEntry);
  const production = await readDatabase(join(productionWorkingWorld, "data", collection), classicLevelEntry);
  const operations: Array<
    | { type: "put"; key: string; value: Record<string, unknown> }
    | { type: "del"; key: string }
  > = [];
  let productionRestored = 0;
  let localOnlyDeleted = 0;
  let unchanged = 0;
  for (const [key, localValue] of local) {
    const productionValue = production.get(key);
    if (!productionValue) {
      const identity = `world|data/${collection}|${key}`;
      if (!expectedLocalOnly.delete(identity)) {
        throw new Error(`Unadjudicated local-only ${collection} record: ${identity}`);
      }
      operations.push({ type: "del", key });
      localOnlyDeleted += 1;
      continue;
    }
    const finalValue = collection === "scenes"
      ? mergeSceneStorageRecord(key, localValue, productionValue)
      : structuredClone(productionValue);
    if (equalJson(localValue, finalValue)) {
      unchanged += 1;
    } else {
      operations.push({ type: "put", key, value: finalValue });
      productionRestored += 1;
    }
  }
  await applyDatabaseOperations(
    join(candidateWorld, "data", collection),
    classicLevelEntry,
    operations,
  );
  return { collection, productionRestored, localOnlyDeleted, unchanged };
}

async function mergeSettings(
  localRecords: Map<string, Record<string, unknown>>,
  candidateDatabasePath: string,
  classicLevelEntry: string,
): Promise<{
  approvedLocalKeys: string[];
  removedResolverIndex: number;
  moduleOverrideCount: number;
  removedDlcCompendiumEntries: number;
}> {
  const candidateRecords = await readDatabase(candidateDatabasePath, classicLevelEntry);
  const operations: Array<
    | { type: "put"; key: string; value: Record<string, unknown> }
    | { type: "del"; key: string }
  > = [];
  const deleteLogicalKey = (logicalKey: string): number => {
    let deleted = 0;
    for (const [storageKey, record] of candidateRecords) {
      if (record.key === logicalKey) {
        operations.push({ type: "del", key: storageKey });
        candidateRecords.delete(storageKey);
        deleted += 1;
      }
    }
    return deleted;
  };

  for (const settingKey of APPROVED_LOCAL_SETTING_KEYS) {
    const [storageKey, record] = requireUniqueSetting(localRecords, settingKey, "local");
    deleteLogicalKey(settingKey);
    operations.push({ type: "put", key: storageKey, value: structuredClone(record) });
    candidateRecords.set(storageKey, structuredClone(record));
  }

  const [moduleStorageKey, moduleRecord] = requireUniqueSetting(
    candidateRecords,
    "core.moduleConfiguration",
    "production candidate",
  );
  const productionModules = requirePlainObject(
    parseSettingValue(moduleRecord, "core.moduleConfiguration"),
    "core.moduleConfiguration",
  );
  const finalModules = mergeModuleConfiguration(productionModules);
  operations.push({
    type: "put",
    key: moduleStorageKey,
    value: withSettingValue(moduleRecord, "core.moduleConfiguration", finalModules),
  });
  candidateRecords.set(
    moduleStorageKey,
    withSettingValue(moduleRecord, "core.moduleConfiguration", finalModules),
  );

  const [compendiumStorageKey, compendiumRecord] = requireUniqueSetting(
    candidateRecords,
    "core.compendiumConfiguration",
    "production candidate",
  );
  const [, localCompendiumRecord] = requireUniqueSetting(
    localRecords,
    "core.compendiumConfiguration",
    "local",
  );
  const productionCompendium = requirePlainObject(
    parseSettingValue(compendiumRecord, "core.compendiumConfiguration"),
    "core.compendiumConfiguration",
  );
  const localCompendium = requirePlainObject(
    parseSettingValue(localCompendiumRecord, "core.compendiumConfiguration"),
    "local core.compendiumConfiguration",
  );
  const removedDlcCompendiumEntries = Object.keys(productionCompendium)
    .filter((key) => key.startsWith("5e-dlc-monster."))
    .length;
  const finalCompendium = mergeCompendiumConfiguration(productionCompendium, localCompendium);
  operations.push({
    type: "put",
    key: compendiumStorageKey,
    value: withSettingValue(compendiumRecord, "core.compendiumConfiguration", finalCompendium),
  });
  candidateRecords.set(
    compendiumStorageKey,
    withSettingValue(compendiumRecord, "core.compendiumConfiguration", finalCompendium),
  );

  const removedResolverIndex = deleteLogicalKey(RESOLVER_INDEX_SETTING_KEY);
  await applyDatabaseOperations(candidateDatabasePath, classicLevelEntry, operations);
  return {
    approvedLocalKeys: [...APPROVED_LOCAL_SETTING_KEYS],
    removedResolverIndex,
    moduleOverrideCount: Object.keys(FINAL_MODULE_STATE_OVERRIDES).length,
    removedDlcCompendiumEntries,
  };
}

async function writeMergedWorldMetadata(
  localWorld: string,
  productionWorld: string,
  candidateWorld: string,
): Promise<void> {
  const local = JSON.parse(await readFile(join(localWorld, "world.json"), "utf8")) as WorldMetadata;
  const production = JSON.parse(await readFile(join(productionWorld, "world.json"), "utf8")) as WorldMetadata;
  const merged = mergeWorldMetadata(local, production);
  await writeFile(join(candidateWorld, "world.json"), stableJson(merged), "utf8");
}

async function verifyCandidate(options: {
  localWorld: string;
  productionWorkingWorld: string;
  candidateWorld: string;
  classicLevelEntry: string;
  recordReports: RecordSelectionReport[];
  settingsReport: Awaited<ReturnType<typeof mergeSettings>>;
  expectedLocalMioPaths: { levels: number; tiles: number };
}): Promise<Record<string, unknown>> {
  const localWholeHashes: Record<string, string> = {};
  for (const collection of LOCAL_WHOLE_COLLECTIONS) {
    const [local, candidate] = await Promise.all([
      hashTree(join(options.localWorld, "data", collection)),
      hashTree(join(options.candidateWorld, "data", collection)),
    ]);
    if (local.treeHash !== candidate.treeHash) {
      throw new Error(`${collection} no longer matches the frozen local session state`);
    }
    localWholeHashes[collection] = candidate.treeHash;
  }
  const productionWholeHashes: Record<string, string> = {};
  for (const collection of ["users", "fog"] as const) {
    const [production, candidate] = await Promise.all([
      hashTree(join(options.productionWorkingWorld, "data", collection)),
      hashTree(join(options.candidateWorld, "data", collection)),
    ]);
    if (production.treeHash !== candidate.treeHash) {
      throw new Error(`${collection} no longer matches the production snapshot`);
    }
    productionWholeHashes[collection] = candidate.treeHash;
  }

  const settings = await readDatabase(
    join(options.candidateWorld, "data", "settings"),
    options.classicLevelEntry,
  );
  for (const key of APPROVED_LOCAL_SETTING_KEYS) requireUniqueSetting(settings, key, "final candidate");
  if (findSettings(settings, RESOLVER_INDEX_SETTING_KEY).length !== 0) {
    throw new Error("Final candidate still contains resolver index metadata");
  }
  const [, moduleRecord] = requireUniqueSetting(settings, "core.moduleConfiguration", "final candidate");
  const modules = requirePlainObject(
    parseSettingValue(moduleRecord, "core.moduleConfiguration"),
    "final core.moduleConfiguration",
  );
  for (const [moduleId, expected] of Object.entries(FINAL_MODULE_STATE_OVERRIDES)) {
    if (modules[moduleId] !== expected) {
      throw new Error(`Final module state mismatch for ${moduleId}`);
    }
  }
  const [, compendiumRecord] = requireUniqueSetting(settings, "core.compendiumConfiguration", "final candidate");
  const compendium = requirePlainObject(
    parseSettingValue(compendiumRecord, "core.compendiumConfiguration"),
    "final core.compendiumConfiguration",
  );
  if (
    !Object.hasOwn(compendium, `world.${CHAPTER_PACK_NAME}`)
    || Object.hasOwn(compendium, `world.${EXCLUDED_TEST_PACK_NAME}`)
    || Object.keys(compendium).some((key) => key.startsWith("5e-dlc-monster."))
  ) {
    throw new Error("Final compendium configuration violates the approved pack policy");
  }

  const metadata = JSON.parse(
    await readFile(join(options.candidateWorld, "world.json"), "utf8"),
  ) as WorldMetadata;
  const packNames = (metadata.packs as Array<{ name?: unknown }>).map((pack) => pack.name);
  if (
    packNames.filter((name) => name === CHAPTER_PACK_NAME).length !== 1
    || packNames.includes(EXCLUDED_TEST_PACK_NAME)
  ) {
    throw new Error("Final world metadata violates the approved pack policy");
  }
  try {
    await lstat(join(options.candidateWorld, "packs", EXCLUDED_TEST_PACK_NAME));
    throw new Error(`Excluded test pack still exists: ${EXCLUDED_TEST_PACK_NAME}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const chapterRecords = await readDatabase(
    join(options.candidateWorld, "packs", CHAPTER_PACK_NAME),
    options.classicLevelEntry,
  );
  const chapterAdventureCount = [...chapterRecords.keys()]
    .filter((key) => key.startsWith("!adventures!"))
    .length;
  if (chapterAdventureCount !== 7) {
    throw new Error(`Expected 7 chapter Adventures, found ${chapterAdventureCount}`);
  }
  const finalScenes = await readDatabase(
    join(options.candidateWorld, "data", "scenes"),
    options.classicLevelEntry,
  );
  const finalMioPaths = countMioPaths(finalScenes);
  if (
    options.expectedLocalMioPaths.levels !== finalMioPaths.levels
    || options.expectedLocalMioPaths.tiles !== finalMioPaths.tiles
  ) {
    throw new Error("Final candidate did not preserve the complete MIO scene-path set");
  }
  return {
    localWholeHashes,
    productionWholeHashes,
    chapterAdventureCount,
    packNames,
    moduleCount: Object.keys(modules).length,
    compendiumEntryCount: Object.keys(compendium).length,
    mioPaths: finalMioPaths,
    recordReports: options.recordReports,
    settingsReport: options.settingsReport,
  };
}

function countMioPaths(records: Map<string, Record<string, unknown>>): {
  levels: number;
  tiles: number;
} {
  let levels = 0;
  let tiles = 0;
  for (const [key, value] of records) {
    if (key.startsWith("!scenes.levels!")) {
      const src = nestedValue(value, ["background", "src"]);
      if (typeof src === "string" && src.includes(".__mio_v1_")) levels += 1;
    } else if (key.startsWith("!scenes.tiles!")) {
      const src = nestedValue(value, ["texture", "src"]);
      if (typeof src === "string" && src.includes(".__mio_v1_")) tiles += 1;
    }
  }
  return { levels, tiles };
}

async function readDatabase(
  path: string,
  classicLevelEntry: string,
): Promise<Map<string, Record<string, unknown>>> {
  const module = await import(pathToFileURL(classicLevelEntry).href) as ClassicLevelModule;
  if (!module.ClassicLevel) throw new Error(`classic-level entry has no ClassicLevel export: ${classicLevelEntry}`);
  let database: ClassicLevelDatabase | undefined;
  try {
    database = new module.ClassicLevel(path, {
      createIfMissing: false,
      keyEncoding: "utf8",
      valueEncoding: "json",
    });
    const records = new Map<string, Record<string, unknown>>();
    for await (const [key, value] of database.iterator()) records.set(key, value);
    return records;
  } finally {
    await database?.close();
  }
}

async function applyDatabaseOperations(
  path: string,
  classicLevelEntry: string,
  operations: Array<
    | { type: "put"; key: string; value: Record<string, unknown> }
    | { type: "del"; key: string }
  >,
): Promise<void> {
  if (operations.length === 0) return;
  const module = await import(pathToFileURL(classicLevelEntry).href) as ClassicLevelModule;
  if (!module.ClassicLevel) throw new Error(`classic-level entry has no ClassicLevel export: ${classicLevelEntry}`);
  let database: ClassicLevelDatabase | undefined;
  try {
    database = new module.ClassicLevel(path, {
      createIfMissing: false,
      keyEncoding: "utf8",
      valueEncoding: "json",
    });
    for (let offset = 0; offset < operations.length; offset += 500) {
      await database.batch(operations.slice(offset, offset + 500));
    }
  } finally {
    await database?.close();
  }
}

function requireUniqueSetting(
  records: Map<string, Record<string, unknown>>,
  logicalKey: string,
  label: string,
): [string, StoredDocument] {
  const matches = findSettings(records, logicalKey);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} setting ${logicalKey}, found ${matches.length}`);
  }
  return matches[0]!;
}

function findSettings(
  records: Map<string, Record<string, unknown>>,
  logicalKey: string,
): Array<[string, StoredDocument]> {
  return [...records.entries()]
    .filter(([, record]) => record.key === logicalKey)
    .map(([key, record]) => [key, record] as [string, StoredDocument]);
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function nestedValue(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function parseProductionMigrationBuildCandidateArgs(args: string[]): CliOptions {
  if (args.length % 2 !== 0) throw new Error(`Missing value for ${args.at(-1)}`);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1]!;
    if (!ALL_FLAGS.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) throw new Error(`Missing required argument: ${flag}`);
  }
  assertProductionMigrationExecutionId(values.get("--execution-id")!);
  return {
    executionId: values.get("--execution-id")!,
    localWorld: values.get("--local-world")!,
    productionWorld: values.get("--production-world")!,
    auditFile: values.get("--audit-file")!,
    appRoot: values.get("--app-root")!,
    outputWorld: values.get("--output-world")!,
    privateReport: values.get("--private-report")!,
    redactedReport: values.get("--redacted-report")!,
  };
}

function resolveOptions(options: CliOptions): CliOptions {
  return {
    executionId: options.executionId,
    localWorld: resolve(options.localWorld),
    productionWorld: resolve(options.productionWorld),
    auditFile: resolve(options.auditFile),
    appRoot: resolve(options.appRoot),
    outputWorld: resolve(options.outputWorld),
    privateReport: resolve(options.privateReport),
    redactedReport: resolve(options.redactedReport),
  };
}

async function assertInputsAndOutputs(options: CliOptions): Promise<void> {
  for (const [label, path] of [
    ["Local world", options.localWorld],
    ["Production world", options.productionWorld],
    ["Audit file", options.auditFile],
    ["Application root", options.appRoot],
  ] as const) {
    await lstat(path).catch((error) => {
      throw new Error(`${label} is missing: ${path}`, { cause: error });
    });
  }
  for (const [label, path] of [
    ["Output world", options.outputWorld],
    ["Private report", options.privateReport],
    ["Redacted report", options.redactedReport],
  ] as const) {
    await assertMissing(path, label);
  }
  const roots = [options.localWorld, options.productionWorld, options.outputWorld];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (pathsOverlap(roots[left]!, roots[right]!)) {
        throw new Error(`Candidate source and destination paths overlap: ${roots[left]} / ${roots[right]}`);
      }
    }
  }
}

function pathsOverlap(left: string, right: string): boolean {
  const relativePath = relative(left, right);
  const reverse = relative(right, left);
  return isContainedRelative(relativePath) || isContainedRelative(reverse);
}

function isContainedRelative(value: string): boolean {
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function assertContained(root: string, path: string, label: string): void {
  const relativePath = relative(resolve(root), resolve(path));
  if (relativePath !== "" && (relativePath.startsWith("..") || relativePath.startsWith(sep))) {
    throw new Error(`${label} escapes candidate root: ${path}`);
  }
}

async function assertMissing(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists: ${path}`);
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const suffix = createHash("sha256").update(contents).digest("hex").slice(0, 12);
  const staging = `${path}.staging-${suffix}`;
  await assertMissing(staging, "Report staging path");
  try {
    await writeFile(staging, contents, "utf8");
    await rename(staging, path);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry!)).href;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  await runProductionMigrationBuildCandidate(parseProductionMigrationBuildCandidateArgs(args));
}

if (isDirectExecution()) {
  await main();
}

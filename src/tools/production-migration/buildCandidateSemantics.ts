export interface StoredDocument {
  _id?: unknown;
  key?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

export interface WorldPack {
  name?: unknown;
  path?: unknown;
  [key: string]: unknown;
}

export interface WorldMetadata {
  id?: unknown;
  coreVersion?: unknown;
  system?: unknown;
  systemVersion?: unknown;
  lastPlayed?: unknown;
  playtime?: unknown;
  packs?: unknown;
  [key: string]: unknown;
}

export const APPROVED_LOCAL_SETTING_KEYS = [
  "core.adventureImports",
  "chat-memory-guard.worldDefaults",
  "map-image-optimizer-bridge.replacementRuns",
  "monks-combat-details.auto-scroll",
  "monks-combat-details.opencombat",
] as const;

export const RESOLVER_INDEX_SETTING_KEY = "fvtt-json-generator-spell-resolver.indexMetadata";
export const CHAPTER_PACK_NAME = "cor-cotn-chapter-archive";
export const EXCLUDED_TEST_PACK_NAME = "tttweeesstt";
export const PRODUCTION_MIGRATION_EXECUTION_ID = "20260728-220757+0800";

export function assertProductionMigrationExecutionId(value: string): void {
  if (value !== PRODUCTION_MIGRATION_EXECUTION_ID) {
    throw new Error(
      `This frozen migration tool only accepts execution ID ${PRODUCTION_MIGRATION_EXECUTION_ID}`,
    );
  }
}

// Frozen decision for the 2026-07-28 pre-DLC cutover only. This is historical
// migration semantics, not the current production module configuration.
export const FINAL_MODULE_STATE_OVERRIDES: Readonly<Record<string, boolean>> = {
  "chat-memory-guard": true,
  "map-image-optimizer-bridge": false,
  "5e-dlc-monster": false,
  tokenmagic: false,
  levels: false,
  "simple-quest": false,
  "5e-chm-online": false,
  "chat-media": false,
  "scene-packer": false,
  "monks-combat-marker": false,
  "monks-common-display": false,
  "translate-all": false,
  "token-action-hud-core": true,
  "token-action-hud-dnd5e": true,
  enhancedcombathud: false,
  "enhancedcombathud-dnd5e": false,
  autoanimations: true,
  "sync-token-actor": true,
  "sync-token-name": false,
  sequencer: true,
  simplecover5e: true,
  "hide-npc-names": true,
};

const LANDING_SCENE_ID = "EBJYd289N5uyTmlC";

export function mergeModuleConfiguration(
  production: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...structuredClone(production),
    ...FINAL_MODULE_STATE_OVERRIDES,
  };
}

export function mergeCompendiumConfiguration(
  production: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  const chapterKey = `world.${CHAPTER_PACK_NAME}`;
  if (!Object.hasOwn(local, chapterKey)) {
    throw new Error(`Local compendium configuration is missing ${chapterKey}`);
  }
  const merged = structuredClone(production);
  for (const key of Object.keys(merged)) {
    if (key.startsWith("5e-dlc-monster.") || key === `world.${EXCLUDED_TEST_PACK_NAME}`) {
      delete merged[key];
    }
  }
  merged[chapterKey] = structuredClone(local[chapterKey]);
  return merged;
}

export function mergeWorldMetadata(
  local: WorldMetadata,
  production: WorldMetadata,
): WorldMetadata {
  assertWorldMetadata(local, "local");
  assertWorldMetadata(production, "production");
  const localPacks = parsePacks(local.packs, "local");
  const productionPacks = parsePacks(production.packs, "production");
  const chapter = localPacks.filter((pack) => pack.name === CHAPTER_PACK_NAME);
  if (chapter.length !== 1) {
    throw new Error(`Expected exactly one local ${CHAPTER_PACK_NAME} pack, found ${chapter.length}`);
  }
  if (productionPacks.some((pack) => pack.name === EXCLUDED_TEST_PACK_NAME)) {
    throw new Error(`Production unexpectedly contains excluded pack ${EXCLUDED_TEST_PACK_NAME}`);
  }
  const names = new Set<string>();
  for (const pack of productionPacks) {
    const name = requirePackName(pack, "production");
    if (names.has(name)) throw new Error(`Duplicate production pack name: ${name}`);
    names.add(name);
  }
  if (names.has(CHAPTER_PACK_NAME)) {
    throw new Error(`Production already contains ${CHAPTER_PACK_NAME}; refusing an ambiguous pack merge`);
  }
  return {
    ...structuredClone(local),
    lastPlayed: structuredClone(production.lastPlayed),
    playtime: structuredClone(production.playtime),
    packs: [...structuredClone(productionPacks), structuredClone(chapter[0]!)],
  };
}

export function mergeSceneStorageRecord(
  storageKey: string,
  local: Record<string, unknown>,
  production: Record<string, unknown>,
): Record<string, unknown> {
  const namespace = parseNamespace(storageKey);
  const merged = structuredClone(production);
  if (namespace === "scenes.levels") {
    copyNestedValue(local, merged, ["background", "src"]);
  } else if (namespace === "scenes.tiles") {
    copyNestedValue(local, merged, ["texture", "src"]);
  } else if (namespace === "scenes") {
    mergeEmbeddedPathById(local, merged, "levels", ["background", "src"]);
    mergeEmbeddedPathById(local, merged, "tiles", ["texture", "src"]);
    if (storageKey === `!scenes!${LANDING_SCENE_ID}`) {
      copyNestedValue(local, merged, ["_stats", "modifiedTime"]);
    }
  }
  return merged;
}

export function parseSettingValue(
  record: StoredDocument,
  settingKey: string,
): unknown {
  if (record.key !== settingKey || typeof record.value !== "string") {
    throw new Error(`Malformed setting document for ${settingKey}`);
  }
  try {
    return JSON.parse(record.value);
  } catch (error) {
    throw new Error(`Setting ${settingKey} does not contain valid JSON`, { cause: error });
  }
}

export function withSettingValue(
  record: StoredDocument,
  settingKey: string,
  value: unknown,
): StoredDocument {
  if (record.key !== settingKey || typeof record.value !== "string") {
    throw new Error(`Malformed setting document for ${settingKey}`);
  }
  return {
    ...structuredClone(record),
    value: JSON.stringify(value),
  };
}

function assertWorldMetadata(metadata: WorldMetadata, label: string): void {
  if (
    metadata.id !== "cor-cotn"
    || metadata.coreVersion !== "14.364"
    || metadata.system !== "dnd5e"
    || metadata.systemVersion !== "5.3.3"
  ) {
    throw new Error(`Unexpected ${label} world metadata`);
  }
}

function parsePacks(value: unknown, label: string): WorldPack[] {
  if (!Array.isArray(value) || value.some((pack) => !isPlainObject(pack))) {
    throw new Error(`${label} world packs must be an array of objects`);
  }
  return value as WorldPack[];
}

function requirePackName(pack: WorldPack, label: string): string {
  if (typeof pack.name !== "string" || !pack.name) {
    throw new Error(`${label} world pack has no name`);
  }
  return pack.name;
}

function parseNamespace(storageKey: string): string {
  const [prefix, namespace, idPath, ...extra] = storageKey.split("!");
  if (prefix !== "" || !namespace || !idPath || extra.length > 0) {
    throw new Error(`Invalid Foundry storage key: ${storageKey}`);
  }
  return namespace;
}

function mergeEmbeddedPathById(
  localParent: Record<string, unknown>,
  mergedParent: Record<string, unknown>,
  field: string,
  path: string[],
): void {
  const localChildren = localParent[field];
  const mergedChildren = mergedParent[field];
  if (!Array.isArray(localChildren) || !Array.isArray(mergedChildren)) return;
  const localById = new Map<string, Record<string, unknown>>();
  for (const child of localChildren) {
    if (isPlainObject(child) && typeof child._id === "string") localById.set(child._id, child);
  }
  for (const child of mergedChildren) {
    if (!isPlainObject(child) || typeof child._id !== "string") continue;
    const localChild = localById.get(child._id);
    if (localChild) copyNestedValue(localChild, child, path);
  }
}

function copyNestedValue(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  path: string[],
): void {
  let sourceCursor: unknown = source;
  let targetCursor: Record<string, unknown> = target;
  for (const segment of path.slice(0, -1)) {
    if (!isPlainObject(sourceCursor) || !Object.hasOwn(sourceCursor, segment)) return;
    sourceCursor = sourceCursor[segment];
    if (!isPlainObject(targetCursor[segment])) targetCursor[segment] = {};
    targetCursor = targetCursor[segment] as Record<string, unknown>;
  }
  const leaf = path.at(-1);
  if (!leaf || !isPlainObject(sourceCursor) || !Object.hasOwn(sourceCursor, leaf)) return;
  targetCursor[leaf] = structuredClone(sourceCursor[leaf]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

import { createHash } from "node:crypto";
import { cp, lstat, mkdir, open, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { FileHandle } from "node:fs/promises";
import type { LevelRecord, SnapshotOptions, TreeEntry, WorldSnapshot } from "./model";

export type SnapshotCollectionReader = (
  databasePath: string,
  classicLevelEntry: string,
) => Promise<Array<{ key: string; value: Record<string, unknown> }>>;

interface ClassicLevelDatabase {
  iterator(): AsyncIterable<[string, Record<string, unknown>]>;
  close(): Promise<void>;
}

interface ClassicLevelModule {
  ClassicLevel?: new (
    location: string,
    options: { createIfMissing: false; keyEncoding: "utf8"; valueEncoding: "json" },
  ) => ClassicLevelDatabase;
}

interface FoundryWorldMetadata {
  id?: unknown;
  coreVersion?: unknown;
  system?: unknown;
}

export function parseFoundryLevelKey(collection: string, key: string): Omit<LevelRecord, "value"> {
  const [prefix, namespace, idPath, ...extra] = key.split("!");
  if (prefix !== "" || !namespace || !idPath || extra.length > 0) {
    throw new Error(`Invalid Foundry LevelDB key in ${collection}: ${key}`);
  }

  const namespaceParts = namespace.split(".");
  const identifiers = idPath.split(".");
  if (namespaceParts[0] !== collection || namespaceParts.some((part) => !part) || identifiers.some((id) => !id)) {
    throw new Error(`Invalid Foundry LevelDB namespace in ${collection}: ${key}`);
  }

  return {
    collection,
    key,
    namespace,
    parentIds: identifiers.slice(0, -1),
    embeddedPath: namespaceParts.slice(1),
  };
}

export async function hashTree(root: string): Promise<{ entries: TreeEntry[]; treeHash: string }> {
  const resolvedRoot = resolve(root);
  const entries: TreeEntry[] = [];
  await collectTreeEntries(resolvedRoot, resolvedRoot, entries);
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const treeHash = createHash("sha256");
  for (const entry of entries) {
    treeHash.update(`${entry.relativePath}\0${entry.bytes}\0${entry.sha256}\n`, "utf8");
  }
  return { entries, treeHash: treeHash.digest("hex") };
}

export async function createWorldSnapshot(
  options: SnapshotOptions,
  reader: SnapshotCollectionReader = readClassicLevelSnapshot,
): Promise<WorldSnapshot> {
  const sourceWorldRoot = resolve(options.sourceWorldRoot);
  const snapshotWorldRoot = await resolveSnapshotRoot(options.snapshotWorldRoot);
  await assertDistinctPhysicalRoots(sourceWorldRoot, snapshotWorldRoot);
  await assertNoLinksOrReparsePoints(sourceWorldRoot);
  await assertExpectedWorldMetadata(sourceWorldRoot, options);
  await mkdir(dirname(snapshotWorldRoot), { recursive: true });

  const collections = await findLiveCollections(sourceWorldRoot);
  const lockHandles = await openCollectionLocks(sourceWorldRoot, collections);
  let sourceBefore: Awaited<ReturnType<typeof hashTree>> | undefined;
  let sourceAfter: Awaited<ReturnType<typeof hashTree>> | undefined;
  let snapshotTree: Awaited<ReturnType<typeof hashTree>> | undefined;

  try {
    sourceBefore = await hashTree(sourceWorldRoot);
    await cp(sourceWorldRoot, snapshotWorldRoot, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    sourceAfter = await hashTree(sourceWorldRoot);
    if (sourceBefore.treeHash !== sourceAfter.treeHash) {
      await rm(snapshotWorldRoot, { recursive: true, force: true });
      throw new Error("Source world changed while the snapshot was being copied");
    }

    snapshotTree = await hashTree(snapshotWorldRoot);
    if (sourceBefore.treeHash !== snapshotTree.treeHash) {
      await rm(snapshotWorldRoot, { recursive: true, force: true });
      throw new Error("Snapshot bytes do not match the stopped source world");
    }
  } finally {
    await closeHandles(lockHandles);
  }

  if (!sourceBefore || !sourceAfter || !snapshotTree) {
    throw new Error("Unable to create a complete world snapshot");
  }

  const records: LevelRecord[] = [];
  for (const collection of collections) {
    const databasePath = join(snapshotWorldRoot, "data", collection);
    assertPathContained(snapshotWorldRoot, databasePath, "Snapshot database path");
    const collectionRecords = await reader(databasePath, options.classicLevelEntry);
    for (const { key, value } of collectionRecords) {
      records.push({ ...parseFoundryLevelKey(collection, key), value });
    }
  }

  return {
    sourceWorldRoot,
    snapshotWorldRoot,
    sourceTreeHashBefore: sourceBefore.treeHash,
    sourceTreeHashAfter: sourceAfter.treeHash,
    sourceTree: sourceBefore.entries,
    snapshotTree: snapshotTree.entries,
    collectionBytes: calculateCollectionBytes(snapshotTree.entries, collections),
    records,
  };
}

async function readClassicLevelSnapshot(
  databasePath: string,
  classicLevelEntry: string,
): Promise<Array<{ key: string; value: Record<string, unknown> }>> {
  const module = await import(pathToFileURL(classicLevelEntry).href) as ClassicLevelModule;
  if (!module.ClassicLevel) {
    throw new Error(`classic-level entry does not export ClassicLevel: ${classicLevelEntry}`);
  }

  let database: ClassicLevelDatabase | undefined;
  try {
    database = new module.ClassicLevel(databasePath, {
      createIfMissing: false,
      keyEncoding: "utf8",
      valueEncoding: "json",
    });
    const records: Array<{ key: string; value: Record<string, unknown> }> = [];
    for await (const [key, value] of database.iterator()) {
      records.push({ key, value });
    }
    return records;
  } finally {
    await database?.close();
  }
}

async function collectTreeEntries(root: string, current: string, entries: TreeEntry[]): Promise<void> {
  const currentStat = await lstat(current);
  if (currentStat.isSymbolicLink()) {
    throw new Error(`Symbolic link or reparse point is not permitted: ${current}`);
  }
  if (currentStat.isDirectory()) {
    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      await collectTreeEntries(root, join(current, child.name), entries);
    }
    return;
  }
  if (!currentStat.isFile()) {
    throw new Error(`Unsupported world tree entry: ${current}`);
  }

  const contents = await readFile(current);
  entries.push({
    relativePath: relative(root, current).split(sep).join("/"),
    bytes: currentStat.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}

async function resolveSnapshotRoot(snapshotWorldRoot: string): Promise<string> {
  const resolved = resolve(snapshotWorldRoot);
  try {
    await lstat(resolved);
    throw new Error(`Snapshot destination already exists: ${resolved}`);
  } catch (error) {
    if (isMissingPath(error)) {
      return resolved;
    }
    throw error;
  }
}

async function assertDistinctPhysicalRoots(sourceWorldRoot: string, snapshotWorldRoot: string): Promise<void> {
  const sourcePhysicalRoot = await realpath(sourceWorldRoot);
  const snapshotPhysicalRoot = await resolveFuturePhysicalPath(snapshotWorldRoot);
  assertPathContained(sourcePhysicalRoot, sourcePhysicalRoot, "Source world root");
  if (pathsOverlap(sourcePhysicalRoot, snapshotPhysicalRoot)) {
    throw new Error("Snapshot destination must be outside the source world");
  }
}

async function resolveFuturePhysicalPath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const physicalAncestor = await realpath(ancestor);
      return resolve(physicalAncestor, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missingSegments.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

async function assertNoLinksOrReparsePoints(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic link or reparse point is not permitted: ${path}`);
  }
  if (process.platform === "win32") {
    try {
      await readlink(path);
      throw new Error(`Symbolic link or reparse point is not permitted: ${path}`);
    } catch (error) {
      if (!isMissingLinkTarget(error)) {
        throw error;
      }
    }
  }
  if (!stat.isDirectory()) return;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    await assertNoLinksOrReparsePoints(join(path, entry.name));
  }
}

async function assertExpectedWorldMetadata(sourceWorldRoot: string, options: SnapshotOptions): Promise<void> {
  const metadataPath = join(sourceWorldRoot, "world.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as FoundryWorldMetadata;
  if (
    metadata.id !== options.expectedWorldId
    || metadata.coreVersion !== options.expectedCoreVersion
    || metadata.system !== options.expectedSystem
  ) {
    throw new Error(
      `Unexpected world metadata: expected ${options.expectedWorldId}/${options.expectedCoreVersion}/${options.expectedSystem}`,
    );
  }
}

async function findLiveCollections(sourceWorldRoot: string): Promise<string[]> {
  const dataRoot = join(sourceWorldRoot, "data");
  const entries = await readdir(dataRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !isEvidenceOnlyBackup(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function openCollectionLocks(sourceWorldRoot: string, collections: string[]): Promise<FileHandle[]> {
  const handles: FileHandle[] = [];
  try {
    for (const collection of collections) {
      handles.push(await open(join(sourceWorldRoot, "data", collection, "LOCK"), "r+"));
    }
    return handles;
  } catch (error) {
    await closeHandles(handles);
    throw error;
  }
}

async function closeHandles(handles: FileHandle[]): Promise<void> {
  await Promise.all(handles.map(async (handle) => handle.close()));
}

function calculateCollectionBytes(entries: TreeEntry[], collections: string[]): Record<string, number> {
  return Object.fromEntries(collections.map((collection) => [
    collection,
    entries
      .filter((entry) => entry.relativePath.startsWith(`data/${collection}/`))
      .reduce((total, entry) => total + entry.bytes, 0),
  ]));
}

function isEvidenceOnlyBackup(name: string): boolean {
  return name.includes(".backup-") || name.startsWith("backup-");
}

function pathsOverlap(left: string, right: string): boolean {
  const leftNormalized = normalizeForComparison(left);
  const rightNormalized = normalizeForComparison(right);
  return leftNormalized === rightNormalized
    || rightNormalized.startsWith(`${leftNormalized}/`)
    || leftNormalized.startsWith(`${rightNormalized}/`);
}

function assertPathContained(root: string, path: string, label: string): void {
  const relativePath = relative(resolve(root), resolve(path));
  if (relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`) && !relativePath.startsWith(sep))) {
    return;
  }
  throw new Error(`${label} escapes its allowed root: ${path}`);
}

function normalizeForComparison(path: string): string {
  const normalized = resolve(path).split(sep).join("/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isMissingLinkTarget(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EINVAL";
}

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { LevelRecord, SnapshotOptions, TreeEntry, WorldSnapshot } from "./model";
import {
  normalizePhysicalPathForComparison,
  physicalPathsOverlap,
  resolveFuturePhysicalPath,
} from "./pathSafety";

export type SnapshotCollectionReader = (
  databasePath: string,
  classicLevelEntry: string,
) => Promise<Array<{ key: string; value: Record<string, unknown> }>>;

export interface SnapshotLifecycleHooks {
  afterGuardAcquired?: (guard: StoppedWorldLockGuard) => Promise<void>;
  afterCopy?: () => Promise<void>;
  beforeSnapshotHash?: (stagingWorldRoot: string) => Promise<void>;
  beforePromote?: () => Promise<void>;
}

const GUARD_TIMEOUT_MS = 10_000;

export interface WorldAuditTimeoutScheduler {
  setTimeout(callback: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WorldAuditProcess {
  readonly exitCode: number | null;
  readonly stdout?: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  readonly stderr?: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  once(event: string, listener: (...args: any[]) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface WorldAuditProcessHooks {
  spawnPowerShell?: (script: string, environment: NodeJS.ProcessEnv) => WorldAuditProcess;
  timeoutMs?: number;
  scheduler?: WorldAuditTimeoutScheduler;
}

export interface SnapshotRuntime {
  acquireStoppedWorldLocks?: (lockPaths: string[]) => Promise<StoppedWorldLockGuard>;
  promoteSnapshot?: (stagingWorldRoot: string, snapshotWorldRoot: string) => Promise<void>;
}

export interface StoppedWorldLockGuard {
  close(): Promise<void>;
  unexpectedExit: Promise<Error>;
  terminateForTest(): void;
}

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

interface LivePackDatabase {
  physicalDirectory: string;
  relativePath: string;
}

export function parseFoundryLevelKey(collection: string, key: string): Omit<LevelRecord, "value"> {
  const [prefix, namespace, idPath, ...extra] = key.split("!");
  if (prefix !== "" || !namespace || !idPath || extra.length > 0) {
    throw new Error(`Invalid Foundry LevelDB key in ${collection}: ${key}`);
  }

  const namespaceParts = namespace.split(".");
  const identifiers = idPath.split(".");
  if (
    namespaceParts[0] !== collection
    || namespaceParts.some((part) => !part)
    || identifiers.some((id) => !id)
    || namespaceParts.length !== identifiers.length
  ) {
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
  entries.sort((left, right) => compareOrdinal(left.relativePath, right.relativePath));

  const treeHash = createHash("sha256");
  for (const entry of entries) {
    treeHash.update(`${entry.relativePath}\0${entry.bytes}\0${entry.sha256}\n`, "utf8");
  }
  return { entries, treeHash: treeHash.digest("hex") };
}

export async function createWorldSnapshot(
  options: SnapshotOptions,
  reader: SnapshotCollectionReader = readClassicLevelSnapshot,
  hooks: SnapshotLifecycleHooks = {},
  runtime: SnapshotRuntime = {},
): Promise<WorldSnapshot> {
  const sourceWorldRoot = resolve(options.sourceWorldRoot);
  const snapshotWorldRoot = await resolveSnapshotRoot(options.snapshotWorldRoot);
  await assertDistinctPhysicalRoots(sourceWorldRoot, snapshotWorldRoot);
  await assertNoLinksOrReparsePoints(sourceWorldRoot);
  await assertWindowsReparsePointFree(sourceWorldRoot);
  await assertExpectedWorldMetadata(sourceWorldRoot, options);
  const collections = await findLiveCollections(sourceWorldRoot);
  const packDatabases = await findLivePackDatabases(sourceWorldRoot);
  await mkdir(dirname(snapshotWorldRoot), { recursive: true });
  const stagingWorldRoot = await mkdtemp(join(dirname(snapshotWorldRoot), `.world-audit-${basename(snapshotWorldRoot)}-`));

  const lockPaths = [
    ...collections.map((collection) => join(sourceWorldRoot, "data", collection, "LOCK")),
    ...packDatabases.map((pack) => join(sourceWorldRoot, "packs", pack.physicalDirectory, "LOCK")),
  ];
  let sourceBefore: Awaited<ReturnType<typeof hashTree>> | undefined;
  let sourceAfter: Awaited<ReturnType<typeof hashTree>> | undefined;
  let snapshotTree: Awaited<ReturnType<typeof hashTree>> | undefined;
  let stagingOwned = true;

  try {
    const guard = await (runtime.acquireStoppedWorldLocks ?? acquireStoppedWorldLocks)(lockPaths);
    let guardFailure: Error | undefined;
    void guard.unexpectedExit.then((error) => { guardFailure = error; });
    let snapshotError: unknown;
    try {
      await hooks.afterGuardAcquired?.(guard);
      sourceBefore = await hashTree(sourceWorldRoot);
      await cp(sourceWorldRoot, stagingWorldRoot, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
      await hooks.afterCopy?.();
      if (guardFailure) throw guardFailure;
      sourceAfter = await hashTree(sourceWorldRoot);
      if (sourceBefore.treeHash !== sourceAfter.treeHash) {
        throw new Error("Source world changed while the snapshot was being copied");
      }

      await hooks.beforeSnapshotHash?.(stagingWorldRoot);
      if (guardFailure) throw guardFailure;
      snapshotTree = await hashTree(stagingWorldRoot);
      if (sourceBefore.treeHash !== snapshotTree.treeHash) {
        throw new Error("Snapshot bytes do not match the stopped source world");
      }
    } catch (error) {
      snapshotError = error;
      throw error;
    } finally {
      try {
        await guard.close();
      } catch (closeError) {
        if (snapshotError) {
          throw new AggregateError(
            [snapshotError, closeError],
            "Snapshot failed and stopped-world lock guard cleanup also failed",
          );
        }
        throw closeError;
      }
    }

    if (!sourceBefore || !sourceAfter || !snapshotTree) {
      throw new Error("Unable to create a complete world snapshot");
    }
    const records: LevelRecord[] = [];
    const openedCollections: NonNullable<WorldSnapshot["openedCollections"]> = [];
    for (const collection of collections) {
      const databasePath = join(stagingWorldRoot, "data", collection);
      assertPathContained(stagingWorldRoot, databasePath, "Snapshot database path");
      const collectionRecords = await reader(databasePath, options.classicLevelEntry);
      for (const { key, value } of collectionRecords) {
        records.push({
          ...parseFoundryLevelKey(collection, key),
          value,
          storageScope: "world",
          storageRelativePath: `data/${collection}`,
        });
      }
      openedCollections.push({
        scope: "world",
        relativePath: `data/${collection}`,
        recordCount: collectionRecords.length,
        logicalCollections: [collection],
      });
    }
    for (const pack of packDatabases) {
      const databasePath = join(stagingWorldRoot, "packs", pack.physicalDirectory);
      assertPathContained(stagingWorldRoot, databasePath, "Snapshot pack database path");
      const collectionRecords = await reader(databasePath, options.classicLevelEntry);
      const logicalCollections = new Set<string>();
      for (const { key, value } of collectionRecords) {
        const collection = foundryCollectionFromKey(key);
        logicalCollections.add(collection);
        records.push({
          ...parseFoundryLevelKey(collection, key),
          value,
          storageScope: "pack",
          storageRelativePath: pack.relativePath,
        });
      }
      openedCollections.push({
        scope: "pack",
        relativePath: pack.relativePath,
        recordCount: collectionRecords.length,
        logicalCollections: [...logicalCollections].sort(compareOrdinal),
      });
    }
    await hooks.beforePromote?.();
    if (guardFailure) throw guardFailure;
    await (runtime.promoteSnapshot ?? promoteSnapshotWithRetry)(stagingWorldRoot, snapshotWorldRoot);
    stagingOwned = false;

    return {
      sourceWorldRoot,
      snapshotWorldRoot,
      sourceTreeHashBefore: sourceBefore.treeHash,
      sourceTreeHashAfter: sourceAfter.treeHash,
      sourceTree: sourceBefore.entries,
      snapshotTree: snapshotTree.entries,
      collectionBytes: calculateCollectionBytes(snapshotTree.entries, collections),
      records,
      openedCollections,
    };
  } catch (error) {
    if (stagingOwned) {
      await removeIncompleteSnapshot(stagingWorldRoot, error);
    }
    throw error;
  }
}

export async function promoteSnapshotWithRetry(
  stagingWorldRoot: string,
  snapshotWorldRoot: string,
  runtime: {
    rename?: typeof rename;
    delay?: (milliseconds: number) => Promise<void>;
    delays?: readonly number[];
  } = {},
): Promise<void> {
  const renameDirectory = runtime.rename ?? rename;
  const delay = runtime.delay ?? ((milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  const delays = runtime.delays ?? [25, 100, 250, 500];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameDirectory(stagingWorldRoot, snapshotWorldRoot);
      return;
    } catch (error) {
      if (!isTransientWindowsRenameError(error) || attempt >= delays.length) throw error;
      await delay(delays[attempt]!);
    }
  }
}

function isTransientWindowsRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES";
}

export async function acquireStoppedWorldLocks(
  lockPaths: string[],
  processHooks: WorldAuditProcessHooks = {},
): Promise<StoppedWorldLockGuard> {
  if (process.platform !== "win32") {
    throw new Error("Stopped-world lock guard is supported only on Windows; refusing to snapshot without it");
  }
  for (const lockPath of lockPaths) {
    const stat = await lstat(lockPath);
    if (!stat.isFile()) throw new Error(`Stopped-world lock is not a regular file: ${lockPath}`);
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$parsedPaths = $env:WORLD_AUDIT_LOCK_PATHS_JSON | ConvertFrom-Json",
    "$paths = @($parsedPaths | ForEach-Object { $_ })",
    "$locks = [System.Collections.Generic.List[System.IO.FileStream]]::new()",
    "try {",
    "  foreach ($path in $paths) {",
    "    if ($path -isnot [string] -or [string]::IsNullOrWhiteSpace($path)) { throw 'Stopped-world lock path must be a non-empty string' }",
    "    $locks.Add([System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read))",
    "  }",
    "  [Console]::Out.WriteLine('READY')",
    "  while ($true) { Start-Sleep -Seconds 3600 }",
    "} catch {",
    "  [Console]::Error.WriteLine($_.Exception.Message)",
    "  exit 1",
    "} finally {",
    "  foreach ($lock in $locks) { $lock.Dispose() }",
    "}",
  ].join("\n");
  const child = spawnAuditPowerShell(
    script,
    { ...process.env, WORLD_AUDIT_LOCK_PATHS_JSON: JSON.stringify(lockPaths) },
    processHooks,
  );
  const timeoutMs = processHooks.timeoutMs ?? GUARD_TIMEOUT_MS;
  const scheduler = processHooks.scheduler ?? defaultTimeoutScheduler;
  await withTimeout(waitForLockGuardReady(child), timeoutMs, () => child.kill("SIGKILL"), "Stopped-world lock guard readiness timed out", scheduler);
  return new PowerShellStoppedWorldLockGuard(child, timeoutMs, scheduler);
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
  if (physicalPathsOverlap(sourcePhysicalRoot, snapshotPhysicalRoot)) {
    throw new Error("Snapshot destination must be outside the source world");
  }
}

async function assertNoLinksOrReparsePoints(path: string): Promise<void> {
  const physicalRoot = await realpath(path);
  await assertNoLinksOrReparsePointsAt(path, physicalRoot);
}

async function assertNoLinksOrReparsePointsAt(path: string, expectedPhysicalPath: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic link or reparse point is not permitted: ${path}`);
  }
  const physicalPath = await realpath(path);
  if (
    normalizePhysicalPathForComparison(physicalPath)
    !== normalizePhysicalPathForComparison(expectedPhysicalPath)
  ) {
    throw new Error(`Reparse point changes the physical path: ${path}`);
  }
  if (!stat.isDirectory()) return;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    await assertNoLinksOrReparsePointsAt(join(path, entry.name), join(expectedPhysicalPath, entry.name));
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
    .sort(compareOrdinal);
}

async function findLivePackDatabases(sourceWorldRoot: string): Promise<LivePackDatabase[]> {
  const packsRoot = join(sourceWorldRoot, "packs");
  let entries;
  try {
    entries = await readdir(packsRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return [];
    throw error;
  }
  const databases: LivePackDatabase[] = [];
  for (const entry of entries.sort((left, right) => compareOrdinal(left.name, right.name))) {
    if (!entry.isDirectory()) continue;
    const databasePath = join(packsRoot, entry.name);
    if (
      await isRegularFile(join(databasePath, "LOCK"))
      && await isRegularFile(join(databasePath, "CURRENT"))
    ) {
      databases.push({
        physicalDirectory: entry.name,
        relativePath: `packs/${entry.name}`,
      });
    }
  }
  return databases;
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

function foundryCollectionFromKey(key: string): string {
  const [prefix, namespace] = key.split("!");
  const collection = namespace?.split(".")[0];
  if (prefix !== "" || !collection) {
    throw new Error(`Invalid Foundry LevelDB key in pack: ${key}`);
  }
  return collection;
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

function assertPathContained(root: string, path: string, label: string): void {
  const relativePath = relative(resolve(root), resolve(path));
  if (relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`) && !relativePath.startsWith(sep))) {
    return;
  }
  throw new Error(`${label} escapes its allowed root: ${path}`);
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function removeIncompleteSnapshot(snapshotWorldRoot: string, originalError: unknown): Promise<void> {
  try {
    await rm(snapshotWorldRoot, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new AggregateError([originalError, cleanupError], "Snapshot failed and incomplete snapshot cleanup also failed");
  }
}

async function waitForLockGuardReady(child: WorldAuditProcess): Promise<void> {
  await new Promise<void>((resolveReady, rejectReady) => {
    let stderr = "";
    let stdout = "";
    let settled = false;
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      rejectReady(error);
    };
    child.once("error", (error: Error) => rejectOnce(error));
    child.stderr?.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
      if (!settled && stdout.includes("READY")) {
        settled = true;
        resolveReady();
      }
    });
    child.once("exit", (code: number | null) => {
      rejectOnce(new Error(`Stopped-world lock guard could not be acquired (exit ${code}): ${stderr.trim()}`));
    });
  });
}

export async function assertWindowsReparsePointFree(
  root: string,
  processHooks: WorldAuditProcessHooks = {},
): Promise<void> {
  if (process.platform !== "win32") return;
  const script = "$ErrorActionPreference='Stop'; $root=$env:WORLD_AUDIT_REPARSE_ROOT | ConvertFrom-Json; $all=@(Get-Item -LiteralPath $root -Force); $all += @(Get-ChildItem -LiteralPath $root -Force -Recurse -ErrorAction Stop); $bad=@($all | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }); if($bad.Count -gt 0){ [Console]::Out.WriteLine($bad[0].FullName); exit 2 }";
  const child = spawnAuditPowerShell(
    script,
    { ...process.env, WORLD_AUDIT_REPARSE_ROOT: JSON.stringify(root) },
    processHooks,
  );
  let stdout = ""; let stderr = "";
  child.stdout?.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
  const exit = new Promise<number | null>((resolveExit, rejectExit) => { child.once("error", rejectExit); child.once("exit", resolveExit); });
  const code = await withTimeout(
    exit,
    processHooks.timeoutMs ?? GUARD_TIMEOUT_MS,
    () => child.kill("SIGKILL"),
    "Windows reparse-point scan timed out",
    processHooks.scheduler ?? defaultTimeoutScheduler,
  );
  if (code !== 0 || stderr || stdout.trim() !== "") throw new Error(`Windows reparse-point scan failed: ${stdout.trim() || stderr.trim() || `exit ${code}`}`);
}

const defaultTimeoutScheduler: WorldAuditTimeoutScheduler = {
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function spawnAuditPowerShell(
  script: string,
  environment: NodeJS.ProcessEnv,
  processHooks: WorldAuditProcessHooks,
): WorldAuditProcess {
  if (processHooks.spawnPowerShell) return processHooks.spawnPowerShell(script, environment);
  return spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }) as unknown as WorldAuditProcess;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  message: string,
  scheduler: WorldAuditTimeoutScheduler,
): Promise<T> {
  return await new Promise<T>((resolveResult, rejectResult) => {
    let settled = false;
    const timer = scheduler.setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      rejectResult(new Error(message));
    }, timeoutMs);
    operation.then(
      (result) => {
        if (settled) return;
        settled = true;
        scheduler.clearTimeout(timer);
        resolveResult(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        scheduler.clearTimeout(timer);
        rejectResult(error);
      },
    );
  });
}

class PowerShellStoppedWorldLockGuard implements StoppedWorldLockGuard {
  private closing = false;
  private reportUnexpectedExit: (error: Error) => void = () => {};
  readonly unexpectedExit: Promise<Error>;

  constructor(
    private readonly child: WorldAuditProcess,
    private readonly timeoutMs: number,
    private readonly scheduler: WorldAuditTimeoutScheduler,
  ) {
    this.unexpectedExit = new Promise((resolveUnexpectedExit) => {
      this.reportUnexpectedExit = resolveUnexpectedExit;
      child.once("exit", (code: number | null) => {
        if (!this.closing) {
          this.reportUnexpectedExit(new Error(`Stopped-world lock guard exited unexpectedly (exit ${code})`));
        }
      });
      child.once("error", (error) => this.reportUnexpectedExit(new Error(`Stopped-world lock guard exited unexpectedly: ${error.message}`)));
    });
  }

  terminateForTest(): void {
    this.child.kill("SIGKILL");
    this.reportUnexpectedExit(new Error("Stopped-world lock guard exited unexpectedly (test termination)"));
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.closing = true;
    await withTimeout(new Promise<void>((resolveClose, rejectClose) => {
      this.child.once("error", (error: Error) => rejectClose(error));
      this.child.once("exit", () => resolveClose());
      if (!this.child.kill()) {
        rejectClose(new Error("Stopped-world lock guard could not be stopped"));
      }
    }), this.timeoutMs, () => this.child.kill("SIGKILL"), "Stopped-world lock guard close timed out", this.scheduler);
  }
}

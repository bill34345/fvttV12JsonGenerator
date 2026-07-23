import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeWorld } from "./world-audit/inventory";
import type { SnapshotOptions, WorldSnapshot } from "./world-audit/model";
import {
  AUDIT_TARGET,
  WORKBOOK_SHEET_NAMES,
  createAuditReport,
  createPendingBaseline,
  type AuditBaseline,
  type AuditValidation,
  validateAuditBaseline,
} from "./world-audit/report";
import { createWorldSnapshot } from "./world-audit/snapshot";

export interface AuditCliOptions {
  worldRoot: string;
  appRoot: string;
  outputDir: string;
  snapshotDir: string;
  baselineFile?: string;
}

export interface AuditManifest {
  generatedAt: string;
  generatedAtSemantics: "latest-source-evidence-timestamp";
  target: { worldId: "cor-cotn"; foundry: "14.364"; dnd5e: "5.3.3" };
  remoteAccessed: false;
  sourceTreeHashBefore: string;
  sourceTreeHashAfter: string;
  files: Record<string, string>;
  validation: AuditValidation;
}

export interface WorldFootprintAuditRuntime {
  createSnapshot?: (options: SnapshotOptions) => Promise<WorldSnapshot>;
  beforePromoteFile?: (name: string, index: number) => Promise<void>;
}

const REQUIRED_FLAGS = [
  "--world-root",
  "--app-root",
  "--output-dir",
  "--snapshot-dir",
] as const;
const OPTIONAL_FLAGS = ["--baseline-file"] as const;
const ALL_FLAGS = new Set<string>([...REQUIRED_FLAGS, ...OPTIONAL_FLAGS]);
const DATA_FILE_NAMES = [
  "inventory.json",
  "references.json",
  "chapter-classification.json",
  "baseline.json",
  "unresolved.md",
  "summary.md",
  "workbook-source.json",
] as const;

export async function runWorldFootprintAudit(
  options: AuditCliOptions,
  runtime: WorldFootprintAuditRuntime = {},
): Promise<AuditManifest> {
  const resolved = resolveOptions(options);
  await assertDestinationOutsideWorld(resolved.worldRoot, resolved.outputDir, "Output directory");
  await assertDestinationOutsideWorld(resolved.worldRoot, resolved.snapshotDir, "Snapshot directory");
  const classicLevelEntry = await validatePinnedTarget(resolved);

  const snapshot = await (runtime.createSnapshot ?? createWorldSnapshot)({
    sourceWorldRoot: resolved.worldRoot,
    snapshotWorldRoot: resolved.snapshotDir,
    classicLevelEntry,
    expectedWorldId: AUDIT_TARGET.worldId,
    expectedCoreVersion: AUDIT_TARGET.foundry,
    expectedSystem: "dnd5e",
  });
  if (snapshot.sourceTreeHashBefore !== snapshot.sourceTreeHashAfter) {
    throw new Error("Source world tree hash changed during audit");
  }

  const analysis = analyzeWorld(snapshot);
  const baseline = resolved.baselineFile
    ? await readBaseline(resolved.baselineFile, snapshot)
    : createPendingBaseline(snapshot);
  const report = createAuditReport(snapshot, analysis, baseline);
  await mkdir(resolved.outputDir, { recursive: true });

  const deliverables: Record<(typeof DATA_FILE_NAMES)[number], unknown> = {
    "inventory.json": report.inventory,
    "references.json": report.references,
    "chapter-classification.json": report.chapterClassification,
    "baseline.json": report.baseline,
    "unresolved.md": report.unresolvedMarkdown,
    "summary.md": report.summaryMarkdown,
    "workbook-source.json": report.workbookSource,
  };
  const stagingDir = await mkdtemp(join(resolved.outputDir, ".world-audit-report-staging-"));
  try {
    const files: Record<string, string> = {};
    for (const name of DATA_FILE_NAMES) {
      const value = deliverables[name];
      const contents = name.endsWith(".json") ? stableJson(value) : ensureTrailingNewline(String(value));
      await writeFile(join(stagingDir, name), contents, "utf8");
      files[name] = createHash("sha256").update(contents, "utf8").digest("hex");
    }
    await validateStagedBundle(stagingDir, files, snapshot);

    const manifest: AuditManifest = {
      generatedAt: await deriveSourceEvidenceTimestamp(snapshot),
      generatedAtSemantics: "latest-source-evidence-timestamp",
      target: AUDIT_TARGET,
      remoteAccessed: false,
      sourceTreeHashBefore: snapshot.sourceTreeHashBefore,
      sourceTreeHashAfter: snapshot.sourceTreeHashAfter,
      files: sortRecord(files),
      validation: report.validation,
    };
    await writeFile(join(stagingDir, "audit-manifest.json"), stableJson(manifest), "utf8");
    await validateStagedManifest(stagingDir, manifest);

    const completionManifest = join(resolved.outputDir, "audit-manifest.json");
    await rm(completionManifest, { force: true });
    for (const [index, name] of DATA_FILE_NAMES.entries()) {
      await runtime.beforePromoteFile?.(name, index);
      await replaceFile(join(stagingDir, name), join(resolved.outputDir, name));
    }
    await validatePromotedBundle(resolved.outputDir, files);
    await replaceFile(join(stagingDir, "audit-manifest.json"), completionManifest);
    return manifest;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export function parseAuditCliArguments(args: string[]): AuditCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !ALL_FLAGS.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) throw new Error(`Missing required argument: ${flag}`);
  }
  return {
    worldRoot: values.get("--world-root")!,
    appRoot: values.get("--app-root")!,
    outputDir: values.get("--output-dir")!,
    snapshotDir: values.get("--snapshot-dir")!,
    ...(values.has("--baseline-file") ? { baselineFile: values.get("--baseline-file")! } : {}),
  };
}

function resolveOptions(options: AuditCliOptions): AuditCliOptions {
  return {
    worldRoot: resolve(options.worldRoot),
    appRoot: resolve(options.appRoot),
    outputDir: resolve(options.outputDir),
    snapshotDir: resolve(options.snapshotDir),
    ...(options.baselineFile ? { baselineFile: resolve(options.baselineFile) } : {}),
  };
}

async function validatePinnedTarget(options: AuditCliOptions): Promise<string> {
  assertPinnedSuffix(
    options.worldRoot,
    ".local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn",
    "world root",
  );
  assertPinnedSuffix(options.appRoot, ".local/foundry-v14/app/14.364", "app root");
  const projectRootFromWorld = stripSuffix(
    options.worldRoot,
    ".local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn",
  );
  const projectRootFromApp = stripSuffix(options.appRoot, ".local/foundry-v14/app/14.364");
  if (normalizePath(projectRootFromWorld) !== normalizePath(projectRootFromApp)) {
    throw new Error("World root and app root must belong to the same project-local Foundry mirror");
  }

  const appPackage = await readJsonRecord(join(options.appRoot, "package.json"), "Foundry package");
  if (appPackage.name !== "foundryvtt" || appPackage.version !== "14.364.0") {
    throw new Error("Audit requires exact project-local Foundry 14.364 (package version 14.364.0)");
  }
  const world = await readJsonRecord(join(options.worldRoot, "world.json"), "world manifest");
  if (
    world.id !== AUDIT_TARGET.worldId
    || world.coreVersion !== AUDIT_TARGET.foundry
    || world.system !== "dnd5e"
    || world.systemVersion !== AUDIT_TARGET.dnd5e
  ) {
    throw new Error("Audit requires cor-cotn on Foundry 14.364 with dnd5e 5.3.3");
  }
  const dataRoot = dirname(dirname(options.worldRoot));
  const system = await readJsonRecord(join(dataRoot, "systems", "dnd5e", "system.json"), "dnd5e manifest");
  if (system.id !== "dnd5e" || system.version !== AUDIT_TARGET.dnd5e) {
    throw new Error("Audit requires exact installed dnd5e system version 5.3.3");
  }
  const classicLevelEntry = join(options.appRoot, "node_modules", "classic-level", "index.js");
  const classicLevelStat = await lstat(classicLevelEntry);
  if (!classicLevelStat.isFile()) {
    throw new Error(`Pinned classic-level entry is not a file: ${classicLevelEntry}`);
  }
  return classicLevelEntry;
}

async function assertDestinationOutsideWorld(
  worldRoot: string,
  destination: string,
  label: string,
): Promise<void> {
  const physicalWorld = await realpath(worldRoot);
  const physicalDestination = await resolveFuturePhysicalPath(destination);
  const rel = relative(physicalWorld, physicalDestination);
  if (
    rel === ""
    || (!rel.startsWith("..") && !rel.startsWith(sep) && !rel.includes(`..${sep}`))
  ) {
    throw new Error(`${label} must not be inside the audited source world`);
  }
}

async function resolveFuturePhysicalPath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      const physical = await realpath(ancestor);
      return resolve(physical, ...missing.reverse());
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(ancestor.slice(parent.length).replace(/^[\\/]+/, ""));
      ancestor = parent;
    }
  }
}

async function readBaseline(path: string, snapshot: WorldSnapshot): Promise<AuditBaseline> {
  const baseline = await readJsonRecord(path, "baseline");
  return validateAuditBaseline(baseline, snapshot);
}

async function readJsonRecord(path: string, label: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertPinnedSuffix(path: string, suffix: string, label: string): void {
  const normalized = normalizePath(path);
  const normalizedSuffix = normalizePathFragment(suffix);
  if (normalized !== normalizedSuffix && !normalized.endsWith(`/${normalizedSuffix}`)) {
    throw new Error(`${label} must be the pinned project-local path ending in ${suffix}`);
  }
}

function stripSuffix(path: string, suffix: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(0, normalized.length - suffix.length).replace(/\/+$/, "");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function ensureTrailingNewline(value: string): string {
  return `${value.replace(/\r\n/g, "\n").replace(/\n*$/, "")}\n`;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
}

async function deriveSourceEvidenceTimestamp(
  snapshot: WorldSnapshot,
): Promise<string> {
  const worldManifest = await lstat(join(snapshot.snapshotWorldRoot, "world.json"));
  const candidates = [worldManifest.mtimeMs];
  for (const record of snapshot.records) {
    const stats = isRecord(record.value._stats) ? record.value._stats : {};
    const modifiedTime = parseTimestamp(stats.modifiedTime);
    if (modifiedTime !== undefined) candidates.push(modifiedTime);
  }
  const latest = Math.max(...candidates);
  if (!Number.isFinite(latest) || latest < 0) {
    throw new Error("Unable to derive a stable source evidence timestamp");
  }
  // AuditManifest.generatedAt is evidence provenance, not wall-clock execution time.
  return new Date(Math.trunc(latest)).toISOString();
}

async function validateStagedBundle(
  stagingDir: string,
  files: Record<string, string>,
  snapshot: WorldSnapshot,
): Promise<void> {
  for (const name of DATA_FILE_NAMES) {
    const contents = await readFile(join(stagingDir, name), "utf8");
    if (!contents.endsWith("\n")) throw new Error(`Staged audit file lacks a trailing newline: ${name}`);
    const actualHash = createHash("sha256").update(contents, "utf8").digest("hex");
    if (actualHash !== files[name]) throw new Error(`Staged audit file hash mismatch: ${name}`);
    if (!name.endsWith(".json")) continue;
    const value = JSON.parse(contents) as unknown;
    if (["references.json", "chapter-classification.json"].includes(name)) {
      if (!Array.isArray(value)) throw new Error(`Staged audit file must contain an array: ${name}`);
      continue;
    }
    if (!isRecord(value)) throw new Error(`Staged audit file must contain an object: ${name}`);
    if (name === "baseline.json") validateAuditBaseline(value, snapshot);
    if (name === "workbook-source.json") {
      if (!isRecord(value.sheets) || Object.keys(value.sheets).join("\0") !== WORKBOOK_SHEET_NAMES.join("\0")) {
        throw new Error("Staged workbook source does not contain the exact 16 sheet datasets");
      }
    }
  }
}

async function validateStagedManifest(stagingDir: string, manifest: AuditManifest): Promise<void> {
  const contents = await readFile(join(stagingDir, "audit-manifest.json"), "utf8");
  const parsed = JSON.parse(contents) as unknown;
  if (
    !isRecord(parsed)
    || parsed.generatedAt !== manifest.generatedAt
    || parsed.remoteAccessed !== false
    || !isRecord(parsed.files)
    || Object.keys(parsed.files).join("\0") !== Object.keys(manifest.files).join("\0")
  ) {
    throw new Error("Staged audit manifest failed schema validation");
  }
}

async function validatePromotedBundle(outputDir: string, files: Record<string, string>): Promise<void> {
  for (const name of DATA_FILE_NAMES) {
    const contents = await readFile(join(outputDir, name));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (actualHash !== files[name]) throw new Error(`Promoted audit file hash mismatch: ${name}`);
  }
}

async function replaceFile(source: string, target: string): Promise<void> {
  await rm(target, { force: true });
  await rename(source, target);
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  const normalized = resolve(path).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizePathFragment(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function main(): Promise<void> {
  const options = parseAuditCliArguments(process.argv.slice(2));
  const manifest = await runWorldFootprintAudit(options);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

// Product-owned entrypoint for a local three-way migration audit.
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildThreeWayWorldDiff,
  type ThreeWayMergePolicy,
} from "./production-migration/threeWayWorldDiff";
import {
  assertProductionMigrationExecutionId,
  PRODUCTION_MIGRATION_EXECUTION_ID,
} from "./production-migration/buildCandidateSemantics";
import { createWorldSnapshot } from "./world-audit/snapshot";

// Historical one-shot audit for the 2026-07-28 cor-cotn production cutover.
// The execution ID gate prevents reuse as a current production-state tool.
interface CliOptions {
  executionId: string;
  baseWorld: string;
  localWorld: string;
  productionWorld: string;
  appRoot: string;
  snapshotRoot: string;
  privateOutput: string;
  redactedOutput: string;
  ownershipFile?: string;
}

interface OwnershipFile {
  localDeletedRecordIds?: string[];
  finalDeletedRecordIds?: string[];
  localOwnedPathPrefixes?: Record<string, string[]>;
  productionOwnedPathPrefixes?: Record<string, string[]>;
}

const REQUIRED_FLAGS = [
  "--execution-id",
  "--base-world",
  "--local-world",
  "--production-world",
  "--app-root",
  "--snapshot-root",
  "--private-output",
  "--redacted-output",
] as const;
const OPTIONAL_FLAGS = ["--ownership-file"] as const;
const ALL_FLAGS = new Set<string>([...REQUIRED_FLAGS, ...OPTIONAL_FLAGS]);

export async function runProductionMigrationThreeWayAudit(options: CliOptions): Promise<void> {
  assertProductionMigrationExecutionId(options.executionId);
  const resolved = resolveOptions(options);
  const classicLevelEntry = join(resolved.appRoot, "node_modules", "classic-level", "index.js");
  const classicLevelStat = await lstat(classicLevelEntry);
  if (!classicLevelStat.isFile()) throw new Error(`classic-level entry is not a file: ${classicLevelEntry}`);
  await assertMissing(resolved.snapshotRoot, "Snapshot root");
  await assertMissing(resolved.privateOutput, "Private output");
  await assertMissing(resolved.redactedOutput, "Redacted output");

  const ownership = resolved.ownershipFile
    ? await loadOwnershipFile(resolved.ownershipFile)
    : {};
  const policy: ThreeWayMergePolicy = {
    localWholeCollections: new Set(["messages", "combats"]),
    localDeletedRecordIds: new Set(ownership.localDeletedRecordIds ?? []),
    finalDeletedRecordIds: new Set(ownership.finalDeletedRecordIds ?? []),
    localOwnedPathPrefixes: new Map(Object.entries(ownership.localOwnedPathPrefixes ?? {})),
    productionOwnedPathPrefixes: new Map(Object.entries(ownership.productionOwnedPathPrefixes ?? {})),
  };

  await mkdir(resolved.snapshotRoot, { recursive: true });
  let completed = false;
  try {
    const snapshotOptions = (sourceWorldRoot: string, name: string) => ({
      sourceWorldRoot,
      snapshotWorldRoot: join(resolved.snapshotRoot, name),
      classicLevelEntry,
      expectedWorldId: "cor-cotn" as const,
      expectedCoreVersion: "14.364" as const,
      expectedSystem: "dnd5e" as const,
    });
    const base = await createWorldSnapshot(snapshotOptions(resolved.baseWorld, "base"));
    const local = await createWorldSnapshot(snapshotOptions(resolved.localWorld, "local"));
    const production = await createWorldSnapshot(snapshotOptions(resolved.productionWorld, "production"));
    const diff = buildThreeWayWorldDiff(base, local, production, policy);
    const privatePayload = {
      executionId: PRODUCTION_MIGRATION_EXECUTION_ID,
      target: { worldId: "cor-cotn", foundry: "14.364", dnd5e: "5.3.3" },
      sourceTrees: {
        base: base.sourceTreeHashBefore,
        local: local.sourceTreeHashBefore,
        production: production.sourceTreeHashBefore,
      },
      policy: {
        localWholeCollections: ["messages", "combats"],
        localDeletedRecordIds: [...(policy.localDeletedRecordIds ?? [])].sort(),
        finalDeletedRecordIds: [...(policy.finalDeletedRecordIds ?? [])].sort(),
        localOwnedPathPrefixes: Object.fromEntries(
          [...(policy.localOwnedPathPrefixes ?? new Map())].sort(([left], [right]) => compareOrdinal(left, right)),
        ),
        productionOwnedPathPrefixes: Object.fromEntries(
          [...(policy.productionOwnedPathPrefixes ?? new Map())].sort(([left], [right]) => compareOrdinal(left, right)),
        ),
      },
      ...diff,
    };
    const redactedPayload = {
      executionId: privatePayload.executionId,
      target: privatePayload.target,
      sourceTrees: privatePayload.sourceTrees,
      summary: diff.summary,
      conflictCount: diff.conflictCount,
      decisions: diff.decisions.map((decision) => ({
        id: decision.id,
        collection: decision.collection,
        key: decision.key,
        decision: decision.decision,
        selected: decision.selected,
        conflictPaths: decision.conflicts.map((conflict) => conflict.path),
      })),
    };
    await writeAtomically(resolved.privateOutput, stableJson(privatePayload));
    await writeAtomically(resolved.redactedOutput, stableJson(redactedPayload));
    completed = true;
  } finally {
    if (!completed) await rm(resolved.snapshotRoot, { recursive: true, force: true });
  }
}

export function parseProductionMigrationThreeWayAuditArgs(args: string[]): CliOptions {
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
    baseWorld: values.get("--base-world")!,
    localWorld: values.get("--local-world")!,
    productionWorld: values.get("--production-world")!,
    appRoot: values.get("--app-root")!,
    snapshotRoot: values.get("--snapshot-root")!,
    privateOutput: values.get("--private-output")!,
    redactedOutput: values.get("--redacted-output")!,
    ...(values.has("--ownership-file") ? { ownershipFile: values.get("--ownership-file")! } : {}),
  };
}

async function loadOwnershipFile(path: string): Promise<OwnershipFile> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as OwnershipFile;
  if (parsed.localDeletedRecordIds && !isStringArray(parsed.localDeletedRecordIds)) {
    throw new Error("ownership.localDeletedRecordIds must be an array of strings");
  }
  if (parsed.finalDeletedRecordIds && !isStringArray(parsed.finalDeletedRecordIds)) {
    throw new Error("ownership.finalDeletedRecordIds must be an array of strings");
  }
  if (parsed.localOwnedPathPrefixes) {
    for (const [id, paths] of Object.entries(parsed.localOwnedPathPrefixes)) {
      if (!id || !isStringArray(paths) || paths.some((path) => !path.startsWith("/"))) {
        throw new Error("ownership.localOwnedPathPrefixes must map record IDs to JSON pointer arrays");
      }
    }
  }
  if (parsed.productionOwnedPathPrefixes) {
    for (const [id, paths] of Object.entries(parsed.productionOwnedPathPrefixes)) {
      if (!id || !isStringArray(paths) || paths.some((path) => !path.startsWith("/"))) {
        throw new Error("ownership.productionOwnedPathPrefixes must map record IDs to JSON pointer arrays");
      }
    }
  }
  return parsed;
}

function resolveOptions(options: CliOptions): CliOptions {
  return {
    executionId: options.executionId,
    baseWorld: resolve(options.baseWorld),
    localWorld: resolve(options.localWorld),
    productionWorld: resolve(options.productionWorld),
    appRoot: resolve(options.appRoot),
    snapshotRoot: resolve(options.snapshotRoot),
    privateOutput: resolve(options.privateOutput),
    redactedOutput: resolve(options.redactedOutput),
    ...(options.ownershipFile ? { ownershipFile: resolve(options.ownershipFile) } : {}),
  };
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
  const staging = `${path}.staging-${createHash("sha256").update(contents).digest("hex").slice(0, 12)}`;
  await assertMissing(staging, "Staging output");
  try {
    await writeFile(staging, contents, "utf8");
    await rename(staging, path);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareOrdinal(left, right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry!)).href;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  await runProductionMigrationThreeWayAudit(parseProductionMigrationThreeWayAuditArgs(args));
}

if (isDirectExecution()) {
  await main();
}

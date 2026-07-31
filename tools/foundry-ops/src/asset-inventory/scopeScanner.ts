import { lstat, opendir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  LocalScopeCoverageResult,
  LocalScopeDeclaration,
  LocalScopeEntry,
  LocalScopeEntryKind,
  LocalScopeMeasurementResult,
  LocalScopePolicy,
  LocalScopeUnexpectedEntry,
} from './scopeModel';

interface TreeMeasurement {
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  skippedLinkCount: number;
  issues: string[];
}

export async function scanLocalScopeCoverage(
  policy: LocalScopePolicy,
  generatedAt: string,
): Promise<LocalScopeCoverageResult> {
  assertPolicy(policy.declarations);
  const present = await readTopLevel(policy.localRoot);
  const declared = new Map(policy.declarations.map((entry) => [entry.name.toLowerCase(), entry]));
  const entries: LocalScopeEntry[] = [];
  const unexpectedEntries: LocalScopeUnexpectedEntry[] = [];

  for (const item of present) {
    const declaration = declared.get(item.name.toLowerCase());
    if (!declaration) {
      unexpectedEntries.push({
        name: item.name,
        kind: kindOf(item.stats),
        bytes: item.stats.isFile() ? Number(item.stats.size) : null,
      });
      continue;
    }
    entries.push({
      ...declaration,
      exists: true,
      measurementResult: await measureDeclaredEntry(policy, declaration, item.path, item.stats),
    });
  }

  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  unexpectedEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const presentNames = new Set(present.map((entry) => entry.name.toLowerCase()));
  const missingDeclaredEntries = policy.declarations
    .filter((entry) => !presentNames.has(entry.name.toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const classifiedCount = entries.filter((entry) => entry.status === 'classified').length;
  const privacyExcludedCount = entries.filter((entry) => entry.status === 'privacy-excluded').length;
  const pendingReviewCount = entries.filter((entry) => entry.status === 'pending-review').length;

  return {
    schemaVersion: 1,
    generatedAt,
    root: '$REPO_ROOT/.local',
    coverageComplete: unexpectedEntries.length === 0,
    measurementComplete: entries.every((entry) => entry.measurementResult.issues.length === 0),
    classificationComplete: pendingReviewCount === 0,
    presentEntryCount: present.length,
    classifiedCount,
    privacyExcludedCount,
    pendingReviewCount,
    entries,
    unexpectedEntries,
    missingDeclaredEntries,
    note: 'Coverage complete means every present top-level entry is declared. It does not mean pending ownership is resolved, privacy exclusions were inspected, or any item is safe to delete.',
  };
}

async function readTopLevel(root: string): Promise<Array<{ name: string; path: string; stats: Awaited<ReturnType<typeof lstat>> }>> {
  const entries: Array<{ name: string; path: string; stats: Awaited<ReturnType<typeof lstat>> }> = [];
  const handle = await opendir(root);
  for await (const entry of handle) {
    const path = resolve(root, entry.name);
    entries.push({ name: entry.name, path, stats: await lstat(path) });
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

async function measureDeclaredEntry(
  policy: LocalScopePolicy,
  declaration: LocalScopeDeclaration,
  path: string,
  stats: Awaited<ReturnType<typeof lstat>>,
): Promise<LocalScopeMeasurementResult> {
  if (declaration.status === 'privacy-excluded' || declaration.measurement === 'top-level-metadata') {
    return {
      kind: kindOf(stats),
      fileCount: stats.isFile() ? 1 : null,
      directoryCount: stats.isDirectory() ? 1 : null,
      totalBytes: stats.isFile() ? Number(stats.size) : null,
      skippedLinkCount: stats.isSymbolicLink() ? 1 : 0,
      measurementSource: declaration.status === 'privacy-excluded'
        ? 'top-level metadata only; privacy boundary applied'
        : 'top-level filesystem metadata',
      issues: [],
    };
  }
  if (declaration.measurement === 'asset-inventory-summary') {
    return measureFromLatestAssetInventory(policy.assetInventoryParent, stats);
  }
  const measured = await measureTree(path);
  return {
    kind: kindOf(stats),
    fileCount: measured.fileCount,
    directoryCount: measured.directoryCount,
    totalBytes: measured.totalBytes,
    skippedLinkCount: measured.skippedLinkCount,
    measurementSource: 'recursive filesystem metadata; file contents were not read or hashed',
    issues: measured.issues,
  };
}

async function measureFromLatestAssetInventory(
  parent: string,
  stats: Awaited<ReturnType<typeof lstat>>,
): Promise<LocalScopeMeasurementResult> {
  const candidates: string[] = [];
  try {
    const handle = await opendir(parent);
    for await (const entry of handle) {
      if (entry.isDirectory()) candidates.push(entry.name);
    }
  } catch (error) {
    return missingSummary(stats, `Cannot enumerate accepted asset inventory summaries: ${messageOf(error)}`);
  }
  for (const name of candidates.sort((left, right) => right.localeCompare(left, 'en'))) {
    const summaryPath = resolve(parent, name, 'summary.json');
    try {
      const parsed = JSON.parse(await readFile(summaryPath, 'utf8')) as {
        complete?: boolean;
        generatedAt?: string;
        categories?: Array<{
          roots?: Array<{
            displayPath?: string;
            fileCount?: number;
            directoryCount?: number;
            totalBytes?: number;
          }>;
        }>;
      };
      if (!parsed.complete || !Array.isArray(parsed.categories)) continue;
      const labRoots = parsed.categories
        .flatMap((category) => category.roots ?? [])
        .filter((root) => root.displayPath === '$FVTT_OPS_LAB_ROOT'
          || root.displayPath?.startsWith('$FVTT_OPS_LAB_ROOT/'));
      if (labRoots.length === 0) continue;
      return {
        kind: kindOf(stats),
        fileCount: labRoots.reduce((total, root) => total + (root.fileCount ?? 0), 0),
        directoryCount: labRoots.reduce((total, root) => total + (root.directoryCount ?? 0), 0),
        totalBytes: labRoots.reduce((total, root) => total + (root.totalBytes ?? 0), 0),
        skippedLinkCount: 0,
        measurementSource: `accepted asset inventory registered lab roots ${name} (${parsed.generatedAt ?? 'timestamp unavailable'})`,
        issues: [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return missingSummary(stats, `Cannot read ${summaryPath}: ${messageOf(error)}`);
    }
  }
  return missingSummary(stats, 'No complete asset inventory summary is available for this registered root.');
}

function missingSummary(
  stats: Awaited<ReturnType<typeof lstat>>,
  issue: string,
): LocalScopeMeasurementResult {
  return {
    kind: kindOf(stats),
    fileCount: null,
    directoryCount: null,
    totalBytes: null,
    skippedLinkCount: null,
    measurementSource: 'asset inventory summary unavailable',
    issues: [issue],
  };
}

async function measureTree(root: string): Promise<TreeMeasurement> {
  const result: TreeMeasurement = { fileCount: 0, directoryCount: 0, totalBytes: 0, skippedLinkCount: 0, issues: [] };
  const visit = async (path: string): Promise<void> => {
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(path);
    } catch (error) {
      result.issues.push(`${path}: ${messageOf(error)}`);
      return;
    }
    if (stats.isSymbolicLink()) {
      result.skippedLinkCount += 1;
      result.issues.push(`${path}: symlink or junction was not traversed`);
      return;
    }
    if (stats.isFile()) {
      result.fileCount += 1;
      result.totalBytes += Number(stats.size);
      return;
    }
    if (!stats.isDirectory()) return;
    result.directoryCount += 1;
    try {
      const handle = await opendir(path);
      for await (const entry of handle) await visit(resolve(path, entry.name));
    } catch (error) {
      result.issues.push(`${path}: ${messageOf(error)}`);
    }
  };
  await visit(root);
  return result;
}

function assertPolicy(declarations: readonly LocalScopeDeclaration[]): void {
  const seen = new Set<string>();
  for (const declaration of declarations) {
    if (!declaration.name || declaration.name === '.' || declaration.name === '..' || /[\\/]/.test(declaration.name)) {
      throw new Error(`Local scope declaration must name one immediate .local entry: ${declaration.name || '<empty>'}`);
    }
    const key = declaration.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate local scope declaration: ${declaration.name}`);
    seen.add(key);
    if (declaration.status === 'privacy-excluded' && declaration.measurement !== 'top-level-metadata') {
      throw new Error(`Privacy-excluded declaration must use top-level metadata only: ${declaration.name}`);
    }
  }
}

function kindOf(stats: Awaited<ReturnType<typeof lstat>>): LocalScopeEntryKind {
  if (stats.isSymbolicLink()) return 'link';
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  return 'other';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

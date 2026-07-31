import { createHash } from 'node:crypto';

export const ASSET_CATEGORIES = [
  'app-binaries',
  'modules',
  'systems',
  'worlds',
  'backups',
  'evidence',
  'archives',
  'scratch-cache',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetRebuildability =
  | 'reacquirable'
  | 'workflow-rebuildable'
  | 'not-assumed-rebuildable'
  | 'unknown';
export type AssetRetention = 'critical' | 'preserve' | 'review-before-removal';

export interface AssetRootSpec {
  id: string;
  category: AssetCategory;
  path: string;
  displayPath: string;
  source: string;
  expectedVersion: string | null;
  rebuildability: AssetRebuildability;
  retention: AssetRetention;
  packageManifest?: 'module.json' | 'system.json' | 'world.json';
  excludedPaths?: readonly string[];
}

export interface AssetInventoryExclusion {
  displayPath: string;
  reason: string;
}

export interface AssetFileRecord {
  path: string;
  bytes: number;
  sha256: string;
  modifiedAt: string;
  accessedAt: string;
}

export interface AssetPackageRecord {
  folder: string;
  id: string | null;
  title: string | null;
  version: string | null;
  manifest: string | null;
  download: string | null;
  parseError: string | null;
}

export interface AssetScanIssue {
  path: string;
  kind: 'changed-during-scan' | 'read-error' | 'skipped-link' | 'unsupported-entry';
  message: string;
}

export interface AssetRootManifest {
  schemaVersion: 1;
  generatedAt: string;
  root: Omit<AssetRootSpec, 'path' | 'excludedPaths' | 'packageManifest'> & {
    exists: boolean;
  };
  usageTimeSemantics: 'filesystem-atime-best-effort';
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  rootSha256: string;
  packages: AssetPackageRecord[];
  files: AssetFileRecord[];
  issues: AssetScanIssue[];
}

export interface AssetCategoryManifest {
  schemaVersion: 1;
  generatedAt: string;
  category: AssetCategory;
  fileCount: number;
  totalBytes: number;
  roots: AssetRootManifest[];
}

export interface AssetDuplicateLocation {
  category: AssetCategory;
  rootId: string;
  path: string;
}

export interface AssetDuplicateGroup {
  sha256: string;
  bytesPerCopy: number;
  copies: number;
  theoreticalDuplicateBytes: number;
  categories: AssetCategory[];
  locations: AssetDuplicateLocation[];
}

export interface AssetDuplicateReport {
  schemaVersion: 1;
  generatedAt: string;
  note: string;
  duplicateGroupCount: number;
  duplicateFileCount: number;
  theoreticalDuplicateBytes: number;
  groups: AssetDuplicateGroup[];
}

export interface AssetInventoryResult {
  schemaVersion: 1;
  generatedAt: string;
  complete: boolean;
  outputRoot: string;
  categories: AssetCategoryManifest[];
  duplicates: AssetDuplicateReport;
  exclusions: AssetInventoryExclusion[];
}

export function computeRootDigest(files: readonly AssetFileRecord[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path, 'en'))) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(String(file.bytes));
    hash.update('\0');
    hash.update(file.sha256);
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function findExactDuplicates(
  categories: readonly AssetCategoryManifest[],
  generatedAt: string,
): AssetDuplicateReport {
  const byHash = new Map<string, Array<AssetDuplicateLocation & { bytes: number }>>();
  for (const category of categories) {
    for (const root of category.roots) {
      for (const file of root.files) {
        if (file.bytes === 0) continue;
        const key = `${file.bytes}:${file.sha256}`;
        const locations = byHash.get(key) ?? [];
        locations.push({ category: category.category, rootId: root.root.id, path: file.path, bytes: file.bytes });
        byHash.set(key, locations);
      }
    }
  }

  const groups = [...byHash.entries()]
    .filter(([, locations]) => locations.length > 1)
    .map(([key, locations]): AssetDuplicateGroup => {
      const [first] = locations;
      if (!first) throw new Error('Duplicate group unexpectedly has no files');
      const sortedLocations = [...locations]
        .map(({ bytes: _bytes, ...location }) => location)
        .sort((left, right) => `${left.rootId}/${left.path}`.localeCompare(`${right.rootId}/${right.path}`, 'en'));
      return {
        sha256: key.slice(String(first.bytes).length + 1),
        bytesPerCopy: first.bytes,
        copies: locations.length,
        theoreticalDuplicateBytes: first.bytes * (locations.length - 1),
        categories: [...new Set(locations.map((location) => location.category))].sort(),
        locations: sortedLocations,
      };
    })
    .sort((left, right) =>
      right.theoreticalDuplicateBytes - left.theoreticalDuplicateBytes
      || left.sha256.localeCompare(right.sha256, 'en'));

  return {
    schemaVersion: 1,
    generatedAt,
    note: 'Exact byte duplicates only. Theoretical duplicate bytes are not a deletion recommendation; every location still requires provenance and consumer review.',
    duplicateGroupCount: groups.length,
    duplicateFileCount: groups.reduce((total, group) => total + group.copies, 0),
    theoreticalDuplicateBytes: groups.reduce((total, group) => total + group.theoreticalDuplicateBytes, 0),
    groups,
  };
}

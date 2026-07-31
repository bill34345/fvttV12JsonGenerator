import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, opendir, readFile, stat } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import type {
  AssetFileRecord,
  AssetPackageRecord,
  AssetRootManifest,
  AssetRootSpec,
  AssetScanIssue,
} from './model';
import { computeRootDigest } from './model';

export interface AssetScanOptions {
  generatedAt: string;
  hashConcurrency?: number;
  onProgress?: (message: string) => void;
}

interface CollectedRoot {
  files: string[];
  directoryCount: number;
  issues: AssetScanIssue[];
}

export async function scanAssetRoot(
  spec: AssetRootSpec,
  options: AssetScanOptions,
): Promise<AssetRootManifest> {
  const rootPath = resolve(spec.path);
  const rootStats = await lstat(rootPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!rootStats) return emptyManifest(spec, options.generatedAt);

  const collected = await collectRoot(rootPath, spec.excludedPaths ?? []);
  const files = await mapConcurrent(
    collected.files,
    options.hashConcurrency ?? 4,
    async (path, index) => {
      if (index > 0 && index % 1_000 === 0) {
        options.onProgress?.(`${spec.id}: hashed ${index}/${collected.files.length} files`);
      }
      return hashFile(rootPath, path);
    },
  );
  const records: AssetFileRecord[] = [];
  const issues = [...collected.issues];
  for (const result of files) {
    if ('record' in result) records.push(result.record);
    else issues.push(result.issue);
  }
  records.sort((left, right) => left.path.localeCompare(right.path, 'en'));

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    root: {
      id: spec.id,
      category: spec.category,
      displayPath: spec.displayPath,
      source: spec.source,
      expectedVersion: spec.expectedVersion,
      rebuildability: spec.rebuildability,
      retention: spec.retention,
      exists: true,
    },
    usageTimeSemantics: 'filesystem-atime-best-effort',
    fileCount: records.length,
    directoryCount: collected.directoryCount,
    totalBytes: records.reduce((total, file) => total + file.bytes, 0),
    rootSha256: computeRootDigest(records),
    packages: spec.packageManifest
      ? await readPackageRecords(rootPath, spec.packageManifest)
      : [],
    files: records,
    issues,
  };
}

async function collectRoot(rootPath: string, excludedPaths: readonly string[]): Promise<CollectedRoot> {
  const files: string[] = [];
  const issues: AssetScanIssue[] = [];
  const excludes = excludedPaths.map((path) => resolve(path));
  let directoryCount = 0;

  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink()) {
    issues.push({
      path: '.',
      kind: 'skipped-link',
      message: 'Root is a symlink or junction and was not traversed.',
    });
    return { files, directoryCount, issues };
  }
  if (rootStats.isFile()) {
    files.push(rootPath);
    return { files, directoryCount, issues };
  }
  if (!rootStats.isDirectory()) {
    issues.push({ path: '.', kind: 'unsupported-entry', message: 'Root is not a regular file or directory.' });
    return { files, directoryCount, issues };
  }

  const visit = async (directory: string): Promise<void> => {
    directoryCount += 1;
    const handle = await opendir(directory);
    for await (const entry of handle) {
      const absolute = resolve(directory, entry.name);
      if (isExcluded(absolute, excludes)) continue;
      if (entry.isSymbolicLink()) {
        issues.push({
          path: portableRelative(rootPath, absolute),
          kind: 'skipped-link',
          message: 'Symlink or junction was recorded but not traversed.',
        });
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      } else {
        issues.push({
          path: portableRelative(rootPath, absolute),
          kind: 'unsupported-entry',
          message: 'Filesystem entry is not a regular file, directory, or link.',
        });
      }
    }
  };
  await visit(rootPath);
  files.sort((left, right) => left.localeCompare(right, 'en'));
  return { files, directoryCount, issues };
}

async function hashFile(
  rootPath: string,
  path: string,
): Promise<{ record: AssetFileRecord } | { issue: AssetScanIssue }> {
  const relativePath = rootPath === path ? basename(path) : portableRelative(rootPath, path);
  try {
    const before = await stat(path);
    const sha256 = await streamSha256(path);
    const after = await stat(path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      return {
        issue: {
          path: relativePath,
          kind: 'changed-during-scan',
          message: 'File size or modification time changed while it was being hashed.',
        },
      };
    }
    return {
      record: {
        path: relativePath,
        bytes: after.size,
        sha256,
        modifiedAt: after.mtime.toISOString(),
        accessedAt: after.atime.toISOString(),
      },
    };
  } catch (error) {
    return {
      issue: {
        path: relativePath,
        kind: 'read-error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function streamSha256(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function readPackageRecords(
  rootPath: string,
  manifestName: 'module.json' | 'system.json' | 'world.json',
): Promise<AssetPackageRecord[]> {
  const packages: AssetPackageRecord[] = [];
  const root = await opendir(rootPath);
  for await (const entry of root) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const manifestPath = resolve(rootPath, entry.name, manifestName);
    try {
      const raw = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as Record<string, unknown>;
      packages.push({
        folder: entry.name,
        id: stringOrNull(manifest.id),
        title: stringOrNull(manifest.title),
        version: stringOrNull(manifest.version),
        manifest: publicUrlOrNull(manifest.manifest),
        download: publicUrlOrNull(manifest.download),
        parseError: null,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      packages.push({
        folder: entry.name,
        id: null,
        title: null,
        version: null,
        manifest: null,
        download: null,
        parseError: code === 'ENOENT' ? `${manifestName} is missing` : error instanceof Error ? error.message : String(error),
      });
    }
  }
  return packages.sort((left, right) => left.folder.localeCompare(right.folder, 'en'));
}

function publicUrlOrNull(value: unknown): string | null {
  const candidate = stringOrNull(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isExcluded(path: string, excludedPaths: readonly string[]): boolean {
  const candidate = resolve(path);
  return excludedPaths.some((excludedPath) => {
    const rel = relative(excludedPath, candidate);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
  });
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function emptyManifest(spec: AssetRootSpec, generatedAt: string): AssetRootManifest {
  return {
    schemaVersion: 1,
    generatedAt,
    root: {
      id: spec.id,
      category: spec.category,
      displayPath: spec.displayPath,
      source: spec.source,
      expectedVersion: spec.expectedVersion,
      rebuildability: spec.rebuildability,
      retention: spec.retention,
      exists: false,
    },
    usageTimeSemantics: 'filesystem-atime-best-effort',
    fileCount: 0,
    directoryCount: 0,
    totalBytes: 0,
    rootSha256: computeRootDigest([]),
    packages: [],
    files: [],
    issues: [],
  };
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), values.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await work(value, index);
    }
  }));
  return results;
}

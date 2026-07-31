import { relative, resolve, sep } from 'node:path';
import type { FoundryLabConfig } from '../config';
import type { AssetInventoryExclusion, AssetRootSpec } from './model';

export interface AssetInventoryPolicy {
  roots: AssetRootSpec[];
  exclusions: AssetInventoryExclusion[];
  defaultOutputParent: string;
}

export function buildAssetInventoryPolicy(config: FoundryLabConfig): AssetInventoryPolicy {
  const roots: AssetRootSpec[] = [];
  const worldAuditDependencyJunction = resolve(
    config.evidenceRoot,
    'cor-cotn-world-audit-20260724',
    'node_modules',
  );
  const add = (spec: Omit<AssetRootSpec, 'displayPath'>) => {
    roots.push({ ...spec, displayPath: displayPath(config, spec.path) });
  };

  add({
    id: 'foundry-app',
    category: 'app-binaries',
    path: resolve(config.labRoot, 'app'),
    source: 'Foundry VTT licensed Node distribution installed by Foundry Lab bootstrap',
    expectedVersion: config.versions.foundry,
    rebuildability: 'reacquirable',
    retention: 'review-before-removal',
  });
  add({
    id: 'node-runtime',
    category: 'app-binaries',
    path: resolve(config.labRoot, 'runtime'),
    source: 'Pinned Node.js distribution installed by Foundry Lab bootstrap',
    expectedVersion: config.versions.node,
    rebuildability: 'reacquirable',
    retention: 'review-before-removal',
  });

  for (const profile of Object.values(config.profiles)) {
    for (const [category, folder, manifest] of [
      ['modules', 'modules', 'module.json'],
      ['systems', 'systems', 'system.json'],
      ['worlds', 'worlds', 'world.json'],
    ] as const) {
      add({
        id: `${profile.id}-${category}`,
        category,
        path: resolve(profile.dataPath, 'Data', folder),
        source: `Foundry Lab ${profile.id} profile`,
        expectedVersion: category === 'systems' ? config.versions.dnd5e : null,
        rebuildability: category === 'worlds' ? 'not-assumed-rebuildable' : 'unknown',
        retention: category === 'worlds' ? 'critical' : 'review-before-removal',
        packageManifest: manifest,
      });
    }
  }

  const backupRoots = [
    ['lab-backups', resolve(config.labRoot, 'backups')],
    ['configured-backups', config.backupRoot],
    ['spell-resolver-backups', resolve(config.evidenceRoot, 'spell-resolver-backups')],
    ['spell-resolver-world-backups', resolve(config.evidenceRoot, 'spell-resolver-world-backups')],
  ] as const;
  for (const [id, path] of uniquePaths(backupRoots)) {
    add({
      id,
      category: 'backups',
      path,
      source: 'Foundry Lab recovery workflow',
      expectedVersion: null,
      rebuildability: 'not-assumed-rebuildable',
      retention: 'critical',
    });
  }

  const nestedBackups = backupRoots.map(([, path]) => resolve(path));
  add({
    id: 'foundry-evidence',
    category: 'evidence',
    path: config.evidenceRoot,
    source: 'Foundry Lab diagnostics, acceptance, audit, and runtime evidence',
    expectedVersion: null,
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
    excludedPaths: [
      ...nestedBackups.filter((path) => isStrictChild(config.evidenceRoot, path)),
      worldAuditDependencyJunction,
    ],
  });
  add({
    id: 'inventory-provenance',
    category: 'evidence',
    path: config.inventoryRoot,
    source: 'Foundry Ops inventory, acquisition, and parity provenance',
    expectedVersion: null,
    rebuildability: 'unknown',
    retention: 'preserve',
    excludedPaths: [resolve(config.inventoryRoot, 'asset-inventory')],
  });
  add({
    id: 'restore-rehearsal',
    category: 'evidence',
    path: resolve(config.labRoot, 'restore-rehearsal'),
    source: 'Local backup restoration rehearsal evidence',
    expectedVersion: null,
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
  });

  for (const [id, folder] of [
    ['archives', 'archives'],
    ['removed-modules', 'removed-modules'],
  ] as const) {
    add({
      id,
      category: 'archives',
      path: resolve(config.labRoot, folder),
      source: 'Foundry Lab retained archive or superseded package copy',
      expectedVersion: null,
      rebuildability: 'unknown',
      retention: 'preserve',
    });
  }
  const legacyWorldArchive = resolve(config.repoRoot, '.local', 'cor-cotn.7z');
  add({
    id: 'legacy-world-archive',
    category: 'archives',
    path: legacyWorldArchive,
    source: 'Historical local world archive; provenance requires human review',
    expectedVersion: null,
    rebuildability: 'not-assumed-rebuildable',
    retention: 'critical',
  });

  for (const [id, folder, source] of [
    ['package-cache', 'cache', 'Foundry Lab reacquisition cache'],
    ['scratch', 'scratch', 'Foundry Lab temporary working area'],
    ['tmp', 'tmp', 'Foundry Lab temporary working area'],
  ] as const) {
    add({
      id,
      category: 'scratch-cache',
      path: resolve(config.labRoot, folder),
      source,
      expectedVersion: null,
      rebuildability: 'workflow-rebuildable',
      retention: 'review-before-removal',
    });
  }

  return {
    roots,
    exclusions: [
      {
        displayPath: displayPath(config, resolve(config.labRoot, 'credentials')),
        reason: 'Credential material is deliberately outside inventory hashing and reporting.',
      },
      {
        displayPath: displayPath(config, resolve(config.repoRoot, '.local', 'goddessfantasy.cookie')),
        reason: 'Authentication cookies are deliberately outside inventory hashing and reporting.',
      },
      {
        displayPath: '$FVTT_OPS_LAB_ROOT/data/*/Config',
        reason: 'Foundry profile configuration can contain secrets and is outside this asset-only inventory.',
      },
      {
        displayPath: displayPath(config, worldAuditDependencyJunction),
        reason: 'Verified junction to the Codex shared node_modules cache; it is not part of the retained world-audit evidence.',
      },
    ],
    defaultOutputParent: resolve(config.inventoryRoot, 'asset-inventory'),
  };
}

function displayPath(config: FoundryLabConfig, path: string): string {
  const absolute = resolve(path);
  const labRelative = relative(config.labRoot, absolute);
  if (labRelative === '') return '$FVTT_OPS_LAB_ROOT';
  if (!labRelative.startsWith(`..${sep}`) && labRelative !== '..') {
    return `$FVTT_OPS_LAB_ROOT/${labRelative.split(sep).join('/')}`;
  }
  const repoRelative = relative(config.repoRoot, absolute);
  if (repoRelative === '') return '$REPO_ROOT';
  if (!repoRelative.startsWith(`..${sep}`) && repoRelative !== '..') {
    return `$REPO_ROOT/${repoRelative.split(sep).join('/')}`;
  }
  return '<external-root>';
}

function isStrictChild(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`);
}

function uniquePaths<T extends readonly [string, string]>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const normalized = resolve(entry[1]).toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

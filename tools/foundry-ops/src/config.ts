import { lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export const FOUNDRY_OPS_ENVIRONMENT = {
  labRoot: 'FVTT_OPS_LAB_ROOT',
  evidenceRoot: 'FVTT_OPS_EVIDENCE_ROOT',
  backupRoot: 'FVTT_OPS_BACKUP_ROOT',
  foundryZip: 'FVTT_OPS_FOUNDRY_ZIP',
  defaultWorldId: 'FVTT_OPS_WORLD_ID',
  productionSshTarget: 'FVTT_OPS_PRODUCTION_SSH_TARGET',
  productionDataPath: 'FVTT_OPS_PRODUCTION_DATA_PATH',
  productionSshIdentity: 'FVTT_OPS_PRODUCTION_SSH_IDENTITY',
} as const;

export interface FoundryLabConfig {
  repoRoot: string;
  labRoot: string;
  appRoot: string;
  nodeRoot: string;
  cacheRoot: string;
  inventoryRoot: string;
  evidenceRoot: string;
  backupRoot: string;
  foundryZip: string;
  defaultWorldId: string;
  sshTarget: string;
  sshIdentityPath: string;
  remoteDataPath: string;
  versions: { foundry: '14.364'; node: '24.17.0'; dnd5e: '5.3.3' };
  spellResolver: {
    moduleId: 'fvtt-json-generator-spell-resolver';
    disposableWorldId: 'fvtt-v14-module-matrix';
  };
  profiles: {
    coreTest: { id: 'core-test'; dataPath: string; host: '127.0.0.1'; port: 30000 };
    serverMirror: { id: 'server-mirror'; dataPath: string; host: '127.0.0.1'; port: 30001 };
  };
}

type Environment = Readonly<Record<string, string | undefined>>;

export function createLabConfig(repoRoot = process.cwd(), environment: Environment = process.env): FoundryLabConfig {
  const root = resolve(repoRoot);
  const labRoot = resolve(environment[FOUNDRY_OPS_ENVIRONMENT.labRoot] || resolve(root, '.local/foundry-v14'));
  const evidenceRoot = resolve(environment[FOUNDRY_OPS_ENVIRONMENT.evidenceRoot] || resolve(labRoot, 'evidence'));
  const backupRoot = resolve(environment[FOUNDRY_OPS_ENVIRONMENT.backupRoot] || resolve(labRoot, 'backups'));
  assertConfiguredRootIsSpecific(root, labRoot, FOUNDRY_OPS_ENVIRONMENT.labRoot);
  assertConfiguredRootIsSpecific(root, evidenceRoot, FOUNDRY_OPS_ENVIRONMENT.evidenceRoot);
  assertConfiguredRootIsSpecific(root, backupRoot, FOUNDRY_OPS_ENVIRONMENT.backupRoot);

  return {
    repoRoot: root,
    labRoot,
    appRoot: resolve(labRoot, 'app/14.364'),
    nodeRoot: resolve(labRoot, 'runtime/node-v24.17.0-win-x64'),
    cacheRoot: resolve(labRoot, 'cache/packages'),
    inventoryRoot: resolve(labRoot, 'inventory'),
    evidenceRoot,
    backupRoot,
    foundryZip: resolve(environment[FOUNDRY_OPS_ENVIRONMENT.foundryZip] || 'D:/Download/FoundryVTT-Node-14.364.zip'),
    defaultWorldId: environment[FOUNDRY_OPS_ENVIRONMENT.defaultWorldId]?.trim() || 'cor-cotn',
    sshTarget: environment[FOUNDRY_OPS_ENVIRONMENT.productionSshTarget]?.trim() || '',
    sshIdentityPath: resolve(environment[FOUNDRY_OPS_ENVIRONMENT.productionSshIdentity] || resolve(homedir(), '.ssh/id_ed25519')),
    remoteDataPath: environment[FOUNDRY_OPS_ENVIRONMENT.productionDataPath]?.trim() || '',
    versions: { foundry: '14.364', node: '24.17.0', dnd5e: '5.3.3' },
    spellResolver: {
      moduleId: 'fvtt-json-generator-spell-resolver',
      disposableWorldId: 'fvtt-v14-module-matrix',
    },
    profiles: {
      coreTest: {
        id: 'core-test',
        dataPath: resolve(labRoot, 'data/core-test'),
        host: '127.0.0.1',
        port: 30000,
      },
      serverMirror: {
        id: 'server-mirror',
        dataPath: resolve(labRoot, 'data/server-mirror'),
        host: '127.0.0.1',
        port: 30001,
      },
    },
  };
}

export function requireProductionConnection(config: FoundryLabConfig): {
  sshTarget: string;
  sshIdentityPath: string;
  remoteDataPath: string;
} {
  const missing: string[] = [];
  if (!config.sshTarget) missing.push(FOUNDRY_OPS_ENVIRONMENT.productionSshTarget);
  if (!config.remoteDataPath) missing.push(FOUNDRY_OPS_ENVIRONMENT.productionDataPath);
  if (!config.sshIdentityPath) missing.push(FOUNDRY_OPS_ENVIRONMENT.productionSshIdentity);
  if (missing.length > 0) {
    throw new Error(`Production access is not configured. Set: ${missing.join(', ')}`);
  }
  return {
    sshTarget: config.sshTarget,
    sshIdentityPath: config.sshIdentityPath,
    remoteDataPath: config.remoteDataPath,
  };
}

function assertConfiguredRootIsSpecific(repoRoot: string, target: string, variable: string): void {
  const resolvedTarget = resolve(target);
  const volumeRoot = parse(resolvedTarget).root;
  if (relative(volumeRoot, resolvedTarget) === '' || relative(repoRoot, resolvedTarget) === '') {
    throw new Error(`${variable} must name a specific directory, not a volume or repository root: ${resolvedTarget}`);
  }
}

function resolvesOutside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

export function resolveThroughExistingAncestor(target: string): string {
  let existingAncestor = resolve(target);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const stats = lstatSync(existingAncestor);
      if (stats.isSymbolicLink()) {
        throw new Error(`Unsafe symlink or junction in path: ${existingAncestor}`);
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return resolve(existingAncestor, ...missingSegments.reverse());
    missingSegments.push(basename(existingAncestor));
    existingAncestor = parent;
  }

  return resolve(realpathSync.native(existingAncestor), ...missingSegments.reverse());
}

export function assertNoReparsePathComponents(root: string, target: string, label: string): void {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (resolvesOutside(lexicalRoot, lexicalTarget)) {
    throw new Error(`${label} escapes its approved root: ${lexicalTarget}`);
  }
  const rel = relative(lexicalRoot, lexicalTarget);
  let current = lexicalRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`${label} contains an unsafe symlink, junction, or reparse point: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function assertExactRepoPath(
  config: FoundryLabConfig,
  target: string,
  repoRelativeSegments: readonly string[],
  label: string,
): void {
  const lexicalExpected = resolve(config.repoRoot, ...repoRelativeSegments);
  if (relative(lexicalExpected, resolve(target)) !== '') {
    throw new Error(`${label} must be the exact repository path: ${lexicalExpected}`);
  }
  assertNoReparsePathComponents(config.repoRoot, target, label);

  const realRepoRoot = resolveThroughExistingAncestor(config.repoRoot);
  const physicalExpected = resolve(realRepoRoot, ...repoRelativeSegments);
  const physicalTarget = resolveThroughExistingAncestor(target);
  if (relative(physicalExpected, physicalTarget) !== '') {
    throw new Error(`${label} must not cross a symlink or junction: ${lexicalExpected}`);
  }
}

export function assertExactLabPath(
  config: FoundryLabConfig,
  target: string,
  labRelativeSegments: readonly string[],
  label: string,
): void {
  const expected = resolve(config.labRoot, ...labRelativeSegments);
  if (relative(expected, resolve(target)) !== '') {
    throw new Error(`${label} must be the exact configured Foundry lab path: ${expected}`);
  }
  assertInsideLabRoot(config, target);
}

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  const approvedRoots = [...new Set([config.labRoot, config.evidenceRoot, config.backupRoot].map((root) => resolve(root)))];
  const approvedRoot = approvedRoots.find((root) => !resolvesOutside(root, candidate));
  if (!isAbsolute(candidate) || !approvedRoot) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }

  const volumeRoot = parse(approvedRoot).root;
  assertNoReparsePathComponents(volumeRoot, approvedRoot, 'Target escapes Foundry lab root; configured root');
  assertNoReparsePathComponents(approvedRoot, candidate, 'Target escapes Foundry lab root; path');

  const physicalRoot = resolveThroughExistingAncestor(approvedRoot);
  const physicalCandidate = resolveThroughExistingAncestor(candidate);
  if (resolvesOutside(physicalRoot, physicalCandidate)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
}

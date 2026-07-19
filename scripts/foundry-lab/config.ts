import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface FoundryLabConfig {
  repoRoot: string;
  labRoot: string;
  appRoot: string;
  nodeRoot: string;
  cacheRoot: string;
  inventoryRoot: string;
  evidenceRoot: string;
  foundryZip: string;
  sshTarget: string;
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

export function createLabConfig(repoRoot = process.cwd()): FoundryLabConfig {
  const root = resolve(repoRoot);
  const labRoot = resolve(root, '.local/foundry-v14');
  return {
    repoRoot: root,
    labRoot,
    appRoot: resolve(labRoot, 'app/14.364'),
    nodeRoot: resolve(labRoot, 'runtime/node-v24.17.0-win-x64'),
    cacheRoot: resolve(labRoot, 'cache/packages'),
    inventoryRoot: resolve(labRoot, 'inventory'),
    evidenceRoot: resolve(labRoot, 'evidence'),
    foundryZip: resolve('D:/Download/FoundryVTT-Node-14.364.zip'),
    sshTarget: 'Administrator@49.232.12.153',
    remoteDataPath: 'E:/Bill/fvtt_v13/data',
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

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  if (!isAbsolute(candidate) || resolvesOutside(config.labRoot, candidate)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
  assertNoReparsePathComponents(config.repoRoot, candidate, 'Target escapes Foundry lab root; path');

  const realRepoRoot = resolveThroughExistingAncestor(config.repoRoot);
  const realLabRoot = resolveThroughExistingAncestor(config.labRoot);
  if (resolvesOutside(realRepoRoot, realLabRoot)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }

  const expectedRealLabRoot = resolve(realRepoRoot, '.local/foundry-v14');
  if (relative(expectedRealLabRoot, realLabRoot) !== '') {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }

  const realCandidate = resolveThroughExistingAncestor(candidate);
  if (resolvesOutside(realLabRoot, realCandidate)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
}

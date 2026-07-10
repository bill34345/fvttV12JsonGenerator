import { existsSync, realpathSync } from 'node:fs';
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

function resolveThroughExistingAncestor(target: string): string {
  let existingAncestor = resolve(target);
  const missingSegments: string[] = [];

  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return resolve(existingAncestor, ...missingSegments.reverse());
    missingSegments.push(basename(existingAncestor));
    existingAncestor = parent;
  }

  return resolve(realpathSync.native(existingAncestor), ...missingSegments.reverse());
}

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  if (!isAbsolute(candidate) || resolvesOutside(config.labRoot, candidate)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }

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

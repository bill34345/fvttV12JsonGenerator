import { isAbsolute, relative, resolve } from 'node:path';

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

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  const rel = relative(config.labRoot, candidate);
  if (!isAbsolute(candidate) || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
}

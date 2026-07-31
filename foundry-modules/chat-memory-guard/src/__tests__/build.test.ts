import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  assertChatMemoryGuardDestination,
  chatMemoryGuardWorkspaceInstallPaths,
  installChatMemoryGuardPackage,
} from '../../build';

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'cmg-build-'));
  temporary.push(root);
  return root;
}

describe('chat memory guard installation safeguards', () => {
  test('rejects a destination outside the exact project-local module path', async () => {
    const root = await makeRoot();
    expect(() => assertChatMemoryGuardDestination(root, resolve(root, 'elsewhere/chat-memory-guard'))).toThrow(/exact/i);
  });

  test('uses configured external lab and backup roots without weakening exact-path checks', async () => {
    const root = await makeRoot();
    const labRoot = resolve(root, 'external-foundry-lab');
    const backupRoot = resolve(root, 'external-foundry-backups');
    const environment = {
      FVTT_OPS_LAB_ROOT: labRoot,
      FVTT_OPS_BACKUP_ROOT: backupRoot,
    };
    const paths = chatMemoryGuardWorkspaceInstallPaths(root, environment);

    expect(paths.destination).toBe(resolve(labRoot, 'data/server-mirror/Data/modules/chat-memory-guard'));
    expect(paths.backupRoot).toBe(resolve(backupRoot, 'chat-memory-guard'));
    expect(assertChatMemoryGuardDestination(root, paths.destination, environment)).toBe(paths.destination);
    expect(() => assertChatMemoryGuardDestination(root, paths.destination)).toThrow(/exact configured/i);
    expect(() => chatMemoryGuardWorkspaceInstallPaths(root, {
      FVTT_OPS_LAB_ROOT: root,
    })).toThrow(/specific directory/i);

    const build = resolve(root, 'dist/chat-memory-guard/module');
    await mkdir(build, { recursive: true });
    await writeFile(resolve(build, 'module.json'), JSON.stringify({
      id: 'chat-memory-guard',
      version: '1.0.0',
    }));
    const installed = await installChatMemoryGuardPackage(root, build, environment);
    expect(installed.destination).toBe(paths.destination);
    expect(JSON.parse(await readFile(resolve(installed.destination, 'module.json'), 'utf8')).version).toBe('1.0.0');
  });

  test('rejects an external lab root routed through a junction before writing', async () => {
    const root = await makeRoot();
    const physicalRoot = resolve(root, 'physical-root');
    const labRoot = resolve(root, 'lab-link');
    const build = resolve(root, 'dist/chat-memory-guard/module');
    await mkdir(physicalRoot, { recursive: true });
    await mkdir(build, { recursive: true });
    await symlink(physicalRoot, labRoot, 'junction');
    await writeFile(resolve(build, 'module.json'), JSON.stringify({
      id: 'chat-memory-guard',
      version: '1.0.0',
    }));

    await expect(installChatMemoryGuardPackage(root, build, {
      FVTT_OPS_LAB_ROOT: labRoot,
    })).rejects.toThrow(/junction|reparse|symlink/i);
    expect(await Bun.file(resolve(
      physicalRoot,
      'data/server-mirror/Data/modules/chat-memory-guard/module.json',
    )).exists()).toBeFalse();
  });

  test('refuses an unknown same-name module and preserves it byte-for-byte', async () => {
    const root = await makeRoot();
    const build = resolve(root, 'dist/chat-memory-guard/module');
    const destination = resolve(root, '.local/foundry-v14/data/server-mirror/Data/modules/chat-memory-guard');
    await mkdir(build, { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(build, 'module.json'), JSON.stringify({ id: 'chat-memory-guard' }));
    await writeFile(resolve(destination, 'module.json'), JSON.stringify({ id: 'foreign-module' }));
    const before = await readFile(resolve(destination, 'module.json'), 'utf8');
    await expect(installChatMemoryGuardPackage(root, build)).rejects.toThrow(/foreign|unknown/i);
    expect(await readFile(resolve(destination, 'module.json'), 'utf8')).toBe(before);
  });

  test('backs up a prior owned installation before replacing it', async () => {
    const root = await makeRoot();
    const build = resolve(root, 'dist/chat-memory-guard/module');
    const destination = resolve(root, '.local/foundry-v14/data/server-mirror/Data/modules/chat-memory-guard');
    await mkdir(build, { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(build, 'module.json'), JSON.stringify({ id: 'chat-memory-guard', version: '1.0.0' }));
    await writeFile(resolve(destination, 'module.json'), JSON.stringify({ id: 'chat-memory-guard', version: '0.9.0' }));
    const result = await installChatMemoryGuardPackage(root, build);
    expect(result.backupPath).toBeTruthy();
    expect(JSON.parse(await readFile(resolve(result.backupPath!, 'module.json'), 'utf8')).version).toBe('0.9.0');
    expect(JSON.parse(await readFile(resolve(destination, 'module.json'), 'utf8')).version).toBe('1.0.0');
  });
});

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  assertChatMemoryGuardDestination,
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

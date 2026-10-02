import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONDITION_DEFINITIONS } from '@fvtt-json-generator/contracts/conditions';

const moduleRoot = resolve(import.meta.dir, '..');
const iconRoot = resolve(moduleRoot, 'src/icons');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function buildModule(cwd = moduleRoot): { zipPath: string; files: string[] } {
  // Run the published build script in its own process; Bun.build cannot reliably
  // bundle a workspace module while bun:test is loading that same module.
  const result = Bun.spawnSync({ cmd: [process.execPath, 'run', resolve(moduleRoot, 'build.ts')], cwd, stdout: 'pipe', stderr: 'pipe' });
  expect(result.exitCode).toBe(0);
  const output = new TextDecoder().decode(result.stdout);
  return JSON.parse(output.slice(output.indexOf('{'))) as { zipPath: string; files: string[] };
}

function storedZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    expect(view.getUint16(offset + 8, true)).toBe(0); // Stored, never compressed.
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    expect(entries.has(name)).toBeFalse();
    entries.set(name, bytes.subarray(start, start + size));
    offset = start + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50); // Central directory follows.
  return entries;
}

test('build packages every credited custom-condition SVG with exact source bytes', async () => {
  const credits = await readFile(resolve(moduleRoot, 'CREDITS.md'));
  const text = credits.toString('utf8');
  expect(text).toContain('Creative Commons Attribution 3.0 Unported (CC BY 3.0)');
  const listed = [...text.matchAll(/\| `icons\/([^/`]+\.svg)` .*?\| `([0-9a-f]{64})` \|/g)];
  const names = listed.map((row) => row[1]!);
  expect(names.sort()).toEqual(Object.keys(CONDITION_DEFINITIONS).map((id) => `${id}.svg`).sort());
  expect((await readdir(iconRoot)).sort()).toEqual([...names, 'injury'].sort());

  const built = buildModule();
  const archive = storedZipEntries(new Uint8Array(await readFile(built.zipPath)));
  expect([...archive.keys()].sort()).toEqual([...built.files].sort());
  expect([...archive.keys()].filter((name) => name.startsWith('icons/'))).toHaveLength(22);
  expect(archive.get('CREDITS.md')).toEqual(credits);
  for (const row of listed) {
    const name = row[1]!;
    const expectedHash = row[2]!;
    const original = new Uint8Array(await readFile(resolve(iconRoot, name)));
    expect(sha256(original)).toBe(expectedHash);
    expect(archive.get(`icons/${name}`)).toEqual(original);
    expect(sha256(archive.get(`icons/${name}`)!)).toBe(expectedHash);
  }
  const injuryHashes = [
    '0bbf9c29d30da4e1fbfa55e612adad767282cd8d4c66beefc806fa81d9b832b1',
    '0bbf9c29d30da4e1fbfa55e612adad767282cd8d4c66beefc806fa81d9b832b1',
    '0bbf9c29d30da4e1fbfa55e612adad767282cd8d4c66beefc806fa81d9b832b1',
  ];
  for (const level of [1, 2, 3]) {
    const name = `injury/injury-${level}.svg`;
    const original = new Uint8Array(await readFile(resolve(iconRoot, name)));
    expect(sha256(original)).toBe(injuryHashes[level - 1]!);
    expect(archive.get(`icons/${name}`)).toEqual(original);
    expect(text).toContain(`icons/${name}`);
  }

  const firstHash = sha256(new Uint8Array(await readFile(built.zipPath)));
  expect(sha256(new Uint8Array(await readFile(buildModule().zipPath)))).toBe(firstHash);
  expect(sha256(new Uint8Array(await readFile(buildModule(resolve(moduleRoot, '../..')).zipPath)))).toBe(firstHash);
});

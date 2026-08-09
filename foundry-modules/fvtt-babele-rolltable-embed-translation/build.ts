import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const MODULE_ID = 'fvtt-babele-rolltable-embed-translation';
const packageRoot = resolve(import.meta.dir);
const sourceRoot = resolve(packageRoot, 'src');
const distRoot = resolve(packageRoot, 'dist');
const moduleRoot = resolve(distRoot, 'module');

export async function buildModule(): Promise<{ moduleRoot: string; zipPath: string }> {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(resolve(moduleRoot, 'scripts'), { recursive: true });

  const build = await Bun.build({
    entrypoints: [resolve(sourceRoot, 'index.ts')],
    outdir: resolve(moduleRoot, 'scripts'),
    naming: 'index.js',
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'none',
  });
  if (!build.success) throw new Error(`Browser build failed:\n${build.logs.map(String).join('\n')}`);

  await cp(resolve(sourceRoot, 'module.json'), resolve(moduleRoot, 'module.json'));
  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || manifest.version !== '0.1.0') throw new Error('Built module manifest identity drifted.');

  const files = await collectFiles(moduleRoot);
  const entries = await Promise.all(files.map(async (path) => ({
    name: relative(moduleRoot, path).replace(/\\/g, '/'),
    bytes: new Uint8Array(await readFile(path)),
  })));
  const zipPath = resolve(distRoot, `${MODULE_ID}.zip`);
  await writeFile(zipPath, createStoredZip(entries));
  return { moduleRoot, zipPath };
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob('**/*');
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) files.push(resolve(root, path));
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

interface ZipEntry { name: string; bytes: Uint8Array }

function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...localParts, ...centralParts, end]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

if (import.meta.main) console.log(JSON.stringify({ ok: true, ...(await buildModule()) }, null, 2));

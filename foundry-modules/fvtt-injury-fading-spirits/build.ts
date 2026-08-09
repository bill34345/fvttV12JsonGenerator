import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export const MODULE_ID = 'fvtt-injury-fading-spirits' as const;
export const MODULE_VERSION = '1.0.0' as const;
const root = resolve(import.meta.dir);
const source = resolve(root, 'src');
const dist = resolve(root, 'dist');
const moduleRoot = resolve(dist, 'module');

export async function buildModule(): Promise<{ moduleRoot: string; zipPath: string; files: string[] }> {
  if (await exists(dist)) await rm(dist, { recursive: true });
  await mkdir(resolve(moduleRoot, 'scripts'), { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(source, 'index.ts')], outdir: resolve(moduleRoot, 'scripts'), naming: 'index.js',
    target: 'browser', format: 'esm', splitting: false, minify: false, sourcemap: 'none',
  });
  if (!result.success) throw new Error(`Browser build failed: ${result.logs.map(String).join('; ')}`);
  await cp(resolve(source, 'module.json'), resolve(moduleRoot, 'module.json'));
  await cp(resolve(source, 'lang'), resolve(moduleRoot, 'lang'), { recursive: true });
  await cp(resolve(source, 'icons'), resolve(moduleRoot, 'icons'), { recursive: true });
  await cp(resolve(source, 'styles'), resolve(moduleRoot, 'styles'), { recursive: true });
  await cp(resolve(root, 'README.zh-CN.md'), resolve(moduleRoot, 'README.zh-CN.md'));
  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, any>;
  validateManifest(manifest);
  const browserText = await readFile(resolve(moduleRoot, 'scripts/index.js'), 'utf8');
  const forbidden = [/node:/i, /process\.env/i, /from ['"](?:node:|fs|path|os)/i];
  const match = forbidden.find((pattern) => pattern.test(browserText));
  if (match) throw new Error(`Browser bundle contains a server-only dependency: ${String(match)}`);
  const files = await collectFiles(moduleRoot);
  const entries = await Promise.all(files.map(async (path) => ({
    name: relative(moduleRoot, path).replace(/\\/g, '/'), bytes: new Uint8Array(await readFile(path)),
  })));
  const zipPath = resolve(dist, `${MODULE_ID}.zip`);
  await writeFile(zipPath, createStoredZip(entries));
  return { moduleRoot, zipPath, files: entries.map((entry) => entry.name) };
}

export function validateManifest(manifest: Record<string, any>): void {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Manifest identity/version mismatch.');
  const core = manifest.compatibility ?? {};
  if (core.minimum !== '14.364' || core.verified !== '14.364' || core.maximum !== '14.364') throw new Error('Foundry compatibility must be exactly 14.364.');
  const dnd5e = (manifest.relationships?.systems ?? []).find((entry: any) => entry.id === 'dnd5e');
  const system = dnd5e?.compatibility ?? {};
  if (system.minimum !== '5.3.3' || system.verified !== '5.3.3' || system.maximum !== '5.3.3') throw new Error('dnd5e compatibility must be exactly 5.3.3.');
  if (JSON.stringify(manifest.esmodules) !== JSON.stringify(['scripts/index.js']) || manifest.socket !== true) throw new Error('Manifest browser/socket contract drifted.');
  if (manifest.relationships?.requires) throw new Error('This module must not have hard module dependencies.');
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Build tree contains a symlink/junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push(path);
    }
  }
  await visit(directory);
  return files;
}

interface ZipEntry { name: string; bytes: Uint8Array }
export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const ordered = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of ordered) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, entry.bytes.length, true); lv.setUint32(22, entry.bytes.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30); local.set(entry.bytes, 30 + name.length); locals.push(local);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, entry.bytes.length, true); cv.setUint32(24, entry.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.set(name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, ordered.length, true); ev.setUint16(10, ordered.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output;
}

const crcTable = (() => { const table = new Uint32Array(256); for (let i = 0; i < 256; i += 1) { let value = i; for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; table[i] = value; } return table; })();
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!; return (crc ^ 0xffffffff) >>> 0; }
async function exists(path: string): Promise<boolean> { return Boolean(await lstat(path).catch(() => undefined)); }

if (import.meta.main) console.log(JSON.stringify({ ok: true, ...(await buildModule()) }, null, 2));

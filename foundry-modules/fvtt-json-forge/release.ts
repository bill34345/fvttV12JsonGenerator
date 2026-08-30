import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DOWNLOAD_URL,
  MANIFEST_URL,
  MODULE_ID,
  MODULE_VERSION,
  RELEASE_TAG,
  buildModule,
  validateManifest,
} from './build';

export const RELEASE_ARCHIVE_NAME = `${MODULE_ID}-${MODULE_VERSION}.zip` as const;
export const RELEASE_MANIFEST_NAME = `${MODULE_ID}-module.json` as const;
export const RELEASE_CHECKSUM_NAME = 'SHA256SUMS.txt' as const;

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export interface ForgeReleaseResult {
  releaseTag: string;
  releaseRoot: string;
  archivePath: string;
  manifestPath: string;
  checksumPath: string;
  archiveSha256: string;
  manifestSha256: string;
  archiveEntries: string[];
}

export async function buildForgeRelease(): Promise<ForgeReleaseResult> {
  const built = await buildModule();
  const releaseRoot = resolve(import.meta.dir, 'dist/release');
  await mkdir(releaseRoot, { recursive: true });

  const entries = await Promise.all(built.files.map(async (name) => ({
    name,
    bytes: new Uint8Array(await readFile(resolve(built.moduleRoot, name))),
  })));
  const archive = createStoredZip(entries);
  const archiveEntries = [...readStoredZip(archive).keys()];
  if (JSON.stringify(archiveEntries) !== JSON.stringify(built.files)) {
    throw new Error('FVTT JSON Forge release archive does not exactly match the built module tree.');
  }

  const manifestBytes = new Uint8Array(await readFile(resolve(built.moduleRoot, 'module.json')));
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
  validateManifest(manifest);
  if (manifest.manifest !== MANIFEST_URL || manifest.download !== DOWNLOAD_URL) {
    throw new Error('FVTT JSON Forge release manifest does not point to the canonical release assets.');
  }

  const archivePath = resolve(releaseRoot, RELEASE_ARCHIVE_NAME);
  const manifestPath = resolve(releaseRoot, RELEASE_MANIFEST_NAME);
  const checksumPath = resolve(releaseRoot, RELEASE_CHECKSUM_NAME);
  const archiveSha256 = sha256(archive);
  const manifestSha256 = sha256(manifestBytes);
  const checksums = `${archiveSha256}  ${RELEASE_ARCHIVE_NAME}\n${manifestSha256}  ${RELEASE_MANIFEST_NAME}\n`;
  await writeFile(archivePath, archive);
  await writeFile(manifestPath, manifestBytes);
  await writeFile(checksumPath, checksums, 'utf8');

  return {
    releaseTag: RELEASE_TAG,
    releaseRoot,
    archivePath,
    manifestPath,
    checksumPath,
    archiveSha256,
    manifestSha256,
    archiveEntries,
  };
}

export function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const names = new Set<string>();

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').includes('..') || names.has(entry.name)) {
      throw new Error(`Unsafe or duplicate ZIP entry: ${entry.name}`);
    }
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
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
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
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
  return concatenate([...localParts, ...centralParts, end]);
}

export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length < 22) throw new Error('ZIP archive is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  if (view.getUint32(endOffset, true) !== 0x06054b50 || view.getUint16(endOffset + 20, true) !== 0) throw new Error('ZIP end record is invalid.');
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset + centralSize !== endOffset) throw new Error('ZIP central directory boundary is invalid.');

  const output = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP central directory entry is invalid.');
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (method !== 0 || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('ZIP entry is not a supported stored file.');
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (name !== localName || output.has(name)) throw new Error(`ZIP entry identity is invalid: ${name}`);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + size);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`ZIP entry content is invalid: ${name}`);
    output.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP central directory length is invalid.');
  return output;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

if (import.meta.main) console.log(JSON.stringify({ ok: true, ...(await buildForgeRelease()) }, null, 2));

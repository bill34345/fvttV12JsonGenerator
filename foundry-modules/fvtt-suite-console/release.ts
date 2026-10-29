import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertNoReparsePathComponents } from '../../tools/foundry-ops/src/config';
import { buildModule, shippedFiles, validateManifest } from './build';
import { MODULE_ID, MODULE_VERSION } from './src/runtime';

export const ARCHIVE_NAME = `${MODULE_ID}-${MODULE_VERSION}.zip`;
export const MANIFEST_NAME = `${MODULE_ID}-module.json`;
export const HANDBOOK_NAME = '工具手册.html';
export const CHECKSUM_NAME = 'SHA256SUMS.txt';
export const RECEIPT_NAME = 'release-candidate.json';
const releaseNames = [ARCHIVE_NAME, MANIFEST_NAME, HANDBOOK_NAME, CHECKSUM_NAME, RECEIPT_NAME];
const owner = import.meta.dir;
const repo = resolve(owner, '../..');
const releaseRoot = resolve(owner, 'dist/release');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

type Entry = { name: string; bytes: Uint8Array };

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function createStoredZip(entries: readonly Entry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const names = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.includes(':') || entry.name.split('/').some(part => !part || part === '.' || part === '..') || names.has(entry.name)) {
      throw new Error(`Unsafe or duplicate ZIP entry: ${entry.name}`);
    }
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const header = new Uint8Array(30 + name.length);
    const localView = new DataView(header.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, entry.bytes);
    const record = new Uint8Array(46 + name.length);
    const centralView = new DataView(record.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    record.set(name, 46);
    central.push(record);
    offset += header.length + entry.bytes.length;
  }
  const directory = concat(central);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, directory.length, true);
  view.setUint32(16, offset, true);
  return concat([...local, directory, end]);
}

export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length < 22) throw new Error('ZIP is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true) !== 0) throw new Error('ZIP end record is invalid.');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (directoryOffset + directorySize !== end) throw new Error('ZIP directory boundary is invalid.');
  const output = new Map<string, Uint8Array>();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP directory entry is invalid.');
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (method !== 0 || cursor + 46 + nameLength + extraLength + commentLength > end || localOffset + 30 > directoryOffset || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('ZIP stored entry is invalid.');
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localLength = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localLength));
    const dataOffset = localOffset + 30 + localLength + localExtra;
    if (name !== localName || output.has(name) || dataOffset + size > directoryOffset) throw new Error(`ZIP path or payload is invalid: ${name}`);
    const data = bytes.slice(dataOffset, dataOffset + size);
    if (crc32(data) !== crc || view.getUint32(localOffset + 14, true) !== crc) throw new Error(`ZIP CRC is invalid: ${name}`);
    output.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) throw new Error('ZIP directory length is invalid.');
  return output;
}

export async function assertPlainReleaseTree(directory = releaseRoot): Promise<void> {
  const stat = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Release target is not a plain directory.');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const child = await lstat(path);
    if (!child.isFile() || child.isSymbolicLink() || child.nlink !== 1 || !releaseNames.includes(entry.name)) throw new Error('Unknown release payload; refusing to overwrite: ' + path);
  }
}

export async function buildRelease() {
  const built = await buildModule();
  assertNoReparsePathComponents(owner, releaseRoot, 'Suite release output');
  await assertPlainReleaseTree();
  const files = await Promise.all(shippedFiles.map(async name => ({ name, bytes: new Uint8Array(await readFile(resolve(built.output, name))) })));
  const manifestBytes = files[0]!.bytes;
  validateManifest(JSON.parse(decoder.decode(manifestBytes)));
  const archive = createStoredZip(files);
  const readback = readStoredZip(archive);
  if (JSON.stringify([...readback.keys()]) !== JSON.stringify(shippedFiles)) throw new Error('Suite archive file list differs from build whitelist.');
  for (const file of files) if (!Buffer.from(readback.get(file.name)!).equals(Buffer.from(file.bytes))) throw new Error('Suite archive bytes differ from built file: ' + file.name);
  const handbookSource = resolve(repo, HANDBOOK_NAME);
  const handbookStat = await lstat(handbookSource);
  if (!handbookStat.isFile() || handbookStat.isSymbolicLink() || handbookStat.nlink !== 1) throw new Error('Offline handbook source must be a plain independent file.');
  const handbookBytes = new Uint8Array(await readFile(handbookSource));
  if (sha256(handbookBytes) !== built.handbookHtmlSha256) throw new Error('Offline handbook changed after Suite build.');
  const checksum = `${sha256(archive)}  ${ARCHIVE_NAME}\n${sha256(manifestBytes)}  ${MANIFEST_NAME}\n${sha256(handbookBytes)}  ${HANDBOOK_NAME}\n`;
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(resolve(releaseRoot, ARCHIVE_NAME), archive);
  await writeFile(resolve(releaseRoot, MANIFEST_NAME), manifestBytes);
  await writeFile(resolve(releaseRoot, HANDBOOK_NAME), handbookBytes);
  await writeFile(resolve(releaseRoot, CHECKSUM_NAME), checksum);
  const deliveredHandbook = new Uint8Array(await readFile(resolve(releaseRoot, HANDBOOK_NAME)));
  if (!Buffer.from(deliveredHandbook).equals(Buffer.from(handbookBytes))) throw new Error('Offline handbook delivery bytes differ from source.');
  const receipt = {
    schemaVersion: 1, status: 'local-delivery-candidate', moduleId: MODULE_ID, version: MODULE_VERSION,
    archive: { name: ARCHIVE_NAME, bytes: archive.length, sha256: sha256(archive) },
    manifest: { name: MANIFEST_NAME, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    offlineHandbook: { sourcePath: HANDBOOK_NAME, name: HANDBOOK_NAME, bytes: handbookBytes.length,
      sourceSha256: sha256(handbookBytes), deliverySha256: sha256(deliveredHandbook) },
    checksums: { name: CHECKSUM_NAME, bytes: encoder.encode(checksum).length, sha256: sha256(encoder.encode(checksum)) },
    archiveFiles: files.map(file => ({ path: file.name, bytes: file.bytes.length, sha256: sha256(file.bytes) })),
    releaseFiles: releaseNames,
    externalPublicationPrerequisites: ['正式品牌与授权决定', '可信发布渠道及规范 manifest/download URL', '对应渠道的安装与运行验收'],
  };
  await writeFile(resolve(releaseRoot, RECEIPT_NAME), JSON.stringify(receipt, null, 2) + '\n');
  await assertPlainReleaseTree();
  return { releaseRoot, ...receipt };
}

if (import.meta.main) console.log(JSON.stringify(await buildRelease(), null, 2));

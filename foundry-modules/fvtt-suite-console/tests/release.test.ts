import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, lstat, mkdtemp, mkdir, readFile, readdir, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { assertPlainBuildTree, shippedFiles } from '../build';
import { ARCHIVE_NAME, CHECKSUM_NAME, HANDBOOK_NAME, MANIFEST_NAME, RECEIPT_NAME, assertPlainReleaseTree, buildRelease, createStoredZip, readStoredZip } from '../release';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('stored ZIP validates payload CRC and rejects unsafe names', () => {
  const archive = createStoredZip([{ name: 'module.json', bytes: new TextEncoder().encode('{"id":"test"}') }]);
  expect(new TextDecoder().decode(readStoredZip(archive).get('module.json'))).toBe('{"id":"test"}');
  const corrupted = archive.slice();
  corrupted[corrupted.indexOf(0x7b)] = 0x5b;
  expect(() => readStoredZip(corrupted)).toThrow('CRC');
  for (const name of ['../escape', '/absolute', 'a\\b', 'a//b', 'C:/windows/path']) {
    expect(() => createStoredZip([{ name, bytes: new Uint8Array() }])).toThrow('Unsafe');
  }
});

test('stored ZIP central and local timestamps are the same valid fixed DOS date', () => {
  const encoder = new TextEncoder();
  const archive = createStoredZip([
    { name: 'module.json', bytes: encoder.encode('{}') },
    { name: 'scripts/index.js', bytes: encoder.encode('export {};') },
  ]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  let central = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  expect(count).toBe(2);
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    const local = view.getUint32(central + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const centralTime = view.getUint16(central + 12, true);
    const centralDate = view.getUint16(central + 14, true);
    expect(centralTime).toBe(view.getUint16(local + 10, true));
    expect(centralDate).toBe(view.getUint16(local + 12, true));
    expect(centralTime).toBe(0);
    expect(centralDate).toBe(0x0021);
    expect((centralDate >>> 5) & 0x0f).toBe(1);
    expect(centralDate & 0x1f).toBe(1);
    central += 46 + view.getUint16(central + 28, true) + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
  }
  expect(central).toBe(end);
});

test('build and release output guards reject unknown payloads and links', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'suite-release-test-'));
  try {
    const moduleRoot = resolve(root, 'module');
    const releaseRoot = resolve(root, 'release');
    await mkdir(moduleRoot);
    await mkdir(releaseRoot);
    await writeFile(resolve(moduleRoot, HANDBOOK_NAME), 'old full handbook');
    await writeFile(resolve(releaseRoot, 'unknown.txt'), 'keep');
    await expect(assertPlainBuildTree(moduleRoot)).rejects.toThrow('Unknown build payload');
    await expect(assertPlainReleaseTree(releaseRoot)).rejects.toThrow('Unknown release payload');
    await rm(resolve(moduleRoot, HANDBOOK_NAME));
    await rm(resolve(releaseRoot, 'unknown.txt'));
    await mkdir(resolve(moduleRoot, 'unknown-directory'));
    await expect(assertPlainBuildTree(moduleRoot)).rejects.toThrow('Unknown build directory');
    await rmdir(resolve(moduleRoot, 'unknown-directory'));
    await symlink(releaseRoot, resolve(moduleRoot, 'scripts'), 'junction');
    await expect(assertPlainBuildTree(moduleRoot)).rejects.toThrow('Build target contains a link');
    await rmdir(resolve(moduleRoot, 'scripts'));
    await symlink(moduleRoot, resolve(releaseRoot, ARCHIVE_NAME), 'file');
    await expect(assertPlainReleaseTree(releaseRoot)).rejects.toThrow('Unknown release payload');
    expect((await lstat(resolve(releaseRoot, ARCHIVE_NAME))).isSymbolicLink()).toBe(true);
    await rm(resolve(releaseRoot, ARCHIVE_NAME));
    const outside = resolve(root, 'outside.txt');
    await writeFile(outside, 'keep');
    await link(outside, resolve(releaseRoot, ARCHIVE_NAME));
    await expect(assertPlainReleaseTree(releaseRoot)).rejects.toThrow('Unknown release payload');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('local delivery archive matches the exact build whitelist and is deterministic', async () => {
  const first = await buildRelease();
  const archive = new Uint8Array(await readFile(resolve(first.releaseRoot, ARCHIVE_NAME)));
  const standaloneManifest = new Uint8Array(await readFile(resolve(first.releaseRoot, MANIFEST_NAME)));
  const standaloneHtml = new Uint8Array(await readFile(resolve(first.releaseRoot, HANDBOOK_NAME)));
  const checksums = await readFile(resolve(first.releaseRoot, CHECKSUM_NAME), 'utf8');
  const receipt = JSON.parse(await readFile(resolve(first.releaseRoot, RECEIPT_NAME), 'utf8'));
  const entries = readStoredZip(archive);
  expect([...entries.keys()]).toEqual([...shippedFiles]);
  expect(entries.has(HANDBOOK_NAME)).toBe(false);
  await expect(readFile(resolve(first.releaseRoot, '../module', HANDBOOK_NAME))).rejects.toMatchObject({ code: 'ENOENT' });
  expect([...entries.keys()]).toEqual(receipt.archiveFiles.map((file: { path: string }) => file.path));
  expect(Buffer.from(standaloneManifest).equals(Buffer.from(entries.get('module.json')!))).toBe(true);
  const manifest = JSON.parse(new TextDecoder().decode(standaloneManifest));
  expect(manifest.version).toBe('0.3.0');
  expect(manifest.manifest).toBeUndefined();
  expect(manifest.download).toBeUndefined();
  expect(receipt.status).toBe('local-delivery-candidate');
  expect(receipt.releaseFiles).toEqual([ARCHIVE_NAME, MANIFEST_NAME, HANDBOOK_NAME, CHECKSUM_NAME, RECEIPT_NAME]);
  expect((await readdir(first.releaseRoot)).sort()).toEqual([...receipt.releaseFiles].sort());
  expect(receipt.archive.bytes).toBe(archive.length);
  expect(receipt.archive.sha256).toBe(sha256(archive));
  expect(checksums).toBe(`${sha256(archive)}  ${ARCHIVE_NAME}\n${sha256(standaloneManifest)}  ${MANIFEST_NAME}\n${sha256(standaloneHtml)}  ${HANDBOOK_NAME}\n`);
  expect(receipt.checksums.bytes).toBe(new TextEncoder().encode(checksums).length);
  expect(receipt.checksums.sha256).toBe(sha256(new TextEncoder().encode(checksums)));
  for (const file of receipt.archiveFiles) {
    const bytes = entries.get(file.path)!;
    expect(bytes.length).toBe(file.bytes);
    expect(sha256(bytes)).toBe(file.sha256);
    expect(bytes).toEqual(new Uint8Array(await readFile(resolve(first.releaseRoot, '../module', file.path))));
  }
  const html = new TextDecoder().decode(standaloneHtml);
  expect(html).toContain('<html');
  expect(html).not.toMatch(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']https?:\/\//i);
  const sourceHtml = new Uint8Array(await readFile(new URL('../../../工具手册.html', import.meta.url)));
  expect(standaloneHtml).toEqual(sourceHtml);
  expect(receipt.offlineHandbook.bytes).toBe(standaloneHtml.length);
  expect(receipt.offlineHandbook.sourceSha256).toBe(sha256(sourceHtml));
  expect(receipt.offlineHandbook.deliverySha256).toBe(sha256(standaloneHtml));
  expect(new TextDecoder().decode(entries.get('README.zh-CN.md'))).not.toMatch(/\]\(\.\.\//);
  execFileSync(process.execPath, [resolve(import.meta.dir, '../release.ts')], { cwd: resolve(import.meta.dir, '../../..'), stdio: 'pipe' });
  const secondReceipt = JSON.parse(await readFile(resolve(first.releaseRoot, RECEIPT_NAME), 'utf8'));
  expect(secondReceipt.archive.sha256).toBe(first.archive.sha256);
  expect(new Uint8Array(await readFile(resolve(first.releaseRoot, ARCHIVE_NAME)))).toEqual(archive);
}, 30_000);

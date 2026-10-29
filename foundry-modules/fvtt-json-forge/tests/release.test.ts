import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { DOWNLOAD_URL, MANIFEST_URL, MODULE_ID, MODULE_VERSION, RELEASE_TAG } from '../build';
import {
  RELEASE_ARCHIVE_NAME,
  RELEASE_CHECKSUM_NAME,
  RELEASE_MANIFEST_NAME,
  buildForgeRelease,
  readStoredZip,
} from '../release';

describe('FVTT JSON Forge release package', () => {
  test('builds a deterministic installable archive and matching release assets', async () => {
    const first = await buildForgeRelease();
    const firstArchive = new Uint8Array(await readFile(first.archivePath));
    const firstChecksums = await readFile(first.checksumPath, 'utf8');
    const second = await buildForgeRelease();
    const secondArchive = new Uint8Array(await readFile(second.archivePath));
    expect(second.releaseTag).toBe(RELEASE_TAG);
    expect(second.archiveSha256).toBe(first.archiveSha256);
    expect(secondArchive).toEqual(firstArchive);
    expect(second.archiveEntries).toEqual([
      'guide/generic-status-source.md',
      'guide/generic-status.forge-encounter.zip',
      'guide/grandmother-sea-hag.forge-encounter.zip',
      'guide/guide.pdf',
      'guide/index.html',
      'guide/source-example.md',
      'module.json',
      'scripts/index.js',
      'styles/fvtt-json-forge.css',
      'templates/forge-actor.hbs',
      'templates/forge-connection.hbs',
      'templates/forge-encounter.hbs',
      'templates/forge-guide.hbs',
      'templates/forge-intake.hbs',
      'templates/forge-item.hbs',
      'templates/forge-workspace.hbs',
      'third-party-licenses.txt',
    ]);

    const archive = readStoredZip(secondArchive);
    expect(new TextDecoder().decode(archive.get('third-party-licenses.txt'))).toBe(await readFile(new URL('../src/third-party-licenses.txt',import.meta.url),'utf8'));
    const archivedManifest = JSON.parse(new TextDecoder().decode(archive.get('module.json'))) as Record<string, unknown>;
    const releaseManifest = JSON.parse(await readFile(second.manifestPath, 'utf8')) as Record<string, unknown>;
    expect(releaseManifest).toEqual(archivedManifest);
    expect(releaseManifest).toMatchObject({
      id: MODULE_ID,
      version: MODULE_VERSION,
      manifest: MANIFEST_URL,
      download: DOWNLOAD_URL,
      socket: false,
    });
    expect(firstChecksums).toBe(`${first.archiveSha256}  ${RELEASE_ARCHIVE_NAME}\n${first.manifestSha256}  ${RELEASE_MANIFEST_NAME}\n`);
    expect(await readFile(second.checksumPath, 'utf8')).toBe(firstChecksums);
    expect(second.checksumPath.endsWith(RELEASE_CHECKSUM_NAME)).toBe(true);
  }, 60_000);
});

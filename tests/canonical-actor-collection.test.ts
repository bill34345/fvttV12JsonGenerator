import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertRecordsToCanonicalSources, readRecordsJson } from '@fvtt-json-generator/crawl-goddessfantasy/canonical-sources';
import { convertCanonicalActorCollection } from '../src/core/application/workflows';

const fixtureDir = join(import.meta.dir, '..', 'src', 'core', 'crawl', '__tests__', 'fixtures');
const recordsPath = join(fixtureDir, 'goddessfantasy-records.json');
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('canonical Actor collection workflow', () => {
  test('converts canonical sources through the formal v14/core workflow', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-collection-'));
    roots.push(root);
    const sourceResult = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    });
    const result = await convertCanonicalActorCollection({
      sources: sourceResult.sources,
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('succeeded');
    expect(result.itemCount).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.items[0]?.status).toBe('accepted');
    expect(result.items[0]?.outputFile?.fileName).toBe('169745__yithian.json');
    expect(existsSync(result.items[0]!.outputFile!.path)).toBe(true);
    const actor = JSON.parse(readFileSync(result.items[0]!.outputFile!.path, 'utf-8')) as {
      system?: { details?: { type?: { value?: string } } };
    };
    expect(actor.system?.details?.type?.value).toBe('aberration');
    const manifest = JSON.parse(readFileSync(join(root, 'vault', 'output', 'canonical-sources.json'), 'utf-8')) as { sources: Array<{ sourceUrl: string }> };
    expect(manifest.sources[0]?.sourceUrl).toContain('goddessfantasy');
  });

  test('does not promote a source that is needs_review by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-review-'));
    roots.push(root);
    const sourceResult = convertRecordsToCanonicalSources({
      records: [{
        ...readRecordsJson(recordsPath)[0]!,
        rawHtmlPath: 'missing.html',
      }],
      recordsPath,
      contentType: 'monster',
    });
    const result = await convertCanonicalActorCollection({
      sources: sourceResult.sources,
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('needs_review');
    expect(result.succeeded).toBe(0);
    expect(result.items[0]?.status).toBe('needs_review');
    expect(result.items[0]?.outputFile).toBeUndefined();
  });

  test('preserves failed source status and excludes the entity from formal artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-failed-'));
    roots.push(root);
    const result = await convertCanonicalActorCollection({
      sources: [{
        sourceId: 'failed-source',
        sourceUrl: 'https://example.test/failed',
        fileName: 'failed-source.md',
        markdown: '---\nlayout: creature\ntype: npc\nname: "Failed"\n---\n',
        imageUrls: [],
        status: 'failed',
        warnings: [{ sourceId: 'failed-source', code: 'parse-failed', message: 'parse failed' }],
      }],
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('needs_review');
    expect(result.failed).toBe(1);
    expect(result.failures[0]?.sourceId).toBe('failed-source');
    expect(result.items[0]?.status).toBe('failed');
    expect(result.outputFiles).toEqual([]);
  });
});

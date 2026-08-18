import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(result.promotion.status).toBe('promoted');
    expect(result.items[0]?.status).toBe('accepted');
    expect(result.items[0]?.outputFile?.fileName).toBe('169745__yithian.json');
    expect(existsSync(result.items[0]!.outputFile!.path)).toBe(true);
    const actor = JSON.parse(readFileSync(result.items[0]!.outputFile!.path, 'utf-8')) as {
      name?: string;
      img?: string;
      system?: {
        details?: { type?: { value?: string } };
        attributes?: { ac?: { flat?: number }; hp?: { value?: number } };
        abilities?: { str?: { value?: number } };
      };
      items?: Array<{
        name?: string;
        system?: {
          activities?: Record<string, {
            type?: string;
            damage?: { parts?: Array<{ number?: number; denomination?: number; bonus?: string; types?: string[] }> };
          }>;
        };
      }>;
    };
    expect(actor.name).toBe('Yithian');
    expect(actor.system?.details?.type?.value).toBe('aberration');
    expect(actor.system?.attributes?.ac?.flat).toBe(14);
    expect(actor.system?.attributes?.hp?.value).toBe(180);
    expect(actor.system?.abilities?.str?.value).toBe(18);
    expect(actor.img).toContain('yithian.jpg');
    const multiattack = actor.items?.find((item) => item.name === '多重攻击 (Multiattack)');
    const activities = Object.values(multiattack?.system?.activities ?? {});
    expect(activities.some((activity) => activity.type === 'damage'
      && activity.damage?.parts?.some((part) => part.number === 4
        && part.denomination === 6
        && part.bonus === '4'
        && part.types?.includes('piercing')))).toBe(true);
    const provenance = result.outputFiles.find((file) => file.label === 'Canonical source provenance');
    expect(provenance?.fileName).toMatch(/^canonical-sources-[a-f0-9]{16}\.json$/);
    const manifest = JSON.parse(readFileSync(provenance!.path, 'utf-8')) as {
      inputKind: string;
      outputKind: string;
      sources: Array<{ sourceUrl: string; imageUrls: string[]; warnings: unknown[] }>;
    };
    expect(manifest.inputKind).toBe('standard-actor-markdown');
    expect(manifest.outputKind).toBe('foundry-actor-json');
    expect(manifest.sources[0]?.sourceUrl).toContain('goddessfantasy');
    expect(manifest.sources[0]?.imageUrls).toContain(actor.img);
    expect(manifest.sources[0]?.warnings).toEqual([]);
    expect(existsSync(join(root, 'vault', 'output_backup'))).toBe(false);
    expect(existsSync(join(root, 'vault', '.fvtt-sync-manifest.json'))).toBe(false);
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

  test('promotes every entry in a verified multi-Actor source as one batch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-multi-'));
    roots.push(root);
    const record = readRecordsJson(recordsPath)[0]!;
    const sourceResult = convertRecordsToCanonicalSources({
      records: [{
        ...record,
        topicId: '168320',
        title: '【怪物】丧尸Zombies',
        rawHtmlPath: 'goddessfantasy-topic-print-multi-statblock.html',
        imageUrls: [],
        posts: [{
          ...record.posts[0]!,
          title: '【怪物】丧尸Zombies',
          text: 'raw HTML contains the statblock source',
          imageUrls: [],
        }],
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

    expect(result.status).toBe('succeeded');
    expect(result.promotion.status).toBe('promoted');
    expect(result.itemCount).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.items.every((item) => item.outputFile && existsSync(item.outputFile.path))).toBe(true);
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

  test('stops before promotion when one source in a multi-entry batch has failed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-partial-'));
    roots.push(root);
    const sourceResult = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    });
    const validSource = sourceResult.sources[0]!;
    const failedSource = {
      ...validSource,
      sourceId: 'failed-second-source',
      fileName: 'failed-second-source.md',
      status: 'failed' as const,
      warnings: [{ sourceId: 'failed-second-source', code: 'parse-failed', message: 'parse failed' }],
    };

    const result = await convertCanonicalActorCollection({
      sources: [validSource, failedSource],
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('needs_review');
    expect(result.promotion.status).toBe('not-promoted');
    expect(existsSync(join(root, 'vault', 'input', validSource.fileName))).toBe(false);
    expect(existsSync(join(root, 'vault', 'output', validSource.fileName.replace(/\.md$/i, '.json')))).toBe(false);
  });

  test('stops on a warning by default and leaves formal folders untouched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-warning-'));
    roots.push(root);
    const source = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    }).sources[0]!;
    const warnedSource = {
      ...source,
      warnings: [{ sourceId: source.sourceId, code: 'source-warning', message: 'source needs a human check' }],
    };

    const result = await convertCanonicalActorCollection({
      sources: [warnedSource],
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('needs_review');
    expect(result.promotion.status).toBe('not-promoted');
    expect(existsSync(join(root, 'vault', 'input', source.fileName))).toBe(false);
    expect(existsSync(join(root, 'vault', 'output', source.fileName.replace(/\.md$/i, '.json')))).toBe(false);
  });

  test('rejects incomplete provenance before creating a formal input or output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-incomplete-'));
    roots.push(root);
    const source = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    }).sources[0]!;

    const result = await convertCanonicalActorCollection({
      sources: [{ ...source, sourceUrl: '' }],
      vaultPath: join(root, 'vault'),
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('failed');
    expect(result.promotion.status).toBe('not-promoted');
    expect(result.failures.some((failure) => failure.error.includes('sourceUrl'))).toBe(true);
    expect(existsSync(join(root, 'vault', 'input', source.fileName))).toBe(false);
    expect(existsSync(join(root, 'vault', 'output', source.fileName.replace(/\.md$/i, '.json')))).toBe(false);
  });

  test('never overwrites existing formal input or output files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canonical-actor-collision-'));
    roots.push(root);
    const source = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    }).sources[0]!;
    const vaultPath = join(root, 'vault');
    const inputPath = join(vaultPath, 'input', source.fileName);
    const outputPath = join(vaultPath, 'output', source.fileName.replace(/\.md$/i, '.json'));
    const existingInput = 'existing input must remain unchanged\n';
    const existingOutput = '{"existing":true}\n';
    mkdirSync(join(vaultPath, 'input'), { recursive: true });
    mkdirSync(join(vaultPath, 'output'), { recursive: true });
    writeFileSync(inputPath, existingInput, 'utf-8');
    writeFileSync(outputPath, existingOutput, 'utf-8');

    const result = await convertCanonicalActorCollection({
      sources: [source],
      vaultPath,
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(result.status).toBe('failed');
    expect(result.promotion.status).toBe('not-promoted');
    expect(readFileSync(inputPath, 'utf-8')).toBe(existingInput);
    expect(readFileSync(outputPath, 'utf-8')).toBe(existingOutput);
    expect(result.outputFiles).toEqual([]);
  });
});

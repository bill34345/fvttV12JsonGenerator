import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  convertRecordsToCanonicalSources,
  readRecordsJson,
} from '@fvtt-json-generator/crawl-goddessfantasy/canonical-sources';

const fixtureDir = join(import.meta.dir, '..', 'src', 'core', 'crawl', '__tests__', 'fixtures');
const recordsPath = join(fixtureDir, 'goddessfantasy-records.json');

describe('canonical Goddess Fantasy actor sources', () => {
  test('emits standard Actor Markdown directly and retains an optional audit view', () => {
    const result = convertRecordsToCanonicalSources({
      records: readRecordsJson(recordsPath),
      recordsPath,
      contentType: 'monster',
    });

    expect(result.sources).toHaveLength(1);
    const source = result.sources[0]!;
    expect(source.status).toBe('ok');
    expect(source.sourceId).toContain('169745');
    expect(source.sourceUrl).toContain('topic=169745');
    expect(source.fileName).toBe('169745__yithian.md');
    expect(source.metadata?.chineseName).toBe('伊斯人');
    expect(source.metadata?.englishName).toBe('Yithian');
    expect(source.imageUrls[0]).toContain('yithian.jpg');
    expect(source.markdown).toMatch(/^---\nlayout: creature\n/);
    expect(source.markdown).toContain('name: "Yithian"');
    expect(source.markdown).toContain('type: "Aberration"');
    expect(source.markdown).toContain('## Actions');
    expect(source.markdown).toContain('Multiattack');
    expect(source.auditMarkdown).toContain('# **伊斯人 (Yithian)**');
    expect(source.auditMarkdown).toContain('![伊斯人](');
  });

  test('keeps multi-statblock topic identity per canonical entity', () => {
    const records = readRecordsJson(recordsPath);
    const record = {
      ...records[0]!,
      topicId: '168320',
      title: '【怪物】丧尸Zombies',
      rawHtmlPath: 'goddessfantasy-topic-print-multi-statblock.html',
      imageUrls: [],
      posts: [{
        ...records[0]!.posts[0]!,
        title: '【怪物】丧尸Zombies',
        text: 'raw HTML contains the statblock source',
        imageUrls: [],
      }],
    };

    const result = convertRecordsToCanonicalSources({
      records: [record],
      recordsPath,
      contentType: 'monster',
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((source) => source.sourceId)).toEqual([
      'goddessfantasy:168320:swarm-of-zombie-limbs',
      'goddessfantasy:168320:zombie-clot',
    ]);
    expect(result.sources.map((source) => source.fileName)).toEqual([
      '168320__swarm-of-zombie-limbs.md',
      '168320__zombie-clot.md',
    ]);
    expect(result.sources.every((source) => source.markdown.includes('layout: creature'))).toBe(true);
  });

  test('disambiguates duplicate topic/entity filenames without losing source identity', () => {
    const record = readRecordsJson(recordsPath)[0]!;
    const result = convertRecordsToCanonicalSources({
      records: [record, { ...record, posts: record.posts.map((post) => ({ ...post })) }],
      recordsPath,
      contentType: 'monster',
    });

    expect(result.sources.map((source) => source.fileName)).toEqual([
      '169745__yithian.md',
      '169745__yithian-2.md',
    ]);
    expect(result.sources.map((source) => source.sourceId)).toEqual([
      'goddessfantasy:169745:yithian',
      'goddessfantasy:169745:yithian-2',
    ]);
  });

  test('marks fallback extraction as needs_review without producing accepted source', () => {
    const records = readRecordsJson(recordsPath);
    const result = convertRecordsToCanonicalSources({
      records: [{ ...records[0]!, rawHtmlPath: 'missing.html' }],
      recordsPath,
      contentType: 'monster',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.status).toBe('needs_review');
    expect(result.sources[0]?.warnings.some((warning) => warning.code === 'used-text-fallback')).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  test('returns a fail-closed conversion result when records.json cannot be read', () => {
    const result = convertRecordsToCanonicalSources({
      recordsPath: join(fixtureDir, 'missing-records.json'),
      contentType: 'monster',
    });

    expect(result.sources).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toContain('missing-records.json');
  });
});

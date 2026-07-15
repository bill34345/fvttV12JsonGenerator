import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as cheerio from 'cheerio';
import type { CrawledTopicRecord } from '../types';
import { runGoddessFantasyBoardCrawl } from '../runGoddessFantasyBoardCrawl';
import {
  buildPrintPageUrl,
  classifyTopicTitle,
  extractBoardTopics,
  extractNextBoardUrls,
  parsePrintPage,
} from '../sites/goddessfantasy';

const fixtureDir = join(import.meta.dir, 'fixtures');

function loadFixture(name: string): cheerio.CheerioAPI {
  return cheerio.load(readFileSync(join(fixtureDir, name), 'utf-8'));
}

describe('goddessfantasy SMF parser', () => {
  test('extracts canonical topic URLs and ignores non-topic actions', () => {
    const $ = loadFixture('goddessfantasy-board-2318.html');

    const topics = extractBoardTopics(
      $,
      'https://www.goddessfantasy.net/bbs/index.php?board=2318.0',
    );

    expect(topics).toEqual([
      {
        boardId: '2318',
        topicId: '169462',
        title: '《鸦阁魔域：魔障深藏》目录贴',
        url: 'https://www.goddessfantasy.net/bbs/index.php?topic=169462.0',
        classification: {
          contentType: 'unknown',
          classificationSource: 'none',
        },
      },
      {
        boardId: '2318',
        topicId: '169745',
        title: '【怪物】伊斯人Yithian',
        url: 'https://www.goddessfantasy.net/bbs/index.php?topic=169745.0',
        classification: {
          contentType: 'monster',
          classificationSource: 'title-prefix',
          matchedPrefix: '【怪物】',
        },
      },
      {
        boardId: '2318',
        topicId: '168685',
        title: '【怪物】惊怖迷雾 Mist Horror',
        url: 'https://www.goddessfantasy.net/bbs/index.php?topic=168685.0',
        classification: {
          contentType: 'monster',
          classificationSource: 'title-prefix',
          matchedPrefix: '【怪物】',
        },
      },
    ]);
  });

  test('classifies monster topics from the title prefix', () => {
    expect(classifyTopicTitle('【怪物】伊斯人Yithian')).toEqual({
      contentType: 'monster',
      classificationSource: 'title-prefix',
      matchedPrefix: '【怪物】',
    });
    expect(classifyTopicTitle('《鸦阁魔域：魔障深藏》目录贴')).toEqual({
      contentType: 'unknown',
      classificationSource: 'none',
    });
  });

  test('deduplicates board pagination links', () => {
    const $ = loadFixture('goddessfantasy-board-2318.html');

    expect(extractNextBoardUrls($, 'https://www.goddessfantasy.net/bbs/index.php?board=2318.0')).toEqual([
      'https://www.goddessfantasy.net/bbs/index.php?board=2318.25',
      'https://www.goddessfantasy.net/bbs/index.php?board=2318.50',
    ]);
  });

  test('builds print page URLs from any topic offset', () => {
    expect(buildPrintPageUrl('https://www.goddessfantasy.net/bbs/index.php?topic=169745.10')).toBe(
      'https://www.goddessfantasy.net/bbs/index.php?action=printpage;topic=169745.0',
    );
  });

  test('parses print page posts with Chinese text preserved', () => {
    const $ = loadFixture('goddessfantasy-topic-print.html');

    const posts = parsePrintPage($);

    expect(posts).toEqual([
      {
        index: 0,
        title: '【怪物】伊斯人Yithian',
        author: 'Amethyst Dragonlord',
        postedAt: '2026-06-11, 周四 21:49:05',
        text: '伊斯人Yithian 大型异怪，混乱中立 AC 14 HP 180（19d10+76）',
        imageUrls: [
          'https://media.dndbeyond.com/compendium-images/rthw/ogMxaVTj4GqgnUqr/22-042.yithian.jpg',
        ],
      },
      {
        index: 1,
        title: '回复： 【怪物】伊斯人Yithian',
        author: '3034356449',
        postedAt: '2026-06-11, 周四 21:50:08',
        text: '克苏鲁：将我的伟大，弃置于此',
        imageUrls: [],
      },
    ]);
  });

  test('returns no topics for an empty board page', () => {
    const $ = cheerio.load('<html><body class="action_messageindex board_2318"></body></html>');

    expect(extractBoardTopics($, 'https://www.goddessfantasy.net/bbs/index.php?board=2318.0')).toEqual([]);
  });
});

describe('goddessfantasy board crawl modes', () => {
  test('incremental mode only crawls new topics and keeps old records', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-incremental-'));
    const requestedPrintTopics: string[] = [];
    const server = createFixtureServer(['100', '101', '102'], requestedPrintTopics);

    try {
      writeRecords(outDir, [recordFixture('100', 'Old One'), recordFixture('101', 'Old Two')]);
      const result = await runGoddessFantasyBoardCrawl({
        boardUrl: boardUrlFor(server.port!),
        cookieHeader: 'PHPSESSID=test',
        skipAuthProbe: true,
        outDir,
        maxBoardPages: 1,
        contentType: 'monster',
        crawlMode: 'incremental',
        requestDelayMs: 0,
      });

      const records = JSON.parse(readFileSync(join(outDir, 'records.json'), 'utf-8')) as CrawledTopicRecord[];
      expect(result.mode).toBe('incremental');
      expect(result.topicsReused).toBe(2);
      expect(result.topicsCrawled).toBe(1);
      expect(result.recordsBefore).toBe(2);
      expect(result.recordsAfter).toBe(3);
      expect(result.newTopicIds).toEqual(['102']);
      expect(requestedPrintTopics).toEqual(['102']);
      expect(records.map((record) => record.topicId)).toEqual(['100', '101', '102']);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('full mode rebuilds records from the current scan range', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-full-'));
    const requestedPrintTopics: string[] = [];
    const server = createFixtureServer(['100', '101', '102'], requestedPrintTopics);

    try {
      writeRecords(outDir, [recordFixture('100', 'Old One')]);
      const result = await runGoddessFantasyBoardCrawl({
        boardUrl: boardUrlFor(server.port!),
        cookieHeader: 'PHPSESSID=test',
        skipAuthProbe: true,
        outDir,
        maxBoardPages: 1,
        contentType: 'monster',
        crawlMode: 'full',
        requestDelayMs: 0,
      });

      const records = JSON.parse(readFileSync(join(outDir, 'records.json'), 'utf-8')) as CrawledTopicRecord[];
      expect(result.mode).toBe('full');
      expect(result.topicsReused).toBe(0);
      expect(result.topicsCrawled).toBe(3);
      expect(result.recordsBefore).toBe(0);
      expect(result.recordsAfter).toBe(3);
      expect(requestedPrintTopics.sort()).toEqual(['100', '101', '102']);
      expect(records.map((record) => record.topicId)).toEqual(['100', '101', '102']);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('incremental dry-run scans reuse stats without rewriting records', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-dry-run-'));
    const requestedPrintTopics: string[] = [];
    const server = createFixtureServer(['100', '101', '102'], requestedPrintTopics);

    try {
      writeRecords(outDir, [recordFixture('100', 'Old One'), recordFixture('101', 'Old Two')]);
      const before = readFileSync(join(outDir, 'records.json'), 'utf-8');
      const result = await runGoddessFantasyBoardCrawl({
        boardUrl: boardUrlFor(server.port!),
        cookieHeader: 'PHPSESSID=test',
        skipAuthProbe: true,
        outDir,
        maxBoardPages: 1,
        contentType: 'monster',
        crawlMode: 'incremental',
        dryRun: true,
        requestDelayMs: 0,
      });
      const after = readFileSync(join(outDir, 'records.json'), 'utf-8');

      expect(result.dryRun).toBe(true);
      expect(result.topicsReused).toBe(2);
      expect(result.topicsCrawled).toBe(0);
      expect(result.recordsAfter).toBe(3);
      expect(result.newTopicIds).toEqual(['102']);
      expect(requestedPrintTopics).toEqual([]);
      expect(after).toBe(before);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('incremental mode keeps old records when a new topic fails', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-failure-'));
    const requestedPrintTopics: string[] = [];
    const server = createFixtureServer(['100', '102'], requestedPrintTopics, new Set(['102']));

    try {
      writeRecords(outDir, [recordFixture('100', 'Old One')]);
      const result = await runGoddessFantasyBoardCrawl({
        boardUrl: boardUrlFor(server.port!),
        cookieHeader: 'PHPSESSID=test',
        skipAuthProbe: true,
        outDir,
        maxBoardPages: 1,
        contentType: 'monster',
        crawlMode: 'incremental',
        requestDelayMs: 0,
      });

      const records = JSON.parse(readFileSync(join(outDir, 'records.json'), 'utf-8')) as CrawledTopicRecord[];
      const failures = readFileSync(join(outDir, 'failures.jsonl'), 'utf-8').trim().split('\n');
      expect(result.failures).toBe(1);
      expect(result.recordsAfter).toBe(1);
      expect(records.map((record) => record.topicId)).toEqual(['100']);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain('102');
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

function createFixtureServer(
  topicIds: string[],
  requestedPrintTopics: string[],
  failingTopicIds = new Set<string>(),
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.search.includes('action=printpage')) {
        const topicId = url.search.match(/topic=(\d+)/)?.[1] ?? 'unknown';
        requestedPrintTopics.push(topicId);
        if (failingTopicIds.has(topicId)) {
          return new Response('<html><body id="posts"></body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return htmlResponse(printPageHtml(topicId));
      }
      return htmlResponse(boardHtml(topicIds, url.origin));
    },
  });
}

function boardHtml(topicIds: string[], origin: string): string {
  return [
    '<html><body>',
    ...topicIds.map((topicId) => [
      '<div class="windowbg">',
      '<span class="subject">',
      `<a href="${origin}/bbs/index.php?topic=${topicId}.0">【怪物】Topic ${topicId}</a>`,
      '</span>',
      '</div>',
    ].join('')),
    '</body></html>',
  ].join('');
}

function printPageHtml(topicId: string): string {
  return [
    '<html><body><div id="posts">',
    `<div class="postheader">标题: 【怪物】Topic ${topicId} 作者: Tester 于 2026-06-20</div>`,
    `<div class="postbody">Topic ${topicId} Medium aberration AC 12 HP 22 <img src="https://example.test/${topicId}.jpg"></div>`,
    '</div></body></html>',
  ].join('');
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function boardUrlFor(port: number): string {
  return `http://127.0.0.1:${port}/bbs/index.php?board=2318.0`;
}

function writeRecords(outDir: string, records: CrawledTopicRecord[]): void {
  writeFileSync(join(outDir, 'records.json'), `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
}

function recordFixture(topicId: string, title: string): CrawledTopicRecord {
  return {
    site: 'goddessfantasy',
    boardId: '2318',
    topicId,
    title,
    url: `https://example.test/bbs/index.php?topic=${topicId}.0`,
    classification: {
      contentType: 'monster',
      classificationSource: 'title-prefix',
      matchedPrefix: '【怪物】',
    },
    printUrl: `https://example.test/bbs/index.php?action=printpage;topic=${topicId}.0`,
    rawHtmlPath: `html/topic-${topicId}.print.html`,
    crawledAt: '2026-06-20T00:00:00.000Z',
    imageUrls: [],
    posts: [
      {
        index: 0,
        title,
        author: 'Tester',
        postedAt: '2026-06-20',
        text: `${title} AC 12 HP 22`,
        imageUrls: [],
      },
    ],
  };
}

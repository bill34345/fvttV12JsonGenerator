import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
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

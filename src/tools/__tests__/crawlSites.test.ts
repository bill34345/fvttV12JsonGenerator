import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('crawl-sites CLI', () => {
  test('goddessfantasy-board --mode incremental reports reuse and record totals', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-cli-incremental-'));
    const requestedPrintTopics: string[] = [];
    const server = createCliCrawlFixtureServer(['100', '101'], requestedPrintTopics);

    try {
      writeCliRecords(outDir, [cliRecordFixture('100')]);
      const result = await runCli([
        'goddessfantasy-board',
        '--board-url',
        cliBoardUrl(server.port),
        '--cookie-header',
        'PHPSESSID=test',
        '--skip-auth-probe',
        '--out-dir',
        outDir,
        '--max-board-pages',
        '1',
        '--content-type',
        'monster',
        '--mode',
        'incremental',
        '--request-delay-ms',
        '0',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Mode: incremental');
      expect(result.stdout).toContain('Reused topics: 1');
      expect(result.stdout).toContain('Records before: 1');
      expect(result.stdout).toContain('Records after: 2');
      expect(requestedPrintTopics).toEqual(['101']);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  test('goddessfantasy-board --force acts as full mode', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-cli-full-'));
    const requestedPrintTopics: string[] = [];
    const server = createCliCrawlFixtureServer(['100'], requestedPrintTopics);

    try {
      writeCliRecords(outDir, [cliRecordFixture('100')]);
      const result = await runCli([
        'goddessfantasy-board',
        '--board-url',
        cliBoardUrl(server.port),
        '--cookie-header',
        'PHPSESSID=test',
        '--skip-auth-probe',
        '--out-dir',
        outDir,
        '--max-board-pages',
        '1',
        '--content-type',
        'monster',
        '--force',
        '--request-delay-ms',
        '0',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Mode: full');
      expect(result.stdout).toContain('Reused topics: 0');
      expect(result.stdout).toContain('Records before: 0');
      expect(result.stdout).toContain('Records after: 1');
      expect(requestedPrintTopics).toEqual(['100']);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  test('goddessfantasy-pipeline --dry-run reports crawl stats and skips downstream stages', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gf-cli-pipeline-dry-run-'));
    const requestedPrintTopics: string[] = [];
    const server = createCliCrawlFixtureServer(['100', '101'], requestedPrintTopics);

    try {
      const result = await runCli([
        'goddessfantasy-pipeline',
        '--board-url',
        cliBoardUrl(server.port),
        '--cookie-header',
        'PHPSESSID=test',
        '--skip-auth-probe',
        '--out-dir',
        outDir,
        '--max-board-pages',
        '1',
        '--content-type',
        'monster',
        '--mode',
        'incremental',
        '--request-delay-ms',
        '0',
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stopped after: crawl-dry-run');
      expect(result.stdout).toContain('Dry run: yes');
      expect(result.stdout).toContain('New topic IDs: 100, 101');
      expect(result.stdout).not.toContain('Plaintext records read');
      expect(result.stdout).not.toContain('JSON dir:');
      expect(requestedPrintTopics).toEqual([]);
    } finally {
      server.stop(true);
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 20_000);
});

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', 'src/tools/crawlSites.ts', ...args], {
    cwd: resolve(process.cwd()),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function createCliCrawlFixtureServer(
  topicIds: string[],
  requestedPrintTopics: string[],
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.search.includes('action=printpage')) {
        const topicId = url.search.match(/topic=(\d+)/)?.[1] ?? 'unknown';
        requestedPrintTopics.push(topicId);
        return cliHtmlResponse([
          '<html><body><div id="posts">',
          `<div class="postheader">标题: 【怪物】Topic ${topicId} 作者: Tester 于 2026-06-20</div>`,
          `<div class="postbody">Topic ${topicId} Medium aberration AC 12 HP 22</div>`,
          '</div></body></html>',
        ].join(''));
      }
      return cliHtmlResponse([
        '<html><body>',
        ...topicIds.map((topicId) => [
          '<div class="windowbg"><span class="subject">',
          `<a href="${url.origin}/bbs/index.php?topic=${topicId}.0">【怪物】Topic ${topicId}</a>`,
          '</span></div>',
        ].join('')),
        '</body></html>',
      ].join(''));
    },
  });
}

function cliHtmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function cliBoardUrl(port: number): string {
  return `http://127.0.0.1:${port}/bbs/index.php?board=2318.0`;
}

function writeCliRecords(outDir: string, records: Array<Record<string, unknown>>): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'records.json'), `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
}

function cliRecordFixture(topicId: string): Record<string, unknown> {
  return {
    site: 'goddessfantasy',
    boardId: '2318',
    topicId,
    title: `Topic ${topicId}`,
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
        title: `Topic ${topicId}`,
        author: 'Tester',
        postedAt: '2026-06-20',
        text: `Topic ${topicId} AC 12 HP 22`,
        imageUrls: [],
      },
    ],
  };
}

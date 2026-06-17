import {
  appendFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { CheerioCrawler, Configuration } from 'crawlee';
import type {
  BoardTopic,
  CrawledTopicRecord,
  GoddessFantasyCrawlOptions,
  GoddessFantasyCrawlResult,
} from './types';
import {
  buildPrintPageUrl,
  extractBoardTopics,
  extractNextBoardUrls,
  getBoardIdFromUrl,
  parsePrintPage,
} from './sites/goddessfantasy';
import {
  defaultRequestHeaders,
  loadCookieHeaderFile,
  loginGoddessFantasy,
  probeGoddessFantasyAuth,
} from './sites/goddessfantasyAuth';

type CrawlRequestUserData =
  | { kind: 'board' }
  | { kind: 'topic'; topic: BoardTopic };

interface CrawlFailure {
  url: string;
  stage: string;
  error: string;
  failedAt: string;
}

const DEFAULT_COOKIE_ENV = 'GODDESSFANTASY_COOKIE';

export async function runGoddessFantasyBoardCrawl(
  options: GoddessFantasyCrawlOptions,
): Promise<GoddessFantasyCrawlResult> {
  const boardId = getBoardIdFromUrl(options.boardUrl);
  const outDir = resolvePath(options.outDir ?? defaultOutDir(boardId));
  const htmlDir = join(outDir, 'html');
  const storageDir = join(outDir, '.crawlee-storage');
  const topicsPath = join(outDir, 'topics.jsonl');
  const recordsPath = join(outDir, 'records.json');
  const failuresPath = join(outDir, 'failures.jsonl');
  const manifestPath = join(outDir, 'manifest.json');
  const startedAt = new Date().toISOString();
  const cookieHeader = await loadCookieHeader(options);
  const maxBoardPages = options.maxBoardPages ?? 20;
  const maxTopics = options.maxTopics;
  const contentType = options.contentType ?? 'all';
  const dryRun = Boolean(options.dryRun);
  const headers = buildRequestHeaders(cookieHeader);

  if (!options.skipAuthProbe) {
    const probe = await probeGoddessFantasyAuth(canonicalUrl(options.boardUrl), cookieHeader);
    if (!probe.ok) {
      throw new Error(
        `GoddessFantasy auth probe failed: ${probe.reason}; status=${probe.status}; title=${probe.title}; bodyClass=${probe.bodyClass}; topicCount=${probe.topicCount}.`,
      );
    }
  }

  ensureDir(htmlDir);
  ensureDir(storageDir);
  writeFileSync(topicsPath, '', 'utf-8');
  writeFileSync(failuresPath, '', 'utf-8');

  const discoveredTopics = new Map<string, BoardTopic>();
  const enqueuedTopics = new Set<string>();
  const matchedTopics = new Set<string>();
  const crawledRecords: CrawledTopicRecord[] = [];
  const seenBoardUrls = new Set<string>([canonicalUrl(options.boardUrl)]);
  let boardPagesEnqueued = 1;
  let topicsCrawled = 0;
  let topicsSkipped = 0;
  let failureCount = 0;

  const appendFailure = (failure: Omit<CrawlFailure, 'failedAt'>) => {
    failureCount++;
    appendJsonLine(failuresPath, {
      ...failure,
      failedAt: new Date().toISOString(),
    });
  };

  const config = new Configuration({
    storageClientOptions: {
      localDataDirectory: storageDir,
    },
  });

  const crawler = new CheerioCrawler(
    {
      maxConcurrency: options.concurrency ?? 2,
      sameDomainDelaySecs: (options.requestDelayMs ?? 800) / 1000,
      maxRequestRetries: 2,
      useSessionPool: false,
      persistCookiesPerSession: false,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 30,
      preNavigationHooks: [
        (_context, gotOptions) => {
          gotOptions.http2 = false;
          gotOptions.headers = {
            ...gotOptions.headers,
            ...headers,
          };
        },
      ],
      async requestHandler({ request, $, body, crawler }) {
        const userData = request.userData as CrawlRequestUserData;

        if (userData.kind === 'board') {
          const topics = extractBoardTopics($, request.loadedUrl ?? request.url);
          let addedTopics = 0;

          for (const topic of topics) {
            if (!discoveredTopics.has(topic.topicId)) {
              discoveredTopics.set(topic.topicId, topic);
            }
            if (!topicMatchesFilter(topic, contentType)) continue;

            matchedTopics.add(topic.topicId);
            if (maxTopics !== undefined && enqueuedTopics.size >= maxTopics) continue;
            if (enqueuedTopics.has(topic.topicId)) continue;

            enqueuedTopics.add(topic.topicId);
            addedTopics++;

            if (dryRun) continue;

            const htmlPath = topicHtmlPath(htmlDir, topic.topicId);
            if (!options.force && existsSync(htmlPath)) {
              topicsSkipped++;
              continue;
            }

            await crawler.addRequests([
              {
                url: buildPrintPageUrl(topic.url),
                headers,
                userData: { kind: 'topic', topic } satisfies CrawlRequestUserData,
              },
            ]);
          }

          if (maxTopics === undefined || enqueuedTopics.size < maxTopics) {
            for (const boardUrl of extractNextBoardUrls($, request.loadedUrl ?? request.url)) {
              const normalized = canonicalUrl(boardUrl);
              if (seenBoardUrls.has(normalized)) continue;
              if (boardPagesEnqueued >= maxBoardPages) continue;
              seenBoardUrls.add(normalized);
              boardPagesEnqueued++;
              await crawler.addRequests([
                {
                  url: normalized,
                  headers,
                  userData: { kind: 'board' } satisfies CrawlRequestUserData,
                },
              ]);
            }
          }

          if (addedTopics === 0 && topics.length === 0) {
            return;
          }
          return;
        }

        const html = typeof body === 'string' ? body : body.toString('utf-8');
        const htmlPath = topicHtmlPath(htmlDir, userData.topic.topicId);
        const posts = parsePrintPage($);

        if (posts.length === 0) {
          throw new Error(`No posts found in print page for topic ${userData.topic.topicId}`);
        }

        writeFileSync(htmlPath, html, 'utf-8');

        const record: CrawledTopicRecord = {
          site: 'goddessfantasy',
          ...userData.topic,
          printUrl: request.loadedUrl ?? request.url,
          rawHtmlPath: normalizeRelPath(relative(outDir, htmlPath)),
          crawledAt: new Date().toISOString(),
          imageUrls: unique(posts.flatMap((post) => post.imageUrls)),
          posts,
        };
        crawledRecords.push(record);
        appendJsonLine(topicsPath, record);
        topicsCrawled++;
      },
      async failedRequestHandler({ request }, error) {
        const userData = request.userData as Partial<CrawlRequestUserData>;
        appendFailure({
          url: request.url,
          stage: userData.kind ?? 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
    config,
  );

  await crawler.run([
    {
      url: canonicalUrl(options.boardUrl),
      headers,
      userData: { kind: 'board' } satisfies CrawlRequestUserData,
    },
  ]);

  writeFileSync(recordsPath, `${JSON.stringify(crawledRecords, null, 2)}\n`, 'utf-8');

  const result: GoddessFantasyCrawlResult = {
    boardId,
    outDir,
    topicsDiscovered: discoveredTopics.size,
    topicsMatched: matchedTopics.size,
    topicsCrawled,
    topicsSkipped,
    failures: failureCount,
    dryRun,
  };

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        site: 'goddessfantasy',
        boardId,
        boardUrl: canonicalUrl(options.boardUrl),
        startedAt,
        finishedAt: new Date().toISOString(),
        options: {
          outDir,
          maxBoardPages,
          maxTopics,
          contentType,
          concurrency: options.concurrency ?? 2,
          requestDelayMs: options.requestDelayMs ?? 800,
          force: Boolean(options.force),
          dryRun,
          authProbe: options.skipAuthProbe ? 'skipped' : 'passed',
          cookieHeaderSource: describeCookieHeaderSource(options),
        },
        result,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return result;
}

async function loadCookieHeader(options: GoddessFantasyCrawlOptions): Promise<string> {
  if (options.cookieHeader?.trim()) return options.cookieHeader.trim();

  if (options.cookieHeaderFile) {
    return loadCookieHeaderFile(options.cookieHeaderFile);
  }

  if (options.loginUsername || options.loginPassword || options.loginUsernameEnv || options.loginPasswordEnv) {
    const result = await loginGoddessFantasy({
      boardUrl: options.boardUrl,
      username: options.loginUsername,
      password: options.loginPassword,
      usernameEnv: options.loginUsernameEnv,
      passwordEnv: options.loginPasswordEnv,
      saveCookieHeaderFile: options.saveCookieHeaderFile,
    });
    return result.cookieHeader;
  }

  const envName = options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV;
  const value = process.env[envName]?.trim();
  if (value) return value;

  throw new Error(
    `Cookie header is required. Provide --cookie-header, --cookie-header-file, login options, or set ${envName}.`,
  );
}

function describeCookieHeaderSource(options: GoddessFantasyCrawlOptions): string {
  if (options.cookieHeader) return 'inline';
  if (options.cookieHeaderFile) return 'file';
  if (options.loginUsername || options.loginPassword || options.loginUsernameEnv || options.loginPasswordEnv) {
    return options.saveCookieHeaderFile ? 'login:saved-file' : 'login';
  }
  return `env:${options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV}`;
}

function buildRequestHeaders(cookieHeader: string): Record<string, string> {
  return defaultRequestHeaders(cookieHeader);
}

function defaultOutDir(boardId: string): string {
  return join('obsidian', 'dnd数据转fvttjson', 'crawls', 'goddessfantasy', `board-${boardId}`);
}

function topicHtmlPath(htmlDir: string, topicId: string): string {
  return join(htmlDir, `topic-${topicId}.print.html`);
}

function appendJsonLine(path: string, value: unknown): void {
  ensureDir(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf-8');
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function topicMatchesFilter(topic: BoardTopic, contentType: string): boolean {
  return contentType === 'all' || topic.classification.contentType === contentType;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function canonicalUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

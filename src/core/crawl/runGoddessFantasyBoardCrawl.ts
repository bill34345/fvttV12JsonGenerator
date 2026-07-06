import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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
  const mode = options.force ? 'full' : (options.crawlMode ?? 'incremental');
  const existingRecords = mode === 'incremental' ? loadExistingRecords(recordsPath) : [];
  const existingRecordsByTopic = new Map(existingRecords.map((record) => [record.topicId, record]));
  const headers = buildRequestHeaders(cookieHeader);

  if (!options.skipAuthProbe) {
    const probe = await probeGoddessFantasyAuth(canonicalUrl(options.boardUrl), cookieHeader);
    if (!probe.ok) {
      throw new Error(
        `GoddessFantasy auth probe failed: ${probe.reason}; status=${probe.status}; title=${probe.title}; bodyClass=${probe.bodyClass}; topicCount=${probe.topicCount}.`,
      );
    }
  }

  if (!dryRun) {
    ensureDir(htmlDir);
    ensureDir(storageDir);
    writeFileSync(topicsPath, '', 'utf-8');
    writeFileSync(failuresPath, '', 'utf-8');
  }

  const discoveredTopics = new Map<string, BoardTopic>();
  const enqueuedTopics = new Set<string>();
  const matchedTopics = new Set<string>();
  const crawledRecords: CrawledTopicRecord[] = [];
  const dryRunNewTopicIds = new Set<string>();
  const seenBoardUrls = new Set<string>([canonicalUrl(options.boardUrl)]);
  let boardPagesEnqueued = 1;
  let topicsCrawled = 0;
  let topicsSkipped = 0;
  let topicsReused = 0;
  let failureCount = 0;

  const appendFailure = (failure: Omit<CrawlFailure, 'failedAt'>) => {
    failureCount++;
    if (dryRun) return;
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

            if (mode === 'incremental' && existingRecordsByTopic.has(topic.topicId)) {
              topicsReused++;
              topicsSkipped++;
              continue;
            }

            if (dryRun) {
              dryRunNewTopicIds.add(topic.topicId);
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

  const finalRecords = mode === 'incremental'
    ? mergeRecords(existingRecords, crawledRecords)
    : crawledRecords;
  const newTopicIds = dryRun
    ? [...dryRunNewTopicIds].sort()
    : crawledRecords.map((record) => record.topicId).sort();
  const recordsAfter = dryRun
    ? existingRecords.length + dryRunNewTopicIds.size
    : finalRecords.length;

  const result: GoddessFantasyCrawlResult = {
    boardId,
    outDir,
    mode,
    topicsDiscovered: discoveredTopics.size,
    topicsMatched: matchedTopics.size,
    topicsCrawled,
    topicsSkipped,
    topicsReused,
    recordsBefore: existingRecords.length,
    recordsAfter,
    newTopicIds,
    failures: failureCount,
    dryRun,
  };

  if (!dryRun) {
    writeRecordsJsonl(topicsPath, finalRecords);
    writeFileSync(recordsPath, `${JSON.stringify(finalRecords, null, 2)}\n`, 'utf-8');
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
            mode,
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
  }

  return result;
}

async function loadCookieHeader(options: GoddessFantasyCrawlOptions): Promise<string> {
  if (options.cookieHeader?.trim()) return options.cookieHeader.trim();

  if (options.cookieHeaderFile) {
    return loadCookieHeaderFile(options.cookieHeaderFile);
  }

  const envName = options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV;
  const value = process.env[envName]?.trim();
  if (value) return value;

  const hasLoginInput = Boolean(
    options.loginUsername?.trim()
      || options.loginPassword?.trim()
      || envValue(options.loginUsernameEnv)
      || envValue(options.loginPasswordEnv),
  );
  if (hasLoginInput) {
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

  throw new Error(
    `Cookie header is required. Provide --cookie-header, --cookie-header-file, login options, or set ${envName}.`,
  );
}

function describeCookieHeaderSource(options: GoddessFantasyCrawlOptions): string {
  if (options.cookieHeader) return 'inline';
  if (options.cookieHeaderFile) return 'file';
  if (envValue(options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV)) {
    return `env:${options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV}`;
  }
  if (
    options.loginUsername
      || options.loginPassword
      || envValue(options.loginUsernameEnv)
      || envValue(options.loginPasswordEnv)
  ) {
    return options.saveCookieHeaderFile ? 'login:saved-file' : 'login';
  }
  return `env:${options.cookieHeaderEnv ?? DEFAULT_COOKIE_ENV}`;
}

function envValue(name: string | undefined): string | undefined {
  return name ? process.env[name]?.trim() || undefined : undefined;
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

function loadExistingRecords(path: string): CrawledTopicRecord[] {
  if (!existsSync(path)) return [];

  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Existing records.json must contain an array: ${path}`);
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Existing records.json entry ${index} must be an object: ${path}`);
    }
    const record = entry as Partial<CrawledTopicRecord>;
    if (record.site !== 'goddessfantasy' || typeof record.topicId !== 'string' || !record.topicId) {
      throw new Error(`Existing records.json entry ${index} is missing site/topicId: ${path}`);
    }
    return record as CrawledTopicRecord;
  });
}

function mergeRecords(existingRecords: CrawledTopicRecord[], newRecords: CrawledTopicRecord[]): CrawledTopicRecord[] {
  const merged = [...existingRecords];
  const indexByTopic = new Map(merged.map((record, index) => [record.topicId, index]));
  const orderedNewRecords = [...newRecords]
    .sort((a, b) => Number.parseInt(a.topicId, 10) - Number.parseInt(b.topicId, 10));

  for (const record of orderedNewRecords) {
    const existingIndex = indexByTopic.get(record.topicId);
    if (existingIndex !== undefined) {
      merged[existingIndex] = record;
      continue;
    }
    indexByTopic.set(record.topicId, merged.length);
    merged.push(record);
  }
  return merged;
}

function writeRecordsJsonl(path: string, records: CrawledTopicRecord[]): void {
  writeFileSync(path, '', 'utf-8');
  for (const record of records) {
    appendJsonLine(path, record);
  }
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

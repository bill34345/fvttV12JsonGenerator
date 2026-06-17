import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { CrawledTopicRecord, CrawlContentTypeFilter } from '../types';
import {
  renderGoddessFantasyMonsterToPlaintext,
  type PlaintextRenderWarning,
} from './goddessfantasyPlaintext';

export interface RecordsToPlaintextOptions {
  recordsPath: string;
  outFile?: string;
  contentType?: CrawlContentTypeFilter;
  site?: string;
  force?: boolean;
  dryRun?: boolean;
  failOnWarning?: boolean;
}

export interface RecordsToPlaintextFailure {
  topicId?: string;
  title?: string;
  error: string;
}

export interface RecordsToPlaintextResult {
  recordsPath: string;
  outFile: string;
  recordsRead: number;
  recordsMatched: number;
  blocksEmitted: number;
  skipped: number;
  warnings: PlaintextRenderWarning[];
  failures: RecordsToPlaintextFailure[];
  dryRun: boolean;
  markdown: string;
}

export function readRecordsJson(path: string): CrawledTopicRecord[] {
  const resolved = resolvePath(path);
  const parsed = JSON.parse(readFileSync(resolved, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`records.json must contain an array: ${path}`);
  }

  return parsed.map((record, index) => {
    if (!record || typeof record !== 'object') {
      throw new Error(`records.json entry ${index} must be an object`);
    }
    const candidate = record as Partial<CrawledTopicRecord>;
    if (!candidate.site || !candidate.topicId || !candidate.title || !Array.isArray(candidate.posts)) {
      throw new Error(`records.json entry ${index} is missing required crawl fields`);
    }
    return candidate as CrawledTopicRecord;
  });
}

export function convertRecordsToPlaintextCollection(
  records: CrawledTopicRecord[],
  options: {
    recordsPath: string;
    outFile?: string;
    contentType?: CrawlContentTypeFilter;
    site?: string;
  },
): RecordsToPlaintextResult {
  const recordsPath = resolvePath(options.recordsPath);
  const recordsDir = dirname(recordsPath);
  const outFile = resolvePath(options.outFile ?? defaultOutFile(recordsPath));
  const contentType = options.contentType ?? 'monster';
  const requestedSite = options.site;
  const blocks: string[] = [];
  const warnings: PlaintextRenderWarning[] = [];
  const failures: RecordsToPlaintextFailure[] = [];
  let recordsMatched = 0;
  let skipped = 0;

  const sorted = [...records].sort((a, b) => {
    const left = Number.parseInt(a.topicId, 10);
    const right = Number.parseInt(b.topicId, 10);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return a.topicId.localeCompare(b.topicId);
  });

  for (const record of sorted) {
    if (requestedSite && record.site !== requestedSite) {
      skipped++;
      continue;
    }

    if (!matchesContentType(record, contentType)) {
      skipped++;
      continue;
    }

    recordsMatched++;

    try {
      if (record.site !== 'goddessfantasy') {
        throw new Error(`Unsupported site: ${record.site}`);
      }

      if (record.classification.contentType !== 'monster') {
        throw new Error(`Unsupported content type for v1 renderer: ${record.classification.contentType}`);
      }

      const rendered = renderGoddessFantasyMonsterToPlaintext(record, { recordsDir });
      blocks.push(rendered.markdown);
      warnings.push(...rendered.warnings);
    } catch (error) {
      failures.push({
        topicId: record.topicId,
        title: record.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    recordsPath,
    outFile,
    recordsRead: records.length,
    recordsMatched,
    blocksEmitted: blocks.length,
    skipped,
    warnings,
    failures,
    dryRun: false,
    markdown: blocks.join('\n'),
  };
}

export function writePlaintextCollection(
  result: RecordsToPlaintextResult,
  options: { force?: boolean; dryRun?: boolean; failOnWarning?: boolean } = {},
): RecordsToPlaintextResult {
  const dryRun = Boolean(options.dryRun);
  const finalResult = { ...result, dryRun };

  if (options.failOnWarning && result.warnings.length > 0) {
    throw new Error(`Conversion produced ${result.warnings.length} warning(s)`);
  }

  if (dryRun) {
    return finalResult;
  }

  if (existsSync(result.outFile) && !options.force) {
    throw new Error(`Output file already exists: ${result.outFile}. Pass --force to overwrite.`);
  }

  const outDir = dirname(result.outFile);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(result.outFile, result.markdown, 'utf-8');
  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(buildManifest(finalResult), null, 2)}\n`,
    'utf-8',
  );
  writeFileSync(
    join(outDir, 'failures.jsonl'),
    result.failures.map((failure) => JSON.stringify(failure)).join('\n') +
      (result.failures.length > 0 ? '\n' : ''),
    'utf-8',
  );

  return finalResult;
}

export function runRecordsToPlaintext(
  options: RecordsToPlaintextOptions,
): RecordsToPlaintextResult {
  const records = readRecordsJson(options.recordsPath);
  const converted = convertRecordsToPlaintextCollection(records, {
    recordsPath: options.recordsPath,
    outFile: options.outFile,
    contentType: options.contentType,
    site: options.site,
  });

  return writePlaintextCollection(converted, {
    force: options.force,
    dryRun: options.dryRun,
    failOnWarning: options.failOnWarning,
  });
}

function defaultOutFile(recordsPath: string): string {
  return join(dirname(resolvePath(recordsPath)), 'plaintext', 'monsters.md');
}

function buildManifest(result: RecordsToPlaintextResult): Record<string, unknown> {
  return {
    recordsPath: result.recordsPath,
    outFile: result.outFile,
    generatedAt: new Date().toISOString(),
    recordsRead: result.recordsRead,
    recordsMatched: result.recordsMatched,
    blocksEmitted: result.blocksEmitted,
    skipped: result.skipped,
    warnings: result.warnings.length,
    failures: result.failures.length,
    dryRun: result.dryRun,
  };
}

function matchesContentType(record: CrawledTopicRecord, contentType: CrawlContentTypeFilter): boolean {
  return contentType === 'all' || record.classification.contentType === contentType;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

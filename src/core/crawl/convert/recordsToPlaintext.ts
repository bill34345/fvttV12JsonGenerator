import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { CrawledTopicRecord, CrawlContentTypeFilter } from '../types';
import {
  renderGoddessFantasyMonsterToPlaintextItems,
  type PlaintextRenderWarning,
} from './goddessfantasyPlaintext';

export interface RecordsToPlaintextOptions {
  recordsPath: string;
  outFile?: string;
  outDir?: string;
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

export type PlaintextItemStatus = 'ok' | 'needs_review' | 'failed' | 'skipped';

export interface PlaintextItemResult {
  topicId?: string;
  title?: string;
  status: PlaintextItemStatus;
  fileName?: string;
  outputPath?: string;
  heading?: string;
  chineseName?: string;
  englishName?: string;
  markdown?: string;
  warnings: PlaintextRenderWarning[];
  failure?: RecordsToPlaintextFailure;
  skippedReason?: string;
}

export interface RecordsToPlaintextResult {
  recordsPath: string;
  outDir: string;
  outFile: string;
  legacyCollection: boolean;
  recordsRead: number;
  recordsMatched: number;
  blocksEmitted: number;
  filesWritten: number;
  skipped: number;
  warnings: PlaintextRenderWarning[];
  failures: RecordsToPlaintextFailure[];
  items: PlaintextItemResult[];
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
    return record as CrawledTopicRecord;
  });
}

export function convertRecordsToPlaintextCollection(
  records: CrawledTopicRecord[],
  options: {
    recordsPath: string;
    outFile?: string;
    outDir?: string;
    contentType?: CrawlContentTypeFilter;
    site?: string;
  },
): RecordsToPlaintextResult {
  const recordsPath = resolvePath(options.recordsPath);
  const recordsDir = dirname(recordsPath);
  const outDir = resolvePath(options.outDir ?? defaultOutDir(recordsPath));
  const outFile = resolvePath(options.outFile ?? defaultOutFileForOutDir(outDir));
  const legacyCollection = Boolean(options.outFile);
  const contentType = options.contentType ?? 'monster';
  const requestedSite = options.site;
  const usedFileNames = new Set<string>();

  const sorted = [...records].sort((a, b) => {
    const left = Number.parseInt(a.topicId, 10);
    const right = Number.parseInt(b.topicId, 10);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return a.topicId.localeCompare(b.topicId);
  });

  const itemGroups = sorted.map((record, index): PlaintextItemResult[] => {
    const validationFailure = validateRecord(record, index);
    if (validationFailure) {
      return [failedItem(record, validationFailure)];
    }

    try {
      if (requestedSite && record.site !== requestedSite) {
        return [skippedItem(record, `site ${record.site} did not match requested site ${requestedSite}`)];
      }

      if (!matchesContentType(record, contentType)) {
        return [skippedItem(record, `content type ${record.classification.contentType} did not match ${contentType}`)];
      }

      if (record.site !== 'goddessfantasy') {
        throw new Error(`Unsupported site: ${record.site}`);
      }

      if (record.classification.contentType !== 'monster') {
        throw new Error(`Unsupported content type for v1 renderer: ${record.classification.contentType}`);
      }

      return renderGoddessFantasyMonsterToPlaintextItems(record, { recordsDir }).map((rendered) => {
        const status: PlaintextItemStatus = rendered.warnings.length > 0 ? 'needs_review' : 'ok';
        const fileName = uniqueFileName(buildItemFileName(record.topicId, rendered.heading, rendered.englishName, rendered.chineseName), usedFileNames);
        return {
          topicId: record.topicId,
          title: record.title,
          status,
          fileName,
          outputPath: join(outDir, fileName),
          heading: rendered.heading,
          chineseName: rendered.chineseName,
          englishName: rendered.englishName,
          markdown: rendered.markdown,
          warnings: rendered.warnings,
        };
      });
    } catch (error) {
      return [failedItem(record, {
        topicId: record.topicId,
        title: record.title,
        error: error instanceof Error ? error.message : String(error),
      })];
    }
  });
  const items = itemGroups.flat();
  const recordsMatched = itemGroups.filter((group) => group.some((item) => item.status !== 'skipped')).length;

  return buildResult({
    recordsPath,
    outDir,
    outFile,
    legacyCollection,
    recordsRead: records.length,
    recordsMatched,
    dryRun: false,
    filesWritten: 0,
    items,
  });
}

export function writePlaintextCollection(
  result: RecordsToPlaintextResult,
  options: { force?: boolean; dryRun?: boolean; failOnWarning?: boolean } = {},
): RecordsToPlaintextResult {
  const dryRun = Boolean(options.dryRun);
  let filesWritten = 0;
  const items = result.items.map((item) => ({ ...item, warnings: [...item.warnings] }));

  if (dryRun) {
    return buildResult({ ...result, items, dryRun, filesWritten });
  }

  if (result.legacyCollection) {
    return writeLegacyCollection(result, items, options);
  }

  mkdirSync(result.outDir, { recursive: true });

  for (const item of items) {
    if ((item.status !== 'ok' && item.status !== 'needs_review') || !item.outputPath || !item.markdown) {
      continue;
    }

    if (existsSync(item.outputPath) && !options.force) {
      item.status = 'failed';
      item.failure = {
        topicId: item.topicId,
        title: item.title,
        error: `Output file already exists: ${item.outputPath}. Pass --force to overwrite.`,
      };
      item.markdown = undefined;
      continue;
    }

    writeFileSync(item.outputPath, item.markdown, 'utf-8');
    filesWritten++;
  }

  const finalResult = buildResult({ ...result, items, dryRun, filesWritten });
  writePlaintextMetadata(finalResult);
  writeAggregateIfClean(finalResult);
  return finalResult;
}

export function runRecordsToPlaintext(
  options: RecordsToPlaintextOptions,
): RecordsToPlaintextResult {
  const records = readRecordsJson(options.recordsPath);
  const converted = convertRecordsToPlaintextCollection(records, {
    recordsPath: options.recordsPath,
    outDir: options.outDir,
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

function defaultOutDir(recordsPath: string): string {
  return join(dirname(resolvePath(recordsPath)), 'plaintext', 'monsters');
}

function defaultOutFileForOutDir(outDir: string): string {
  return join(dirname(outDir), 'monsters.md');
}

function buildResult(input: Pick<RecordsToPlaintextResult, 'recordsPath' | 'outDir' | 'outFile' | 'legacyCollection' | 'recordsRead' | 'recordsMatched' | 'dryRun' | 'items'> & { filesWritten: number }): RecordsToPlaintextResult {
  const emittedItems = input.items.filter((item) => item.status === 'ok' || item.status === 'needs_review');
  const warnings = input.items.flatMap((item) => item.warnings);
  const failures = input.items.flatMap((item) => item.failure ? [item.failure] : []);
  const skipped = input.items.filter((item) => item.status === 'skipped').length;

  return {
    recordsPath: input.recordsPath,
    outDir: input.outDir,
    outFile: input.outFile,
    legacyCollection: input.legacyCollection,
    recordsRead: input.recordsRead,
    recordsMatched: input.recordsMatched,
    blocksEmitted: emittedItems.length,
    filesWritten: input.filesWritten,
    skipped,
    warnings,
    failures,
    items: input.items,
    dryRun: input.dryRun,
    markdown: emittedItems.map((item) => item.markdown).filter(Boolean).join('\n'),
  };
}

function buildManifest(result: RecordsToPlaintextResult): Record<string, unknown> {
  return {
    schemaVersion: 1,
    recordsPath: result.recordsPath,
    outDir: result.outDir,
    outFile: result.outFile,
    legacyCollection: result.legacyCollection,
    generatedAt: new Date().toISOString(),
    recordsRead: result.recordsRead,
    recordsMatched: result.recordsMatched,
    blocksEmitted: result.blocksEmitted,
    filesWritten: result.filesWritten,
    skipped: result.skipped,
    warnings: result.warnings.length,
    failures: result.failures.length,
    dryRun: result.dryRun,
    items: result.items.map((item) => ({
      topicId: item.topicId,
      title: item.title,
      status: item.status,
      fileName: item.fileName,
      outputPath: item.outputPath,
      heading: item.heading,
      chineseName: item.chineseName,
      englishName: item.englishName,
      warnings: item.warnings,
      failure: item.failure,
      skippedReason: item.skippedReason,
    })),
  };
}

function matchesContentType(record: CrawledTopicRecord, contentType: CrawlContentTypeFilter): boolean {
  return contentType === 'all' || record.classification.contentType === contentType;
}

function writeLegacyCollection(
  result: RecordsToPlaintextResult,
  items: PlaintextItemResult[],
  options: { force?: boolean; dryRun?: boolean; failOnWarning?: boolean },
): RecordsToPlaintextResult {
  if (existsSync(result.outFile) && !options.force) {
    const firstWritable = items.find((item) => item.status === 'ok' || item.status === 'needs_review');
    if (firstWritable) {
      firstWritable.status = 'failed';
      firstWritable.failure = {
        topicId: firstWritable.topicId,
        title: firstWritable.title,
        error: `Output file already exists: ${result.outFile}. Pass --force to overwrite.`,
      };
      firstWritable.markdown = undefined;
    }
    return buildResult({ ...result, items, dryRun: false, filesWritten: 0 });
  }

  const finalResult = buildResult({ ...result, items, dryRun: false, filesWritten: 1 });
  const outDir = dirname(result.outFile);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(result.outFile, finalResult.markdown, 'utf-8');
  writePlaintextMetadata(finalResult);
  return finalResult;
}

function writePlaintextMetadata(result: RecordsToPlaintextResult): void {
  const metadataDir = dirname(result.outFile);
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(join(metadataDir, 'index.md'), buildIndexMarkdown(result), 'utf-8');
  writeFileSync(join(metadataDir, 'manifest.json'), `${JSON.stringify(buildManifest(result), null, 2)}\n`, 'utf-8');
  writeFileSync(join(metadataDir, 'warnings.jsonl'), jsonLines(result.warnings));
  writeFileSync(join(metadataDir, 'failures.jsonl'), jsonLines(result.failures));
}

function writeAggregateIfClean(result: RecordsToPlaintextResult): void {
  if (
    result.warnings.length === 0 &&
    result.failures.length === 0 &&
    result.blocksEmitted > 0 &&
    result.filesWritten === result.blocksEmitted
  ) {
    writeFileSync(result.outFile, result.markdown, 'utf-8');
    return;
  }

  if (existsSync(result.outFile)) {
    rmSync(result.outFile, { force: true });
  }
}

function buildIndexMarkdown(result: RecordsToPlaintextResult): string {
  const lines = [
    '# GoddessFantasy plaintext export',
    '',
    `- Records read: ${result.recordsRead}`,
    `- Files written: ${result.filesWritten}`,
    `- Needs review: ${result.items.filter((item) => item.status === 'needs_review').length}`,
    `- Failed: ${result.failures.length}`,
    '',
  ];

  for (const item of result.items) {
    const label = item.heading ?? item.title ?? item.topicId ?? 'unknown';
    if (item.fileName && (item.status === 'ok' || item.status === 'needs_review')) {
      const href = normalizeRelPath(relative(dirname(result.outFile), join(result.outDir, item.fileName)));
      lines.push(`- [${item.status}] [${label}](${href}) topic ${item.topicId ?? 'unknown'}`);
    } else {
      const reason = item.failure?.error ?? item.skippedReason ?? 'not written';
      lines.push(`- [${item.status}] ${label} topic ${item.topicId ?? 'unknown'} - ${reason}`);
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function validateRecord(record: Partial<CrawledTopicRecord>, index: number): RecordsToPlaintextFailure | undefined {
  const title = typeof record.title === 'string' ? record.title : undefined;
  const topicId = typeof record.topicId === 'string' ? record.topicId : undefined;
  if (record.site !== 'goddessfantasy') return { topicId, title, error: `records.json entry ${index} has unsupported or missing site` };
  if (!topicId) return { title, error: `records.json entry ${index} is missing topicId` };
  if (!title) return { topicId, error: `records.json entry ${index} is missing title` };
  if (typeof record.url !== 'string' || !record.url) return { topicId, title, error: `records.json entry ${index} is missing url` };
  if (!record.classification?.contentType) return { topicId, title, error: `records.json entry ${index} is missing classification.contentType` };
  if (!Array.isArray(record.posts)) return { topicId, title, error: `records.json entry ${index} is missing posts` };
  if (!record.posts[0]?.text) return { topicId, title, error: `records.json entry ${index} is missing posts[0].text` };
  return undefined;
}

function failedItem(record: Partial<CrawledTopicRecord>, failure: RecordsToPlaintextFailure): PlaintextItemResult {
  return {
    topicId: failure.topicId ?? record.topicId,
    title: failure.title ?? record.title,
    status: 'failed',
    warnings: [],
    failure,
  };
}

function skippedItem(record: CrawledTopicRecord, skippedReason: string): PlaintextItemResult {
  return {
    topicId: record.topicId,
    title: record.title,
    status: 'skipped',
    warnings: [],
    skippedReason,
  };
}

function buildItemFileName(topicId: string, heading: string, englishName: string, chineseName: string): string {
  const headingEnglish = heading.match(/\(([^)]+)\)\s*$/)?.[1] ?? '';
  const slug = slugify(headingEnglish) || slugify(englishName) || slugify(chineseName) || 'monster';
  return `${topicId}__${slug}.md`;
}

function uniqueFileName(fileName: string, used: Set<string>): string {
  if (!used.has(fileName)) {
    used.add(fileName);
    return fileName;
  }

  const stem = fileName.replace(/\.md$/i, '');
  let index = 2;
  while (used.has(`${stem}-${index}.md`)) index++;
  const unique = `${stem}-${index}.md`;
  used.add(unique);
  return unique;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function jsonLines(values: unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join('\n') + (values.length > 0 ? '\n' : '');
}

function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

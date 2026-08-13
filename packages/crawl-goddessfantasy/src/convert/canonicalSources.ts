import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type {
  CanonicalActorSource,
  CanonicalActorSourceWarning,
} from '@fvtt-json-generator/contracts/canonical-actor';
import type { CrawledTopicRecord, CrawlContentTypeFilter } from '../types';
import {
  renderGoddessFantasyMonsterToCanonicalSources,
  type CanonicalActorRenderResult,
  type PlaintextRenderWarning,
} from './goddessfantasyPlaintext';

export interface CanonicalSourceConversionOptions {
  recordsPath: string;
  records?: CrawledTopicRecord[];
  contentType?: CrawlContentTypeFilter;
  site?: string;
}

export interface CanonicalSourceFailure {
  topicId?: string;
  title?: string;
  error: string;
}

export interface CanonicalSourceConversionResult {
  recordsPath: string;
  recordsRead: number;
  recordsMatched: number;
  blocksEmitted: number;
  skipped: number;
  sources: CanonicalActorSource[];
  warnings: CanonicalActorSourceWarning[];
  failures: CanonicalSourceFailure[];
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

export function convertRecordsToCanonicalSources(
  options: CanonicalSourceConversionOptions,
): CanonicalSourceConversionResult {
  const recordsPath = resolvePath(options.recordsPath);
  let records: CrawledTopicRecord[];
  try {
    records = options.records ?? readRecordsJson(recordsPath);
  } catch (error) {
    return {
      recordsPath,
      recordsRead: 0,
      recordsMatched: 0,
      blocksEmitted: 0,
      skipped: 0,
      sources: [],
      warnings: [],
      failures: [{ error: error instanceof Error ? error.message : String(error) }],
    };
  }
  const recordsDir = resolvePath(recordsPath).replace(/[\\/][^\\/]+$/, '');
  const contentType = options.contentType ?? 'monster';
  const usedFileNames = new Set<string>();
  const usedSourceIds = new Set<string>();
  const sources: CanonicalActorSource[] = [];
  const warnings: CanonicalActorSourceWarning[] = [];
  const failures: CanonicalSourceFailure[] = [];
  let recordsMatched = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    const validationFailure = validateRecord(record, index);
    if (validationFailure) {
      failures.push(validationFailure);
      continue;
    }
    if (options.site && record.site !== options.site) {
      skipped++;
      continue;
    }
    if (contentType !== 'all' && record.classification.contentType !== contentType) {
      skipped++;
      continue;
    }

    recordsMatched++;
    try {
      if (record.site !== 'goddessfantasy') {
        throw new Error(`Unsupported site: ${record.site}`);
      }
      if (record.classification.contentType !== 'monster') {
        throw new Error(`Unsupported content type for canonical Actor renderer: ${record.classification.contentType}`);
      }

      const rendered = renderGoddessFantasyMonsterToCanonicalSources(record, { recordsDir });
      for (const source of rendered) {
        const uniqueFileName = uniqueFileNameFor(source.fileName, usedFileNames);
        const uniqueSourceId = uniqueSourceIdFor(source.sourceId, usedSourceIds);
        const entityId = source.metadata?.entityId;
        const entitySuffix = uniqueSourceId.startsWith(`${source.sourceId}-`)
          ? uniqueSourceId.slice(source.sourceId.length + 1)
          : '';
        const normalized = {
          ...source,
          fileName: uniqueFileName,
          sourceId: uniqueSourceId,
          warnings: source.warnings.map((warning) => ({ ...warning, sourceId: uniqueSourceId })),
          metadata: source.metadata
            ? {
                ...source.metadata,
                entityId: entityId
                  ? `${entityId}${entitySuffix ? `-${entitySuffix}` : ''}`
                  : uniqueFileName.replace(/\.md$/i, ''),
              }
            : undefined,
        } satisfies CanonicalActorSource;
        sources.push(normalized);
        warnings.push(...normalized.warnings);
      }
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
    recordsRead: records.length,
    recordsMatched,
    blocksEmitted: sources.length,
    skipped,
    sources,
    warnings,
    failures,
  };
}

function validateRecord(
  record: Partial<CrawledTopicRecord>,
  index: number,
): CanonicalSourceFailure | undefined {
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

function uniqueFileNameFor(fileName: string, used: Set<string>): string {
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

function uniqueSourceIdFor(sourceId: string, used: Set<string>): string {
  if (!used.has(sourceId)) {
    used.add(sourceId);
    return sourceId;
  }
  let index = 2;
  while (used.has(`${sourceId}-${index}`)) index++;
  const unique = `${sourceId}-${index}`;
  used.add(unique);
  return unique;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export type { CanonicalActorRenderResult, PlaintextRenderWarning };

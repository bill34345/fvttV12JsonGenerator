import { hashSource, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES,
  FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES,
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
  type ForgeIntakeReviewBundleV2,
  type ImportedForgeIntakeReviewRecord,
} from './intakeReviewImport';
import type { ForgeIntakeMode, ForgeIntakeObjectKind, ForgeIntakeReviewStatus } from './intakeReview';

export const FORGE_SOURCE_LIBRARY_SCHEMA = 'fvtt-json-forge-source-library' as const;
export const FORGE_SOURCE_LIBRARY_VERSION = 1 as const;
export const FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA = 'fvtt-json-forge-source-library-source' as const;
export const FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES = 64 * 1024 * 1024;
export const FORGE_SOURCE_LIBRARY_MAX_SOURCES = 500;
export const FORGE_SOURCE_LIBRARY_MAX_REVIEWS = 5_000;
export const FORGE_SOURCE_LIBRARY_MAX_REVIEWS_PER_SOURCE = 50;

const SOURCE_ID_PREFIX = 'forge-source-library:v1:';
const MAX_LABEL_LENGTH = 500;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const OBJECT_KINDS = ['actor', 'item'] as const;
const MODES = ['plaintext-actor', 'ai-monster', 'ai-item'] as const;
const STATUSES = ['empty', 'analyzing', 'ready_to_generate', 'generating_and_reviewing', 'repairing', 'regenerating', 'accepted', 'needs_review', 'failed', 'rejected', 'committing_and_reading_back'] as const;
const SECRET_TEXT_PATTERNS = [
  /(?:^|\n)\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /"(?:apiKey|authorization|cookie|endpoint|rawResponse|artifact)"\s*:/iu,
];

export interface ForgeSourceLibrarySourceV1 {
  schema: typeof FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA;
  version: typeof FORGE_SOURCE_LIBRARY_VERSION;
  id: string;
  objectKind: ForgeIntakeObjectKind;
  mode: ForgeIntakeMode;
  sourceLabel: string;
  rawSource: string;
  rawSourceHash: Sha256;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ForgeSourceLibraryReviewV1 {
  id: Sha256;
  sourceRecordId: string;
  requestId: string;
  attemptId: string;
  status: ForgeIntakeReviewStatus;
  savedAt: string;
  bundle: ForgeIntakeReviewBundleV2;
}

export interface ForgeSourceLibraryV1 {
  schema: typeof FORGE_SOURCE_LIBRARY_SCHEMA;
  version: typeof FORGE_SOURCE_LIBRARY_VERSION;
  revision: number;
  updatedAt: string;
  sources: ForgeSourceLibrarySourceV1[];
  reviews: ForgeSourceLibraryReviewV1[];
}

export interface ForgeSourceLibrarySearchResult {
  source: Readonly<ForgeSourceLibrarySourceV1>;
  reviews: readonly Readonly<ForgeSourceLibraryReviewV1>[];
}

export interface ForgeSourceLibraryStore {
  load(): Promise<Readonly<ForgeSourceLibraryV1>>;
  replace(
    expectedRevision: number,
    next: Readonly<ForgeSourceLibraryV1>,
    beforeCommit?: ForgeSourceLibraryCommitGuard,
  ): Promise<void>;
  subscribe?(listener: () => void): () => void;
  close?(): void;
}

export type ForgeSourceLibraryCommitGuard = () => void;

export class ForgeSourceLibraryConflictError extends Error {
  constructor(message = 'Source library changed in another window; refresh and retry.') {
    super(message);
    this.name = 'ForgeSourceLibraryConflictError';
  }
}

export class ManagedForgeSourceLibrary {
  constructor(
    private readonly store: ForgeSourceLibraryStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  subscribe(listener: () => void): () => void {
    return this.store.subscribe?.(listener) ?? (() => undefined);
  }

  close(): void {
    this.store.close?.();
  }

  async load(): Promise<Readonly<ForgeSourceLibraryV1>> {
    return decodeForgeSourceLibraryText(serializeForgeSourceLibrary(await this.store.load()));
  }

  async saveSource(input: {
    objectKind: ForgeIntakeObjectKind;
    mode: ForgeIntakeMode;
    sourceLabel: string;
    rawSource: string;
    forbiddenValues?: readonly string[];
    beforeCommit?: ForgeSourceLibraryCommitGuard;
  }): Promise<Readonly<ForgeSourceLibraryV1>> {
    const forbiddenValues = input.forbiddenValues ?? [];
    assertConfiguredSecretsAbsent(input.rawSource, forbiddenValues);
    assertConfiguredSecretsAbsent(input.sourceLabel, forbiddenValues);
    return await this.mutate(
      (current, timestamp) => upsertSource(current, input, timestamp).state,
      { forbiddenValues, beforeCommit: input.beforeCommit },
    );
  }

  async saveReview(
    imported: ImportedForgeIntakeReviewRecord,
    sourceLabel?: string,
    forbiddenValues: readonly string[] = [],
    beforeCommit?: ForgeSourceLibraryCommitGuard,
  ): Promise<Readonly<ForgeSourceLibraryV1>> {
    const bundle = imported.bundle;
    const serializedBundle = serializeForgeIntakeReviewBundleV2(bundle);
    const storedImported = decodeForgeIntakeReviewBundleText(serializedBundle);
    const storedBundleHash = storedImported.normalizedBundleHash;
    const storedSourceLabel = sourceLabel ?? bundle.sourceLabel ?? bundle.candidate?.label ?? '';
    assertConfiguredSecretsAbsent(serializedBundle, forbiddenValues);
    assertConfiguredSecretsAbsent(storedSourceLabel, forbiddenValues);
    return await this.mutate((current, timestamp) => {
      const upserted = upsertSource(current, {
        objectKind: bundle.objectKind,
        mode: bundle.mode,
        sourceLabel: storedSourceLabel,
        rawSource: bundle.rawSource,
      }, timestamp);
      const existing = upserted.state.reviews.find((review) => review.id === storedBundleHash);
      if (existing) {
        if (existing.sourceRecordId !== upserted.source.id || serializeForgeIntakeReviewBundleV2(existing.bundle) !== serializeForgeIntakeReviewBundleV2(bundle)) {
          throw new ForgeSourceLibraryConflictError('Review hash conflicts with different normalized content.');
        }
        return upserted.state;
      }
      const perSource = upserted.state.reviews.filter((review) => review.sourceRecordId === upserted.source.id).length;
      if (perSource >= FORGE_SOURCE_LIBRARY_MAX_REVIEWS_PER_SOURCE) throw new RangeError('Source review limit reached.');
      if (upserted.state.reviews.length >= FORGE_SOURCE_LIBRARY_MAX_REVIEWS) throw new RangeError('Source library review limit reached.');
      return normalizeState({
        ...upserted.state,
        reviews: [...upserted.state.reviews, {
          id: storedBundleHash,
          sourceRecordId: upserted.source.id,
          requestId: bundle.requestId,
          attemptId: bundle.attemptId,
          status: bundle.status,
          savedAt: timestamp,
          bundle,
        }],
      });
    }, { forbiddenValues, beforeCommit });
  }

  async deleteSource(id: string, beforeCommit?: ForgeSourceLibraryCommitGuard): Promise<Readonly<ForgeSourceLibraryV1>> {
    return await this.mutate((current) => {
      if (!current.sources.some((source) => source.id === id)) return current;
      return normalizeState({
        ...current,
        sources: current.sources.filter((source) => source.id !== id),
        reviews: current.reviews.filter((review) => review.sourceRecordId !== id),
      });
    }, { beforeCommit });
  }

  async deleteReview(id: string, beforeCommit?: ForgeSourceLibraryCommitGuard): Promise<Readonly<ForgeSourceLibraryV1>> {
    return await this.mutate((current) => normalizeState({
      ...current,
      reviews: current.reviews.filter((review) => review.id !== id),
    }), { beforeCommit });
  }

  async importText(
    text: string,
    forbiddenValues: readonly string[] = [],
    beforeCommit?: ForgeSourceLibraryCommitGuard,
  ): Promise<Readonly<ForgeSourceLibraryV1>> {
    assertConfiguredSecretsAbsent(text, forbiddenValues);
    const incoming = decodeForgeSourceLibraryPortableText(text);
    return await this.mutate((current) => mergeForgeSourceLibraries(current, incoming), { forbiddenValues, beforeCommit });
  }

  private async mutate(
    change: (current: ForgeSourceLibraryV1, timestamp: string) => ForgeSourceLibraryV1,
    options: { forbiddenValues?: readonly string[]; beforeCommit?: ForgeSourceLibraryCommitGuard } = {},
  ): Promise<Readonly<ForgeSourceLibraryV1>> {
    const current = decodeForgeSourceLibraryText(serializeForgeSourceLibrary(await this.store.load()));
    const timestamp = requireIso(this.now(), 'current time');
    const changed = change(thaw(current), timestamp);
    const same = serializeForgeSourceLibrary({ ...current, revision: 0, updatedAt: timestamp })
      === serializeForgeSourceLibrary({ ...changed, revision: 0, updatedAt: timestamp });
    if (same) return current;
    const next = normalizeState({ ...changed, revision: incrementSafeInteger(current.revision, 'Source library revision'), updatedAt: timestamp });
    assertLibraryBounds(next);
    const serialized = serializeForgeSourceLibrary(next);
    assertConfiguredSecretsAbsent(serialized, options.forbiddenValues ?? []);
    const validated = decodeForgeSourceLibraryText(serialized);
    options.beforeCommit?.();
    await this.store.replace(current.revision, validated, options.beforeCommit);
    return validated;
  }
}

export class MemoryForgeSourceLibraryStore implements ForgeSourceLibraryStore {
  private state: ForgeSourceLibraryV1;
  private readonly listeners = new Set<() => void>();

  constructor(initial: ForgeSourceLibraryV1 = emptyForgeSourceLibrary()) {
    this.state = thaw(decodeForgeSourceLibraryText(serializeForgeSourceLibrary(initial)));
  }

  async load(): Promise<Readonly<ForgeSourceLibraryV1>> {
    return decodeForgeSourceLibraryText(serializeForgeSourceLibrary(this.state));
  }

  async replace(
    expectedRevision: number,
    next: Readonly<ForgeSourceLibraryV1>,
    beforeCommit?: ForgeSourceLibraryCommitGuard,
  ): Promise<void> {
    if (this.state.revision !== expectedRevision) throw new ForgeSourceLibraryConflictError();
    beforeCommit?.();
    this.state = thaw(decodeForgeSourceLibraryText(serializeForgeSourceLibrary(next)));
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function emptyForgeSourceLibrary(): ForgeSourceLibraryV1 {
  return {
    schema: FORGE_SOURCE_LIBRARY_SCHEMA,
    version: FORGE_SOURCE_LIBRARY_VERSION,
    revision: 0,
    updatedAt: '1970-01-01T00:00:00.000Z',
    sources: [],
    reviews: [],
  };
}

export function sourceLibraryRecordId(objectKind: ForgeIntakeObjectKind, mode: ForgeIntakeMode, rawSourceHash: Sha256): string {
  return `${SOURCE_ID_PREFIX}${objectKind}:${mode}:${rawSourceHash}`;
}

export function searchForgeSourceLibrary(
  library: Readonly<ForgeSourceLibraryV1>,
  query: string,
): ForgeSourceLibrarySearchResult[] {
  const tokens = query.trim().toLocaleLowerCase('en-US').split(/\s+/u).filter(Boolean);
  return library.sources.map((source) => {
    const reviews = library.reviews.filter((review) => review.sourceRecordId === source.id)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    return { source, reviews };
  }).filter(({ source, reviews }) => {
    if (tokens.length === 0) return true;
    const haystack = [source.id, source.sourceLabel, source.objectKind, source.mode, source.rawSourceHash, source.rawSource,
      ...reviews.flatMap((review) => [review.id, review.requestId, review.attemptId, review.status])]
      .join('\n').toLocaleLowerCase('en-US');
    return tokens.every((token) => haystack.includes(token));
  }).sort((left, right) => right.source.updatedAt.localeCompare(left.source.updatedAt) || left.source.id.localeCompare(right.source.id));
}

export function importedReviewFromLibrary(review: Readonly<ForgeSourceLibraryReviewV1>): ImportedForgeIntakeReviewRecord {
  return decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(review.bundle));
}

export function serializeForgeSourceLibrary(library: Readonly<ForgeSourceLibraryV1>): string {
  const normalized = normalizeState(thaw(library));
  assertLibraryBounds(normalized);
  return `${stableStringify(normalized, 2)}\n`;
}

export function serializeForgeSourceLibrarySource(source: Readonly<ForgeSourceLibrarySourceV1>): string {
  const decoded = decodeSource(thaw(source), '$.source');
  return `${stableStringify({ schema: FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA, version: 1, source: decoded }, 2)}\n`;
}

export function decodeForgeSourceLibraryText(text: string): Readonly<ForgeSourceLibraryV1> {
  if (typeof text !== 'string') throw new TypeError('Source library file must be text.');
  assertUtf8Limit(text, FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES, 'Source library file');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('Source library file is not valid JSON.'); }
  const record = requireRecord(parsed, '$');
  exactKeys(record, ['schema', 'version', 'revision', 'updatedAt', 'sources', 'reviews'], '$');
  if (record.schema !== FORGE_SOURCE_LIBRARY_SCHEMA || record.version !== FORGE_SOURCE_LIBRARY_VERSION) {
    throw new TypeError('Unsupported source library schema or version.');
  }
  const sources = decodeArray(record.sources, '$.sources', FORGE_SOURCE_LIBRARY_MAX_SOURCES, decodeSource);
  const reviews = decodeArray(record.reviews, '$.reviews', FORGE_SOURCE_LIBRARY_MAX_REVIEWS, decodeReview);
  const state = normalizeState({
    schema: FORGE_SOURCE_LIBRARY_SCHEMA,
    version: FORGE_SOURCE_LIBRARY_VERSION,
    revision: requireNonNegativeInteger(record.revision, '$.revision'),
    updatedAt: requireIso(record.updatedAt, '$.updatedAt'),
    sources,
    reviews,
  });
  assertLibraryConsistency(state);
  assertLibraryBounds(state);
  return deepFreeze(state);
}

export function decodeForgeSourceLibraryPortableText(text: string): Readonly<ForgeSourceLibraryV1> {
  if (typeof text !== 'string') throw new TypeError('Source library file must be text.');
  assertUtf8Limit(text, FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES, 'Source library file');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('Source library file is not valid JSON.'); }
  const record = requireRecord(parsed, '$');
  if (record.schema === FORGE_SOURCE_LIBRARY_SCHEMA) return decodeForgeSourceLibraryText(text);
  exactKeys(record, ['schema', 'version', 'source'], '$');
  if (record.schema !== FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA || record.version !== FORGE_SOURCE_LIBRARY_VERSION) {
    throw new TypeError('Unsupported portable source library schema or version.');
  }
  const source = decodeSource(record.source, '$.source');
  return deepFreeze(normalizeState({
    ...emptyForgeSourceLibrary(),
    updatedAt: source.updatedAt,
    sources: [source],
  }));
}

export function mergeForgeSourceLibraries(
  current: Readonly<ForgeSourceLibraryV1>,
  incoming: Readonly<ForgeSourceLibraryV1>,
): ForgeSourceLibraryV1 {
  const sources = new Map(current.sources.map((source) => [source.id, thaw(source)]));
  for (const source of incoming.sources) {
    const existing = sources.get(source.id);
    if (existing && (existing.rawSource !== source.rawSource || existing.rawSourceHash !== source.rawSourceHash
      || existing.objectKind !== source.objectKind || existing.mode !== source.mode)) {
      throw new ForgeSourceLibraryConflictError('Source identity conflicts with different source content.');
    }
    if (!existing) sources.set(source.id, thaw(source));
  }
  const reviews = new Map(current.reviews.map((review) => [review.id, thaw(review)]));
  for (const review of incoming.reviews) {
    const existing = reviews.get(review.id);
    if (existing && (existing.sourceRecordId !== review.sourceRecordId
      || serializeForgeIntakeReviewBundleV2(existing.bundle) !== serializeForgeIntakeReviewBundleV2(review.bundle))) {
      throw new ForgeSourceLibraryConflictError('Review identity conflicts with different normalized content.');
    }
    if (!existing) reviews.set(review.id, thaw(review));
  }
  const merged = normalizeState({ ...thaw(current), sources: [...sources.values()], reviews: [...reviews.values()] });
  assertLibraryConsistency(merged);
  assertLibraryBounds(merged);
  return merged;
}

export function assertConfiguredSecretsAbsent(content: string, forbiddenValues: readonly string[]): void {
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(content))) {
    throw new TypeError('Source library safety scan rejected credential or internal provider content.');
  }
  for (const value of forbiddenValues) {
    const trimmed = value.trim();
    if (trimmed && content.includes(trimmed)) throw new TypeError('Source library safety scan found a configured secret value.');
  }
}

function upsertSource(
  current: ForgeSourceLibraryV1,
  input: { objectKind: ForgeIntakeObjectKind; mode: ForgeIntakeMode; sourceLabel: string; rawSource: string },
  timestamp: string,
): { state: ForgeSourceLibraryV1; source: ForgeSourceLibrarySourceV1 } {
  const objectKind = requireEnum(input.objectKind, OBJECT_KINDS, 'objectKind');
  const mode = requireEnum(input.mode, MODES, 'mode');
  if ((objectKind === 'item') !== (mode === 'ai-item')) throw new TypeError('Source object kind does not match mode.');
  const rawSource = requireString(input.rawSource, 'rawSource', true);
  assertUtf8Limit(rawSource, FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES, 'rawSource');
  assertConfiguredSecretsAbsent(rawSource, []);
  const rawSourceHash = hashSource(rawSource);
  const id = sourceLibraryRecordId(objectKind, mode, rawSourceHash);
  const label = requireLabel(input.sourceLabel);
  const existing = current.sources.find((source) => source.id === id);
  if (existing && existing.rawSource !== rawSource) throw new ForgeSourceLibraryConflictError('Source hash conflicts with different bytes.');
  let source: ForgeSourceLibrarySourceV1;
  if (existing) {
    source = {
      ...existing,
      sourceLabel: label || existing.sourceLabel,
      updatedAt: timestamp,
      revision: incrementSafeInteger(existing.revision, 'Source record revision'),
    };
  } else {
    if (current.sources.length >= FORGE_SOURCE_LIBRARY_MAX_SOURCES) throw new RangeError('Source library source limit reached.');
    source = {
      schema: FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA,
      version: FORGE_SOURCE_LIBRARY_VERSION,
      id,
      objectKind,
      mode,
      sourceLabel: label,
      rawSource,
      rawSourceHash,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    };
  }
  return {
    source,
    state: normalizeState({ ...current, sources: [...current.sources.filter((entry) => entry.id !== id), source] }),
  };
}

function incrementSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new RangeError(`${label} limit reached.`);
  return value + 1;
}

function decodeSource(value: unknown, path: string): ForgeSourceLibrarySourceV1 {
  const record = requireRecord(value, path);
  exactKeys(record, ['schema', 'version', 'id', 'objectKind', 'mode', 'sourceLabel', 'rawSource', 'rawSourceHash', 'createdAt', 'updatedAt', 'revision'], path);
  if (record.schema !== FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA || record.version !== FORGE_SOURCE_LIBRARY_VERSION) throw new TypeError(`${path} has an unsupported source schema.`);
  const objectKind = requireEnum(record.objectKind, OBJECT_KINDS, `${path}.objectKind`);
  const mode = requireEnum(record.mode, MODES, `${path}.mode`);
  if ((objectKind === 'item') !== (mode === 'ai-item')) throw new TypeError(`${path} object kind does not match mode.`);
  const rawSource = requireString(record.rawSource, `${path}.rawSource`, true);
  assertUtf8Limit(rawSource, FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES, `${path}.rawSource`);
  assertConfiguredSecretsAbsent(rawSource, []);
  const rawSourceHash = requireSha256(record.rawSourceHash, `${path}.rawSourceHash`);
  if (hashSource(rawSource) !== rawSourceHash) throw new TypeError(`${path} raw source hash does not match.`);
  const id = requireString(record.id, `${path}.id`, true);
  if (id !== sourceLibraryRecordId(objectKind, mode, rawSourceHash)) throw new TypeError(`${path} source ID does not match its identity.`);
  return {
    schema: FORGE_SOURCE_LIBRARY_SOURCE_SCHEMA,
    version: FORGE_SOURCE_LIBRARY_VERSION,
    id,
    objectKind,
    mode,
    sourceLabel: requireLabel(record.sourceLabel),
    rawSource,
    rawSourceHash,
    createdAt: requireIso(record.createdAt, `${path}.createdAt`),
    updatedAt: requireIso(record.updatedAt, `${path}.updatedAt`),
    revision: requirePositiveInteger(record.revision, `${path}.revision`),
  };
}

function decodeReview(value: unknown, path: string): ForgeSourceLibraryReviewV1 {
  const record = requireRecord(value, path);
  exactKeys(record, ['id', 'sourceRecordId', 'requestId', 'attemptId', 'status', 'savedAt', 'bundle'], path);
  const imported = decodeForgeIntakeReviewBundleText(JSON.stringify(record.bundle));
  const id = requireSha256(record.id, `${path}.id`);
  if (id !== imported.normalizedBundleHash) throw new TypeError(`${path} review ID does not match normalized bundle hash.`);
  if (new TextEncoder().encode(serializeForgeIntakeReviewBundleV2(imported.bundle)).byteLength > FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES) {
    throw new TypeError(`${path} review bundle exceeds its size limit.`);
  }
  const requestId = requireString(record.requestId, `${path}.requestId`, true);
  const attemptId = requireString(record.attemptId, `${path}.attemptId`, true);
  const status = requireEnum(record.status, STATUSES, `${path}.status`);
  if (requestId !== imported.bundle.requestId || attemptId !== imported.bundle.attemptId || status !== imported.bundle.status) {
    throw new TypeError(`${path} review metadata does not match its normalized bundle.`);
  }
  return {
    id,
    sourceRecordId: requireString(record.sourceRecordId, `${path}.sourceRecordId`, true),
    requestId,
    attemptId,
    status,
    savedAt: requireIso(record.savedAt, `${path}.savedAt`),
    bundle: imported.bundle,
  };
}

function assertLibraryConsistency(state: ForgeSourceLibraryV1): void {
  const sourceIds = new Set<string>();
  for (const source of state.sources) {
    if (sourceIds.has(source.id)) throw new TypeError('Source library contains a duplicate source ID.');
    sourceIds.add(source.id);
  }
  const reviewIds = new Set<string>();
  const counts = new Map<string, number>();
  for (const review of state.reviews) {
    if (reviewIds.has(review.id)) throw new TypeError('Source library contains a duplicate review ID.');
    reviewIds.add(review.id);
    const source = state.sources.find((entry) => entry.id === review.sourceRecordId);
    if (!source) throw new TypeError('Source library review references a missing source.');
    if (source.objectKind !== review.bundle.objectKind || source.mode !== review.bundle.mode
      || source.rawSource !== review.bundle.rawSource || source.rawSourceHash !== review.bundle.rawSourceHash) {
      throw new TypeError('Source library review does not match its source identity.');
    }
    counts.set(source.id, (counts.get(source.id) ?? 0) + 1);
    if (counts.get(source.id)! > FORGE_SOURCE_LIBRARY_MAX_REVIEWS_PER_SOURCE) throw new TypeError('Source library source exceeds its review limit.');
  }
}

function assertLibraryBounds(state: ForgeSourceLibraryV1): void {
  if (state.sources.length > FORGE_SOURCE_LIBRARY_MAX_SOURCES) throw new RangeError('Source library source limit exceeded.');
  if (state.reviews.length > FORGE_SOURCE_LIBRARY_MAX_REVIEWS) throw new RangeError('Source library review limit exceeded.');
  assertLibraryConsistency(state);
  const serialized = stableStringify(normalizeState(thaw(state)));
  assertUtf8Limit(serialized, FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES, 'Source library');
}

function normalizeState(state: ForgeSourceLibraryV1): ForgeSourceLibraryV1 {
  return {
    schema: FORGE_SOURCE_LIBRARY_SCHEMA,
    version: FORGE_SOURCE_LIBRARY_VERSION,
    revision: state.revision,
    updatedAt: state.updatedAt,
    sources: [...state.sources].sort((left, right) => left.id.localeCompare(right.id)),
    reviews: [...state.reviews].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain object.`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(record)) if (!keys.has(key)) throw new TypeError(`${path} contains an unknown key.`);
  for (const key of allowed) if (!Object.hasOwn(record, key)) throw new TypeError(`${path}.${key} is required.`);
}

function decodeArray<T>(value: unknown, path: string, maximum: number, decode: (entry: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  if (value.length > maximum) throw new RangeError(`${path} exceeds its entry limit.`);
  return value.map((entry, index) => decode(entry, `${path}[${index}]`));
}

function requireString(value: unknown, path: string, nonEmpty = false): string {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string.`);
  if (nonEmpty && !value.trim()) throw new TypeError(`${path} must not be empty.`);
  return value;
}

function requireLabel(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('sourceLabel must be a string.');
  if (value.length > MAX_LABEL_LENGTH) throw new TypeError('sourceLabel exceeds its length limit.');
  return value;
}

function requireIso(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value) || new Date(value).toISOString() !== value) throw new TypeError(`${path} must be a canonical ISO timestamp.`);
  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${path} must be a non-negative safe integer.`);
  return value as number;
}

function requirePositiveInteger(value: unknown, path: string): number {
  const result = requireNonNegativeInteger(value, path);
  if (result === 0) throw new TypeError(`${path} must be positive.`);
  return result;
}

function requireSha256(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 digest.`);
  return value as Sha256;
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(`${path} has an unsupported value.`);
  return value as T[number];
}

function assertUtf8Limit(value: string, maximum: number, path: string): void {
  if (new TextEncoder().encode(value).byteLength > maximum) throw new RangeError(`${path} exceeds the UTF-8 byte limit.`);
}

function stableStringify(value: unknown, space?: number): string {
  return JSON.stringify(sortJson(value), null, space);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortJson((value as Record<string, unknown>)[key])]));
}

function thaw<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

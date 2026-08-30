import { hashSource, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
  type ForgeIntakeReviewBundleV2,
} from './intakeReviewImport';
import type { ForgeIntakeMode, ForgeIntakeObjectKind } from './intakeReview';
import { assertConfiguredSecretsAbsent, sourceLibraryRecordId } from './sourceLibrary';

export const FORGE_BATCH_COLLECTION_SCHEMA = 'fvtt-json-forge-batch-collection' as const;
export const FORGE_BATCH_COLLECTION_VERSION = 1 as const;
export const FORGE_BATCH_COLLECTION_ZIP_SCHEMA = 'fvtt-json-forge-batch-collection-zip' as const;
export const FORGE_BATCH_COLLECTION_MAX_ENTRIES = 200;
export const FORGE_BATCH_COLLECTION_MAX_UTF8_BYTES = 64 * 1024 * 1024;
export const FORGE_BATCH_COLLECTION_MAX_SOURCE_UTF8_BYTES = 200_000;
export const FORGE_BATCH_COLLECTION_MAX_ZIP_BYTES = 64 * 1024 * 1024;
export const FORGE_BATCH_COLLECTION_MAX_ZIP_ENTRIES = 1 + (FORGE_BATCH_COLLECTION_MAX_ENTRIES * 2);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COLLECTION_ID_PATTERN = /^collection:v1:[0-9a-f]{64}$/u;
const ENTRY_ID_PATTERN = /^forge-source-library:v1:(?:actor|item):(?:plaintext-actor|ai-monster|ai-item):[0-9a-f]{64}$/u;
const SAFE_ZIP_PATH_PATTERN = /^(?:manifest\.json|sources\/[0-9]{4}\.txt|reviews\/[0-9]{4}\.json)$/u;
const COLLECTION_KEYS = new Set(['schema', 'version', 'id', 'label', 'createdAt', 'entries']);
const ENTRY_KEYS = new Set(['id', 'objectKind', 'mode', 'sourceLabel', 'rawSource', 'rawSourceHash', 'review']);
const ZIP_MANIFEST_KEYS = new Set(['schema', 'version', 'collectionId', 'label', 'createdAt', 'entries']);
const ZIP_ENTRY_KEYS = new Set(['id', 'objectKind', 'mode', 'sourceLabel', 'rawSourceHash', 'sourcePath', 'reviewPath']);

export interface ForgeBatchCollectionEntryV1 {
  schema: 'fvtt-json-forge-batch-collection-entry';
  version: 1;
  id: string;
  objectKind: ForgeIntakeObjectKind;
  mode: ForgeIntakeMode;
  sourceLabel: string;
  rawSource: string;
  rawSourceHash: Sha256;
  review?: ForgeIntakeReviewBundleV2;
}

export interface ForgeBatchCollectionV1 {
  schema: typeof FORGE_BATCH_COLLECTION_SCHEMA;
  version: typeof FORGE_BATCH_COLLECTION_VERSION;
  id: string;
  label: string;
  createdAt: string;
  entries: ForgeBatchCollectionEntryV1[];
}

export interface CreateForgeBatchCollectionEntryInput {
  objectKind: ForgeIntakeObjectKind;
  mode: ForgeIntakeMode;
  sourceLabel: string;
  rawSource: string;
  review?: ForgeIntakeReviewBundleV2;
}

interface ForgeBatchCollectionZipManifestV1 {
  schema: typeof FORGE_BATCH_COLLECTION_ZIP_SCHEMA;
  version: 1;
  collectionId: string;
  label: string;
  createdAt: string;
  entries: Array<{
    id: string;
    objectKind: ForgeIntakeObjectKind;
    mode: ForgeIntakeMode;
    sourceLabel: string;
    rawSourceHash: Sha256;
    sourcePath: string;
    reviewPath?: string;
  }>;
}

export function createForgeBatchCollection(options: {
  label: string;
  entries: readonly CreateForgeBatchCollectionEntryInput[];
  createdAt?: string;
  forbiddenValues?: readonly string[];
}): Readonly<ForgeBatchCollectionV1> {
  const label = boundedString(options.label, '$/label', 500, true);
  const createdAt = isoTimestamp(options.createdAt ?? new Date().toISOString(), '$/createdAt');
  if (options.entries.length === 0 || options.entries.length > FORGE_BATCH_COLLECTION_MAX_ENTRIES) {
    throw new TypeError(`Collection entries must contain 1-${FORGE_BATCH_COLLECTION_MAX_ENTRIES} items.`);
  }
  const entries = options.entries.map((entry, index) => createEntry(entry, `$/entries/${index}`));
  assertUnique(entries.map((entry) => entry.id), 'collection entry IDs');
  const id = collectionId(label, createdAt, entries);
  const collection: ForgeBatchCollectionV1 = {
    schema: FORGE_BATCH_COLLECTION_SCHEMA,
    version: FORGE_BATCH_COLLECTION_VERSION,
    id,
    label,
    createdAt,
    entries,
  };
  const serialized = stableStringify(collection);
  assertCollectionSize(serialized);
  assertConfiguredSecretsAbsent(serialized, options.forbiddenValues ?? []);
  return deepFreeze(collection);
}

export function serializeForgeBatchCollection(collection: Readonly<ForgeBatchCollectionV1>, forbiddenValues: readonly string[] = []): string {
  const decoded = decodeForgeBatchCollectionText(stableStringify(collection), forbiddenValues);
  return stableStringify(decoded);
}

export function decodeForgeBatchCollectionText(text: string, forbiddenValues: readonly string[] = []): Readonly<ForgeBatchCollectionV1> {
  assertCollectionSize(text);
  assertConfiguredSecretsAbsent(text, forbiddenValues);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('Collection JSON is invalid.'); }
  const root = exactRecord(parsed, '$', COLLECTION_KEYS);
  literal(root.schema, FORGE_BATCH_COLLECTION_SCHEMA, '$/schema');
  safeInteger(root.version, '$/version', FORGE_BATCH_COLLECTION_VERSION);
  const label = boundedString(root.label, '$/label', 500, true);
  const createdAt = isoTimestamp(root.createdAt, '$/createdAt');
  const rawEntries = boundedArray(root.entries, '$/entries', 1, FORGE_BATCH_COLLECTION_MAX_ENTRIES);
  const entries = rawEntries.map((entry, index) => decodeEntry(entry, `$/entries/${index}`));
  assertUnique(entries.map((entry) => entry.id), 'collection entry IDs');
  const id = boundedString(root.id, '$/id', 96);
  if (!COLLECTION_ID_PATTERN.test(id) || id !== collectionId(label, createdAt, entries)) throw new TypeError('Collection ID does not match normalized content.');
  const collection: ForgeBatchCollectionV1 = { schema: FORGE_BATCH_COLLECTION_SCHEMA, version: 1, id, label, createdAt, entries };
  const normalized = stableStringify(collection);
  assertCollectionSize(normalized);
  assertConfiguredSecretsAbsent(normalized, forbiddenValues);
  return deepFreeze(collection);
}

export async function encodeForgeBatchCollectionZip(
  collection: Readonly<ForgeBatchCollectionV1>,
  forbiddenValues: readonly string[] = [],
): Promise<Uint8Array> {
  const decoded = decodeForgeBatchCollectionText(serializeForgeBatchCollection(collection, forbiddenValues), forbiddenValues);
  const files = new Map<string, Uint8Array>();
  const manifest: ForgeBatchCollectionZipManifestV1 = {
    schema: FORGE_BATCH_COLLECTION_ZIP_SCHEMA,
    version: 1,
    collectionId: decoded.id,
    label: decoded.label,
    createdAt: decoded.createdAt,
    entries: decoded.entries.map((entry, index) => {
      const sequence = String(index + 1).padStart(4, '0');
      const sourcePath = `sources/${sequence}.txt`;
      const reviewPath = entry.review ? `reviews/${sequence}.json` : undefined;
      files.set(sourcePath, utf8(entry.rawSource));
      if (entry.review && reviewPath) files.set(reviewPath, utf8(serializeForgeIntakeReviewBundleV2(entry.review)));
      return {
        id: entry.id,
        objectKind: entry.objectKind,
        mode: entry.mode,
        sourceLabel: entry.sourceLabel,
        rawSourceHash: entry.rawSourceHash,
        sourcePath,
        ...(reviewPath ? { reviewPath } : {}),
      };
    }),
  };
  files.set('manifest.json', utf8(stableStringify(manifest)));
  const ordered = new Map([...files].sort(([left], [right]) => left.localeCompare(right, 'en')));
  const zip = writeStoredZip(ordered);
  if (zip.byteLength > FORGE_BATCH_COLLECTION_MAX_ZIP_BYTES) throw new TypeError('Collection ZIP exceeds the 64 MiB limit.');
  assertConfiguredSecretsAbsent(new TextDecoder().decode(concatBytes([...ordered.values()])), forbiddenValues);
  return zip;
}

export async function decodeForgeBatchCollectionZip(
  input: ArrayBuffer | Uint8Array,
  forbiddenValues: readonly string[] = [],
): Promise<Readonly<ForgeBatchCollectionV1>> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0 || bytes.byteLength > FORGE_BATCH_COLLECTION_MAX_ZIP_BYTES) throw new TypeError('Collection ZIP size is outside the supported range.');
  const files = await readZip(bytes);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new TypeError('Collection ZIP is missing manifest.json.');
  let parsed: unknown;
  try { parsed = JSON.parse(decodeUtf8(manifestBytes, 'manifest.json')); } catch { throw new TypeError('Collection ZIP manifest JSON is invalid.'); }
  const root = exactRecord(parsed, '$zip', ZIP_MANIFEST_KEYS);
  literal(root.schema, FORGE_BATCH_COLLECTION_ZIP_SCHEMA, '$zip/schema');
  safeInteger(root.version, '$zip/version', 1);
  const collectionId = boundedString(root.collectionId, '$zip/collectionId', 96);
  const label = boundedString(root.label, '$zip/label', 500, true);
  const createdAt = isoTimestamp(root.createdAt, '$zip/createdAt');
  const rawEntries = boundedArray(root.entries, '$zip/entries', 1, FORGE_BATCH_COLLECTION_MAX_ENTRIES);
  const referenced = new Set(['manifest.json']);
  const entries: CreateForgeBatchCollectionEntryInput[] = rawEntries.map((value, index) => {
    const path = `$zip/entries/${index}`;
    const record = exactRecord(value, path, ZIP_ENTRY_KEYS);
    const id = boundedString(record.id, `${path}/id`, 160);
    const kind = objectKind(record.objectKind, `${path}/objectKind`);
    const mode = intakeMode(record.mode, `${path}/mode`);
    assertKindMode(kind, mode, path);
    const sourceLabel = boundedString(record.sourceLabel, `${path}/sourceLabel`, 500, true);
    const rawSourceHash = sha256(record.rawSourceHash, `${path}/rawSourceHash`);
    const sourcePath = zipPath(record.sourcePath, `${path}/sourcePath`, 'sources', index + 1);
    const reviewPath = record.reviewPath === undefined ? undefined : zipPath(record.reviewPath, `${path}/reviewPath`, 'reviews', index + 1);
    referenced.add(sourcePath);
    if (reviewPath) referenced.add(reviewPath);
    const sourceBytes = files.get(sourcePath);
    if (!sourceBytes) throw new TypeError(`Collection ZIP is missing ${sourcePath}.`);
    const rawSource = decodeUtf8(sourceBytes, sourcePath);
    if (utf8(rawSource).byteLength > FORGE_BATCH_COLLECTION_MAX_SOURCE_UTF8_BYTES) throw new TypeError(`${sourcePath} exceeds the source limit.`);
    if (hashSource(rawSource) !== rawSourceHash) throw new TypeError(`${sourcePath} does not match its manifest hash.`);
    const expectedId = sourceLibraryRecordId(kind, mode, rawSourceHash);
    if (!ENTRY_ID_PATTERN.test(id) || id !== expectedId) throw new TypeError(`${path}/id does not match source identity.`);
    let review: ForgeIntakeReviewBundleV2 | undefined;
    if (reviewPath) {
      const reviewBytes = files.get(reviewPath);
      if (!reviewBytes) throw new TypeError(`Collection ZIP is missing ${reviewPath}.`);
      review = decodeForgeIntakeReviewBundleText(decodeUtf8(reviewBytes, reviewPath)).bundle;
    }
    return { objectKind: kind, mode, sourceLabel, rawSource, ...(review ? { review } : {}) };
  });
  for (const path of files.keys()) if (!referenced.has(path)) throw new TypeError(`Collection ZIP contains unreferenced entry ${path}.`);
  const collection = createForgeBatchCollection({ label, createdAt, entries, forbiddenValues });
  if (collection.id !== collectionId) throw new TypeError('Collection ZIP identity does not match reconstructed entries.');
  return collection;
}

function createEntry(input: CreateForgeBatchCollectionEntryInput, path: string): ForgeBatchCollectionEntryV1 {
  const object = objectKind(input.objectKind, `${path}/objectKind`);
  const mode = intakeMode(input.mode, `${path}/mode`);
  assertKindMode(object, mode, path);
  const sourceLabel = boundedString(input.sourceLabel, `${path}/sourceLabel`, 500, true);
  const rawSource = boundedSource(input.rawSource, `${path}/rawSource`);
  const rawSourceHash = hashSource(rawSource);
  const id = sourceLibraryRecordId(object, mode, rawSourceHash);
  const review = input.review ? decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(input.review)).bundle : undefined;
  assertReviewMatches(review, { objectKind: object, mode, rawSource, rawSourceHash }, path);
  return { schema: 'fvtt-json-forge-batch-collection-entry', version: 1, id, objectKind: object, mode, sourceLabel, rawSource, rawSourceHash, ...(review ? { review } : {}) };
}

function decodeEntry(value: unknown, path: string): ForgeBatchCollectionEntryV1 {
  const record = exactRecord(value, path, new Set([...ENTRY_KEYS, 'schema', 'version']));
  literal(record.schema, 'fvtt-json-forge-batch-collection-entry', `${path}/schema`);
  safeInteger(record.version, `${path}/version`, 1);
  const object = objectKind(record.objectKind, `${path}/objectKind`);
  const mode = intakeMode(record.mode, `${path}/mode`);
  assertKindMode(object, mode, path);
  const sourceLabel = boundedString(record.sourceLabel, `${path}/sourceLabel`, 500, true);
  const rawSource = boundedSource(record.rawSource, `${path}/rawSource`);
  const rawSourceHash = sha256(record.rawSourceHash, `${path}/rawSourceHash`);
  if (hashSource(rawSource) !== rawSourceHash) throw new TypeError(`${path}/rawSourceHash does not match source bytes.`);
  const id = boundedString(record.id, `${path}/id`, 160);
  if (!ENTRY_ID_PATTERN.test(id) || id !== sourceLibraryRecordId(object, mode, rawSourceHash)) throw new TypeError(`${path}/id does not match source identity.`);
  const review = record.review === undefined ? undefined : decodeForgeIntakeReviewBundleText(JSON.stringify(record.review)).bundle;
  assertReviewMatches(review, { objectKind: object, mode, rawSource, rawSourceHash }, path);
  return { schema: 'fvtt-json-forge-batch-collection-entry', version: 1, id, objectKind: object, mode, sourceLabel, rawSource, rawSourceHash, ...(review ? { review } : {}) };
}

function assertReviewMatches(review: ForgeIntakeReviewBundleV2 | undefined, source: { objectKind: ForgeIntakeObjectKind; mode: ForgeIntakeMode; rawSource: string; rawSourceHash: Sha256 }, path: string): void {
  if (!review) return;
  if (review.objectKind !== source.objectKind || review.mode !== source.mode || review.rawSource !== source.rawSource || review.rawSourceHash !== source.rawSourceHash) {
    throw new TypeError(`${path}/review does not match its collection source.`);
  }
}

function collectionId(label: string, createdAt: string, entries: readonly ForgeBatchCollectionEntryV1[]): string {
  return `collection:v1:${hashSource(stableStringify({ label, createdAt, entries }))}`;
}

function assertCollectionSize(text: string): void {
  const size = utf8(text).byteLength;
  if (size === 0 || size > FORGE_BATCH_COLLECTION_MAX_UTF8_BYTES) throw new TypeError('Collection JSON size is outside the 64 MiB limit.');
}

function boundedSource(value: unknown, path: string): string {
  const source = boundedString(value, path, FORGE_BATCH_COLLECTION_MAX_SOURCE_UTF8_BYTES);
  if (!source.trim()) throw new TypeError(`${path} must not be empty.`);
  if (utf8(source).byteLength > FORGE_BATCH_COLLECTION_MAX_SOURCE_UTF8_BYTES) throw new TypeError(`${path} exceeds the source byte limit.`);
  return source;
}

function objectKind(value: unknown, path: string): ForgeIntakeObjectKind {
  if (value !== 'actor' && value !== 'item') throw new TypeError(`${path} must be actor or item.`);
  return value;
}

function intakeMode(value: unknown, path: string): ForgeIntakeMode {
  if (value !== 'plaintext-actor' && value !== 'ai-monster' && value !== 'ai-item') throw new TypeError(`${path} has an unsupported mode.`);
  return value;
}

function assertKindMode(kind: ForgeIntakeObjectKind, mode: ForgeIntakeMode, path: string): void {
  if ((kind === 'item') !== (mode === 'ai-item')) throw new TypeError(`${path} objectKind and mode do not match.`);
}

function exactRecord(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor' || !allowed.has(key)) throw new TypeError(`${path} contains an unknown key.`);
  }
  return record;
}

function boundedArray(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new TypeError(`${path} length is outside ${min}-${max}.`);
  return value;
}

function boundedString(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > max) throw new TypeError(`${path} must be a bounded string.`);
  return value;
}

function sha256(value: unknown, path: string): Sha256 {
  const hash = boundedString(value, path, 64);
  if (!SHA256_PATTERN.test(hash)) throw new TypeError(`${path} must be a lowercase SHA-256.`);
  return hash as Sha256;
}

function isoTimestamp(value: unknown, path: string): string {
  const text = boundedString(value, path, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || new Date(text).toISOString() !== text) throw new TypeError(`${path} must be an ISO timestamp.`);
  return text;
}

function literal(value: unknown, expected: string, path: string): void {
  if (value !== expected) throw new TypeError(`${path} is unsupported.`);
}

function safeInteger(value: unknown, path: string, expected: number): void {
  if (!Number.isSafeInteger(value) || value !== expected) throw new TypeError(`${path} is unsupported.`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} are not allowed.`);
}

function zipPath(value: unknown, path: string, directory: 'sources' | 'reviews', sequence: number): string {
  const text = boundedString(value, path, 64);
  const expected = `${directory}/${String(sequence).padStart(4, '0')}.${directory === 'sources' ? 'txt' : 'json'}`;
  if (!SAFE_ZIP_PATH_PATTERN.test(text) || text !== expected) throw new TypeError(`${path} is not the canonical safe ZIP path.`);
  return text;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2) + '\n';
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, child]) => [key, sortValue(child)]));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function utf8(value: string): Uint8Array { return new TextEncoder().encode(value); }

function decodeUtf8(value: Uint8Array, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(value); } catch { throw new TypeError(`${path} is not valid UTF-8.`); }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function writeStoredZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  if (files.size === 0 || files.size > FORGE_BATCH_COLLECTION_MAX_ZIP_ENTRIES) throw new TypeError('ZIP entry count is outside the supported range.');
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const [path, data] of files) {
    if (!SAFE_ZIP_PATH_PATTERN.test(path)) throw new TypeError('ZIP output path is not canonical.');
    const name = utf8(path);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true); lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.byteLength, true); lv.setUint32(22, data.byteLength, true); lv.setUint16(26, name.byteLength, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + name.byteLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x0021, true); cv.setUint32(16, checksum, true);
    cv.setUint32(20, data.byteLength, true); cv.setUint32(24, data.byteLength, true); cv.setUint16(28, name.byteLength, true);
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength + data.byteLength;
  }
  const central = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.size, true); ev.setUint16(10, files.size, true); ev.setUint32(12, central.byteLength, true); ev.setUint32(16, localOffset, true); ev.setUint16(20, 0, true);
  return concatBytes([...localParts, central, end]);
}

async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) throw new TypeError('Multi-disk ZIP files are unsupported.');
  const count = view.getUint16(eocd + 10, true);
  const totalCount = view.getUint16(eocd + 8, true);
  if (count !== totalCount || count === 0 || count > FORGE_BATCH_COLLECTION_MAX_ZIP_ENTRIES) throw new TypeError('ZIP entry count is outside the supported range.');
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (centralOffset + centralSize !== eocd || centralOffset > bytes.byteLength) throw new TypeError('ZIP central directory bounds are invalid.');
  let cursor = centralOffset;
  let totalUncompressed = 0;
  const files = new Map<string, Uint8Array>();
  const localRanges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50) throw new TypeError('ZIP central directory entry is invalid.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > eocd || nameLength === 0 || nameLength > 200) throw new TypeError('ZIP entry metadata bounds are invalid.');
    if ((flags & ~0x0800) !== 0 || ![0, 8].includes(method)) throw new TypeError('ZIP encryption, data descriptors, flags, or compression method are unsupported.');
    const path = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength), `ZIP entry ${index}`);
    if (!SAFE_ZIP_PATH_PATTERN.test(path) || path.includes('..') || path.includes('\\') || path.startsWith('/')) throw new TypeError('ZIP entry path is unsafe or unsupported.');
    if (files.has(path)) throw new TypeError('ZIP contains a duplicate path.');
    totalUncompressed += uncompressedSize;
    if (!Number.isSafeInteger(totalUncompressed) || totalUncompressed > FORGE_BATCH_COLLECTION_MAX_UTF8_BYTES) throw new TypeError('ZIP expanded content exceeds the collection limit.');
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) throw new TypeError('ZIP local header is invalid.');
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localChecksum = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset) throw new TypeError('ZIP compressed data bounds are invalid.');
    if (localNameLength === 0 || localNameLength > 200 || localOffset + 30 + localNameLength > centralOffset) throw new TypeError('ZIP local name bounds are invalid.');
    const localPath = decodeUtf8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength), `ZIP local entry ${index}`);
    if (localPath !== path || localFlags !== flags || localMethod !== method || localChecksum !== checksum
      || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
      throw new TypeError('ZIP local header does not match the central directory.');
    }
    const localEnd = dataOffset + compressedSize;
    if (localRanges.some((range) => localOffset < range.end && range.start < localEnd)) throw new TypeError('ZIP local entries overlap.');
    localRanges.push({ start: localOffset, end: localEnd });
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? new Uint8Array(compressed) : await inflateRaw(compressed, uncompressedSize);
    if (data.byteLength !== uncompressedSize || crc32(data) !== checksum) throw new TypeError('ZIP entry size or CRC does not match the central directory.');
    files.set(path, data);
    cursor = next;
  }
  if (cursor !== eocd) throw new TypeError('ZIP central directory has trailing records.');
  return files;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return offset;
  }
  throw new TypeError('ZIP end-of-central-directory record was not found.');
}

async function inflateRaw(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
  if (typeof DecompressionStreamCtor !== 'function') throw new TypeError('Deflate ZIP entries are unsupported in this browser.');
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      total += chunk.byteLength;
      if (total > expectedSize || total > FORGE_BATCH_COLLECTION_MAX_UTF8_BYTES) {
        await reader.cancel('expanded-size-limit');
        throw new TypeError('ZIP deflate output exceeds its declared or collection limit.');
      }
      parts.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return concatBytes(parts);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

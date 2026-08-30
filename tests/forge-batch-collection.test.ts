import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  serializeForgeIntakeReviewBundle,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import { decodeForgeIntakeReviewBundleText } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {
  FORGE_BATCH_COLLECTION_SCHEMA,
  createForgeBatchCollection,
  decodeForgeBatchCollectionText,
  decodeForgeBatchCollectionZip,
  encodeForgeBatchCollectionZip,
  serializeForgeBatchCollection,
} from '@fvtt-json-generator/forge-browser-runtime/batch-collection';

const CREATED_AT = '2026-08-30T10:00:00.000Z';

describe('Forge browser batch collection and ZIP contract', () => {
  test('round-trips a mixed Actor/Item collection with stable entry identities and order', () => {
    const collection = mixedCollection();
    const serialized = serializeForgeBatchCollection(collection);
    const decoded = decodeForgeBatchCollectionText(serialized);
    expect(decoded).toEqual(collection);
    expect(decoded.entries.map((entry) => [entry.objectKind, entry.mode, entry.sourceLabel])).toEqual([
      ['actor', 'plaintext-actor', 'Batch Rat'],
      ['item', 'ai-item', 'Batch Shield'],
    ]);
    expect(decoded.entries[0]!.id).toContain(hashSource('Rat source'));
    expect(decoded.entries[1]!.id).toContain(hashSource('Shield source'));
    expect(serializeForgeBatchCollection(decoded)).toBe(serialized);
  });

  test('strictly rejects unknown keys, identity drift, duplicates, kind/mode mismatch, and configured secrets', () => {
    const collection = mixedCollection();
    const json = JSON.parse(serializeForgeBatchCollection(collection));
    for (const changed of [
      { ...json, authorization: 'Bearer hidden' },
      { ...json, id: `collection:v1:${'0'.repeat(64)}` },
      { ...json, createdAt: '2026-08-30T10:00:01.000Z' },
      { ...json, entries: [{ ...json.entries[0], sourceLabel: 'silently changed label' }, ...json.entries.slice(1)] },
      { ...json, entries: [{ ...json.entries[0], objectKind: 'item' }] },
      { ...json, entries: [{ ...json.entries[0], rawSource: 'changed' }] },
      { ...json, entries: [json.entries[0], json.entries[0]] },
    ]) expect(() => decodeForgeBatchCollectionText(JSON.stringify(changed))).toThrow();
    expect(() => createForgeBatchCollection({
      label: 'Configured token',
      createdAt: CREATED_AT,
      forbiddenValues: ['configured-token'],
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Safe', rawSource: 'contains configured-token' }],
    })).toThrow(/configured secret/u);
    expect(() => createForgeBatchCollection({
      label: 'Unsafe',
      createdAt: CREATED_AT,
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Unsafe', rawSource: 'Authorization: Bearer hidden-value' }],
    })).toThrow(/safety scan/u);
  });

  test('requires an attached review to match the exact source, kind, mode, and hash', () => {
    const review = acceptedActorReview('review source');
    expect(createForgeBatchCollection({
      label: 'Reviewed',
      createdAt: CREATED_AT,
      entries: [{ objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Reviewed', rawSource: 'review source', review }],
    }).entries[0]!.review?.status).toBe('accepted');
    expect(() => createForgeBatchCollection({
      label: 'Mismatch',
      createdAt: CREATED_AT,
      entries: [{ objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Mismatch', rawSource: 'other source', review }],
    })).toThrow(/does not match/u);
  });

  test('exports a standard stored ZIP and reconstructs every source and review exactly', async () => {
    const review = acceptedActorReview('review source');
    const collection = createForgeBatchCollection({
      label: 'Portable mixed collection',
      createdAt: CREATED_AT,
      entries: [
        { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Reviewed Actor', rawSource: 'review source', review },
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item', rawSource: 'item source' },
      ],
    });
    const zip = await encodeForgeBatchCollectionZip(collection);
    expect(new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(0, true)).toBe(0x04034b50);
    const decoded = await decodeForgeBatchCollectionZip(zip);
    expect(decoded).toEqual(collection);
    expect(serializeForgeBatchCollection(decoded)).toBe(serializeForgeBatchCollection(collection));

    const deflated = await deflateStoredZip(zip);
    expect(await decodeForgeBatchCollectionZip(deflated)).toEqual(collection);
    const declaredTooSmall = new Uint8Array(deflated);
    const central = findSignature(declaredTooSmall, 0x02014b50);
    const view = new DataView(declaredTooSmall.buffer, declaredTooSmall.byteOffset, declaredTooSmall.byteLength);
    const local = view.getUint32(central + 42, true);
    view.setUint32(central + 24, 1, true);
    view.setUint32(local + 22, 1, true);
    await expect(decodeForgeBatchCollectionZip(declaredTooSmall)).rejects.toThrow(/deflate output exceeds/u);
  });

  test('rejects ZIP path drift, duplicate paths, local-header drift, unsupported methods, bombs, CRC tampering, and trailing records', async () => {
    const zip = await encodeForgeBatchCollectionZip(mixedCollection());
    const pathDrift = replaceZipEntryPath(zip, 'sources/0001.txt', 'sources/0001.bin');
    await expect(decodeForgeBatchCollectionZip(pathDrift)).rejects.toThrow(/unsafe|unsupported/u);

    const duplicate = replaceZipEntryPath(zip, 'sources/0002.txt', 'sources/0001.txt');
    await expect(decodeForgeBatchCollectionZip(duplicate)).rejects.toThrow(/duplicate/u);

    const localDrift = replaceLocalZipEntryPath(zip, 'sources/0001.txt', 'sources/0001.bin');
    await expect(decodeForgeBatchCollectionZip(localDrift)).rejects.toThrow(/local header/u);

    const unsupported = new Uint8Array(zip);
    const central = findSignature(unsupported, 0x02014b50);
    new DataView(unsupported.buffer, unsupported.byteOffset, unsupported.byteLength).setUint16(central + 10, 99, true);
    await expect(decodeForgeBatchCollectionZip(unsupported)).rejects.toThrow(/compression method/u);

    const bomb = new Uint8Array(zip);
    const bombCentral = findSignature(bomb, 0x02014b50);
    new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength).setUint32(bombCentral + 24, 64 * 1024 * 1024 + 1, true);
    await expect(decodeForgeBatchCollectionZip(bomb)).rejects.toThrow(/expanded content/u);

    const crcDrift = new Uint8Array(zip);
    const sourceOffset = findAscii(crcDrift, 'Rat source');
    expect(sourceOffset).toBeGreaterThan(0);
    crcDrift[sourceOffset] = crcDrift[sourceOffset]! ^ 1;
    await expect(decodeForgeBatchCollectionZip(crcDrift)).rejects.toThrow(/CRC/u);

    const trailing = new Uint8Array(zip.byteLength + 1);
    trailing.set(zip);
    await expect(decodeForgeBatchCollectionZip(trailing)).rejects.toThrow(/end-of-central/u);

  });
});

function mixedCollection() {
  return createForgeBatchCollection({
    label: 'Mixed Batch',
    createdAt: CREATED_AT,
    entries: [
      { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Batch Rat', rawSource: 'Rat source' },
      { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Batch Shield', rawSource: 'Shield source' },
    ],
  });
}

function acceptedActorReview(rawSource: string) {
  const requestId = 'batch-review-request';
  const attemptId = 'batch-review-attempt';
  const sourceId = 'actor:v1:123e4567-e89b-42d3-a456-426614174000';
  const canonicalSource = `---\nforge-source-id: ${sourceId}\n---\n${rawSource}`;
  return decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle({
    objectKind: 'actor',
    mode: 'ai-monster',
    requestId,
    attemptId,
    status: 'accepted',
    rawSource,
    rawSourceHash: hashSource(rawSource),
    candidate: { id: 'candidate', label: 'Reviewed Actor', start: 0, end: Math.min(3, rawSource.length), quote: rawSource.slice(0, 3) },
    deterministicFindings: [],
    aiReviewFindings: [],
    reviewVerdict: 'accepted',
    calls: { discovery: 1, extraction: 1, review: 1, repair: 0 },
    repairCount: 0,
    canonicalSource,
    sourceIdentity: { sourceId, finalSourceHash: hashSource(canonicalSource) },
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    candidateResponse: { requestId, status: 'accepted', artifactHash: hashSource('batch-artifact'), verificationStatus: 'accepted', diagnostics: [] },
    history: [],
  }))).bundle;
}

function replaceZipEntryPath(input: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('Replacement length must match.');
  const result = new Uint8Array(input);
  const fromBytes = new TextEncoder().encode(from);
  const toBytes = new TextEncoder().encode(to);
  const offsets: number[] = [];
  let offset = 0;
  while ((offset = findBytes(result, fromBytes, offset)) >= 0) { offsets.push(offset); offset += fromBytes.length; }
  if (offsets.length < 2) throw new Error('ZIP path did not appear in local and central records.');
  result.set(toBytes, offsets[offsets.length - 2]!);
  result.set(toBytes, offsets[offsets.length - 1]!);
  return result;
}

function replaceLocalZipEntryPath(input: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('Replacement length must match.');
  const result = new Uint8Array(input);
  const fromBytes = new TextEncoder().encode(from);
  const offsets: number[] = [];
  let offset = 0;
  while ((offset = findBytes(result, fromBytes, offset)) >= 0) { offsets.push(offset); offset += fromBytes.length; }
  if (offsets.length < 3) throw new Error('ZIP path did not appear in manifest, local, and central records.');
  result.set(new TextEncoder().encode(to), offsets[offsets.length - 2]!);
  return result;
}

function findSignature(input: Uint8Array, signature: number): number {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  for (let offset = 0; offset <= input.byteLength - 4; offset += 1) if (view.getUint32(offset, true) === signature) return offset;
  throw new Error(`ZIP signature ${signature.toString(16)} was not found.`);
}

async function deflateStoredZip(input: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const eocd = findSignature(input, 0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let centralCursor = view.getUint32(eocd + 16, true);
  const entries: Array<{ path: Uint8Array; data: Uint8Array; checksum: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(centralCursor + 28, true);
    const extraLength = view.getUint16(centralCursor + 30, true);
    const commentLength = view.getUint16(centralCursor + 32, true);
    const compressedSize = view.getUint32(centralCursor + 20, true);
    const localOffset = view.getUint32(centralCursor + 42, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({
      path: new Uint8Array(input.subarray(centralCursor + 46, centralCursor + 46 + nameLength)),
      data: new Uint8Array(input.subarray(dataOffset, dataOffset + compressedSize)),
      checksum: view.getUint32(centralCursor + 16, true),
    });
    centralCursor += 46 + nameLength + extraLength + commentLength;
  }
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const stream = new Blob([entry.data.slice().buffer]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const local = new Uint8Array(30 + entry.path.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 8, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true); lv.setUint32(14, entry.checksum, true);
    lv.setUint32(18, compressed.byteLength, true); lv.setUint32(22, entry.data.byteLength, true); lv.setUint16(26, entry.path.byteLength, true);
    local.set(entry.path, 30);
    localParts.push(local, compressed);
    const central = new Uint8Array(46 + entry.path.byteLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x0021, true); cv.setUint32(16, entry.checksum, true);
    cv.setUint32(20, compressed.byteLength, true); cv.setUint32(24, entry.data.byteLength, true); cv.setUint16(28, entry.path.byteLength, true);
    cv.setUint32(42, localOffset, true); central.set(entry.path, 46);
    centralParts.push(central);
    localOffset += local.byteLength + compressed.byteLength;
  }
  const central = concatTestBytes(centralParts);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, central.byteLength, true); ev.setUint32(16, localOffset, true);
  return concatTestBytes([...localParts, central, end]);
}

function concatTestBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function findAscii(input: Uint8Array, value: string): number {
  return findBytes(input, new TextEncoder().encode(value), 0);
}

function findBytes(input: Uint8Array, target: Uint8Array, start: number): number {
  outer: for (let index = start; index <= input.length - target.length; index += 1) {
    for (let inner = 0; inner < target.length; inner += 1) if (input[index + inner] !== target[inner]) continue outer;
    return index;
  }
  return -1;
}

expect(FORGE_BATCH_COLLECTION_SCHEMA).toBe('fvtt-json-forge-batch-collection');

import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  serializeForgeIntakeReviewBundle,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import { decodeForgeIntakeReviewBundleText } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import { serializeForgeIntakeReviewBundleV2 } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {
  FORGE_SOURCE_LIBRARY_MAX_SOURCES,
  FORGE_SOURCE_LIBRARY_SCHEMA,
  ForgeSourceLibraryConflictError,
  ManagedForgeSourceLibrary,
  MemoryForgeSourceLibraryStore,
  decodeForgeSourceLibraryText,
  decodeForgeSourceLibraryPortableText,
  emptyForgeSourceLibrary,
  importedReviewFromLibrary,
  mergeForgeSourceLibraries,
  searchForgeSourceLibrary,
  serializeForgeSourceLibrary,
  serializeForgeSourceLibrarySource,
  sourceLibraryRecordId,
  type ForgeSourceLibraryStore,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';

const TIMES = [
  '2026-08-30T08:00:00.000Z',
  '2026-08-30T08:01:00.000Z',
  '2026-08-30T08:02:00.000Z',
  '2026-08-30T08:03:00.000Z',
  '2026-08-30T08:04:00.000Z',
  '2026-08-30T08:05:00.000Z',
];

describe('Forge managed source library core', () => {
  test('persists, searches, opens, exports, and removes one source across manager sessions', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const first = manager(store);
    const saved = await first.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Night Rat', rawSource: 'Rat source' });
    expect(saved.revision).toBe(1);
    expect(saved.sources).toHaveLength(1);
    expect(saved.sources[0]!.id).toBe(sourceLibraryRecordId('actor', 'plaintext-actor', hashSource('Rat source')));

    const reopened = await manager(store).load();
    expect(searchForgeSourceLibrary(reopened, 'night plaintext')).toHaveLength(1);
    expect(searchForgeSourceLibrary(reopened, hashSource('Rat source').slice(0, 12))).toHaveLength(1);
    expect(serializeForgeSourceLibrarySource(reopened.sources[0]!)).toContain('"rawSource": "Rat source"');
    expect(decodeForgeSourceLibraryPortableText(serializeForgeSourceLibrarySource(reopened.sources[0]!)).sources[0]).toEqual(reopened.sources[0]);

    const deleted = await manager(store).deleteSource(reopened.sources[0]!.id);
    expect(deleted.sources).toEqual([]);
    expect((await manager(store).load()).sources).toEqual([]);
  });

  test('saves a normalized review beside its source and only reopens it through the E1 strict decoder', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const library = manager(store);
    const imported = acceptedReview('old-request', 'old-attempt', 'Rat source', 'Library Rat');
    const storedHash = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(imported.bundle)).normalizedBundleHash;
    const saved = await library.saveReview(imported);
    expect(saved.sources).toHaveLength(1);
    expect(saved.reviews).toHaveLength(1);
    expect(saved.reviews[0]!.id).toBe(storedHash);
    expect(saved.reviews[0]!.sourceRecordId).toBe(saved.sources[0]!.id);
    const reopened = importedReviewFromLibrary(saved.reviews[0]!);
    expect(reopened.normalizedBundleHash).toBe(storedHash);
    expect(reopened.bundle.status).toBe('accepted');
    expect(reopened.bundle).not.toHaveProperty('artifact');
    expect(searchForgeSourceLibrary(saved, 'accepted old-attempt')).toHaveLength(1);

    const idempotent = await library.saveReview(imported);
    expect(idempotent.reviews).toHaveLength(1);
    const withoutReview = await library.deleteReview(storedHash);
    expect(withoutReview.sources).toHaveLength(1);
    expect(withoutReview.reviews).toEqual([]);
  });

  test('deleting a source atomically cascades its historical reviews', async () => {
    const library = manager(new MemoryForgeSourceLibraryStore());
    const saved = await library.saveReview(acceptedReview('request-a', 'attempt-a', 'Rat source', 'Rat'));
    const deleted = await library.deleteSource(saved.sources[0]!.id);
    expect(deleted.sources).toEqual([]);
    expect(deleted.reviews).toEqual([]);
  });

  test('exports a stable strict envelope and atomically merges portable records', async () => {
    const one = manager(new MemoryForgeSourceLibraryStore());
    const two = manager(new MemoryForgeSourceLibraryStore());
    const sourceState = await one.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'One', rawSource: 'One source' });
    await two.saveReview(acceptedReview('request-two', 'attempt-two', 'Two source', 'Two'));
    const merged = await two.importText(serializeForgeSourceLibrary(sourceState));
    expect(merged.sources).toHaveLength(2);
    expect(searchForgeSourceLibrary(merged, 'One')).toHaveLength(1);
    expect(searchForgeSourceLibrary(merged, 'source')).toHaveLength(2);
    expect(decodeForgeSourceLibraryText(serializeForgeSourceLibrary(merged))).toEqual(merged);
  });

  test('rejects schema drift, unknown keys, identity drift, and review/source mismatch', () => {
    const empty = emptyForgeSourceLibrary();
    for (const mutation of [
      { ...empty, schema: 'other' },
      { ...empty, version: 2 },
      { ...empty, authorization: 'secret' },
    ]) expect(() => decodeForgeSourceLibraryText(JSON.stringify(mutation))).toThrow();

    const source = sourceFixture('Stable source');
    expect(() => decodeForgeSourceLibraryText(JSON.stringify({ ...empty, sources: [{ ...source, rawSource: 'Changed source' }] }))).toThrow(/hash/u);
    const imported = acceptedReview('request', 'attempt', 'Stable source', 'Stable');
    const review = reviewFixture(imported, source.id);
    expect(() => decodeForgeSourceLibraryText(JSON.stringify({ ...empty, sources: [source], reviews: [{ ...review, sourceRecordId: 'missing' }] }))).toThrow(/missing source/u);
    for (const changed of [
      { ...review, requestId: 'different-request' },
      { ...review, attemptId: 'different-attempt' },
      { ...review, status: 'needs_review' },
    ]) expect(() => decodeForgeSourceLibraryText(JSON.stringify({ ...empty, sources: [source], reviews: [changed] }))).toThrow(/metadata/u);
  });

  test('rejects credential-shaped source content and configured secret values without mutating the prior state', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const library = manager(store);
    await library.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Safe', rawSource: 'Safe source' });
    const before = serializeForgeSourceLibrary(await library.load());
    await expect(library.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Bad', rawSource: 'Authorization: Bearer secret-value' })).rejects.toThrow(/safety scan/u);
    await expect(library.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Bad', rawSource: 'contains configured-token', forbiddenValues: ['configured-token'] })).rejects.toThrow(/configured secret/u);
    await expect(library.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'configured-token', rawSource: 'safe label source', forbiddenValues: ['configured-token'] })).rejects.toThrow(/configured secret/u);
    await expect(library.saveReview(acceptedReview('secret-label-request', 'secret-label-attempt', 'safe review source', 'Safe'), 'configured-token', ['configured-token'])).rejects.toThrow(/configured secret/u);
    expect(serializeForgeSourceLibrary(await library.load())).toBe(before);
  });

  test('validates safe revision increments before storage and preserves saturated state', async () => {
    const librarySaturated = { ...emptyForgeSourceLibrary(), revision: Number.MAX_SAFE_INTEGER };
    const libraryStore = new MemoryForgeSourceLibraryStore(librarySaturated);
    await expect(manager(libraryStore).saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'New', rawSource: 'new source' })).rejects.toThrow(/revision limit/u);
    expect((await libraryStore.load()).revision).toBe(Number.MAX_SAFE_INTEGER);

    const source = { ...sourceFixture('saturated source'), revision: Number.MAX_SAFE_INTEGER };
    const sourceStore = new MemoryForgeSourceLibraryStore({ ...emptyForgeSourceLibrary(), sources: [source] });
    await expect(manager(sourceStore).saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Changed', rawSource: source.rawSource })).rejects.toThrow(/revision limit/u);
    expect((await sourceStore.load()).sources[0]!.revision).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('runs the authority guard after validation but before transactional replacement', async () => {
    const base = new MemoryForgeSourceLibraryStore();
    let replaceCalls = 0;
    let authorized = true;
    const guardedStore: ForgeSourceLibraryStore = {
      load: async () => {
        const state = await base.load();
        authorized = false;
        return state;
      },
      replace: async (expected, next) => {
        replaceCalls += 1;
        await base.replace(expected, next);
      },
    };
    await expect(manager(guardedStore).saveSource({
      objectKind: 'actor',
      mode: 'plaintext-actor',
      sourceLabel: 'Guarded',
      rawSource: 'guarded source',
      beforeCommit: () => { if (!authorized) throw new Error('GM authority changed.'); },
    })).rejects.toThrow(/authority/u);
    expect(replaceCalls).toBe(0);
    expect((await base.load()).sources).toEqual([]);
  });

  test('fails an entire merge on an identity conflict and preserves the stored revision', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const library = manager(store);
    const saved = await library.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Safe', rawSource: 'Same source' });
    const conflicting = {
      ...saved,
      sources: [{ ...saved.sources[0]!, rawSource: 'different bytes' }],
    };
    expect(() => mergeForgeSourceLibraries(saved, conflicting as any)).toThrow(ForgeSourceLibraryConflictError);
    expect((await library.load()).revision).toBe(saved.revision);
  });

  test('enforces source count before replacing storage', async () => {
    const state = emptyForgeSourceLibrary();
    const timestamp = '2026-08-30T08:00:00.000Z';
    state.sources = Array.from({ length: FORGE_SOURCE_LIBRARY_MAX_SOURCES + 1 }, (_, index) => sourceFixture(`Source ${index}`, timestamp));
    expect(() => decodeForgeSourceLibraryText(JSON.stringify(state))).toThrow(/entry limit/u);
  });

  test('uses optimistic revision comparison so stale writers cannot overwrite committed data', async () => {
    const store = new MemoryForgeSourceLibraryStore();
    const snapshot = await store.load();
    const next = { ...snapshot, revision: 1, updatedAt: TIMES[0]! };
    await store.replace(0, next);
    await expect(store.replace(0, { ...next, revision: 2 })).rejects.toThrow(ForgeSourceLibraryConflictError);
    expect((await store.load()).revision).toBe(1);
  });

  test('manager surfaces a stale transactional write and does not retry as last-write-wins', async () => {
    const base = new MemoryForgeSourceLibraryStore();
    const raceStore: ForgeSourceLibraryStore = {
      load: () => base.load(),
      replace: async (expected, next) => {
        const current = await base.load();
        await base.replace(current.revision, { ...current, revision: current.revision + 1, updatedAt: TIMES[4]! });
        await base.replace(expected, next);
      },
    };
    await expect(manager(raceStore).saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Race', rawSource: 'Race source' })).rejects.toThrow(ForgeSourceLibraryConflictError);
    expect((await base.load()).sources).toEqual([]);
  });

  test('releases an owned store when the manager closes', () => {
    let closed = 0;
    const store: ForgeSourceLibraryStore = {
      load: async () => emptyForgeSourceLibrary(),
      replace: async () => undefined,
      close: () => { closed += 1; },
    };
    manager(store).close();
    expect(closed).toBe(1);
  });
});

function manager(store: ForgeSourceLibraryStore): ManagedForgeSourceLibrary {
  let index = 0;
  return new ManagedForgeSourceLibrary(store, () => TIMES[Math.min(index++, TIMES.length - 1)]!);
}

function acceptedReview(requestId: string, attemptId: string, rawSource: string, sourceLabel: string) {
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
    candidate: { id: 'candidate', label: sourceLabel, start: 0, end: Math.min(3, rawSource.length), quote: rawSource.slice(0, 3) },
    deterministicFindings: [],
    aiReviewFindings: [],
    reviewVerdict: 'accepted',
    calls: { discovery: 1, extraction: 1, review: 1, repair: 0 },
    repairCount: 0,
    canonicalSource,
    sourceIdentity: { sourceId, finalSourceHash: hashSource(canonicalSource) },
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    candidateResponse: { requestId, status: 'accepted', artifactHash: hashSource(`artifact:${requestId}`), verificationStatus: 'accepted', diagnostics: [] },
    history: [],
  })));
}

function sourceFixture(rawSource: string, timestamp = TIMES[0]!) {
  const rawSourceHash = hashSource(rawSource);
  return {
    schema: 'fvtt-json-forge-source-library-source' as const,
    version: 1 as const,
    id: sourceLibraryRecordId('actor', 'plaintext-actor', rawSourceHash),
    objectKind: 'actor' as const,
    mode: 'plaintext-actor' as const,
    sourceLabel: rawSource,
    rawSource,
    rawSourceHash,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function reviewFixture(imported: ReturnType<typeof acceptedReview>, sourceRecordId: string) {
  const stored = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(imported.bundle));
  return {
    id: stored.normalizedBundleHash,
    sourceRecordId,
    requestId: imported.bundle.requestId,
    attemptId: imported.bundle.attemptId,
    status: imported.bundle.status,
    savedAt: TIMES[0]!,
    bundle: imported.bundle,
  };
}

expect(FORGE_SOURCE_LIBRARY_SCHEMA).toBe('fvtt-json-forge-source-library');

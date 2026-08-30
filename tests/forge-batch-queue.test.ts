import { describe, expect, test } from 'bun:test';
import { hashArtifact, hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeBatchCollection } from '@fvtt-json-generator/forge-browser-runtime/batch-collection';
import {
  ForgeBatchQueueConflictError,
  ManagedForgeBatchQueue,
  MemoryForgeBatchQueueStore,
  createForgeBatchApplyManifest,
  decodeForgeBatchQueueText,
  serializeForgeBatchQueue,
  type ForgeBatchQueueStore,
} from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import { buildForgeIntakeReviewBundle, serializeForgeIntakeReviewBundle } from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import { decodeForgeIntakeReviewBundleText } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';

const TIMES = [
  '2026-08-30T11:00:00.000Z',
  '2026-08-30T11:01:00.000Z',
  '2026-08-30T11:02:00.000Z',
  '2026-08-30T11:03:00.000Z',
  '2026-08-30T11:04:00.000Z',
  '2026-08-30T11:05:00.000Z',
  '2026-08-30T11:06:00.000Z',
  '2026-08-30T11:07:00.000Z',
];

describe('Forge browser-local batch queue core', () => {
  test('imports a mixed collection once and preserves ordered independent jobs across sessions', async () => {
    const store = new MemoryForgeBatchQueueStore();
    const queue = manager(store);
    const imported = await queue.importCollection(collection());
    expect(imported.revision).toBe(1);
    expect(imported.jobs.map((job) => [job.ordinal, job.status])).toEqual([[0, 'pending'], [1, 'pending']]);
    const idempotent = await queue.importCollection(collection());
    expect(idempotent.revision).toBe(1);
    expect(decodeForgeBatchQueueText(serializeForgeBatchQueue(await manager(store).load()))).toEqual(imported);
  });

  test('runs one job through accepted proof and explicit apply while leaving its sibling untouched', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const actorJob = state.jobs[0]!;
    state = await queue.startJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('running');
    expect(state.jobs[1]!.status).toBe('pending');
    const review = importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted');
    state = await queue.settleJob(actorJob.id, review);
    expect(state.jobs[0]!.status).toBe('accepted');
    const candidate = {
      jobId: actorJob.id,
      objectKind: 'actor' as const,
      sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000',
      sourceHash: hashSource(`---\nforge-source-id: actor:v1:123e4567-e89b-42d3-a456-426614174000\n---\ncanonical actor source`),
      artifactHash: hashSource('actor artifact'),
      documentId: hashArtifact({ sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000' }).slice(0, 16),
      target: { fvttVersion: '14.364', systemId: 'dnd5e' as const, systemVersion: '5.3.3', generatorProfile: 'v14' as const, effectProfile: 'core' as const, iconMode: 'off' as const },
    };
    const manifest = createForgeBatchApplyManifest(state, [candidate], TIMES[3]);
    expect(manifest.items).toEqual([candidate]);
    expect(manifest.id).toMatch(/^apply:v1:[0-9a-f]{64}$/u);
    expect(() => createForgeBatchApplyManifest(state, [{ ...candidate, artifactHash: hashSource('wrong') }], TIMES[3])).toThrow(/identity.*accepted proof/u);
    expect(() => createForgeBatchApplyManifest(state, [{ ...candidate, documentId: '0'.repeat(16) }], TIMES[3])).toThrow(/deterministic Forge identity/u);
    expect(() => createForgeBatchApplyManifest(state, [{ ...candidate, target: { ...candidate.target, fvttVersion: '14.365' } }], TIMES[3])).toThrow(/exact Task E runtime/u);
    state = await queue.beginApply(actorJob.id);
    expect(state.jobs[0]!.status).toBe('applying');
    state = await queue.finishApply(actorJob.id, {
      status: 'created',
      objectKind: 'actor',
      uuid: `Actor.${candidate.documentId}`,
      sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000',
      sourceHash: hashSource(`---\nforge-source-id: actor:v1:123e4567-e89b-42d3-a456-426614174000\n---\ncanonical actor source`),
      artifactHash: hashSource('actor artifact'),
    });
    expect(state.jobs[0]!.status).toBe('applied');
    expect(state.jobs[0]!.applyResult?.status).toBe('created');
    expect(state.jobs[1]!.status).toBe('pending');
    const forgedApply = JSON.parse(serializeForgeBatchQueue(state));
    forgedApply.jobs[0].applyResult.artifactHash = hashSource('forged artifact');
    expect(() => decodeForgeBatchQueueText(JSON.stringify(forgedApply))).toThrow(/does not match accepted proof/u);
    const forgedUuid = JSON.parse(serializeForgeBatchQueue(state));
    forgedUuid.jobs[0].applyResult.uuid = 'Actor.0000000000000000';
    expect(() => decodeForgeBatchQueueText(JSON.stringify(forgedUuid))).toThrow(/deterministic UUID/u);
  });

  test('permits an explicit accepted-job restart while preserving proof and concurrency 1', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const actorJob = state.jobs[0]!;
    state = await queue.startJob(actorJob.id);
    state = await queue.settleJob(actorJob.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted'));
    const acceptedProof = state.jobs[0]!.latestReview;

    state = await queue.startJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('running');
    expect(state.jobs[0]!.attemptCount).toBe(2);
    expect(state.jobs[0]!.latestReview).toEqual(acceptedProof);
    expect(state.jobs[0]!.applyResult).toBeUndefined();
    expect(state.jobs[1]!.status).toBe('pending');
  });

  test('recovers an apply-failed job only through an explicit fresh run while preserving its prior proof', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const actorJob = state.jobs[0]!;
    state = await queue.startJob(actorJob.id);
    state = await queue.settleJob(actorJob.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted'));
    const acceptedProof = state.jobs[0]!.latestReview;
    state = await queue.beginApply(actorJob.id);
    state = await queue.finishApply(actorJob.id, {
      status: 'failed', objectKind: 'actor', message: 'readback did not match',
    });
    expect(state.jobs[0]!.status).toBe('apply_failed');
    expect(state.jobs[0]!.applyResult?.status).toBe('failed');

    state = await queue.startJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('running');
    expect(state.jobs[0]!.attemptCount).toBe(2);
    expect(state.jobs[0]!.latestReview).toEqual(acceptedProof);
    expect(state.jobs[0]!.applyResult).toBeUndefined();
    expect(state.jobs[0]!.lastError).toBeUndefined();
  });

  test('keeps per-job cancellation out of work until an explicit requeue while preserving safe review proof', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const actorJob = state.jobs[0]!;
    state = await queue.cancelJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('cancelled');
    expect(state.jobs[0]!.attemptCount).toBe(0);
    expect(state.jobs[0]!.lastError).toContain('显式恢复');
    expect(state.jobs[1]!.status).toBe('pending');

    state = await queue.requeueJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('pending');
    expect(state.jobs[0]!.attemptCount).toBe(0);
    state = await queue.startJob(actorJob.id);
    state = await queue.settleJob(actorJob.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted'));
    const proof = state.jobs[0]!.latestReview;
    state = await queue.cancelJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('cancelled');
    expect(state.jobs[0]!.latestReview).toEqual(proof);
    state = await queue.requeueJob(actorJob.id);
    expect(state.jobs[0]!.status).toBe('pending');
    expect(state.jobs[0]!.latestReview).toEqual(proof);
    expect(state.jobs[0]!.attemptCount).toBe(1);
  });

  test('recovers running and applying jobs as interrupted without fabricating completion or retry', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const first = state.jobs[0]!;
    const second = state.jobs[1]!;
    state = await queue.startJob(first.id);
    state = await queue.settleJob(first.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted'));
    state = await queue.beginApply(first.id);
    expect(state.jobs.map((job) => job.status)).toEqual(['applying', 'pending']);
    const recovered = await queue.recoverInterrupted();
    expect(recovered.jobs.map((job) => job.status)).toEqual(['interrupted', 'pending']);
    expect(recovered.jobs[0]!.latestReview?.status).toBe('accepted');
    expect(recovered.jobs[0]!.applyResult).toBeUndefined();
    expect(recovered.jobs[1]!.latestReview).toBeUndefined();
    expect(recovered.jobs[0]!.lastError).toContain('identity');

    const resumed = await queue.startJob(second.id);
    await expect(queue.startJob(first.id)).rejects.toThrow(/concurrency.*1/u);
    expect(resumed.jobs[1]!.status).toBe('running');
    const recoveredRunning = await queue.recoverInterrupted();
    expect(recoveredRunning.jobs[1]!.status).toBe('interrupted');
    expect(recoveredRunning.jobs[1]!.lastError).toContain('自动重发');
  });

  test('isolates needs-review and failed outcomes and requires an exact source-bound review', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const actor = state.jobs[0]!;
    const item = state.jobs[1]!;
    state = await queue.startJob(actor.id);
    state = await queue.settleJob(actor.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'needs_review'));
    state = await queue.startJob(item.id);
    state = await queue.settleJob(item.id, importedReview('Shield source', 'ai-item', 'item', 'failed'));
    expect(state.jobs.map((job) => job.status)).toEqual(['needs_review', 'failed']);
    await queue.startJob(actor.id);
    await expect(queue.settleJob(actor.id, importedReview('different source', 'plaintext-actor', 'actor', 'accepted'))).rejects.toThrow(/does not match/u);
  });

  test('rejects secrets, stale optimistic writers, unsafe counters, and inconsistent persisted states atomically', async () => {
    const base = new MemoryForgeBatchQueueStore();
    const first = manager(base);
    const initial = await first.importCollection(collection());
    const staleStore: ForgeBatchQueueStore = {
      load: async () => initial,
      replace: async (expected, next) => await base.replace(expected, next),
    };
    await first.startJob(initial.jobs[0]!.id);
    await expect(manager(staleStore).startJob(initial.jobs[1]!.id)).rejects.toThrow(ForgeBatchQueueConflictError);
    expect((await first.load()).jobs[1]!.status).toBe('pending');

    const secretCollection = createForgeBatchCollection({
      label: 'Secret',
      createdAt: TIMES[0],
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Secret', rawSource: 'contains configured-token' }],
    });
    await expect(first.importCollection(secretCollection, ['configured-token'])).rejects.toThrow(/configured secret/u);
    const before = await first.load();
    const invalid = JSON.parse(serializeForgeBatchQueue(before));
    invalid.jobs[0].status = 'accepted';
    delete invalid.jobs[0].latestReview;
    expect(() => decodeForgeBatchQueueText(JSON.stringify(invalid))).toThrow(/latest review status|accepted proof/u);
    const concurrent = JSON.parse(serializeForgeBatchQueue(before));
    concurrent.jobs[0].status = 'running';
    concurrent.jobs[1].status = 'running';
    concurrent.jobs[0].attemptCount = 1;
    concurrent.jobs[1].attemptCount = 1;
    expect(() => decodeForgeBatchQueueText(JSON.stringify(concurrent))).toThrow(/concurrency 1/u);
    expect(await first.load()).toEqual(before);
  });

  test('deleting one collection cascades only its owned jobs', async () => {
    const queue = manager(new MemoryForgeBatchQueueStore());
    let state = await queue.importCollection(collection());
    const other = createForgeBatchCollection({
      label: 'Other', createdAt: TIMES[1],
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Other', rawSource: 'Other source' }],
    });
    state = await queue.importCollection(other);
    state = await queue.removeCollection(state.collections[0]!.id);
    expect(state.collections.map((entry) => entry.id)).toEqual([other.id]);
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]!.collectionId).toBe(other.id);
  });

  test('strict-imports a portable queue atomically and rejects conflicting job history', async () => {
    const source = manager(new MemoryForgeBatchQueueStore());
    let exported = await source.importCollection(collection());
    exported = await source.startJob(exported.jobs[0]!.id);
    exported = await source.settleJob(exported.jobs[0]!.id, importedReview('Rat source', 'plaintext-actor', 'actor', 'accepted'));
    const text = serializeForgeBatchQueue(exported);
    const target = manager(new MemoryForgeBatchQueueStore());
    const imported = await target.importQueueText(text);
    expect(imported.collections).toEqual(exported.collections);
    expect(imported.jobs).toEqual(exported.jobs);
    expect((await target.importQueueText(text)).revision).toBe(imported.revision);
    const conflicting = JSON.parse(text);
    conflicting.jobs[0].status = 'interrupted';
    await expect(target.importQueueText(JSON.stringify(conflicting))).rejects.toThrow(/conflicts/u);
    expect((await target.load()).jobs).toEqual(imported.jobs);
  });
});

function manager(store: ForgeBatchQueueStore): ManagedForgeBatchQueue {
  let index = 0;
  return new ManagedForgeBatchQueue(store, () => TIMES[Math.min(index++, TIMES.length - 1)]!);
}

function collection() {
  return createForgeBatchCollection({
    label: 'Queue Collection', createdAt: TIMES[0],
    entries: [
      { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Rat', rawSource: 'Rat source' },
      { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Shield', rawSource: 'Shield source' },
    ],
  });
}

function importedReview(rawSource: string, mode: 'plaintext-actor' | 'ai-item', objectKind: 'actor' | 'item', status: 'accepted' | 'needs_review' | 'failed') {
  const requestId = `queue-${objectKind}-${status}`;
  const attemptId = `${requestId}:attempt-1`;
  const accepted = status === 'accepted';
  const sourceId = objectKind === 'actor'
    ? 'actor:v1:123e4567-e89b-42d3-a456-426614174000'
    : 'item:v1:123e4567-e89b-42d3-a456-426614174000';
  const canonicalSource = `---\nforge-source-id: ${sourceId}\n---\ncanonical ${objectKind} source`;
  return decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle({
    objectKind,
    mode,
    requestId,
    attemptId,
    status,
    rawSource,
    rawSourceHash: hashSource(rawSource),
    deterministicFindings: accepted ? [] : [{ id: 'finding', code: 'REVIEW_REQUIRED', path: objectKind, message: 'Review required.', blocking: true, origin: 'deterministic', evidence: [] }],
    aiReviewFindings: [],
    ...(accepted ? { reviewVerdict: 'accepted' as const } : {}),
    calls: { discovery: 0, extraction: 0, review: 0, repair: 0 },
    repairCount: 0,
    ...(accepted ? { canonicalSource, sourceIdentity: { sourceId, finalSourceHash: hashSource(canonicalSource) } } : {}),
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    ...(accepted ? { candidateResponse: { requestId, status: 'accepted' as const, artifactHash: hashSource(`${objectKind} artifact`), verificationStatus: 'accepted' as const, diagnostics: [] } } : {}),
    history: [],
  })));
}

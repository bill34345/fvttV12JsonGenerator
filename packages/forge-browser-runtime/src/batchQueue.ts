import { hashArtifact, hashSource, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
  type ForgeIntakeReviewBundleV2,
  type ImportedForgeIntakeReviewRecord,
} from './intakeReviewImport';
import type { ForgeIntakeObjectKind } from './intakeReview';
import {
  FORGE_BATCH_COLLECTION_MAX_ENTRIES,
  decodeForgeBatchCollectionText,
  serializeForgeBatchCollection,
  type ForgeBatchCollectionEntryV1,
  type ForgeBatchCollectionV1,
} from './batchCollection';
import { assertConfiguredSecretsAbsent } from './sourceLibrary';

export const FORGE_BATCH_QUEUE_SCHEMA = 'fvtt-json-forge-batch-queue' as const;
export const FORGE_BATCH_QUEUE_VERSION = 1 as const;
export const FORGE_BATCH_QUEUE_MAX_COLLECTIONS = 50;
export const FORGE_BATCH_QUEUE_MAX_JOBS = 2_000;
export const FORGE_BATCH_QUEUE_MAX_UTF8_BYTES = 64 * 1024 * 1024;
export const FORGE_BATCH_APPLY_MANIFEST_SCHEMA = 'fvtt-json-forge-batch-apply-manifest' as const;

const QUEUE_KEYS = new Set(['schema', 'version', 'revision', 'updatedAt', 'collections', 'jobs']);
const JOB_KEYS = new Set(['schema', 'version', 'id', 'collectionId', 'entryId', 'ordinal', 'status', 'attemptCount', 'updatedAt', 'latestReview', 'lastError', 'applyResult']);
const APPLY_RESULT_KEYS = new Set(['status', 'objectKind', 'uuid', 'sourceId', 'sourceHash', 'artifactHash', 'message', 'at']);
const STATUSES = ['pending', 'running', 'interrupted', 'accepted', 'needs_review', 'failed', 'rejected', 'cancelled', 'applying', 'applied', 'apply_failed'] as const;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const JOB_ID_PATTERN = /^job:v1:[0-9a-f]{64}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type ForgeBatchJobStatus = typeof STATUSES[number];

export interface ForgeBatchApplyResultV1 {
  status: 'created' | 'existing' | 'failed';
  objectKind: ForgeIntakeObjectKind;
  uuid?: string;
  sourceId?: string;
  sourceHash?: Sha256;
  artifactHash?: Sha256;
  message?: string;
  at: string;
}

export interface ForgeBatchJobV1 {
  schema: 'fvtt-json-forge-batch-job';
  version: 1;
  id: string;
  collectionId: string;
  entryId: string;
  ordinal: number;
  status: ForgeBatchJobStatus;
  attemptCount: number;
  updatedAt: string;
  latestReview?: ForgeIntakeReviewBundleV2;
  lastError?: string;
  applyResult?: ForgeBatchApplyResultV1;
}

export interface ForgeBatchQueueV1 {
  schema: typeof FORGE_BATCH_QUEUE_SCHEMA;
  version: typeof FORGE_BATCH_QUEUE_VERSION;
  revision: number;
  updatedAt: string;
  collections: ForgeBatchCollectionV1[];
  jobs: ForgeBatchJobV1[];
}

export interface ForgeBatchApplyCandidate {
  jobId: string;
  objectKind: ForgeIntakeObjectKind;
  sourceId: string;
  sourceHash: Sha256;
  artifactHash: Sha256;
  documentId: string;
  target: {
    fvttVersion: string;
    systemId: 'dnd5e';
    systemVersion: string;
    generatorProfile: 'v14';
    effectProfile: 'core';
    iconMode: 'off';
  };
}

export interface ForgeBatchApplyManifestV1 {
  schema: typeof FORGE_BATCH_APPLY_MANIFEST_SCHEMA;
  version: 1;
  id: string;
  queueRevision: number;
  createdAt: string;
  items: ForgeBatchApplyCandidate[];
}

export interface ForgeBatchQueueStore {
  load(): Promise<Readonly<ForgeBatchQueueV1>>;
  replace(expectedRevision: number, next: Readonly<ForgeBatchQueueV1>, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<void>;
  subscribe?(listener: () => void): () => void;
  close?(): void;
}

export type ForgeBatchQueueCommitGuard = () => void;

export class ForgeBatchQueueConflictError extends Error {
  constructor(message = 'Batch queue changed in another window; refresh and retry.') {
    super(message);
    this.name = 'ForgeBatchQueueConflictError';
  }
}

export class ManagedForgeBatchQueue {
  constructor(
    private readonly store: ForgeBatchQueueStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  subscribe(listener: () => void): () => void { return this.store.subscribe?.(listener) ?? (() => undefined); }
  close(): void { this.store.close?.(); }

  async load(): Promise<Readonly<ForgeBatchQueueV1>> {
    return decodeForgeBatchQueueText(serializeForgeBatchQueue(await this.store.load()));
  }

  async recoverInterrupted(beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.mutate((current, timestamp) => ({
      ...current,
      jobs: current.jobs.map((job) => ['running', 'applying'].includes(job.status) ? {
        ...job,
        status: 'interrupted' as const,
        updatedAt: timestamp,
        lastError: job.status === 'applying'
          ? '页面在 apply 结算前关闭；请检查确定性世界 identity，并在重新生成当前 accepted response 后显式重试。'
          : '页面关闭或刷新中断了当前任务；不会自动重发 Provider 请求。',
      } : job),
    }), { beforeCommit });
  }

  async importCollection(
    collection: Readonly<ForgeBatchCollectionV1>,
    forbiddenValues: readonly string[] = [],
    beforeCommit?: ForgeBatchQueueCommitGuard,
  ): Promise<Readonly<ForgeBatchQueueV1>> {
    const incoming = decodeForgeBatchCollectionText(serializeForgeBatchCollection(collection, forbiddenValues), forbiddenValues);
    return await this.mutate((current, timestamp) => {
      const existing = current.collections.find((entry) => entry.id === incoming.id);
      if (existing && serializeForgeBatchCollection(existing) !== serializeForgeBatchCollection(incoming)) {
        throw new ForgeBatchQueueConflictError('Collection ID conflicts with different normalized content.');
      }
      if (existing) return current;
      if (current.collections.length >= FORGE_BATCH_QUEUE_MAX_COLLECTIONS) throw new RangeError('Batch queue collection limit reached.');
      if (current.jobs.length + incoming.entries.length > FORGE_BATCH_QUEUE_MAX_JOBS) throw new RangeError('Batch queue job limit reached.');
      const jobs = incoming.entries.map((entry, index) => jobFromEntry(incoming, entry, index, timestamp));
      return { ...current, collections: [...current.collections, incoming], jobs: [...current.jobs, ...jobs] };
    }, { forbiddenValues, beforeCommit });
  }

  async importQueueText(
    text: string,
    forbiddenValues: readonly string[] = [],
    beforeCommit?: ForgeBatchQueueCommitGuard,
  ): Promise<Readonly<ForgeBatchQueueV1>> {
    const incoming = decodeForgeBatchQueueText(text, forbiddenValues);
    return await this.mutate((current) => {
      const collections = [...current.collections];
      for (const collection of incoming.collections) {
        const existing = collections.find((entry) => entry.id === collection.id);
        if (existing) {
          if (serializeForgeBatchCollection(existing) !== serializeForgeBatchCollection(collection)) throw new ForgeBatchQueueConflictError('Imported collection conflicts with different normalized content.');
        } else collections.push(collection);
      }
      const jobs = [...current.jobs];
      for (const job of incoming.jobs) {
        const existing = jobs.find((entry) => entry.id === job.id);
        if (existing) {
          if (stableStringify(existing) !== stableStringify(job)) throw new ForgeBatchQueueConflictError('Imported job conflicts with different persisted state.');
        } else jobs.push(job);
      }
      if (collections.length > FORGE_BATCH_QUEUE_MAX_COLLECTIONS || jobs.length > FORGE_BATCH_QUEUE_MAX_JOBS) throw new RangeError('Imported queue exceeds collection or job bounds.');
      return { ...current, collections, jobs };
    }, { forbiddenValues, beforeCommit });
  }

  async startJob(id: string, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.mutate((current, timestamp) => {
      if (current.jobs.some((job) => job.id !== id && ['running', 'applying'].includes(job.status))) {
        throw new TypeError('Batch queue concurrency is fixed at 1; another job is active.');
      }
      const index = current.jobs.findIndex((job) => job.id === id);
      if (index < 0) throw new TypeError(`Batch job ${id} was not found.`);
      const job = current.jobs[index]!;
      if (!['pending', 'interrupted', 'accepted', 'needs_review', 'failed', 'rejected', 'cancelled', 'apply_failed'].includes(job.status)) throw new TypeError(`Job ${id} cannot start from ${job.status}.`);
      const jobs = [...current.jobs];
      jobs[index] = {
        ...job,
        status: 'running',
        attemptCount: increment(job.attemptCount, 'job attempt count'),
        updatedAt: timestamp,
        lastError: undefined,
        applyResult: undefined,
      };
      return { ...current, jobs };
    }, { beforeCommit });
  }

  async cancelJob(id: string, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.updateJob(id, (job, _entry, timestamp) => {
      if (job.status === 'cancelled') return job;
      if (!['pending', 'interrupted', 'accepted', 'needs_review', 'failed', 'rejected'].includes(job.status)) {
        throw new TypeError(`Job ${id} cannot be cancelled from ${job.status}.`);
      }
      return {
        ...job,
        status: 'cancelled',
        updatedAt: timestamp,
        lastError: 'GM 已取消此 job；只有显式恢复为 pending 后才会再次运行。',
        applyResult: undefined,
      };
    }, { beforeCommit });
  }

  async requeueJob(id: string, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.updateJob(id, (job, _entry, timestamp) => {
      if (job.status !== 'cancelled') throw new TypeError(`Job ${id} cannot be requeued from ${job.status}.`);
      return { ...job, status: 'pending', updatedAt: timestamp, lastError: undefined, applyResult: undefined };
    }, { beforeCommit });
  }

  async settleJob(
    id: string,
    imported: ImportedForgeIntakeReviewRecord,
    forbiddenValues: readonly string[] = [],
    beforeCommit?: ForgeBatchQueueCommitGuard,
  ): Promise<Readonly<ForgeBatchQueueV1>> {
    const normalized = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(imported.bundle)).bundle;
    return await this.updateJob(id, (job, entry, timestamp) => {
      if (job.status !== 'running') throw new TypeError(`Job ${id} is not running.`);
      assertReviewEntry(normalized, entry, `job ${id}`);
      return {
        ...job,
        status: reviewStatus(normalized),
        updatedAt: timestamp,
        latestReview: normalized,
        lastError: normalized.status === 'failed' ? 'Review attempt failed; inspect the persisted safe review record.' : undefined,
      };
    }, { forbiddenValues, beforeCommit });
  }

  async interruptJob(id: string, message = '任务已中断；不会自动重发 Provider 请求。', beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.updateJob(id, (job, _entry, timestamp) => {
      if (job.status !== 'running') return job;
      return { ...job, status: 'interrupted', updatedAt: timestamp, lastError: safeMessage(message) };
    }, { beforeCommit });
  }

  async beginApply(id: string, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.updateJob(id, (job, _entry, timestamp) => {
      if (job.status !== 'accepted' || job.latestReview?.status !== 'accepted') throw new TypeError(`Job ${id} has no persisted accepted proof.`);
      return { ...job, status: 'applying', updatedAt: timestamp, lastError: undefined, applyResult: undefined };
    }, { beforeCommit });
  }

  async finishApply(id: string, result: Omit<ForgeBatchApplyResultV1, 'at'>, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.updateJob(id, (job, entry, timestamp) => {
      if (job.status !== 'applying' || job.latestReview?.status !== 'accepted') throw new TypeError(`Job ${id} is not applying from accepted proof.`);
      if (result.objectKind !== entry.objectKind) throw new TypeError('Apply result object kind does not match the queue entry.');
      const proof = job.latestReview;
      if (result.status !== 'failed' && (
        result.sourceId !== proof.sourceIdentity?.sourceId
        || result.sourceHash !== proof.sourceIdentity?.finalSourceHash
        || result.artifactHash !== proof.candidateResponse?.artifactHash
      )) throw new TypeError('Apply result identity does not match the persisted accepted proof.');
      if (result.status !== 'failed' && result.uuid !== deterministicDocumentUuid(entry.objectKind, result.sourceId!)) {
        throw new TypeError('Apply result UUID does not match the deterministic Forge Document identity.');
      }
      const applyResult = decodeApplyResult({ ...result, at: timestamp }, '$/applyResult');
      return {
        ...job,
        status: result.status === 'failed' ? 'apply_failed' : 'applied',
        updatedAt: timestamp,
        applyResult,
        lastError: result.status === 'failed' ? safeMessage(result.message ?? 'World apply failed.') : undefined,
      };
    }, { beforeCommit });
  }

  async removeCollection(id: string, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.mutate((current) => ({
      ...current,
      collections: current.collections.filter((collection) => collection.id !== id),
      jobs: current.jobs.filter((job) => job.collectionId !== id),
    }), { beforeCommit });
  }

  private async updateJob(
    id: string,
    update: (job: ForgeBatchJobV1, entry: ForgeBatchCollectionEntryV1, timestamp: string) => ForgeBatchJobV1,
    options: { forbiddenValues?: readonly string[]; beforeCommit?: ForgeBatchQueueCommitGuard } = {},
  ): Promise<Readonly<ForgeBatchQueueV1>> {
    return await this.mutate((current, timestamp) => {
      const index = current.jobs.findIndex((job) => job.id === id);
      if (index < 0) throw new TypeError(`Batch job ${id} was not found.`);
      const job = current.jobs[index]!;
      const collection = current.collections.find((entry) => entry.id === job.collectionId);
      const entry = collection?.entries.find((candidate) => candidate.id === job.entryId);
      if (!entry) throw new TypeError(`Batch job ${id} has no source entry.`);
      const jobs = [...current.jobs];
      jobs[index] = update(job, entry, timestamp);
      return { ...current, jobs };
    }, options);
  }

  private async mutate(
    change: (current: ForgeBatchQueueV1, timestamp: string) => ForgeBatchQueueV1,
    options: { forbiddenValues?: readonly string[]; beforeCommit?: ForgeBatchQueueCommitGuard } = {},
  ): Promise<Readonly<ForgeBatchQueueV1>> {
    const current = decodeForgeBatchQueueText(serializeForgeBatchQueue(await this.store.load()));
    const timestamp = iso(this.now(), 'current time');
    const changed = change(thaw(current), timestamp);
    const same = serializeForgeBatchQueue({ ...current, revision: 0, updatedAt: timestamp })
      === serializeForgeBatchQueue({ ...changed, revision: 0, updatedAt: timestamp });
    if (same) return current;
    const next = { ...changed, revision: increment(current.revision, 'batch queue revision'), updatedAt: timestamp };
    const serialized = serializeForgeBatchQueue(next);
    assertConfiguredSecretsAbsent(serialized, options.forbiddenValues ?? []);
    const validated = decodeForgeBatchQueueText(serialized, options.forbiddenValues ?? []);
    options.beforeCommit?.();
    await this.store.replace(current.revision, validated, options.beforeCommit);
    return validated;
  }
}

export class MemoryForgeBatchQueueStore implements ForgeBatchQueueStore {
  private state: ForgeBatchQueueV1;
  private readonly listeners = new Set<() => void>();
  constructor(initial: ForgeBatchQueueV1 = emptyForgeBatchQueue()) { this.state = thaw(decodeForgeBatchQueueText(serializeForgeBatchQueue(initial))); }
  async load(): Promise<Readonly<ForgeBatchQueueV1>> { return decodeForgeBatchQueueText(serializeForgeBatchQueue(this.state)); }
  async replace(expectedRevision: number, next: Readonly<ForgeBatchQueueV1>, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<void> {
    if (this.state.revision !== expectedRevision) throw new ForgeBatchQueueConflictError();
    beforeCommit?.();
    this.state = thaw(decodeForgeBatchQueueText(serializeForgeBatchQueue(next)));
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close(): void { this.listeners.clear(); }
}

export function emptyForgeBatchQueue(): ForgeBatchQueueV1 {
  return { schema: FORGE_BATCH_QUEUE_SCHEMA, version: 1, revision: 0, updatedAt: '1970-01-01T00:00:00.000Z', collections: [], jobs: [] };
}

export function serializeForgeBatchQueue(queue: Readonly<ForgeBatchQueueV1>, forbiddenValues: readonly string[] = []): string {
  const serialized = stableStringify(queue);
  assertQueueSize(serialized);
  assertConfiguredSecretsAbsent(serialized, forbiddenValues);
  return serialized;
}

export function decodeForgeBatchQueueText(text: string, forbiddenValues: readonly string[] = []): Readonly<ForgeBatchQueueV1> {
  assertQueueSize(text);
  assertConfiguredSecretsAbsent(text, forbiddenValues);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('Batch queue JSON is invalid.'); }
  const root = exactRecord(parsed, '$', QUEUE_KEYS);
  if (root.schema !== FORGE_BATCH_QUEUE_SCHEMA || root.version !== 1) throw new TypeError('Batch queue schema/version is unsupported.');
  const revision = nonNegativeInteger(root.revision, '$/revision');
  const updatedAt = iso(root.updatedAt, '$/updatedAt');
  const collectionsRaw = boundedArray(root.collections, '$/collections', 0, FORGE_BATCH_QUEUE_MAX_COLLECTIONS);
  const collections = collectionsRaw.map((collection) => thaw(decodeForgeBatchCollectionText(JSON.stringify(collection))));
  assertUnique(collections.map((collection) => collection.id), 'collection IDs');
  const jobsRaw = boundedArray(root.jobs, '$/jobs', 0, FORGE_BATCH_QUEUE_MAX_JOBS);
  const jobs = jobsRaw.map((job, index) => decodeJob(job, `$/jobs/${index}`));
  assertUnique(jobs.map((job) => job.id), 'job IDs');
  if (jobs.filter((job) => ['running', 'applying'].includes(job.status)).length > 1) throw new TypeError('Persisted batch queue violates concurrency 1.');
  for (const job of jobs) {
    const collection = collections.find((entry) => entry.id === job.collectionId);
    const entry = collection?.entries[job.ordinal];
    if (!entry || entry.id !== job.entryId || job.id !== jobId(job.collectionId, job.entryId)) throw new TypeError(`Job ${job.id} does not match its collection entry.`);
    if (job.latestReview) assertReviewEntry(job.latestReview, entry, `job ${job.id}`);
    if (['accepted', 'needs_review', 'failed', 'rejected'].includes(job.status) && (!job.latestReview || reviewStatus(job.latestReview) !== job.status)) {
      throw new TypeError(`Settled job ${job.id} does not match its latest review status.`);
    }
    if (job.status === 'accepted' && job.latestReview?.status !== 'accepted') throw new TypeError(`Accepted job ${job.id} lacks accepted proof.`);
    if (['applying', 'applied', 'apply_failed'].includes(job.status) && job.latestReview?.status !== 'accepted') throw new TypeError(`Apply job ${job.id} lacks accepted proof.`);
    if (!['applied', 'apply_failed'].includes(job.status) && job.applyResult) throw new TypeError(`Non-final apply job ${job.id} cannot have an apply result.`);
    if (job.status === 'applied' && !['created', 'existing'].includes(job.applyResult?.status ?? '')) throw new TypeError(`Apply result for ${job.id} is inconsistent.`);
    if (job.status === 'apply_failed' && job.applyResult?.status !== 'failed') throw new TypeError(`Apply result for ${job.id} is inconsistent.`);
    if (job.applyResult && job.applyResult.objectKind !== entry.objectKind) throw new TypeError(`Apply result for ${job.id} has the wrong object kind.`);
    if (job.status === 'applied') {
      const proof = job.latestReview!;
      const result = job.applyResult!;
      if (result.sourceId !== proof.sourceIdentity?.sourceId
        || result.sourceHash !== proof.sourceIdentity?.finalSourceHash
        || result.artifactHash !== proof.candidateResponse?.artifactHash) {
        throw new TypeError(`Apply result for ${job.id} does not match accepted proof.`);
      }
      if (result.uuid !== deterministicDocumentUuid(entry.objectKind, result.sourceId!)) throw new TypeError(`Apply result for ${job.id} has the wrong deterministic UUID.`);
    }
  }
  const queue: ForgeBatchQueueV1 = { schema: FORGE_BATCH_QUEUE_SCHEMA, version: 1, revision, updatedAt, collections, jobs };
  const normalized = stableStringify(queue);
  assertQueueSize(normalized);
  assertConfiguredSecretsAbsent(normalized, forbiddenValues);
  return deepFreeze(queue);
}

export function batchQueueEntry(queue: Readonly<ForgeBatchQueueV1>, job: Readonly<ForgeBatchJobV1>): Readonly<ForgeBatchCollectionEntryV1> {
  const collection = queue.collections.find((entry) => entry.id === job.collectionId);
  const source = collection?.entries[job.ordinal];
  if (!source || source.id !== job.entryId) throw new TypeError(`Batch job ${job.id} has no matching source entry.`);
  return source;
}

export function createForgeBatchApplyManifest(
  queue: Readonly<ForgeBatchQueueV1>,
  candidates: readonly ForgeBatchApplyCandidate[],
  createdAt = new Date().toISOString(),
): Readonly<ForgeBatchApplyManifestV1> {
  const validatedQueue = decodeForgeBatchQueueText(serializeForgeBatchQueue(queue));
  const timestamp = iso(createdAt, '$manifest/createdAt');
  if (candidates.length === 0 || candidates.length > FORGE_BATCH_QUEUE_MAX_JOBS) throw new TypeError('Apply manifest must contain at least one bounded item.');
  const items = candidates.map((candidate, index) => {
    const path = `$manifest/items/${index}`;
    const job = validatedQueue.jobs.find((entry) => entry.id === candidate.jobId);
    if (!job || job.status !== 'accepted' || job.latestReview?.status !== 'accepted') throw new TypeError(`${path} has no current accepted queue proof.`);
    const source = batchQueueEntry(validatedQueue, job);
    const proof = job.latestReview;
    if (candidate.objectKind !== source.objectKind
      || candidate.sourceId !== proof.sourceIdentity?.sourceId
      || candidate.sourceHash !== proof.sourceIdentity?.finalSourceHash
      || candidate.artifactHash !== proof.candidateResponse?.artifactHash) {
      throw new TypeError(`${path} identity does not match the persisted accepted proof.`);
    }
    const expectedDocumentId = hashArtifact({ sourceId: candidate.sourceId }).slice(0, 16);
    if (!/^[0-9a-f]{16}$/u.test(candidate.documentId) || candidate.documentId !== expectedDocumentId) throw new TypeError(`${path}/documentId is not the deterministic Forge identity.`);
    if (candidate.target.fvttVersion !== '14.364' || candidate.target.systemId !== 'dnd5e' || candidate.target.systemVersion !== '5.3.3'
      || candidate.target.generatorProfile !== 'v14' || candidate.target.effectProfile !== 'core' || candidate.target.iconMode !== 'off') {
      throw new TypeError(`${path} target is outside the exact Task E runtime.`);
    }
    return structuredClone(candidate);
  });
  assertUnique(items.map((item) => item.jobId), 'apply job IDs');
  assertUnique(items.map((item) => `${item.objectKind}:${item.documentId}`), 'apply Document identities');
  const normalized = { queueRevision: validatedQueue.revision, items };
  const manifest: ForgeBatchApplyManifestV1 = {
    schema: FORGE_BATCH_APPLY_MANIFEST_SCHEMA,
    version: 1,
    id: `apply:v1:${hashSource(stableStringify(normalized))}`,
    queueRevision: validatedQueue.revision,
    createdAt: timestamp,
    items,
  };
  assertConfiguredSecretsAbsent(stableStringify(manifest), []);
  return deepFreeze(manifest);
}

function jobFromEntry(collection: Readonly<ForgeBatchCollectionV1>, entry: Readonly<ForgeBatchCollectionEntryV1>, ordinal: number, timestamp: string): ForgeBatchJobV1 {
  const review = entry.review ? decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(entry.review)).bundle : undefined;
  return {
    schema: 'fvtt-json-forge-batch-job',
    version: 1,
    id: jobId(collection.id, entry.id),
    collectionId: collection.id,
    entryId: entry.id,
    ordinal,
    status: review ? reviewStatus(review) : 'pending',
    attemptCount: review ? 1 : 0,
    updatedAt: timestamp,
    ...(review ? { latestReview: review } : {}),
  };
}

function decodeJob(value: unknown, path: string): ForgeBatchJobV1 {
  const record = exactRecord(value, path, JOB_KEYS);
  if (record.schema !== 'fvtt-json-forge-batch-job' || record.version !== 1) throw new TypeError(`${path} schema/version is unsupported.`);
  const id = boundedString(record.id, `${path}/id`, 80);
  if (!JOB_ID_PATTERN.test(id)) throw new TypeError(`${path}/id is invalid.`);
  const collectionId = boundedString(record.collectionId, `${path}/collectionId`, 96);
  const entryId = boundedString(record.entryId, `${path}/entryId`, 180);
  const ordinal = nonNegativeInteger(record.ordinal, `${path}/ordinal`);
  if (ordinal >= FORGE_BATCH_COLLECTION_MAX_ENTRIES) throw new TypeError(`${path}/ordinal is out of range.`);
  if (!STATUSES.includes(record.status as ForgeBatchJobStatus)) throw new TypeError(`${path}/status is invalid.`);
  const status = record.status as ForgeBatchJobStatus;
  const attemptCount = nonNegativeInteger(record.attemptCount, `${path}/attemptCount`);
  const updatedAt = iso(record.updatedAt, `${path}/updatedAt`);
  const latestReview = record.latestReview === undefined ? undefined : decodeForgeIntakeReviewBundleText(JSON.stringify(record.latestReview)).bundle;
  const lastError = record.lastError === undefined ? undefined : safeMessage(record.lastError);
  const applyResult = record.applyResult === undefined ? undefined : decodeApplyResult(record.applyResult, `${path}/applyResult`);
  return { schema: 'fvtt-json-forge-batch-job', version: 1, id, collectionId, entryId, ordinal, status, attemptCount, updatedAt, ...(latestReview ? { latestReview } : {}), ...(lastError ? { lastError } : {}), ...(applyResult ? { applyResult } : {}) };
}

function decodeApplyResult(value: unknown, path: string): ForgeBatchApplyResultV1 {
  const record = exactRecord(value, path, APPLY_RESULT_KEYS);
  if (!['created', 'existing', 'failed'].includes(record.status as string)) throw new TypeError(`${path}/status is invalid.`);
  if (record.objectKind !== 'actor' && record.objectKind !== 'item') throw new TypeError(`${path}/objectKind is invalid.`);
  const status = record.status as ForgeBatchApplyResultV1['status'];
  const objectKind = record.objectKind;
  const uuid = record.uuid === undefined ? undefined : boundedString(record.uuid, `${path}/uuid`, 200);
  const sourceId = record.sourceId === undefined ? undefined : boundedString(record.sourceId, `${path}/sourceId`, 200);
  const sourceHash = record.sourceHash === undefined ? undefined : sha256(record.sourceHash, `${path}/sourceHash`);
  const artifactHash = record.artifactHash === undefined ? undefined : sha256(record.artifactHash, `${path}/artifactHash`);
  const message = record.message === undefined ? undefined : safeMessage(record.message);
  const at = iso(record.at, `${path}/at`);
  if (status !== 'failed' && (!uuid || !sourceId || !sourceHash || !artifactHash)) throw new TypeError(`${path} successful result is incomplete.`);
  return { status, objectKind, ...(uuid ? { uuid } : {}), ...(sourceId ? { sourceId } : {}), ...(sourceHash ? { sourceHash } : {}), ...(artifactHash ? { artifactHash } : {}), ...(message ? { message } : {}), at };
}

function reviewStatus(review: Readonly<ForgeIntakeReviewBundleV2>): ForgeBatchJobStatus {
  if (review.status === 'accepted') return 'accepted';
  if (review.status === 'failed') return 'failed';
  if (review.status === 'rejected') return 'rejected';
  return 'needs_review';
}

function assertReviewEntry(review: Readonly<ForgeIntakeReviewBundleV2>, entry: Readonly<ForgeBatchCollectionEntryV1>, label: string): void {
  if (review.objectKind !== entry.objectKind || review.mode !== entry.mode || review.rawSource !== entry.rawSource || review.rawSourceHash !== entry.rawSourceHash) {
    throw new TypeError(`${label} review does not match its source entry.`);
  }
}

function jobId(collectionId: string, entryId: string): string { return `job:v1:${hashSource(`${collectionId}\n${entryId}`)}`; }
function deterministicDocumentUuid(kind: ForgeIntakeObjectKind, sourceId: string): string {
  return `${kind === 'actor' ? 'Actor' : 'Item'}.${hashArtifact({ sourceId }).slice(0, 16)}`;
}

function exactRecord(value: unknown, path: string, keys: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key === '__proto__' || key === 'prototype' || key === 'constructor' || !keys.has(key)) throw new TypeError(`${path} contains an unknown key.`);
  return record;
}

function boundedArray(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new TypeError(`${path} length is outside ${min}-${max}.`);
  return value;
}

function boundedString(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new TypeError(`${path} must be a bounded string.`);
  return value;
}

function safeMessage(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_000) throw new TypeError('Queue message must be a bounded string.');
  return value.replace(/[A-Za-z]:\\[^\s"']+/gu, '<local path>').replace(/(?:^|\s)\/[^\s"']+/gu, ' <local path>');
}

function sha256(value: unknown, path: string): Sha256 {
  const text = boundedString(value, path, 64);
  if (!SHA256_PATTERN.test(text)) throw new TypeError(`${path} must be a lowercase SHA-256.`);
  return text as Sha256;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${path} must be a non-negative safe integer.`);
  return value as number;
}

function increment(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new RangeError(`${label} reached the safe integer limit.`);
  return value + 1;
}

function iso(value: unknown, path: string): string {
  const text = boundedString(value, path, 64);
  if (!ISO_PATTERN.test(text) || new Date(text).toISOString() !== text) throw new TypeError(`${path} must be an ISO timestamp.`);
  return text;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} are not allowed.`);
}

function assertQueueSize(text: string): void {
  const size = new TextEncoder().encode(text).byteLength;
  if (size === 0 || size > FORGE_BATCH_QUEUE_MAX_UTF8_BYTES) throw new TypeError('Batch queue JSON size is outside the 64 MiB limit.');
}

function stableStringify(value: unknown): string { return JSON.stringify(sortValue(value), null, 2) + '\n'; }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, child]) => [key, sortValue(child)]));
}
function thaw<T>(value: Readonly<T>): T { return structuredClone(value) as T; }
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

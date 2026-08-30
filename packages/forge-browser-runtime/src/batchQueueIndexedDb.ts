import {
  ForgeBatchQueueConflictError,
  decodeForgeBatchQueueText,
  emptyForgeBatchQueue,
  serializeForgeBatchQueue,
  type ForgeBatchQueueCommitGuard,
  type ForgeBatchQueueStore,
  type ForgeBatchQueueV1,
} from './batchQueue';

export const FORGE_BATCH_QUEUE_INDEXED_DB_NAME = 'fvtt-json-forge-batch-queue' as const;
export const FORGE_BATCH_QUEUE_INDEXED_DB_VERSION = 1 as const;

const STORE_NAME = 'queues';
const CHANNEL_NAME = 'fvtt-json-forge-batch-queue-v1';

export class IndexedDbForgeBatchQueueStore implements ForgeBatchQueueStore {
  private readonly listeners = new Set<() => void>();
  private readonly channel?: BroadcastChannel;
  private closed = false;

  constructor(
    private readonly scopeId: string,
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    channelFactory: ((name: string) => BroadcastChannel) | undefined = typeof globalThis.BroadcastChannel === 'function'
      ? (name) => new globalThis.BroadcastChannel(name)
      : undefined,
  ) {
    if (!scopeId.trim()) throw new TypeError('Batch queue scope ID must not be empty.');
    this.channel = channelFactory?.(CHANNEL_NAME);
    if (this.channel) this.channel.onmessage = (event) => {
      if (event.data?.scopeId === this.scopeId) for (const listener of this.listeners) listener();
    };
  }

  async load(): Promise<Readonly<ForgeBatchQueueV1>> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const completion = transactionDone(transaction);
      let stored: string | undefined;
      try { stored = await requestValue<string | undefined>(transaction.objectStore(STORE_NAME).get(this.scopeId)); }
      catch (error) { try { await completion; } catch { /* request error is primary */ } throw error; }
      await completion;
      return stored === undefined ? emptyForgeBatchQueue() : decodeForgeBatchQueueText(stored);
    } finally {
      database.close();
    }
  }

  async replace(expectedRevision: number, next: Readonly<ForgeBatchQueueV1>, beforeCommit?: ForgeBatchQueueCommitGuard): Promise<void> {
    const serialized = serializeForgeBatchQueue(next);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const completion = transactionDone(transaction);
      const store = transaction.objectStore(STORE_NAME);
      let stored: string | undefined;
      try { stored = await requestValue<string | undefined>(store.get(this.scopeId)); }
      catch (error) { try { await completion; } catch { /* request error is primary */ } throw error; }
      const current = stored === undefined ? emptyForgeBatchQueue() : decodeForgeBatchQueueText(stored);
      if (current.revision !== expectedRevision) {
        transaction.abort();
        try { await completion; } catch { /* expected semantic abort */ }
        throw new ForgeBatchQueueConflictError();
      }
      try { beforeCommit?.(); } catch (error) {
        transaction.abort();
        try { await completion; } catch { /* expected authority abort */ }
        throw error;
      }
      store.put(serialized, this.scopeId);
      await completion;
    } catch (error) {
      if (isQuotaError(error)) throw new RangeError('Browser storage quota rejected the batch queue write; the previous queue is unchanged.');
      throw error;
    } finally {
      database.close();
    }
    if (!this.closed) {
      this.channel?.postMessage({ scopeId: this.scopeId, revision: next.revision });
      for (const listener of this.listeners) listener();
    }
  }

  subscribe(listener: () => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.channel?.close();
  }

  private async openDatabase(): Promise<IDBDatabase> {
    if (!this.factory) throw new Error('IndexedDB is unavailable in this browser; use portable queue export/import instead.');
    return await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const request = this.factory!.open(FORGE_BATCH_QUEUE_INDEXED_DB_NAME, FORGE_BATCH_QUEUE_INDEXED_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        if (settled) return void request.result.close();
        settled = true;
        resolve(request.result);
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new Error('Unable to open the batch queue database.'));
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new Error('Batch queue database upgrade is blocked by another Foundry window.'));
      };
    });
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

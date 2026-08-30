import { describe, expect, test } from 'bun:test';
import { ForgeBatchQueueConflictError, emptyForgeBatchQueue, type ForgeBatchQueueV1 } from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import { IndexedDbForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue-indexed-db';

describe('Forge IndexedDB batch queue adapter', () => {
  test('commits and reloads one strict queue while rejecting stale revision and quota atomically', async () => {
    const factory = new FakeIndexedDbFactory();
    const store = new IndexedDbForgeBatchQueueStore('world:user', factory as unknown as IDBFactory, undefined);
    await store.replace(0, stateAt(1));
    expect(await store.load()).toEqual(stateAt(1));
    await expect(store.replace(0, stateAt(2))).rejects.toThrow(ForgeBatchQueueConflictError);
    factory.failNextPutWithQuota = true;
    await expect(store.replace(1, stateAt(2))).rejects.toThrow(/quota.*previous queue is unchanged/iu);
    expect((await store.load()).revision).toBe(1);
    expect(factory.openDatabases).toBe(factory.closedDatabases);
  });

  test('rechecks authority after the IndexedDB read and before put', async () => {
    const factory = new FakeIndexedDbFactory();
    const store = new IndexedDbForgeBatchQueueStore('world:user', factory as unknown as IDBFactory, undefined);
    await store.replace(0, stateAt(1));
    let authorized = true;
    factory.beforeNextGetSuccess = () => { authorized = false; };
    await expect(store.replace(1, stateAt(2), () => {
      if (!authorized) throw new Error('GM authority changed during queue commit.');
    })).rejects.toThrow(/authority changed/u);
    expect((await store.load()).revision).toBe(1);
  });

  test('broadcasts only to same-scope peers and closes owned channels', async () => {
    const factory = new FakeIndexedDbFactory();
    const hub = new FakeChannelHub();
    const first = new IndexedDbForgeBatchQueueStore('world:user', factory as unknown as IDBFactory, hub.create);
    const peer = new IndexedDbForgeBatchQueueStore('world:user', factory as unknown as IDBFactory, hub.create);
    const other = new IndexedDbForgeBatchQueueStore('world:other', factory as unknown as IDBFactory, hub.create);
    let local = 0; let remote = 0; let unrelated = 0;
    first.subscribe(() => { local += 1; });
    peer.subscribe(() => { remote += 1; });
    other.subscribe(() => { unrelated += 1; });
    await first.replace(0, stateAt(1));
    await tick();
    expect({ local, remote, unrelated }).toEqual({ local: 1, remote: 1, unrelated: 0 });
    first.close(); peer.close(); other.close();
    await first.replace(1, stateAt(2));
    await tick();
    expect({ local, remote, unrelated, postAfterClose: hub.postAfterClose }).toEqual({ local: 1, remote: 1, unrelated: 0, postAfterClose: 0 });
  });
});

function stateAt(revision: number): ForgeBatchQueueV1 {
  return { ...emptyForgeBatchQueue(), revision, updatedAt: `2026-08-30T12:0${revision}:00.000Z` };
}

function tick(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

class FakeIndexedDbFactory {
  readonly values = new Map<IDBValidKey, string>();
  hasStore = false;
  failNextPutWithQuota = false;
  beforeNextGetSuccess: (() => void) | undefined;
  openDatabases = 0;
  closedDatabases = 0;

  open(): IDBOpenDBRequest {
    const request = requestObject<IDBDatabase>() as IDBOpenDBRequest;
    queueMicrotask(() => {
      const database = new FakeDatabase(this);
      this.openDatabases += 1;
      Object.defineProperty(request, 'result', { configurable: true, value: database });
      if (!this.hasStore) request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
}

class FakeDatabase {
  readonly objectStoreNames: Pick<DOMStringList, 'contains'> = { contains: () => this.owner.hasStore };
  private closed = false;
  constructor(private readonly owner: FakeIndexedDbFactory) {}
  createObjectStore(): IDBObjectStore { this.owner.hasStore = true; return {} as IDBObjectStore; }
  transaction(_name: string, mode: IDBTransactionMode): IDBTransaction {
    if (this.closed) throw new DOMException('Database is closed.', 'InvalidStateError');
    return new FakeTransaction(this.owner, mode) as unknown as IDBTransaction;
  }
  close(): void { if (!this.closed) { this.closed = true; this.owner.closedDatabases += 1; } }
}

class FakeTransaction {
  oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  error: DOMException | null = null;
  private pending = 0;
  private completionScheduled = false;
  private active = true;
  constructor(private readonly owner: FakeIndexedDbFactory, private readonly mode: IDBTransactionMode) {}
  objectStore(): IDBObjectStore {
    return {
      get: (key: IDBValidKey) => this.request(() => {
        const hook = this.owner.beforeNextGetSuccess;
        this.owner.beforeNextGetSuccess = undefined;
        hook?.();
        return this.owner.values.get(key);
      }),
      put: (value: string, key: IDBValidKey) => this.request(() => {
        if (this.mode !== 'readwrite') throw new DOMException('Readonly transaction.', 'ReadOnlyError');
        if (this.owner.failNextPutWithQuota) { this.owner.failNextPutWithQuota = false; throw new DOMException('Quota exceeded.', 'QuotaExceededError'); }
        this.owner.values.set(key, value);
        return key;
      }),
    } as IDBObjectStore;
  }
  abort(): void { if (this.active) { this.active = false; queueMicrotask(() => this.onabort?.call(this as unknown as IDBTransaction, new Event('abort'))); } }
  private request<T>(operation: () => T): IDBRequest<T> {
    const request = requestObject<T>();
    this.pending += 1;
    queueMicrotask(() => {
      if (!this.active) return;
      try { Object.defineProperty(request, 'result', { configurable: true, value: operation() }); request.onsuccess?.(new Event('success')); }
      catch (error) { this.error = error instanceof DOMException ? error : new DOMException(String(error), 'UnknownError'); this.active = false; this.onerror?.call(this as unknown as IDBTransaction, new Event('error')); }
      finally { this.pending -= 1; this.scheduleCompletion(); }
    });
    return request;
  }
  private scheduleCompletion(): void {
    if (!this.active || this.pending !== 0 || this.completionScheduled) return;
    this.completionScheduled = true;
    setTimeout(() => {
      this.completionScheduled = false;
      if (!this.active || this.pending !== 0) return;
      this.active = false;
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event('complete'));
    }, 0);
  }
}

function requestObject<T>(): IDBRequest<T> {
  return { result: undefined as T, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest<T>;
}

class FakeChannelHub {
  private readonly channels = new Set<FakeChannel>();
  postAfterClose = 0;
  readonly create = (name: string): BroadcastChannel => {
    const channel = new FakeChannel(name, this);
    this.channels.add(channel);
    return channel as unknown as BroadcastChannel;
  };
  broadcast(sender: FakeChannel, data: unknown): void {
    if (sender.closed) { this.postAfterClose += 1; throw new DOMException('BroadcastChannel is closed.', 'InvalidStateError'); }
    for (const channel of this.channels) if (channel !== sender && !channel.closed && channel.name === sender.name) queueMicrotask(() => channel.onmessage?.({ data } as MessageEvent));
  }
  close(channel: FakeChannel): void { this.channels.delete(channel); }
}

class FakeChannel {
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  closed = false;
  constructor(readonly name: string, private readonly hub: FakeChannelHub) {}
  postMessage(data: unknown): void { this.hub.broadcast(this, data); }
  close(): void { if (!this.closed) { this.closed = true; this.hub.close(this); } }
}

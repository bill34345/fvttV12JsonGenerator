import type { BrowserSample, MonitorEvent, SanitizedError, SessionExport, SessionMeta } from './schema';
import { SCHEMA_VERSION } from './schema';

export interface SessionStore {
  open(): Promise<void>;
  createSession(meta: SessionMeta): Promise<void>;
  updateSession(meta: SessionMeta): Promise<void>;
  getSession(id: string): Promise<SessionMeta | null>;
  findActiveSession(worldKey: string): Promise<SessionMeta | null>;
  appendSample(sessionId: string, sample: BrowserSample): Promise<void>;
  appendEvent(sessionId: string, event: MonitorEvent): Promise<void>;
  appendError(sessionId: string, error: SanitizedError): Promise<void>;
  exportSession(id: string): Promise<SessionExport | null>;
  listSessions(): Promise<SessionMeta[]>;
  deleteSession(id: string): Promise<void>;
}

interface StoredRow<T> {
  key: string;
  sessionId: string;
  sequence: number;
  value: T;
}

function row<T extends { sequence: number }>(sessionId: string, value: T): StoredRow<T> {
  return { key: `${sessionId}:${String(value.sequence).padStart(8, '0')}`, sessionId, sequence: value.sequence, value };
}

function publicMeta(meta: SessionMeta): Omit<SessionMeta, 'worldKey' | 'aliases'> {
  const { worldKey: _worldKey, aliases: _aliases, ...output } = meta;
  return structuredClone(output);
}

export class MemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, SessionMeta>();
  readonly samples = new Map<string, BrowserSample[]>();
  readonly events = new Map<string, MonitorEvent[]>();
  readonly errors = new Map<string, SanitizedError[]>();

  async open(): Promise<void> {}

  async createSession(meta: SessionMeta): Promise<void> {
    if (this.sessions.has(meta.id)) throw new Error(`Session already exists: ${meta.id}`);
    this.sessions.set(meta.id, structuredClone(meta));
  }

  async updateSession(meta: SessionMeta): Promise<void> {
    if (!this.sessions.has(meta.id)) throw new Error(`Unknown session: ${meta.id}`);
    this.sessions.set(meta.id, structuredClone(meta));
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const value = this.sessions.get(id);
    return value ? structuredClone(value) : null;
  }

  async findActiveSession(worldKey: string): Promise<SessionMeta | null> {
    const match = Array.from(this.sessions.values())
      .filter((session) => session.worldKey === worldKey && session.state === 'active')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return match ? structuredClone(match) : null;
  }

  async appendSample(sessionId: string, sample: BrowserSample): Promise<void> {
    this.samples.set(sessionId, [...(this.samples.get(sessionId) ?? []), structuredClone(sample)]);
  }

  async appendEvent(sessionId: string, event: MonitorEvent): Promise<void> {
    this.events.set(sessionId, [...(this.events.get(sessionId) ?? []), structuredClone(event)]);
  }

  async appendError(sessionId: string, error: SanitizedError): Promise<void> {
    this.errors.set(sessionId, [...(this.errors.get(sessionId) ?? []), structuredClone(error)]);
  }

  async exportSession(id: string): Promise<SessionExport | null> {
    const meta = this.sessions.get(id);
    if (!meta) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      session: publicMeta(meta),
      samples: structuredClone(this.samples.get(id) ?? []),
      events: structuredClone(this.events.get(id) ?? []),
      errors: structuredClone(this.errors.get(id) ?? []),
      privacy: privacyDeclaration(),
    };
  }

  async listSessions(): Promise<SessionMeta[]> {
    return Array.from(this.sessions.values()).map((session) => structuredClone(session))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    this.samples.delete(id);
    this.events.delete(id);
    this.errors.delete(id);
  }
}

export class IndexedDbSessionStore implements SessionStore {
  readonly #databaseName: string;
  #database?: IDBDatabase;

  constructor(databaseName = 'fvtt-session-monitor') {
    this.#databaseName = databaseName;
  }

  async open(): Promise<void> {
    if (this.#database) return;
    this.#database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.#databaseName, 1);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions', { keyPath: 'id' });
        for (const name of ['samples', 'events', 'errors']) {
          if (database.objectStoreNames.contains(name)) continue;
          const store = database.createObjectStore(name, { keyPath: 'key' });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async createSession(meta: SessionMeta): Promise<void> {
    await this.#write('sessions', 'add', structuredClone(meta));
  }

  async updateSession(meta: SessionMeta): Promise<void> {
    await this.#write('sessions', 'put', structuredClone(meta));
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const value = await this.#request<SessionMeta | undefined>('sessions', 'readonly', (store) => store.get(id));
    return value ? structuredClone(value) : null;
  }

  async findActiveSession(worldKey: string): Promise<SessionMeta | null> {
    const sessions = await this.listSessions();
    return sessions.find((session) => session.worldKey === worldKey && session.state === 'active') ?? null;
  }

  async appendSample(sessionId: string, sample: BrowserSample): Promise<void> {
    await this.#write('samples', 'add', row(sessionId, structuredClone(sample)));
  }

  async appendEvent(sessionId: string, event: MonitorEvent): Promise<void> {
    await this.#write('events', 'add', row(sessionId, structuredClone(event)));
  }

  async appendError(sessionId: string, error: SanitizedError): Promise<void> {
    await this.#write('errors', 'add', row(sessionId, structuredClone(error)));
  }

  async exportSession(id: string): Promise<SessionExport | null> {
    const meta = await this.getSession(id);
    if (!meta) return null;
    const [samples, events, errors] = await Promise.all([
      this.#readRows<BrowserSample>('samples', id),
      this.#readRows<MonitorEvent>('events', id),
      this.#readRows<SanitizedError>('errors', id),
    ]);
    return {
      schemaVersion: SCHEMA_VERSION,
      session: publicMeta(meta),
      samples,
      events,
      errors,
      privacy: privacyDeclaration(),
    };
  }

  async listSessions(): Promise<SessionMeta[]> {
    const values = await this.#request<SessionMeta[]>('sessions', 'readonly', (store) => store.getAll());
    return values.map((session) => structuredClone(session))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async deleteSession(id: string): Promise<void> {
    const database = this.#db();
    const transaction = database.transaction(['sessions', 'samples', 'events', 'errors'], 'readwrite');
    transaction.objectStore('sessions').delete(id);
    for (const name of ['samples', 'events', 'errors']) {
      const index = transaction.objectStore(name).index('sessionId');
      const request = index.openKeyCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        transaction.objectStore(name).delete(cursor.primaryKey);
        cursor.continue();
      };
    }
    await transactionDone(transaction);
  }

  async #readRows<T>(name: string, sessionId: string): Promise<T[]> {
    const database = this.#db();
    const transaction = database.transaction(name, 'readonly');
    const request = transaction.objectStore(name).index('sessionId').getAll(IDBKeyRange.only(sessionId));
    const rows = await requestResult<StoredRow<T>[]>(request);
    await transactionDone(transaction);
    return rows.sort((left, right) => left.sequence - right.sequence).map((entry) => structuredClone(entry.value));
  }

  async #write(name: string, operation: 'add' | 'put', value: unknown): Promise<void> {
    await this.#request(name, 'readwrite', (store) => store[operation](value));
  }

  async #request<T>(name: string, mode: IDBTransactionMode, create: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const transaction = this.#db().transaction(name, mode);
    const result = await requestResult(create(transaction.objectStore(name)));
    await transactionDone(transaction);
    return result;
  }

  #db(): IDBDatabase {
    if (!this.#database) throw new Error('IndexedDB store is not open.');
    return this.#database;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function privacyDeclaration(): SessionExport['privacy'] {
  return {
    sceneAndCombatIdsAliased: true,
    freeTextMarkersDisabled: true,
    rawConsoleArgumentsExcluded: true,
    forbiddenContent: [
      'chat text', 'roll values', 'Actor or Item text', 'document names or IDs',
      'player input', 'cookies', 'passwords', 'authorization tokens', 'IP addresses',
    ],
  };
}

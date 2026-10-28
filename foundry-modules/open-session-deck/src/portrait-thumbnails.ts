export interface PortraitThumbnailStats {
  entries: number;
  pending: number;
  generated: number;
  diskHits: number;
  sourceReads: number;
  sourceBytes: number;
  thumbnailBytes: number;
  validations: number;
  failures: number;
}
interface StoredPortrait { blob: Blob; validator: string }
export interface PortraitStore {
  get(key: string): Promise<StoredPortrait | undefined>;
  put(key: string, value: StoredPortrait): Promise<void>;
  close?(): void;
}
export interface PortraitBackend {
  create(source: string): Promise<{ blob: Blob; validator?: string; sourceBytes: number }>;
  unchanged(source: string, validator: string): Promise<boolean>;
  url(blob: Blob): string;
  revoke(url: string): void;
}
const PLACEHOLDER = 'icons/svg/mystery-man.svg';
const CACHE_VERSION = 'v1:64:webp:.75:';

export class PortraitThumbnails {
  #entries = new Map<string, { url: string; bytes: number }>();
  #pending = new Map<string, Promise<void>>();
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;
  #stats = { generated: 0, diskHits: 0, sourceReads: 0, sourceBytes: 0, validations: 0, failures: 0 };

  constructor(private readonly store: PortraitStore, private readonly backend: PortraitBackend,
    private readonly changed: (source: string, url: string) => void, private readonly baseUri: string) {}

  get(source: string): string {
    const absolute = new URL(source, this.baseUri).href;
    if (/\.svg(?:[?#]|$)/i.test(absolute)) return absolute;
    const cached = this.#entries.get(absolute);
    if (cached) return cached.url;
    if (!this.#pending.has(absolute) && !this.#disposed) {
      // Decode one full-size source at a time; the UI keeps its lightweight placeholder meanwhile.
      const pending = this.#tail.then(() => this.#load(absolute)).finally(() => this.#pending.delete(absolute));
      this.#pending.set(absolute, pending);
      this.#tail = pending;
    }
    return PLACEHOLDER;
  }

  async stats(): Promise<PortraitThumbnailStats> {
    await this.#tail;
    return { ...this.#stats, entries: this.#entries.size, pending: this.#pending.size,
      thumbnailBytes: [...this.#entries.values()].reduce((sum, entry) => sum + entry.bytes, 0) };
  }

  dispose(): void {
    this.#disposed = true;
    for (const [source, entry] of this.#entries) if (entry.url !== source) this.backend.revoke(entry.url);
    this.#entries.clear();
    this.store.close?.();
  }

  async #load(source: string): Promise<void> {
    try {
      const key = CACHE_VERSION + source;
      const cached = await this.store.get(key).catch(() => undefined);
      let blob: Blob;
      if (cached && (++this.#stats.validations, await this.backend.unchanged(source, cached.validator))) {
        blob = cached.blob;
        this.#stats.diskHits++;
      } else {
        this.#stats.sourceReads++;
        const created = await this.backend.create(source);
        blob = created.blob;
        this.#stats.generated++;
        this.#stats.sourceBytes += created.sourceBytes;
        if (created.validator) await this.store.put(key, { blob, validator: created.validator }).catch(() => {});
      }
      if (!this.#disposed) this.#entries.set(source, { url: this.backend.url(blob), bytes: blob.size });
    } catch {
      // Preserve an existing portrait if its server cannot provide a browser-readable image.
      this.#stats.failures++;
      if (!this.#disposed) this.#entries.set(source, { url: source, bytes: 0 });
    }
    const entry = this.#entries.get(source);
    if (!this.#disposed && entry) this.changed(source, entry.url);
  }
}

export function createBrowserPortraitThumbnails(changed: (source: string, url: string) => void): PortraitThumbnails | undefined {
  if (typeof createImageBitmap !== 'function') return undefined;
  return new PortraitThumbnails(browserStore(), createBrowserPortraitBackend(), changed, document.baseURI);
}

export function createBrowserPortraitBackend(): PortraitBackend {
  return {
    create: async (source) => {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Portrait HTTP ${response.status}`);
      const sourceBlob = await response.blob();
      const bitmap = await createImageBitmap(sourceBlob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Portrait canvas unavailable');
        const scale = Math.max(64 / bitmap.width, 64 / bitmap.height);
        context.drawImage(bitmap, (64 - bitmap.width * scale) / 2, (64 - bitmap.height * scale) / 2,
          bitmap.width * scale, bitmap.height * scale);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('Portrait encoding failed')), 'image/webp', .75));
        return { blob, validator: responseValidator(response.headers), sourceBytes: sourceBlob.size };
      } finally { bitmap.close(); }
    },
    unchanged: async (source, validator) => {
      try {
        const response = await fetch(source, { method: 'HEAD', cache: 'no-cache' });
        return response.status === 304 || response.ok && responseValidator(response.headers) === validator;
      } catch { return false; }
    },
    url: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url),
  };
}

function responseValidator(headers: Headers): string | undefined {
  const etag = headers.get('etag'), modified = headers.get('last-modified');
  return etag || modified ? JSON.stringify([etag, modified, headers.get('content-length')]) : undefined;
}

function browserStore(): PortraitStore {
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('open-session-deck-portraits', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('portraits');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // A blocked/unsupported persistent cache still leaves the in-page thumbnail cache usable.
  void opened.catch(() => {});
  return {
    get: async (key) => {
      const database = await opened;
      return new Promise((resolve, reject) => {
        const request = database.transaction('portraits').objectStore('portraits').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    put: async (key, value) => {
      const database = await opened;
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('portraits', 'readwrite');
        transaction.objectStore('portraits').put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    close: () => { void opened.then((database) => database.close(), () => {}); },
  };
}

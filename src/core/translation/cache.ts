import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TranslationCache, TranslationLogger } from './types';

type CacheEntries = Record<string, string>;

const defaultLogger: TranslationLogger = {
  warn: (message, meta) => {
    if (meta) {
      console.warn(message, meta);
      return;
    }
    console.warn(message);
  },
};

export class FileTranslationCache implements TranslationCache {
  private loaded = false;
  private entries: CacheEntries = {};

  constructor(
    private readonly filePath: string,
    private readonly logger: TranslationLogger = defaultLogger,
  ) {}

  public get(key: string): string | undefined {
    this.ensureLoaded();
    return this.entries[key];
  }

  public set(key: string, translated: string): void {
    this.ensureLoaded();
    this.entries[key] = translated;
    this.persist();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!existsSync(this.filePath)) {
      this.entries = {};
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.logger.warn('Translation cache is not an object, using empty cache', {
          cacheFilePath: this.filePath,
        });
        this.entries = {};
        return;
      }

      const entries: CacheEntries = {};
      for (const [cacheKey, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          entries[cacheKey] = value;
        }
      }

      this.entries = entries;
    } catch (error: unknown) {
      this.logger.warn('Translation cache parse failed, using empty cache', {
        cacheFilePath: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      this.entries = {};
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch (error: unknown) {
      this.logger.warn('Translation cache write failed', {
        cacheFilePath: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

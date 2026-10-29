import { describe, expect, test } from 'bun:test';
import { ThumbnailCache, type CreatedThumbnail } from '../thumbnail-cache';

describe('session thumbnail cache', () => {
  test('a new session does not reuse an old request or lose its own pending request when the old one finishes', async () => {
    const pending: Array<(value: CreatedThumbnail) => void> = [];
    const revoked: string[] = [];
    let released = 0;
    const cache = new ThumbnailCache({
      create: () => new Promise(resolve => pending.push(resolve)),
      revoke: url => revoked.push(url),
    }, () => 2);
    const old = cache.get('same.png', 128, 75);
    cache.clear();
    const fresh = cache.get('same.png', 128, 75);
    try {
      expect(fresh).not.toBe(old);
      expect(pending).toHaveLength(2);
      pending[0]!({ url: 'blob:old', bytes: 10, releaseSource: () => { released++; } });
      expect(await old).toBeUndefined();
      expect(cache.get('same.png', 128, 75)).toBe(fresh);
      expect(pending).toHaveLength(2);
      pending[1]!({ url: 'blob:fresh', bytes: 10, releaseSource: () => { released++; } });
      expect(await fresh).toBe('blob:fresh');
      expect(revoked).toEqual(['blob:old']);
      expect(released).toBe(2);
      expect(cache.getStats()).toEqual({ entries: 1, estimatedBytes: 10, failures: 0 });
    } finally {
      pending.forEach((finish, index) => finish({ url: `blob:cleanup-${index}`, bytes: 0 }));
      await Promise.allSettled([old, fresh]);
      cache.clear();
    }
  });

  test('bounds remembered failed sources while retaining an accurate failure count', async () => {
    let attempts = 0;
    const cache = new ThumbnailCache({
      create: async () => { attempts++; throw new Error('unavailable'); },
      revoke: () => {},
    }, () => 2);
    for (const source of ['bad-1.png', 'bad-2.png', 'bad-3.png']) await cache.get(source, 128, 75);
    await cache.get('bad-3.png', 128, 75);
    expect(attempts).toBe(3);
    await cache.get('bad-1.png', 128, 75);
    expect(attempts).toBe(4);
    expect(cache.getStats().failures).toBe(4);
    cache.clear();
    expect(cache.getStats().failures).toBe(0);
  });

  test('a synchronously throwing backend leaves no stale pending request after clear', async () => {
    let attempts = 0;
    const cache = new ThumbnailCache({
      create() { attempts++; throw new Error('synchronous backend failure'); },
      revoke: () => {},
    }, () => 2);
    expect(await cache.get('bad.png', 128, 75)).toBeUndefined();
    cache.clear();
    expect(await cache.get('bad.png', 128, 75)).toBeUndefined();
    expect(attempts).toBe(2);
  });

  test('zero capacity releases a newly created thumbnail without returning its revoked URL', async () => {
    const revoked: string[] = [];
    const cache = new ThumbnailCache({
      create: async () => ({ url: 'blob:uncached', bytes: 10 }),
      revoke: url => revoked.push(url),
    }, () => 0);
    expect(await cache.get('a.png', 128, 75)).toBeUndefined();
    expect(revoked).toEqual(['blob:uncached']);
    expect(cache.getStats().entries).toBe(0);
  });

  test('deduplicates concurrent requests and closes source bitmaps', async () => {
    let generated = 0;
    let closed = 0;
    const cache = new ThumbnailCache({
      create: async (source, edge, quality) => {
        generated++;
        return {
          url: `blob:${source}:${edge}:${quality}`,
          bytes: 123,
          releaseSource: () => { closed++; },
        };
      },
      revoke: () => {},
    }, () => 64);
    const [first, second] = await Promise.all([
      cache.get('icons/a.png', 128, 75),
      cache.get('./icons/a.png', 128, 75),
    ]);
    expect(first).toBe(second);
    expect(generated).toBe(1);
    expect(closed).toBe(1);
  });

  test('evicts least recently used entries and revokes every URL on clear', async () => {
    const revoked: string[] = [];
    const cache = new ThumbnailCache({
      create: async (source) => ({ url: `blob:${source}`, bytes: 10 }),
      revoke: (url) => revoked.push(url),
    }, () => 2);
    await cache.get('a.png', 128, 75);
    await cache.get('b.png', 128, 75);
    await cache.get('a.png', 128, 75);
    await cache.get('c.png', 128, 75);
    expect(revoked).toEqual(['blob:b.png']);
    cache.clear();
    expect(revoked.sort()).toEqual(['blob:a.png', 'blob:b.png', 'blob:c.png']);
    expect(cache.getStats()).toEqual({ entries: 0, estimatedBytes: 0, failures: 0 });
  });

  test('records a failed source once without rejecting chat rendering', async () => {
    let attempts = 0;
    const warnings: string[] = [];
    const cache = new ThumbnailCache({
      create: async () => { attempts++; throw new Error('broken'); },
      revoke: () => {},
    }, () => 64, (source) => warnings.push(source));
    expect(await cache.get('broken.png', 128, 75)).toBeUndefined();
    expect(await cache.get('broken.png', 128, 75)).toBeUndefined();
    expect(attempts).toBe(1);
    expect(cache.getStats().failures).toBe(1);
    expect(warnings).toEqual(['broken.png']);
  });

  test('revokes an in-flight thumbnail that completes after session cleanup', async () => {
    let finish!: (value: { url: string; bytes: number }) => void;
    const revoked: string[] = [];
    const cache = new ThumbnailCache({
      create: () => new Promise((resolve) => { finish = resolve; }),
      revoke: (url) => revoked.push(url),
    }, () => 64);
    const pending = cache.get('slow.png', 128, 75);
    cache.clear();
    finish({ url: 'blob:stale', bytes: 20 });
    expect(await pending).toBeUndefined();
    expect(revoked).toEqual(['blob:stale']);
    expect(cache.getStats().entries).toBe(0);
  });
});

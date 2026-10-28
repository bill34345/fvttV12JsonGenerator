import { describe, expect, test } from 'bun:test';
import { PortraitThumbnails, createBrowserPortraitBackend, type PortraitBackend, type PortraitStore } from '../src/portrait-thumbnails.ts';

function fixture() {
  const stored = new Map<string, any>(), created: string[] = [], validations: string[] = [], revoked: string[] = [];
  let version = 'one', generation = 0, changes = 0, fail = false;
  const store: PortraitStore = { get: async (key) => stored.get(key), put: async (key, value) => { stored.set(key, value); } };
  const backend: PortraitBackend = {
    create: async (source) => {
      created.push(source);
      if (fail) throw Error('Unavailable');
      return { blob: new Blob(['small-webp'], { type: 'image/webp' }), validator: version, sourceBytes: 800_000 };
    },
    unchanged: async (_source, validator) => { validations.push(validator); return validator === version; },
    url: () => `blob:thumbnail-${++generation}`, revoke: (url) => { revoked.push(url); },
  };
  return { stored, created, validations, revoked, backend, store, cache: () => new PortraitThumbnails(store, backend, () => { changes++; }, 'http://foundry.test/game'),
    changes: () => changes, replace: () => { version = 'two'; }, fail: () => { fail = true; } };
}

describe('portrait thumbnails', () => {
  test('does not treat a failed native HEAD validation as an unchanged source', async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = (async () => { throw Error('HEAD unavailable'); }) as unknown as typeof fetch;
      expect(await createBrowserPortraitBackend().unchanged('http://foundry.test/portrait.png', 'old')).toBeFalse();
    } finally { globalThis.fetch = original; }
  });

  test('never places a raster original into the UI while generating, and deduplicates main/popout roster uses', async () => {
    const f = fixture(), cache = f.cache();
    expect(cache.get('worlds/portrait.png')).toBe('icons/svg/mystery-man.svg');
    expect(cache.get('http://foundry.test/worlds/portrait.png')).toBe('icons/svg/mystery-man.svg');
    const stats = await cache.stats();
    expect(f.created).toEqual(['http://foundry.test/worlds/portrait.png']);
    expect(stats).toMatchObject({ generated: 1, sourceReads: 1, sourceBytes: 800_000, entries: 1, pending: 0 });
    expect(cache.get('worlds/portrait.png')).toBe('blob:thumbnail-1');
    expect(f.changes()).toBe(1);
  });

  test('reuses persisted Blob after reload with metadata validation, and creates a fresh page-local URL', async () => {
    const f = fixture(), first = f.cache();first.get('/portrait.webp');await first.stats();first.dispose();
    const next = f.cache();next.get('/portrait.webp');
    expect(await next.stats()).toMatchObject({ diskHits: 1, validations: 1, sourceReads: 0, generated: 0 });
    expect(next.get('/portrait.webp')).toBe('blob:thumbnail-2');
    expect(f.created).toHaveLength(1);
    expect(f.revoked).toEqual(['blob:thumbnail-1']);
  });

  test('regenerates a portrait replaced at the same path and invalidates a changed image path', async () => {
    const f = fixture(), first = f.cache();first.get('/portrait.png');await first.stats();first.dispose();f.replace();
    const next = f.cache();next.get('/portrait.png');next.get('/new-portrait.png');
    expect(await next.stats()).toMatchObject({ generated: 2, sourceReads: 2, diskHits: 0 });
    expect(f.created).toEqual(['http://foundry.test/portrait.png', 'http://foundry.test/portrait.png', 'http://foundry.test/new-portrait.png']);
  });

  test('keeps native vector icons lightweight without raster decoding', async () => {
    const f = fixture(), cache = f.cache();
    expect(cache.get('icons/svg/mystery-man.svg')).toBe('http://foundry.test/icons/svg/mystery-man.svg');
    expect((await cache.stats()).sourceReads).toBe(0);
  });

  test('falls back once per page for unreadable sources instead of retrying each data render', async () => {
    const f = fixture(), cache = f.cache();f.fail();cache.get('/external.png');await cache.stats();
    for (let i = 0; i < 3; i++) expect(cache.get('/external.png')).toBe('http://foundry.test/external.png');
    expect(f.created).toHaveLength(1);
    expect((await cache.stats()).failures).toBe(1);
    expect(f.stored.size).toBe(0);
  });

  test('keeps in-page thumbnails usable when browser persistence is unavailable', async () => {
    const f = fixture();
    const store: PortraitStore = { get: async () => { throw Error('Storage blocked'); }, put: async () => { throw Error('Quota'); } };
    const cache = new PortraitThumbnails(store, f.backend, () => {}, 'http://foundry.test/game');
    cache.get('/portrait.png');expect((await cache.stats()).generated).toBe(1);
    expect(cache.get('/portrait.png')).toBe('blob:thumbnail-1');
  });

  test('serializes full-source decoding and releases generated URLs on disposal', async () => {
    const f = fixture(), cache = f.cache();let release!: () => void;
    const normal = f.backend.create;f.backend.create = async (src) => { if (src.endsWith('first.png')) await new Promise<void>((resolve) => { release = resolve; });return normal(src); };
    cache.get('/first.png');cache.get('/second.png');await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.created).toHaveLength(0);release();await cache.stats();
    expect(f.created).toEqual(['http://foundry.test/first.png', 'http://foundry.test/second.png']);
    cache.dispose();expect(f.revoked).toEqual(['blob:thumbnail-1', 'blob:thumbnail-2']);
  });
});

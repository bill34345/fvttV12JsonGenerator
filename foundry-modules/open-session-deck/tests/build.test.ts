import { describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildModule, createStoredZip, validateManifest } from '../build.ts';
import { hashTree, treeHash } from '../lab.ts';

describe('Open Session Deck build', () => {
  test('locks exact runtime support and socket-free manifest', async () => {
    const manifest = JSON.parse(await readFile(resolve(import.meta.dir, '../src/module.json'), 'utf8'));
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.socket).toBe(false);
    expect(manifest.relationships.systems.map((entry: any) => entry.id)).toEqual(['dnd5e']);
  });

  test('rejects compatibility and networking drift', async () => {
    const manifest = JSON.parse(await readFile(resolve(import.meta.dir, '../src/module.json'), 'utf8'));
    expect(() => validateManifest({ ...manifest, compatibility: { ...manifest.compatibility, maximum: '14.365' } })).toThrow('14.364');
    expect(() => validateManifest({ ...manifest, socket: true })).toThrow('socket');
  });

  test('creates a complete browser-only module package', async () => {
    const result = await buildModule();
    expect(result.files).toContain('scripts/index.js');
    expect(result.files).toContain('templates/deck.hbs');
    expect(result.files).toContain('styles/open-session-deck.css');
    expect(result.files).toContain('lang/en.json');
    expect(result.files).toContain('lang/zh-CN.json');
    expect(result.files).toContain('LICENSE');
    expect(await readFile(resolve(result.moduleRoot, 'LICENSE'), 'utf8')).toContain('Permission is hereby granted');
    const browser = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    expect(browser).not.toMatch(/node:|process\.env|@fvtt-json-generator\//i);
  });

  test('stored zip output is deterministic regardless of entry order', () => {
    const a = { name: 'a.txt', bytes: new TextEncoder().encode('a') };
    const b = { name: 'b.txt', bytes: new TextEncoder().encode('b') };
    expect(createStoredZip([a, b])).toEqual(createStoredZip([b, a]));
  });

  test('English and Chinese catalogs expose the same complete key set', async () => {
    const english = JSON.parse(await readFile(resolve(import.meta.dir, '../src/lang/en.json'), 'utf8'));
    const chinese = JSON.parse(await readFile(resolve(import.meta.dir, '../src/lang/zh-CN.json'), 'utf8'));
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    expect(Object.keys(english).length).toBeGreaterThan(40);
  });

  test('tree hashing detects installed-byte drift', async () => {
    const result = await buildModule();
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'open-session-deck-hash-'));
    const copied = resolve(temporaryRoot, 'module');
    try {
      await cp(result.moduleRoot, copied, { recursive: true });
      expect(treeHash(await hashTree(copied))).toBe(treeHash(await hashTree(result.moduleRoot)));
      await writeFile(resolve(copied, 'README.md'), 'changed bytes');
      expect(treeHash(await hashTree(copied))).not.toBe(treeHash(await hashTree(result.moduleRoot)));
    } finally {
      await rm(temporaryRoot, { recursive: true });
    }
  });
});

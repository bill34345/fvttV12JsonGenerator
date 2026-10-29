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
    expect(manifest.relationships.systems[0].compatibility).toEqual({ minimum: '5.3.3', verified: '5.3.3', maximum: '6.0.6' });
  });

  test('rejects compatibility and networking drift', async () => {
    const manifest = JSON.parse(await readFile(resolve(import.meta.dir, '../src/module.json'), 'utf8'));
    expect(() => validateManifest({ ...manifest, compatibility: { ...manifest.compatibility, maximum: '14.365' } })).toThrow('14.368');
    expect(() => validateManifest({ ...manifest, relationships: { systems: [{ id: 'dnd5e', compatibility: { minimum: '5.3.3', verified: '6.0.2', maximum: '6.0.6' } }] } })).toThrow('5.3.3');
    expect(() => validateManifest({ ...manifest, relationships: { systems: [{ id: 'dnd5e', compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '6.0.7' } }] } })).toThrow('6.0.6');
    expect(() => validateManifest({ ...manifest, socket: true })).toThrow('socket');
  });

  test('creates a complete browser-only module package', async () => {
    const result = await buildModule();
    expect(result.files).toContain('scripts/index.js');
    expect(result.files).toContain('templates/deck.hbs');
    expect(result.files).toContain('templates/popout.html');
    const popoutDocument = await readFile(resolve(result.moduleRoot, 'templates/popout.html'), 'utf8');
    expect(popoutDocument).toContain('<!doctype html>');
    expect(popoutDocument).toBe(await readFile(resolve(import.meta.dir, '../src/templates/popout.html'), 'utf8'));
    expect(result.files).toContain('styles/open-session-deck.css');
    for (const name of ['paper', 'leather', 'bookcloth', 'rivet', 'paper-edge', 'tab']) {
      expect(result.files).toContain(`assets/ledger-${name}.webp`);
      expect(await readFile(resolve(result.moduleRoot, `assets/ledger-${name}.webp`))).toEqual(await readFile(resolve(import.meta.dir, `../src/assets/ledger-${name}.webp`)));
    }
    expect(result.files).toContain('lang/en.json');
    expect(result.files).toContain('lang/zh-CN.json');
    expect(result.files).toContain('LICENSE');
    const fontRoot = 'assets/fonts/noto-serif-sc';
    expect(result.files).toContain(`${fontRoot}/OFL.txt`);
    expect(await readFile(resolve(result.moduleRoot, fontRoot, 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE');
    const fontCss = await readFile(resolve(result.moduleRoot, fontRoot, 'font-faces.css'), 'utf8');
    expect(fontCss).toContain('OSD Ledger Serif');
    const fontFiles = new Set([...fontCss.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map((match) => match[1]!));
    expect([...fontFiles].every((file) => !/^https?:\/\//.test(file))).toBe(true);
    expect(fontFiles.size).toBeGreaterThan(10);
    for (const fontFile of fontFiles) {
      expect(result.files).toContain(`${fontRoot}/${fontFile.replace(/^\.\//, '')}`);
      const bytes = await readFile(resolve(result.moduleRoot, fontRoot, fontFile));
      expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
    }
    expect(await readFile(resolve(result.moduleRoot, 'LICENSE'), 'utf8')).toContain('Permission is hereby granted');
    const browser = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    expect(browser).not.toMatch(/node:|process\.env|@fvtt-json-generator\//i);
  }, 15_000);

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
  }, 15_000);
});

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { buildModule, createStoredZip, validateManifest } from '../build.ts';

describe('release contract', () => {
  test('manifest pins Foundry and dnd5e versions and has no hard dependency', async () => {
    const manifest = JSON.parse(await readFile(new URL('../src/module.json', import.meta.url), 'utf8'));
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.socket).toBeUndefined();
    expect(manifest.relationships.requires).toBeUndefined();
    expect(manifest.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ lang: 'en', path: 'lang/en.json' }),
      expect.objectContaining({ lang: 'cn', path: 'lang/zh-CN.json' }),
      expect.objectContaining({ lang: 'zh-CN', path: 'lang/zh-CN.json' }),
    ]));
  });

  test('stored ZIP bytes are deterministic regardless of input order', () => {
    const a = { name: 'a.txt', bytes: new TextEncoder().encode('a') };
    const b = { name: 'b.txt', bytes: new TextEncoder().encode('b') };
    expect(createStoredZip([a, b])).toEqual(createStoredZip([b, a]));
  });

  test('browser build contains the complete module artifact without server imports', async () => {
    const result = await buildModule();
    expect(result.files).toContain('module.json');
    expect(result.files).toContain('scripts/index.js');
    expect(result.files).toContain('lang/en.json');
    expect(result.files).toContain('lang/zh-CN.json');
    expect(result.zipPath.endsWith('fvtt-selected-token-sync.zip')).toBe(true);

    const browserText = await readFile(new URL('../dist/module/scripts/index.js', import.meta.url), 'utf8');
    expect(browserText).toContain('auxclick');
    expect(browserText).toContain('contextmenu');
    expect(browserText).toContain('preCreateActiveEffect');
    expect(browserText).toContain('preDeleteActiveEffect');
    expect(browserText).toContain('preUpdateToken');
    expect(browserText).toContain('movementActions');
    expect(browserText).toContain('movementAction');
    expect(browserText).not.toContain('libWrapper');
    expect(browserText).not.toContain('system.attributes.movement');
  });

  test('English and Simplified Chinese bundles expose the same leaf keys', async () => {
    const leafKeys = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };
    const english = leafKeys(JSON.parse(await readFile(new URL('../src/lang/en.json', import.meta.url), 'utf8'))).sort();
    const chinese = leafKeys(JSON.parse(await readFile(new URL('../src/lang/zh-CN.json', import.meta.url), 'utf8'))).sort();
    expect(chinese).toEqual(english);
  });
});

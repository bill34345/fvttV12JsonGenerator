import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { buildModule, createStoredZip, MODULE_VERSION, validateManifest } from '../build.ts';
import { assertApprovedLab } from '../lab.ts';

describe('release contract', () => {
  test('manifest admits the ServerNext candidate while retaining the old verified target', async () => {
    const manifest = JSON.parse(await readFile(new URL('../src/module.json', import.meta.url), 'utf8'));
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.version).toBe(MODULE_VERSION);
    expect(packageJson.version).toBe(MODULE_VERSION);
    expect(manifest.compatibility).toEqual({ minimum: '14.364', verified: '14.364', maximum: '14.368' });
    expect(manifest.relationships.systems[0].compatibility).toEqual({ minimum: '5.3.3', verified: '5.3.3', maximum: '6.0.5' });
    expect(() => validateManifest({ ...manifest, compatibility: { ...manifest.compatibility, verified: '14.368' } })).toThrow();
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

  test('browser build contains complete module artifact', async () => {
    const result = await buildModule();
    expect(result.files).toContain('module.json');
    expect(result.files).toContain('scripts/index.js');
    expect(result.files).toContain('lang/zh-CN.json');
    expect(result.files).toEqual(expect.arrayContaining([
      'icons/injury.svg',
      'icons/injury-1.svg',
      'icons/injury-2.svg',
      'icons/injury-3.svg',
    ]));
    expect(result.zipPath.endsWith('fvtt-injury-fading-spirits.zip')).toBe(true);
  });

  test('English and Simplified Chinese bundles expose the same keys', async () => {
    const leafKeys = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };
    const english = leafKeys(JSON.parse(await readFile(new URL('../src/lang/en.json', import.meta.url), 'utf8'))).sort();
    const chinese = leafKeys(JSON.parse(await readFile(new URL('../src/lang/zh-CN.json', import.meta.url), 'utf8'))).sort();
    expect(chinese).toEqual(english);

    const assertNoPrefixCollisions = (keys: string[]) => {
      for (const key of keys) {
        expect(keys.some((other) => other !== key && other.startsWith(`${key}.`))).toBe(false);
      }
    };
    assertNoPrefixCollisions(english);
    assertNoPrefixCollisions(chinese);
  });

  test('installer rejects every non-approved Lab root before mutation', () => {
    expect(() => assertApprovedLab({ labRoot: 'C:/temporary/foundry' } as any)).toThrow(/approved local Lab/);
  });
});

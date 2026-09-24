import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildModule, createStoredZip, validateManifest } from '../build.ts';
import { assertApprovedLab } from '../lab.ts';

describe('release contract', () => {
  test('manifest pins exact runtime', async () => {
    const manifest = JSON.parse(await readFile(new URL('../src/module.json', import.meta.url), 'utf8'));
    expect(() => validateManifest(manifest)).not.toThrow();
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
    expect(result.files).toContain('CREDITS.md');
    expect(result.files).toContain('README.zh-CN.md');
    expect(result.files).toEqual(expect.arrayContaining([
      'icons/injury.svg',
      'icons/injury-1.svg',
      'icons/injury-2.svg',
      'icons/injury-3.svg',
    ]));
    expect(result.zipPath.endsWith('fvtt-injury-fading-spirits.zip')).toBe(true);

    const credits = await readFile(resolve(result.moduleRoot, 'CREDITS.md'), 'utf8');
    const readme = await readFile(resolve(result.moduleRoot, 'README.zh-CN.md'), 'utf8');
    expect(credits).toContain('CC BY 3.0');
    expect(credits).toContain('https://creativecommons.org/licenses/by/3.0/legalcode');
    expect(credits).toContain('82d948812bfe3f269ef8f731dcdb07b08160edc4');
    expect(readme).toContain('[CREDITS.md](CREDITS.md)');
    expect(readme).toContain('属于 UI 数据');

    const rows = [...credits.matchAll(/^\| `icons\/(injury(?:-[1-3])?\.svg)` \| [^|]+ \| lorc \| \[[^\]]+\]\(https:\/\/game-icons\.net\/[^)]+\) \| \[download\]\(https:\/\/game-icons\.net\/[^)]+\) \| `([a-f\d]{64})` \|$/gm)];
    expect(rows).toHaveLength(4);
    const expectedHashByFile = new Map(rows.map((match) => [match[1]!, match[2]!]));
    for (const filename of ['injury.svg', 'injury-1.svg', 'injury-2.svg', 'injury-3.svg']) {
      const expectedHash = expectedHashByFile.get(filename);
      expect(expectedHash).toBeDefined();
      if (!expectedHash) throw new Error(`Credits do not list a source hash for ${filename}.`);
      const actualHash = createHash('sha256').update(await readFile(resolve(result.moduleRoot, 'icons', filename))).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
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

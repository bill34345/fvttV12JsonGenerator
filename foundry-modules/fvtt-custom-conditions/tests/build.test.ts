import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildModule, validateManifest } from '../build.ts';

describe('custom conditions release artifact', () => {
  let result: Awaited<ReturnType<typeof buildModule>>;
  beforeAll(async () => {
    result = await buildModule();
  });

  test('copies all independent condition icons into the module ZIP tree', async () => {
    for (const id of [
      'addled', 'bewildered', 'bleeding', 'burning', 'clumsy', 'dazed', 'defenseless',
      'distracted', 'enfeebled', 'frozen', 'helpless', 'immobilized', 'jinxed', 'shocked',
      'sickened', 'slowed', 'staggered', 'valor', 'weakened',
    ]) expect(result.files).toContain(`icons/${id}.svg`);
  });

  test('packages creator attribution and source hashes for every condition icon', async () => {
    expect(result.files).toContain('CREDITS.md');
    expect(result.files).toContain('README.md');
    expect(result.files).toContain('README.zh-CN.md');
    const credits = await readFile(resolve(result.moduleRoot, 'CREDITS.md'), 'utf8');
    const readme = await readFile(resolve(result.moduleRoot, 'README.md'), 'utf8');
    const readmeZh = await readFile(resolve(result.moduleRoot, 'README.zh-CN.md'), 'utf8');
    expect(credits).toContain('CC BY 3.0');
    expect(credits).toContain('https://creativecommons.org/licenses/by/3.0/legalcode');
    expect(credits).toContain('82d948812bfe3f269ef8f731dcdb07b08160edc4');
    expect(readme).toContain('[CREDITS.md](CREDITS.md)');
    expect(readmeZh).toContain('[CREDITS.md](CREDITS.md)');

    const hashesByPath = new Map<string, string>();
    for (const line of credits.split(/\r?\n/)) {
      const match = line.match(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| \[[^\]]+\]\((https:\/\/game-icons\.net\/[^)]+)\) \| \[download\]\((https:\/\/game-icons\.net\/[^)]+)\) \| `([a-f\d]{64})` \|$/);
      if (match) {
        expect(match[4]).toMatch(/\.html$/);
        expect(match[5]).toMatch(/\.svg$/);
        hashesByPath.set(match[1]!, match[6]!);
      }
    }
    for (const id of [
      'addled', 'bewildered', 'bleeding', 'burning', 'clumsy', 'dazed', 'defenseless',
      'distracted', 'enfeebled', 'frozen', 'helpless', 'immobilized', 'jinxed', 'shocked',
      'sickened', 'slowed', 'staggered', 'valor', 'weakened',
    ]) {
      const path = `icons/${id}.svg`;
      const expectedHash = hashesByPath.get(path);
      expect(expectedHash).toBeDefined();
      if (!expectedHash) throw new Error(`Credits do not list a source hash for ${path}.`);
      const actualHash = createHash('sha256').update(await readFile(resolve(result.moduleRoot, path))).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
  });

  test('keeps the exact Foundry and dnd5e release contract', () => {
    expect(() => validateManifest({
      id: 'fvtt-custom-conditions',
      version: '0.2.0',
      compatibility: { minimum: '14.364', verified: '14.364', maximum: '14.368' },
      esmodules: ['scripts/index.js'],
      socket: true,
      relationships: {
        requires: [{ id: 'fvtt-trigger-engine' }],
        systems: [{ id: 'dnd5e', compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '6.0.5' } }],
      },
    })).not.toThrow();
  });
});

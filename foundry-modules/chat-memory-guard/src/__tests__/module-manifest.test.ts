import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const moduleRoot = resolve(import.meta.dir, '..');
const packageRoot = resolve(moduleRoot, '..');

describe('chat memory guard module manifest', () => {
  test('locks the ServerNext target without a false MIDI version dependency', async () => {
    const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8'));
    const packageManifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({
      id: 'chat-memory-guard',
      version: '1.1.0',
      compatibility: { minimum: '14.368', verified: '14.368', maximum: '14.368' },
    });
    expect(manifest.relationships.systems[0]).toMatchObject({
      id: 'dnd5e',
      compatibility: { minimum: '6.0.2', verified: '6.0.2', maximum: '6.0.5' },
    });
    expect(manifest.relationships.recommends).toBeUndefined();
    expect(manifest.languages).toEqual(expect.arrayContaining([
      { lang: 'cn', name: '简体中文', path: 'lang/zh-CN.json' },
      { lang: 'zh-CN', name: '简体中文', path: 'lang/zh-CN.json' },
    ]));
    expect(manifest.version).toBe(packageManifest.version);
  });
});

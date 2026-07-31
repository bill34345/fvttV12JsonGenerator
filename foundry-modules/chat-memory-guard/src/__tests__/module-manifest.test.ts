import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const moduleRoot = resolve(import.meta.dir, '..');
const packageRoot = resolve(moduleRoot, '..');

describe('chat memory guard module manifest', () => {
  test('locks the supported Foundry, dnd5e and MIDI versions', async () => {
    const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8'));
    const packageManifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({
      id: 'chat-memory-guard',
      compatibility: { minimum: '14.364', verified: '14.364', maximum: '14.364' },
    });
    expect(manifest.relationships.systems[0]).toMatchObject({
      id: 'dnd5e',
      compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' },
    });
    expect(manifest.relationships.recommends[0]).toMatchObject({
      id: 'midi-qol',
      compatibility: { minimum: '14.0.11', verified: '14.0.11', maximum: '14.0.11' },
    });
    expect(manifest.languages).toEqual(expect.arrayContaining([
      { lang: 'cn', name: '简体中文', path: 'lang/zh-CN.json' },
      { lang: 'zh-CN', name: '简体中文', path: 'lang/zh-CN.json' },
    ]));
    expect(manifest.version).toBe(packageManifest.version);
  });
});

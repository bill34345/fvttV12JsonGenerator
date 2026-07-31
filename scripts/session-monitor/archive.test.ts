import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { collectArchiveEntries, createStoredZip } from './archive';

const temporary: string[] = [];

afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('session monitor release archive', () => {
  test('collects entries in a stable order and emits deterministic bytes', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'session-monitor-archive-'));
    temporary.push(root);
    await mkdir(resolve(root, 'nested'));
    await writeFile(resolve(root, 'z.txt'), 'last');
    await writeFile(resolve(root, 'nested/a.txt'), 'first');

    const entries = await collectArchiveEntries(root);
    expect(entries.map((entry) => entry.name)).toEqual(['nested/a.txt', 'z.txt']);
    expect(createStoredZip(entries)).toEqual(createStoredZip(entries));
  });

  test('rejects traversal and absolute entry names', () => {
    const bytes = new Uint8Array();
    expect(() => createStoredZip([{ name: '../outside', bytes }])).toThrow(/unsafe/i);
    expect(() => createStoredZip([{ name: '/absolute', bytes }])).toThrow(/unsafe/i);
  });
});

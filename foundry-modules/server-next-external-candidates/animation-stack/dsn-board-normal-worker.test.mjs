import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildBoardNormalFromOfficial } from './dsn-board-normal-worker.mjs';

test('the official 6.4.4 package reproduces all three locally accepted files', async () => {
  const root = process.env.DSN_CONTEXT_OFFICIAL_PACKAGE;
  assert(root, 'Set DSN_CONTEXT_OFFICIAL_PACKAGE to the extracted official 6.4.4 package');
  const [bundle, map] = await Promise.all(['main.js', 'main.js.map'].map(file => readFile(join(root, file), 'utf8')));
  const actual = buildBoardNormalFromOfficial(bundle, map);
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.deepEqual(Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, digest(value)])), {
    bundle: '4a5b7430d85fec1d53339ad49bc34f522dbfcf4ec3b131045855de6f274ae53e',
    map: 'd0f5c5274dca74a7cd674826b81fb40164a1461085d3991f9c3c593c715d63d2',
    worker: '36821366096a2de8574d80b85ed8791e8f8d0f4936571a055964cfd44ae7b89f'
  });
});

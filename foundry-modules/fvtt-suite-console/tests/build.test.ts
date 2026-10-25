import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { assertBrowserBundle, validateManifest } from '../build';

test('browser capability check rejects executable loading and evaluation, allowing quoted documentation', () => {
  expect(() => assertBrowserBundle('const text = "require(\\\"fs\\\"); eval(\\\"note\\\")";')).not.toThrow();
  for (const code of ['import x from "node:fs";', 'import("node:fs")', 'require("node:fs")', 'eval("text")', 'new Function("text")']) {
    expect(() => assertBrowserBundle(code)).toThrow('runtime loading or code execution');
  }
});

test('manifest has only the exact Core and read-only independent browser resources', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/module.json', import.meta.url), 'utf8'));
  expect(() => validateManifest(manifest)).not.toThrow();
  for (const changed of [
    { ...manifest, version: '9.0.0' },
    { ...manifest, compatibility: { ...manifest.compatibility, maximum: '15' } },
    { ...manifest, relationships: { requires: [{ id: 'another-module' }] } },
    { ...manifest, socket: true },
    { ...manifest, packs: [{ name: 'unknown' }] },
  ]) expect(() => validateManifest(changed)).toThrow();
});

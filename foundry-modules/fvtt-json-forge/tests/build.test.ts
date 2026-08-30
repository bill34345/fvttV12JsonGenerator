import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertBrowserBundleSafe, buildModule, validateManifest } from '../build';

describe('FVTT JSON Forge browser build', () => {
  test('contains only the exact manifest, browser entry, template, and stylesheet', async () => {
    const result = await buildModule();
    expect(result.files).toEqual([
      'module.json',
      'scripts/index.js',
      'styles/fvtt-json-forge.css',
      'templates/forge-actor.hbs',
      'templates/forge-intake.hbs',
      'templates/forge-item.hbs',
    ]);
    const manifest = JSON.parse(await readFile(resolve(result.moduleRoot, 'module.json'), 'utf8')) as Record<string, unknown>;
    validateManifest(manifest);
    const bundle = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    assertBrowserBundleSafe(bundle);
    expect(bundle).not.toMatch(/process\.env|\bBun\.|(?:from|require)\s*\(?\s*["'](?:node:|fs|path|sharp|crawlee)/iu);
  }, 30_000);
});

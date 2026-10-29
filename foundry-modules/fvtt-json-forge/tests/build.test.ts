import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertBrowserBundleSafe, buildBrowserBundle, buildModule, validateManifest } from '../build';
import { encounterFixture } from '../../../tests/helpers/forge-encounter';

describe('FVTT JSON Forge browser build', () => {
  test('contains only the exact manifest, browser entry, template, and stylesheet', async () => {
    const result = await buildModule();
    expect(result.files).toEqual([
      'guide/generic-status-source.md',
      'guide/generic-status.forge-encounter.zip',
      'guide/grandmother-sea-hag.forge-encounter.zip',
      'guide/guide.pdf',
      'guide/index.html',
      'guide/source-example.md',
      'module.json',
      'scripts/index.js',
      'styles/fvtt-json-forge.css',
      'templates/forge-actor.hbs',
      'templates/forge-connection.hbs',
      'templates/forge-encounter.hbs',
      'templates/forge-guide.hbs',
      'templates/forge-intake.hbs',
      'templates/forge-item.hbs',
      'templates/forge-workspace.hbs',
      'third-party-licenses.txt',
    ]);
    const manifest = JSON.parse(await readFile(resolve(result.moduleRoot, 'module.json'), 'utf8')) as Record<string, unknown>;
    validateManifest(manifest);
    const bundle = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    assertBrowserBundleSafe(bundle);
    expect(bundle).not.toMatch(/process\.env|\bBun\.|(?:from|require)\s*\(?\s*["'](?:node:|fs|path|sharp|crawlee)/iu);
  }, 30_000);

  test('relative preparation and adapter assertion share one built-browser provenance identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'forge-preparation-identity-'));
    try {
      const output = await buildBrowserBundle({
        entrypoint: resolve(import.meta.dir, 'fixtures/browser-preparation-identity.ts'),
        outdir: directory, naming: 'identity.mjs',
      });
      const bundle = await readFile(output, 'utf8');
      expect(bundle.match(/var preparedProofs\d* = new WeakSet/g)).toHaveLength(1);
      const built = await import(pathToFileURL(output).href) as {
        prepareForgeEncounter: (source: string) => Promise<unknown>;
        assertPreparedForgeEncounter: (value: unknown) => void;
      };
      const prepared = await built.prepareForgeEncounter(JSON.stringify(encounterFixture()));
      expect(() => built.assertPreparedForgeEncounter(prepared)).not.toThrow();
      expect(() => built.assertPreparedForgeEncounter(structuredClone(prepared))).toThrow();
    } finally {
      if (resolve(directory).startsWith(`${resolve(tmpdir())}\\forge-preparation-identity-`)) {
        await rm(directory, { recursive: true });
      }
    }
  }, 30_000);
});

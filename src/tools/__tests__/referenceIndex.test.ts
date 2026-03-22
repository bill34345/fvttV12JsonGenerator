import { describe, expect, it, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildReferenceIndexes,
  decodeHtmlEntities,
  extractHtmlDocData,
  extractSourceSymbols,
  tokenizePath,
} from '../referenceIndex';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('referenceIndex', () => {
  it('extracts titles, headings, and plain text from html docs', () => {
    const html = `
      <html>
        <head><title>Actor - Foundry</title></head>
        <body>
          <h1>Actor</h1>
          <p>Core &amp; data model.</p>
          <h2>Methods</h2>
        </body>
      </html>
    `;

    const extracted = extractHtmlDocData(html);
    expect(extracted.title).toBe('Actor - Foundry');
    expect(extracted.headings).toEqual(['Actor', 'Methods']);
    expect(extracted.text).toContain('Core & data model.');
  });

  it('extracts source symbols and searchable tokens', () => {
    const source = `
      export class ActorSheet {}
      export function buildItem() {}
      const localHelper = () => {};
    `;

    expect(extractSourceSymbols(source)).toEqual(['ActorSheet', 'buildItem']);
    expect(tokenizePath('module/documents/actor-sheet.mjs')).toEqual(['actor', 'documents', 'module', 'sheet']);
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B');
  });

  it('builds local reference indexes and foundry text extracts', () => {
    const root = mkdtempSync(join(tmpdir(), 'reference-index-'));
    roots.push(root);

    const foundryCore = join(root, 'references', 'foundry-v12-api-core', 'classes');
    const dndRepo = join(root, 'references', 'dnd5e-4.3.9', 'repo', 'module', 'documents');
    mkdirSync(foundryCore, { recursive: true });
    mkdirSync(dndRepo, { recursive: true });

    writeFileSync(
      join(root, 'references', 'foundry-v12-api-core', 'index.html'),
      '<html><head><title>Foundry V12</title></head><body><h1>Index</h1></body></html>',
    );
    writeFileSync(
      join(foundryCore, 'client.Actor.html'),
      '<html><head><title>Actor</title></head><body><h1>Actor</h1><p>Actor docs.</p></body></html>',
    );
    writeFileSync(
      join(dndRepo, 'actor.mjs'),
      'export class Actor5e {}\nexport function buildActivity() {}\n',
    );
    writeFileSync(
      join(root, 'references', 'dnd5e-4.3.9', 'repo', 'system.json'),
      '{"id":"dnd5e"}',
    );

    const summary = buildReferenceIndexes(root);

    expect(summary.foundryApiDocs).toBe(2);
    expect(summary.dndRepoFiles).toBe(2);
    expect(existsSync(join(root, 'references', 'foundry-v12-api-core-text', 'classes', 'client.Actor.txt'))).toBe(true);

    const foundryIndex = JSON.parse(
      readFileSync(join(root, 'references', 'indexes', 'foundry-v12-api-core-index.json'), 'utf8'),
    ) as Array<{ relativePath: string }>;
    expect(foundryIndex.some((entry) => entry.relativePath === 'classes/client.Actor.html')).toBe(true);

    const dndTokenIndex = JSON.parse(
      readFileSync(join(root, 'references', 'indexes', 'dnd5e-4.3.9-token-index.json'), 'utf8'),
    ) as Record<string, string[]>;
    expect(dndTokenIndex.actor).toContain('module/documents/actor.mjs');
  });
});

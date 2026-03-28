import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'node:path';
import { PlainTextIngestionWorkflow } from '../../../src/core/ingest/plaintext';
import { ParserFactory } from '../../../src/core/parser/router';

describe('PlainText two-step parsing', () => {
  const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures');
  const COLLECTION_PATH = join(FIXTURE_DIR, 'collection-input.md');

  it('parses collection into 3 creature files', async () => {
    const workflow = new PlainTextIngestionWorkflow({ aiNormalizer: null });
    const result = await workflow.ingest({
      sourcePath: COLLECTION_PATH,
      emitDir: join(FIXTURE_DIR, 'tmp'),
      enableAiNormalize: false,
      dryRun: true,
    });

    expect(result.files).toHaveLength(3);
    expect(result.files[0]?.englishName).toBe('Alyxian Aboleth');
    expect(result.files[1]?.englishName).toBe('Scuttling Serpentmaw');
    expect(result.files[2]?.englishName).toBe('Slithering Bloodfin');
  });

  it('generates fixture with name and slug for alyxian-aboleth', async () => {
    const fixturePath = join(FIXTURE_DIR, 'alyxian-aboleth-structured-actions.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

    expect(fixture.name).toBeDefined();
    expect(fixture.slug).toBe('alyxian-aboleth');
    if (fixture.structuredActions) {
      expect(fixture.structuredActions?.动作).toBeDefined();
      expect(Array.isArray(fixture.structuredActions?.动作)).toBe(true);
    }
  });

  it('generates fixture with name and slug for scuttling-serpentmaw', async () => {
    const fixturePath = join(FIXTURE_DIR, 'scuttling-serpentmaw-structured-actions.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

    expect(fixture.name).toBeDefined();
    expect(fixture.slug).toBe('scuttling-serpentmaw');
    if (fixture.structuredActions) {
      expect(fixture.structuredActions?.动作).toBeDefined();
      expect(Array.isArray(fixture.structuredActions?.动作)).toBe(true);
    }
  });

  it('generates fixture with name and slug for slithering-bloodfin', async () => {
    const fixturePath = join(FIXTURE_DIR, 'slithering-bloodfin-structured-actions.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

    expect(fixture.name).toBeDefined();
    expect(fixture.slug).toBe('slithering-bloodfin');
    if (fixture.structuredActions) {
      expect(fixture.structuredActions?.动作).toBeDefined();
      expect(Array.isArray(fixture.structuredActions?.动作)).toBe(true);
    }
  });

  it('processes individual files through ParserFactory', async () => {
    const inputPath = join(
      process.cwd(),
      'obsidian',
      'dnd数据转fvttjson',
      'input',
      'alyxian-aboleth__底栖魔鱼\u201c阿利克辛\u201d.md',
    );
    const markdown = readFileSync(inputPath, 'utf-8');
    const parserFactory = new ParserFactory();
    const parsed = parserFactory.parse(markdown);

    expect(parsed.name).toContain('底栖魔鱼');
    expect(parsed.type).toBe('npc');
  });
});
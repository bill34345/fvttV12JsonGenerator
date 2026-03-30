import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ActorGenerator } from '../../generator/actor';
import { ParserFactory } from '../../parser/router';
import {
  PlainTextIngestionWorkflow,
  parseCreatureBlock,
  splitCollection,
} from '../plaintext';

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/plaintext');
const SOURCE_PATH = resolve(
  FIXTURE_DIR,
  readdirSync(FIXTURE_DIR).find((file) => file.toLowerCase().endsWith('.md')) ?? '',
);

class FailingAiNormalizer {
  public async normalizeBlock(): Promise<string> {
    throw new Error('upstream failed');
  }
}

function getBlock(englishName: string) {
  const text = readFileSync(SOURCE_PATH, 'utf-8');
  const block = splitCollection(text).find((entry) => entry.englishName === englishName);
  expect(block).toBeDefined();
  if (!block) {
    throw new Error(`Expected creature block for ${englishName}`);
  }
  return block;
}

async function generateActorFromBlock(englishName: string) {
  const block = getBlock(englishName);
  const generated = parseCreatureBlock(block.rawBlock);
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(generated.markdown);
  const parsed = parserFactory.parse(generated.markdown);
  const actor = await new ActorGenerator({
    fvttVersion: '12',
    translationService: null,
    effectProfile: 'modded-v12',
  }).generateForRoute(parsed, route);
  return { generated, parsed, actor };
}

describe('PlainTextIngestionWorkflow', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('splits the fixture collection into 7 creature blocks with bilingual names', () => {
    const text = readFileSync(SOURCE_PATH, 'utf-8');
    const blocks = splitCollection(text);

    expect(blocks).toHaveLength(7);
    expect(blocks[0]?.englishName).toBe('Scuttling Serpentmaw');
    expect(blocks[1]?.englishName).toBe('Slithering Bloodfin');
    expect(blocks[6]?.englishName).toBe("Death's Embrace");
  });

  it('emits stable bilingual filenames and sectioned markdown', () => {
    const first = getBlock('Scuttling Serpentmaw');
    const parsed = parseCreatureBlock(first.rawBlock);

    expect(parsed.fileName).toBe('scuttling-serpentmaw__蛇口蛮蟹.md');
    expect(parsed.markdown).toContain('### 特性');
    expect(parsed.markdown).toContain('### 动作');
    expect(parsed.markdown).not.toContain('### 原始备注');
  });

  it('writes 7 markdown files when not in dry-run mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-ingest-'));
    roots.push(root);

    const workflow = new PlainTextIngestionWorkflow({ aiNormalizer: null });
    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: root,
      dryRun: false,
    });

    expect(result.files).toHaveLength(7);
    expect(existsSync(join(root, 'scuttling-serpentmaw__蛇口蛮蟹.md'))).toBe(true);
    expect(existsSync(join(root, 'slithering-bloodfin__滑行血鳍.md'))).toBe(true);
  });

  it('does not write files in dry-run mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-dry-run-'));
    roots.push(root);

    const workflow = new PlainTextIngestionWorkflow({ aiNormalizer: null });
    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: root,
      dryRun: true,
    });

    expect(result.files).toHaveLength(7);
    expect(existsSync(join(root, 'scuttling-serpentmaw__蛇口蛮蟹.md'))).toBe(false);
  });

  it('falls back to rule-based normalization when AI normalization fails', async () => {
    const workflow = new PlainTextIngestionWorkflow({
      aiNormalizer: new FailingAiNormalizer(),
    });

    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: tmpdir(),
      dryRun: true,
      enableAiNormalize: true,
    });

    expect(result.files).toHaveLength(7);
    expect(result.files[0]?.fileName).toBe('scuttling-serpentmaw__蛇口蛮蟹.md');
  });

  it('bridges generated markdown into parsed actions and actor items', async () => {
    const { parsed, actor } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.actions?.length).toBeGreaterThan(0);
    expect(parsed.bonus_actions?.length).toBeGreaterThan(0);
    expect(parsed.reactions?.length).toBeGreaterThan(0);
    expect(actor.items.some((item) => item.name.includes('(Swallow)'))).toBe(true);
    expect(actor.items.some((item) => item.system?.activation?.type === 'reaction')).toBe(true);
  });

  it('maps structured sense notes into actor senses.special for Scuttling Serpentmaw', async () => {
    const { parsed, actor } = await generateActorFromBlock('Scuttling Serpentmaw');

    expect(parsed.traits.senses).toEqual({
      blindsight: 60,
      special: '盲视: 超出该范围则视为目盲',
    });
    expect(parsed.skillPassives?.prc).toBe(10);
    expect(actor.system.attributes.senses.blindsight).toBe(60);
    expect(actor.system.attributes.senses.special).toContain('超出该范围则视为目盲');
  });

  it('maps hit point ranges to stable midpoint values while preserving the original range note', () => {
    const bloodfin = parseCreatureBlock(getBlock('Slithering Bloodfin').rawBlock);
    const lightDevourer = parseCreatureBlock(getBlock('Light Devourer').rawBlock);

    expect(bloodfin.markdown).toContain("生命值: '143'");
    expect(bloodfin.markdown).toContain('### 原始备注');
    expect(bloodfin.markdown).toContain('生命值原始范围: 135-150');
    expect(lightDevourer.markdown).toContain("生命值: '180'");
    expect(lightDevourer.markdown).toContain('### 原始备注');
    expect(lightDevourer.markdown).toContain('生命值原始范围: 160-200');
    expect(lightDevourer.markdown).toContain('160-200');
  });

  it('parses Chinese senses without English parenthetical labels into parsed actor data', async () => {
    const { parsed, actor } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.attributes.hp).toEqual({
      value: 143,
      max: 143,
    });
    expect(parsed.traits.senses).toEqual({
      blindsight: 100,
    });
    expect(parsed.skillPassives?.prc).toBe(14);
    expect(actor.system.attributes.senses.blindsight).toBe(100);
    expect(actor.system.skills.prc.bonuses.passive).toBe('');
  });

  it('captures Bloodfin saving throws from the bilingual Saves line in plaintext input', async () => {
    const { parsed } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.saves).toContain('dex');
    expect(parsed.saveBonuses?.dex ?? 0).toBe(0);
  });

  it('maps daily uses, recharge, and reaction costs from plaintext-derived action text into actor data', async () => {
    const { actor: bloodfinActor } = await generateActorFromBlock('Slithering Bloodfin');
    const { actor: sharkActor } = await generateActorFromBlock('Corrupted Giant Shark');
    const { actor: embraceActor } = await generateActorFromBlock("Death's Embrace");

    const screech = bloodfinActor.items.find((item) => item.name.includes('(Pelagic Screech)'));
    const ram = sharkActor.items.find((item) => item.name.includes('(Ram)'));
    const bodyShield = embraceActor.items.find((item) => item.name.includes('(Body Shield)'));

    expect(screech?.system?.uses).toEqual(
      expect.objectContaining({
        value: 1,
        max: 1,
        per: 'day',
        spent: 0,
      }),
    );
    expect(screech?.system?.uses?.recovery?.[0]).toEqual(
      expect.objectContaining({
        period: 'day',
        type: 'recoverAll',
      }),
    );
    expect(
      Object.values(ram?.system?.activities ?? {})[0]?.uses?.recovery?.[0],
    ).toEqual(expect.objectContaining({ period: 'recharge', formula: '5' }));
    expect(bodyShield?.system?.activation?.cost).toBe(2);
  });

  it('keeps the fixture markdown compatible with parser routing', () => {
    const generated = parseCreatureBlock(getBlock('Scuttling Serpentmaw').rawBlock);
    const parserFactory = new ParserFactory();
    const route = parserFactory.detectRoute(generated.markdown);
    const parsed = parserFactory.parse(generated.markdown);

    expect(route).toBe('chinese');
    expect(parsed.name.length).toBeGreaterThan(0);
    expect(parsed.type).toBe('npc');
  });

  it('preserves nested Venomous Bite rider lines as multiline action text for Scuttling Serpentmaw', () => {
    const generated = parseCreatureBlock(getBlock('Scuttling Serpentmaw').rawBlock);
    const parsed = new ParserFactory().parse(generated.markdown);
    const venomousBite = parsed.actions?.find(
      (entry) => typeof entry === 'string' && entry.startsWith('毒液咬击 (Venomous Bite)'),
    );

    expect(venomousBite).toBeDefined();
    expect(venomousBite).toContain('\n盐水电击 (Brine-shock)');
    expect(venomousBite).toContain('\n针刺噬咬 (Needling Bite)');
    expect(venomousBite).toContain('\n吸血噬咬 (Vampiric Bite)');
  });
});

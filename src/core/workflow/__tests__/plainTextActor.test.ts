import { afterAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SOURCE_PATH = resolve(
  process.cwd(),
  'tests/fixtures/plaintext/月蚀矿腐化生物数据.md',
);

setDefaultTimeout(30000);

describe('PlainTextActorWorkflow', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes middle markdown, promotes it to vault/input, and writes actor json into vault/output', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-actors-'));
    roots.push(vaultPath);

    const { PlainTextActorWorkflow } = await import('../plainTextActor');
    const workflow = new PlainTextActorWorkflow();

    const result = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    expect(result.markdown.files).toHaveLength(7);
    expect(result.markdown.emitDir).toBe(join(vaultPath, 'middle'));
    expect(result.sync.processed).toBe(7);
    expect(existsSync(join(vaultPath, 'middle', 'slithering-bloodfin__滑行血鳍.md'))).toBe(true);
    expect(existsSync(join(vaultPath, 'input', 'slithering-bloodfin__滑行血鳍.md'))).toBe(true);
    expect(existsSync(join(vaultPath, 'output', 'slithering-bloodfin__滑行血鳍.json'))).toBe(true);
  });

  it('keeps swallow, reactions, and corrected modded semantics in the generated Slithering Bloodfin actor', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-bloodfin-'));
    roots.push(vaultPath);

    const { PlainTextActorWorkflow } = await import('../plainTextActor');
    const workflow = new PlainTextActorWorkflow();

    await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    const actor = JSON.parse(
      readFileSync(join(vaultPath, 'output', 'slithering-bloodfin__滑行血鳍.json'), 'utf-8'),
    ) as {
      prototypeToken?: { detectionModes?: Array<{ id?: string; range?: number }> };
      items: Array<{
        name: string;
        effects?: any[];
        flags?: any;
        system?: { activation?: { type?: string }; activities?: Record<string, any> };
      }>;
    };

    const swallow = actor.items.find((item) => item.name.includes('吞咽'));
    const tailCrash = actor.items.find((item) => item.name.includes('尾击'));

    expect(swallow).toBeDefined();
    expect(actor.items.some((item) => item.system?.activation?.type === 'reaction')).toBe(true);
    expect((swallow?.effects ?? []).some((effect) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
    expect((tailCrash?.effects ?? []).length ?? 0).toBe(0);
    expect(tailCrash?.flags?.fvttJsonGenerator?.effectHints).toEqual(
      expect.objectContaining({
        heavyHit: true,
        dazed: true,
        bleed: true,
      }),
    );
    expect(actor.prototypeToken?.detectionModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'blindsight',
          range: 100,
        }),
      ]),
    );
  });

  it('skips the source collection file when the plaintext source already lives under vault/input', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-source-in-vault-'));
    roots.push(vaultPath);

    const inputDir = join(vaultPath, 'input');
    mkdirSync(inputDir, { recursive: true });
    const sourcePath = join(inputDir, 'source-collection.md');
    writeFileSync(sourcePath, readFileSync(SOURCE_PATH, 'utf-8'));

    const { PlainTextActorWorkflow } = await import('../plainTextActor');
    const workflow = new PlainTextActorWorkflow();

    const result = await workflow.ingestActors({
      sourcePath,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    expect(result.markdown.files).toHaveLength(7);
    expect(result.sync.processed).toBe(7);
    expect(result.sync.failed).toBe(0);
    expect(
      result.sync.failures.some((failure) => failure.input.includes('source-collection.md')),
    ).toBe(false);
  });

  it('keeps complex reaction item names concise instead of swallowing the whole description', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-reaction-name-'));
    roots.push(vaultPath);

    const { PlainTextActorWorkflow } = await import('../plainTextActor');
    const workflow = new PlainTextActorWorkflow();

    const result = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    const bloodfinFile = result.markdown.files.find((file) => file.slug === 'slithering-bloodfin');
    expect(bloodfinFile).toBeDefined();
    if (!bloodfinFile) {
      throw new Error('Expected Slithering Bloodfin markdown file');
    }

    const actor = JSON.parse(
      readFileSync(
        join(vaultPath, 'output', bloodfinFile.fileName.replace(/\.md$/i, '.json')),
        'utf-8',
      ),
    ) as { items: Array<{ name: string }> };

    expect(
      actor.items.some((item) => item.name.includes('(Pelagic Screech)') && !item.name.includes('姣忔棩')),
    ).toBe(true);
    expect(
      actor.items.some((item) => item.name.includes('姣忔棩 1 娆?')),
    ).toBe(false);
  });

  it('reprocesses generated markdown on repeated dual-artifact runs instead of letting the manifest pin stale json', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-rerun-'));
    roots.push(vaultPath);

    const { PlainTextActorWorkflow } = await import('../plainTextActor');
    const workflow = new PlainTextActorWorkflow();

    const first = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });
    expect(first.sync.processed).toBe(7);

    const second = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    expect(second.sync.processed).toBe(7);
    expect(second.sync.skipped).toBe(0);
    expect(second.sync.backedUp).toBe(7);
  });
});

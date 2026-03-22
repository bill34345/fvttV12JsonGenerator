import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActorGenerator } from '../actor';
import { ParserFactory } from '../../parser/router';
import { splitCollection, parseCreatureBlock } from '../../ingest/plaintext';

const SOURCE_PATH = resolve(
  process.cwd(),
  'tests/fixtures/plaintext/月蚀矿腐化生物数据.md',
);

function loadActor(effectProfile: 'core' | 'modded-v12') {
  const text = readFileSync(SOURCE_PATH, 'utf-8');
  const target = splitCollection(text).find((block) => block.englishName === 'Slithering Bloodfin');
  if (!target) {
    throw new Error('Expected Slithering Bloodfin block');
  }

  const generated = parseCreatureBlock(target.rawBlock);
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(generated.markdown);
  const parsed = parserFactory.parse(generated.markdown);

  return new ActorGenerator({
    fvttVersion: '12',
    translationService: null,
    effectProfile,
  } as any).generateForRoute(parsed, route);
}

describe('ActorGenerator effect profiles', () => {
  it('core omits midi-qol over-time automation for bleed and does not create swallow placeholder effects', async () => {
    const actor = await loadActor('core');
    const swallow = actor.items.find((item: any) => item.name.includes('吞咽'));
    expect(swallow).toBeDefined();
    expect(
      actor.items.some((item: any) =>
        (item.effects ?? []).some((effect: any) => Boolean(effect?.flags?.['midi-qol.OverTime'])),
      ),
    ).toBe(false);
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
  });

  it('modded-v12 does not create unconditional swallow or bleed placeholder effects', async () => {
    const actor = await loadActor('modded-v12');
    const swallow = actor.items.find((item: any) => item.name.includes('吞咽'));
    expect(swallow).toBeDefined();
    expect(
      actor.items.some((item: any) =>
        (item.effects ?? []).some((effect: any) => Boolean(effect?.flags?.['midi-qol.OverTime'])),
      ),
    ).toBe(false);
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
  });

  it('modded-v12 preserves Heavy Hit and Dazed as structured hints instead of resolving branches', async () => {
    const actor = await loadActor('modded-v12');
    const hintedItem = actor.items.find(
      (item: any) =>
        item.flags?.fvttJsonGenerator?.effectHints?.heavyHit &&
        item.flags?.fvttJsonGenerator?.effectHints?.dazed,
    );
    expect(hintedItem).toBeDefined();
    expect(hintedItem.effects ?? []).toHaveLength(0);
    for (const activity of Object.values(hintedItem.system.activities ?? {}) as any[]) {
      expect(activity.effects ?? []).toHaveLength(0);
    }
  });
});

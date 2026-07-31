import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';

const inputDir = join(import.meta.dir, '..', '..', '..', '..', 'obsidian', 'dnd数据转fvttjson', 'input');

function source(name: string): string {
  return readFileSync(join(inputDir, `${name}.md`), 'utf8');
}

function item(actor: any, name: string): any {
  const result = actor.items.find((entry: any) => entry.name === name);
  expect(result).toBeDefined();
  return result;
}

function activities(entry: any): any[] {
  return Object.values(entry.system.activities ?? {});
}

async function generate(name: string, target: '12' | '14'): Promise<any> {
  const result = await convertMarkdownContentToJson({
    content: source(name),
    sourcePath: `${name}.md`,
    fvttVersion: target,
    effectProfile: 'core',
  });
  expect(['accepted', 'needs_review']).toContain(result.status);
  return result.rawJson;
}

describe.each(['12', '14'] as const)('Netherdeep real resource actors for v%s', (target) => {
  it('keeps Tainted Shellcreeper overload visible, spendable, scalable, and linked to AC 11 cracking', async () => {
    const actor = await generate('tainted-shellcreeper', target);
    const carrier = item(actor, '反魔法甲壳 (Antimagic Shell)');
    const reverberations = item(actor, '心灵回震 (Psychic Reverberations)');
    const crack = item(actor, '击穿过载 (Crack the Overload)');

    expect(carrier.system.uses).toEqual({ spent: 2, max: '2', recovery: [] });
    expect(activities(carrier).some((activity) =>
      activity.flags?.fvttJsonGenerator?.resourceOperation?.id === 'gain-shell-overload')).toBe(true);
    const empowered = activities(reverberations).find((activity) =>
      activity.flags?.fvttJsonGenerator?.resourceConsumption?.id === 'psychic-reverberations-overload');
    expect(empowered.consumption.scaling).toEqual({ allowed: true, max: '2' });
    expect(empowered.consumption.targets).toContainEqual(expect.objectContaining({
      target: carrier._id,
      value: '1',
      scaling: { mode: 'amount', formula: '' },
    }));
    expect(empowered.damage.parts).toContainEqual(expect.objectContaining({
      formula: '3',
      types: ['force'],
      scaling: { mode: 'whole', number: 0, formula: '3' },
    }));
    expect(crack.effects).toContainEqual(expect.objectContaining({
      changes: [expect.objectContaining({
        key: 'system.attributes.ac.flat',
        mode: 5,
        value: '11',
      })],
    }));
  });

  it('keeps all twelve Urchin spikes, native costs, long-rest recovery, and exact AC tiers', async () => {
    const actor = await generate('urchin-spikeshooter', target);
    const carrier = item(actor, '消耗棘刺 (Depleting Spikes)');
    expect(carrier.system.uses).toEqual({
      spent: 0,
      max: '12',
      recovery: [{ period: 'lr', type: 'recoverAll' }],
    });
    const costs = [
      ['棘刺 (Spike)', 'spike-cost', '1'],
      ['钉刺齐射 (Pinning Volley)', 'pinning-volley-cost', '3'],
      ['反冲漂移 (Recoil Drift)', 'recoil-drift-cost', '1'],
    ] as const;
    for (const [name, id, value] of costs) {
      const consumer = item(actor, name);
      const activity = activities(consumer).find((entry) =>
        entry.flags?.fvttJsonGenerator?.resourceConsumption?.id === id);
      expect(activity.consumption.targets).toContainEqual(expect.objectContaining({
        target: carrier._id,
        value,
      }));
    }
    expect(carrier.effects.map((effect: any) => effect.changes[0].value))
      .toEqual(['12', '14', '16', '18', '20']);
    if (target === '14') {
      expect(carrier.effects.map((effect: any) => effect.changes[0])).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'system.attributes.ac.value', phase: 'final', value: '12' }),
        expect.objectContaining({ key: 'system.attributes.ac.value', phase: 'final', value: '20' }),
      ]));
    } else {
      expect(carrier.effects.map((effect: any) => effect.changes[0])).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'system.attributes.ac.flat', value: '12' }),
        expect.objectContaining({ key: 'system.attributes.ac.flat', value: '20' }),
      ]));
    }
    expect(carrier.effects.every((effect: any) =>
      effect.flags?.fvttJsonGenerator?.resourceTier?.switching === 'manual')).toBe(true);
  });

  it('keeps Caelian Shell Resonance at one and charges every declared spender', async () => {
    const actor = await generate('caelian-sea-snail', target);
    const carrier = item(actor, '反魔法甲壳 (Antimagic Shell)');
    expect(carrier.system.uses).toEqual({ spent: 1, max: '1', recovery: [] });
    for (const [name, id] of [
      ['耀目折光 (Dazzling Refraction)', 'dazzling-refraction-cost'],
      ['流光加速 (Iridescent Haste)', 'iridescent-haste-cost'],
      ['力场谐振 (Force Resonance)', 'force-resonance-cost'],
    ] as const) {
      const consumer = item(actor, name);
      const activity = activities(consumer).find((entry) =>
        entry.flags?.fvttJsonGenerator?.resourceConsumption?.id === id);
      expect(activity.consumption.targets).toContainEqual(expect.objectContaining({
        target: carrier._id,
        value: '1',
      }));
    }
  });

  it('keeps Red Kelp gain/loss, optional radius spend, and three-for-one Bloom recovery', async () => {
    const actor = await generate('red-kelp', target);
    const carrier = item(actor, '奥术滋养 (Arcane Feeding)');
    const bloom = item(actor, '藻华 (Algal Bloom)');
    expect(carrier.system.uses).toEqual({ spent: 3, max: '3', recovery: [] });
    expect(activities(carrier).filter((activity) =>
      activity.flags?.fvttJsonGenerator?.resourceOperation)).toHaveLength(2);
    const expanded = activities(bloom).find((activity) =>
      activity.flags?.fvttJsonGenerator?.resourceConsumption?.id === 'algal-bloom-radius');
    expect(expanded.target.template.size).toBe('15 + 5 * @scaling');
    expect(expanded.consumption.spellSlot).toBe(false);
    expect(expanded.consumption.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: '', value: '1' }),
      expect.objectContaining({
        target: carrier._id,
        value: '1',
        scaling: { mode: 'amount', formula: '' },
      }),
    ]));
    const transition = activities(bloom).find((activity) =>
      activity.flags?.fvttJsonGenerator?.resourceTransition?.id === 'bloom-energy-conversion');
    expect(transition.consumption.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: carrier._id, value: '3' }),
      expect.objectContaining({ target: '', value: '-min(1, @item.uses.spent)' }),
    ]));
  });
});

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ParserFactory } from '../../parser/router';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { assertEqualStructure } from '../../utils/assertEqualStructure';

const fixtureDir = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

function itemByName(actor: any, name: string): any {
  const item = actor.items.find((entry: any) => entry.name === name);
  expect(item).toBeDefined();
  return item;
}

function activities(item: any): any[] {
  return Object.values(item.system.activities ?? {});
}

function resourceProjection(actor: any): unknown {
  return actor.items
    .filter((item: any) => item.flags?.fvttJsonGenerator?.resource)
    .map((item: any) => ({
      _id: item._id,
      name: item.name,
      uses: item.system.uses,
      resource: item.flags.fvttJsonGenerator.resource,
      operations: activities(item)
        .filter((activity: any) => activity.flags?.fvttJsonGenerator?.resourceOperation)
        .map((activity: any) => ({
          type: activity.type,
          activation: activity.activation,
          consumption: activity.consumption,
          operation: activity.flags.fvttJsonGenerator.resourceOperation,
        })),
      tiers: item.effects
        .filter((effect: any) => effect.flags?.fvttJsonGenerator?.resourceTier)
        .map((effect: any) => ({
          changes: effect.changes.map((change: any) => ({
            mode: change.mode,
            value: change.value,
          })),
          transfer: effect.transfer,
          tier: effect.flags.fvttJsonGenerator.resourceTier,
        })),
    }));
}

describe('source-derived Actor resource semantics', () => {
  it('parses strict resources, bindings, variable scaling, tiers, and transitions from one explicit contract', () => {
    const parsed = new ParserFactory().parse(fixture('actor-resource-semantics.md')) as any;

    expect(parsed.resourceSemantics.resources).toHaveLength(3);
    expect(parsed.resourceSemantics.resources.map((entry: any) => entry.id)).toEqual([
      'shell-energy',
      'spikes',
      'bloom',
    ]);
    expect(parsed.resourceSemantics.resources[1]).toMatchObject({
      initial: 12,
      max: 12,
      recovery: 'lr',
      derived: [{
        id: 'spike-ac',
        type: 'ac',
        tiers: [
          { min: 0, max: 2, value: 12 },
          { min: 3, max: 5, value: 14 },
          { min: 6, max: 8, value: 16 },
          { min: 9, max: 11, value: 18 },
          { min: 12, max: 12, value: 20 },
        ],
      }],
    });
    expect(parsed.resourceSemantics.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'spike-shot-cost', resourceId: 'spikes', mode: 'fixed', amount: 1 }),
      expect.objectContaining({
        id: 'shell-burst-variable',
        resourceId: 'shell-energy',
        mode: 'variable',
        min: 1,
        max: 2,
        optional: true,
        scaling: { damage: { base: '3', perStep: '3', type: 'force' } },
      }),
      expect.objectContaining({
        id: 'bloom-cloud-variable',
        resourceId: 'bloom',
        scaling: { range: { base: 15, perStep: 5 } },
      }),
    ]));
    expect(parsed.resourceSemantics.transitions[0]).toMatchObject({
      id: 'bloom-conversion',
      mutations: [
        { type: 'resource', resourceId: 'bloom', mode: 'spend', amount: 3 },
        { type: 'itemUses', mode: 'recover', amount: 1 },
      ],
    });
  });

  it.each(['12', '14'] as const)(
    'projects native shared uses, fixed/variable consumption, scaling, transitions, and tier controls for v%s',
    async (target) => {
      const result = await convertMarkdownContentToJson({
        content: fixture('actor-resource-semantics.md'),
        sourcePath: `actor-resource-semantics-v${target}.md`,
        fvttVersion: target,
        effectProfile: 'core',
      });
      const actor = result.rawJson as any;

      expect(result.status).toBe('accepted');
      expect(result.verification.mechanicsCoverage.filter((entry) =>
        entry.kind.startsWith('resource'))).toHaveLength(9);

      const shell = itemByName(actor, '反魔甲壳 (Antimagic Carapace)');
      const spikes = itemByName(actor, '棘刺储备 (Spike Reserve)');
      const bloom = itemByName(actor, '奥术滋养 (Arcane Feeding)');
      expect(shell._id).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(shell.system.uses).toEqual({ spent: 2, max: '2', recovery: [] });
      expect(spikes.system.uses).toEqual({
        spent: 0,
        max: '12',
        recovery: [{ period: 'lr', type: 'recoverAll' }],
      });
      expect(bloom.system.uses).toEqual({ spent: 3, max: '3', recovery: [] });

      const gainShell = activities(shell).find((activity) =>
        activity.flags?.fvttJsonGenerator?.resourceOperation?.id === 'gain-shell-energy');
      const clearShell = activities(shell).find((activity) =>
        activity.flags?.fvttJsonGenerator?.resourceOperation?.id === 'clear-shell-energy');
      expect(gainShell.consumption.targets).toContainEqual(expect.objectContaining({
        type: 'itemUses',
        target: '',
        value: '-min(1, @item.uses.spent)',
      }));
      expect(clearShell.consumption.targets).toContainEqual(expect.objectContaining({
        type: 'itemUses',
        target: '',
        value: '@item.uses.value',
      }));

      const spikeShot = itemByName(actor, '棘刺射击 (Spike Shot)');
      const spikeVolley = itemByName(actor, '棘刺齐射 (Spike Volley)');
      expect(activities(spikeShot)[0].consumption.targets).toContainEqual(expect.objectContaining({
        type: 'itemUses',
        target: spikes._id,
        value: '1',
      }));
      expect(activities(spikeVolley)[0].consumption.targets).toContainEqual(expect.objectContaining({
        type: 'itemUses',
        target: spikes._id,
        value: '3',
      }));

      const psychicBurst = itemByName(actor, '心灵爆发 (Psychic Burst)');
      const empoweredBurst = activities(psychicBurst).find((activity) =>
        activity.flags?.fvttJsonGenerator?.resourceConsumption?.id === 'shell-burst-variable');
      expect(empoweredBurst).toBeDefined();
      expect(empoweredBurst.consumption).toMatchObject({
        scaling: { allowed: true, max: '2' },
        targets: [expect.objectContaining({
          type: 'itemUses',
          target: shell._id,
          value: '1',
          scaling: { mode: 'amount', formula: '' },
        })],
      });
      expect(empoweredBurst.damage.parts).toContainEqual(expect.objectContaining({
        formula: '3',
        types: ['force'],
        scaling: { mode: 'whole', number: 0, formula: '3' },
      }));

      const bloomCloud = itemByName(actor, '绽放云 (Bloom Cloud)');
      const expandedCloud = activities(bloomCloud).find((activity) =>
        activity.flags?.fvttJsonGenerator?.resourceConsumption?.id === 'bloom-cloud-variable');
      expect(expandedCloud.target.template.size).toBe('15 + 5 * @scaling');
      const transition = activities(bloomCloud).find((activity) =>
        activity.flags?.fvttJsonGenerator?.resourceTransition?.id === 'bloom-conversion');
      expect(transition.consumption.targets).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'itemUses', target: bloom._id, value: '3' }),
        expect.objectContaining({
          type: 'itemUses',
          target: '',
          value: '-min(1, @item.uses.spent)',
        }),
      ]));

      expect(spikes.effects.filter((effect: any) =>
        effect.flags?.fvttJsonGenerator?.resourceTier)).toHaveLength(5);
      const expectedChange = target === '14'
        ? { key: 'system.attributes.ac.value', mode: 5, phase: 'final' }
        : { key: 'system.attributes.ac.flat', mode: 5 };
      expect(spikes.effects.map((effect: any) => effect.changes?.[0])).toEqual(expect.arrayContaining([
        expect.objectContaining({ ...expectedChange, value: '12' }),
        expect.objectContaining({ ...expectedChange, value: '20' }),
      ]));
    },
  );

  it('keeps v12 and v14 resource projections structurally aligned', async () => {
    const content = fixture('actor-resource-semantics.md');
    const v12 = await convertMarkdownContentToJson({ content, fvttVersion: '12', effectProfile: 'core' });
    const v14 = await convertMarkdownContentToJson({ content, fvttVersion: '14', effectProfile: 'core' });

    assertEqualStructure(resourceProjection(v12.rawJson), resourceProjection(v14.rawJson), { mode: 'shape' });
  });

  it('does not infer resources from close prose or alter an unrelated Actor', async () => {
    const closeNegative = await convertMarkdownContentToJson({
      content: fixture('actor-resource-close-negative.md'),
      fvttVersion: '14',
      effectProfile: 'core',
    });
    const closeActor = closeNegative.rawJson as any;

    expect(closeActor.items.some((item: any) => item.flags?.fvttJsonGenerator?.resource)).toBe(false);
    expect(closeActor.items.every((item: any) => item._id === undefined)).toBe(true);

    const unrelated = new ParserFactory().parse(fixture('actor-resource-close-negative.md')) as any;
    expect(unrelated.resourceSemantics).toBeUndefined();
  });

  it('fails closed on duplicate IDs and incomplete derived tier coverage', () => {
    const source = fixture('actor-resource-semantics.md');
    const duplicateId = source.replace('ID: spikes', 'ID: shell-energy');
    const incompleteTiers = source.replace(
      '            - 最小: 12\n              最大: 12\n              值: 20\n',
      '',
    );

    expect(() => new ParserFactory().parse(duplicateId))
      .toThrow('InvalidResourceSemantics: 资源机制.资源[1].ID: duplicate ID "shell-energy"');
    expect(() => new ParserFactory().parse(incompleteTiers))
      .toThrow('tiers must cover 0..12 without gaps or overlap');
  });

  it('fails closed on unknown nested fields and unsupported variable-scaling bounds', () => {
    const source = fixture('actor-resource-semantics.md');
    const unknownField = source.replace(
      '      恢复: lr\n',
      '      恢复: lr\n      猜测机制: true\n',
    );
    const nonUnitMinimum = source.replace(
      '      最小: 1\n      最大: 2\n',
      '      最小: 2\n      最大: 2\n',
    );

    expect(() => new ParserFactory().parse(unknownField))
      .toThrow('资源机制.资源[1].猜测机制: unknown field');
    expect(() => new ParserFactory().parse(nonUnitMinimum))
      .toThrow('the current native amount-scaling contract requires 1 = min');
  });
});

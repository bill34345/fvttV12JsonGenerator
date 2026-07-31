import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { assertEqualStructure } from '../../utils/assertEqualStructure';

const inputDir = join(import.meta.dir, '..', '..', '..', '..', 'obsidian', 'dnd数据转fvttjson', 'input');

const corpus = [
  ['caelian-sea-snail', ['caelian-resonance-relations', 'caelian-one-attack-defense']],
  ['tainted-shellcreeper', ['shellcreeper-overload-lifecycle', 'shellcreeper-defense-posture', 'shellcreeper-ruidium-corruption']],
  ['urchin-spikeshooter', ['urchin-spike-thresholds', 'urchin-pinning-lifecycle']],
  ['red-kelp', ['red-kelp-event-triggers', 'red-kelp-bloom-area']],
  ['corrupted-seadragon', ['seadragon-combat-relations', 'seadragon-fracture-and-corruption']],
  ['crystalbleed-drakon', ['drakon-defiance-state', 'drakon-tail-and-legendary-relations', 'drakon-nightmare-lifecycle', 'drakon-ruidium-corruption']],
  ['eye-of-the-deep', ['eye-eyestalk-disable', 'eye-pincer-capacity', 'eye-ray-and-reel-lifecycle']],
  ['moldering-behemoth', ['behemoth-turn-and-charge', 'behemoth-fault-and-bloodied-stage', 'behemoth-ruidium-corruption']],
  ['nautiloid', ['nautiloid-planar-choice-pool', 'nautiloid-earth-state-machine', 'nautiloid-rejection-and-forwarding']],
  ['swarm-of-sorrowfish__哀恸鱼集群', ['sorrowfish-virulent-and-scatter', 'sorrowfish-bloodied-bites', 'sorrowfish-drain-lifecycle']],
  ['vampire-squid', ['squid-light-and-regeneration', 'squid-tentacle-capacity', 'squid-bite-and-allure', 'squid-crimson-veil-area', 'squid-ruidium-corruption']],
] as const;

function source(name: string): string {
  return readFileSync(join(inputDir, `${name}.md`), 'utf8');
}

async function generate(name: string, target: '12' | '14') {
  return convertMarkdownContentToJson({
    content: source(name),
    sourcePath: `${name}.md`,
    fvttVersion: target,
    effectProfile: 'core',
  });
}

function mechanics(actor: any): any[] {
  return actor.items.flatMap((item: any) =>
    item.flags?.fvttJsonGenerator?.behaviorMechanics ?? []);
}

function logicalProjection(actor: any): unknown {
  return mechanics(actor).map((mechanic) => ({
    id: mechanic.id,
    kind: mechanic.kind,
    coverage: mechanic.coverage,
    executionMode: mechanic.executionMode,
    trigger: mechanic.trigger,
    conditions: mechanic.conditions,
    references: mechanic.references.map((reference: any) => ({
      id: reference.id,
      role: reference.role,
    })),
    capacity: mechanic.capacity,
    choicePool: mechanic.choicePool,
    externalRule: mechanic.externalRule,
  }));
}

describe.each(['12', '14'] as const)('Netherdeep real behavior actors for v%s', (target) => {
  for (const [name, expectedIds] of corpus) {
    it(`${name} projects every declared behavior with truthful review status`, async () => {
      const result = await generate(name, target);
      expect(result.status).toBe('needs_review');
      expect(result.verification.diagnostics.some((entry) => entry.severity === 'error')).toBe(false);
      const projected = mechanics(result.rawJson as any);
      expect(projected.map((entry) => entry.id).sort()).toEqual([...expectedIds].sort());
      expect(projected.every((entry) => entry.coverage === 'structured')).toBe(true);
      expect(projected.every((entry) =>
        ['core-operable', 'gm-assisted', 'external-rule'].includes(entry.executionMode))).toBe(true);
      const coverage = result.verification.mechanicsCoverage.filter((entry) =>
        entry.kind.startsWith('behavior-'));
      expect(coverage).toHaveLength(expectedIds.length);
      expect(coverage.every((entry) => entry.status === 'projected')).toBe(true);
    });
  }
});

describe('Netherdeep behavior semantic controls', () => {
  it('keeps v12/v14 logical behavior projections aligned for all eleven actors', async () => {
    for (const [name] of corpus) {
      const v12 = await generate(name, '12');
      const v14 = await generate(name, '14');
      assertEqualStructure(logicalProjection(v12.rawJson), logicalProjection(v14.rawJson), { mode: 'shape' });
    }
  });

  it('normalizes the real Swarm grapple immunity and Eye deep speech enum values', async () => {
    const swarm = (await generate('swarm-of-sorrowfish__哀恸鱼集群', '14')).rawJson as any;
    const eye = (await generate('eye-of-the-deep', '14')).rawJson as any;
    expect(swarm.system.traits.ci.value).toContain('grappled');
    expect(swarm.system.traits.ci.value).not.toContain('擒抱');
    expect(eye.system.traits.languages.value).toContain('deep');
    expect(eye.system.traits.languages.value).not.toContain('深潜语');
  });

  it('projects v14 stage and defense AC changes at the final derived-value phase', async () => {
    for (const [name, stateId, value] of [
      ['caelian-sea-snail', 'caelian-shell-defense-ac', '4'],
      ['tainted-shellcreeper', 'shellcreeper-cracked', '11'],
      ['moldering-behemoth', 'behemoth-bloodied-stage', '12'],
    ] as const) {
      const actor = (await generate(name, '14')).rawJson as any;
      const effect = actor.items.flatMap((item: any) => item.effects ?? []).find((entry: any) =>
        entry.flags?.fvttJsonGenerator?.behaviorState?.stateId === stateId);
      expect(effect.changes.find((change: any) => change.key === 'system.attributes.ac.value'))
        .toMatchObject({ value, phase: 'final' });
    }
  });

  it.each(['12', '14'] as const)(
    'targets selected-state operations at creatures without changing self-state operations for v%s',
    async (target) => {
      for (const [name, operationId] of [
        ['urchin-spikeshooter', 'apply-pinned-by-spike'],
        ['urchin-spikeshooter', 'remove-pinning-spike'],
        ['crystalbleed-drakon', 'apply-drakon-nightmare-fright'],
        ['crystalbleed-drakon', 'rescue-drakon-nightmare'],
      ] as const) {
        const actor = (await generate(name, target)).rawJson as any;
        const activity = actor.items.flatMap((item: any) =>
          Object.values(item.system.activities ?? {})).find((entry: any) =>
            entry.flags?.fvttJsonGenerator?.behaviorOperation?.operationId === operationId) as any;
        expect(activity.target).toMatchObject({
          affects: { type: 'creature' },
          prompt: true,
        });
      }

      const caelian = (await generate('caelian-sea-snail', target)).rawJson as any;
      const selfActivity = caelian.items.flatMap((item: any) =>
        Object.values(item.system.activities ?? {})).find((entry: any) =>
          entry.flags?.fvttJsonGenerator?.behaviorOperation?.operationId === 'apply-caelian-shell-defense') as any;
      expect(selfActivity.target).toMatchObject({
        affects: { type: 'self' },
        prompt: false,
      });
    },
  );

  it('keeps capacity, choice-pool, template, and external-rule details explicit', async () => {
    const eye = (await generate('eye-of-the-deep', '14')).rawJson as any;
    const capacity = eye.items.find((item: any) =>
      item.flags?.fvttJsonGenerator?.behaviorAuxiliary?.mechanicId === 'eye-pincer-capacity');
    expect(capacity.system.uses).toEqual({ spent: 0, max: '2', recovery: [] });

    const nautiloid = (await generate('nautiloid', '14')).rawJson as any;
    const pool = nautiloid.items.find((item: any) =>
      item.flags?.fvttJsonGenerator?.behaviorAuxiliary?.mechanicId === 'nautiloid-planar-choice-pool');
    expect(pool.effects).toHaveLength(8);
    expect(pool.system.uses.max).toBe('3');
    const undertow = nautiloid.items.flatMap((item: any) =>
      Object.values(item.system.activities ?? {})).find((activity: any) =>
        activity.flags?.fvttJsonGenerator?.behaviorOperation?.operationId === 'place-nautiloid-undertow') as any;
    expect(undertow.target.template).toMatchObject({ type: 'line', size: '60', width: '15' });

    const squid = (await generate('vampire-squid', '14')).rawJson as any;
    expect(mechanics(squid).find((entry) => entry.id === 'squid-ruidium-corruption').externalRule)
      .toMatchObject({ dc: 16, ability: 'cha' });
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ParserFactory } from '../../parser/router';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { assertEqualStructure } from '../../utils/assertEqualStructure';

const fixtureDir = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

function item(actor: any, name: string): any {
  const result = actor.items.find((entry: any) => entry.name === name);
  expect(result).toBeDefined();
  return result;
}

function behaviorProjection(actor: any): unknown {
  return actor.items
    .filter((entry: any) =>
      entry.flags?.fvttJsonGenerator?.behaviorMechanics
      || entry.flags?.fvttJsonGenerator?.behaviorAuxiliary)
    .map((entry: any) => ({
      name: entry.name,
      mechanics: entry.flags?.fvttJsonGenerator?.behaviorMechanics?.map((mechanic: any) => ({
        id: mechanic.id,
        kind: mechanic.kind,
        coverage: mechanic.coverage,
        executionMode: mechanic.executionMode,
        references: mechanic.references.map((reference: any) => ({
          id: reference.id,
          role: reference.role,
        })),
      })),
      auxiliary: entry.flags?.fvttJsonGenerator?.behaviorAuxiliary,
      activities: Object.values(entry.system.activities ?? {}).map((activity: any) => ({
        type: activity.type,
        operation: activity.flags?.fvttJsonGenerator?.behaviorOperation
          ?? activity.flags?.fvttJsonGenerator?.behaviorCapacityOperation
          ?? activity.flags?.fvttJsonGenerator?.behaviorChoiceOperation,
        template: activity.target?.template,
      })),
      effects: entry.effects?.map((effect: any) => ({
        state: effect.flags?.fvttJsonGenerator?.behaviorState,
        statuses: effect.statuses,
      })),
    }));
}

describe('source-derived Actor behavior semantics', () => {
  it('parses relations, lifecycles, capacity, choice pools, areas, and external rules', () => {
    const parsed = new ParserFactory().parse(fixture('actor-behavior-semantics.md')) as any;
    expect(parsed.behaviorSemantics.schemaVersion).toBe(1);
    expect(parsed.behaviorSemantics.mechanics.map((entry: any) => entry.kind)).toEqual([
      'relation',
      'lifecycle',
      'capacity',
      'choicePool',
      'area',
      'externalRule',
    ]);
    expect(parsed.behaviorSemantics.mechanics[0]).toMatchObject({
      id: 'next-hit-force',
      coverage: 'structured',
      executionMode: 'core-operable',
      trigger: { event: 'activityUsed', frequency: 'oncePerTurn' },
      references: [{ id: 'heavy-strike', role: '下一次命中活动' }],
      states: [{ id: 'force-primed', target: 'self' }],
    });
    expect(parsed.behaviorSemantics.mechanics[2].capacity).toEqual({
      slots: 2,
      sizeLimit: '大型或更小',
      escapeDc: 15,
      acquire: '每次成功开始擒抱时占用一个槽位。',
      release: '对应擒抱结束时释放一个槽位。',
    });
    expect(parsed.behaviorSemantics.mechanics[3].choicePool).toMatchObject({
      choose: 2,
      distinct: true,
      reset: 'turnStart',
    });
  });

  it.each(['12', '14'] as const)(
    'projects behavior flags, operations, state Effects, native capacity, choices, and templates for v%s',
    async (target) => {
      const result = await convertMarkdownContentToJson({
        content: fixture('actor-behavior-semantics.md'),
        sourcePath: `actor-behavior-v${target}.md`,
        fvttVersion: target,
        effectProfile: 'core',
      });
      expect(result.status).toBe('needs_review');
      const actor = result.rawJson as any;
      const control = item(actor, '控制节点 (Control Node)');
      const mechanics = control.flags.fvttJsonGenerator.behaviorMechanics;
      expect(mechanics).toHaveLength(4);
      expect(mechanics.find((entry: any) => entry.id === 'next-hit-force').references[0].itemId)
        .toMatch(/^[A-Za-z0-9]{16}$/);

      const shell = item(actor, '甲壳防护 (Shell Guard)');
      const shellEffect = shell.effects.find((effect: any) =>
        effect.flags?.fvttJsonGenerator?.behaviorState?.stateId === 'shell-guard-ac');
      expect(shellEffect).toBeDefined();
      expect(shellEffect.changes[0]).toMatchObject(target === '14'
        ? { key: 'system.attributes.ac.value', phase: 'final', mode: 2, value: '4' }
        : { key: 'system.attributes.ac.flat', mode: 2, value: '4' });
      const applyShell = Object.values(shell.system.activities).find((activity: any) =>
        activity.flags?.fvttJsonGenerator?.behaviorOperation?.operationId === 'apply-shell-guard') as any;
      expect(applyShell.effects).toEqual([{ _id: shellEffect._id }]);

      const capacity = item(actor, '容量：双爪容量 (Twin Claw Capacity)');
      expect(capacity.system.uses).toEqual({ spent: 0, max: '2', recovery: [] });
      expect(Object.values(capacity.system.activities).map((activity: any) =>
        activity.consumption.targets[0]?.value)).toEqual(expect.arrayContaining([
        '1',
        '-min(1, @item.uses.spent)',
      ]));

      const pool = item(actor, '选择池：位面选择 (Planar Choices)');
      expect(pool.system.uses).toEqual({ spent: 0, max: '2', recovery: [] });
      expect(pool.effects).toHaveLength(3);
      expect(Object.values(pool.system.activities).filter((activity: any) =>
        activity.flags?.fvttJsonGenerator?.behaviorChoiceOperation?.optionId)).toHaveLength(3);

      const undertow = item(actor, '暗流 (Undertow)');
      const place = Object.values(undertow.system.activities).find((activity: any) =>
        activity.flags?.fvttJsonGenerator?.behaviorOperation?.operationId === 'place-undertow') as any;
      expect(place.target.template).toMatchObject({
        type: 'line',
        size: '60',
        width: '15',
        units: 'ft',
      });

      const behaviorCoverage = result.verification.mechanicsCoverage.filter((entry) =>
        entry.kind.startsWith('behavior-'));
      expect(behaviorCoverage).toHaveLength(6);
      expect(behaviorCoverage.every((entry) => entry.expressionCoverage === 'structured')).toBe(true);
      expect(behaviorCoverage.find((entry) => entry.kind === 'behavior-capacity')).toMatchObject({
        status: 'projected',
        executionMode: 'gm-assisted',
      });
      expect(result.verification.diagnostics.some((entry) =>
        entry.code === 'GEN_GM_ASSISTANCE_REQUIRED')).toBe(true);
      expect(result.verification.diagnostics.some((entry) =>
        entry.code === 'GEN_EXTERNAL_RULE_REVIEW_REQUIRED')).toBe(true);
    },
  );

  it('keeps the logical v12 and v14 behavior structures aligned', async () => {
    const content = fixture('actor-behavior-semantics.md');
    const v12 = await convertMarkdownContentToJson({ content, fvttVersion: '12', effectProfile: 'core' });
    const v14 = await convertMarkdownContentToJson({ content, fvttVersion: '14', effectProfile: 'core' });
    assertEqualStructure(behaviorProjection(v12.rawJson), behaviorProjection(v14.rawJson), { mode: 'shape' });
  });

  it('does not infer behavior from close prose or alter an unrelated Actor', async () => {
    const content = fixture('actor-behavior-close-negative.md');
    const parsed = new ParserFactory().parse(content) as any;
    expect(parsed.behaviorSemantics).toBeUndefined();
    const result = await convertMarkdownContentToJson({
      content,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(result.status).toBe('accepted');
    expect((result.rawJson as any).items.some((entry: any) =>
      entry.flags?.fvttJsonGenerator?.behaviorMechanics
      || entry.flags?.fvttJsonGenerator?.behaviorAuxiliary)).toBe(false);
  });

  it('writes intentional GM-assisted needs_review output without allowing unrelated review warnings', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fvtt-behavior-review-'));
    const outputPath = join(directory, 'actor.json');
    try {
      const result = await convertMarkdownContentToJson({
        content: fixture('actor-behavior-semantics.md'),
        outputPath,
        fvttVersion: '14',
        effectProfile: 'core',
      });
      expect(result.status).toBe('needs_review');
      expect(result.outputPath).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).name).toBe('行为契约测试兽 (Behavior Contract Beast)');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails closed on duplicate IDs, dangling local references, automatic claims, and unknown fields', () => {
    const source = fixture('actor-behavior-semantics.md');
    expect(() => new ParserFactory().parse(source.replace('ID: shell-guard', 'ID: next-hit-force')))
      .toThrow('duplicate ID "next-hit-force"');
    expect(() => new ParserFactory().parse(source.replace('          - force-primed', '          - missing-state')))
      .toThrow('unknown local state "missing-state"');
    expect(() => new ParserFactory().parse(source.replace('执行模式: core-operable', '执行模式: automatic')))
      .toThrow('automatic behavior requires a separately verified runtime projector');
    expect(() => new ParserFactory().parse(source.replace(
      '      规则来源: source-derived',
      '      规则来源: source-derived\n      猜测机制: true',
    ))).toThrow('猜测机制: unknown field');
  });
});

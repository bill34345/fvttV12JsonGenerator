import { describe, expect, test } from 'bun:test';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { verifyMonsterIntake } from '../verifier';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';

describe('intake Markdown renderer and deterministic verifier', () => {
  test.each(['12', '14'] as const)('preserves the Lurker through project generation for Foundry v%s', async (fvttVersion) => {
    const ir = buildValidLurkerIr();
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion,
      effectProfile: 'core',
      translationService: null,
    });
    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, generated.rawJson);
    expect(report.findings).toEqual([]);
    expect(report.status).toBe('accepted');
    expect(markdown).toContain('特性:');
    expect(markdown).toContain('动作:');
    expect(markdown).toContain('附赠动作:');
  });

  test('blocks the reproduced default leakage, ability drift, feature merge and biography loss', async () => {
    const ir = buildValidLurkerIr();
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '12', effectProfile: 'core', translationService: null });
    const actor = structuredClone(generated.rawJson) as any;
    actor.system.attributes.ac.flat = 20;
    actor.system.attributes.hp.value = 332;
    for (const ability of Object.values(actor.system.abilities) as any[]) ability.value = 10;
    actor.items = actor.items.filter((item: any) => !['蛛行 (Spider Climb)', '纯真结界 (Ward of Innocence)', '爪击 (Claw)'].includes(item.name));
    const report = verifyMonsterIntake(LURKER_SOURCE, ir, `${markdown}\n护甲等级: 20\n生命值: 332\n`, actor);
    const codes = new Set(report.findings.map((finding) => finding.code));
    expect(codes).toContain('ACTOR_AC_DRIFT');
    expect(codes).toContain('ACTOR_HP_DRIFT');
    expect(codes).toContain('ACTOR_ABILITY_DRIFT');
    expect(codes).toContain('ACTOR_FEATURE_MISSING');
    expect(codes).toContain('ACTOR_FEATURE_COUNT_DRIFT');
    expect(codes).toContain('TEMPLATE_DEFAULT_LEAK');
    expect(report.status).toBe('needs_review');
  });
});

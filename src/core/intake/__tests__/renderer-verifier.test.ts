import { describe, expect, test } from 'bun:test';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { projectActor, verifyMonsterIntake } from '../verifier';
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

  test('normalizes absent optional fields and exposes only explicit actor mechanics to review', async () => {
    const ir = buildValidLurkerIr();
    (ir.creature.senses as any).blindsight = null;
    (ir.creature.senses as any).tremorsense = null;
    (ir.creature.senses as any).truesight = null;
    (ir.creature.senses as any).special = null;
    (ir.creature as any).biography = null;
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion: '12',
      effectProfile: 'core',
      translationService: null,
    });

    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, generated.rawJson);
    const projection = projectActor(generated.rawJson, { skillKeys: Object.keys(ir.creature.skills) });
    const projectedItems = projection.items as Array<Record<string, unknown>>;

    expect(markdown).not.toMatch(/:\s*null\s*$/m);
    expect(report.findings).toEqual([]);
    expect(Object.keys(projection.skills as Record<string, unknown>).sort()).toEqual([
      'deception', 'intimidation', 'perception', 'stealth',
    ]);
    expect(projectedItems.filter((item) => !String(item.name).includes('Claw')).every((item) => item.toHit === undefined)).toBe(true);
  });

  test('blocks the reproduced default leakage, ability drift, feature merge and biography loss', async () => {
    const ir = buildValidLurkerIr();
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '12', effectProfile: 'core', translationService: null });
    const actor = structuredClone(generated.rawJson) as any;
    actor.system.attributes.ac.flat = 20;
    actor.system.attributes.hp.value = 332;
    actor.system.attributes.init.bonus = 99;
    actor.system.skills.dec.value = 0;
    actor.system.skills.ath.value = 1;
    actor.system.traits.dr.value = [];
    actor.system.attributes.senses.darkvision = 0;
    actor.system.traits.languages.custom = '';
    for (const ability of Object.values(actor.system.abilities) as any[]) ability.value = 10;
    actor.items = actor.items.filter((item: any) => !['蛛行 (Spider Climb)', '纯真结界 (Ward of Innocence)'].includes(item.name));
    const claw = actor.items.find((item: any) => item.name.includes('爪击'));
    claw.system.range.reach = 5;
    claw.system.damage.base.denomination = 6;
    const clawActivity = Object.values(claw.system.activities)[0] as any;
    clawActivity.range.reach = 5;
    const teleport = actor.items.find((item: any) => item.name.includes('黑暗传送'));
    const teleportActivity = Object.values(teleport.system.activities)[0] as any;
    teleportActivity.save.dc.value = 10;
    teleportActivity.save.dc.formula = '10';
    const report = verifyMonsterIntake(LURKER_SOURCE, ir, `${markdown}\n护甲等级: 20\n生命值: 332\n`, actor);
    const codes = new Set(report.findings.map((finding) => finding.code));
    expect(codes).toContain('ACTOR_AC_DRIFT');
    expect(codes).toContain('ACTOR_HP_DRIFT');
    expect(codes).toContain('ACTOR_ABILITY_DRIFT');
    expect(codes).toContain('ACTOR_INITIATIVE_DRIFT');
    expect(codes).toContain('ACTOR_SKILL_DRIFT');
    expect(codes).toContain('ACTOR_UNSOURCED_SKILL');
    expect(codes).toContain('ACTOR_RESISTANCE_DRIFT');
    expect(codes).toContain('ACTOR_SENSE_DRIFT');
    expect(codes).toContain('ACTOR_LANGUAGE_NOTE_DRIFT');
    expect(codes).toContain('ACTOR_REACH_DRIFT');
    expect(codes).toContain('ACTOR_DAMAGE_FORMULA_DRIFT');
    expect(codes).toContain('ACTOR_SAVE_DC_DRIFT');
    expect(codes).toContain('ACTOR_FEATURE_MISSING');
    expect(codes).toContain('ACTOR_FEATURE_COUNT_DRIFT');
    expect(codes).toContain('TEMPLATE_DEFAULT_LEAK');
    expect(report.status).toBe('needs_review');
  });
});

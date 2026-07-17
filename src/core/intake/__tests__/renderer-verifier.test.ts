import { describe, expect, test } from 'bun:test';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { anchorIrEvidence } from '../orchestrator';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { projectActor, verifyMonsterIntake } from '../verifier';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';

describe('intake Markdown renderer and deterministic verifier', () => {
  test('projects v14 flat attack bonuses and activity damage parts', () => {
    const actor = {
      system: {
        attributes: { prof: 2, ac: {}, hp: {}, movement: {}, senses: {}, init: {} },
        details: { xp: {} },
        abilities: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, { value: key === 'dex' ? 14 : 10 }])),
        traits: { languages: {} },
        skills: {},
      },
      items: [{
        name: 'Bite',
        type: 'weapon',
        system: {
          activities: {
            bite: {
              type: 'attack',
              attack: { ability: '', bonus: '4', flat: true, type: { value: 'mwak' } },
              damage: { parts: [{ number: 1, denomination: 4, bonus: '2', types: ['piercing'] }] },
              range: { reach: 5 },
              activation: { type: 'action' },
            },
          },
        },
      }],
    };

    const scoped = projectActor(actor, { saveKeys: [], includeInitiative: false });
    const bite = (scoped.items as Array<Record<string, unknown>>)[0]!;
    expect(bite).toMatchObject({ toHit: 4, damageFormula: '1d4+2', damageTypes: ['piercing'] });
    expect(scoped.saves).toEqual({});
    expect(scoped.initiative).toBeUndefined();
    expect((scoped.senses as Record<string, unknown>).special).toBeUndefined();
  });

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

  test('preserves conditional AC, localized values, multiline prose, and attack mechanics through v14 generation', async () => {
    let ir = buildValidLurkerIr();
    (ir.creature.attributes as unknown as { acKind: string }).acKind = '有法师护甲mage armor时15';
    (ir.creature.attributes as unknown as { initiative: null }).initiative = null;
    ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/attributes/initiative');
    ir.coverage.forEach((entry) => {
      entry.claimPaths = entry.claimPaths.filter((path) => path !== '/creature/attributes/initiative');
    });
    ir.creature.languages = { values: ['通用语'], custom: '' };
    (ir.creature.senses as unknown as { special: string }).special = '';
    ir.creature.traits[0]!.description = '第一段完整说明。\n\n随意：法术甲。\n\n每项1/日：迷踪步。';
    (ir.creature.actions[1] as unknown as { activityType: string }).activityType = 'action';
    (ir.creature.traits[2] as unknown as { activityType: string }).activityType = 'bonus';
    ir.creature.actions[1]!.damage![0]!.type = '穿刺';
    ir = anchorIrEvidence(LURKER_SOURCE, {
      id: 'lurker', label: 'lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, generated.rawJson);

    expect(markdown).toContain('护甲等级：14（有法师护甲mage armor时15）');
    expect(markdown).toMatch(/名称: 爪击 \(Claw\)[\s\S]*?类型: attack/);
    expect(markdown).toContain('类型: piercing');
    expect(markdown).toContain('激活: bonus');
    expect(report.findings).toEqual([]);
    const projection = projectActor(generated.rawJson);
    const bonusTrait = (projection.items as Array<Record<string, unknown>>).find((item) => String(item.name).includes('纯真结界'));
    expect(bonusTrait?.activation).toBe('bonus');
    expect(projection.biography).not.toContain('# 暗影潜妖');
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

  test('blocks a lost explicit activation type even when the feature prose remains', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.traits[2]!.activationType = 'bonus';
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const actor = structuredClone(generated.rawJson) as any;
    const trait = actor.items.find((item: any) => String(item.name).includes('Ward of Innocence'));
    for (const activity of Object.values(trait.system.activities ?? {}) as any[]) activity.activation.type = '';

    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'ACTOR_ACTIVATION_DRIFT',
      path: '/creature/traits/2/activationType',
    }));
  });
});

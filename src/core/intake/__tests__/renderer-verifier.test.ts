import { describe, expect, test } from 'bun:test';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { anchorIrEvidence } from '../orchestrator';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { projectActor, renderIntakeVerificationMarkdown, verifyMonsterIntake } from '../verifier';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from './fixtures/rat-warlock';

async function generatedRatWarlock() {
  const ir = buildRatWarlockIr();
  const markdown = renderMonsterIntakeMarkdown(ir);
  const generated = await convertMarkdownContentToJson({
    content: markdown,
    fvttVersion: '14',
    effectProfile: 'core',
    translationService: null,
  });
  return { ir, markdown, actor: generated.rawJson as any };
}

describe('intake Markdown renderer and deterministic verifier', () => {
  test('accepts an intact portable Rat Warlock actor while reporting target-world resolution pending', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('accepted');
    expect(report.findings).toEqual([]);
    expect(report.spellResolution).toEqual({
      required: true,
      status: 'pending',
      manifestId: actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.manifestId,
      spellCount: 10,
    });
    expect(renderIntakeVerificationMarkdown(report)).toContain('法术：已整理 10 项；目标世界解析待完成');
  });

  test('extracts the first closing frontmatter delimiter when later Markdown contains a horizontal rule', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    const markdownWithBodyRule = `${markdown}\nSource notes after frontmatter\n---\nThis is body text, not YAML.\n`;

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdownWithBodyRule, actor);

    expect(report.status).toBe('accepted');
    expect(report.spellResolution).toMatchObject({ required: true, status: 'pending', spellCount: 10 });
  });

  test.each([
    ['drops a SpellRef', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs.pop(); }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ['duplicates a SpellRef', (actor: any) => { const refs = actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs; refs.push(structuredClone(refs[0])); }, 'DUPLICATE_ID'],
    ['changes source-derived usage', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs[4].uses.value = 2; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ['changes source-derived save DC', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].saveDc = 99; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ['changes source-derived attack bonus', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].attackBonus = 99; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ['changes the material component waiver', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs[0].ignoresMaterialComponents = false; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ['changes a literal restriction', (actor: any) => { actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs[0].restrictions[0].text = 'any number of rays'; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
  ] as const)('blocks a portable actor that %s', async (_label, mutate, expectedCode) => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    mutate(actor);

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('needs_review');
    expect(report.spellResolution.status).toBe('failed');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: expectedCode, blocking: true }));
  });

  test('blocks destination UUIDs in a portable actor', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs[0].aliases.push(
      'Compendium.dnd5e.spells.Item.ABCDEFGHIJKLMNOP',
    );

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'FORBIDDEN_TARGET_WORLD_IDENTIFIER' }));
  });

  test('blocks a fabricated manifest hash in a portable actor', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.manifestHash = '0'.repeat(64);

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SPELL_MANIFEST_HASH_MISMATCH' }));
  });

  test('blocks placeholder embedded Spells and missing generated-feature linkage', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.items.push({ name: 'Placeholder: Eldritch Blast', type: 'spell', system: {} });
    const linked = actor.items.find((item: any) => item.flags?.['fvtt-json-generator-spell-resolver']?.featureItemKey);
    delete linked.flags['fvtt-json-generator-spell-resolver'];

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PORTABLE_ACTOR_EMBEDDED_SPELL' }));
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SPELL_FEATURE_LINK_MISSING' }));
  });

  test('blocks cloned source-identical spellcasting features even when resolver flags are moved to the clone', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    const linked = actor.items.find((item: any) => item.flags?.['fvtt-json-generator-spell-resolver']?.featureItemKey);
    const clone = structuredClone(linked);
    delete linked.flags['fvtt-json-generator-spell-resolver'];
    actor.items.push(clone);

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('needs_review');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SPELL_FEATURE_LINK_DUPLICATE' }));
  });

  test.each([
    ['a pre-runtime Cast Activity', (activity: any) => { activity.type = 'cast'; }, 'PORTABLE_ACTOR_CAST_ACTIVITY'],
    ['a resolver-managed Activity', (activity: any) => {
      activity.flags = { 'fvtt-json-generator-spell-resolver': { managed: true, documentType: 'activity' } };
    }, 'PORTABLE_ACTOR_MANAGED_ACTIVITY'],
  ] as const)('blocks %s anywhere in a portable caster Actor', async (_label, mutate, expectedCode) => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    const item = actor.items.find((candidate: any) => Object.keys(candidate.system?.activities ?? {}).length > 0);
    const activity = Object.values(item.system.activities)[0];
    mutate(activity);

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('needs_review');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: expectedCode }));
  });

  test.each([
    ['a wrong-type dummy', { name: '天生施法 (Innate Spellcasting)', type: 'weapon', system: {} }, 'SPELL_FEATURE_LINK_WRONG_TYPE'],
    ['a fake feat with no generated feature identity', { name: 'Dummy', type: 'feat', system: {} }, 'SPELL_FEATURE_LINK_IDENTITY_MISMATCH'],
  ] as const)('does not accept %s as the linked spellcasting feature', async (_label, dummy, expectedCode) => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    const linked = actor.items.find((item: any) => item.flags?.['fvtt-json-generator-spell-resolver']?.featureItemKey);
    const resolverFlags = structuredClone(linked.flags['fvtt-json-generator-spell-resolver']);
    delete linked.flags['fvtt-json-generator-spell-resolver'];
    actor.items.push({ ...dummy, flags: { 'fvtt-json-generator-spell-resolver': resolverFlags } });

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('needs_review');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: expectedCode }));
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SPELL_FEATURE_LINK_MISSING' }));
  });

  test('blocks a premature hydrated claim before target-world runtime resolution', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status = 'hydrated';

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PREMATURE_SPELL_HYDRATION' }));
    expect(report.spellResolution.status).toBe('failed');
  });

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

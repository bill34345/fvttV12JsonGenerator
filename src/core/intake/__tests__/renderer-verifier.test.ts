import { describe, expect, test } from 'bun:test';
import {
  buildConditionFlag,
  createConditionInstance,
  projectedConditionStatusId,
  readConditionInstance,
  type ConditionId,
} from '@fvtt-json-generator/contracts/conditions';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { anchorIrEvidence } from '../orchestrator';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { projectActor, renderIntakeVerificationMarkdown, verifyMonsterIntake } from '../verifier';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from './fixtures/rat-warlock';

function templateConditionEffect(conditionId: ConditionId) {
  return {
    statuses: [projectedConditionStatusId(conditionId)],
    flags: buildConditionFlag(createConditionInstance(conditionId, {}, {
      instanceId: `template-${conditionId}`,
      template: true,
    })),
  };
}

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
  async function lifecycleFixture(description: string, duration?: string, statuses = ['frightened']) {
    const ir = buildRatWarlockIr();
    ir.creature.actions = [{ name: 'Dread Tether', description, activityType: 'save', activationType: 'bonus', save: { dc: 14, ability: 'wis' }, uses: { max: 1, period: 'shortRest' }, appliedConditions: [{ statuses, duration }] }];
    const markdown = renderMonsterIntakeMarkdown(ir), generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const actor = generated.rawJson as any, item = actor.items.find((entry: any) => entry.name === 'Dread Tether');
    return { ir, markdown, actor, item, check: () => verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor).findings.filter(finding => /^ACTOR_CONDITION_/u.test(finding.code)) };
  }

  test('reports a linked status that loses its GM qualification even with an accurate sourceDuration hint', async () => {
    const f = await lifecycleFixture('The target makes a DC 14 Wisdom saving throw. On a failure, the target becomes frightened for 1 day. The effect ends if its source dies or is more than 1 mile away. Whenever it takes damage, it repeats the saving throw.', '1 day');
    expect(f.check()).toEqual([]);
    f.item.effects = [{ _id: 'badStatus0000001', statuses: ['frightened'], duration: { seconds: null, rounds: null, turns: null }, flags: { fvttJsonGenerator: { sourceDuration: '1 day' } } }];
    (Object.values(f.item.system.activities)[0] as any).effects = [{ _id: 'badStatus0000001', onSave: false }];
    expect(f.check()).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_GM_METADATA_DRIFT', path: '/creature/actions/0/appliedConditions/0' }));
  });

  test('checks actual native duration and complete GM boundary rather than status or metadata alone', async () => {
    const simple = await lifecycleFixture('The target makes a DC 14 Wisdom saving throw. On a failure, the target becomes frightened for 1 day.', '1 day');
    expect(simple.check()).toEqual([]); simple.item.effects[0].duration.seconds = null;
    expect(simple.check()).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_DURATION_DRIFT' }));
    const complex = await lifecycleFixture('The target becomes frightened for 1 minute. The effect ends when the target takes damage.', '1 minute');
    expect(complex.check()).toEqual([]); delete complex.item.effects[0].flags.fvttJsonGenerator.conditionLifecycle;
    expect(complex.check()).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_GM_METADATA_DRIFT', path: '/creature/actions/0/appliedConditions/0' }));
  });

  test('checks omitted source duration and independent status lifecycles against actual Effects', async () => {
    for (const source of ['The target becomes frightened for one minute.', '目标陷入恐慌，持续一日。']) {
      const f = await lifecycleFixture(source); expect(f.check()).toEqual([]);
      f.item.effects = [{ _id: 'badDuration00001', statuses: ['frightened'], duration: {} }];
      expect(f.check()).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_GM_METADATA_DRIFT', path: '/creature/actions/0/appliedConditions/0' }));
    }
    const f = await lifecycleFixture('The target is prone. It is poisoned until the end of its next turn.', undefined, ['prone', 'poisoned']);
    expect(f.item.effects.flatMap((effect: any) => effect.statuses)).toEqual(['prone', 'poisoned']); expect(f.check()).toEqual([]);
    delete f.item.effects.find((effect: any) => effect.statuses.includes('poisoned')).flags.fvttJsonGenerator.conditionLifecycle;
    expect(f.check()).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_GM_METADATA_DRIFT', path: '/creature/actions/0/appliedConditions/0' }));
  });

  test('rejects legacy attack enums inside an existing V14 Activity rather than trusting the matching string', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock(), feature = ir.creature.actions.find(entry => entry.attack)!;
    const item = actor.items.find((entry: any) => entry.name.includes(feature.name));
    const activity = Object.values(item.system.activities)[0] as any;
    activity.attack.type.value = feature.attack!.type;
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor).findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_ATTACK_NATIVE_TYPE_DRIFT' }));
  });

  test('accepts case-only actor name variants deduplicated by the renderer', async () => {
    const ir = buildRatWarlockIr();
    ir.creature.identity.name = 'RAT WARLOCK';
    ir.creature.identity.englishName = 'Rat Warlock';
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    expect((generated.rawJson as any).name).toBe('RAT WARLOCK');
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, generated.rawJson).findings.filter(value => value.code === 'ACTOR_NAME_DRIFT')).toEqual([]);
    const changed = structuredClone(generated.rawJson) as any;
    changed.name = 'RAT WIZARD';
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, changed).findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_NAME_DRIFT' }));
  });

  test('still blocks omission of a distinct source English name', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.name = ir.creature.identity.name;
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor).findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_NAME_DRIFT' }));
  });

  test('preserves a source-explicit creature subtype through Markdown and Actor verification', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.identity.creatureTypeCustom = 'goblinoid';
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });
    const actor = generated.rawJson as any;

    expect(markdown).toContain('生物类型备注: goblinoid');
    expect(actor.system.details.type.value).toBe('fey');
    expect(actor.system.details.type.custom).toBe('goblinoid');

    actor.system.details.type.custom = '';
    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_CREATURE_TYPE_CUSTOM_DRIFT' }));
  });

  test('preserves block separation when projecting list-form Actor biography HTML', () => {
    const projection = projectActor({
      system: {
        abilities: {}, attributes: {}, traits: {},
        details: { biography: { value: '<ul><li>Prosthetic limb (right hand).</li><li>Armor Class: 13 (chain shirt)</li></ul>' } },
      },
      items: [],
    });

    expect(projection.biography).toBe('Prosthetic limb (right hand).\nArmor Class: 13 (chain shirt)');
  });

  test('keeps visible Item rules authoritative while retaining Activity flavor independently', async () => {
    const item = {
      name: 'Spellcasting', type: 'feat',
      system: {
        description: { value: '<p>**Spellcasting**. visible Item source</p>' },
        activities: { one: { description: { chatFlavor: '**Spellcasting**. different Activity text' } } },
      },
    };
    const actor = {system:{abilities:{},attributes:{},traits:{},details:{}},items:[item]};
    const project=()=>((projectActor(actor).items as Array<Record<string, any>>)[0]!);
    expect(project().description).toBe('**Spellcasting**. visible Item source');
    expect(project().activities[0].description).toBe('**Spellcasting**. different Activity text');
    item.system.description.value='<p>Truncated Item rule.</p>';
    expect(project().description).toBe('Truncated Item rule.');
    expect(project().description).not.toBe(project().activities[0].description);

    const generated=await generatedRatWarlock();
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE,generated.ir,generated.markdown,generated.actor).findings).toEqual([]);
    const feature=generated.ir.creature.actions[0]!;
    const generatedItem=generated.actor.items.find((entry:any)=>String(entry.name).includes(feature.name));
    const activities=Object.values(generatedItem.system.activities) as any[];
    expect(activities.length).toBeGreaterThan(0);
    for(const activity of activities)activity.description={chatFlavor:feature.description};
    generatedItem.system.description.value='<p>The complete rule was removed.</p>';
    const report=verifyMonsterIntake(RAT_WARLOCK_SOURCE,generated.ir,generated.markdown,generated.actor);
    expect(report.findings).toContainEqual(expect.objectContaining({code:'ACTOR_DESCRIPTION_LOSS',path:'/creature/actions/0/description'}));
    expect(report.status).toBe('needs_review');
  });

  test('projects the explicit mythic display section separately from Foundry legendary activation', () => {
    const projection = projectActor({
      system: { abilities: {}, attributes: {}, traits: {}, details: {} },
      items: [{
        name: 'Dream of Creation', type: 'feat',
        system: { activation: { type: 'legendary' }, activities: {} },
        flags: { 'tidy5e-sheet': { section: '\u795e\u8bdd\u52a8\u4f5c', actionSection: '\u795e\u8bdd\u52a8\u4f5c' } },
      }],
    });

    expect((projection.items as Array<Record<string, unknown>>)[0]).toMatchObject({
      activation: 'legendary', section: '\u795e\u8bdd\u52a8\u4f5c',
    });
  });

  test('projects custom condition IDs only when the same effect has its exact enabled template contract', () => {
    const exactDazed = templateConditionEffect('dazed');
    const exactAddled = templateConditionEffect('addled');
    const exactBewildered = templateConditionEffect('bewildered');
    const forgedSuffix = {
      ...exactDazed,
      statuses: ['fvtt-custom-conditions.dazed-shadow'],
    };
    const missingFlag = { statuses: [projectedConditionStatusId('dazed')] };
    const mismatchedFlag = {
      ...templateConditionEffect('addled'),
      statuses: [projectedConditionStatusId('dazed')],
    };
    const nonTemplateFlag = {
      statuses: [projectedConditionStatusId('dazed')],
      flags: buildConditionFlag(createConditionInstance('dazed', {}, { instanceId: 'instance-dazed' })),
    };
    const unrelatedFeatureEffect = templateConditionEffect('dazed');

    const projection = projectActor({
      system: { abilities: {}, attributes: {}, traits: {}, details: {} },
      items: [
        {
          name: 'Source Feature', type: 'feat', system: {},
          effects: [exactDazed, exactAddled, exactBewildered, forgedSuffix, missingFlag, mismatchedFlag, nonTemplateFlag],
        },
        { name: 'Unrelated Feature', type: 'feat', system: {}, effects: [unrelatedFeatureEffect] },
      ],
    });
    const projectedItems = projection.items as Array<Record<string, unknown>>;

    expect(projectedItems[0]!.statuses).toEqual([
      'dazed',
      'addled',
      'bewildered',
      'fvtt-custom-conditions.dazed-shadow',
      'fvtt-custom-conditions.dazed',
      'fvtt-custom-conditions.dazed',
      'fvtt-custom-conditions.dazed',
    ]);
    expect(projectedItems[1]!.statuses).toEqual(['dazed']);
  });

  test('renders explicit hover through standard Markdown into the v14 Actor movement object', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.attributes.movement = { fly: 40, hover: true };
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });

    expect(markdown).toContain('(hover)');
    expect((generated.rawJson as any).system.attributes.movement).toMatchObject({ fly: 40, hover: true });
    expect((projectActor(generated.rawJson).movement as Record<string, unknown>).hover).toBe(true);
  });

  test('keeps swallowed ongoing damage separate from the initial attack damage', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.actions = [{
      name: '虚空虹膜',
      englishName: 'Void-Iris',
      description: '近战武器攻击：命中+13，触及5尺。命中：39（6d10 + 6）点穿刺伤害。被吞噬的生物在其每个回合结束时受到21（6d6）点力场伤害。',
      activityType: 'attack',
      activationType: 'action',
      attack: { type: 'mwak', toHit: 13, reach: 5 },
      damage: [
        { formula: '6d10+6', type: 'piercing', relationship: 'base' },
        { formula: '6d6', type: 'force', relationship: 'conditional', condition: '被吞噬时，在其每个回合结束时' },
      ],
    }];

    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });
    const actor = generated.rawJson as any;
    const item = actor.items.find((candidate: any) => candidate.name.includes('Void-Iris'));
    const activities = Object.values(item.system.activities) as any[];
    const attackActivity = activities.find((activity) => activity.type === 'attack');
    const damageActivity = activities.find((activity) => activity.type === 'damage');

    expect(markdown).toContain('关系: conditional');
    expect(markdown).toContain('条件: 被吞噬时，在其每个回合结束时');
    expect(attackActivity.damage.parts).toHaveLength(1);
    expect(attackActivity.damage.parts[0]).toMatchObject({ number: 6, denomination: 10, bonus: '6' });
    expect(damageActivity.damage.parts[0]).toMatchObject({ number: 6, denomination: 6, types: ['force'] });
    expect(damageActivity.description.chatFlavor).toContain('被吞噬');

    const projected = (projectActor(actor).items as Array<Record<string, unknown>>)
      .find((candidate) => String(candidate.name).includes('Void-Iris'))!;
    expect(projected.damageFormulas).toEqual(expect.arrayContaining(['6d10+6', '6d6']));
    expect(projected.damageTypes).toEqual(expect.arrayContaining(['piercing', 'force']));
    expect(projected.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'damage', damageFormulas: ['6d6'], damageTypes: ['force'] }),
    ]));
  });

  test('does not create a supplemental activity for ordinary on-hit additional damage', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.actions = [{
      name: '虹膜打击',
      englishName: 'Iris Strike',
      description: '近战武器攻击：命中+13，触及5尺。命中：39（6d10 + 6）点穿刺伤害，外加21（6d6）点力场伤害。',
      activityType: 'attack',
      activationType: 'action',
      attack: { type: 'mwak', toHit: 13, reach: 5 },
      damage: [
        { formula: '6d10+6', type: 'piercing', relationship: 'base' },
        { formula: '6d6', type: 'force', relationship: 'additional' },
      ],
    }];

    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });
    const item = (generated.rawJson as any).items.find((candidate: any) => candidate.name.includes('Iris Strike'));
    const activities = Object.values(item.system.activities) as any[];

    expect(activities.map((activity) => activity.type)).toEqual(['attack']);
    expect(activities[0].damage.parts).toHaveLength(2);
  });

  test('preserves a conditional legendary-action preamble literally while setting the explicit resource maximum', async () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.legendary = {
      max: 2,
      preamble: 'Only while fully controlled, the creature can take 2 legendary actions, regaining them at the start of its turn.',
      evidence: [],
    };
    ir.creature.legendaryActions = [{
      name: 'Dash',
      description: 'The creature moves up to its speed.',
      activityType: 'utility',
      activationType: 'legendary',
      legendaryCost: 1,
    }];

    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });
    const actor = generated.rawJson as any;

    expect(actor.system.resources.legact).toMatchObject({ max: 2, spent: 0 });
    expect(actor.system.details.biography.value).toContain(ir.creature.legendary.preamble);
    const activity = Object.values(actor.items.find((item: any) => item.name.includes('Dash')).system.activities)[0] as any;
    expect(activity.activation).toMatchObject({ type: 'legendary', value: 1 });
  });

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

  test('accepts a portable spell manifest from CRLF Markdown', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown.replace(/\n/g, '\r\n'), actor);

    expect(report.status).toBe('accepted');
    expect(report.findings).toEqual([]);
    expect(report.spellResolution).toMatchObject({ required: true, status: 'pending', spellCount: 10 });
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

  test('blocks a second generated spellcasting source feature even when descriptions drift and resolver flags move', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    const linked = actor.items.find((item: any) => item.flags?.['fvtt-json-generator-spell-resolver']?.featureItemKey);
    const clone = structuredClone(linked);
    delete linked.flags['fvtt-json-generator-spell-resolver'];
    linked.name = 'Completely renamed by a user';
    linked.system.description.value = '<p>User-edited prose that no longer matches the source description.</p>';
    (Object.values(linked.system.activities)[0] as any).description.chatFlavor = 'Different activity prose.';
    actor.items.push(clone);

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.status).toBe('needs_review');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SPELL_FEATURE_LINK_DUPLICATE' }));
  });

  test('does not classify a near-name unrelated generated feat as the spellcasting source feature', async () => {
    const { ir, markdown, actor } = await generatedRatWarlock();
    actor.items.push({
      name: 'Innate Spellcasting Notes',
      type: 'feat',
      system: { description: { value: '<p>Unrelated notes.</p>' }, activities: {} },
      effects: [],
      flags: { fvttJsonGenerator: { effectHints: {} } },
    });

    const report = verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor);

    expect(report.findings).not.toContainEqual(expect.objectContaining({ code: 'SPELL_FEATURE_LINK_DUPLICATE' }));
    expect(report.status).toBe('accepted');
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

  test('projects native weapon base damage only when includeBase is true and preserves additional activity damage', () => {
    const actor = {
      system: {
        attributes: { prof: 5, ac: {}, hp: {}, movement: {}, senses: {}, init: {} },
        details: { xp: {} },
        abilities: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, { value: key === 'str' ? 23 : 10 }])),
        traits: { languages: {} },
        skills: {},
      },
      items: [{
        name: 'Native Bite', type: 'weapon',
        system: {
          damage: { base: { number: 3, denomination: 10, bonus: '', types: ['piercing'] } },
          activities: {
            bite: {
              type: 'attack',
              attack: { ability: 'str', bonus: '', flat: false, type: { value: 'mwak' } },
              damage: { includeBase: true, parts: [{ number: 2, denomination: 8, bonus: '', types: ['psychic'] }] },
              range: { reach: 10 }, activation: { type: 'action' },
            },
          },
        },
      }],
    };

    const bite = (projectActor(actor).items as Array<Record<string, unknown>>)[0]!;
    expect(bite).toMatchObject({
      damageFormula: '3d10+6',
      damageFormulas: ['3d10+6', '2d8'],
      damageTypes: ['piercing', 'psychic'],
    });

    const nativeItem = actor.items[0]! as any;
    nativeItem.system.activities.bite.damage.includeBase = false;
    const noBase = (projectActor(actor).items as Array<Record<string, unknown>>)[0]!;
    expect(noBase.damageFormulas).toEqual(['2d8']);
    expect(noBase.damageTypes).toEqual(['psychic']);

    nativeItem.system.activities.bite.damage.includeBase = true;
    nativeItem.system.damage.base.bonus = '99';
    const wrongBonus = (projectActor(actor).items as Array<Record<string, unknown>>)[0]!;
    expect(wrongBonus.damageFormula).not.toBe('3d10+6');

    nativeItem.system.damage.base.bonus = '';
    nativeItem.system.damage.base.custom = { enabled: true, formula: '1d4' };
    const customBase = (projectActor(actor).items as Array<Record<string, unknown>>)[0]!;
    expect(customBase.damageFormula).toBeUndefined();

    nativeItem.system.damage.base.custom = { enabled: false, formula: '' };
    delete nativeItem.system.activities.bite.attack.ability;
    const missingAbility = (projectActor(actor).items as Array<Record<string, unknown>>)[0]!;
    expect(missingAbility.damageFormula).toBeUndefined();
  });

  test('keeps bare and custom native base damage unverified when the base cannot prove its full formula', async () => {
    for (const [formula, mutate] of [
      ['3d10', (activity: any, base: any) => { delete activity.attack.ability; base.custom = { enabled: false, formula: '' }; }],
      ['1d4', (activity: any, base: any) => { activity.attack.ability = 'str'; base.custom = { enabled: true, formula: '1d4' }; }],
    ] as const) {
      const ir = buildValidLurkerIr() as any;
      ir.creature.actions[0] = {
        ...ir.creature.actions[0], name: 'Native Bite', englishName: undefined, description: '原生基础伤害测试。',
        attack: { type: 'mwak', toHit: 6, reach: 5 }, damage: [{ formula, type: 'piercing', relationship: 'base' }],
      };
      const markdown = renderMonsterIntakeMarkdown(ir);
      const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
      const actor = generated.rawJson as any;
      const item = actor.items.find((entry: any) => entry.name === 'Native Bite');
      const activity = Object.values(item.system.activities)[0] as any;
      activity.damage = { includeBase: true, parts: [] };
      activity.attack = { ability: 'str', bonus: '', flat: false, type: { value: 'mwak' } };
      item.system.damage = { base: { number: formula === '1d4' ? 1 : 3, denomination: formula === '1d4' ? 4 : 10, bonus: '', types: ['piercing'], custom: { enabled: false, formula: '' } } };
      mutate(activity, item.system.damage.base);
      expect(verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor).findings).toContainEqual(expect.objectContaining({
        code: 'ACTOR_DAMAGE_FORMULA_DRIFT', path: '/creature/actions/0/damage/0/formula',
      }));
    }
  });

  test('treats source usage annotations, standard bilingual languages, and standard bilingual statuses as equivalent while keeping a different feature name blocking', async () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.languages = { values: ['龙语'] };
    ir.creature.traits = [{ name: '拒绝 [2/日]', englishName: 'Defiance', description: '该生物可以拒绝一次失败。', uses: { max: 2, period: 'day' } }];
    ir.creature.actions = [{
      name: '状态冲击', englishName: 'Status Burst', description: '目标进行豁免，失败时倒地。', activityType: 'save',
      save: { dc: 13, ability: 'dex' }, appliedConditions: ['prone', 'frightened', 'dazed'].map(status => ({ statuses: [status], duration: '1 round' })),
    }];
    ir.creature.bonusActions = [];
    ir.creature.reactions = [];
    ir.creature.legendaryActions = [];
    const replacedFeatureClaim = (path: string) => /^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions)\//u.test(path);
    ir.claims = ir.claims.filter((claim: any) => !replacedFeatureClaim(claim.path));
    ir.coverage.forEach((entry: any) => { entry.claimPaths = entry.claimPaths.filter((path: string) => !replacedFeatureClaim(path)); });
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const actor = generated.rawJson as any;
    const generatedStatusBurst = actor.items.find((item: any) => item.name.includes('Status Burst'));
    const generatedDazed = generatedStatusBurst.effects.find((effect: any) => effect.statuses.includes(projectedConditionStatusId('dazed')));
    expect(readConditionInstance(generatedDazed)).toEqual(createConditionInstance('dazed', {}, {
      instanceId: 'template-dazed',
      template: true,
    }));

    const report = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(report.findings).toEqual([]);
    const codes = new Set(report.findings.map((finding) => finding.code));
    expect(codes).not.toContain('ACTOR_LANGUAGE_DRIFT');
    expect(codes).not.toContain('ACTOR_FEATURE_MISSING');
    expect(codes).not.toContain('ACTOR_FEATURE_COUNT_DRIFT');
    expect(codes).not.toContain('ACTOR_CONDITION_DRIFT');

    const mixedIr = structuredClone(ir);
    mixedIr.creature.actions[0].appliedConditions = [{ statuses: ['prone', 'frightened', 'dazed'], duration: '1 round' }];
    const mixedMarkdown = renderMonsterIntakeMarkdown(mixedIr);
    const mixedGenerated = await convertMarkdownContentToJson({ content: mixedMarkdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const mixedActor = mixedGenerated.rawJson as any;
    const mixedItem = mixedActor.items.find((item: any) => item.name.includes('Status Burst'));
    expect(mixedActor.items).toHaveLength(actor.items.length);
    expect(mixedItem.effects.flatMap((effect: any) => effect.statuses)).toEqual(['prone', 'frightened', projectedConditionStatusId('dazed')]);
    expect(mixedItem.system.description.value).toContain(ir.creature.actions[0].description);
    const mixedReport = verifyMonsterIntake(LURKER_SOURCE, mixedIr, mixedMarkdown, mixedActor);
    expect(mixedReport.status).toBe('needs_review');
    expect(mixedReport.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_DRIFT', path: '/creature/actions/0/appliedConditions/0' }));

    const defiance = actor.items.find((item: any) => item.name.includes('Defiance'));
    const originalDefianceName = defiance.name;
    const originalDefianceRecovery = structuredClone(defiance.system.uses.recovery);
    defiance.name = '拒绝 [3/日] Defiance';
    const countDrift = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(countDrift.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_FEATURE_MISSING', path: '/creature/traits/0' }));

    defiance.name = originalDefianceName;
    defiance.system.uses.max = '3';
    const usesDrift = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(usesDrift.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_RESOURCE_PROJECTION_DRIFT', path: '/creature/traits/0' }));

    defiance.system.uses.max = '2';
    defiance.system.uses.recovery = [];
    const recoveryDrift = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(recoveryDrift.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_RESOURCE_PROJECTION_DRIFT', path: '/creature/traits/0' }));

    defiance.system.uses.recovery = originalDefianceRecovery;
    defiance.name = '其他守卫 Guard';
    const nameDrift = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(nameDrift.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_FEATURE_MISSING', path: '/creature/traits/0' }));
    defiance.name = originalDefianceName;

    const statusBurst = actor.items.find((item: any) => item.name.includes('Status Burst'));
    const frightened = statusBurst.effects.find((effect: any) => effect.statuses.includes('frightened'));
    frightened.statuses = ['Custom frightened curse'];
    const customEnglish = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(customEnglish.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_DRIFT', path: '/creature/actions/0/appliedConditions/1' }));

    frightened.statuses = ['强化恐慌'];
    const customLocalized = verifyMonsterIntake(LURKER_SOURCE, ir, markdown, actor);
    expect(customLocalized.findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_CONDITION_DRIFT', path: '/creature/actions/0/appliedConditions/1' }));
  });

  test('projects every activity damage part for multi-type effects', () => {
    const projection = projectActor({
      system: {
        attributes: { prof: 2, ac: {}, hp: {}, movement: {}, senses: {}, init: {} },
        details: { xp: {} },
        abilities: {},
        traits: { languages: {} },
        skills: {},
      },
      items: [{
        name: 'Far Sojourn Ray',
        type: 'feat',
        system: {
          activities: {
            ray: {
              type: 'damage',
              damage: {
                parts: [
                  { number: 4, denomination: 12, bonus: '', types: ['slashing'] },
                  { number: 4, denomination: 12, bonus: '', types: ['psychic'] },
                ],
              },
            },
          },
        },
      }],
    });
    const item = (projection.items as Array<Record<string, unknown>>)[0]!;
    expect(item.damageFormula).toBe('4d12');
    expect(item.damageFormulas).toEqual(['4d12', '4d12']);
    expect(item.damageTypes).toEqual(['slashing', 'psychic']);
  });

  test('renders a source-explicit hybrid weapon with both melee reach and thrown range', async () => {
    const ir = buildValidLurkerIr();
    const hybrid = ir.creature.actions[1]!;
    hybrid.attack = { type: 'mwak', toHit: 4, reach: 5, range: 20, longRange: 60 };

    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const item = (generated.rawJson as any).items.find((candidate: any) => candidate.name.includes('Claw'));
    const activity = Object.values(item.system.activities)[0] as any;

    expect(markdown).toContain('范围: 触及 5 尺或射程 20/60 尺');
    expect(activity.attack.type).toEqual({ value: 'melee', classification: 'weapon' });
    expect(activity.range).toMatchObject({ reach: 5, value: 20, long: 60, units: 'ft' });
    const projection = projectActor(generated.rawJson);
    expect((projection.items as Array<Record<string, unknown>>).find((candidate) => String(candidate.name).includes('Claw')))
      .toMatchObject({ reach: 5, range: 20, longRange: 60 });
    expect(verifyMonsterIntake(LURKER_SOURCE, ir, markdown, generated.rawJson).findings).toEqual([]);
  });

  test('renders and verifies a source-explicit two-action legendary cost', async () => {
    const ir = buildValidLurkerIr();
    ir.creature.legendaryActions = [{
      name: 'Zone', description: 'Zone (Costs 2 Actions).', activityType: 'utility',
      activationType: 'legendary', legendaryCost: 2,
    }];
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({
      content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null,
    });
    const actor = generated.rawJson as any;
    const item = actor.items.find((candidate: any) => candidate.name.includes('Zone'));
    const activity = Object.values(item.system.activities)[0] as any;

    expect(activity.activation).toMatchObject({ type: 'legendary', value: 2 });
    expect(projectActor(actor).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining('Zone'), activationValue: 2 }),
    ]));
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

  test('retains the complete Actor while reporting null optional fields for review', async () => {
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
    expect(report.status).toBe('needs_review');
    expect(report.findings.map(({ code, path }) => ({ code, path }))).toEqual([
      ...['blindsight', 'tremorsense', 'truesight', 'special'].map(field => ({ code: 'INVALID_STRUCTURE', path: `/creature/senses/${field}` })),
      { code: 'INVALID_STRUCTURE', path: '/creature/biography' },
    ]);
    expect(projectedItems).toHaveLength(6);
    expect(projectedItems.find(item => String(item.name).includes('Claw'))).toMatchObject({ toHit: 6, reach: 10, damageFormulas: ['1d10+4'] });
    expect(Object.keys(projection.skills as Record<string, unknown>).sort()).toEqual([
      'deception', 'intimidation', 'perception', 'stealth',
    ]);
    expect(projectedItems.filter((item) => !String(item.name).includes('Claw')).every((item) => item.toHit === undefined)).toBe(true);
  });

  test('preserves conditional AC, localized damage, multiline prose and attack mechanics in a reviewable v14 candidate', async () => {
    let ir = buildValidLurkerIr();
    ir.creature.attributes.acKind = 'flat';
    ir.creature.attributes.acNote = '有法师护甲mage armor时15';
    delete ir.creature.attributes.initiative;
    ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/attributes/initiative');
    ir.coverage.forEach((entry) => {
      entry.claimPaths = entry.claimPaths.filter((path) => path !== '/creature/attributes/initiative');
    });
    ir.creature.languages = { values: ['通用语'] };
    delete ir.creature.senses.special;
    ir.creature.traits[0]!.description = '第一段完整说明。\n\n随意：法术甲。\n\n每项1/日：迷踪步。';
    ir.creature.actions[1]!.activityType = 'attack';
    ir.creature.traits[2]!.activationType = 'bonus';
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
    expect(markdown).toMatch(/名称: 爪击 Claw[\s\S]*?类型: attack/);
    expect(markdown).toContain('类型: piercing');
    expect(markdown).toContain('激活: bonus');
    expect(report.status).toBe('needs_review');
    expect(report.findings).toEqual([expect.objectContaining({ code: 'INVALID_STRUCTURE', path: '/creature/actions/1/damage/0/type' })]);
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
    expect(verifyMonsterIntake(LURKER_SOURCE,ir,markdown,actor).findings).toEqual([]);
    const originalClaw=(projectActor(actor).items as Array<Record<string,unknown>>).find(item=>String(item.name).includes('爪击'));
    expect(originalClaw).toMatchObject({toHit:6,reach:10,damageFormulas:['1d10+4'],damageTypes:['slashing']});
    actor.system.attributes.ac.flat = 20;
    actor.system.attributes.hp.value = 332;
    actor.system.attributes.init.bonus = 99;
    actor.system.skills.dec.value = 0;
    actor.system.skills.ath.value = 1;
    actor.system.traits.dr.value = [];
    actor.system.attributes.senses.darkvision = 0;
    actor.system.traits.languages.custom = '';
    for (const ability of Object.values(actor.system.abilities) as any[]) ability.value = 10;
    actor.items = actor.items.filter((item: any) => !['蛛行 Spider Climb', '纯真结界 Ward of Innocence'].includes(item.name));
    const claw = actor.items.find((item: any) => item.name.includes('爪击'));
    claw.system.range.reach = 5;
    const clawActivity = Object.values(claw.system.activities).find((activity:any)=>activity.type==='attack') as any;
    const damageActivity = Object.values(claw.system.activities).find((activity:any) => activity.damage?.parts?.length === 1) as any;
    const primaryDamage = damageActivity.damage.parts[0];
    expect(primaryDamage).toMatchObject({number:1,denomination:10,bonus:'4',types:['slashing']});
    primaryDamage.denomination = 6;
    primaryDamage.types = ['fire'];
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
    expect(codes).toContain('ACTOR_DAMAGE_TYPE_DRIFT');
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

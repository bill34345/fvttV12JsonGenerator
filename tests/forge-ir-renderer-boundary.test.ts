import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from '../src/core/intake/__tests__/fixtures/rat-warlock';

const document = (ir: ReturnType<typeof buildRatWarlockIr>) => yaml.load(renderMonsterIntakeMarkdown(ir).slice(4, -4)) as any;

describe('AI IR renderer uses explicit fields while preserving literal prose', () => {
  test('marks every ordinary and spellcasting feature without changing its explicit mechanics', () => {
    const ir = buildRatWarlockIr();
    ir.creature.actions[0]!.uses = { max: 4, period: 'shortRest' };
    ir.creature.actions.push({ name: 'Declared Save', description: 'The prose mentions unrelated 99 damage. Preserve the AI save and status fields.',
      activityType: 'save', save: { dc: 17, ability: 'wis', outcome: 'half' }, range: 60,
      damage: [{ formula: '2d6', type: 'force', relationship: 'base' }],
      appliedConditions: [{ statuses: ['prone'], duration: '1 minute' }] });
    ir.creature.bonusActions.push({ name: 'Bonus', description: 'The full bonus rule.', activityType: 'utility', activationType: 'bonus' });
    ir.creature.reactions.push({ name: 'Reaction', description: 'The full reaction rule.', activityType: 'utility', activationType: 'reaction' });
    ir.creature.legendaryActions.push({ name: 'Legendary', description: 'The full legendary rule.', activityType: 'utility', legendaryCost: 2 });
    ir.creature.mythicActions = [{ name: 'Mythic', description: 'The full mythic rule.', activityType: 'utility' }];
    const before = structuredClone(ir), doc = document(ir);
    for (const section of ['特性', '动作', '附赠动作', '反应', '传奇动作', '神话动作']) {
      expect(doc[section].every((feature: any) => feature.literalMechanics === true)).toBe(true);
    }
    expect(doc['护甲等级']).toBe(12);
    expect(doc['特性'][0].spellcastingFeatureKey).toBe('innate-charisma');
    expect(doc['法术清单'].spellcastingGroups[0].saveDc).toBe(12);
    expect(doc['动作'][0]).toMatchObject({ 命中: 4, 攻击类型: 'mwak', 范围: '触及 5 尺', 使用次数: { max: 4, period: 'shortRest' } });
    expect(doc['动作'][1]).toMatchObject({ DC: 17, 属性: '感知', 范围: '60 尺', saveOutcome: 'half', 伤害: [{ 公式: '2d6', 类型: 'force', 关系: 'base' }], 内嵌效果: [{ 类型: 'prone', 持续: '1 minute' }] });
    expect(doc['动作'][1]['描述']).toBe(ir.creature.actions[1]!.description);
    expect(ir).toEqual(before);
  });

  test('does not derive legendary resistance counters from a trait heading or description', () => {
    const ir = buildRatWarlockIr();
    ir.creature.identity.name = 'sentinel';
    ir.creature.identity.englishName = undefined;
    const description = 'If the sentinel fails a saving throw, it can choose to succeed instead.';
    ir.creature.traits = [{ name: 'Legendary Resistance (3/Day, or 4/Day in Lair)', description, uses: { max: 7, period: 'day' } }];
    ir.creature.legendary = { max: 3, lairMax: 4, recovery: 'own-turn-start', preamble: 'The sentinel has three legendary actions, or four in its lair.', evidence: [] };
    const doc = document(ir);
    expect(doc['intake-legendary-ledger']).toEqual({ max: 3, lairMax: 4, recovery: 'own-turn-start' });
    expect(doc['特性'].at(-1)).toMatchObject({ 描述: description, 使用次数: { max: 7, period: 'day' } });
  });

  test('explicit resistance capacities survive the workflow and cannot be replaced by prose quotas', async () => {
    const ir = buildRatWarlockIr();
    ir.creature.identity.name = 'sentinel'; ir.creature.identity.englishName = undefined;
    const description = 'If the sentinel fails a saving throw, it can choose to succeed instead.';
    ir.creature.traits = [{ name: 'Legendary Resistance (9/Day, or 10/Day in Lair)', description }];
    ir.creature.legendary = { max: 3, lairMax: 4, recovery: 'own-turn-start', resistanceMax: 2, resistanceLairMax: 3,
      preamble: 'The sentinel has three legendary actions, or four in its lair.', evidence: [] };
    // Keep the source references structurally consistent with this complete
    // AI inventory; their prose is intentionally not the numerical authority.
    ir.claims = ir.claims.filter(claim => claim.path !== '/creature/traits/1');
    ir.coverage.forEach(row => { row.claimPaths = row.claimPaths.filter(path => path !== '/creature/traits/1'); });
    const markdown = renderMonsterIntakeMarkdown(ir), doc = document(ir), before = structuredClone(ir);
    expect(doc['intake-legendary-ledger']).toEqual({ max: 3, lairMax: 4, recovery: 'own-turn-start', resistanceMax: 2, resistanceLairMax: 3 });
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const actor = generated.rawJson as any;
    expect(actor.system.resources.legres.max).toBe(2);
    expect(actor.system.resources.legres.spent).toBe(0);
    expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({ resistanceMax: 2, resistanceLairMax: 3 });
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor).findings).toEqual([]);
    for (const mutate of [
      (value: any) => { value.system.resources.legres.max = 9; },
      (value: any) => { delete value.system.resources.legres.spent; },
      (value: any) => { value.flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceMax = 9; },
      (value: any) => { delete value.flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceLairMax; },
    ]) {
      const changed = structuredClone(actor); mutate(changed);
      expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, changed).findings.map(finding => finding.code)).toContain('ACTOR_LEGENDARY_RESISTANCE_DRIFT');
    }
    expect(ir).toEqual(before);
    delete ir.creature.legendary.resistanceMax; delete ir.creature.legendary.resistanceLairMax;
    const noQuotaMarkdown = renderMonsterIntakeMarkdown(ir);
    const noQuota = await convertMarkdownContentToJson({ content: noQuotaMarkdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    expect(document(ir)['intake-legendary-ledger']).toEqual({ max: 3, lairMax: 4, recovery: 'own-turn-start' });
    expect((noQuota.rawJson as any).system.resources.legres.max).toBe(0);
    expect((noQuota.rawJson as any).flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceMax).toBeUndefined();
  });

  test('a prose-only daily quota cannot become a spellcasting parent pool', () => {
    const ir = buildRatWarlockIr(), group = ir.creature.spellcasting![0]!;
    group.description = 'Secret Magic (9/Day). The sentinel casts Clairvoyance, using the same spellcasting ability as Spellcasting.';
    group.usageGroups = [group.usageGroups[0]!];
    const doc = document(ir);
    expect(doc['特性'][0]['使用次数']).toBeUndefined();
    expect(doc['特性'][0]['描述']).toBe(group.description);
    expect(doc['法术清单'].spellcastingGroups[0].spellRefs.every((ref: any) => ref.uses === undefined)).toBe(true);
  });

  test('a shared spellcasting pool uses the AI count even when the prose contains a different quota', () => {
    const ir = buildRatWarlockIr(), group = ir.creature.spellcasting![0]!;
    group.description = 'Secret Magic (9/Day). The sentinel casts Clairvoyance, using the same spellcasting ability as Spellcasting.';
    group.usageGroups = [{ ...group.usageGroups[0]!, usage: 'daily-shared', count: 2 }];
    const doc = document(ir);
    expect(doc['特性'][0]['使用次数']).toEqual({ max: 2, period: 'day' });
    expect(doc['法术清单'].spellcastingGroups[0].spellRefs.every((ref: any) => ref.uses.value === 2 && ref.uses.shared === true)).toBe(true);
    expect(doc['特性'][0]['描述']).toBe(group.description);
  });

  test('independent daily spell quotas do not acquire a shared parent resource', () => {
    const ir = buildRatWarlockIr(), group = ir.creature.spellcasting![0]!;
    group.usageGroups = [{ ...group.usageGroups[0]!, usage: 'daily-each', count: 2 }];
    const doc = document(ir);
    expect(doc['特性'][0]['使用次数']).toBeUndefined();
    expect(doc['法术清单'].spellcastingGroups[0].spellRefs.every((ref: any) => ref.uses.value === 2 && ref.uses.shared === false)).toBe(true);
  });

  test('keeps the approved sphere to emanation representation mapping', () => {
    const ir = buildRatWarlockIr();
    ir.creature.actions = [{ name: 'Pulse', description: 'Each creature in a 10-foot Emanation takes 2d6 Fire damage.',
      activityType: 'save', save: { dc: 17, ability: 'dex' }, aoe: { shape: 'sphere', radius: 10 }, damage: [{ formula: '2d6', type: 'fire', relationship: 'base' }] }];
    expect(document(ir)['动作'][0].AoE).toEqual({ 形状: '半径', 范围: 10 });
    expect(ir.creature.actions[0]!.aoe).toEqual({ shape: 'sphere', radius: 10 });
  });

  test('the literal marker reaches the formal workflow and prevents prose from replacing explicit mechanics', async () => {
    const ir = buildRatWarlockIr();
    ir.creature.traits[0]!.description = 'Armor Class 99. This narration restores 99 Hit Points and makes the target poisoned.';
    ir.creature.actions[0]!.description = 'The prose says +99 to hit, DC 99, and 99d99 Fire damage. Preserve this complete prose while using only the explicit AI fields.';
    ir.creature.actions[0]!.uses = { max: 4, period: 'shortRest' };
    ir.creature.actions.push({ name: 'Declared Save', description: 'The prose says DC 99 Strength, 99d99 Fire damage and poisoned. The structured fields remain authoritative.',
      activityType: 'save', save: { dc: 17, ability: 'wis', outcome: 'half' }, range: 60,
      damage: [{ formula: '2d6', type: 'force', relationship: 'base' }],
      appliedConditions: [{ statuses: ['prone'], duration: '1 minute' }] });
    const before = structuredClone(ir), markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const actor = generated.rawJson as any;
    expect(actor.system.attributes.ac.flat).toBe(12);
    const bite = actor.items.find((item: any) => item.name.includes('啃咬'));
    const attack = Object.values(bite.system.activities)[0] as any;
    expect(Number(attack.attack.bonus)).toBe(4);
    expect(bite.system.uses).toMatchObject({ max: '4', recovery: [{ period: 'sr', type: 'recoverAll' }] });
    expect(bite.system.description.value).toContain(ir.creature.actions[0]!.description);
    const pulse = actor.items.find((item: any) => item.name === 'Declared Save');
    const save = Object.values(pulse.system.activities)[0] as any;
    expect(Number(save.save.dc.formula)).toBe(17);
    expect(save.save.ability).toEqual(['wis']);
    expect(Number(save.range.value)).toBe(60);
    expect(save.damage.parts[0]).toMatchObject({ number: 2, denomination: 6, types: ['force'] });
    expect(pulse.effects.flatMap((effect: any) => effect.statuses)).toEqual(['prone']);
    const proseOnly = actor.items.find((item: any) => item.name.includes('敏锐嗅觉'));
    expect(Object.values(proseOnly.system.activities).map((activity: any) => activity.type)).toEqual(['utility']);
    expect(proseOnly.effects).toEqual([]);
    expect(verifyMonsterIntake(RAT_WARLOCK_SOURCE, ir, markdown, actor).findings).toEqual([]);
    expect(ir).toEqual(before);
  });
});

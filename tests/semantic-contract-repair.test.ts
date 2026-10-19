import { describe, expect, test } from 'bun:test';
import { localizationRequest, localizationText, protectLocalizationText, validateLocalizationDraft } from '@fvtt-json-generator/contracts/localization';
import { protectCriticalRulePhrases } from '../packages/intake-ai/src/critical-rule-localization';
import { generateEnhancedConditionEffects } from '../packages/generation/src/actor-effects';
import { createActorLocalizationRequest, projectActorLocalizationDraft } from '@fvtt-json-generator/generation/reviewed-localization';
import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from '@fvtt-json-generator/contracts/status-lifecycle';
import { ItemGenerator } from '@fvtt-json-generator/generation/item-generator';
import yaml from 'js-yaml';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';

function validate(source: string, translated: string): void {
  const request = localizationRequest('semantic-contract-fixture', [localizationText('body', source)]);
  validateLocalizationDraft(request, { texts: [{ id: request.texts[0]!.id, text: translated }] });
}

describe('bounded semantic translation contracts', () => {
  test('protects an entire formula and rejects changed, missing or repeated operands', () => {
    const source = 'Roll 1d10 x 5.';
    const protectedText = protectLocalizationText(source);
    expect(protectedText.text).toBe('Roll ⟦0⟧.');
    expect(protectedText.restore('投掷⟦0⟧。')).toBe('投掷1d10 x 5。');
    for (const text of ['投掷⟦0⟧÷⟦1⟧。', '投掷⟦0⟧⟦0⟧。', '投掷⟦1⟧。'])
      expect(() => protectedText.restore(text)).toThrow();
    for (const formula of ['1d10 x 5', '1d10 × 5', '1d10 * 5', '1d10  *  5'])
      expect(() => validate(source, `投掷${formula}。`)).not.toThrow();
    for (const formula of ['1d10 ÷ 5', '1d10 x 6', '5 x 1d10', '1d10 x 5 x 5', '1d10'])
      expect(() => validate(source, `投掷${formula}。`)).toThrow();
    expect(() => validate(source, 'Roll 1d10 x 5。')).toThrow('残留英文');
    expect(protectLocalizationText('Roll -5 x 2.').text).toBe('Roll ⟦0⟧.');
    expect(() => validate('Roll -5 x 2.', '投掷-5 × 2。')).not.toThrow();
    expect(() => validate('Roll -5 x 2.', '投掷+5 × 2。')).toThrow();
    const gazer = 'The target is pushed 25 (1d10 x 5) feet away from the gazer.';
    const protectedGazer = protectLocalizationText(gazer);
    expect(protectedGazer.text).toContain('⟦1⟧');
    expect(protectedGazer.restore('目标被推离凝视者⟦0⟧ ⟦1⟧尺。'))
      .toBe('目标被推离凝视者25 (1d10 x 5)尺。');
    expect(() => validate(gazer, '目标被推离凝视者25（1d10 × 5）尺。')).not.toThrow();
    expect(() => validate(gazer, '目标被推离凝视者25（1d10 ÷ 5）尺。')).toThrow();
  });

  test('protects parenthesized and nested formulas with their grouping and operator order', () => {
    const source = 'Roll (2 + 3) * 4 + 5.';
    const guarded = protectLocalizationText(source);
    expect(guarded.text).toBe('Roll ⟦0⟧.');
    expect(guarded.restore('投掷⟦0⟧。')).toBe('投掷(2 + 3) * 4 + 5。');
    expect(() => validate(source, '投掷（2 + 3）× 4 + 5。')).not.toThrow();
    for (const changed of ['2 + 3 * (4 + 5)', '(2 + 3) ÷ 4 + 5', '(2 + 3) * 5 + 4', '(2 + 3) * 4']) {
      expect(() => validate(source, `投掷${changed}。`)).toThrow();
    }
    const nested = 'Roll 2 * (3 + (4 * 5)).';
    expect(protectLocalizationText(nested).text).toBe('Roll ⟦0⟧.');
    expect(() => validate(nested, '投掷2 × （3 + （4 x 5））。')).not.toThrow();
    expect(() => validate(nested, '投掷（2 × 3 + 4）* 5。')).toThrow();
    const signed = 'The damage is 2 * -3.';
    expect(protectLocalizationText(signed).text).toBe('The damage is ⟦0⟧.');
    expect(() => validate(signed, '伤害为2 × -3。')).not.toThrow();
    expect(() => validate(signed, '伤害为2 / -3。')).toThrow();
  });

  test('binds source range and damage roles, while retaining ordinary unrelated prose', () => {
    const source = 'Within 20 feet, the target takes 10 Fire damage.';
    expect(() => validate(source, '20尺内，目标受到10点火焰伤害。')).not.toThrow();
    expect(() => validate(source, '10尺内，目标受到20点火焰伤害。')).toThrow();
    expect(() => validate('The guardian waits 20 minutes.', '守卫等待20分钟。')).not.toThrow();
    const protectedRule = protectCriticalRulePhrases(source);
    expect(protectedRule.text).toBe('⟪RULEA⟫.');
    expect(protectedRule.restore(protectedRule.text)).toBe('20尺内，目标受到10点火焰伤害.');
    const otherShape = 'A creature within 30 feet takes 6 Cold damage.';
    expect(() => validate(otherShape, '30尺内的生物受到6点寒冷伤害。')).not.toThrow();
    expect(() => validate(otherShape, '6尺内的生物受到30点寒冷伤害。')).toThrow();
    const competingRange = 'Within 10 feet, the target takes 5 fire damage and moves 15 feet.';
    expect(() => validate(competingRange, '目标在10尺内受到5点火焰伤害并移动15尺。')).not.toThrow();
    expect(() => validate(competingRange, '目标在15尺内受到5点火焰伤害并移动10尺。')).toThrow();
  });

  test('keeps affirmative and negative heavy armour clauses distinct', () => {
    const negative = 'A creature not wearing Heavy Armor takes 10 Slashing damage.';
    const positive = 'A creature wearing Heavy Armour takes 10 Slashing damage.';
    expect(() => validate(negative, '未穿着重甲的生物受到10点挥砍伤害。')).not.toThrow();
    expect(() => validate(positive, '穿着重甲的生物受到10点挥砍伤害。')).not.toThrow();
    expect(() => validate(negative, '穿着重甲的生物受到10点挥砍伤害。')).toThrow();
    expect(() => validate(positive, '未穿着重甲的生物受到10点挥砍伤害。')).toThrow();
    expect(protectCriticalRulePhrases(negative).restore(protectCriticalRulePhrases(negative).text))
      .toBe('未穿着重甲的生物受到10点挥砍伤害.');
    const actualClause = 'or half as much if it is wearing Heavy Armor.';
    expect(() => validate(actualClause, '如果它穿着重甲，则伤害减半。')).not.toThrow();
    expect(() => validate(actualClause, '如果它未穿着重甲，则伤害减半。')).toThrow();
    expect(protectCriticalRulePhrases(actualClause).restore(protectCriticalRulePhrases(actualClause).text))
      .toBe('or half as much 如果该生物穿着重甲.');
    const otherSubject = 'If the target is not wearing Heavy Armour, it takes 10 Slashing damage.';
    expect(() => validate(otherSubject, '如果目标未穿着重甲，则受到10点挥砍伤害。')).not.toThrow();
    expect(() => validate(otherSubject, '如果目标穿着重甲，则受到10点挥砍伤害。')).toThrow();
    const equipped = 'It takes 5 fire damage if it is wearing heavy armor.';
    const unequipped = 'It takes 5 fire damage if it is not wearing heavy armor.';
    for (const faithful of ['如果它装备重甲，它受到5点火焰伤害。', '如果它身穿重甲，它受到5点火焰伤害。'])
      expect(() => validate(equipped, faithful)).not.toThrow();
    for (const faithful of ['如果它没有装备重甲，它受到5点火焰伤害。', '如果它并未身穿重甲，它受到5点火焰伤害。']) {
      expect(() => validate(unequipped, faithful)).not.toThrow();
      expect(() => validate(equipped, faithful)).toThrow();
    }
    for (const unsupportedNegative of ['如果它不是身穿重甲，它受到5点火焰伤害。', '如果它不再穿着重甲，它受到5点火焰伤害。']) {
      expect(() => validate(equipped, unsupportedNegative)).toThrow();
      expect(() => validate(unequipped, unsupportedNegative)).toThrow();
    }
    expect(() => validate(unequipped, '如果它装备重甲，它受到5点火焰伤害。')).toThrow();
    expect(() => validate(equipped, '如果它有重甲，它受到5点火焰伤害。')).toThrow();
  });
});

describe('native status display identity', () => {
  test('formal v14 Actor generation hands the status ID directly to localization', async () => {
    const source = `---\n${yaml.dump({ 名称: '束缚兽', 类型: 'npc', 护甲等级: 12, 生命值: 30,
      能力: { 力量: 14, 敏捷: 12, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 },
      动作: [{ 名称: '束缚爪击', 类型: 'attack', 攻击类型: 'mwak', 命中: 4, 范围: '触及 5 尺',
        伤害: [{ 公式: '1d6+2', 类型: 'slashing' }], 描述: '命中：目标被擒抱 (Grappled)。' }],
    }, { lineWidth: -1 })}---\n`;
    const response = await convertFinalActorSource(buildForgeActorRequest({ content: source, displayName: '束缚兽',
      requestId: 'semantic-status-chain', fvttVersion: '14.364', systemVersion: '5.3.3' }));
    if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Formal status generation failed.');
    const actor: any = response.result.artifact;
    const effect = actor.items.flatMap((item: any) => item.effects ?? []).find((entry: any) => entry.statuses?.includes('grappled'));
    expect(effect?.name).toBe('受擒 Grappled');
    const request = createActorLocalizationRequest(actor, source);
    expect(request.texts.some(text => text.source === effect.name)).toBe(false);
    const draft = { texts: request.texts.map(text => ({ id: text.id, text: text.source.replace(/Grappled/gu, '受擒') })) };
    const localized = projectActorLocalizationDraft(actor, source, draft).actor;
    const localizedEffect = localized.items.flatMap((item: any) => item.effects ?? [])
      .find((entry: any) => entry.statuses?.includes('grappled'));
    expect(localizedEffect.name).toBe('受擒 Grappled');
    const unchangedShape = structuredClone(localizedEffect);
    unchangedShape.name = effect.name;
    expect(unchangedShape).toEqual(effect);
  });
  test('Item generation passes the target to native status titles and keeps v12 unchanged', async () => {
    const parsed: any = { name: 'Binding Claw', type: 'weapon', description: 'Source item.', structuredActions: {
      attacks: [{ name: 'Claw', type: 'attack', desc: '命中：目标被擒抱 (Grappled)。',
        attack: { type: 'mwak', toHit: 5, range: 'reach 5 ft.', damage: [{ formula: '1d6 + 3', type: 'slashing' }] } }],
    } };
    const v12 = await new ItemGenerator({ fvttVersion: '12' }).generate(parsed);
    const v14 = await new ItemGenerator({ fvttVersion: '14' }).generate(parsed);
    expect(v12.effects).toHaveLength(1);
    expect(v14.effects).toHaveLength(1);
    expect(v12.effects![0].name).toBe('被擒抱 Grappled');
    expect(v14.effects![0].name).toBe('受擒 Grappled');
    expect(v14.effects![0].statuses).toEqual(['grappled']);
    const v14Shape = structuredClone(v14.effects![0]);
    v14Shape.name = v12.effects![0].name;
    v14Shape.origin = v12.effects![0].origin;
    v14Shape._stats = v12.effects![0]._stats;
    expect(v14Shape).toEqual(v12.effects![0]);
    expect(Object.values(v14.system.activities).flatMap((activity: any) => activity.effects.map((effect: any) => effect._id)))
      .toEqual([v14.effects![0]._id]);
  });
  test('projects every registered native status from its ID without a model text slot', () => {
    const effects = Object.entries(NATIVE_LIFECYCLE_STATUS_DEFINITIONS).map(([status]) => ({
      name: status[0]!.toUpperCase() + status.slice(1), statuses: [status], changes: [],
    }));
    const actor: any = { name: 'Guardian', _stats: { coreVersion: '14.364', systemVersion: '5.3.3' }, effects, items: [] };
    const request = createActorLocalizationRequest(actor, 'catalog-source');
    expect(request.texts.map(text => text.source)).toEqual(['Guardian']);
    const localized = projectActorLocalizationDraft(actor, 'catalog-source', {
      texts: [{ id: request.texts[0]!.id, text: '守卫' }],
    }).actor;
    expect(localized.effects).toEqual(effects.map((effect) => ({ ...effect,
      name: `${NATIVE_LIFECYCLE_STATUS_DEFINITIONS[effect.statuses[0] as keyof typeof NATIVE_LIFECYCLE_STATUS_DEFINITIONS].label} ${effect.name}`,
    })));
    expect(actor.effects).toEqual(effects);
  });
  test.each([
    ['命中：目标被擒抱 (Grappled)。', 'grappled', '受擒 Grappled'],
    ['命中：目标陷入受限 (Restrained) 状态。', 'restrained', '束缚 Restrained'],
    ['On a failed save, the target becomes paralyzed for 1 minute.', 'paralyzed', '麻痹 Paralyzed'],
  ])('uses the catalog for v14 %s while preserving v12 and mechanical shape', (source, status, title) => {
    const v12 = generateEnhancedConditionEffects(source, {}, 'Status fixture');
    const v14 = generateEnhancedConditionEffects(source, {}, 'Status fixture', undefined, true);
    expect(v14).toHaveLength(1);
    expect(v14[0].statuses).toEqual([status]);
    expect(v14[0].name).toBe(title);
    const shape = structuredClone(v14);
    shape[0].name = v12[0].name;
    expect(shape).toEqual(v12);
  });

  test('localizes builtins by status ID and leaves a custom effect title to review', () => {
    const actor: any = { name: 'Guardian', _stats: { coreVersion: '14.364', systemVersion: '5.3.3' },
      effects: [{ name: '被擒抱 Grappled', statuses: ['grappled'], changes: [] },
        { name: 'Fell Curse', statuses: ['blinded'], changes: [] }],
      items: [{ name: 'Ray', effects: [{ name: 'Paralyzed', statuses: ['paralyzed'], changes: [] }] }] };
    const request = createActorLocalizationRequest(actor, 'status-source');
    expect(request.texts.some(text => text.source === '被擒抱 Grappled' || text.source === 'Paralyzed')).toBe(false);
    expect(request.texts.some(text => text.source === 'Fell Curse')).toBe(true);
    const draft = { texts: request.texts.map(text => ({ id: text.id, text: `译文${text.source.replace(/[A-Za-z]+/gu, '')}` })) };
    const localized = projectActorLocalizationDraft(actor, 'status-source', draft).actor;
    expect(localized.effects[0]).toEqual({ ...actor.effects[0], name: '受擒 Grappled' });
    expect(localized.effects[1]).toEqual({ ...actor.effects[1], name: '译文 Fell Curse' });
    expect(localized.items[0].effects[0]).toEqual({ ...actor.items[0].effects[0], name: '麻痹 Paralyzed' });
    expect(actor.effects[0].name).toBe('被擒抱 Grappled');
    const recorded = localizationRequest('recorded-grappled-title', [localizationText('title', '被擒抱 Grappled')]);
    expect(() => validateLocalizationDraft(recorded, { texts: [{ id: recorded.texts[0]!.id, text: '被擒抱' }] })).toThrow('Grappled');
    const legacy = structuredClone(actor); legacy._stats.coreVersion = '12.331';
    expect(createActorLocalizationRequest(legacy, 'status-source').texts.some(text => text.source === 'Paralyzed')).toBe(true);
  });
});

import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { YamlParser } from '@fvtt-json-generator/parser';
import { generateActorArtifact } from '@fvtt-json-generator/workflows/generation-pipeline';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';

// All surrounding Actor stats/configuration and the third positive are test-authored.
// These two source excerpts and their branch annotations reproduce saved-r2
// Baernaloth Keeper, source SHA256 8032158a5794a1322d4fe710436e8ef5074f8ae74e3f1470347ca4b0188b12b3.
const grey = '(Level 7 Spell). The baernaloth touches a creature, forcing it to make a Charisma Saving Throw: DC 20. Failure: 73 (6d10 + 40) Necrotic damage and the creature is Cursed. The Cursed creature can\'t be returned to life by any means short of a Wish spell. If this curse is removed, the creature dies. Success: Half damage.';
const miasma = 'The baernaloth spews forth billowing grey vapors that coalesce in a 20-foot radius Sphere within 120 feet, forcing each creature in the area to make a Wisdom Saving Throw: DC 20. Failure: 35 (10d6) Psychic damage, the creature is Charmed by the baernaloth, and it is hostile to all other creatures until the end of its next turn. Success: Half damage.';
const branch = 'Failure (half damage on a Success)';
const part = (formula: string, type: string, relationship = 'base', condition: string | null = branch) =>
  ({ 公式: formula, 类型: type, 关系: relationship, ...(condition ? { 条件: condition } : {}) });
const save = (description: string, damage: any[], extra: Record<string, unknown> = {}) =>
  ({ 名称: 'Test-authored source pulse', 类型: 'save', 描述: description, DC: 20, 属性: '魅力', 伤害: damage, ...extra });
function markdown(actions: any[], section = '动作', newline = '\n'): string {
  return (`---\n${yaml.dump({ 名称: 'Test-authored branch projection Actor', 类型: 'npc',
    护甲等级: 12, 生命值: 40, 挑战等级: 1, 熟练加值: 2,
    能力: { 力量: 14, 敏捷: 12, 体质: 14, 智力: 10, 感知: 10, 魅力: 10 },
    [section]: actions }, { lineWidth: -1 })}---\n`).replaceAll('\n', newline);
}
async function generate(actions: any[], section = '动作', version: '12' | '14' = '14', newline = '\n') {
  const source = markdown(actions, section, newline);
  const parsed = new YamlParser().parse(source);
  const generated = await generateActorArtifact({ parsed, sourceText: source, route: 'chinese',
    fvttVersion: version, effectProfile: 'core', translationService: null,
    iconOptions: { mode: 'off' }, captureRulePresentation: version === '14' });
  return { ...generated, source, parsed };
}
const activities = (actor: any) => Object.values(actor.items[0].system.activities) as any[];
function completeShape(actor: any): any {
  if (Array.isArray(actor)) return actor.map(completeShape);
  if (!actor || typeof actor !== 'object') return actor;
  return Object.fromEntries(Object.entries(actor).map(([key, value]) => [
    /^[a-z0-9]{16}$/u.test(key) ? 'activity-id' : key,
    key === '_id' ? '<stable-id>' : key === 'createdTime' || key === 'modifiedTime' ? 0 : completeShape(value),
  ]));
}

describe('save branch labels share one conservative Actor and fixed-Chinese projection', () => {
  test.each([
    ['saved touch-save excerpt', save(grey, [part('6d10 + 40', 'necrotic')])],
    ['saved area-save excerpt', save(miasma, [part('10d6', 'psychic')], { 属性: '感知', AoE: { 形状: '球形', 范围: 20 } })],
    ['test-authored legendary multi-damage source', save('Intelligence Saving Throw: DC 20. Failure: 7 (2d6) Fire damage plus 3 (1d6) Psychic damage. Success: Half as much damage.',
      [part('2d6', 'fire', 'base', 'Failure'), part('1d6', 'psychic', 'additional', 'on a failed save')], { 属性: '智力', 激活: 'legendary', 传奇动作消耗: 2 })],
  ] as const)('%s projects the same complete Actor as an unannotated branch', async (_name, action) => {
    const baseline = structuredClone(action);
    for (const damage of baseline.伤害) delete damage.条件;
    const expected = await generate([baseline]);
    for (const newline of ['\n', '\r\n']) {
      const result = await generate([action], '动作', '14', newline);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(completeShape(result.actor)).toEqual(completeShape(expected.actor));
      const activity = activities(result.actor)[0];
      expect(activity.type).toBe('save');
      expect(activity.save.dc).toEqual({ calculation: '', formula: '20' });
      expect(activity.damage.onSave).toBe('half');
      expect(activity.damage.parts).toHaveLength(action.伤害.length);
      expect(result.parsed.structuredActions?.动作?.[0]?.sourceDamageParts?.[0]?.condition).toBe(action.伤害[0].条件);
      const summaries = result.rulePresentation!.blocks.filter(b => b.factRefs.some(ref => ref.includes('/structured/')));
      expect(summaries.some(b => b.zh.includes('成功时伤害减半') && !b.zh.includes('触发或替代条件待GM核对'))).toBe(true);
    }
  });

  test.each([
    ['missing success source', grey.replace('Success: Half damage.', '')],
    ['negated success source', grey.replace('Success: Half damage.', 'Success: Not half damage.')],
    ['conflicting success source', grey.replace('Success: Half damage.', 'Success: Half damage. Success: Full damage.')],
    ['extra success consequence', grey.replace('Success: Half damage.', 'Success: Half damage and the target moves 10 feet.')],
    ['conditional failed branch', grey.replace('Failure: 73', 'Failure: If the target is Cursed, it takes 73')],
    ['second failed branch', grey.replace('Failure: 73', 'Second Failure: 73')],
    ['margin failed branch', grey.replace('Failure: 73', 'Failure by 5 or More: 73')],
    ['wrong damage fact', grey.replace('73 (6d10 + 40)', '73 (7d10 + 40)')],
  ])('%s remains blocked or explicitly manual', async (_name, description) => {
    const result = await generate([save(description, [part('6d10 + 40', 'necrotic')])]);
    expect(activities(result.actor)[0].damage.parts).toEqual([]);
    expect(result.verification.status).not.toBe('accepted');
    expect(result.rulePresentation!.uncoveredMechanics.some(entry => entry.details.some(detail => detail.includes('/condition')))).toBe(true);
  });
  test('a branch label with an extra trigger never becomes unconditional', async () => {
    const result = await generate([save(grey, [part('6d10 + 40', 'necrotic', 'base', branch + ' while Cursed')])]);
    expect(activities(result.actor)[0].damage.parts).toEqual([]);
    expect(result.verification.status).not.toBe('accepted');
  });
  test.each([
    ['conditional prefix before comma', 'If the target is Cursed, 7 (2d6) Fire damage.', false],
    ['conditional additional damage in a later sentence', '7 (2d6) Fire damage. If the target is Cursed, plus 3 (1d6) Cold damage.', true],
    ['conditional additional damage in the same sentence', '7 (2d6) Fire damage and, if the target is Cursed, plus 3 (1d6) Cold damage.', true],
    ['unless prerequisite', 'Unless the target is immune, 7 (2d6) Fire damage.', false],
    ['trailing only-if prerequisite', '7 (2d6) Fire damage only if the target is Cursed.', false],
    ['trailing comma prerequisite', '7 (2d6) Fire damage, if the target is Cursed.', false],
    ['negated additional damage', '7 (2d6) Fire damage plus no 3 (1d6) Cold damage.', true],
    ['explicitly excluded additional damage', '7 (2d6) Fire damage, not 3 (1d6) Cold damage.', true],
    ['unrecognized later applicability', '7 (2d6) Fire damage. This applies to Cursed creatures.', false],
    ['unrecognized comma applicability', '7 (2d6) Fire damage, against a Cursed creature.', false],
  ])('test-authored %s does not discard the full failure-branch prerequisite', async (_name, failure, additional) => {
    const action = save('Charisma Saving Throw: DC 20. Failure: ' + failure + ' Success: Half damage.',
      [part('2d6', 'fire', 'base', 'Failure'), ...(additional ? [part('1d6', 'cold', 'additional', 'Failure')] : [])]);
    const result = await generate([action]);
    expect(activities(result.actor)[0].damage.parts).toEqual([]);
    expect(result.verification.status).not.toBe('accepted');
    expect(result.canonical.mechanics.filter(m => m.kind === 'damage').every(m => m.projection === 'literal-only')).toBe(true);
    const response = await convertFinalActorSource(buildForgeActorRequest({content:result.source,
      displayName:'Test-authored branch prerequisite',requestId:'test-authored-review-fix',
      fvttVersion:'14.364',systemVersion:'5.3.3'}));
    expect('result' in response).toBe(true);
    if (!('result' in response)) throw new Error('Formal prerequisite request failed');
    expect(response.result.status).not.toBe('accepted');
    if ('artifact' in response.result && response.result.artifact) expect(activities(response.result.artifact)[0].damage.parts).toEqual([]);
  });

  test('the formal Forge workflow exposes exact Actor values and rejects planted onSave drift', async () => {
    const generated = await generate([save(grey, [part('6d10 + 40', 'necrotic')])]);
    const response = await convertFinalActorSource(buildForgeActorRequest({ content: generated.source,
      displayName: 'Test-authored branch projection Actor', requestId: 'test-authored-branch-projection',
      fvttVersion: '14.364', systemVersion: '5.3.3' }));
    expect('result' in response).toBe(true);
    if (!('result' in response) || !('artifact' in response.result) || !response.result.artifact) throw new Error('Missing formal Actor artifact');
    const activity = activities(response.result.artifact)[0];
    expect(activity.save).toEqual({ ability: ['cha'], dc: { calculation: '', formula: '20' } });
    expect(activity.damage).toEqual({ onSave: 'half', parts: [{ number: 6, denomination: 10, bonus: '40',
      types: ['necrotic'], custom: { enabled: false, formula: '' }, scaling: { mode: 'whole', number: 1, formula: '' } }] });
    activity.damage.onSave = 'none';
    const report = verifyGeneratedDocument({ canonical: generated.canonical, output: response.result.artifact,
      target: '14', effectProfile: 'core' });
    expect(report.diagnostics.some(d => d.code === 'GEN_SAVE_OUTCOME_MISMATCH')).toBe(true);
  });
});

describe('conditional damage and post-attack saves remain complete GM facts', () => {
  test.each([
    // Saved Premonition of Pain source/IR damage relationship.
    ['utility', 'conditional', 'Whenever the Cursed creature succeeds on an Attack Roll or Saving Throw and does not choose to fail and end this effect.', '3d6', 'psychic'],
    // Saved Nothing for Nothing source/IR: base carries a real prerequisite.
    ['damage', 'base', "A creature that targets Charon with a spell or deals damage to it for the first time on a turn and can\'t sacrifice one Spell Slot of any level", '1d10', 'necrotic'],
    // Test-authored near relation, never a base roll.
    ['utility', 'replacement', 'If the target is already restrained', '2d8', 'cold'],
  ] as const)('%s preserves %s damage with its trigger and no unconditional roll', async (type, relationship, condition, formula, damageType) => {
    const result = await generate([{ 名称: 'Test-authored conditional feature', 类型: type,
      描述: condition + ': ' + formula + ' damage.', 伤害: [part(formula, damageType, relationship, condition)] }], '附赠动作');
    expect(result.parsed.structuredActions?.附赠动作?.[0]?.sourceDamageParts).toEqual([{ formula, type: damageType, relationship, condition }]);
    expect(activities(result.actor).every(a => !a.damage?.parts?.length)).toBe(true);
    expect(result.canonical.mechanics.find(m => m.kind === 'damage')).toMatchObject({ projection: 'literal-only', value: { formula, condition, relationship } });
    expect(result.verification.status).toBe('needs_review');
    expect(result.rulePresentation!.uncoveredMechanics.some(entry => entry.details.some(detail => detail.includes(condition)))).toBe(true);
  });
  const consequence = 'The creature shape-shifts into a Lemure Aspirant that is hostile to all creatures until it dies or the effect is dispelled.';
  const touch = () => ({ 名称: 'Test-authored conditional touch', 类型: 'attack', 攻击类型: 'msak', 命中: 12, 范围: '触及 5 尺',
    伤害: [part('8d6 + 6', 'psychic', 'base', null)], DC: 20, 属性: '魅力', dcSourceKind: 'literal',
    描述: 'Melee Spell Attack: +12, reach 5 ft. Hit: 34 (8d6 + 6) Psychic damage. A creature reduced to 0 Hit Points by this damage must make a Charisma Saving Throw: DC 20. Failure: ' + consequence,
    失败效果: [{ 描述: consequence }], 内嵌效果: [{ 类型: consequence, 描述: consequence }] });
  test('the saved 0HP trigger keeps native attack and unlinked GM consequence', async () => {
    const result = await generate([touch()]);
    expect(result.verification.status).toBe('needs_review');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const activity = activities(result.actor)[0];
    expect(activity).toMatchObject({ type: 'attack', attack: { type: { value: 'melee', classification: 'spell' } }, damage: { parts: [{ number: 8, denomination: 6, bonus: '6', types: ['psychic'] }] } });
    expect(activities(result.actor).some(a => a.type === 'save')).toBe(false);
    expect(activity.effects ?? []).toEqual([]);
    expect(result.actor.items[0].effects[0].name).toBe(consequence);
    expect(result.canonical.mechanics.find(m => m.kind === 'save')).toMatchObject({ projection: 'literal-only', value: { dc: 20, ability: 'cha', condition: 'A creature reduced to 0 Hit Points by this damage' } });
    expect(result.rulePresentation!.blocks.some(b => b.zh.includes('仅当本次攻击伤害使目标生命值降至0时') && b.executionMode === 'gm-assisted')).toBe(true);
  });
  test.each([
    ['rwak', 'Dexterity', '敏捷', 'prone', 'The creature is Prone.'],
    ['mwak', 'Constitution', '体质', 'poisoned', 'The creature is Poisoned.'],
  ])('test-authored %s consequence retains the unrelated immediate effect', async (attackType, abilityWord, ability, status, failure) => {
    const action: any = touch();
    action.攻击类型 = attackType;
    action.属性 = ability;
    action.描述 = `Hit: 34 (8d6 + 6) Psychic damage. The target reduced to 0 Hit Points by this damage must make a ${abilityWord} Saving Throw: DC 20. Failure: ${failure}`;
    action.失败效果 = [{ 状态: status, 描述: failure }];
    action.内嵌效果 = [{ 类型: status, 描述: failure }, { 类型: 'Test-authored immediate mark', 描述: 'Applies on the initial hit.' }];
    const result = await generate([action]);
    expect(result.verification.status).toBe('needs_review');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const item = result.actor.items[0], activity = activities(result.actor)[0];
    expect(activity.type).toBe('attack');
    expect(activity.damage.parts).toHaveLength(1);
    expect(activities(result.actor).some(a => a.type === 'save')).toBe(false);
    const conditional = item.effects.find((e: any) => e.statuses.includes(status));
    const immediate = item.effects.find((e: any) => e.name === 'Test-authored immediate mark');
    expect(conditional).toBeTruthy(); expect(immediate).toBeTruthy();
    expect(activity.effects.some((e: any) => e._id === conditional._id)).toBe(false);
    expect(activity.effects.some((e: any) => e._id === immediate._id)).toBe(true);
  });
  test.each(['no redundant fields', 'embedded effect only', 'failure effect only'])('test-authored 0HP poisoned source with %s never applies the delayed status on the attack', async shape => {
    const action: any = touch();
    action.属性 = '体质';
    action.描述 = 'Melee Spell Attack: +12, reach 5 ft. Hit: 34 (8d6 + 6) Psychic damage. A creature reduced to 0 Hit Points by this damage must make a Constitution Saving Throw: DC 20. Failure: The creature is Poisoned.';
    delete action.失败效果; delete action.内嵌效果;
    if (shape === 'embedded effect only') action.内嵌效果 = [{ 类型: 'poisoned', 描述: 'The creature is Poisoned.' }];
    if (shape === 'failure effect only') action.失败效果 = [{ 状态: 'poisoned', 描述: 'The creature is Poisoned.' }];
    const result = await generate([action]);
    const item = result.actor.items[0], activity = activities(result.actor)[0];
    expect(activity.type).toBe('attack');
    expect(activity.damage.parts).toHaveLength(1);
    const delayedIds = new Set(item.effects.filter((e: any) => e.statuses.includes('poisoned')).map((e: any) => e._id));
    expect(delayedIds.size).toBeGreaterThan(0);
    expect((activity.effects ?? []).some((e: any) => delayedIds.has(e._id))).toBe(false);
    expect(result.verification.status).toBe('needs_review');
    const response = await convertFinalActorSource(buildForgeActorRequest({content:result.source,
      displayName:'Test-authored sparse delayed save',requestId:'test-authored-sparse-review-fix',
      fvttVersion:'14.364',systemVersion:'5.3.3'}));
    expect('result' in response).toBe(true);
    if (!('result' in response) || !('artifact' in response.result) || !response.result.artifact) throw new Error('Missing sparse formal artifact');
    const formalItem = (response.result.artifact as any).items[0];
    const formalDelayedIds = new Set(formalItem.effects.filter((e: any) => e.statuses.includes('poisoned')).map((e: any) => e._id));
    expect(activities(response.result.artifact).every(a => !(a.effects ?? []).some((e: any) => formalDelayedIds.has(e._id)))).toBe(true);
  });
  test('test-authored distinct immediate status remains linked while the source-proven delayed status is unlinked', async () => {
    const action: any = touch(); action.属性 = '体质';
    action.描述 = 'Hit: 34 (8d6 + 6) Psychic damage and the target is Grappled. A creature reduced to 0 Hit Points by this damage must make a Constitution Saving Throw: DC 20. Failure: The creature is Poisoned.';
    delete action.失败效果; delete action.内嵌效果;
    const result = await generate([action]);
    const item = result.actor.items[0], activity = activities(result.actor)[0];
    const immediate = item.effects.find((e: any) => e.statuses.includes('grappled'));
    const delayed = item.effects.find((e: any) => e.statuses.includes('poisoned'));
    expect(immediate).toBeTruthy(); expect(delayed).toBeTruthy();
    expect(activity.effects.some((e: any) => e._id === immediate._id)).toBe(true);
    expect(activity.effects.some((e: any) => e._id === delayed._id)).toBe(false);
  });
  test('test-authored ambiguous immediate/delayed status identity blocks the formal workflow', async () => {
    const action: any = touch(); action.属性 = '体质';
    action.描述 = 'Hit: 34 (8d6 + 6) Psychic damage and the target is Poisoned. A creature reduced to 0 Hit Points by this damage must make a Constitution Saving Throw: DC 20. Failure: The creature is Poisoned.';
    delete action.失败效果; delete action.内嵌效果;
    await expect(generate([action])).rejects.toThrow('ConditionalAttackSaveEffectAmbiguous');
    const response = await convertFinalActorSource(buildForgeActorRequest({content:markdown([action]),
      displayName:'Test-authored ambiguous delayed status',requestId:'test-authored-ambiguous-review-fix',
      fvttVersion:'14.364',systemVersion:'5.3.3'}));
    expect('result' in response).toBe(true);
    if (!('result' in response)) throw new Error('Missing ambiguous formal result');
    expect(response.result.status).toBe('failed');
    expect('artifact' in response.result ? response.result.artifact : undefined).toBeUndefined();
  });
  test.each(['wrong DC', 'wrong ability', 'missing trigger', 'conflicting trigger'])('%s never gets the conditional-save exception', async kind => {
    const action = touch();
    if (kind === 'wrong DC') action.DC = 21;
    if (kind === 'wrong ability') action.属性 = '感知';
    if (kind === 'missing trigger') action.描述 = action.描述.replace('A creature reduced to 0 Hit Points by this damage must', 'The target must');
    if (kind === 'conflicting trigger') (action as any).豁免条件 = 'Whenever the target is hit';
    const result = await generate([action]);
    expect(result.verification.status).toBe('failed');
    expect(result.diagnostics.some(d => d.code === 'GEN_MECHANIC_NOT_PROJECTED')).toBe(true);
  });
  test('unrelated native attacks and v12 saves keep their complete Actor shape', async () => {
    const action = save('Charisma Saving Throw: DC 20. Failure: 7 (2d6) Fire damage. Success: Half damage.', [part('2d6', 'fire', 'base', null)]);
    for (const version of ['12', '14'] as const) {
      const result = await generate([action], '动作', version);
      const annotated = structuredClone(action); annotated.伤害[0].条件 = branch;
      const replay = await generate([annotated], '动作', version);
      expect(completeShape(replay.actor)).toEqual(completeShape(result.actor));
      expect(activities(result.actor)[0].damage.onSave).toBe('half');
    }
    const attack = touch(); delete (attack as any).DC; delete (attack as any).属性;
    attack.描述 = 'Melee Spell Attack: +12, reach 5 ft. Hit: 34 (8d6 + 6) Psychic damage.';
    attack.失败效果 = []; attack.内嵌效果 = [];
    const native = await generate([attack]);
    expect(native.verification.status).toBe('accepted');
    expect(activities(native.actor)[0]).toMatchObject({ type: 'attack', damage: { parts: [{ number: 8, denomination: 6, bonus: '6', types: ['psychic'] }] } });
  });
});

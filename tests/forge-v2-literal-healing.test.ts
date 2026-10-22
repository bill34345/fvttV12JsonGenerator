import { expect, test } from 'bun:test';
import { bindV2DynamicHealing } from '../packages/intake-ai/src/category-form-v2-healing';
import type { V2Healing } from '../packages/intake-ai/src/category-form-v2';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { splitStagedMonsterSource } from '../packages/intake-ai/src/staged-source';
import { bindV2SelfReference, bindV2SourceFeatureReference, makeV2FeatureIdentityScope } from '../packages/intake-ai/src/category-form-v2-identity';

const path = '/features/unit-proof/healing/0';
const bite = 'Drain. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage plus 10 (3d6) necrotic damage. The target’s hit point maximum is reduced by an amount equal to the necrotic damage taken, and the dusk keeper regains hit points equal to that amount. The reduction lasts until the target finishes a long rest.';
const field = (overrides: Partial<V2Healing> = {}): V2Healing => ({ 公式: null, 取值依据: '等于目标实际受到的死灵伤害量', 类型: '治疗', 目标: '自身', 生效条件: '命中并造成死灵伤害后', ...overrides });
const bind = (healing = field(), source = bite, names = ['Dusk Keeper']) => bindV2DynamicHealing(healing, source, names, path);

test('binds the unique adjacent maximum reduction amount without making a Heal formula', () => {
  for (const source of [bite, bite.replace(/\. /gu, '.\r\n').replace('damage taken', 'damage\r\ntaken')]) {
    const input = field(), before = JSON.stringify(input), result = bind(input, source);
    expect(result).toEqual({ sourceQuote: source.slice(source.indexOf('Hit:'), source.indexOf(' The reduction') === -1 ? source.indexOf('\r\nThe reduction') : source.indexOf(' The reduction')),
      damageType: 'necrotic', recipient: 'self', targetStatus: 'verified', proposedTarget: '自身' });
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.hasOwn(result, 'formula')).toBe(false);
  }
});

test('binds direct actual damage with a different type and source-owned shortened name', () => {
  const source = 'Frost Ray. Ranged Spell Attack: +4 to hit, range 30 ft., one target. Hit: 9 (2d8) cold damage. The sentinel regains hit points equal to the cold damage taken by the target.';
  const result = bind(field({ 取值依据: 'equal to the actual cold damage taken by the target', 目标: 'the sentinel', 生效条件: 'when the target takes cold damage' }), source, ['Rime Sentinel']);
  expect(result.damageType).toBe('cold'); expect(result.targetStatus).toBe('verified');
});

test('binds a same-sentence actual damage antecedent without inventing a hit trigger', () => {
  const source = 'Burn. The target takes 7 (2d6) fire damage, and the ember warden regains hit points equal to that damage.';
  const result = bind(field({ 取值依据: '目标实际受到的火焰伤害数值', 目标: 'self', 生效条件: '目标受到该次火焰伤害时' }), source, ['Ember Warden']);
  expect(result.sourceQuote).toBe(source.slice(source.indexOf('The target')));
  expect(result.damageType).toBe('fire'); expect(result.targetStatus).toBe('verified');
  expect(() => bind(field({ 取值依据: '目标实际受到的火焰伤害数值', 生效条件: '命中并造成火焰伤害后' }), source, ['Ember Warden'])).toThrow('V2_HEALING_CONDITION_CONFLICT');
});

test('translated proper names require review until supplied as an actual actor alias', () => {
  for (const target of ['暮色守卫', '暮色守卫自身']) {
    expect(bind(field({ 目标: target })).targetStatus).toBe('unresolved-translation');
    expect(bind(field({ 目标: target }), bite, ['Dusk Keeper', '暮色守卫']).targetStatus).toBe('verified');
  }
});

test('a proved Hit allows hit timing while its amount remains actual damage', () => {
  for (const condition of ['命中时', '命中后', 'on a hit', 'after a hit'])
    expect(bind(field({ 生效条件: condition })).damageType).toBe('necrotic');
  const source = 'Drain. The target takes 10 (3d6) necrotic damage, and the dusk keeper regains hit points equal to that damage.';
  expect(() => bind(field({ 生效条件: '命中时' }), source)).toThrow('V2_HEALING_CONDITION_CONFLICT');
});

test('only a source-proven maximum reduction can explain the same actual amount', () => {
  const basis = '等于目标实际受到的黯蚀伤害（即目标生命值上限降低的数值）';
  expect(bind(field({ 取值依据: basis })).targetStatus).toBe('verified');
  const direct = bite.replace('The target’s hit point maximum is reduced by an amount equal to the necrotic damage taken, and the dusk keeper regains hit points equal to that amount.', 'The dusk keeper regains hit points equal to the necrotic damage taken by the target.');
  expect(() => bind(field({ 取值依据: basis }), direct)).toThrow('V2_HEALING_RELATION_CONFLICT');
});

test('rejects changed damage type, formula, type, recipient, multiplier and non-actual quantity', () => {
  const invalid: Array<Partial<V2Healing>> = [
    { 取值依据: '等于目标实际受到的火焰伤害量' },
    { 公式: '3d6' }, { 类型: '临时生命值' }, { 目标: '目标生物' }, { 目标: 'the target' }, { 目标: 'an ally' },
    { 取值依据: '等于目标实际受到的死灵伤害量的一半' }, { 取值依据: 'equal to half the necrotic damage taken by the target' },
    { 取值依据: '等于死灵伤害骰式3d6的结果' }, { 取值依据: '等于伤害的数值' },
    { 取值依据: '等于吸血鬼实际受到的死灵伤害量' },
    { 生效条件: null }, { 生效条件: '在目标回合结束时恢复生命值' }, { 生效条件: '命中并造成火焰伤害后' },
  ];
  for (const invalidField of invalid) expect(() => bind(field(invalidField))).toThrow();
});

test('rejects absent, multiple, remote, or changed amount antecedents', () => {
  for (const source of [
    'Drain. Hit: 10 (3d6) necrotic damage. The dusk keeper regains hit points equal to that amount.',
    bite.replace('Hit: 5 (1d6 + 2) piercing damage plus 10 (3d6) necrotic damage. ', ''),
    bite.replace('The target’s hit point maximum', 'A door opens. The target’s hit point maximum'),
    bite.replace('that amount', 'half that amount'),
    bite.replace('necrotic damage taken, and', 'necrotic damage taken plus the piercing damage taken, and'),
    bite.replace('10 (3d6) necrotic damage', '10 (3d6) necrotic damage plus 3 (1d6) necrotic damage'),
    bite.replace('Drain.', 'Hit: 5 (1d6 + 2) piercing damage plus 10 (3d6) necrotic damage.'),
    bite.replace('The target’s hit point maximum', 'The dusk keeper regains hit points equal to the necrotic damage taken by the target. The target’s hit point maximum'),
  ]) expect(() => bind(field(), source)).toThrow();
});

test('does not infer a named source owner, new condition or a translated action label', () => {
  expect(() => bind(field(), bite, ['Dusk Summoner'])).toThrow('V2_HEALING_SOURCE_OWNER_UNPROVEN');
  expect(() => bind(field(), bite.replace('the dusk keeper regains', 'it regains'))).toThrow('V2_HEALING_SOURCE_OWNER_UNPROVEN');
  expect(() => bind(field(), bite + ' The dusk keeper cannot regain hit points while in sunlight.')).toThrow('V2_HEALING_SOURCE_CONDITION_UNSUPPORTED');
  expect(() => bind(field({ 生效条件: '噬咬命中并造成死灵伤害时' }))).toThrow('V2_HEALING_CONDITION_CONFLICT');
  expect(() => bind(field({ 取值依据: '等于目标因该次啃咬所受死灵伤害的实际数值' }))).toThrow('V2_HEALING_RELATION_CONFLICT');
});

function identityFixture(second = 'Claw. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) slashing damage.') {
  const source = 'Dusk Keeper\nMedium undead, lawful evil\nArmor Class 15\nHit Points 60 (8d8 + 24)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n16 14 16 12 12 16\nChallenge 5\nActions\n' + bite + '\n' + second + '\n';
  const plan = splitStagedMonsterSource({ source, sourceSha256: sha256(source), candidate: { id: 'keeper', label: 'Dusk Keeper', start: 0, end: source.length, quote: source } });
  const unit = plan.features.find(unit => unit.name === 'Drain')!;
  return { source, plan, unit, scope: makeV2FeatureIdentityScope(plan, unit.id) };
}

test('stable self references preserve source-owned names and unresolved translated recipients', () => {
  for (const value of ['self', '自身', 'Dusk Keeper', 'the keeper', 'Dusk Keeper itself'])
    expect(bindV2SelfReference(value, ['Dusk Keeper'], path)).toEqual({ recipient: 'self', targetStatus: 'verified', proposedTarget: value });
  expect(bindV2SelfReference('暮色守卫自身', ['Dusk Keeper'], path).targetStatus).toBe('unresolved-translation');
  expect(bindV2SelfReference('暮色守卫自身', ['Dusk Keeper', '暮色守卫'], path).targetStatus).toBe('verified');
  for (const value of ['the target', '目标生物', 'an ally', 'the other keeper', 'Claw', 's_e_l_f', 'D_usk Keeper'])
    expect(() => bindV2SelfReference(value, ['Dusk Keeper'], path)).toThrow('V2_HEALING_TARGET_CONFLICT');
});

test('source feature references bind exact IDs and unique full source names without aliases', () => {
  const data = identityFixture();
  for (const value of [data.unit.id, 'Drain']) {
    expect(bindV2SourceFeatureReference(value, data.scope, path)).toEqual({ sourceSha256: data.plan.sourceSha256,
      unitId: data.unit.id, sourceName: 'Drain', sourceQuote: data.unit.quote });
  }
  for (const value of ['啃咬', 'drain', 'unit-999', 'Dra', 'D_rain', 'first action'])
    expect(() => bindV2SourceFeatureReference(value, data.scope, path)).toThrow('V2_REFERENCE_UNPROVEN');
  expect(() => makeV2FeatureIdentityScope(data.plan, 'unit-999')).toThrow('V2_REFERENCE_CURRENT_UNIT_UNPROVEN');
});

test('healing accepts current source IDs and full original names in existing text fields', () => {
  const data = identityFixture();
  for (const reference of [`[${data.unit.id}]`, '[Drain]', 'Drain']) {
    for (const input of [
      field({ 目标: 'self', 取值依据: `等于目标因该次${reference}所受死灵伤害的实际数值`, 生效条件: `${reference}命中并造成死灵伤害时` }),
      field({ 目标: 'Dusk Keeper', 取值依据: `equal to the actual necrotic damage dealt to the target by ${reference}`, 生效条件: `when ${reference} hits and deals necrotic damage` }),
    ]) {
      const before = JSON.stringify(input);
      const result = bindV2DynamicHealing(input, data.unit.quote, ['Dusk Keeper'], path, data.scope);
      expect(result.targetStatus).toBe('verified'); expect(result.damageType).toBe('necrotic');
      expect(result.sourceQuote).toContain('the dusk keeper regains hit points equal to that amount');
      expect(Object.hasOwn(result, 'formula')).toBe(false); expect(JSON.stringify(input)).toBe(before);
    }
  }
});

test('an explicit reference never borrows another action or resolves a translated label', () => {
  const data = identityFixture(), claw = data.plan.features.find(unit => unit.name === 'Claw')!;
  for (const reference of [`[${claw.id}]`, '[Claw]', 'Claw']) {
    expect(() => bindV2DynamicHealing(field({ 取值依据: `等于目标因该次${reference}所受死灵伤害的实际数值` }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
      .toThrow('V2_HEALING_EVENT_REFERENCE_CONFLICT');
    expect(() => bindV2DynamicHealing(field({ 生效条件: `${reference}命中并造成死灵伤害时` }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
      .toThrow('V2_HEALING_EVENT_REFERENCE_CONFLICT');
  }
  expect(() => bindV2DynamicHealing(field({ 取值依据: '等于目标因该次啃咬所受死灵伤害的实际数值' }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
    .toThrow('V2_REFERENCE_UNPROVEN');
  expect(() => bindV2DynamicHealing(field({ 取值依据: '等于目标因该次[D_rain]所受死灵伤害的实际数值' }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
    .toThrow('V2_REFERENCE_UNPROVEN');
  expect(() => bindV2DynamicHealing(field({ 生效条件: '[Drain]命中并造成火焰伤害时' }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
    .toThrow('V2_HEALING_CONDITION_CONFLICT');
  expect(() => bindV2DynamicHealing(field({ 取值依据: '等于目标因[Drain]所受死灵伤害量的一半' }), data.unit.quote, ['Dusk Keeper'], path, data.scope))
    .toThrow('V2_HEALING_RELATION_CONFLICT');
  expect(bindV2DynamicHealing(field({ 目标: '吸血鬼', 生效条件: '[Drain]命中并造成死灵伤害时' }), data.unit.quote, ['Dusk Keeper'], path, data.scope).targetStatus)
    .toBe('unresolved-translation');
});

test('ambiguous names require an ID and stale or tampered partitions cannot prove references', () => {
  const data = identityFixture(bite.replace('10 (3d6)', '14 (4d6)'));
  expect(() => bindV2SourceFeatureReference('Drain', data.scope, path)).toThrow('V2_REFERENCE_AMBIGUOUS');
  expect(bindV2SourceFeatureReference(data.unit.id, data.scope, path).unitId).toBe(data.unit.id);
  const sibling = data.plan.features.filter(unit => unit.name === 'Drain')[1]!;
  expect(() => bindV2DynamicHealing(field(), sibling.quote, ['Dusk Keeper'], path, data.scope)).toThrow('V2_HEALING_EVENT_REFERENCE_CONFLICT');
  const tampered = structuredClone(data.plan);
  tampered.features[0]!.quote = tampered.features[0]!.quote.replace('necrotic', 'fire');
  expect(() => makeV2FeatureIdentityScope(tampered, data.unit.id)).toThrow('SOURCE_PARTITION');
});

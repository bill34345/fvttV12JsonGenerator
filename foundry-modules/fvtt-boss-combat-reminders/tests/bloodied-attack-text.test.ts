import { expect, test } from 'bun:test';
import { bloodiedAttackClauses, redactBloodiedAttackClauses } from '../src/bloodied-attack-text.ts';

test('reads either Chinese claw rider from the attack body and leaves the base hit alone', () => {
  const base = '<p><strong>爪击：</strong>攻击命中 +6，命中时造成 2d6+3 挥砍伤害。</p>';
  for (const rider of [
    '当浴血时：命中时额外对目标造成倒地效果。',
    '当浴血时：命中时伤害额外增加 1d6 黯蚀伤害。',
  ]) {
    const body = base + '<p>' + rider + '</p>';
    expect(bloodiedAttackClauses(body, '试炼领主')).toEqual([{ phase: 'hit', text: rider }]);
    expect(redactBloodiedAttackClauses(body, '试炼领主')).toBe(base);
  }
});

test('converts official HTML references to readable attack clauses and preserves both phases', () => {
  const body = '<p><b>While the [[lookup @name lowercase]] is &amp;Reference[Bloodied]</b>,'
    + ' the reach increases to 10 feet; on a hit, the target is knocked &amp;Reference[Prone].</p>';
  const text = 'While the Phase Stalker is Bloodied, the reach increases to 10 feet; on a hit, the target is knocked Prone.';
  expect(bloodiedAttackClauses(body, '阶段猎手 Phase Stalker')).toEqual([
    { phase: 'targeting', text },
    { phase: 'hit', text },
  ]);
  expect(redactBloodiedAttackClauses(body, '阶段猎手 Phase Stalker')).toBe('');
});

test('does not treat target-only Bloodied clauses or other Bloodied timings as attack riders', () => {
  for (const body of [
    '<p>当目标浴血时：命中时额外造成 1d6 黯蚀伤害。</p>',
    '<p>If the target is Bloodied, the attack deals an extra 1d6 Necrotic damage.</p>',
    '<p>The target takes an extra 1d6 Necrotic damage when it is Bloodied.</p>',
    '<p>While Bloodied, the target takes an extra 1d6 Necrotic damage.</p>',
    '<p>When the Phase Stalker becomes Bloodied, it can use Claw to deal additional damage.</p>',
    '<p>While Bloodied, the Phase Stalker has Advantage on attack rolls and saving throws.</p>',
  ]) {
    expect(bloodiedAttackClauses(body, '阶段猎手 Phase Stalker')).toEqual([]);
    expect(redactBloodiedAttackClauses(body, '阶段猎手 Phase Stalker')).toBe(body);
  }
});

test('removes only the private rule in mixed HTML and removes its emptied tooltip elements', () => {
  const ordinary = '<p class="action"><strong>Claw.</strong> Hit: 2d6 + 3 Slashing damage. ';
  const privateRule = '<span title="Additional 1d6 Necrotic damage">While Bloodied,</span>'
    + ' on a hit the target takes an extra <a data-tooltip="extra damage">1d6</a> Necrotic damage.';
  const other = '<p data-tooltip="ordinary effect">The target must make a saving throw.</p>';
  const body = ordinary + privateRule + '</p>' + other;
  expect(bloodiedAttackClauses(body)).toEqual([
    { phase: 'hit', text: 'While Bloodied, on a hit the target takes an extra 1d6 Necrotic damage.' },
  ]);
  expect(redactBloodiedAttackClauses(body)).toBe(ordinary + '</p>' + other);
});

test('removes a standalone Bloodied heading and its associated rule paragraph', () => {
  const heading = '<p><strong>当浴血时：</strong></p>';
  const rule = '<p>触及为 10 尺。命中后使目标倒地。</p>';
  const ordinary = '<p><em>普通命中：</em>造成 2d6+3 挥砍伤害。</p>';
  const body = heading + rule + ordinary;
  expect(bloodiedAttackClauses(body)).toEqual([
    { phase: 'targeting', text: '当浴血时： 触及为 10 尺。命中后使目标倒地。' },
    { phase: 'hit', text: '当浴血时： 触及为 10 尺。命中后使目标倒地。' },
  ]);
  expect(redactBloodiedAttackClauses(body)).toBe(ordinary);
});

test('recognizes a named attacker at the end of a rule and a change in target count', () => {
  const handling = 'The attack deals an extra 1d6 Necrotic damage while the Phase Stalker is Bloodied.';
  expect(bloodiedAttackClauses(handling, '阶段猎手 Phase Stalker')).toEqual([{ phase: 'hit', text: handling }]);
  const targeting = '当浴血时：可指定两个目标。';
  expect(bloodiedAttackClauses(targeting)).toEqual([{ phase: 'targeting', text: targeting }]);
  const inline = '爪击：造成2d6挥砍伤害，若攻击者浴血，命中后额外造成1d6黯蚀伤害。';
  expect(redactBloodiedAttackClauses(inline)).toBe('爪击：造成2d6挥砍伤害，');
});

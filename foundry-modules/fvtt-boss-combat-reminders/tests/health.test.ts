import { expect, test } from 'bun:test';
import { itemTrigger, ownDefeatTrigger, suggestedTrigger, structuredTrigger } from '../src/health.ts';
import type { NativeActivity, NativeItem } from '../src/types.ts';

test('activation data can explicitly identify a trigger, while body text only supplies candidates', () => {
  expect(structuredTrigger('When the creature dies')).toEqual({ kind: 'death' });
  expect(structuredTrigger('When the creature first becomes Bloodied')).toEqual({ kind: 'bloodied', once: true });
  expect(structuredTrigger('While Bloodied')).toBeUndefined();
  expect(suggestedTrigger('<p>怪物死亡时爆炸。</p>')).toBe('death');
  expect(suggestedTrigger('This magic item can return a dead ally to life.')).toBeUndefined();
});

test('recognizes the owning creature in an official description lookup and ignores other creatures', () => {
  expect(ownDefeatTrigger('<p>The [[lookup @name lowercase]] explodes when it dies.</p>', '巴洛炎魔 Balor')).toEqual({ kind: 'death' });
  expect(ownDefeatTrigger('<p>If damage reduces the [[lookup @name lowercase]] to 0 Hit Points, it makes a saving throw.</p>', '僵尸 Zombie')).toEqual({ kind: 'zero' });
  expect(ownDefeatTrigger('<p>[[lookup @name lowercase]] 在死亡时爆炸。</p>', '炎魔')).toEqual({ kind: 'death' });
  expect(ownDefeatTrigger('<p>当 [[lookup @name lowercase]] 因受非光耀非重击伤害而使其生命值减至 0 时，它必须进行一次体质豁免。</p>', '丧尸')).toEqual({ kind: 'zero' });
  expect(ownDefeatTrigger('<p>当目标的生命值减至 0 时，丧尸恢复生命值。</p>', '丧尸')).toBeUndefined();
  expect(ownDefeatTrigger('<p>When the target dies, it explodes.</p>', 'Balor')).toBeUndefined();
  expect(ownDefeatTrigger('<p>The mark lasts until the creature dies.</p>', 'Balor')).toBeUndefined();
  expect(ownDefeatTrigger('<p>If damage reduces the target to 0 Hit Points, the zombie heals.</p>', 'Zombie')).toBeUndefined();
});

test('recognizes instant, own-turn, and ongoing Bloodied abilities from official English and Chinese prose', () => {
  const parse = (body: string, name: string) => {
    const item = { system: { description: { value: body } }, getFlag: () => undefined } as unknown as NativeItem;
    return itemTrigger(item, undefined, name);
  };
  expect(parse('Trigger: While the [[lookup @name lowercase]] is Large or Medium and has 10+ Hit Points, it becomes &Reference[Bloodied] or takes damage.', 'Black Pudding'))
    .toEqual({ kind: 'bloodied', split: true });
  expect(parse('触发：若 [[lookup @name lowercase]] 体型为大型或中型且具有 10+ 生命值，当 [[lookup @name lowercase]] 进入浴血或是其将受闪电伤害时。', '黑布丁'))
    .toEqual({ kind: 'bloodied', split: true });
  expect(parse('Whenever the [[lookup @name lowercase]] starts its turn &Reference[Bloodied], roll 1d6.', 'Clay Golem'))
    .toEqual({ kind: 'bloodied-turn' });
  expect(parse('若 [[lookup @name lowercase]] 在回合开始时 &Reference[Bloodied]，则掷 [[/r 1d6]]。', '黏土魔像'))
    .toEqual({ kind: 'bloodied-turn' });
  expect(parse('<p>While &amp;Reference[Bloodied], the [[lookup @name lowercase]] has Advantage on attack rolls and saving throws.</p>', 'Berserker'))
    .toEqual({ kind: 'bloodied-while', advantage: true });
  expect(parse('[[lookup @name lowercase]] 在 &Reference[Bloodied] 期间进行的攻击检定与豁免检定具有优势。', '狂战士'))
    .toEqual({ kind: 'bloodied-while', advantage: true });
  expect(parse('当这只怪首次陷入浴血时，立刻发动这个能力。', '试炼领主'))
    .toEqual({ kind: 'bloodied', once: true });
  expect(parse('当目标陷入浴血时，这只怪获得优势。', '试炼领主')).toBeUndefined();
  expect(parse('When the target becomes Bloodied, the golem gains Advantage.', 'Clay Golem')).toBeUndefined();
});

test('resolves the official split description against its own Activity condition', () => {
  const split = {
    id: 'splitActivity',
    activation: { condition: 'is Large or Medium and has 10+ Hit Points, it becomes Bloodied or takes damage.' },
  } as NativeActivity;
  const item = {
    system: { description: { value: '<p><strong>Trigger:</strong> While the [[lookup @name lowercase]] [[lookup @activation.condition activity=splitActivity]]</p><p>Response: It splits.</p>' } },
    getFlag: () => undefined,
  } as unknown as NativeItem;
  expect(itemTrigger(item, split, 'Black Pudding')).toEqual({ kind: 'bloodied', split: true });
  expect(itemTrigger(item, { ...split, id: 'otherActivity' }, 'Black Pudding')).toBeUndefined();
});

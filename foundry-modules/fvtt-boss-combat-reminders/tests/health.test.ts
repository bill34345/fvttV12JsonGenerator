import { expect, test } from 'bun:test';
import { healthMoment, matchesMoment, suggestedTrigger, structuredTrigger } from '../src/health.ts';

test('a hit that goes straight to zero only shows death and explicitly compatible bloodied responses', () => {
  const moment = healthMoment({ value: 66, max: 100 }, { value: 0, max: 100 });
  expect(moment).toEqual({ zero: true, enteredBloodied: true });
  expect(matchesMoment({ kind: 'death' }, moment!)).toBe(true);
  expect(matchesMoment({ kind: 'bloodied' }, moment!)).toBe(false);
  expect(matchesMoment({ kind: 'bloodied', atZero: true }, moment!)).toBe(true);
});

test('the exact halfway crossing produces a new opportunity after healing, not on each further hit', () => {
  expect(healthMoment({ value: 18, max: 31 }, { value: 15, max: 31 })).toEqual({ zero: false, enteredBloodied: true });
  expect(healthMoment({ value: 15, max: 31 }, { value: 6, max: 31 })).toBeNull();
  expect(healthMoment({ value: 0, max: 31 }, { value: 10, max: 31 })).toBeNull();
  expect(healthMoment({ value: 20, max: 40 }, { value: 0, max: 40 })).toEqual({ zero: true, enteredBloodied: false });
});

test('activation data can explicitly identify a trigger, while body text only supplies candidates', () => {
  expect(structuredTrigger('When the creature dies')).toEqual({ kind: 'death' });
  expect(structuredTrigger('When the creature first becomes Bloodied')).toEqual({ kind: 'bloodied', once: true });
  expect(structuredTrigger('While Bloodied')).toBeUndefined();
  expect(suggestedTrigger('<p>怪物死亡时爆炸。</p>')).toBe('death');
  expect(suggestedTrigger('This magic item can return a dead ally to life.')).toBeUndefined();
});

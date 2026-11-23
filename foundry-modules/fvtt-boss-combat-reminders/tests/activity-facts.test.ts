import { expect, test } from 'bun:test';
import { activityFacts } from '../src/activity-facts.ts';

test('native labels expose range, area and affected targets independently', () => {
  expect(activityFacts({
    range: { units: 'ft' },
    target: {
      template: { type: 'sphere', labels: { statblock: '20 尺球形' } },
      affects: { type: 'creature', labels: { sheet: '2 名生物' } },
    },
    duration: { units: 'minute' },
    labels: { range: '60 尺', duration: '1 分钟', concentrationDuration: '专注，至多 1 分钟' },
  })).toEqual(['60 尺', '20 尺球形', '2 名生物', '专注，至多 1 分钟']);
});

test('a blank activity does not advertise default targeting or duration', () => {
  const base = {
    range: { units: 'self' },
    duration: { units: 'inst' },
    labels: { range: '自身', duration: '立即' },
  };
  expect(activityFacts(base)).toEqual([]);
  expect(activityFacts({ ...base, target: { affects: { type: 'self', labels: { sheet: '自身' } } } }))
    .toEqual(['自身', '立即']);
  expect(activityFacts({ ...base, target: { affects: { type: 'creature', labels: { sheet: '1 名生物' } } } }))
    .toEqual(['1 名生物', '立即']);
});

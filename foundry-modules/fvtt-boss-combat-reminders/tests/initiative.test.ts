import { expect, test } from 'bun:test';
import { lairRounds } from '../src/opportunities.ts';

test('initiative 20 comes after tied characters and can be crossed without an entry at 20', () => {
  expect(lairRounds(2, 20, 2, 20)).toEqual([]);
  expect(lairRounds(2, 20, 2, 19.9)).toEqual([2]);
  expect(lairRounds(2, 24, 2, 17)).toEqual([2]);
  expect(lairRounds(2, 17, 2, 12)).toEqual([]);
  expect(lairRounds(0, null, 1, 17)).toEqual([1]);
  expect(lairRounds(3, 21, 4, 28)).toEqual([3]);
  expect(lairRounds(3, 12, 4, 19)).toEqual([4]);
  expect(lairRounds(3, 23, 3, null)).toEqual([]);
});

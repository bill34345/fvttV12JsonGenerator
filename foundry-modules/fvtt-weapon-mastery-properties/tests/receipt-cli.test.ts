import { expect, test } from 'bun:test';
import { evaluateExport } from '../e2e/receipt-cli.ts';

test('receipt CLI never reports an empty or unexecuted export as successful', () => {
  expect(() => evaluateExport({})).toThrow('no rule observations');
  expect(() => evaluateExport({ rules: {} })).toThrow('no known rule');
  expect(() => evaluateExport({ rules: { unknown: {} } })).toThrow('unknown rule');
  const result = evaluateExport({ classifiedInput: { rules: { vex: { attempted: false } } } });
  expect(result.exitCode).toBe(2);
  expect(result.evaluatedRules).toEqual(['vex']);
  expect(Object.values(result.manifest.rules).every(rule => rule.status === 'NOT_EXECUTED')).toBe(true);
});

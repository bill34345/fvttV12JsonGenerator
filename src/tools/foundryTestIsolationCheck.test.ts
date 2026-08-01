import { describe, expect, test } from 'bun:test';
import {
  findUnsafeCreateLabConfigCalls,
  scanFoundryTestIsolation,
} from './foundryTestIsolationCheck';

describe('Foundry test isolation source gate', () => {
  test('rejects direct runtime configuration without an explicit environment', () => {
    const findings = findUnsafeCreateLabConfigCalls(`
      import { createLabConfig } from './config';
      createLabConfig('I:/fixture/repo');
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(3);
    expect(findUnsafeCreateLabConfigCalls(`
      import { createLabConfig } from './config';
      createLabConfig('I:/fixture/repo', process.env);
    `)).toHaveLength(1);
  });

  test('accepts explicit environments and the hermetic helper', () => {
    expect(findUnsafeCreateLabConfigCalls(`
      import { createLabConfig } from './config';
      createLabConfig('I:/fixture/repo', {});
    `)).toEqual([]);
    expect(findUnsafeCreateLabConfigCalls(`
      import { createHermeticLabConfig as createLabConfig } from './config';
      createLabConfig('I:/fixture/repo');
    `)).toEqual([]);
    expect(findUnsafeCreateLabConfigCalls(`
      import { createHermeticLabConfig } from './config';
      createHermeticLabConfig('I:/fixture/repo', process.env);
    `)).toHaveLength(1);
  });

  test('keeps the current Foundry test tree free of implicit process-environment projection', async () => {
    expect(await scanFoundryTestIsolation()).toEqual([]);
  });
});

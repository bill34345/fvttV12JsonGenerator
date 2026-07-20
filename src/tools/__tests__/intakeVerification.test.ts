import { describe, expect, test } from 'bun:test';
import type { MonsterIntakeIR } from '../../core/intake/types';
import { inferIntakeCoverageRange } from '../intakeVerification';

describe('verify:intake candidate coverage', () => {
  test('limits standalone verification to the creature covered by the IR', () => {
    const ir = {
      schemaVersion: 1,
      source: { sha256: 'test', length: 48 },
      creature: {},
      claims: [],
      coverage: [
        { start: 0, end: 12, quote: 'first actor\n', classification: 'mechanical', claimPaths: [] },
        { start: 12, end: 24, quote: 'first stats\n', classification: 'mechanical', claimPaths: [] },
      ],
      uncertainties: [],
    } as unknown as MonsterIntakeIR;

    expect(inferIntakeCoverageRange(ir)).toEqual({ start: 0, end: 24 });
  });

  test('falls back to whole-source verification when coverage is absent', () => {
    const ir = {
      schemaVersion: 1,
      source: { sha256: 'test', length: 48 },
      creature: {},
      claims: [],
      coverage: [],
      uncertainties: [],
    } as unknown as MonsterIntakeIR;

    expect(inferIntakeCoverageRange(ir)).toBeUndefined();
  });
});

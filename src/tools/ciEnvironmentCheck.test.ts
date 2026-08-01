import { describe, expect, test } from 'bun:test';
import {
  assertHermeticCiEnvironment,
  configuredFoundryOpsRuntimeRoots,
} from './ciEnvironmentCheck';

describe('CI Foundry Ops environment preflight', () => {
  test('accepts an environment without configured runtime roots', () => {
    expect(configuredFoundryOpsRuntimeRoots({})).toEqual([]);
    expect(() => assertHermeticCiEnvironment({})).not.toThrow();
  });

  test('rejects persistent configured runtime roots before test execution', () => {
    const environment = {
      FVTT_OPS_LAB_ROOT: 'F:/FoundryLab/foundry-v14',
      FVTT_OPS_EVIDENCE_ROOT: 'F:/FoundryLab/foundry-v14/evidence',
      FVTT_OPS_BACKUP_ROOT: 'F:/FoundryLab/foundry-v14/backups',
    };

    expect(configuredFoundryOpsRuntimeRoots(environment)).toEqual([
      { name: 'FVTT_OPS_LAB_ROOT', value: 'F:/FoundryLab/foundry-v14' },
      { name: 'FVTT_OPS_EVIDENCE_ROOT', value: 'F:/FoundryLab/foundry-v14/evidence' },
      { name: 'FVTT_OPS_BACKUP_ROOT', value: 'F:/FoundryLab/foundry-v14/backups' },
    ]);
    expect(() => assertHermeticCiEnvironment(environment)).toThrow(
      /拒绝继承持久 Foundry Ops 运行根.*临时沙箱/,
    );
  });

  test('accepts only writable roots contained by the declared CI sandbox', () => {
    const environment = {
      FVTT_OPS_CI_SANDBOX_ROOT: 'C:/Temp/fvtt-ci-sandbox-123',
      FVTT_OPS_LAB_ROOT: 'C:/Temp/fvtt-ci-sandbox-123/lab',
      FVTT_OPS_EVIDENCE_ROOT: 'C:/Temp/fvtt-ci-sandbox-123/evidence',
      FVTT_OPS_BACKUP_ROOT: 'C:/Temp/fvtt-ci-sandbox-123/backups',
    };
    expect(() => assertHermeticCiEnvironment(environment)).not.toThrow();
    expect(() => assertHermeticCiEnvironment({
      ...environment,
      FVTT_OPS_BACKUP_ROOT: 'F:/FoundryLab/foundry-v14/backups',
    })).toThrow(/FVTT_OPS_BACKUP_ROOT/);
  });

  test('ignores empty values but rejects one non-empty configured root', () => {
    expect(configuredFoundryOpsRuntimeRoots({
      FVTT_OPS_LAB_ROOT: '  ',
      FVTT_OPS_BACKUP_ROOT: 'J:/test-backups',
    })).toEqual([{ name: 'FVTT_OPS_BACKUP_ROOT', value: 'J:/test-backups' }]);
    expect(() => assertHermeticCiEnvironment({ FVTT_OPS_BACKUP_ROOT: 'J:/test-backups' }))
      .toThrow(/FVTT_OPS_BACKUP_ROOT=J:\/test-backups/);
  });
});

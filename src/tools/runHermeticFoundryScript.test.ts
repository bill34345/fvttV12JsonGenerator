import { describe, expect, test } from 'bun:test';
import { assertHermeticCiEnvironment } from './ciEnvironmentCheck';
import { createHermeticFoundryEnvironment } from './runHermeticFoundryScript';

describe('hermetic Foundry package-script environment', () => {
  test('redirects every writable root to the sandbox and removes production connection settings', () => {
    const sandbox = 'C:/Temp/fvtt-ci-sandbox-fixture';
    const entry = 'F:/FoundryLab/foundry-v14/app/14.364/node_modules/classic-level/index.js';
    const environment = createHermeticFoundryEnvironment({
      FVTT_OPS_LAB_ROOT: 'F:/FoundryLab/foundry-v14',
      FVTT_OPS_EVIDENCE_ROOT: 'F:/FoundryLab/foundry-v14/evidence',
      FVTT_OPS_BACKUP_ROOT: 'F:/FoundryLab/foundry-v14/backups',
      FVTT_OPS_PRODUCTION_SSH_TARGET: 'fvtt-production',
      FVTT_OPS_PRODUCTION_DATA_PATH: 'X:/FoundryData',
      fvtt_ops_production_identity_path: 'C:/fixture/id_ed25519',
      fvtt_ops_lab_root: 'F:/case-insensitive-shadow',
    }, sandbox, entry);

    expect(environment.FVTT_OPS_LAB_ROOT).toBe('C:\\Temp\\fvtt-ci-sandbox-fixture\\lab');
    expect(environment.FVTT_OPS_EVIDENCE_ROOT).toBe('C:\\Temp\\fvtt-ci-sandbox-fixture\\evidence');
    expect(environment.FVTT_OPS_BACKUP_ROOT).toBe('C:\\Temp\\fvtt-ci-sandbox-fixture\\backups');
    expect(environment.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY).toBe(entry);
    expect(environment.FVTT_OPS_PRODUCTION_SSH_TARGET).toBeUndefined();
    expect(environment.FVTT_OPS_PRODUCTION_DATA_PATH).toBeUndefined();
    expect(environment.fvtt_ops_production_identity_path).toBeUndefined();
    expect(environment.fvtt_ops_lab_root).toBeUndefined();
    expect(() => assertHermeticCiEnvironment(environment)).not.toThrow();
  });
});

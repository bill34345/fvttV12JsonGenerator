import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

describe('Species Intake CLI', () => {
  test('dry-run is provider-free and reports the bounded call estimate', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-species', resolve('tests/fixtures/species/ogre.txt'), '--dry-run', '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(0); expect(proc.stdout.toString()).toContain('AI Species Intake run: dry-run'); expect(proc.stdout.toString()).toContain('Estimated worst-case provider calls: 4');
  });

  test('rejects unsupported targets before provider configuration is loaded', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-species', resolve('tests/fixtures/species/ogre.txt'), '--fvtt-version', '12', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1); expect(proc.stderr.toString()).toContain('only supports --fvtt-version 14'); expect(proc.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
  });
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of ['MONSTER_INTAKE_API_KEY', 'MONSTER_INTAKE_BASE_URL', 'MONSTER_INTAKE_MODEL', 'MONSTER_INTAKE_REVIEW_MODEL', 'MONSTER_INTAKE_AUTH_MODE', 'MONSTER_INTAKE_CODEX_OAUTH_BASE_URL', 'MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN']) delete env[key];
  return env;
}

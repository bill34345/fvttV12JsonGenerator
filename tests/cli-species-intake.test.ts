import { runTestProcess } from './helpers/subprocess';
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('Species Intake CLI', async () => {
  test('V12/core dry-run is provider-free, reports the bounded call estimate, and writes nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-species-v12-dry-'));
    const vault = join(root, 'vault');
    const proc = await runTestProcess({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-species', resolve('tests/fixtures/species/ogre.txt'), '--dry-run', '--fvtt-version', '12', '--effect-profile', 'core', '--vault', vault],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(0); expect(proc.stdout.toString()).toContain('AI Species Intake run: dry-run'); expect(proc.stdout.toString()).toContain('Estimated worst-case provider calls: 4');
    expect(existsSync(vault)).toBeFalse();
  });

  test('rejects unsupported targets before provider configuration is loaded', async () => {
    for (const target of [['13', 'core'], ['12', 'modded-v12']] as const) {
      const proc = await runTestProcess({
        cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-species', resolve('tests/fixtures/species/ogre.txt'), '--fvtt-version', target[0], '--effect-profile', target[1]],
        cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
      });
      expect(proc.exitCode).toBe(1); expect(proc.stderr.toString()).toContain('Species Intake only supports'); expect(proc.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
    }
  });

  test('rejects resume target drift before provider configuration is loaded', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-species-resume-target-'));
    const runPath = join(root, 'run'); const decisionsPath = join(root, 'decisions.json');
    mkdirSync(runPath, { recursive: true });
    writeFileSync(join(runPath, 'manifest.json'), `${JSON.stringify({
      schemaVersion: 1, runId: 'species-run', sourceName: 'source.txt', sourceSha256: 'source-hash', sourceLength: 6,
      fvttVersion: '12', effectProfile: 'core', rules: '2024', target: { foundry: '12.331', dnd5e: '4.3.9', effectProfile: 'core', rules: '2024' },
      status: 'needs_review', createdAt: '2026-08-20T00:00:00.000Z', species: [],
    }, null, 2)}\n`);
    writeFileSync(join(runPath, 'source.txt'), 'source');
    writeFileSync(decisionsPath, `${JSON.stringify({ runId: 'species-run', sourceSha256: 'source-hash', decisions: [] }, null, 2)}\n`);
    const proc = await runTestProcess({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--resume-species-intake', runPath, '--decisions', decisionsPath, '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1); expect(proc.stderr.toString()).toContain('resume target mismatch'); expect(proc.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
  });
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of ['MONSTER_INTAKE_API_KEY', 'MONSTER_INTAKE_BASE_URL', 'MONSTER_INTAKE_MODEL', 'MONSTER_INTAKE_REVIEW_MODEL', 'MONSTER_INTAKE_AUTH_MODE', 'MONSTER_INTAKE_CODEX_OAUTH_BASE_URL', 'MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN']) delete env[key];
  return env;
}

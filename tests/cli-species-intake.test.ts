import { runTestProcess } from './helpers/subprocess';
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// These cases launch one or more CLI processes; allow bounded Windows startup latency.
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
  }, 30000);

  test('old V14 and exact 14.368 Species dry-runs work through both CLI entrypoints', async () => {
    const source = resolve('tests/fixtures/species/ogre.txt');
    for (const entry of ['src/index.ts', 'apps/cli/src/main.ts']) {
      for (const version of ['14', '14.368']) {
        const root = mkdtempSync(join(tmpdir(), 'cli-species-target-dry-'));
        const vault = join(root, 'vault');
        const proc = await runTestProcess({
          cmd: ['bun', '--no-env-file', 'run', entry, '--intake-species', source, '--dry-run', '--fvtt-version', version, '--effect-profile', 'core', '--vault', vault],
          cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
        });
        expect(proc.exitCode).toBe(0);
        expect(proc.stdout.toString()).toContain('AI Species Intake run: dry-run');
        expect(existsSync(vault)).toBeFalse();
      }
    }
  }, 30000);

  test('14.368 remains unavailable to Actor and Item CLI routes', async () => {
    const source = resolve('tests/fixtures/species/ogre.txt');
    for (const command of [['--intake-items', source, '--dry-run'], [source, '--dry-run']]) {
      const proc = await runTestProcess({
        cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', ...command, '--fvtt-version', '14.368'],
        cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
      });
      expect(proc.exitCode).toBe(1);
      expect(proc.stderr.toString()).toContain('Unsupported Foundry target: 14.368');
    }
  }, 30000);

  test('rejects unsupported targets before provider configuration is loaded', async () => {
    for (const target of [['13', 'core'], ['12', 'modded-v12']] as const) {
      const proc = await runTestProcess({
        cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-species', resolve('tests/fixtures/species/ogre.txt'), '--fvtt-version', target[0], '--effect-profile', target[1]],
        cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
      });
      expect(proc.exitCode).toBe(1); expect(proc.stderr.toString()).toContain('Species Intake only supports'); expect(proc.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
    }
  }, 30000);

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
    const nextRequest = await runTestProcess({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--resume-species-intake', runPath, '--decisions', decisionsPath, '--fvtt-version', '14.368', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(nextRequest.exitCode).toBe(1);
    expect(nextRequest.stderr.toString()).toContain('resume target mismatch: run is 12/core/2024, request is 14.368/core/2024');
    expect(nextRequest.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
  }, 30000);

  test('compares the exact ServerNext Species target on resume before provider setup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-species-next-resume-'));
    const runPath = join(root, 'run'); const decisionsPath = join(root, 'decisions.json');
    mkdirSync(runPath, { recursive: true });
    writeFileSync(join(runPath, 'manifest.json'), `${JSON.stringify({
      schemaVersion: 1, runId: 'species-next-run', sourceName: 'source.txt', sourceSha256: 'source-hash', sourceLength: 6,
      fvttVersion: '14.368', effectProfile: 'core', rules: '2024', target: { foundry: '14.368', dnd5e: '6.0.2', effectProfile: 'core', rules: '2024' },
      status: 'needs_review', createdAt: '2026-09-23T00:00:00.000Z', species: [],
    }, null, 2)}\n`);
    writeFileSync(join(runPath, 'source.txt'), 'source');
    writeFileSync(decisionsPath, `${JSON.stringify({ runId: 'species-next-run', sourceSha256: 'source-hash', decisions: [] }, null, 2)}\n`);
    const proc = await runTestProcess({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--resume-species-intake', runPath, '--decisions', decisionsPath, '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain('resume target mismatch: run is 14.368/core/2024, request is 14/core/2024');
    expect(proc.stderr.toString()).not.toContain('MONSTER_INTAKE_API_KEY');
    const matching = await runTestProcess({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--resume-species-intake', runPath, '--decisions', decisionsPath, '--fvtt-version', '14.368', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: { ...withoutIntakeEnv(), MONSTER_INTAKE_AUTH_MODE: 'api-key', MONSTER_INTAKE_API_KEY: 'test-only', MONSTER_INTAKE_BASE_URL: 'http://127.0.0.1:9/v1', MONSTER_INTAKE_MODEL: 'fake-model' },
    });
    expect(matching.exitCode).toBe(1);
    expect(matching.stderr.toString()).toContain('decisions do not match the immutable run source');
    expect(matching.stderr.toString()).not.toContain('resume target mismatch');
  }, 30000);
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of ['MONSTER_INTAKE_API_KEY', 'MONSTER_INTAKE_BASE_URL', 'MONSTER_INTAKE_MODEL', 'MONSTER_INTAKE_REVIEW_MODEL', 'MONSTER_INTAKE_AUTH_MODE', 'MONSTER_INTAKE_CODEX_OAUTH_BASE_URL', 'MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN']) delete env[key];
  return env;
}

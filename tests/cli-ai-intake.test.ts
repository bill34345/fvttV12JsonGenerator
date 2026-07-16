import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const SOURCE = resolve('src/core/intake/__tests__/fixtures/lurker-in-the-dark.raw.txt');

describe('AI monster intake CLI', () => {
  test('dry-run does not require AI configuration or write a run bundle', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--intake-monsters', SOURCE, '--dry-run', '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain('Status: dry_run');
    expect(proc.stdout.toString()).toContain('Estimated worst-case provider calls:');
    expect(proc.stderr.toString()).toBe('');
  });

  test('fails closed without dedicated provider configuration outside dry-run', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--intake-monsters', SOURCE],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain('MONSTER_INTAKE_API_KEY');
    expect(proc.stderr.toString()).not.toContain('OPENAI_API_KEY');
  });

  test('legacy raw ingestion fails when the rule-based splitter finds zero monsters', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--ingest-plaintext', SOURCE, '--dry-run'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stdout.toString()).toContain('Detected creatures: 0');
    expect(proc.stderr.toString()).toContain('[Legacy rule-based]');
    expect(proc.stderr.toString()).toContain('detected 0 monsters');
  });
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  delete env.MONSTER_INTAKE_API_KEY;
  delete env.MONSTER_INTAKE_BASE_URL;
  delete env.MONSTER_INTAKE_MODEL;
  delete env.MONSTER_INTAKE_REVIEW_MODEL;
  return env;
}

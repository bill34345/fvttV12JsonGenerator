import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SOURCE_PATH = resolve(
  process.cwd(),
  'tests/fixtures/plaintext/月蚀矿腐化生物数据.md',
);

describe('CLI plaintext actor import', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('supports --ingest-plaintext-actors with dry-run summary output', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-cli-plaintext-actors-'));
    roots.push(vaultPath);

    const proc = Bun.spawnSync({
      cmd: [
        'bun',
        'run',
        'src/index.ts',
        '--ingest-plaintext-actors',
        SOURCE_PATH,
        '--vault',
        vaultPath,
        '--dry-run',
      ],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Ingested source:');
    expect(stdout).toContain('Effect profile: modded-v12');
    expect(stdout).toContain('Detected creatures: 7');
    expect(existsSync(join(vaultPath, 'input'))).toBe(false);
    expect(stderr).toBe('');
  });
});

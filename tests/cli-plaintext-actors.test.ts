import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(stderr).toContain('[Legacy rule-based]');
  }, 15_000);

  it('accepts image workflow options during dry-run without uploading assets', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-cli-plaintext-actors-images-'));
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
        '--image-mode',
        'ssh',
        '--image-ssh-target',
        'Administrator@49.232.12.153',
        '--image-remote-root',
        'E:/Bill/imgSource',
        '--image-public-base-url',
        'http://49.232.12.153/imgSource',
        '--image-allow-http',
        '--image-actor-dir',
        'actors',
        '--image-token-dir',
        'tokens',
        '--image-token-frame',
        'references/fifthed_border_medium.png',
        '--image-token-size',
        '1024',
        '--image-token-format',
        'webp',
      ],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Image mode: ssh');
    expect(stdout).toContain('Dry run: yes');
    expect(existsSync(join(vaultPath, 'input'))).toBe(false);
    expect(stderr).toContain('[Legacy rule-based]');
  });

  it('accepts image token crop override manifests during dry-run', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-cli-plaintext-actors-crops-'));
    const cropPath = join(vaultPath, 'token-crops.json');
    roots.push(vaultPath);
    writeFileSync(cropPath, JSON.stringify({
      abc12345: { left: 0.1, top: 0.2, width: 0.7, height: 0.7 },
    }));

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
        '--image-mode',
        'ssh',
        '--image-ssh-target',
        'Administrator@49.232.12.153',
        '--image-remote-root',
        'E:/Bill/imgSource',
        '--image-public-base-url',
        'http://49.232.12.153/imgSource',
        '--image-allow-http',
        '--image-token-frame',
        'references/fifthed_border_medium.png',
        '--image-token-crops',
        cropPath,
      ],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Image mode: ssh');
    expect(stderr).toContain('[Legacy rule-based]');
  });
});

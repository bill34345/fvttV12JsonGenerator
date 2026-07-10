import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabConfig } from '../config';
import { runCommand } from '../process';
import { bootstrapLab, buildBootstrapPlan, verifyNodeArchiveChecksum } from '../bootstrap';

describe('Foundry lab bootstrap', () => {
  it('uses exact approved archives and never writes outside .local', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    const plan = buildBootstrapPlan(config);
    expect(plan.nodeArchiveUrl).toBe('https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip');
    expect(plan.nodeChecksumUrl).toBe('https://nodejs.org/dist/v24.17.0/SHASUMS256.txt');
    expect(plan.foundryZip).toBe('D:\\Download\\FoundryVTT-Node-14.364.zip');
    expect(plan.directories.every((path) => path.startsWith(config.labRoot))).toBe(true);
  });

  it('defaults to a no-write dry run', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-dry-run-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    try {
      const report = await bootstrapLab(config);

      expect(report.ok).toBe(true);
      expect(report.apply).toBe(false);
      expect(report.actions.every((action) => action.status === 'planned')).toBe(true);
      expect(existsSync(config.labRoot)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects an unapproved Foundry package before downloading or extracting', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-bad-package-'));
    const sourceRoot = join(tempRoot, 'source');
    const zipPath = join(tempRoot, 'Foundry.zip');
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      join(sourceRoot, 'package.json'),
      JSON.stringify({ version: '14.363.0', engines: { node: '>=24.13.1 <25.0.0' } }),
    );
    const compressed = await runCommand(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -LiteralPath '${sourceRoot.replaceAll("'", "''")}\\package.json' -DestinationPath '${zipPath.replaceAll("'", "''")}'`,
      ],
      { cwd: tempRoot },
    );
    expect(compressed.exitCode).toBe(0);

    const config = { ...createLabConfig(join(tempRoot, 'repo')), foundryZip: zipPath };
    try {
      const report = await bootstrapLab(config, { apply: true });

      expect(report.ok).toBe(false);
      expect(report.errors.join('\n')).toContain('14.364.0');
      expect(existsSync(config.labRoot)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('exposes bootstrap as a dry-run-first CLI command', async () => {
    const result = await runCommand(
      process.execPath,
      ['run', 'scripts/foundry-lab/cli.ts', 'bootstrap'],
      { cwd: process.cwd() },
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as { ok: boolean; apply: boolean };
    expect(report.ok).toBe(true);
    expect(report.apply).toBe(false);
  });

  it('verifies the Node archive against the matching checksum-list entry', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-checksum-'));
    const archivePath = join(tempRoot, 'node-v24.17.0-win-x64.zip');
    const checksumPath = join(tempRoot, 'SHASUMS256.txt');
    const content = Buffer.from('approved-node-archive');
    const expected = createHash('sha256').update(content).digest('hex');
    try {
      await writeFile(archivePath, content);
      await writeFile(checksumPath, `${expected}  node-v24.17.0-win-x64.zip\n`);

      expect(await verifyNodeArchiveChecksum(archivePath, checksumPath)).toBe(expected);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects a Node archive whose content does not match the checksum list', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-checksum-mismatch-'));
    const archivePath = join(tempRoot, 'node-v24.17.0-win-x64.zip');
    const checksumPath = join(tempRoot, 'SHASUMS256.txt');
    try {
      await writeFile(archivePath, 'tampered-node-archive');
      await writeFile(checksumPath, `${'0'.repeat(64)}  node-v24.17.0-win-x64.zip\n`);

      await expect(verifyNodeArchiveChecksum(archivePath, checksumPath)).rejects.toThrow('SHA-256 mismatch');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabConfig } from '../config';
import { runCommand } from '../process';
import { bootstrapLab, buildBootstrapPlan, verifyNodeArchiveChecksum } from '../bootstrap';

async function createFoundryZip(tempRoot: string): Promise<string> {
  const sourceRoot = join(tempRoot, 'foundry-source');
  const zipPath = join(tempRoot, 'Foundry.zip');
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, 'package.json'),
    JSON.stringify({ version: '14.364.0', engines: { node: '>=24.13.1 <25.0.0' } }),
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
  return zipPath;
}

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
      expect(report.actions.filter((action) => action.kind === 'extract').map((action) => action.target)).toEqual([
        buildBootstrapPlan(config).nodeStagingRoot,
        buildBootstrapPlan(config).foundryStagingRoot,
      ]);
      expect(report.actions.slice(-2).map((action) => action.target)).toEqual([
        join(buildBootstrapPlan(config).nodeStagingRoot, 'node-v24.17.0-win-x64', 'node.exe'),
        join(buildBootstrapPlan(config).foundryStagingRoot, 'package.json'),
      ]);
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

  it('recovers from an interrupted download by replacing a stale part file atomically', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-download-recovery-'));
    const foundryZip = await createFoundryZip(tempRoot);
    const config = { ...createLabConfig(join(tempRoot, 'repo')), foundryZip };
    const plan = buildBootstrapPlan(config);
    const archivePart = `${plan.nodeArchivePath}.part`;
    const archiveBytes = Buffer.from('complete-node-archive');
    const archiveSha = createHash('sha256').update(archiveBytes).digest('hex');
    await mkdir(config.cacheRoot, { recursive: true });
    await writeFile(archivePart, 'legacy-partial-download');
    await writeFile(plan.nodeChecksumPath, `${archiveSha}  node-v24.17.0-win-x64.zip\n`);

    let downloadCalls = 0;
    const run = async (command: string, args: string[], options: Parameters<typeof runCommand>[2]) => {
      if (command.endsWith('node.exe')) {
        return { exitCode: 0, stdout: 'v24.17.0\n', stderr: '', commandLine: `${command} ${args.join(' ')}` };
      }
      return runCommand(command, args, options);
    };
    const extract = async (source: string, destination: string) => {
      if (source === plan.nodeArchivePath) {
        await mkdir(join(destination, 'node-v24.17.0-win-x64'), { recursive: true });
        await writeFile(join(destination, 'node-v24.17.0-win-x64', 'node.exe'), 'fixture');
      } else {
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, 'package.json'), JSON.stringify({ version: '14.364.0' }));
        await writeFile(join(destination, 'main.js'), 'fixture');
      }
    };

    try {
      const interrupted = await bootstrapLab(config, { apply: true }, {
        runCommand: run,
        extract,
        download: async (_url, destination) => {
          downloadCalls += 1;
          expect(existsSync(destination)).toBe(false);
          await writeFile(destination, 'new-partial-download');
          throw new Error('simulated interrupted download');
        },
      });
      expect(interrupted.ok).toBe(false);
      expect(downloadCalls).toBe(1);
      expect(existsSync(plan.nodeArchivePath)).toBe(false);
      expect(await readFile(archivePart, 'utf8')).toBe('new-partial-download');

      const recovered = await bootstrapLab(config, { apply: true }, {
        runCommand: run,
        extract,
        download: async (_url, destination) => {
          downloadCalls += 1;
          expect(existsSync(destination)).toBe(false);
          await writeFile(destination, archiveBytes);
        },
      });
      expect(recovered.ok).toBe(true);
      expect(downloadCalls).toBe(2);
      expect(existsSync(archivePart)).toBe(false);
      expect(await readFile(plan.nodeArchivePath)).toEqual(archiveBytes);

      await writeFile(archivePart, 'stale-part-next-to-complete-final');
      const reused = await bootstrapLab(config, { apply: true }, {
        runCommand: run,
        extract,
        download: async () => {
          throw new Error('complete final cache must not be downloaded again');
        },
      });
      expect(reused.ok).toBe(true);
      expect(existsSync(archivePart)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not validate an old final tree when the current staging extraction fails', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-staging-failure-'));
    const foundryZip = await createFoundryZip(tempRoot);
    const config = { ...createLabConfig(join(tempRoot, 'repo')), foundryZip };
    const plan = buildBootstrapPlan(config);
    const archiveBytes = Buffer.from('fixture-node-archive');
    const archiveSha = createHash('sha256').update(archiveBytes).digest('hex');
    await mkdir(config.cacheRoot, { recursive: true });
    await writeFile(plan.nodeArchivePath, archiveBytes);
    await writeFile(plan.nodeChecksumPath, `${archiveSha}  node-v24.17.0-win-x64.zip\n`);
    await mkdir(config.nodeRoot, { recursive: true });
    await writeFile(join(config.nodeRoot, 'node.exe'), 'old-valid-node');
    await writeFile(join(config.nodeRoot, 'old-sentinel.txt'), 'preserve-old-node');
    await mkdir(config.appRoot, { recursive: true });
    await writeFile(join(config.appRoot, 'package.json'), JSON.stringify({ version: '14.364.0' }));
    await writeFile(join(config.appRoot, 'old-sentinel.txt'), 'preserve-old-foundry');

    let extractCalls = 0;
    let oldNodeValidationCalls = 0;
    try {
      const report = await bootstrapLab(config, { apply: true }, {
        download: async () => {
          throw new Error('download must not run for complete cache files');
        },
        extract: async () => {
          extractCalls += 1;
          throw new Error('simulated staging extraction failure');
        },
        runCommand: async (command, args, options) => {
          if (command.endsWith('node.exe')) oldNodeValidationCalls += 1;
          return runCommand(command, args, options);
        },
      });

      expect(report.ok).toBe(false);
      expect(report.errors.join('\n')).toContain('simulated staging extraction failure');
      expect(extractCalls).toBe(1);
      expect(oldNodeValidationCalls).toBe(0);
      expect(await readFile(join(config.nodeRoot, 'old-sentinel.txt'), 'utf8')).toBe('preserve-old-node');
      expect(await readFile(join(config.appRoot, 'old-sentinel.txt'), 'utf8')).toBe('preserve-old-foundry');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('makes PowerShell archive extraction errors terminating', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-bootstrap-powershell-stop-'));
    const foundryZip = await createFoundryZip(tempRoot);
    const config = { ...createLabConfig(join(tempRoot, 'repo')), foundryZip };
    const plan = buildBootstrapPlan(config);
    const archiveBytes = Buffer.from('fixture-node-archive');
    const archiveSha = createHash('sha256').update(archiveBytes).digest('hex');
    await mkdir(config.cacheRoot, { recursive: true });
    await writeFile(plan.nodeArchivePath, archiveBytes);
    await writeFile(plan.nodeChecksumPath, `${archiveSha}  node-v24.17.0-win-x64.zip\n`);

    let expandScript = '';
    try {
      const report = await bootstrapLab(config, { apply: true }, {
        runCommand: async (command, args, options) => {
          const script = args.at(-1) ?? '';
          if (command === 'powershell.exe' && script.includes('Expand-Archive')) {
            expandScript = script;
            return { exitCode: 1, stdout: '', stderr: 'simulated terminating extraction error', commandLine: script };
          }
          return runCommand(command, args, options);
        },
      });

      expect(report.ok).toBe(false);
      expect(report.errors.join('\n')).toContain('simulated terminating extraction error');
      expect(expandScript).toContain("$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

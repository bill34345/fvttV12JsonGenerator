import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  assertSessionMonitorDestination,
  installSessionMonitorPackage,
  sessionMonitorWorkspaceInstallPaths,
} from '../build';
import { MODULE_ID, PRODUCT_VERSION, SCHEMA_VERSION } from '../src/schema';
import { parseArgs } from './cli';

describe('session monitor release contract', () => {
  test('locks package, module, product and protocol versions together', async () => {
    const packageRoot = resolve(import.meta.dir, '..');
    const packageManifest = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as { version?: string; dependencies?: Record<string, string> };
    const moduleManifest = JSON.parse(
      await readFile(resolve(packageRoot, 'src/module.json'), 'utf8'),
    ) as { id?: string; version?: string };

    expect(moduleManifest.id).toBe(MODULE_ID);
    expect(packageManifest.version).toBe(PRODUCT_VERSION);
    expect(moduleManifest.version).toBe(PRODUCT_VERSION);
    expect(SCHEMA_VERSION).toBe(1);
    expect(packageManifest.dependencies?.['@fvtt-json-generator/contracts']).toBe('workspace:*');
  });

  test('accepts only the exact project-local Foundry destination', () => {
    const workspaceRoot = resolve(import.meta.dir, '../../../..');
    const expected = sessionMonitorWorkspaceInstallPaths(workspaceRoot).destination;

    expect(assertSessionMonitorDestination(workspaceRoot, expected)).toBe(expected);
    expect(() => assertSessionMonitorDestination(
      workspaceRoot,
      resolve(workspaceRoot, 'elsewhere/fvtt-session-monitor'),
    )).toThrow('exact configured Foundry lab path');
  });

  test('projects installation and evidence paths under configured external roots', () => {
    const workspaceRoot = resolve(import.meta.dir, '../../../..');
    const labRoot = resolve(workspaceRoot, '../external-foundry-lab');
    const evidenceRoot = resolve(workspaceRoot, '../external-foundry-evidence');
    const backupRoot = resolve(workspaceRoot, '../external-foundry-backups');
    const environment = {
      FVTT_OPS_LAB_ROOT: labRoot,
      FVTT_OPS_EVIDENCE_ROOT: evidenceRoot,
      FVTT_OPS_BACKUP_ROOT: backupRoot,
    };
    const paths = sessionMonitorWorkspaceInstallPaths(workspaceRoot, environment);

    expect(paths.destination).toBe(resolve(labRoot, 'data/server-mirror/Data/modules/fvtt-session-monitor'));
    expect(paths.backupRoot).toBe(resolve(backupRoot, 'fvtt-session-monitor'));
    expect(assertSessionMonitorDestination(workspaceRoot, paths.destination, environment)).toBe(paths.destination);
    expect(() => assertSessionMonitorDestination(workspaceRoot, paths.destination)).toThrow(/exact configured/i);

    const parsed = parseArgs(['--workspace-root', workspaceRoot], environment);
    expect(parsed.outputRoot).toBe(resolve(evidenceRoot, 'cor-cotn-performance/live-sessions'));
    expect(parsed.profile).toBe(resolve(workspaceRoot, '.local/fvtt-session-monitor/chrome-profile'));
  });

  test('keeps explicit companion output above environment defaults and rejects broad roots', () => {
    const workspaceRoot = resolve(import.meta.dir, '../../../..');
    const explicitOutput = resolve(workspaceRoot, '../explicit-monitor-output');
    const parsed = parseArgs([
      '--workspace-root', workspaceRoot,
      '--output-root', explicitOutput,
    ], {
      FVTT_OPS_LAB_ROOT: resolve(workspaceRoot, '../external-foundry-lab'),
      FVTT_OPS_EVIDENCE_ROOT: resolve(workspaceRoot, '../external-foundry-evidence'),
    });

    expect(parsed.outputRoot).toBe(explicitOutput);
    expect(() => sessionMonitorWorkspaceInstallPaths(workspaceRoot, {
      FVTT_OPS_LAB_ROOT: workspaceRoot,
    })).toThrow(/specific directory/i);
  });

  test('installs an owned build into the configured external lab destination', async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'session-monitor-external-'));
    try {
      const labRoot = resolve(workspaceRoot, 'external-foundry-lab');
      const environment = { FVTT_OPS_LAB_ROOT: labRoot };
      const buildDirectory = resolve(workspaceRoot, 'build');
      await mkdir(buildDirectory, { recursive: true });
      await writeFile(resolve(buildDirectory, 'module.json'), JSON.stringify({
        id: 'fvtt-session-monitor',
        version: '1.1.1',
      }));

      const installed = await installSessionMonitorPackage(
        workspaceRoot,
        buildDirectory,
        environment,
      );
      expect(installed.destination).toBe(resolve(
        labRoot,
        'data/server-mirror/Data/modules/fvtt-session-monitor',
      ));
      expect(JSON.parse(
        await readFile(resolve(installed.destination, 'module.json'), 'utf8'),
      ).version).toBe('1.1.1');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('rejects an external lab root routed through a junction before writing', async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'session-monitor-junction-'));
    try {
      const physicalRoot = resolve(workspaceRoot, 'physical-root');
      const labRoot = resolve(workspaceRoot, 'lab-link');
      const buildDirectory = resolve(workspaceRoot, 'build');
      await mkdir(physicalRoot, { recursive: true });
      await mkdir(buildDirectory, { recursive: true });
      await symlink(physicalRoot, labRoot, 'junction');
      await writeFile(resolve(buildDirectory, 'module.json'), JSON.stringify({
        id: 'fvtt-session-monitor',
        version: '1.1.1',
      }));

      await expect(installSessionMonitorPackage(
        workspaceRoot,
        buildDirectory,
        { FVTT_OPS_LAB_ROOT: labRoot },
      )).rejects.toThrow(/junction|reparse|symlink/i);
      expect(await Bun.file(resolve(
        physicalRoot,
        'data/server-mirror/Data/modules/fvtt-session-monitor/module.json',
      )).exists()).toBeFalse();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('parses a wrapper-prefixed subcommand without treating option values as commands', () => {
    expect(parseArgs([
      '--workspace-root',
      'C:\\workspace',
      'report',
      '--out',
      'result',
    ]).command).toBe('report');

    expect(parseArgs([
      '--workspace-root',
      'C:\\workspace',
      'record',
      '--output-root',
      'report',
    ]).command).toBe('record');

    expect(parseArgs([
      '--workspace-root',
      'C:\\workspace',
      '--output-root',
      'report',
    ]).command).toBe('record');
  });

});

describe('Session Monitor subprocess build gate', () => {
  test('builds byte-identical archives through the root wrapper and package entry', async () => {
    const packageRoot = resolve(import.meta.dir, '..');
    const workspaceRoot = resolve(packageRoot, '../..');
    const zipPath = resolve(packageRoot, 'dist/fvtt-session-monitor.zip');

    await runBun(workspaceRoot, [
      'run',
      'foundry-modules/session-monitor/build.ts',
      '--workspace-root',
      '.',
    ]);
    const rootArchive = await readFile(zipPath);

    await runBun(packageRoot, ['run', 'build.ts']);
    const packageArchive = await readFile(zipPath);

    expect(packageArchive.equals(rootArchive)).toBeTrue();
  }, 30_000);
});

async function runBun(cwd: string, args: string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await child.exited;
  if (exitCode === 0) return;

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  throw new Error(`Bun child failed (${exitCode}):\n${stdout}\n${stderr}`);
}

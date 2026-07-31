import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertSessionMonitorDestination,
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
    )).toThrow('exact project-local path');
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

import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabConfig } from '../config';
import { runCommand } from '../process';
import {
  buildRemoteInventoryCommand,
  captureRemoteInventory,
  type RemoteInventoryDependencies,
} from '../remoteInventory';
import type { ModuleInventoryEntry } from '../types';

function inventoryEntry(index: number): ModuleInventoryEntry {
  return {
    folder: `module-${index}`,
    id: `module-${index}`,
    title: index === 0 ? '中文模组' : `Module ${index}`,
    version: '1.0.0',
    compatibility: { minimum: '12', verified: '14' },
    manifest: null,
    download: null,
    requires: [],
    conflicts: [],
    protected: false,
    persistentStorage: false,
    manifestSha256: 'a'.repeat(64),
    parseError: null,
  };
}

describe('remote Foundry inventory', () => {
  it('reads module manifests as UTF-8 without mutating production', () => {
    const command = buildRemoteInventoryCommand('E:/Bill/fvtt_v13/data');

    expect(command).toContain('[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)');
    expect(command).toContain('$OutputEncoding = [Console]::OutputEncoding');
    expect(command).toContain("Join-Path 'E:/Bill/fvtt_v13/data' 'Data/modules'");
    expect(command).toContain('[IO.File]::ReadAllText($manifestPath, [Text.UTF8Encoding]::new($false))');
    expect(command).toContain('Get-FileHash -Algorithm SHA256');
    expect(command).toContain('ConvertTo-Json -Depth 12 -Compress');
    expect(command).not.toMatch(/Remove-Item|Set-Content|Add-Content|Move-Item|Copy-Item|Compress-Archive/);
  });

  it('escapes a PowerShell single quote in the remote data path', () => {
    const command = buildRemoteInventoryCommand("E:/Foundry/O'Brien");

    expect(command).toContain("Join-Path 'E:/Foundry/O''Brien' 'Data/modules'");
  });

  it('filters missing relationship objects instead of serializing null dependencies', () => {
    const command = buildRemoteInventoryCommand('E:/Bill/fvtt_v13/data');

    expect(command).toContain("Where-Object { $null -ne $_ -and $null -ne $_.id }");
  });

  it('uses UTF-16LE EncodedCommand and persists only a validated 249-entry array', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-inventory-valid-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const entries = Array.from({ length: 249 }, (_, index) => inventoryEntry(index));
    let capturedArgs: string[] = [];
    const run: RemoteInventoryDependencies['runCommand'] = async (_command, args) => {
      capturedArgs = args;
      return {
        exitCode: 0,
        stdout: JSON.stringify(entries),
        stderr: '',
        commandLine: `ssh ${args.join(' ')}`,
      };
    };

    try {
      const result = await captureRemoteInventory(config, { runCommand: run });

      expect(result).toHaveLength(249);
      expect(result[0]?.title).toBe('中文模组');
      expect(capturedArgs).toContain('-EncodedCommand');
      const encoded = capturedArgs.at(-1) ?? '';
      expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(
        buildRemoteInventoryCommand(config.remoteDataPath),
      );
      const persisted = JSON.parse(
        await readFile(join(config.inventoryRoot, 'production-disk.json'), 'utf8'),
      ) as ModuleInventoryEntry[];
      expect(persisted).toHaveLength(249);
      expect(persisted[0]?.title).toBe('中文模组');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not persist malformed JSON or a count other than 249', async () => {
    for (const stdout of ['not-json', JSON.stringify([inventoryEntry(0)])]) {
      const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-inventory-invalid-'));
      const config = createLabConfig(join(tempRoot, 'repo'));
      try {
        await expect(
          captureRemoteInventory(config, {
            runCommand: async () => ({
              exitCode: 0,
              stdout,
              stderr: '',
              commandLine: 'ssh <fixture>',
            }),
          }),
        ).rejects.toThrow();
        expect(existsSync(join(config.inventoryRoot, 'production-disk.json'))).toBe(false);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it('preserves per-entry parse errors rather than rejecting the snapshot', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-inventory-parse-error-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const entries = Array.from({ length: 249 }, (_, index) => inventoryEntry(index));
    entries[17] = {
      ...inventoryEntry(17),
      id: null,
      title: null,
      version: null,
      manifestSha256: null,
      parseError: 'Unexpected character at line 1',
    };
    try {
      const result = await captureRemoteInventory(config, {
        runCommand: async () => ({
          exitCode: 0,
          stdout: JSON.stringify(entries),
          stderr: '',
          commandLine: 'ssh <fixture>',
        }),
      });

      expect(result[17]?.parseError).toBe('Unexpected character at line 1');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('exposes inventory as a no-SSH, no-write dry run by default', async () => {
    const inventoryPath = join(createLabConfig().inventoryRoot, 'production-disk.json');
    const before = existsSync(inventoryPath) ? await readFile(inventoryPath, 'utf8') : null;
    const result = await runCommand(
      process.execPath,
      ['run', 'scripts/foundry-lab/cli.ts', 'inventory'],
      { cwd: process.cwd() },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, apply: false, expectedCount: 249 });
    const after = existsSync(inventoryPath) ? await readFile(inventoryPath, 'utf8') : null;
    expect(after).toBe(before);
  });
});

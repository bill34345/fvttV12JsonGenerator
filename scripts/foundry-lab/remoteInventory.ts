import { homedir } from 'node:os';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';
import { runCommand } from './process';
import type { ModuleInventoryEntry } from './types';

const EXPECTED_MODULE_COUNT = 249;

export interface RemoteInventoryDependencies {
  runCommand: typeof runCommand;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildRemoteInventoryCommand(dataPath: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
    '$OutputEncoding = [Console]::OutputEncoding',
    `$moduleRoot = Join-Path ${quotePowerShellLiteral(dataPath)} 'Data/modules'`,
    '$result = foreach ($folder in Get-ChildItem -LiteralPath $moduleRoot -Directory) {',
    "  $manifestPath = Join-Path $folder.FullName 'module.json'",
    '  if (-not (Test-Path -LiteralPath $manifestPath)) {',
    "    [pscustomobject]@{ folder=$folder.Name; id=$null; title=$null; version=$null; compatibility=@{}; manifest=$null; download=$null; requires=@(); conflicts=@(); protected=$false; persistentStorage=$false; manifestSha256=$null; parseError='module.json missing' }",
    '    continue',
    '  }',
    '  try {',
    '    $text = [IO.File]::ReadAllText($manifestPath, [Text.UTF8Encoding]::new($false))',
    '    $json = $text | ConvertFrom-Json',
    '    [pscustomobject]@{',
    '      folder=$folder.Name',
    '      id=$json.id',
    '      title=$json.title',
    '      version=[string]$json.version',
    '      compatibility=$json.compatibility',
    '      manifest=$json.manifest',
    '      download=$json.download',
    '      requires=@($json.relationships.requires | Where-Object { $null -ne $_ -and $null -ne $_.id } | ForEach-Object { $_.id })',
    '      conflicts=@($json.relationships.conflicts | Where-Object { $null -ne $_ -and $null -ne $_.id } | ForEach-Object { $_.id })',
    '      protected=[bool]$json.protected',
    '      persistentStorage=[bool]$json.persistentStorage',
    '      manifestSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()',
    '      parseError=$null',
    '    }',
    '  } catch {',
    "    [pscustomobject]@{ folder=$folder.Name; id=$null; title=$null; version=$null; compatibility=@{}; manifest=$null; download=$null; requires=@(); conflicts=@(); protected=$false; persistentStorage=$false; manifestSha256=$null; parseError=$_.Exception.Message }",
    '  }',
    '}',
    '$result | ConvertTo-Json -Depth 12 -Compress',
  ].join('\n');
}

function optionalString(value: unknown, field: string, index: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Inventory entry ${index} has invalid ${field}`);
  return value;
}

function stringArray(value: unknown, field: string, index: number): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Inventory entry ${index} has invalid ${field}`);
  }
  return value;
}

function normalizeInventoryEntry(value: unknown, index: number): ModuleInventoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Inventory entry ${index} is not an object`);
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.folder !== 'string' || entry.folder.trim().length === 0) {
    throw new Error(`Inventory entry ${index} has invalid folder`);
  }
  if (typeof entry.protected !== 'boolean' || typeof entry.persistentStorage !== 'boolean') {
    throw new Error(`Inventory entry ${index} has invalid boolean flags`);
  }
  const compatibility = entry.compatibility;
  if (compatibility !== null && compatibility !== undefined
    && (typeof compatibility !== 'object' || Array.isArray(compatibility))) {
    throw new Error(`Inventory entry ${index} has invalid compatibility`);
  }

  const id = optionalString(entry.id, 'id', index);
  if (id !== null && id.trim().length === 0) {
    throw new Error(`Inventory entry ${index} has invalid id`);
  }
  const parseError = optionalString(entry.parseError, 'parseError', index);
  if (parseError !== null && parseError.trim().length === 0) {
    throw new Error(`Inventory entry ${index} has invalid parseError`);
  }

  return {
    folder: entry.folder,
    id,
    title: optionalString(entry.title, 'title', index),
    version: optionalString(entry.version, 'version', index),
    compatibility: (compatibility ?? {}) as ModuleInventoryEntry['compatibility'],
    manifest: optionalString(entry.manifest, 'manifest', index),
    download: optionalString(entry.download, 'download', index),
    requires: stringArray(entry.requires, 'requires', index),
    conflicts: stringArray(entry.conflicts, 'conflicts', index),
    protected: entry.protected,
    persistentStorage: entry.persistentStorage,
    manifestSha256: optionalString(entry.manifestSha256, 'manifestSha256', index),
    parseError,
  };
}

export function validateRemoteInventory(parsed: unknown): ModuleInventoryEntry[] {
  if (!Array.isArray(parsed)) throw new Error('Remote inventory stdout must be a JSON array');
  if (parsed.length !== EXPECTED_MODULE_COUNT) {
    throw new Error(`Remote inventory must contain exactly ${EXPECTED_MODULE_COUNT} entries, received ${parsed.length}`);
  }
  const inventory = parsed.map(normalizeInventoryEntry);
  const folders = new Set<string>();
  const ids = new Set<string>();
  for (const [index, entry] of inventory.entries()) {
    if (folders.has(entry.folder)) {
      throw new Error(`Inventory entry ${index} has duplicate folder: ${entry.folder}`);
    }
    folders.add(entry.folder);

    if (entry.id !== null) {
      if (ids.has(entry.id)) throw new Error(`Inventory entry ${index} has duplicate id: ${entry.id}`);
      ids.add(entry.id);
    }

    if (entry.manifestSha256 !== null && !/^[0-9a-f]{64}$/.test(entry.manifestSha256)) {
      throw new Error(`Inventory entry ${index} has invalid manifestSha256`);
    }
    if (entry.parseError === null && entry.manifestSha256 === null) {
      throw new Error(`Inventory entry ${index} has invalid manifestSha256`);
    }
  }
  return inventory;
}

function parseRemoteInventory(stdout: string): ModuleInventoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error(`Remote inventory stdout is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateRemoteInventory(parsed);
}

export async function captureRemoteInventory(
  config: FoundryLabConfig,
  dependencies: Partial<RemoteInventoryDependencies> = {},
): Promise<ModuleInventoryEntry[]> {
  const command = buildRemoteInventoryCommand(config.remoteDataPath);
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
  const identityPath = resolve(homedir(), '.ssh/id_ed25519');
  const executeCommand = dependencies.runCommand ?? runCommand;
  const result = await executeCommand(
    'ssh',
    [
      '-i', identityPath,
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=yes',
      config.sshTarget,
      'powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand,
    ],
    { cwd: config.repoRoot, timeoutMs: 120_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Remote inventory SSH command failed with exit code ${result.exitCode}`);
  }

  const inventory = parseRemoteInventory(result.stdout);
  const outputPath = join(config.inventoryRoot, 'production-disk.json');
  const stagingPath = `${outputPath}.tmp`;
  for (const path of [config.inventoryRoot, outputPath, stagingPath]) assertInsideLabRoot(config, path);
  await mkdir(config.inventoryRoot, { recursive: true });
  await rm(stagingPath, { force: true });
  await writeFile(stagingPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  await rename(stagingPath, outputPath);
  return inventory;
}

export const REMOTE_INVENTORY_EXPECTED_COUNT = EXPECTED_MODULE_COUNT;

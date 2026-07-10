import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';
import { runCommand } from './process';

export interface BootstrapPlan {
  foundryZip: string;
  nodeArchiveUrl: string;
  nodeChecksumUrl: string;
  nodeArchivePath: string;
  nodeChecksumPath: string;
  nodeStagingRoot: string;
  foundryStagingRoot: string;
  directories: string[];
}

export interface BootstrapOptions {
  apply: boolean;
}

export interface BootstrapReport {
  ok: boolean;
  apply: boolean;
  foundryVersion: string | null;
  nodeVersion: string | null;
  actions: Array<{
    kind: 'mkdir' | 'download' | 'verify' | 'extract';
    target: string;
    status: 'planned' | 'done' | 'failed';
  }>;
  errors: string[];
}

export interface BootstrapDependencies {
  runCommand: typeof runCommand;
  download: (url: string, destination: string) => Promise<void>;
  extract: (source: string, destination: string) => Promise<void>;
}

export function buildBootstrapPlan(config: FoundryLabConfig): BootstrapPlan {
  const nodeStagingRoot = resolve(dirname(config.nodeRoot), '.staging-node-v24.17.0-win-x64');
  const foundryStagingRoot = resolve(dirname(config.appRoot), '.staging-foundry-14.364');
  const directories = [
    config.appRoot,
    dirname(config.nodeRoot),
    config.cacheRoot,
    config.inventoryRoot,
    config.evidenceRoot,
    config.profiles.coreTest.dataPath,
    config.profiles.serverMirror.dataPath,
    nodeStagingRoot,
    foundryStagingRoot,
  ];
  directories.forEach((path) => assertInsideLabRoot(config, path));
  const plan = {
    foundryZip: config.foundryZip,
    nodeArchiveUrl: 'https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip',
    nodeChecksumUrl: 'https://nodejs.org/dist/v24.17.0/SHASUMS256.txt',
    nodeArchivePath: resolve(config.cacheRoot, 'node-v24.17.0-win-x64.zip'),
    nodeChecksumPath: resolve(config.cacheRoot, 'node-v24.17.0-SHASUMS256.txt'),
    nodeStagingRoot,
    foundryStagingRoot,
    directories,
  };
  assertInsideLabRoot(config, plan.nodeArchivePath);
  assertInsideLabRoot(config, plan.nodeChecksumPath);
  return plan;
}

export async function verifyNodeArchiveChecksum(
  archivePath: string,
  checksumPath: string,
): Promise<string> {
  const archiveName = basename(archivePath);
  const checksumList = await readFile(checksumPath, 'utf8');
  const matchingLine = checksumList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      const [, listedName] = line.split(/\s+/, 2);
      return listedName?.replace(/^\*/, '') === archiveName;
    });
  if (!matchingLine) throw new Error(`No SHA-256 entry found for ${archiveName}`);

  const expected = matchingLine.split(/\s+/, 1)[0]?.toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(`Invalid SHA-256 entry for ${archiveName}`);
  }

  const actual = await new Promise<string>((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(archivePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${archiveName}: expected ${expected}, received ${actual}`);
  }
  return actual;
}

export async function bootstrapLab(
  config: FoundryLabConfig,
  options: BootstrapOptions = { apply: false },
  dependencies: Partial<BootstrapDependencies> = {},
): Promise<BootstrapReport> {
  const plan = buildBootstrapPlan(config);
  const actions: BootstrapReport['actions'] = [
    ...plan.directories.map((target) => ({ kind: 'mkdir' as const, target, status: 'planned' as const })),
    { kind: 'verify', target: plan.foundryZip, status: 'planned' },
    { kind: 'download', target: plan.nodeArchivePath, status: 'planned' },
    { kind: 'download', target: plan.nodeChecksumPath, status: 'planned' },
    { kind: 'verify', target: plan.nodeArchivePath, status: 'planned' },
    { kind: 'extract', target: plan.nodeStagingRoot, status: 'planned' },
    { kind: 'extract', target: plan.foundryStagingRoot, status: 'planned' },
    {
      kind: 'verify',
      target: resolve(plan.nodeStagingRoot, basename(config.nodeRoot), 'node.exe'),
      status: 'planned',
    },
    { kind: 'verify', target: resolve(plan.foundryStagingRoot, 'package.json'), status: 'planned' },
  ];

  if (!options.apply) {
    return {
      ok: true,
      apply: false,
      foundryVersion: null,
      nodeVersion: null,
      actions,
      errors: [],
    };
  }

  const requireAction = (index: number): BootstrapReport['actions'][number] => {
    const action = actions[index];
    if (!action) throw new Error(`Bootstrap action index is out of range: ${index}`);
    return action;
  };
  let activeAction = requireAction(plan.directories.length);
  let foundryVersion: string | null = null;
  let nodeVersion: string | null = null;
  const reportPath = resolve(config.inventoryRoot, 'bootstrap-report.json');
  assertInsideLabRoot(config, reportPath);
  const executeCommand = dependencies.runCommand ?? runCommand;

  const makeReport = (ok: boolean, errors: string[]): BootstrapReport => ({
    ok,
    apply: true,
    foundryVersion,
    nodeVersion,
    actions,
    errors,
  });
  const runPowerShell = async (script: string, cwd: string) => {
    const result = await executeCommand(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$ErrorActionPreference = 'Stop'; ${script}`,
      ],
      { cwd, timeoutMs: 10 * 60_000 },
    );
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `PowerShell failed: ${result.commandLine}`);
    return result.stdout;
  };
  const expandArchive = async (source: string, destination: string) => {
    assertInsideLabRoot(config, destination);
    const literalSource = source.replaceAll("'", "''");
    const literalDestination = destination.replaceAll("'", "''");
    await runPowerShell(
      `Expand-Archive -LiteralPath '${literalSource}' -DestinationPath '${literalDestination}' -Force`,
      config.repoRoot,
    );
  };
  const download = dependencies.download ?? (async (url: string, destination: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  });
  const extract = dependencies.extract ?? expandArchive;
  const cleanDirectory = async (target: string) => {
    assertInsideLabRoot(config, target);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
  };
  const downloadAtomically = async (url: string, target: string) => {
    assertInsideLabRoot(config, target);
    const partPath = `${target}.part`;
    assertInsideLabRoot(config, partPath);
    await rm(partPath, { force: true });
    if (existsSync(target)) return;
    await download(url, partPath);
    if (!existsSync(partPath)) throw new Error(`Download did not create expected part file: ${partPath}`);
    await rename(partPath, target);
  };
  const replaceDirectory = async (stagedRoot: string, finalRoot: string) => {
    const backupRoot = `${finalRoot}.previous`;
    for (const target of [stagedRoot, finalRoot, backupRoot]) assertInsideLabRoot(config, target);

    if (existsSync(backupRoot) && !existsSync(finalRoot)) await rename(backupRoot, finalRoot);
    if (existsSync(backupRoot)) await rm(backupRoot, { recursive: true, force: true });

    let movedOldTree = false;
    if (existsSync(finalRoot)) {
      await rename(finalRoot, backupRoot);
      movedOldTree = true;
    }
    try {
      await rename(stagedRoot, finalRoot);
    } catch (error) {
      if (movedOldTree && !existsSync(finalRoot) && existsSync(backupRoot)) {
        await rename(backupRoot, finalRoot);
      }
      throw error;
    }
    if (movedOldTree && existsSync(backupRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
    }
  };

  try {
    const literalZip = plan.foundryZip.replaceAll("'", "''");
    const packageJson = await runPowerShell(
      [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$archive = [System.IO.Compression.ZipFile]::OpenRead('${literalZip}')`,
        'try {',
        "  $entry = $archive.Entries | Where-Object { ($_.FullName -replace '\\\\', '/') -eq 'package.json' } | Select-Object -First 1",
        "  if ($null -eq $entry) { throw 'Foundry archive has no root package.json' }",
        '  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8, $true)',
        '  try { $reader.ReadToEnd() } finally { $reader.Dispose() }',
        '} finally { $archive.Dispose() }',
      ].join('; '),
      dirname(plan.foundryZip),
    );
    const sourceManifest = JSON.parse(packageJson.trim()) as {
      version?: string;
      engines?: { node?: string };
    };
    if (sourceManifest.version !== '14.364.0') {
      throw new Error(
        `Foundry archive version must be 14.364.0, received ${sourceManifest.version ?? '<missing>'}`,
      );
    }
    if (sourceManifest.engines?.node !== '>=24.13.1 <25.0.0') {
      throw new Error(
        `Foundry archive Node engine must be >=24.13.1 <25.0.0, received ${sourceManifest.engines?.node ?? '<missing>'}`,
      );
    }
    foundryVersion = sourceManifest.version;
    activeAction.status = 'done';

    for (let index = 0; index < plan.directories.length; index += 1) {
      activeAction = requireAction(index);
      assertInsideLabRoot(config, activeAction.target);
      await mkdir(activeAction.target, { recursive: true });
      activeAction.status = 'done';
    }

    for (const [url, actionIndex] of [
      [plan.nodeArchiveUrl, plan.directories.length + 1],
      [plan.nodeChecksumUrl, plan.directories.length + 2],
    ] as const) {
      activeAction = requireAction(actionIndex);
      assertInsideLabRoot(config, activeAction.target);
      await downloadAtomically(url, activeAction.target);
      activeAction.status = 'done';
    }

    activeAction = requireAction(plan.directories.length + 3);
    await verifyNodeArchiveChecksum(plan.nodeArchivePath, plan.nodeChecksumPath);
    activeAction.status = 'done';

    activeAction = requireAction(plan.directories.length + 4);
    await cleanDirectory(plan.nodeStagingRoot);
    await extract(plan.nodeArchivePath, plan.nodeStagingRoot);
    activeAction.status = 'done';

    activeAction = requireAction(plan.directories.length + 5);
    await cleanDirectory(plan.foundryStagingRoot);
    await extract(plan.foundryZip, plan.foundryStagingRoot);
    activeAction.status = 'done';

    activeAction = requireAction(plan.directories.length + 6);
    const stagedNodeRoot = resolve(plan.nodeStagingRoot, basename(config.nodeRoot));
    const nodeExe = resolve(stagedNodeRoot, 'node.exe');
    assertInsideLabRoot(config, nodeExe);
    const nodeResult = await executeCommand(nodeExe, ['--version'], {
      cwd: stagedNodeRoot,
      timeoutMs: 30_000,
    });
    if (nodeResult.exitCode !== 0) {
      throw new Error(nodeResult.stderr.trim() || 'Isolated Node version check failed');
    }
    nodeVersion = nodeResult.stdout.trim();
    if (nodeVersion !== 'v24.17.0') {
      throw new Error(`Isolated Node version must be v24.17.0, received ${nodeVersion || '<missing>'}`);
    }
    activeAction.status = 'done';

    activeAction = requireAction(plan.directories.length + 7);
    const extractedPackagePath = resolve(plan.foundryStagingRoot, 'package.json');
    assertInsideLabRoot(config, extractedPackagePath);
    const extractedManifest = JSON.parse(await readFile(extractedPackagePath, 'utf8')) as { version?: string };
    if (extractedManifest.version !== '14.364.0') {
      throw new Error(
        `Extracted Foundry version must be 14.364.0, received ${extractedManifest.version ?? '<missing>'}`,
      );
    }
    foundryVersion = extractedManifest.version;
    activeAction.status = 'done';

    await replaceDirectory(stagedNodeRoot, config.nodeRoot);
    assertInsideLabRoot(config, plan.nodeStagingRoot);
    await rm(plan.nodeStagingRoot, { recursive: true, force: true });
    await replaceDirectory(plan.foundryStagingRoot, config.appRoot);

    const report = makeReport(true, []);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  } catch (error) {
    if (activeAction.status === 'planned') activeAction.status = 'failed';
    for (const stagingRoot of [plan.nodeStagingRoot, plan.foundryStagingRoot]) {
      assertInsideLabRoot(config, stagingRoot);
      try {
        await rm(stagingRoot, { recursive: true, force: true });
      } catch {
        // Preserve the original bootstrap error in the report.
      }
    }
    const report = makeReport(false, [error instanceof Error ? error.message : String(error)]);
    if (existsSync(config.inventoryRoot)) {
      try {
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      } catch {
        // The original bootstrap error is the useful failure to report.
      }
    }
    return report;
  }
}

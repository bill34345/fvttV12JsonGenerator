import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import {
  assertPhysicalInstallPaths,
  distRoot,
  loadLock,
  localRoot,
  run,
  sha256,
  validateTarget,
  verifyArchive,
  workspaceRoot,
  type TargetPolicy,
  type UpstreamLock,
} from './tooling';

export const PREVIOUS_CANDIDATE_VERSION = '14.6.0-beta.4338eeab.local.7';
export const CANDIDATE_VERSION = '14.6.0-beta.4338eeab.local.8';
export const PREVIOUS_CANDIDATE_ZIP_SHA256 = '8D02F565BC0503AB560BFAA4CCADFC146BCA55784E5D61668E1D3ADAA1B0BCA9';
export const PREVIOUS_INSTALLED_BUNDLE_SHA256 = '1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC';
export const SERVER_NEXT_DATA_ROOT = 'F:/FoundryLab/foundry-v14/data/server-next';
export const SERVER_NEXT_NODE = 'F:/FoundryLab/foundry-v14/runtime/node-v24.17.0-win-x64/node.exe';
export const SERVER_NEXT_MAIN = 'F:/FoundryLab/foundry-v14/app/14.368/main.mjs';
export const SERVER_NEXT_LOOPBACK_PRELOAD = 'F:/FoundryLab/foundry-v14/evidence/server-next-migration/loopback-preload.cjs';
export const SERVER_NEXT_URL = 'http://127.0.0.1:30002';

const PREVIOUS_ZIP_NAME = `midi-qol-v${PREVIOUS_CANDIDATE_VERSION}.zip`;
const BROWSER_RESOURCE_PATHS = ['midi-qol.js', 'midi-qol.js.map', 'module.json'] as const;
const MUTABLE_MANIFEST_FIELDS = ['version', 'title', 'description', 'download'] as const;
const EXPECTED_REPOSITORY_SHA = '4338eeab85041cd71b76ede36818e2265cbf06ae';
const INSTALL_LOCK_NAME = '.midi-qol-install.lock';

export interface RuntimeProcess {
  processId: number;
  name: string;
  executablePath: string;
  commandLine: string;
}

export interface RuntimeListener {
  localAddress: string;
  localPort: number;
  owningProcess: number;
}

export interface ServerNextRuntimeSnapshot {
  processes: RuntimeProcess[];
  listeners: RuntimeListener[];
  foundryOptionsLockExists: boolean;
}

export interface BrowserUpdateArchive {
  files: ReadonlyMap<string, string>;
  manifest: Record<string, unknown>;
}

export interface BrowserUpdatePlan {
  apply: boolean;
  target: string;
  zipPath: string;
  zipSha256: string;
  identity: Record<string, unknown>;
  archive: Record<string, unknown>;
  buildEvidence: Record<string, unknown>;
  replacedFiles: Array<{ path: string; beforeSha256: string; afterSha256: string }>;
  serverBefore: RuntimeProcess;
  servedBundleBeforeSha256: string;
  evidencePath: string;
  message: string;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record).sort((left, right) => left.localeCompare(right, 'en'));
    return `{${fields.map((field) => `${JSON.stringify(field)}:${canonicalJson(record[field])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function comparableManifest(manifest: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(manifest);
  for (const field of MUTABLE_MANIFEST_FIELDS) delete result[field];
  return result;
}

function validateCandidateVersion(candidateVersion: string): void {
  if (candidateVersion !== CANDIDATE_VERSION) throw new Error(`Browser-resource update requires ${CANDIDATE_VERSION}.`);
}

export function assertBrowserUpdateManifests(
  previous: Record<string, unknown>,
  candidate: Record<string, unknown>,
  expectedCandidateVersion: string,
): void {
  validateCandidateVersion(expectedCandidateVersion);
  if (previous.id !== 'midi-qol' || previous.version !== PREVIOUS_CANDIDATE_VERSION) {
    throw new Error('Previous browser-update manifest is not the pinned local.7 baseline.');
  }
  if (candidate.id !== 'midi-qol' || candidate.version !== expectedCandidateVersion) {
    throw new Error('Candidate browser-update manifest identity or version mismatch.');
  }
  if (canonicalJson(comparableManifest(previous)) !== canonicalJson(comparableManifest(candidate))) {
    throw new Error('Candidate changes non-release Midi-QOL manifest semantics.');
  }
}

function sortedKeys(files: ReadonlyMap<string, string>): string[] {
  return [...files.keys()].sort((left, right) => left.localeCompare(right, 'en'));
}

export function assertBrowserOnlyArchiveDelta(
  previous: BrowserUpdateArchive,
  candidate: BrowserUpdateArchive,
  expectedCandidateVersion: string,
): void {
  assertBrowserUpdateManifests(previous.manifest, candidate.manifest, expectedCandidateVersion);
  const previousPaths = sortedKeys(previous.files);
  const candidatePaths = sortedKeys(candidate.files);
  if (canonicalJson(previousPaths) !== canonicalJson(candidatePaths)) {
    throw new Error('Candidate archive adds or removes files outside the pinned previous archive.');
  }

  for (const path of previousPaths) {
    if ((BROWSER_RESOURCE_PATHS as readonly string[]).includes(path)) continue;
    if (previous.files.get(path) !== candidate.files.get(path)) {
      throw new Error(`Candidate changes a non-browser module resource: ${path}`);
    }
  }
  const previousBundleHash = previous.files.get('midi-qol.js');
  const candidateBundleHash = candidate.files.get('midi-qol.js');
  if (!previousBundleHash || !candidateBundleHash || previousBundleHash === candidateBundleHash) {
    throw new Error('Candidate browser bundle is missing or unchanged.');
  }
  for (const path of BROWSER_RESOURCE_PATHS) {
    if (!previous.files.has(path) || !candidate.files.has(path)) {
      throw new Error(`Previous and candidate archives must both contain ${path}.`);
    }
  }
}

function normalizeWindowsPath(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+/gu, '\\').toLocaleLowerCase('en-US');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function exactCommandLineArgument(commandLine: string, option: string, expectedValue: string): boolean {
  const normalizedCommand = normalizeWindowsPath(commandLine);
  const normalizedOption = normalizeWindowsPath(option);
  const pattern = new RegExp(`(?:^|[\\s"'])${escapeRegExp(normalizedOption)}([^\\s"']*)(?=$|[\\s"'])`, 'gu');
  const matches = [...normalizedCommand.matchAll(pattern)];
  return matches.length === 1 && matches[0]![1] === normalizeWindowsPath(expectedValue);
}

function exactCommandLinePath(commandLine: string, path: string): boolean {
  const normalizedCommand = normalizeWindowsPath(commandLine);
  const normalizedPath = normalizeWindowsPath(path);
  const pattern = new RegExp(`(?:^|[\\s"'])${escapeRegExp(normalizedPath)}(?=$|[\\s"'])`, 'gu');
  return [...normalizedCommand.matchAll(pattern)].length === 1;
}

export function assertServerNextCommandLine(process: RuntimeProcess): void {
  if (!exactCommandLinePath(process.commandLine, SERVER_NEXT_MAIN)) {
    throw new Error(`ServerNext process command line does not contain the exact entry point ${SERVER_NEXT_MAIN}.`);
  }
  for (const [option, value] of [
    ['--dataPath=', SERVER_NEXT_DATA_ROOT],
    ['--port=', '30002'],
    ['--world=', 'cor-cotn'],
  ] as const) {
    if (!exactCommandLineArgument(process.commandLine, option, value)) {
      throw new Error(`ServerNext process command line does not contain exactly ${option}${value}.`);
    }
  }
  // The restored instance uses the verified loopback preload rather than a
  // hostname CLI argument. Runtime verification below still requires a loopback listener.
  if (/(?:^|\s)--hostname(?:=|\s)/u.test(process.commandLine)) {
    if (!exactCommandLineArgument(process.commandLine, '--hostname=', '127.0.0.1')) {
      throw new Error('ServerNext hostname argument is not exactly loopback.');
    }
  } else {
    const preload = escapeRegExp(normalizeWindowsPath(SERVER_NEXT_LOOPBACK_PRELOAD));
    const requirement = new RegExp(`(?:^|\\s)--require[=\\s]+["']?${preload}["']?(?=$|\\s)`, 'gu');
    if ([...normalizeWindowsPath(process.commandLine).matchAll(requirement)].length !== 1) {
      throw new Error('ServerNext requires an explicit loopback hostname or the exact loopback preload.');
    }
  }
}

export function assertServerNextRuntime(snapshot: ServerNextRuntimeSnapshot): RuntimeProcess {
  if (snapshot.processes.length !== 1) {
    throw new Error(`Expected exactly one ServerNext Foundry process; found ${snapshot.processes.length}.`);
  }
  const process = snapshot.processes[0]!;
  if (!Number.isSafeInteger(process.processId) || process.processId < 1) throw new Error('ServerNext process id is invalid.');
  if (process.name.toLocaleLowerCase('en-US') !== 'node.exe'
    || normalizeWindowsPath(process.executablePath) !== normalizeWindowsPath(SERVER_NEXT_NODE)) {
    throw new Error('ServerNext is not running under the locked Node 24.17.0 executable.');
  }
  assertServerNextCommandLine(process);
  const listeners = snapshot.listeners.filter((listener) => listener.localPort === 30002);
  if (listeners.length === 0 || listeners.some((listener) => listener.owningProcess !== process.processId)) {
    throw new Error('Port 30002 is not owned exclusively by the locked ServerNext process.');
  }
  if (listeners.some(listener => !['127.0.0.1', '::1'].includes(listener.localAddress))) {
    throw new Error('ServerNext listener is not restricted to loopback.');
  }
  return process;
}

function hashBuffer(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').toUpperCase();
}

async function readJson(path: string, label: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(path, 'utf8')), label);
}

async function collectArchive(root: string): Promise<BrowserUpdateArchive> {
  const modulePath = resolve(root, 'midi-qol');
  const files = new Map<string, string>();
  const visit = async (directory: string, parent = ''): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const rel = parent ? `${parent}/${entry.name}` : entry.name;
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) throw new Error(`Archive staging tree contains a link: ${absolute}`);
      if (stats.isDirectory()) {
        await visit(absolute, rel);
      } else if (stats.isFile()) {
        if (stats.nlink > 1) throw new Error(`Archive staging file is hard-linked: ${absolute}`);
        files.set(rel.replaceAll('\\', '/'), await sha256(absolute));
      } else {
        throw new Error(`Archive staging tree contains a non-regular entry: ${absolute}`);
      }
    }
  };
  await visit(modulePath);
  return { files, manifest: await readJson(resolve(modulePath, 'module.json'), 'Archive module.json') };
}

interface InstalledTree {
  nonPackFiles: Map<string, string>;
  targetedStats: Map<string, { nlink: number; isFile: boolean }>;
}

async function collectInstalledTree(target: string): Promise<InstalledTree> {
  const nonPackFiles = new Map<string, string>();
  const targetedStats = new Map<string, { nlink: number; isFile: boolean }>();
  const visit = async (directory: string, parent = ''): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const rel = parent ? `${parent}/${entry.name}` : entry.name;
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) throw new Error(`Installed Midi-QOL tree contains a link: ${absolute}`);
      if (stats.isDirectory()) {
        await visit(absolute, rel);
      } else if (stats.isFile()) {
        const normalized = rel.replaceAll('\\', '/');
        if ((BROWSER_RESOURCE_PATHS as readonly string[]).includes(normalized)) {
          targetedStats.set(normalized, { nlink: stats.nlink, isFile: stats.isFile() });
        }
        if (!normalized.startsWith('packs/')) nonPackFiles.set(normalized, await sha256(absolute));
      } else {
        throw new Error(`Installed Midi-QOL tree contains a non-regular entry: ${absolute}`);
      }
    }
  };
  await visit(target);
  for (const path of BROWSER_RESOURCE_PATHS) {
    const stats = targetedStats.get(path);
    if (!stats?.isFile || stats.nlink !== 1) throw new Error(`Installed browser resource is missing or hard-linked: ${path}`);
  }
  return { nonPackFiles, targetedStats };
}

function assertInstalledAssetsMatchPrevious(
  installed: ReadonlyMap<string, string>,
  previous: ReadonlyMap<string, string>,
): void {
  const installedPaths = sortedKeys(installed);
  const expectedPaths = sortedKeys(new Map([...previous].filter(([path]) => !path.startsWith('packs/'))));
  if (canonicalJson(installedPaths) !== canonicalJson(expectedPaths)) {
    throw new Error('Installed ServerNext Midi-QOL has unexpected or missing non-pack assets.');
  }
  for (const path of expectedPaths) {
    if (installed.get(path) !== previous.get(path)) throw new Error(`Installed pre-update asset drifted: ${path}`);
  }
}

function assertLockedTarget(lock: UpstreamLock): void {
  if (lock.commit !== EXPECTED_REPOSITORY_SHA
    || lock.moduleId !== 'midi-qol'
    || lock.target.foundry !== '14.368'
    || lock.target.dnd5e !== '6.0.2'
    || lock.target.world !== 'cor-cotn'
    || normalizeWindowsPath(lock.target.dataRoot) !== normalizeWindowsPath(SERVER_NEXT_DATA_ROOT)
    || lock.target.port !== 30002) {
    throw new Error('Upstream lock no longer matches the fixed ServerNext update target.');
  }
  validateCandidateVersion(lock.candidateVersion);
}

function createTargetPolicy(lock: UpstreamLock): TargetPolicy {
  return {
    dataRoot: lock.target.dataRoot,
    world: lock.target.world,
    foundry: lock.target.foundry,
    dnd5e: lock.target.dnd5e,
    port: lock.target.port,
  };
}

async function verifyCandidateEvidence(lock: UpstreamLock): Promise<{
  zipPath: string;
  zipSha256: string;
  buildEvidence: Record<string, unknown>;
  archiveInfo: Record<string, unknown>;
}> {
  const zipPath = resolve(distRoot, `midi-qol-v${lock.candidateVersion}.zip`);
  const resultPath = resolve(distRoot, 'build-result.json');
  const result = await readJson(resultPath, 'build-result.json');
  const expectedZipPath = resolve(String(result.zipPath ?? ''));
  const zipSha256 = await sha256(zipPath);
  if (normalizeWindowsPath(expectedZipPath) !== normalizeWindowsPath(zipPath)
    || result.upstreamCommit !== lock.commit
    || result.candidateVersion !== lock.candidateVersion
    || result.zipSha256 !== zipSha256) {
    throw new Error('Candidate ZIP does not match build-result.json and the locked source/version.');
  }
  const archiveInfo = await verifyArchive(zipPath, lock.candidateVersion);
  return {
    zipPath,
    zipSha256,
    buildEvidence: {
      resultPath,
      upstreamCommit: result.upstreamCommit,
      candidateVersion: result.candidateVersion,
      zipSha256,
    },
    archiveInfo,
  };
}

async function readRuntimeSnapshot(policy: TargetPolicy): Promise<ServerNextRuntimeSnapshot> {
  if (process.platform !== 'win32') throw new Error('Browser-resource update is supported only on the Windows ServerNext host.');
  const root = normalizeWindowsPath(policy.dataRoot);
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const script = [
    `$targetRoot = ${quote(root)}`,
    '$comparison = [System.StringComparison]::OrdinalIgnoreCase',
    '$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.CommandLine -and $_.CommandLine.Replace([char]47, [char]92).IndexOf($targetRoot, $comparison) -ge 0 } | Select-Object @{Name="processId";Expression={$_.ProcessId}}, @{Name="name";Expression={$_.Name}}, @{Name="executablePath";Expression={$_.ExecutablePath}}, @{Name="commandLine";Expression={$_.CommandLine}})',
    '$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 30002 -ErrorAction Stop | Select-Object @{Name="localAddress";Expression={$_.LocalAddress}}, @{Name="localPort";Expression={$_.LocalPort}}, @{Name="owningProcess";Expression={$_.OwningProcess}} | Sort-Object localAddress, owningProcess -Unique)',
    '$foundryOptionsLockExists = Test-Path -LiteralPath (Join-Path $targetRoot "Config/options.json.lock")',
    '@{processes=$processes;listeners=$listeners;foundryOptionsLockExists=$foundryOptionsLockExists} | ConvertTo-Json -Compress -Depth 5',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], workspaceRoot, { allowFailure: true });
  if (result.exitCode !== 0) throw new Error(`Unable to establish ServerNext process and listener identity:\n${result.stderr}`);
  const parsed = asRecord(JSON.parse(result.stdout.trim()), 'ServerNext runtime snapshot');
  const processes = Array.isArray(parsed.processes) ? parsed.processes : parsed.processes ? [parsed.processes] : [];
  const listeners = Array.isArray(parsed.listeners) ? parsed.listeners : parsed.listeners ? [parsed.listeners] : [];
  return {
    processes: processes.map((raw) => {
      const item = asRecord(raw, 'ServerNext process');
      return {
        processId: Number(item.processId),
        name: String(item.name ?? ''),
        executablePath: String(item.executablePath ?? ''),
        commandLine: String(item.commandLine ?? ''),
      };
    }),
    listeners: listeners.map((raw) => {
      const item = asRecord(raw, 'ServerNext listener');
      return { localAddress: String(item.localAddress ?? ''), localPort: Number(item.localPort), owningProcess: Number(item.owningProcess) };
    }),
    foundryOptionsLockExists: parsed.foundryOptionsLockExists === true,
  };
}

export async function fetchServedBundleSha256(timeoutMs = 15_000): Promise<string> {
  const url = `${SERVER_NEXT_URL}/modules/midi-qol/midi-qol.js?codex-browser-update=${randomUUID()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ServerNext did not serve Midi-QOL browser bundle (${response.status}).`);
    const data = new Uint8Array(await response.arrayBuffer());
    return hashBuffer(data);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertNoExistingInstallLock(lockPath: string): Promise<void> {
  try {
    await lstat(lockPath);
    throw new Error(`Midi-QOL install lock already exists: ${lockPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function createEvidencePath(): Promise<string> {
  await mkdir(localRoot, { recursive: true });
  const workspacePhysical = await realpath(workspaceRoot);
  const localPhysical = await realpath(localRoot);
  const localRelative = relative(workspacePhysical, localPhysical);
  if (localRelative === '..' || localRelative.startsWith(`..${sep}`) || localRelative.includes(':')) {
    throw new Error('Midi-QOL local evidence directory escapes the project workspace.');
  }
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return resolve(localRoot, 'evidence', `browser-update-${stamp}-${process.pid}-${randomUUID()}.json`);
}

async function persistEvidence(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
}

async function assertInstallLockOwner(lockPath: string, ownerPath: string, ownerToken: string): Promise<void> {
  const actual = await readFile(ownerPath, 'utf8');
  if (actual !== ownerToken) throw new Error(`Midi-QOL install lock ownership changed: ${lockPath}`);
}

async function acquireInstallLock(lockPath: string): Promise<{ ownerPath: string; ownerToken: string }> {
  await mkdir(lockPath);
  const ownerPath = resolve(lockPath, 'browser-update-owner.json');
  const ownerToken = JSON.stringify({ processId: process.pid, token: randomUUID() });
  try {
    const handle = await open(ownerPath, 'wx');
    try {
      await handle.writeFile(ownerToken, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rmdir(lockPath).catch(() => undefined);
    throw error;
  }
  return { ownerPath, ownerToken };
}

async function releaseInstallLock(lockPath: string, ownerPath: string, ownerToken: string): Promise<void> {
  await assertInstallLockOwner(lockPath, ownerPath, ownerToken);
  await unlink(ownerPath);
  await rmdir(lockPath);
}

export async function replaceFileAtomically(
  path: string,
  expectedBeforeSha256: string,
  content: Uint8Array,
): Promise<string> {
  const beforeStats = await lstat(path);
  if (!beforeStats.isFile() || beforeStats.isSymbolicLink() || beforeStats.nlink !== 1) {
    throw new Error(`Refusing to replace a linked or non-regular target file: ${path}`);
  }
  if (await sha256(path) !== expectedBeforeSha256) throw new Error(`Target changed before replacement: ${path}`);
  const temporary = resolve(dirname(path), `.${basename(path)}.midi-qol-${process.pid}-${randomUUID()}.tmp`);
  let ownsTemporary = false;
  try {
    const handle = await open(temporary, 'wx');
    ownsTemporary = true;
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const temporaryStats = await lstat(temporary);
    if (!temporaryStats.isFile() || temporaryStats.isSymbolicLink() || temporaryStats.nlink !== 1) {
      throw new Error(`Replacement staging file is not a fresh regular file: ${temporary}`);
    }
    await rename(temporary, path);
    ownsTemporary = false;
    const afterStats = await lstat(path);
    if (!afterStats.isFile() || afterStats.isSymbolicLink() || afterStats.nlink !== 1) {
      throw new Error(`Replacement target became linked or non-regular: ${path}`);
    }
    return await sha256(path);
  } finally {
    if (ownsTemporary) {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}

async function cleanupStage(stageRoot: string): Promise<void> {
  await rm(stageRoot, { recursive: true });
}

/**
 * Preview or atomically replace only the locked module's three browser resources.
 * The Foundry process is verified before and after and is never started, stopped, or restarted.
 */
export async function updateBrowserResources(apply = false): Promise<Record<string, unknown>> {
  const lock = await loadLock();
  assertLockedTarget(lock);
  const policy = createTargetPolicy(lock);
  const identity = await validateTarget(lock.target.dataRoot, policy);
  const { zipPath, zipSha256, buildEvidence, archiveInfo } = await verifyCandidateEvidence(lock);
  const previousZip = resolve(distRoot, PREVIOUS_ZIP_NAME);
  if (await sha256(previousZip) !== PREVIOUS_CANDIDATE_ZIP_SHA256) {
    throw new Error('Pinned local.7 comparison ZIP is missing or has changed.');
  }
  await verifyArchive(previousZip, PREVIOUS_CANDIDATE_VERSION);

  const stageRoot = resolve(localRoot, `browser-update-${process.pid}-${randomUUID()}`);
  const stagePhysicalRoot = await realpath(localRoot).catch(async () => {
    await mkdir(localRoot, { recursive: true });
    return await realpath(localRoot);
  });
  const workspacePhysicalRoot = await realpath(workspaceRoot);
  const stageRelative = relative(workspacePhysicalRoot, stagePhysicalRoot);
  if (stageRelative === '..' || stageRelative.startsWith(`..${sep}`) || stageRelative.includes(':')) {
    throw new Error('Browser-update staging directory escapes the project workspace.');
  }

  let stageCreated = false;
  let evidencePath: string | undefined;
  let evidence: Record<string, unknown> | undefined;
  let installLockOwned = false;
  let lockOwner: { ownerPath: string; ownerToken: string } | undefined;
  const dataRoot = lock.target.dataRoot;
  const target = resolve(dataRoot, 'Data/modules/midi-qol');
  const installLockPath = resolve(dataRoot, 'Data/modules', INSTALL_LOCK_NAME);
  const targetFiles = new Map(BROWSER_RESOURCE_PATHS.map((path) => [path, resolve(target, path)]));

  try {
    await assertPhysicalInstallPaths(dataRoot, target, installLockPath, ...targetFiles.values());
    await assertNoExistingInstallLock(installLockPath);

    const beforeSnapshot = await readRuntimeSnapshot(policy);
    const serverBefore = assertServerNextRuntime(beforeSnapshot);
    const servedBundleBeforeSha256 = await fetchServedBundleSha256();

    await mkdir(stageRoot);
    stageCreated = true;
    const previousStage = resolve(stageRoot, 'previous');
    const candidateStage = resolve(stageRoot, 'candidate');
    await mkdir(previousStage);
    await mkdir(candidateStage);
    await run('tar', ['-xf', previousZip, '-C', previousStage], workspaceRoot);
    await run('tar', ['-xf', zipPath, '-C', candidateStage], workspaceRoot);
    const previousArchive = await collectArchive(previousStage);
    const candidateArchive = await collectArchive(candidateStage);
    assertBrowserOnlyArchiveDelta(previousArchive, candidateArchive, lock.candidateVersion);

    const installedTree = await collectInstalledTree(target);
    assertInstalledAssetsMatchPrevious(installedTree.nonPackFiles, previousArchive.files);
    if (installedTree.nonPackFiles.get('midi-qol.js') !== PREVIOUS_INSTALLED_BUNDLE_SHA256) {
      throw new Error('Installed Midi-QOL bundle is not the pinned local.7 runtime asset.');
    }
    const beforeHashes = Object.fromEntries(BROWSER_RESOURCE_PATHS.map((path) => [path, installedTree.nonPackFiles.get(path)]));
    const afterHashes = Object.fromEntries(BROWSER_RESOURCE_PATHS.map((path) => [path, candidateArchive.files.get(path)]));
    if (BROWSER_RESOURCE_PATHS.some((path) => !beforeHashes[path] || !afterHashes[path])) {
      throw new Error('A browser resource hash is missing from the old or candidate installation.');
    }
    if (servedBundleBeforeSha256 !== beforeHashes['midi-qol.js']) {
      throw new Error('HTTP-served ServerNext bundle does not match the installed local.7 bundle.');
    }

    evidencePath = await createEvidencePath();
    evidence = {
      schemaVersion: 1,
      operation: 'midi-qol-browser-resource-update',
      apply,
      phase: apply ? 'apply-preflight-passed' : 'preview',
      checkedAt: new Date().toISOString(),
      identity,
      target,
      candidate: { zipPath, zipSha256, ...buildEvidence, archiveInfo },
      comparison: { previousZip, previousZipSha256: PREVIOUS_CANDIDATE_ZIP_SHA256, previousVersion: PREVIOUS_CANDIDATE_VERSION },
      serverBefore,
      foundryOptionsLockObserved: beforeSnapshot.foundryOptionsLockExists,
      servedBundleBeforeSha256,
      files: BROWSER_RESOURCE_PATHS.map((path) => ({
        path,
        beforeSha256: beforeHashes[path],
        expectedAfterSha256: afterHashes[path],
        afterSha256: null,
      })),
      packsPreserved: true,
      serviceMutation: 'none',
    };
    await persistEvidence(evidencePath, evidence);

    if (!apply) {
      return {
        apply,
        target,
        zipPath,
        zipSha256,
        identity,
        archive: archiveInfo,
        buildEvidence,
        replacedFiles: BROWSER_RESOURCE_PATHS.map((path) => ({
          path,
          beforeSha256: beforeHashes[path]!,
          afterSha256: afterHashes[path]!,
        })),
        serverBefore,
        servedBundleBeforeSha256,
        evidencePath,
        message: 'Preview passed. No ServerNext module files were changed.',
      } satisfies BrowserUpdatePlan;
    }

    lockOwner = await acquireInstallLock(installLockPath);
    installLockOwned = true;
    await assertPhysicalInstallPaths(dataRoot, target, installLockPath, ...targetFiles.values());
    const afterLockIdentity = await validateTarget(dataRoot, policy);
    if (canonicalJson(afterLockIdentity) !== canonicalJson(identity)) throw new Error('ServerNext identity changed after acquiring the install lock.');
    const runtimeUnderLock = assertServerNextRuntime(await readRuntimeSnapshot(policy));
    if (runtimeUnderLock.processId !== serverBefore.processId || runtimeUnderLock.commandLine !== serverBefore.commandLine) {
      throw new Error('ServerNext process changed after acquiring the install lock.');
    }
    const bundleUnderLock = await fetchServedBundleSha256();
    if (bundleUnderLock !== servedBundleBeforeSha256) throw new Error('ServerNext HTTP bundle changed after acquiring the install lock.');
    const currentInstalled = await collectInstalledTree(target);
    assertInstalledAssetsMatchPrevious(currentInstalled.nonPackFiles, previousArchive.files);
    if (currentInstalled.nonPackFiles.get('midi-qol.js') !== PREVIOUS_INSTALLED_BUNDLE_SHA256) {
      throw new Error('Installed Midi-QOL bundle changed after acquiring the install lock.');
    }
    if (await sha256(zipPath) !== zipSha256 || await sha256(previousZip) !== PREVIOUS_CANDIDATE_ZIP_SHA256) {
      throw new Error('A comparison or candidate ZIP changed while preparing the update.');
    }

    evidence.phase = 'applying';
    evidence.foundryOptionsLockObservedUnderLock = (await readRuntimeSnapshot(policy)).foundryOptionsLockExists;
    await persistEvidence(evidencePath, evidence);
    const replacements: Array<{ path: string; beforeSha256: string; afterSha256: string }> = [];
    for (const path of BROWSER_RESOURCE_PATHS) {
      const destination = targetFiles.get(path)!;
      const bytes = await readFile(resolve(candidateStage, 'midi-qol', path));
      const expectedBefore = beforeHashes[path]!;
      const afterSha256 = await replaceFileAtomically(destination, expectedBefore, bytes);
      if (afterSha256 !== afterHashes[path]) throw new Error(`Replacement hash mismatch for ${path}.`);
      replacements.push({ path, beforeSha256: expectedBefore, afterSha256 });
      const fileEvidence = (evidence.files as Array<Record<string, unknown>>).find((item) => item.path === path)!;
      fileEvidence.afterSha256 = afterSha256;
      await persistEvidence(evidencePath, evidence);
    }

    const finalTree = await collectInstalledTree(target);
    for (const path of BROWSER_RESOURCE_PATHS) {
      if (finalTree.nonPackFiles.get(path) !== afterHashes[path]) throw new Error(`Final disk hash mismatch for ${path}.`);
    }
    const afterSnapshot = await readRuntimeSnapshot(policy);
    const serverAfter = assertServerNextRuntime(afterSnapshot);
    if (serverAfter.processId !== serverBefore.processId || serverAfter.commandLine !== serverBefore.commandLine) {
      throw new Error('ServerNext process changed during browser-resource update.');
    }
    const servedBundleAfterSha256 = await fetchServedBundleSha256();
    if (servedBundleAfterSha256 !== afterHashes['midi-qol.js']) {
      throw new Error('HTTP-served bundle did not switch to the candidate bytes.');
    }
    evidence.phase = 'applied';
    evidence.serverAfter = serverAfter;
    evidence.foundryOptionsLockObservedAfter = afterSnapshot.foundryOptionsLockExists;
    evidence.servedBundleAfterSha256 = servedBundleAfterSha256;
    evidence.replacedFiles = replacements;
    await persistEvidence(evidencePath, evidence);

    return {
      apply,
      target,
      zipPath,
      zipSha256,
      identity,
      archive: archiveInfo,
      buildEvidence,
      replacedFiles: replacements,
      serverBefore,
      serverAfter,
      servedBundleBeforeSha256,
      servedBundleAfterSha256,
      evidencePath,
      message: 'Browser resources updated in place. ServerNext stayed on the same PID; reload only the test browser page.',
    };
  } catch (error) {
    if (evidence && evidencePath) {
      evidence.phase = (evidence.files as Array<Record<string, unknown>>).some((item) => item.afterSha256) ? 'partial-failure' : 'failed';
      evidence.error = String(error);
      try {
        evidence.diskAfterFailure = Object.fromEntries(await Promise.all(BROWSER_RESOURCE_PATHS.map(async (path) => {
          const digest = await sha256(targetFiles.get(path)!).catch(() => null);
          return [path, digest];
        })));
        evidence.servedBundleAfterFailureSha256 = await fetchServedBundleSha256().catch(() => null);
        evidence.serverAfterFailure = await readRuntimeSnapshot(policy).catch((snapshotError) => ({ error: String(snapshotError) }));
        await persistEvidence(evidencePath, evidence);
      } catch {
        // Keep the original update failure; the evidence path itself remains in the error context.
      }
    }
    if (evidencePath) throw new Error(`${String(error)}${evidence ? `\nEvidence: ${evidencePath}` : ''}`);
    throw error;
  } finally {
    try {
      if (installLockOwned && lockOwner) await releaseInstallLock(installLockPath, lockOwner.ownerPath, lockOwner.ownerToken);
    } finally {
      if (stageCreated) await cleanupStage(stageRoot);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--apply') || args.filter((argument) => argument === '--apply').length > 1) {
    console.error('Usage: bun run foundry-modules/midi-qol/browser-update.ts [--apply]');
    process.exitCode = 2;
  } else {
    updateBrowserResources(args.includes('--apply'))
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exitCode = 1;
      });
  }
}

import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rmdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export interface UpstreamLock {
  schemaVersion: 1;
  repository: string;
  advisoryBranch: string;
  commit: string;
  packageLockSha256: string;
  candidateVersion: string;
  moduleId: 'midi-qol';
  target: {
    foundry: '14.368';
    dnd5e: '6.0.2';
    world: 'cor-cotn';
    dataRoot: string;
    port: 30002;
  };
  patches: Array<{ path: string; sha256: string; purpose: string }>;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface TargetPolicy {
  dataRoot: string;
  world: string;
  foundry: string;
  dnd5e: string;
  port: number;
}

export interface InstallRuntimeState {
  lockExists: boolean;
  portListening: boolean;
  processes: Array<{ processId: number; name?: string; executablePath?: string }>;
}

export const moduleRoot = resolve(import.meta.dir);
export const workspaceRoot = resolve(moduleRoot, '../..');
export const localRoot = resolve(workspaceRoot, '.local/midi-qol');
export const sourceRoot = resolve(localRoot, 'source');
export const evidenceRoot = resolve(localRoot, 'evidence');
export const distRoot = resolve(moduleRoot, 'dist');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

export async function loadLock(): Promise<UpstreamLock> {
  const lock = JSON.parse(await readFile(resolve(moduleRoot, 'upstream.lock.json'), 'utf8')) as UpstreamLock;
  if (lock.schemaVersion !== 1 || lock.moduleId !== 'midi-qol' || !/^[0-9a-f]{40}$/.test(lock.commit)) {
    throw new Error('Invalid Midi-QOL upstream lock.');
  }
  return lock;
}

export async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
}

export async function run(
  command: string,
  args: string[],
  cwd: string,
  options: { allowFailure?: boolean; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandResult> {
  const child = Bun.spawn([command, ...args], {
    cwd,
    env: { ...process.env, ...options.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let expired = false;
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    expired = true;
    child.kill();
  }, options.timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (expired) throw new Error(`Command subprocess ${child.pid} exceeded ${options.timeoutMs}ms and was reaped.`);
    const result = { command: [command, ...args].join(' '), exitCode, stdout, stderr };
    if (exitCode !== 0 && !options.allowFailure) {
      throw new Error(`${result.command} failed (${exitCode})\n${stdout}\n${stderr}`.trim());
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function assertInside(root: string, candidate: string, label: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes approved root: ${candidate}`);
  }
}

async function assertNoReparseComponents(root: string, candidate: string): Promise<void> {
  assertInside(root, candidate, 'Path');
  const rel = relative(resolve(root), resolve(candidate));
  let current = resolve(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Unsafe symlink or junction: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

async function assertTreeHasNoLinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`Archive contains a symlink or junction: ${path}`);
    if (stats.isDirectory()) await assertTreeHasNoLinks(path);
  }
}

function normalizeDiagnostics(result: CommandResult): string {
  const lines = `${result.stdout}\n${result.stderr}`
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const canonical = lines.map((line) => line
    .replaceAll(sourceRoot.replaceAll('\\', '/'), '<SOURCE>')
    .replaceAll(sourceRoot, '<SOURCE>')
    .replace(/\(\d+,\d+\)(?=: error TS\d+:)/u, '(LINE,COLUMN)'));
  return canonical.sort((left, right) => left.localeCompare(right, 'en')).join('\n');
}

async function writeCommandEvidence(label: string, result: CommandResult): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(resolve(evidenceRoot, `${label}.stdout.log`), result.stdout);
  await writeFile(resolve(evidenceRoot, `${label}.stderr.log`), result.stderr);
  await writeFile(resolve(evidenceRoot, `${label}.result.json`), `${JSON.stringify({
    command: result.command,
    exitCode: result.exitCode,
  }, null, 2)}\n`);
}

async function setCandidateMetadata(lock: UpstreamLock): Promise<void> {
  const packagePath = resolve(sourceRoot, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
  pkg.title = 'Midi-QOL Beta (dnd5e 6, ServerNext local)';
  pkg.version = lock.candidateVersion;
  pkg.description = `Local ServerNext compatibility candidate from official Midi-QOL ${lock.commit.slice(0, 8)}.`;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export async function prepareAndBuild(): Promise<Record<string, unknown>> {
  const lock = await loadLock();
  assertInside(workspaceRoot, sourceRoot, 'Build source');
  await rm(localRoot, { recursive: true, force: true });
  await mkdir(localRoot, { recursive: true });

  await run('git', ['init', sourceRoot], workspaceRoot);
  await run('git', ['remote', 'add', 'origin', lock.repository], sourceRoot);
  await run('git', ['fetch', '--depth=1', 'origin', lock.commit], sourceRoot);
  await run('git', ['checkout', '--detach', 'FETCH_HEAD'], sourceRoot);
  const head = (await run('git', ['rev-parse', 'HEAD'], sourceRoot)).stdout.trim();
  if (head !== lock.commit) throw new Error(`Fetched wrong upstream commit: ${head}`);

  const packageLockHash = await sha256(resolve(sourceRoot, 'package-lock.json'));
  if (packageLockHash !== lock.packageLockSha256) {
    throw new Error(`package-lock.json hash drifted: ${packageLockHash}`);
  }
  for (const patch of lock.patches) {
    const patchPath = resolve(moduleRoot, patch.path);
    assertInside(moduleRoot, patchPath, 'Patch');
    const actualHash = await sha256(patchPath);
    if (actualHash !== patch.sha256) throw new Error(`Patch hash drifted: ${patch.path}`);
  }

  await run(npmCommand, ['ci', '--ignore-scripts'], sourceRoot);
  const baseline = await run(npxCommand, ['tsc', '--noEmit', '--pretty', 'false'], sourceRoot, { allowFailure: true });
  await writeCommandEvidence('baseline-typecheck', baseline);

  for (const patch of lock.patches) {
    const patchPath = resolve(moduleRoot, patch.path);
    await run('git', ['apply', '--check', patchPath], sourceRoot);
    await run('git', ['apply', patchPath], sourceRoot);
  }
  await setCandidateMetadata(lock);
  assertWorkflowEffectContract(await readFile(resolve(sourceRoot, 'src/module/Workflow.ts'), 'utf8'));

  const candidate = await run(npxCommand, ['tsc', '--noEmit', '--pretty', 'false'], sourceRoot, { allowFailure: true });
  await writeCommandEvidence('candidate-typecheck', candidate);
  if (candidate.exitCode !== baseline.exitCode || normalizeDiagnostics(candidate) !== normalizeDiagnostics(baseline)) {
    throw new Error('Candidate TypeScript diagnostics differ from the locked upstream baseline.');
  }

  const build = await run(npxCommand, ['gulp', 'zip'], sourceRoot);
  await writeCommandEvidence('candidate-build', build);
  const upstreamZip = resolve(sourceRoot, 'package', `midi-qol-v${lock.candidateVersion}.zip`);
  await mkdir(distRoot, { recursive: true });
  const candidateZip = resolve(distRoot, `midi-qol-v${lock.candidateVersion}.zip`);
  await cp(upstreamZip, candidateZip);
  const archive = await verifyArchive(candidateZip, lock.candidateVersion);
  const result = {
    upstreamCommit: lock.commit,
    candidateVersion: lock.candidateVersion,
    baselineTypecheckExitCode: baseline.exitCode,
    candidateTypecheckExitCode: candidate.exitCode,
    zipPath: candidateZip,
    zipSha256: await sha256(candidateZip),
    archive,
  };
  await writeFile(resolve(distRoot, 'build-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function verifyArchive(zipPath: string, expectedVersion: string): Promise<Record<string, unknown>> {
  const listing = await run('tar', ['-tf', zipPath], workspaceRoot);
  const verboseListing = await run('tar', ['-tvf', zipPath], workspaceRoot);
  for (const line of verboseListing.stdout.split(/\r?\n/u).filter(Boolean)) {
    const kind = line.trimStart()[0];
    if (kind !== '-' && kind !== 'd') throw new Error(`Archive contains a non-file entry: ${line}`);
  }
  const entries = listing.stdout.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) throw new Error('Candidate archive is empty.');
  assertArchiveEntryNames(entries);

  const verifyRoot = resolve(localRoot, `verify-${process.pid}`);
  await rm(verifyRoot, { recursive: true, force: true });
  await mkdir(verifyRoot, { recursive: true });
  try {
    await run('tar', ['-xf', zipPath, '-C', verifyRoot], workspaceRoot);
    await assertTreeHasNoLinks(verifyRoot);
    const manifest = JSON.parse(await readFile(resolve(verifyRoot, 'midi-qol/module.json'), 'utf8')) as Record<string, unknown>;
    if (manifest.id !== 'midi-qol' || manifest.version !== expectedVersion) {
      throw new Error(`Candidate manifest identity mismatch: ${String(manifest.id)} ${String(manifest.version)}`);
    }
    if (!entries.includes('midi-qol/LICENSE') || !entries.includes('midi-qol/midi-qol.js')) {
      throw new Error('Candidate archive is missing LICENSE or browser bundle.');
    }
    await verifyManifestReferences(resolve(verifyRoot, 'midi-qol'), manifest);
    return { entryCount: entries.length, moduleId: manifest.id, version: manifest.version };
  } finally {
    await rm(verifyRoot, { recursive: true, force: true });
  }
}

export function assertArchiveEntryNames(entries: string[]): void {
  const seen = new Set<string>();
  const normalizedEntries = entries.map((raw) => {
    const entry = raw.replaceAll('\\', '/');
    const segments = entry.split('/').filter(Boolean);
    if (!entry || entry.startsWith('/') || /^[A-Za-z]:/u.test(entry) || entry.includes('\0')
      || segments.includes('.') || segments.includes('..')) {
      throw new Error(`Unsafe archive entry: ${raw}`);
    }
    if (entry !== 'midi-qol/' && !entry.startsWith('midi-qol/')) {
      throw new Error(`Archive entry is outside midi-qol/: ${raw}`);
    }
    for (const segment of segments) {
      const stem = segment.split('.')[0]!.toLocaleUpperCase();
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(stem) || segment.includes(':')) {
        throw new Error(`Archive entry uses a reserved Windows path: ${raw}`);
      }
    }
    const key = entry.replace(/\/$/u, '').toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Archive contains a duplicate path: ${raw}`);
    seen.add(key);
    return { entry: entry.replace(/\/$/u, ''), directory: entry.endsWith('/') };
  });
  const files = new Set(normalizedEntries.filter((item) => !item.directory).map((item) => item.entry.toLocaleLowerCase()));
  for (const item of normalizedEntries) {
    const parts = item.entry.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      const prefix = parts.slice(0, index).join('/').toLocaleLowerCase();
      if (files.has(prefix)) throw new Error(`Archive path conflicts with a file: ${item.entry}`);
    }
  }
}

async function verifyManifestReferences(root: string, manifest: Record<string, any>): Promise<void> {
  const files = [
    ...(manifest.esmodules ?? []),
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((entry: Record<string, unknown>) => entry.path),
  ].filter((path): path is string => typeof path === 'string');
  for (const path of files) {
    const target = resolve(root, path);
    assertInside(root, target, 'Manifest file reference');
    const stats = await lstat(target).catch(() => null);
    if (!stats?.isFile()) throw new Error(`Manifest references a missing file: ${path}`);
  }
  for (const pack of manifest.packs ?? []) {
    if (typeof pack.path !== 'string') continue;
    const target = resolve(root, pack.path);
    assertInside(root, target, 'Manifest pack reference');
    const stats = await lstat(target).catch(() => null);
    if (!stats?.isDirectory()) throw new Error(`Manifest references a missing pack: ${pack.path}`);
  }
}

export function assertWorkflowEffectContract(source: string): void {
  const checks: Array<[string, string]> = [
    ['template cleanup', 'async setupTemplateCleanup'],
    ['summon cleanup', 'const summonString'],
    ['transform cleanup', 'const transformString'],
  ];
  for (const [label, marker] of checks) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error(`Missing ${label} marker.`);
    const createIndex = source.indexOf('createEmbeddedDocuments("ActiveEffect"', markerIndex);
    if (createIndex < 0) throw new Error(`Missing ${label} ActiveEffect creation.`);
    const fragment = source.slice(markerIndex, createIndex);
    if (!/effectData(?:\s*:\s*ActiveEffect\.CreateData)?\s*=\s*\{\s*_id:\s*foundry\.utils\.randomID\(\),\s*type:\s*"base",\s*system:\s*\{\s*changes:\s*\[\]\s*\}/su.test(fragment)) {
      throw new Error(`${label} must create a base ActiveEffect with a fresh _id and changes-only system data.`);
    }
  }
}

export async function validateTarget(
  dataRoot: string,
  policy: TargetPolicy,
): Promise<Record<string, unknown>> {
  const expected = resolve(policy.dataRoot);
  const actual = resolve(dataRoot);
  if (relative(expected, actual) !== '') throw new Error(`Only the exact ServerNext data root is allowed: ${expected}`);
  if (actual.toLocaleLowerCase().includes('server-mirror')) throw new Error('server-mirror is read-only and rejected.');
  await assertNoReparseComponents(parse(actual).root, actual);
  if ((await realpath(actual)).toLocaleLowerCase() !== (await realpath(expected)).toLocaleLowerCase()) {
    throw new Error('ServerNext data root resolves to an unexpected physical path.');
  }

  const world = JSON.parse(await readFile(resolve(actual, `Data/worlds/${policy.world}/world.json`), 'utf8')) as Record<string, unknown>;
  const system = JSON.parse(await readFile(resolve(actual, 'Data/systems/dnd5e/system.json'), 'utf8')) as Record<string, unknown>;
  if (world.id !== policy.world || world.coreVersion !== policy.foundry || world.systemVersion !== policy.dnd5e) {
    throw new Error('ServerNext world identity does not match the locked target.');
  }
  if (system.id !== 'dnd5e' || system.version !== policy.dnd5e) throw new Error('ServerNext dnd5e identity mismatch.');
  return { dataRoot: actual, world: world.id, foundry: world.coreVersion, dnd5e: system.version };
}

export async function isPortListening(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolveResult) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => { socket.destroy(); resolveResult(value); };
    socket.setTimeout(400);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function assertPhysicalInstallPaths(dataRoot: string, ...paths: string[]): Promise<void> {
  const lexicalDataRoot = resolve(dataRoot);
  const volumeRoot = parse(lexicalDataRoot).root;
  for (const path of paths) await assertNoReparseComponents(volumeRoot, resolve(path));
  const modulesRoot = resolve(lexicalDataRoot, 'Data/modules');
  const [physicalDataRoot, physicalModulesRoot] = await Promise.all([realpath(lexicalDataRoot), realpath(modulesRoot)]);
  const expectedPhysicalModulesRoot = resolve(physicalDataRoot, 'Data/modules');
  if (relative(expectedPhysicalModulesRoot, physicalModulesRoot) !== '') {
    throw new Error(`ServerNext modules directory crosses a junction or reparse point: ${modulesRoot}`);
  }
  for (const path of paths) assertInside(modulesRoot, path, 'Install path');
}

export async function processesUsingDataRoot(dataRoot: string): Promise<InstallRuntimeState['processes']> {
  if (process.platform !== 'win32') throw new Error('Midi-QOL ServerNext installation is supported only on Windows.');
  const windowsPath = resolve(dataRoot);
  const forwardPath = windowsPath.replaceAll('\\', '/');
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  // WQL LIKE must treat path characters literally, including its wildcard syntax.
  const filter = [windowsPath, forwardPath].map((path) => {
    const literal = path.replace(/[\\'"]/gu, '\\$&').replace(/[%_[]/gu, '[$&]');
    return `CommandLine LIKE '%${literal}%'`;
  }).join(' OR ');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$items = @(Get-CimInstance Win32_Process -Filter ${quote(filter)} -Property ProcessId,Name,ExecutablePath -OperationTimeoutSec 5 | Select-Object ProcessId,Name,ExecutablePath)`,
    'if ($items.Count -eq 0) { "[]" } else { $items | ConvertTo-Json -Compress }',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], workspaceRoot, {
    allowFailure: true,
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) throw new Error(`Unable to establish ServerNext process ownership:\n${result.stderr}`);
  const parsed = JSON.parse(result.stdout.trim() || '[]') as Record<string, unknown> | Array<Record<string, unknown>>;
  return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    processId: Number(item.ProcessId),
    name: typeof item.Name === 'string' ? item.Name : undefined,
    executablePath: typeof item.ExecutablePath === 'string' ? item.ExecutablePath : undefined,
  }));
}

export function assertInstallRuntimeIdle(state: InstallRuntimeState): void {
  if (state.lockExists) throw new Error('ServerNext options lock exists; establish ownership and remove only a verified stale lock before installation.');
  if (state.portListening) throw new Error('Port 30002 is listening; ServerNext may be shared or running.');
  if (state.processes.length > 0) {
    throw new Error(`A process references the ServerNext data root: ${state.processes.map((item) => item.processId).join(', ')}`);
  }
}

async function collectInstallRuntimeState(dataRoot: string, port: number): Promise<InstallRuntimeState> {
  return {
    lockExists: await pathExists(resolve(dataRoot, 'Config/options.json.lock')),
    portListening: await isPortListening(port),
    processes: await processesUsingDataRoot(dataRoot),
  };
}

async function verifyBuildEvidence(zipPath: string, lock: UpstreamLock): Promise<Record<string, unknown>> {
  const resultPath = resolve(distRoot, 'build-result.json');
  const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>;
  const expectedPath = resolve(String(result.zipPath ?? ''));
  const actualPath = resolve(zipPath);
  const actualHash = await sha256(actualPath);
  if (expectedPath !== actualPath
    || result.upstreamCommit !== lock.commit
    || result.candidateVersion !== lock.candidateVersion
    || result.zipSha256 !== actualHash) {
    throw new Error('Candidate ZIP is not bound to the current locked build evidence.');
  }
  return { resultPath, zipSha256: actualHash, upstreamCommit: result.upstreamCommit, candidateVersion: result.candidateVersion };
}

export async function installCandidate(
  zipPath: string,
  dataRoot: string,
  apply: boolean,
  policy?: TargetPolicy,
): Promise<Record<string, unknown>> {
  const lock = await loadLock();
  const targetPolicy = policy ?? {
    dataRoot: lock.target.dataRoot,
    world: lock.target.world,
    foundry: lock.target.foundry,
    dnd5e: lock.target.dnd5e,
    port: lock.target.port,
  };
  const identity = await validateTarget(dataRoot, targetPolicy);
  const buildEvidence = await verifyBuildEvidence(zipPath, lock);
  const archive = await verifyArchive(zipPath, lock.candidateVersion);
  const runtimeState = await collectInstallRuntimeState(dataRoot, targetPolicy.port);
  assertInstallRuntimeIdle(runtimeState);
  const target = resolve(dataRoot, 'Data/modules/midi-qol');
  const stage = resolve(dataRoot, `Data/modules/.midi-qol-install-${process.pid}`);
  const installLock = resolve(dataRoot, 'Data/modules/.midi-qol-install.lock');
  await assertPhysicalInstallPaths(dataRoot, target, stage, installLock);
  const plan = {
    apply,
    target,
    stage,
    zipPath: resolve(zipPath),
    zipSha256: await sha256(zipPath),
    identity,
    archive,
    buildEvidence,
    runtimeState,
  };
  if (!apply) return plan;

  try {
    await mkdir(installLock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Midi-QOL install lock already exists: ${installLock}`);
    }
    throw error;
  }
  try {
    await rm(stage, { recursive: true, force: true });
    await mkdir(stage, { recursive: true });
    await run('tar', ['-xf', resolve(zipPath), '-C', stage], workspaceRoot);
    await assertTreeHasNoLinks(stage);
    const stagedModule = resolve(stage, 'midi-qol');
    const manifest = JSON.parse(await readFile(resolve(stagedModule, 'module.json'), 'utf8')) as Record<string, unknown>;
    if (manifest.id !== 'midi-qol' || manifest.version !== lock.candidateVersion) throw new Error('Staged module identity mismatch.');
    await assertPhysicalInstallPaths(dataRoot, target, stage, installLock);
    assertInstallRuntimeIdle(await collectInstallRuntimeState(dataRoot, targetPolicy.port));
    await rm(target, { recursive: true, force: true });
    await rename(stagedModule, target);
    return {
      ...plan,
      installedManifestSha256: await sha256(resolve(target, 'module.json')),
      installedBundleSha256: await sha256(resolve(target, 'midi-qol.js')),
    };
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rmdir(installLock).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function upstreamCheck(): Promise<Record<string, unknown>> {
  const lock = await loadLock();
  const api = 'https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol';
  const get = async (path: string) => {
    const response = await fetch(`${api}${path}`);
    if (!response.ok) throw new Error(`GitLab API ${path} failed: ${response.status}`);
    return await response.json();
  };
  const [branches, releases, mergeRequests] = await Promise.all([
    get('/repository/branches?per_page=100') as Promise<Array<Record<string, any>>>,
    get('/releases?per_page=10') as Promise<Array<Record<string, any>>>,
    get('/merge_requests?state=opened&per_page=100') as Promise<Array<Record<string, any>>>,
  ]);
  const relevantMergeRequests: Array<Record<string, unknown>> = [];
  for (const mergeRequest of mergeRequests) {
    const diffs = await get(`/merge_requests/${mergeRequest.iid}/diffs?per_page=100`) as Array<Record<string, any>>;
    const matches = diffs.filter((diff) => /setupTemplateCleanup|system\.type|naturalFumble|type:\s*["']base["']|getAssociatedItem|system\.item|onUseMacros|itemUuid|buildTargetListEntry|calculateDamage|RecordedTargets|enchant|clone\(|_initializeSource|statusEffects/iu.test(String(diff.diff)));
    if (matches.length > 0) relevantMergeRequests.push({ iid: mergeRequest.iid, title: mergeRequest.title, files: matches.map((diff) => diff.new_path) });
  }
  const selected = branches.find((branch) => branch.name === lock.advisoryBranch);
  return {
    checkedAt: new Date().toISOString(),
    lockedCommit: lock.commit,
    advisoryHead: selected?.commit?.id,
    advisoryAdvanced: selected?.commit?.id !== lock.commit,
    latestRelease: releases[0] ? { tag: releases[0].tag_name, releasedAt: releases[0].released_at } : null,
    branchCount: branches.length,
    openMergeRequestCount: mergeRequests.length,
    relevantMergeRequests,
  };
}

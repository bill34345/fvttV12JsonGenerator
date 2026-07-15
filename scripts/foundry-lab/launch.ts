import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { FoundryLabConfig } from './config';
import { assertInsideLabRoot } from './config';

export type ProfileId = 'core-test' | 'server-mirror';
export function buildLaunchCommand(config: FoundryLabConfig, profileId: ProfileId) {
  const profile = profileId === 'core-test' ? config.profiles.coreTest : config.profiles.serverMirror;
  return { command: resolve(config.nodeRoot, 'node.exe'), args: [resolve(config.appRoot, 'main.js'), '--dataPath', profile.dataPath, '--hostname', '127.0.0.1', '--port', String(profile.port), '--noupnp'] };
}
// Foundry 14.364's parseArgs/getEnvDataPath read only --key=value tokens even
// though buildLaunchCommand preserves the project-facing command contract.
export function buildRuntimeArgs(args: string[]): string[] {
  if (!args[0]) throw new Error('Foundry main script argument is required');
  const result: string[] = [args[0]];
  for (let i = 1; i < args.length; i++) {
    const value = args[i];
    if (!value) throw new Error('Foundry launch arguments must not be empty');
    if (['--dataPath', '--hostname', '--port'].includes(value)) {
      const next = args[++i]; if (!next) throw new Error(`Missing value for ${value}`); result.push(`${value}=${next}`);
    } else result.push(value);
  }
  return result;
}
export function validateListenerAddresses(addresses: string[]): void {
  if (!addresses.length || addresses.some((address) => address !== '127.0.0.1' && address !== '::1')) throw new Error(`Foundry listener is not loopback-only: ${addresses.join(', ') || '<none>'}`);
}
export interface ListenerRecord { address: string; pid: number }
interface LaunchEvidence {
  profile: ProfileId;
  spawnedPid?: number;
  listener?: { address: string; port: number; owningPid: number }[];
  httpLicenseBoundary?: { status: number; location: string | null };
  mutualExclusion?: { rejected: boolean; runningProfile: ProfileId; runningPid: number; firstProcessRemainedAlive: boolean };
  stop?: { portReleased: boolean; pidGone: boolean; pidFileRemoved: boolean; staleOptionsLockRemoved?: boolean };
}
export function validateListenerOwnership(records: ListenerRecord[], expectedPid: number): void {
  validateListenerAddresses(records.map((record) => record.address));
  if (records.some((record) => record.pid !== expectedPid)) throw new Error(`Foundry listener is not owned by spawned PID ${expectedPid}`);
}
async function listenerRecords(port: number): Promise<ListenerRecord[]> {
  const script = `@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{address=$_.LocalAddress;pid=$_.OwningProcess} }) | ConvertTo-Json -Compress`;
  const result = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`Unable to inspect listener on port ${port}`);
  const output = result.stdout.toString().trim(); if (!output) return [];
  const parsed = JSON.parse(output) as unknown;
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return rows.map((row) => ({ address: String((row as { address?: unknown }).address), pid: Number((row as { pid?: unknown }).pid) }));
}
const profileFor = (config: FoundryLabConfig, id: ProfileId) => id === 'core-test' ? config.profiles.coreTest : config.profiles.serverMirror;
export const otherProfileId = (id: ProfileId): ProfileId => id === 'core-test' ? 'server-mirror' : 'core-test';
export function buildSafeOptions(existing: Record<string, unknown>, profile: { dataPath: string; host: string; port: number }): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...existing, dataPath: profile.dataPath, hostname: profile.host, port: profile.port, upnp: false, unixSocket: null };
  for (const key of ['adminPassword', 'adminKey', 'license', 'serviceKey']) delete safe[key];
  return safe;
}
export function loopbackPreloadSource(): string {
  return "const net=require('node:net');const original=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return original.apply(this,args)};";
}
export function isExpectedFoundryProcess(config: FoundryLabConfig, id: ProfileId, executable: string, commandLine: string): boolean {
  const profile = profileFor(config, id);
  const tokens = [...commandLine.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? '');
  const normalizedPath = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
  const expectedMain = normalizedPath(resolve(config.appRoot, 'main.js'));
  const dataToken = tokens.find((token) => token.toLowerCase().startsWith('--datapath='));
  const portToken = tokens.find((token) => token.toLowerCase().startsWith('--port='));
  return normalizedPath(executable) === normalizedPath(resolve(config.nodeRoot, 'node.exe'))
    && tokens.some((token) => normalizedPath(token) === expectedMain)
    && !!dataToken && normalizedPath(dataToken.slice(dataToken.indexOf('=') + 1)) === normalizedPath(profile.dataPath)
    && portToken === `--port=${profile.port}`;
}
function queryProcess(pid: number): { executable: string; commandLine: string } | null {
  const query = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue;if($p){$p|Select-Object ExecutablePath,CommandLine|ConvertTo-Json -Compress}`], { stdout: 'pipe', stderr: 'pipe' });
  if (query.exitCode !== 0) throw new Error(`Unable to inspect process PID ${pid}`);
  const output = query.stdout.toString().trim(); if (!output) return null;
  const info = JSON.parse(output) as { ExecutablePath?: unknown; CommandLine?: unknown };
  return typeof info.ExecutablePath === 'string' && typeof info.CommandLine === 'string' ? { executable: info.ExecutablePath, commandLine: info.CommandLine } : null;
}
async function writeLaunchEvidence(config: FoundryLabConfig, id: ProfileId, patch: Partial<LaunchEvidence>): Promise<void> {
  const directory = join(config.evidenceRoot, id), path = join(directory, 'launch-evidence.json'); await mkdir(directory, { recursive: true });
  let existing: LaunchEvidence = { profile: id }; try { existing = JSON.parse(await readFile(path, 'utf8')) as LaunchEvidence; } catch {}
  const temporary = `${path}.tmp`; await writeFile(temporary, `${JSON.stringify({ ...existing, ...patch, profile: id }, null, 2)}\n`, 'utf8'); await rename(temporary, path);
}
async function rejectRunningPeer(config: FoundryLabConfig, id: ProfileId): Promise<void> {
  const peer = otherProfileId(id), pidFile = join(config.evidenceRoot, peer, 'server.pid');
  if (!existsSync(pidFile)) return;
  let pid = 0; try { pid = Number((JSON.parse(await readFile(pidFile, 'utf8')) as { foundry?: unknown }).foundry); } catch {}
  const info = Number.isInteger(pid) && pid > 0 ? queryProcess(pid) : null;
  if (info && isExpectedFoundryProcess(config, peer, info.executable, info.commandLine)) {
    await writeLaunchEvidence(config, id, { mutualExclusion: { rejected: true, runningProfile: peer, runningPid: pid, firstProcessRemainedAlive: queryProcess(pid) !== null } });
    throw new Error(`Cannot launch ${id} while ${peer} is running as PID ${pid}`);
  }
  await rm(pidFile, { force: true });
}

interface LaunchReservationOwner { pid: number; profile: ProfileId; token: string }
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export async function withLaunchReservation<T>(config: FoundryLabConfig, id: ProfileId, work: () => Promise<T>): Promise<T> {
  const lockDirectory = join(config.evidenceRoot, '.launch-reservation');
  const ownerPath = join(lockDirectory, 'owner.json');
  assertInsideLabRoot(config, lockDirectory);
  await mkdir(config.evidenceRoot, { recursive: true });
  const owner: LaunchReservationOwner = { pid: process.pid, profile: id, token: randomUUID() };
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt++) {
    try {
      await mkdir(lockDirectory);
      acquired = true;
      await writeFile(ownerPath, JSON.stringify(owner), { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (acquired) { await rm(lockDirectory, { recursive: true, force: true }); acquired = false; throw error; }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let existing: LaunchReservationOwner | null = null;
      try { existing = JSON.parse(await readFile(ownerPath, 'utf8')) as LaunchReservationOwner; } catch {}
      if (!existing || isProcessAlive(existing.pid)) {
        const heldBy = existing ? `${existing.profile} (PID ${existing.pid})` : 'an initializing launcher';
        throw new Error(`Foundry lab launch reservation is held by ${heldBy}`);
      }
      // Claim the stale directory by atomic rename before deleting it. This
      // prevents two recoverers from deleting a new live owner's reservation.
      const staleDirectory = `${lockDirectory}.stale-${owner.token}`;
      try { await rename(lockDirectory, staleDirectory); }
      catch (renameError) {
        if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw renameError;
      }
      await rm(staleDirectory, { recursive: true, force: true });
    }
  }
  if (!acquired) throw new Error('Unable to acquire Foundry lab launch reservation');
  try { return await work(); }
  finally {
    let current: LaunchReservationOwner | null = null;
    try { current = JSON.parse(await readFile(ownerPath, 'utf8')) as LaunchReservationOwner; } catch {}
    if (current?.token === owner.token) await rm(lockDirectory, { recursive: true, force: true });
  }
}

async function launchProfileReserved(config: FoundryLabConfig, id: ProfileId): Promise<{ pid: number; url: string; log: string }> {
  const profile = profileFor(config, id), built = buildLaunchCommand(config, id);
  await rejectRunningPeer(config, id);
  const mainScript = built.args[0]; if (!mainScript) throw new Error('Foundry main script argument is required');
  for (const path of [built.command, mainScript, profile.dataPath]) if (!existsSync(path)) throw new Error(`Required launch path does not exist: ${path}`);
  if ((await listenerRecords(profile.port)).length) throw new Error(`Port ${profile.port} is already in use`);
  const optionsPath = join(profile.dataPath, 'Config', 'options.json');
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(await readFile(optionsPath, 'utf8')) as Record<string, unknown>; } catch {}
  await mkdir(join(profile.dataPath, 'Config'), { recursive: true });
  await writeFile(optionsPath, `${JSON.stringify(buildSafeOptions(existing, profile), null, 2)}\n`, 'utf8');
  const evidence = join(config.evidenceRoot, id); await mkdir(evidence, { recursive: true });
  const log = join(evidence, 'server.log'), pidFile = join(evidence, 'server.pid');
  const handle = await open(log, 'a');
  const preload = join(evidence, 'loopback-preload.cjs'); await writeFile(preload, loopbackPreloadSource(), 'utf8');
  const runtime = buildRuntimeArgs(built.args); let child: ChildProcess;
  try { child = spawn(built.command, ['--require', preload, runtime[0]!, ...runtime.slice(1), '--noipdiscovery'], { cwd: config.appRoot, detached: true, windowsHide: true, stdio: ['ignore', handle.fd, handle.fd] }) as ChildProcess; }
  finally { await handle.close(); }
  const pid = child.pid; if (!pid) throw new Error('Foundry process did not receive a PID');
  const cleanup = async () => {
    try { child.kill('SIGTERM'); } catch {}
    for (let i = 0; i < 20 && child.exitCode === null; i++) await Bun.sleep(100);
    if (child.exitCode === null) Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'pipe', stderr: 'pipe' });
    for (let i = 0; i < 20 && (await listenerRecords(profile.port)).length; i++) await Bun.sleep(100);
    await rm(pidFile, { force: true });
    if ((await listenerRecords(profile.port)).length) throw new Error(`Failed to release Foundry port ${profile.port} during cleanup`);
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    await Bun.sleep(250);
    if (child.exitCode !== null) { await cleanup(); throw new Error(`Foundry exited before listening (exit ${child.exitCode})`); }
    const records = await listenerRecords(profile.port);
    if (records.length) {
      try { validateListenerOwnership(records, pid); }
      catch (error) { await cleanup(); throw error; }
      let response: Response;
      try { response = await fetch(`http://127.0.0.1:${profile.port}/license`, { redirect: 'manual' }); }
      catch (error) { await cleanup(); throw new Error(`Foundry license boundary was not reachable: ${error instanceof Error ? error.message : String(error)}`); }
      try {
        await writeLaunchEvidence(config, id, {
          spawnedPid: pid,
          listener: records.map((record) => ({ address: record.address, port: profile.port, owningPid: record.pid })),
          httpLicenseBoundary: { status: response.status, location: response.headers.get('location') },
        });
        const temporary = `${pidFile}.tmp`; await writeFile(temporary, JSON.stringify({ foundry: pid }), 'utf8'); await rename(temporary, pidFile); child.unref();
      } catch (error) { await cleanup(); throw error; }
      return { pid, url: `http://127.0.0.1:${profile.port}/`, log };
    }
  }
  await cleanup(); throw new Error(`Foundry did not listen on port ${profile.port}`);
}
export async function launchProfile(config: FoundryLabConfig, id: ProfileId): Promise<{ pid: number; url: string; log: string }> {
  return withLaunchReservation(config, id, () => launchProfileReserved(config, id));
}
export interface StopDependencies {
  queryProcess?: (pid: number) => { executable: string; commandLine: string } | null;
  kill?: (pid: number) => void;
}
export async function cleanupStaleOptionsLock(config: FoundryLabConfig, id: ProfileId): Promise<boolean> {
  const profile = profileFor(config, id);
  const lock = join(profile.dataPath, 'Config/options.json.lock');
  assertInsideLabRoot(config, lock);
  if (!existsSync(lock)) return false;
  const children = await readdir(lock);
  if (children.length) throw new Error(`Refusing to remove Foundry options lock because it is not empty: ${lock}`);
  await rmdir(lock);
  return true;
}
export async function stopProfile(config: FoundryLabConfig, id: ProfileId, dependencies: StopDependencies = {}): Promise<void> {
  const profile = profileFor(config, id), pidFile = join(config.evidenceRoot, id, 'server.pid');
  const stored = JSON.parse(await readFile(pidFile, 'utf8')) as { foundry?: unknown; proxy?: unknown };
  const pids = [stored.foundry].map(Number); if (pids.some((pid) => !Number.isInteger(pid) || pid <= 0)) throw new Error('Invalid Foundry pid file');
  for (const pid of pids) {
    const processInfo = (dependencies.queryProcess ?? queryProcess)(pid);
    if (processInfo) {
      if (!isExpectedFoundryProcess(config, id, processInfo.executable, processInfo.commandLine)) throw new Error(`Refusing to stop PID ${pid}: it is not the pinned Foundry lab process`);
      if (dependencies.kill) dependencies.kill(pid);
      else Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'pipe', stderr: 'pipe' });
    }
  }
  for (let i = 0; i < 20; i++) { if (!(await listenerRecords(profile.port)).length) {
    await rm(pidFile, { force: true });
    const pidGone = queryProcess(pids[0]!) === null;
    const staleOptionsLockRemoved = pidGone ? await cleanupStaleOptionsLock(config, id) : false;
    await writeLaunchEvidence(config, id, { stop: { portReleased: true, pidGone, pidFileRemoved: !existsSync(pidFile), staleOptionsLockRemoved } });
    return;
  } await Bun.sleep(100); }
  throw new Error(`Port ${profile.port} did not release`);
}

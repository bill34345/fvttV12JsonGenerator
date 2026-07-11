import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { FoundryLabConfig } from './config';

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
export function isExpectedFoundryProcess(config: FoundryLabConfig, executable: string, commandLine: string): boolean {
  return resolve(executable).toLowerCase() === resolve(config.nodeRoot, 'node.exe').toLowerCase()
    && commandLine.toLowerCase().includes(resolve(config.appRoot, 'main.js').toLowerCase());
}
function queryProcess(pid: number): { executable: string; commandLine: string } | null {
  const query = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue;if($p){$p|Select-Object ExecutablePath,CommandLine|ConvertTo-Json -Compress}`], { stdout: 'pipe', stderr: 'pipe' });
  if (query.exitCode !== 0) throw new Error(`Unable to inspect process PID ${pid}`);
  const output = query.stdout.toString().trim(); if (!output) return null;
  const info = JSON.parse(output) as { ExecutablePath?: unknown; CommandLine?: unknown };
  return typeof info.ExecutablePath === 'string' && typeof info.CommandLine === 'string' ? { executable: info.ExecutablePath, commandLine: info.CommandLine } : null;
}
async function rejectRunningPeer(config: FoundryLabConfig, id: ProfileId): Promise<void> {
  const peer = otherProfileId(id), pidFile = join(config.evidenceRoot, peer, 'server.pid');
  if (!existsSync(pidFile)) return;
  let pid = 0; try { pid = Number((JSON.parse(await readFile(pidFile, 'utf8')) as { foundry?: unknown }).foundry); } catch {}
  const info = Number.isInteger(pid) && pid > 0 ? queryProcess(pid) : null;
  if (info && isExpectedFoundryProcess(config, info.executable, info.commandLine)) throw new Error(`Cannot launch ${id} while ${peer} is running as PID ${pid}`);
  await rm(pidFile, { force: true });
}

export async function launchProfile(config: FoundryLabConfig, id: ProfileId): Promise<{ pid: number; url: string; log: string }> {
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
      const temporary = `${pidFile}.tmp`; await writeFile(temporary, JSON.stringify({ foundry: pid }), 'utf8'); await rename(temporary, pidFile); child.unref();
      return { pid, url: `http://127.0.0.1:${profile.port}/`, log };
    }
  }
  await cleanup(); throw new Error(`Foundry did not listen on port ${profile.port}`);
}
export async function stopProfile(config: FoundryLabConfig, id: ProfileId): Promise<void> {
  const profile = profileFor(config, id), pidFile = join(config.evidenceRoot, id, 'server.pid');
  const stored = JSON.parse(await readFile(pidFile, 'utf8')) as { foundry?: unknown; proxy?: unknown };
  const pids = [stored.foundry].map(Number); if (pids.some((pid) => !Number.isInteger(pid) || pid <= 0)) throw new Error('Invalid Foundry pid file');
  for (const pid of pids) {
    const processInfo = queryProcess(pid);
    if (processInfo) {
      if (!isExpectedFoundryProcess(config, processInfo.executable, processInfo.commandLine)) throw new Error(`Refusing to stop PID ${pid}: it is not the pinned Foundry lab process`);
      Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'pipe', stderr: 'pipe' });
    }
  }
  for (let i = 0; i < 20; i++) { if (!(await listenerRecords(profile.port)).length) { await rm(pidFile, { force: true }); return; } await Bun.sleep(100); }
  throw new Error(`Port ${profile.port} did not release`);
}

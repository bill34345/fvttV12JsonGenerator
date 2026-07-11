import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
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
async function listenerAddresses(port: number): Promise<string[]> {
  const script = `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalAddress) -join [Environment]::NewLine`;
  const result = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`Unable to inspect listener on port ${port}`);
  return result.stdout.toString().trim().split(/\r?\n/).filter(Boolean);
}
const profileFor = (config: FoundryLabConfig, id: ProfileId) => id === 'core-test' ? config.profiles.coreTest : config.profiles.serverMirror;
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

export async function launchProfile(config: FoundryLabConfig, id: ProfileId): Promise<{ pid: number; url: string; log: string }> {
  const profile = profileFor(config, id), built = buildLaunchCommand(config, id);
  const mainScript = built.args[0]; if (!mainScript) throw new Error('Foundry main script argument is required');
  for (const path of [built.command, mainScript, profile.dataPath]) if (!existsSync(path)) throw new Error(`Required launch path does not exist: ${path}`);
  if ((await listenerAddresses(profile.port)).length) throw new Error(`Port ${profile.port} is already in use`);
  const optionsPath = join(profile.dataPath, 'Config', 'options.json');
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(await readFile(optionsPath, 'utf8')) as Record<string, unknown>; } catch {}
  await mkdir(join(profile.dataPath, 'Config'), { recursive: true });
  await writeFile(optionsPath, `${JSON.stringify(buildSafeOptions(existing, profile), null, 2)}\n`, 'utf8');
  const evidence = join(config.evidenceRoot, id); await mkdir(evidence, { recursive: true });
  const log = join(evidence, 'server.log'), pidFile = join(evidence, 'server.pid');
  const handle = await open(log, 'a');
  const preload = join(evidence, 'loopback-preload.cjs'); await writeFile(preload, loopbackPreloadSource(), 'utf8');
  const runtime = buildRuntimeArgs(built.args); const child = spawn(built.command, ['--require', preload, runtime[0]!, ...runtime.slice(1), '--noipdiscovery'], { cwd: config.appRoot, detached: true, windowsHide: true, stdio: ['ignore', handle.fd, handle.fd] }) as ChildProcess;
  child.unref(); await writeFile(pidFile, JSON.stringify({ foundry: child.pid }), 'utf8'); await handle.close();
  for (let attempt = 0; attempt < 40; attempt++) { await Bun.sleep(250); const addresses = await listenerAddresses(profile.port); if (addresses.length) { try { validateListenerAddresses(addresses); } catch (error) { try { process.kill(child.pid!, 'SIGTERM'); } catch {} throw error; } return { pid: child.pid!, url: `http://127.0.0.1:${profile.port}/`, log }; } }
  try { process.kill(child.pid!, 'SIGTERM'); } catch {} throw new Error(`Foundry did not listen on port ${profile.port}`);
}
export async function stopProfile(config: FoundryLabConfig, id: ProfileId): Promise<void> {
  const profile = profileFor(config, id), pidFile = join(config.evidenceRoot, id, 'server.pid');
  const stored = JSON.parse(await readFile(pidFile, 'utf8')) as { foundry?: unknown; proxy?: unknown };
  const pids = [stored.foundry].map(Number); if (pids.some((pid) => !Number.isInteger(pid) || pid <= 0)) throw new Error('Invalid Foundry pid file');
  for (const pid of pids) {
    const query = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue;if($p){$p|Select-Object ExecutablePath,CommandLine|ConvertTo-Json -Compress}`], { stdout: 'pipe', stderr: 'pipe' });
    const output = query.stdout.toString().trim();
    if (output) {
      const processInfo = JSON.parse(output) as { ExecutablePath?: unknown; CommandLine?: unknown };
      if (typeof processInfo.ExecutablePath !== 'string' || typeof processInfo.CommandLine !== 'string' || !isExpectedFoundryProcess(config, processInfo.ExecutablePath, processInfo.CommandLine)) throw new Error(`Refusing to stop PID ${pid}: it is not the pinned Foundry lab process`);
      Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'pipe', stderr: 'pipe' });
    }
  }
  await rm(pidFile, { force: true });
  for (let i = 0; i < 20; i++) { if (!(await listenerAddresses(profile.port)).length) return; await Bun.sleep(100); }
  throw new Error(`Port ${profile.port} did not release`);
}

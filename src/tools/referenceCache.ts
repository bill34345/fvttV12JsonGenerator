import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface ReferenceComponent {
  id: string;
  kind: 'git';
  source: string;
  revision: string;
  target: string;
  license: string;
}

export interface ReferenceManifest {
  schemaVersion: 1;
  generatedAt: string;
  components: ReferenceComponent[];
}

export interface ReferenceCacheStatus {
  id: string;
  target: string;
  status: 'ok' | 'missing' | 'mismatch';
  expectedRevision: string;
  actualRevision?: string;
}

export function loadReferenceManifest(path = resolve('references/reference-cache-manifest.json')): ReferenceManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as ReferenceManifest;
}

export function verifyReferenceCache(manifest: ReferenceManifest, repoRoot = process.cwd()): { ok: boolean; components: ReferenceCacheStatus[] } {
  const components = manifest.components.map((component): ReferenceCacheStatus => {
    const target = resolve(repoRoot, component.target);
    if (!existsSync(target)) {
      return { id: component.id, target, status: 'missing', expectedRevision: component.revision };
    }

    const actualRevision = git(['-C', target, 'rev-parse', 'HEAD'], false);
    if (!actualRevision || actualRevision.toLowerCase() !== component.revision.toLowerCase()) {
      return { id: component.id, target, status: 'mismatch', expectedRevision: component.revision, actualRevision: actualRevision || undefined };
    }
    return { id: component.id, target, status: 'ok', expectedRevision: component.revision, actualRevision };
  });
  return { ok: components.every((component) => component.status === 'ok'), components };
}

export async function bootstrapReferenceCache(
  manifest: ReferenceManifest,
  repoRoot = process.cwd(),
  options: { dryRun?: boolean } = {},
): Promise<{ planned: string[]; installed: string[] }> {
  const planned = manifest.components.map((component) => component.id);
  if (options.dryRun) return { planned, installed: [] };

  const installed: string[] = [];
  for (const component of manifest.components) {
    const target = resolve(repoRoot, component.target);
    const staging = `${target}.staging-${process.pid}-${Date.now()}`;
    const backup = `${target}.backup-${process.pid}-${Date.now()}`;
    mkdirSync(dirname(target), { recursive: true });
    rmSync(staging, { recursive: true, force: true });

    try {
      const cloned = git(['clone', '--no-checkout', component.source, staging], false);
      if (cloned === null) throw new Error(`clone failed for ${component.source}`);
      if (git(['-C', staging, 'checkout', '--detach', component.revision], false) === null) {
        throw new Error(`revision ${component.revision} is unavailable`);
      }
      const actual = git(['-C', staging, 'rev-parse', 'HEAD'], false);
      if (actual?.toLowerCase() !== component.revision.toLowerCase()) {
        throw new Error(`expected ${component.revision}, received ${actual ?? 'unknown'}`);
      }

      const hadTarget = existsSync(target);
      if (hadTarget) renameSync(target, backup);
      try {
        renameSync(staging, target);
        rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
        if (hadTarget && existsSync(backup)) renameSync(backup, target);
        throw error;
      }
      installed.push(component.id);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Reference acquisition failed for ${component.id}: ${message}`);
    }
  }
  return { planned, installed };
}

function git(args: string[], throwOnError: boolean): string | null {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    if (throwOnError) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
    return null;
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const manifest = loadReferenceManifest();
  if (command === 'verify') {
    const result = verifyReferenceCache(manifest);
    for (const component of result.components) console.log(`${component.id}: ${component.status}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'bootstrap') {
    const result = await bootstrapReferenceCache(manifest, process.cwd(), { dryRun });
    console.log(`Planned: ${result.planned.join(', ') || 'none'}`);
    console.log(`Installed: ${result.installed.join(', ') || 'none'}`);
    return;
  }
  throw new Error('Usage: bun run src/tools/referenceCache.ts <bootstrap|verify> [--dry-run]');
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

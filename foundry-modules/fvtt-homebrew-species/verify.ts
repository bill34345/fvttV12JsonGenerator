import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDeterministicZip, MODULE_ID, MODULE_VERSION } from './build';

interface ClassicLevelStore { iterator(): AsyncIterable<[string, unknown]> }
interface ClassicLevelDb { open(): Promise<void>; close(): Promise<void>; sublevel(name: string, options?: Record<string, unknown>): ClassicLevelStore }

export async function verifyHomebrewSpeciesArtifact(distRoot = resolve(import.meta.dir, 'dist')): Promise<{ zipSha256: string; logicalHash: string; counts: { species: number; features: number } }> {
  const moduleRoot = resolve(distRoot, 'module'); const zipPath = resolve(distRoot, `${MODULE_ID}.zip`);
  const verified = await verifyInstalledHomebrewSpeciesModule(moduleRoot);
  const expectedZip = await createDeterministicZip(moduleRoot); const actualZip = await readFile(zipPath);
  if (sha256(expectedZip) !== sha256(actualZip)) throw new Error('Species ZIP does not exactly match the current module tree.');
  return { ...verified, zipSha256: sha256(actualZip) };
}

export async function verifyInstalledHomebrewSpeciesModule(moduleRootValue: string): Promise<{ logicalHash: string; counts: { species: number; features: number } }> {
  const moduleRoot = resolve(moduleRootValue);
  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as any;
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION || manifest.compatibility?.minimum !== '14.364' || manifest.compatibility?.verified !== '14.364' || manifest.compatibility?.maximum !== '14.364') throw new Error('Species module manifest identity or Foundry version is invalid.');
  if (manifest.relationships?.systems?.[0]?.id !== 'dnd5e' || manifest.relationships.systems[0].compatibility?.verified !== '5.3.3') throw new Error('Species module dnd5e compatibility must be exactly 5.3.3.');
  if (manifest.esmodules || manifest.scripts) throw new Error('Content-only Species module must not declare runtime JavaScript.');
  const files = await listFiles(moduleRoot);
  if (files.some((path) => /\.(?:js|ts|mjs|cjs)$/iu.test(path))) throw new Error('Content-only Species artifact contains runtime/compiler code.');
  const identity = JSON.parse(await readFile(resolve(moduleRoot, 'data/identity-manifest.json'), 'utf8')) as any;
  if (identity.moduleId !== MODULE_ID || identity.version !== MODULE_VERSION || identity.target?.foundry !== '14.364' || identity.target?.dnd5e !== '5.3.3' || identity.target?.effectProfile !== 'core') throw new Error('Species identity manifest target is invalid.');
  const temp = await mkdtemp(resolve(tmpdir(), 'verify-homebrew-species-'));
  try {
    await cp(resolve(moduleRoot, 'packs'), resolve(temp, 'packs'), { recursive: true });
    const entry = resolveClassicLevelEntry();
    const species = await readPack(resolve(temp, 'packs/species'), entry); const features = await readPack(resolve(temp, 'packs/features'), entry);
    const speciesIds = species.map((item: any) => item._id).sort(); const featureIds = new Set(features.map((item: any) => item._id));
    if (JSON.stringify(speciesIds) !== JSON.stringify([...identity.packs[0].documentIds].sort()) || features.length !== identity.counts.features) throw new Error('Species LevelDB documents do not match identity coverage.');
    for (const race of species as any[]) for (const advancement of race.system?.advancement ?? []) if (advancement.type === 'ItemGrant') for (const item of advancement.configuration?.items ?? []) { const match = /^Compendium\.fvtt-homebrew-species\.features\.Item\.([a-f0-9]{16})$/u.exec(String(item.uuid)); if (!match || !featureIds.has(match[1]!)) throw new Error(`Dangling Species ItemGrant UUID: ${String(item.uuid)}.`); }
    return { logicalHash: identity.logicalHash, counts: { species: species.length, features: features.length } };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function readPack(path: string, entry: string): Promise<unknown[]> { const imported = await import(pathToFileURL(entry).href) as { ClassicLevel?: new (path: string, options?: Record<string, unknown>) => ClassicLevelDb }; if (!imported.ClassicLevel) throw new Error('classic-level unavailable.'); const db = new imported.ClassicLevel(path, { createIfMissing: false, errorIfExists: false, keyEncoding: 'utf8', valueEncoding: 'json' }); await db.open(); try { const result: unknown[] = []; for await (const [, value] of db.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' }).iterator()) result.push(value); return result; } finally { await db.close(); } }
async function listFiles(root: string): Promise<string[]> { const result: string[] = []; async function visit(dir: string, prefix: string): Promise<void> { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) await visit(path, relative); else if (entry.isFile()) result.push(relative); else throw new Error(`Unsafe artifact entry: ${path}`); } } await visit(root, ''); return result.sort(); }
function resolveClassicLevelEntry(): string { const root = process.env.FVTT_OPS_LAB_ROOT?.trim(); const explicit = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim(); const entry = explicit ? resolve(explicit) : root ? resolve(root, 'app/14.364/node_modules/classic-level/index.js') : ''; if (!entry || !existsSync(entry)) throw new Error('A read-only Foundry 14.364 classic-level entry is required.'); return entry; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }

if (import.meta.main) verifyHomebrewSpeciesArtifact().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDeterministicZip, MODULE_ID, MODULE_VERSION, type SpeciesNextDnd5eRuntimeMaximum } from './build';
import { validateNativeSpeciesPackage, type NativeSpeciesPackage, type SpeciesTargetVersion } from '@fvtt-json-generator/generation/species';

interface ClassicLevelStore { iterator(): AsyncIterable<[string, unknown]> }
interface ClassicLevelDb { open(): Promise<void>; close(): Promise<void>; sublevel(name: string, options?: Record<string, unknown>): ClassicLevelStore }

export async function verifyHomebrewSpeciesArtifact(distRoot = resolve(import.meta.dir, 'dist'), dnd5eRuntimeMaximum: SpeciesNextDnd5eRuntimeMaximum = '6.0.2'): Promise<{ zipSha256: string; logicalHash: string; counts: { species: number; features: number } }> {
  const moduleRoot = resolve(distRoot, 'module'); const zipPath = resolve(distRoot, `${MODULE_ID}.zip`);
  const verified = await verifyInstalledHomebrewSpeciesModule(moduleRoot, dnd5eRuntimeMaximum);
  const expectedZip = await createDeterministicZip(moduleRoot); const actualZip = await readFile(zipPath);
  if (sha256(expectedZip) !== sha256(actualZip)) throw new Error('Species ZIP does not exactly match the current module tree.');
  return { ...verified, zipSha256: sha256(actualZip) };
}

export async function verifyInstalledHomebrewSpeciesModule(moduleRootValue: string, dnd5eRuntimeMaximum: SpeciesNextDnd5eRuntimeMaximum = '6.0.2'): Promise<{ logicalHash: string; counts: { species: number; features: number } }> {
  const moduleRoot = resolve(moduleRootValue);
  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as any;
  const identity = JSON.parse(await readFile(resolve(moduleRoot, 'data/identity-manifest.json'), 'utf8')) as any;
  const fvttVersion: SpeciesTargetVersion = identity.target?.foundry === '12.331' ? '12' : identity.target?.foundry === '14.364' ? '14' : identity.target?.foundry === '14.368' ? '14.368' : fail('Species identity manifest has an unsupported Foundry target.');
  const foundryVersion = fvttVersion === '12' ? '12.331' : fvttVersion === '14.368' ? '14.368' : '14.364';
  const dnd5eVersion = fvttVersion === '12' ? '4.3.9' : fvttVersion === '14.368' ? '6.0.2' : '5.3.3';
  if (!['6.0.2', '6.0.5', '6.0.6'].includes(dnd5eRuntimeMaximum)) throw new Error('Species verifier dnd5e runtime maximum must be 6.0.2, 6.0.5, or 6.0.6.');
  if (fvttVersion !== '14.368' && dnd5eRuntimeMaximum !== '6.0.2') throw new Error('Species dnd5e runtime maximum override is only valid for the ServerNext 14.368 target.');
  const expectedDnd5eMaximum = fvttVersion === '14.368' ? dnd5eRuntimeMaximum : dnd5eVersion;
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION || manifest.compatibility?.minimum !== foundryVersion || manifest.compatibility?.verified !== foundryVersion || manifest.compatibility?.maximum !== foundryVersion) throw new Error('Species module manifest identity or Foundry version is invalid.');
  if (manifest.relationships?.systems?.[0]?.id !== 'dnd5e' || manifest.relationships.systems[0].compatibility?.minimum !== dnd5eVersion || manifest.relationships.systems[0].compatibility?.verified !== dnd5eVersion || manifest.relationships.systems[0].compatibility?.maximum !== expectedDnd5eMaximum) throw new Error(`Species manifest projection identity ${dnd5eVersion} must retain the exact requested runtime maximum ${expectedDnd5eMaximum}.`);
  if (manifest.esmodules || manifest.scripts) throw new Error('Content-only Species module must not declare runtime JavaScript.');
  const files = await listFiles(moduleRoot);
  if (files.some((path) => /\.(?:js|ts|mjs|cjs)$/iu.test(path))) throw new Error('Content-only Species artifact contains runtime/compiler code.');
  if (identity.moduleId !== MODULE_ID || identity.version !== MODULE_VERSION || identity.target?.foundry !== foundryVersion || identity.target?.dnd5e !== dnd5eVersion || identity.target?.effectProfile !== 'core') throw new Error('Species identity manifest target is invalid.');
  if (fvttVersion === '12' && (identity.target?.rules !== '2024' || identity.supportStatus !== 'static-candidate')) throw new Error('V12 Species identity must remain a 2024 static candidate.');
  if (fvttVersion === '14.368' && (identity.target?.rules !== '2024' || identity.supportStatus !== 'static-candidate')) throw new Error('dnd5e 6 Species identity must remain a 2024 static candidate.');
  if (fvttVersion === '14' && identity.supportStatus !== undefined) throw new Error('V14 Species identity must preserve the established runtime-accepted artifact shape.');
  const accepted = JSON.parse(await readFile(resolve(moduleRoot, 'data/accepted-packages.json'), 'utf8')) as NativeSpeciesPackage[];
  if (!Array.isArray(accepted) || !accepted.length || accepted.some((pkg) => !validateNativeSpeciesPackage(pkg, fvttVersion).ok)
    || sha256(new TextEncoder().encode(canonicalJson(accepted.map((pkg) => pkg.logicalHash)))) !== identity.logicalHash) {
    throw new Error('Species accepted packages do not match the exact target or logical hash.');
  }
  const temp = await mkdtemp(resolve(tmpdir(), 'verify-homebrew-species-'));
  try {
    await cp(resolve(moduleRoot, 'packs'), resolve(temp, 'packs'), { recursive: true });
    const entry = resolveClassicLevelEntry(fvttVersion);
    const species = await readPack(resolve(temp, 'packs/species'), entry); const features = await readPack(resolve(temp, 'packs/features'), entry);
    const speciesIds = species.map((item: any) => item._id).sort(); const featureIds = new Set(features.map((item: any) => item._id));
    if (JSON.stringify(speciesIds) !== JSON.stringify([...identity.packs[0].documentIds].sort()) || features.length !== identity.counts.features) throw new Error('Species LevelDB documents do not match identity coverage.');
    for (const race of species as any[]) for (const advancement of race.system?.advancement ?? []) if (advancement.type === 'ItemGrant') for (const item of advancement.configuration?.items ?? []) { const match = /^Compendium\.fvtt-homebrew-species\.features\.Item\.([a-f0-9]{16})$/u.exec(String(item.uuid)); if (!match || !featureIds.has(match[1]!)) throw new Error(`Dangling Species ItemGrant UUID: ${String(item.uuid)}.`); }
    return { logicalHash: identity.logicalHash, counts: { species: species.length, features: features.length } };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function readPack(path: string, entry: string): Promise<unknown[]> { const imported = await import(pathToFileURL(entry).href) as { ClassicLevel?: new (path: string, options?: Record<string, unknown>) => ClassicLevelDb }; if (!imported.ClassicLevel) throw new Error('classic-level unavailable.'); const db = new imported.ClassicLevel(path, { createIfMissing: false, errorIfExists: false, keyEncoding: 'utf8', valueEncoding: 'json' }); await db.open(); try { const result: unknown[] = []; for await (const [, value] of db.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' }).iterator()) result.push(value); return result; } finally { await db.close(); } }
async function listFiles(root: string): Promise<string[]> { const result: string[] = []; async function visit(dir: string, prefix: string): Promise<void> { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name); const relative = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) await visit(path, relative); else if (entry.isFile()) result.push(relative); else throw new Error(`Unsafe artifact entry: ${path}`); } } await visit(root, ''); return result.sort(); }
function resolveClassicLevelEntry(fvttVersion: SpeciesTargetVersion): string { const root = process.env.FVTT_OPS_LAB_ROOT?.trim(); const explicit = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim(); const foundryVersion = fvttVersion === '12' ? '12.331' : fvttVersion === '14.368' ? '14.368' : '14.364'; const entry = explicit ? resolve(explicit) : root ? resolve(root, `app/${foundryVersion}/node_modules/classic-level/index.js`) : ''; const hermeticStaticCandidate = (fvttVersion === '12' || fvttVersion === '14.368') && Boolean(explicit) && entry === resolve(explicit!); if (!entry || !existsSync(entry) || (!hermeticStaticCandidate && !entry.toLowerCase().endsWith(`app\\${foundryVersion}\\node_modules\\classic-level\\index.js`))) throw new Error(`A read-only Foundry ${foundryVersion} classic-level entry${hermeticStaticCandidate ? ' or explicit hermetic candidate entry' : ''} is required.`); return entry; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function fail(message: string): never { throw new Error(message); }

if (import.meta.main) {
  const versionIndex = process.argv.indexOf('--fvtt-version');
  const fvttVersion = versionIndex >= 0 ? process.argv[versionIndex + 1] : '14';
  if (!['12', '14', '14.368'].includes(fvttVersion ?? '')) throw new Error('Species module verify --fvtt-version must be 12, 14, or 14.368.');
  const maximumIndex = process.argv.indexOf('--dnd5e-runtime-maximum');
  const dnd5eRuntimeMaximum = maximumIndex >= 0 ? process.argv[maximumIndex + 1] : '6.0.2';
  if (!['6.0.2', '6.0.5', '6.0.6'].includes(dnd5eRuntimeMaximum ?? '')) throw new Error('Species module verify --dnd5e-runtime-maximum must be 6.0.2, 6.0.5, or 6.0.6.');
  const distRoot = resolve(import.meta.dir, fvttVersion === '12' ? 'dist/v12-candidate' : fvttVersion === '14.368' ? 'dist/v14-368-candidate' : 'dist');
  verifyHomebrewSpeciesArtifact(distRoot, dnd5eRuntimeMaximum as SpeciesNextDnd5eRuntimeMaximum).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

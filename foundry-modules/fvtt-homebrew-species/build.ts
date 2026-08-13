import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { compileSpeciesMarkdownV14, validateNativeSpeciesPackage, type NativeSpeciesPackage } from '@fvtt-json-generator/generation/species-v14';

export const MODULE_ID = 'fvtt-homebrew-species' as const;
export const MODULE_VERSION = '1.0.0' as const;

interface SpeciesAcceptedLedger {
  schemaVersion: 1;
  moduleId: typeof MODULE_ID;
  entries: Array<{
    identifier: string;
    markdownPath: string;
    packagePath: string;
    markdownSha256: string;
    sourceSha256: string;
    irRevision: number;
    logicalHash: string;
    acceptedRunId: string;
    resumedFromRunId?: string;
    decisionsSha256?: string;
  }>;
}

interface ClassicLevelStore { put(key: string, value: unknown): Promise<void>; iterator(): AsyncIterable<[string, unknown]> }
interface ClassicLevelDb extends ClassicLevelStore { open(): Promise<void>; close(): Promise<void>; sublevel(name: string, options?: Record<string, unknown>): ClassicLevelStore }
interface ClassicLevelModule { ClassicLevel?: new (path: string, options?: Record<string, unknown>) => ClassicLevelDb }

export interface SpeciesBuildOptions { vaultPath?: string; ledgerPath?: string; distRoot?: string; temporaryParent?: string; publish?: boolean; classicLevelEntry?: string }
export interface SpeciesBuildResult { distRoot: string; moduleRoot: string; zipPath: string; zipSha256: string; logicalHash: string; counts: { species: number; features: number }; uuids: string[] }

export async function buildHomebrewSpeciesModule(options: SpeciesBuildOptions = {}): Promise<SpeciesBuildResult> {
  const vault = resolve(options.vaultPath ?? 'obsidian/dnd数据转fvttjson');
  const ledgerPath = resolve(options.ledgerPath ?? resolve(vault, 'output/species/accepted-ledger.json'));
  const packages = await loadAcceptedPackages(vault, ledgerPath);
  const logicalHash = sha256(canonicalJson(packages.map((pkg) => pkg.logicalHash)));
  const classicLevelEntry = resolveClassicLevelEntry(options.classicLevelEntry);
  const temporaryRoot = await mkdtemp(resolve(options.temporaryParent ?? tmpdir(), 'fvtt-homebrew-species-'));
  try {
    const first = await writeCandidate(resolve(temporaryRoot, 'candidate-a'), packages, logicalHash, classicLevelEntry);
    const second = await writeCandidate(resolve(temporaryRoot, 'candidate-b'), packages, logicalHash, classicLevelEntry);
    const firstHash = await hashTree(first.moduleRoot); const secondHash = await hashTree(second.moduleRoot);
    if (canonicalJson(firstHash) !== canonicalJson(secondHash) || first.zipSha256 !== second.zipSha256) throw new Error('Species module clean builds are not deterministic.');
    const distRoot = resolve(options.distRoot ?? resolve(import.meta.dir, 'dist'));
    if (options.publish !== false) {
      const next = `${distRoot}.next-${process.pid}`;
      await rm(next, { recursive: true, force: true });
      await mkdir(next, { recursive: true });
      await copyTree(first.root, next);
      const old = `${distRoot}.old-${process.pid}`;
      await rm(old, { recursive: true, force: true });
      if (existsSync(distRoot)) await rename(distRoot, old);
      await rename(next, distRoot);
      await rm(old, { recursive: true, force: true });
    }
    const finalRoot = options.publish === false ? first.root : distRoot;
    return { distRoot: finalRoot, moduleRoot: resolve(finalRoot, 'module'), zipPath: resolve(finalRoot, `${MODULE_ID}.zip`), zipSha256: first.zipSha256, logicalHash, counts: { species: packages.length, features: packages.reduce((sum, pkg) => sum + pkg.features.length, 0) }, uuids: moduleUuids(packages) };
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
}

export async function loadAcceptedPackages(vault: string, ledgerPath: string): Promise<NativeSpeciesPackage[]> {
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as SpeciesAcceptedLedger;
  if (ledger.schemaVersion !== 1 || ledger.moduleId !== MODULE_ID || !Array.isArray(ledger.entries) || !ledger.entries.length) throw new Error('Species module build requires a non-empty accepted ledger.');
  const identifiers = new Set<string>(); const packages: NativeSpeciesPackage[] = [];
  for (const entry of [...ledger.entries].sort((a, b) => a.identifier.localeCompare(b.identifier, 'en'))) {
    if (identifiers.has(entry.identifier)) throw new Error(`Duplicate accepted Species identifier: ${entry.identifier}.`); identifiers.add(entry.identifier);
    const markdownPath = safeLedgerPath(vault, entry.markdownPath);
    const packagePath = safeLedgerPath(vault, entry.packagePath);
    const markdown = await readFile(markdownPath, 'utf8');
    if (sha256(markdown) !== entry.markdownSha256) throw new Error(`Accepted Species Markdown is stale: ${entry.identifier}. Re-run --intake-species.`);
    const pkg = compileSpeciesMarkdownV14(markdown);
    const validation = validateNativeSpeciesPackage(pkg);
    if (!validation.ok) throw new Error(`Species package validation failed for ${entry.identifier}: ${validation.findings.map((finding) => finding.code).join(', ')}.`);
    if (pkg.sourceSha256 !== entry.sourceSha256 || pkg.logicalHash !== entry.logicalHash || pkg.markdownSha256 !== entry.markdownSha256) throw new Error(`Accepted ledger hashes do not match current projection for ${entry.identifier}.`);
    if (!existsSync(packagePath)) throw new Error(`Accepted audit package is missing: ${entry.packagePath}.`);
    const stored = JSON.parse(await readFile(packagePath, 'utf8')) as NativeSpeciesPackage;
    if (stored.logicalHash !== pkg.logicalHash || canonicalJson(stored.species) !== canonicalJson(pkg.species) || canonicalJson(stored.features) !== canonicalJson(pkg.features)) throw new Error(`Accepted audit package drifted from Markdown projection for ${entry.identifier}.`);
    packages.push(pkg);
  }
  return packages;
}

async function writeCandidate(root: string, packages: NativeSpeciesPackage[], logicalHash: string, classicLevelEntry: string): Promise<{ root: string; moduleRoot: string; zipPath: string; zipSha256: string }> {
  const moduleRoot = resolve(root, 'module'); await mkdir(resolve(moduleRoot, 'packs'), { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(import.meta.dir, 'src/module.json'), 'utf8'));
  await writeCanonicalJson(resolve(moduleRoot, 'module.json'), manifest);
  const species = packages.map((pkg) => pkg.species); const features = packages.flatMap((pkg) => pkg.features);
  await writeLevelDbPack(resolve(moduleRoot, 'packs/species'), species, classicLevelEntry);
  await writeLevelDbPack(resolve(moduleRoot, 'packs/features'), features, classicLevelEntry);
  const identity = { schemaVersion: 1, moduleId: MODULE_ID, version: MODULE_VERSION, target: { foundry: '14.364', dnd5e: '5.3.3', effectProfile: 'core' }, logicalHash, counts: { species: species.length, features: features.length }, packs: [{ name: 'species', documentIds: species.map((item) => item._id), uuids: species.map((item) => uuid('species', item._id)) }, { name: 'features', documentIds: features.map((item) => item._id), uuids: features.map((item) => uuid('features', item._id)) }] };
  await mkdir(resolve(moduleRoot, 'data'), { recursive: true });
  await writeCanonicalJson(resolve(moduleRoot, 'data/identity-manifest.json'), identity);
  await writeCanonicalJson(resolve(moduleRoot, 'data/accepted-packages.json'), packages);
  await writeCanonicalJson(resolve(moduleRoot, 'data/coverage-ledger.json'), packages.flatMap((pkg) => pkg.coverageLedger.map((entry) => ({ species: pkg.species.system.identifier, ...entry }))));
  const zipPath = resolve(root, `${MODULE_ID}.zip`); const zip = await createDeterministicZip(moduleRoot); await writeFile(zipPath, zip);
  return { root, moduleRoot, zipPath, zipSha256: sha256(zip) };
}

async function writeLevelDbPack(path: string, documents: Record<string, any>[], entry: string): Promise<void> {
  const imported = await import(pathToFileURL(entry).href) as ClassicLevelModule;
  if (!imported.ClassicLevel) throw new Error('Configured Foundry classic-level entry has no ClassicLevel export.');
  const db = new imported.ClassicLevel(path, { createIfMissing: true, errorIfExists: true, keyEncoding: 'utf8', valueEncoding: 'json' });
  await db.open();
  try {
    const items = db.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' });
    const effects = db.sublevel('items.effects', { keyEncoding: 'utf8', valueEncoding: 'json' });
    for (const document of [...documents].sort((a, b) => a._id.localeCompare(b._id, 'en'))) {
      const projectedEffects = Array.isArray(document.effects) ? document.effects : [];
      for (const effect of projectedEffects) await effects.put(`${document._id}.${effect._id}`, effect);
      await items.put(document._id, { ...document, effects: projectedEffects.map((effect: any) => effect._id) });
    }
  } finally { await db.close(); }
  for (const file of await readdir(path)) if (/^(?:LOG|LOCK)/iu.test(file)) await unlink(resolve(path, file));
}

function resolveClassicLevelEntry(explicit?: string): string {
  const labRoot = process.env.FVTT_OPS_LAB_ROOT?.trim();
  const testEntry = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim();
  const entry = resolve(explicit ?? testEntry ?? (labRoot ? resolve(labRoot, 'app/14.364/node_modules/classic-level/index.js') : ''));
  if (!isAbsolute(entry) || !entry.toLowerCase().endsWith('app\\14.364\\node_modules\\classic-level\\index.js') || !existsSync(entry)) throw new Error('Species build requires the read-only Foundry 14.364 classic-level entry via FVTT_OPS_LAB_ROOT or an explicit option.');
  return entry;
}
function safeLedgerPath(vault: string, value: string): string { if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error('Species ledger paths must be relative to the vault.'); const path = resolve(vault, value); const rel = relative(vault, path); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Species ledger path escapes the vault.'); return path; }
function moduleUuids(packages: NativeSpeciesPackage[]): string[] { return packages.flatMap((pkg) => [uuid('species', pkg.species._id), ...pkg.features.map((item) => uuid('features', item._id))]).sort(); }
function uuid(pack: string, id: string): string { return `Compendium.${MODULE_ID}.${pack}.Item.${id}`; }

async function hashTree(root: string): Promise<Array<{ path: string; size: number; sha256: string }>> { const result: Array<{ path: string; size: number; sha256: string }> = []; async function visit(dir: string): Promise<void> { for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) { const path = resolve(dir, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.isFile()) { const bytes = await readFile(path); result.push({ path: relative(root, path).replace(/\\/gu, '/'), size: bytes.byteLength, sha256: sha256(bytes) }); } else throw new Error(`Species artifact contains an unsafe entry: ${path}`); } } await visit(root); return result.sort((a, b) => a.path.localeCompare(b.path, 'en')); }
async function copyTree(source: string, target: string): Promise<void> { for (const entry of await readdir(source, { withFileTypes: true })) { const from = resolve(source, entry.name); const to = resolve(target, entry.name); if (entry.isDirectory()) { await mkdir(to, { recursive: true }); await copyTree(from, to); } else if (entry.isFile()) await writeFile(to, await readFile(from)); else throw new Error(`Cannot publish unsafe artifact entry: ${from}`); } }
async function writeCanonicalJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(canonicalize(value), null, 2)}\n`, 'utf8'); }
function canonicalize(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalize); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => [key, canonicalize(entry)])); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }
function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }

export async function createDeterministicZip(root: string): Promise<Uint8Array> {
  const files = await hashTree(root); const localRecords: Uint8Array[] = []; const centralRecords: Uint8Array[] = []; let offset = 0;
  for (const file of files) { const name = new TextEncoder().encode(file.path); const data = await readFile(resolve(root, ...file.path.split('/'))); const crc = crc32(data); const local = concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(name.byteLength), u16(0), name, data]); const central = concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]); localRecords.push(local); centralRecords.push(central); offset += local.byteLength; }
  const local = concat(localRecords); const central = concat(centralRecords); const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.byteLength), u32(local.byteLength), u16(0)]); return concat([local, central, end]);
}
function u16(value: number): Uint8Array { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value: number): Uint8Array { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); return bytes; }
function concat(parts: Uint8Array[]): Uint8Array { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let index = 0; index < 256; index += 1) { let value = index; for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; table[index] = value >>> 0; } return table; })();
function crc32(bytes: Uint8Array): number { let value = 0xffffffff; for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }

if (import.meta.main) buildHomebrewSpeciesModule().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  BLOOD_HUNTER_V14_TARGET,
  EXPECTED_BLOOD_HUNTER_SOURCE_SHA256,
  compileBloodHunterV14Package,
  planNativeBloodHunterMigration,
  validateNativeBloodHunterPackage,
  type NativeBloodHunterPackage,
  type NativeItemSource,
} from '../../packages/blood-hunter-v14/src/index.ts';
import {
  assertExactRepoPath,
  assertInsideRoot,
  assertNoReparsePathComponents,
  createLabConfig,
  type BloodHunterLabConfig,
} from './labConfig.ts';

export const MODULE_ID = 'fvtt-blood-hunter-2024' as const;
export const MODULE_VERSION = '1.0.0' as const;
export const EXPECTED_ACTIVITY_COUNT = 117;
export const EXPECTED_LEDGER_COUNT = 94;
export const EXPECTED_EFFECT_CHANGE_COUNT = 72;

export const EXPECTED_DND5E_EXTERNAL_UUIDS = [
  'Compendium.dnd5e.equipment24.Item.phbarmScaleMail0',
  'Compendium.dnd5e.equipment24.Item.phbwepShortsword',
  'Compendium.dnd5e.equipment24.Item.phbwepLightCross',
  'Compendium.dnd5e.equipment24.Item.phbamoBolts00000',
  'Compendium.dnd5e.equipment24.Item.phbagCaseCrossbo',
  'Compendium.dnd5e.equipment24.Item.phbtulAlchemists',
  'Compendium.dnd5e.equipment24.Item.phbagExplorersPa',
  'Compendium.dnd5e.feats24.Item.phbBoonofTruesig',
  'Compendium.dnd5e.feats24.Item.phbfstArchery000',
  'Compendium.dnd5e.feats24.Item.phbfstDefense000',
  'Compendium.dnd5e.feats24.Item.phbfstGreatWeapo',
  'Compendium.dnd5e.feats24.Item.phbfstTwoWeaponF',
] as const;

// The list is a release contract, not a compiler implementation. Build still
// discovers UUIDs recursively from the compiler result and compares both sets.
const EXPECTED_EXTERNAL_UUIDS = new Set<string>(EXPECTED_DND5E_EXTERNAL_UUIDS);

const EXTERNAL_UUID_PATTERN = /Compendium\.dnd5e\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}/g;
const PACK_NAMES = ['classes', 'subclasses', 'features'] as const;
const ITEM_SUBLEVEL = 'items' as const;
const ITEM_EFFECT_SUBLEVEL = 'items.effects' as const;

const ACTIVE_EFFECT_TYPES = ['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override'] as const;

interface ClassicLevelStore {
  put(key: string, value: unknown): Promise<void>;
  get(key: string): Promise<unknown>;
  iterator(): AsyncIterable<[string, unknown]>;
}

interface ClassicLevelDatabase extends ClassicLevelStore {
  open(): Promise<void>;
  close(): Promise<void>;
  sublevel(name: string, options?: Record<string, unknown>): ClassicLevelStore;
}

interface ClassicLevelModule {
  ClassicLevel?: new (path: string, options?: Record<string, unknown>) => ClassicLevelDatabase;
}

export interface BuildOptions {
  sourcePath: string;
  config?: BloodHunterLabConfig;
  publish?: boolean;
  temporaryParent?: string;
  keepTemporary?: boolean;
}

export interface BuildResult {
  distRoot: string;
  moduleRoot: string;
  zipPath: string;
  zipSha256: string;
  logicalHash: string;
  sourceSha256: string;
  counts: { classes: number; subclasses: number; features: number; ledger: number; activities: number };
  externalDnd5eUuids: string[];
  identityManifestPath: string;
  temporaryRoot?: string;
}

export interface ModuleInspection {
  root: string;
  hash: string;
  files: Array<{ path: string; size: number; sha256: string }>;
  manifest: Record<string, unknown>;
  identity: Record<string, unknown>;
  packs: Record<string, Array<Record<string, unknown>>>;
}

export async function buildBloodHunterModule(options: BuildOptions): Promise<BuildResult> {
  const config = options.config ?? createLabConfig();
  const sourcePath = resolve(options.sourcePath);
  if (!isAbsolute(options.sourcePath)) throw new Error('--source must be an absolute JSON file path.');
  const raw = await readFile(sourcePath);
  const first = compileNative(raw);
  const second = compileNative(raw);
  assertNativePackage(first);
  assertNativePackage(second);
  assertRepeatableCompilerOutput(first, second);
  const externalDnd5eUuids = await assertExternalReferenceCompleteness(first, config);
  const temporaryRoot = await mkdtemp(resolve(options.temporaryParent ?? tmpdir(), 'fvtt-blood-hunter-2024-'));
  try {
    const candidateA = resolve(temporaryRoot, 'candidate-a');
    const candidateB = resolve(temporaryRoot, 'candidate-b');
    const firstCandidate = await writeCandidate(candidateA, first, config, externalDnd5eUuids);
    const secondCandidate = await writeCandidate(candidateB, second, config, externalDnd5eUuids);
    const inspectedA = await inspectModuleTree(firstCandidate.moduleRoot, config, true);
    const inspectedB = await inspectModuleTree(secondCandidate.moduleRoot, config, true);
    assertDeterministicArtifacts(inspectedA, inspectedB, first, second);
    if (firstCandidate.zipSha256 !== secondCandidate.zipSha256) throw new Error('Two build candidates do not have the same deterministic ZIP archive.');
    if (options.publish !== false) await publishDist(config, candidateA);
    const distRoot = resolve(config.moduleRoot, 'dist');
    const moduleRoot = resolve(distRoot, 'module');
    const zipPath = resolve(distRoot, `${MODULE_ID}.zip`);
    const result: BuildResult = {
      distRoot,
      moduleRoot,
      zipPath,
      zipSha256: firstCandidate.zipSha256,
      logicalHash: first.logicalHash,
      sourceSha256: first.sourceSha256 ?? EXPECTED_BLOOD_HUNTER_SOURCE_SHA256,
      counts: {
        classes: first.classes.length,
        subclasses: first.subclasses.length,
        features: first.features.length,
        ledger: first.coverageLedger.length,
        activities: countActivities(first),
      },
      externalDnd5eUuids,
      identityManifestPath: resolve(moduleRoot, 'data/identity-manifest.json'),
      ...(options.keepTemporary ? { temporaryRoot } : {}),
    };
    if (options.publish !== false) {
      const published = await inspectModuleTree(moduleRoot, config, true);
      const publishedIdentity = await readJson(resolve(moduleRoot, 'data/identity-manifest.json'));
      if (published.hash !== inspectedA.hash || publishedIdentity.logicalHash !== first.logicalHash) throw new Error('Published Blood Hunter module differs from the validated deterministic candidate.');
      const publishedZipHash = await sha256File(zipPath);
      if (publishedZipHash !== firstCandidate.zipSha256) throw new Error('Published Blood Hunter ZIP differs from the validated candidate.');
      await assertZipMatchesModule(zipPath, moduleRoot);
    }
    return result;
  } finally {
    if (!options.keepTemporary) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function compileNative(raw: Uint8Array): NativeBloodHunterPackage {
  return compileBloodHunterV14Package({ source: raw, target: BLOOD_HUNTER_V14_TARGET });
}

export function assertNativePackage(pkg: NativeBloodHunterPackage): void {
  const validation = validateNativeBloodHunterPackage(pkg);
  if (!validation.ok) throw new Error(`Blood Hunter compiler validator rejected the package: ${validation.findings.map((finding) => `${finding.code}@${finding.path}`).join(', ')}`);
  if (pkg.moduleId !== MODULE_ID || pkg.version !== MODULE_VERSION) throw new Error('Blood Hunter package module identity is not the exact release identity.');
  if (pkg.target.foundry !== '14.364' || pkg.target.dnd5e !== '5.3.3' || pkg.target.effectProfile !== 'modded-v14') throw new Error('Blood Hunter package target is not Foundry 14.364 / dnd5e 5.3.3 / modded-v14.');
  if (pkg.classes.length !== 1 || pkg.subclasses.length !== 4 || pkg.features.length !== 76) throw new Error('Blood Hunter package document counts drifted from the module release contract.');
  if (pkg.coverageLedger.length !== EXPECTED_LEDGER_COUNT) throw new Error(`Blood Hunter coverage ledger must contain ${EXPECTED_LEDGER_COUNT} entries.`);
  if (countActivities(pkg) !== EXPECTED_ACTIVITY_COUNT) throw new Error(`Blood Hunter compiler output must contain ${EXPECTED_ACTIVITY_COUNT} Activities.`);
  const effectChanges = countAndValidateEffectChanges(pkg);
  if (effectChanges !== EXPECTED_EFFECT_CHANGE_COUNT) throw new Error(`Blood Hunter compiler output must contain ${EXPECTED_EFFECT_CHANGE_COUNT} numeric Effect changes.`);
  if (pkg.sourceSha256 !== undefined && pkg.sourceSha256 !== EXPECTED_BLOOD_HUNTER_SOURCE_SHA256) throw new Error('Blood Hunter source SHA-256 is not the locked byte identity.');
}

export function collectExternalDnd5eUuids(value: unknown): string[] {
  const found = new Set<string>();
  function visit(candidate: unknown): void {
    if (typeof candidate === 'string') {
      for (const match of candidate.matchAll(EXTERNAL_UUID_PATTERN)) found.add(match[0]);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    if (candidate && typeof candidate === 'object') {
      for (const entry of Object.values(candidate as Record<string, unknown>)) visit(entry);
    }
  }
  visit(value);
  return [...found].sort((left, right) => left.localeCompare(right, 'en'));
}

export async function assertExternalReferenceCompleteness(pkg: NativeBloodHunterPackage, config: BloodHunterLabConfig): Promise<string[]> {
  const actual = collectExternalDnd5eUuids(pkg);
  if (actual.length !== EXPECTED_EXTERNAL_UUIDS.size) throw new Error(`Expected ${EXPECTED_EXTERNAL_UUIDS.size} recursive dnd5e external Item UUIDs, found ${actual.length}.`);
  const missing = [...EXPECTED_EXTERNAL_UUIDS].filter((uuid) => !actual.includes(uuid));
  const unexpected = actual.filter((uuid) => !EXPECTED_EXTERNAL_UUIDS.has(uuid));
  if (missing.length > 0 || unexpected.length > 0) throw new Error(`Recursive dnd5e external UUID set mismatch. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`);
  const referenceRoot = resolve(config.referenceCacheRoot, 'dnd5e/5.3.3/repo/packs/_source');
  const referenceIds = await collectReferenceDocumentIds(referenceRoot);
  const absentFromReference = actual.filter((uuid) => !referenceIds.has(uuid.split('.').at(-1)!));
  if (absentFromReference.length > 0) throw new Error(`dnd5e reference cache is missing external Item UUIDs: ${absentFromReference.join(', ')}`);
  return actual;
}

async function collectReferenceDocumentIds(root: string): Promise<Set<string>> {
  const stats = await lstat(root).catch(() => undefined);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) throw new Error(`Locked dnd5e 5.3.3 reference cache is missing or unsafe: ${root}`);
  assertNoReparsePathComponents(parse(root).root, root, 'dnd5e reference cache');
  const ids = new Set<string>();
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const entryStats = await lstat(path);
      if (entryStats.isSymbolicLink()) throw new Error(`Reference cache contains a symlink or junction: ${path}`);
      if (entryStats.isDirectory()) await visit(path);
      else if (entryStats.isFile()) {
        const lowerName = entry.name.toLocaleLowerCase('en');
        if (lowerName.endsWith('.json')) {
          try {
            const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
            collectDocumentIds(parsed, ids);
          } catch (error) {
            throw new Error(`Reference cache JSON is invalid: ${path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (lowerName.endsWith('.yml') || lowerName.endsWith('.yaml')) {
          const text = await readFile(path, 'utf8');
          for (const match of text.matchAll(/^\s*_id:\s*["']?([A-Za-z0-9_-]{16})["']?\s*$/gm)) ids.add(match[1]!);
        }
      }
    }
  }
  await visit(root);
  return ids;
}

function collectDocumentIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectDocumentIds(entry, ids);
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record._id === 'string') ids.add(record._id);
    for (const entry of Object.values(record)) collectDocumentIds(entry, ids);
  }
}

function assertRepeatableCompilerOutput(first: NativeBloodHunterPackage, second: NativeBloodHunterPackage): void {
  if (canonicalJson(first) !== canonicalJson(second)) throw new Error('Two compiler calls over identical raw bytes produced different canonical packages.');
}

function countActivities(pkg: NativeBloodHunterPackage): number {
  return [...pkg.classes, ...pkg.subclasses, ...pkg.features].reduce((total, item) => total + Object.keys(asRecord(asRecord(item.system).activities)).length, 0);
}

function countAndValidateEffectChanges(pkg: NativeBloodHunterPackage): number {
  return [...pkg.classes, ...pkg.subclasses, ...pkg.features].reduce((total, item) => total + validateEffects(item.effects, `document/${item._id}`), 0);
}

function validateEffects(effects: unknown, path: string): number {
  let count = 0;
  for (const [effectIndex, effectValue] of asArray(effects).entries()) {
    const effect = asRecord(effectValue);
    for (const [changeIndex, changeValue] of asArray(effect.changes).entries()) {
      const change = asRecord(changeValue);
      if (!Number.isInteger(change.mode) || Number(change.mode) < 0 || Number(change.mode) > 5) {
        throw new Error(`${path}/effects/${effectIndex}/changes/${changeIndex}/mode must be numeric 0..5.`);
      }
      count += 1;
    }
  }
  return count;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

interface CandidateResult {
  root: string;
  moduleRoot: string;
  zipPath: string;
  zipSha256: string;
}

async function writeCandidate(root: string, pkg: NativeBloodHunterPackage, config: BloodHunterLabConfig, externalDnd5eUuids: string[]): Promise<CandidateResult> {
  const moduleRoot = resolve(root, 'module');
  await mkdir(moduleRoot, { recursive: true });
  const sourceManifest = resolve(config.moduleRoot, 'src/module.json');
  await cp(sourceManifest, resolve(moduleRoot, 'module.json'), { force: false, errorOnExist: true });
  await mkdir(resolve(moduleRoot, 'scripts'), { recursive: true });
  const bundle = await Bun.build({
    entrypoints: [resolve(config.moduleRoot, 'src/index.ts')],
    outdir: resolve(moduleRoot, 'scripts'),
    target: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
    naming: 'index.js',
  });
  if (!bundle.success) throw new Error(`Blood Hunter browser bundle failed: ${bundle.logs.map((log) => log.message).join('; ')}`);
  const browserEntry = resolve(moduleRoot, 'scripts/index.js');
  const browserText = await readFile(browserEntry, 'utf8');
  assertBrowserBundleSafe(browserText);
  await mkdir(resolve(moduleRoot, 'styles'), { recursive: true });
  await cp(resolve(config.moduleRoot, 'src/styles/migration.css'), resolve(moduleRoot, 'styles/migration.css'), { force: false, errorOnExist: true });

  for (const [packName, documents] of [['classes', pkg.classes], ['subclasses', pkg.subclasses], ['features', pkg.features] ] as const) {
    await writeLevelDbPack(resolve(moduleRoot, 'packs', packName), documents, config);
  }
  const documents = [...pkg.classes, ...pkg.subclasses, ...pkg.features].sort((left, right) => left._id.localeCompare(right._id, 'en'));
  const emptyMigrationPlan = planNativeBloodHunterMigration(pkg, []);
  const fixedGrantDocumentIds = [...new Set(pkg.grantGraph.filter((node) => node.type === 'ItemGrant').flatMap((node) => node.references.map((reference) => reference.targetDocumentId)))].sort();
  const rootDocumentIds = documents.filter((document) => document.type === 'class' || document.type === 'subclass').map((document) => document._id).sort();
  const identity = {
    schemaVersion: 1,
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    target: pkg.target,
    sourceSha256: pkg.sourceSha256 ?? EXPECTED_BLOOD_HUNTER_SOURCE_SHA256,
    logicalHash: pkg.logicalHash,
    counts: { classes: pkg.classes.length, subclasses: pkg.subclasses.length, features: pkg.features.length, ledger: pkg.coverageLedger.length, activities: countActivities(pkg) },
    packs: [
      { name: 'classes', type: 'Item', documentIds: pkg.classes.map((item) => item._id), uuids: pkg.classes.map((item) => moduleUuid('classes', item._id)) },
      { name: 'subclasses', type: 'Item', documentIds: pkg.subclasses.map((item) => item._id), uuids: pkg.subclasses.map((item) => moduleUuid('subclasses', item._id)) },
      { name: 'features', type: 'Item', documentIds: pkg.features.map((item) => item._id), uuids: pkg.features.map((item) => moduleUuid('features', item._id)) },
    ],
    documents: documents.map((item) => ({ pack: packForItem(pkg, item), id: item._id, uuid: moduleUuid(packForItem(pkg, item), item._id), name: item.name, type: item.type })),
    externalDnd5eUuids,
    externalReferenceContracts: pkg.externalReferences,
    activityCount: countActivities(pkg),
  };
  const migrationContract = {
    schemaVersion: 1,
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    target: pkg.target,
    logicalHash: pkg.logicalHash,
    documents,
    fixedGrantDocumentIds,
    rootDocumentIds,
    mergePolicy: emptyMigrationPlan.mergePolicy,
    externalDnd5eUuids,
    activityCount: countActivities(pkg),
  };
  const review = buildReview(pkg);
  await mkdir(resolve(moduleRoot, 'data'), { recursive: true });
  await writeJson(resolve(moduleRoot, 'data/canonical-package.json'), pkg);
  await writeJson(resolve(moduleRoot, 'data/migration-contract.json'), migrationContract);
  await writeJson(resolve(moduleRoot, 'data/identity-manifest.json'), identity);
  await writeJson(resolve(moduleRoot, 'data/coverage-ledger.json'), pkg.coverageLedger);
  await writeJson(resolve(moduleRoot, 'data/review.json'), review);
  await writeJson(resolve(moduleRoot, 'data/owned-marker.json'), { schemaVersion: 1, owned: true, moduleId: MODULE_ID, version: MODULE_VERSION, logicalHash: pkg.logicalHash });
  await writeJson(resolve(root, 'identity-manifest.json'), identity);
  await writeJson(resolve(root, 'migration-contract.json'), migrationContract);
  await writeJson(resolve(root, 'coverage-ledger.json'), pkg.coverageLedger);
  await writeJson(resolve(root, 'review.json'), review);

  const zipPath = resolve(root, `${MODULE_ID}.zip`);
  const zipBytes = await createDeterministicZip(moduleRoot);
  await writeFile(zipPath, zipBytes);
  const zipSha256 = sha256Bytes(zipBytes);
  await assertZipMatchesModule(zipPath, moduleRoot);
  await writeJson(resolve(root, 'build-ledger.json'), {
    schemaVersion: 1,
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    sourceSha256: identity.sourceSha256,
    logicalHash: identity.logicalHash,
    zipSha256,
    counts: identity.counts,
    externalDnd5eUuids,
    files: (await hashTree(moduleRoot)).map((entry) => ({ path: entry.path, size: entry.size, sha256: entry.sha256 })),
  });
  return { root, moduleRoot, zipPath, zipSha256 };
}

function buildReview(pkg: NativeBloodHunterPackage): Record<string, unknown> {
  const statuses = { pass: 0, adjusted: 0, assisted: 0 };
  for (const entry of pkg.coverageLedger) statuses[entry.review.status] += 1;
  return {
    schemaVersion: 1,
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    logicalHash: pkg.logicalHash,
    statusCounts: statuses,
    total: pkg.coverageLedger.length,
    entries: pkg.coverageLedger.map((entry) => ({ sourceKey: entry.sourceKey, automation: entry.automation, status: entry.review.status, notes: entry.review.notes, boundary: entry.unautomatedBoundary })),
  };
}

function packForItem(pkg: NativeBloodHunterPackage, item: NativeItemSource): string {
  if (pkg.classes.some((candidate) => candidate._id === item._id)) return 'classes';
  if (pkg.subclasses.some((candidate) => candidate._id === item._id)) return 'subclasses';
  return 'features';
}

export function moduleUuid(pack: string, id: string): string {
  return `Compendium.${MODULE_ID}.${pack}.Item.${id}`;
}

export async function writeLevelDbPack(path: string, documents: readonly NativeItemSource[], config: BloodHunterLabConfig): Promise<void> {
  const ClassicLevel = await loadClassicLevel(config.classicLevelEntry);
  await mkdir(dirname(path), { recursive: true });
  const database = new ClassicLevel(path, { createIfMissing: true, errorIfExists: true, keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  try {
    const sorted = [...documents].sort((left, right) => left._id.localeCompare(right._id, 'en'));
    // Foundry 14.364 reads Item packs from the Item document collection
    // sublevel. A root-level document (or legacy !index pseudo-index) is
    // invisible to the runtime Compendium index.
    const items = database.sublevel(ITEM_SUBLEVEL, { keyEncoding: 'utf8', valueEncoding: 'json' });
    const embeddedEffects = database.sublevel(ITEM_EFFECT_SUBLEVEL, { keyEncoding: 'utf8', valueEncoding: 'json' });
    for (const document of sorted) {
      const effects = document.effects.map((effect) => projectEffectForFoundryV14Pack(effect));
      const item = {
        ...document,
        // Foundry 14 stores embedded collections as parent IDs plus records in
        // a dedicated sublevel. Writing effect objects directly here causes
        // the server-side DataModel migration to discard them on startup.
        effects: effects.map((effect) => String(effect._id)),
      };
      for (const effect of effects) await embeddedEffects.put(`${document._id}.${String(effect._id)}`, effect);
      await items.put(document._id, item);
    }
  } finally {
    await database.close();
  }
  await removeLevelDbLogs(path);
}

async function loadClassicLevel(entry: string): Promise<new (path: string, options?: Record<string, unknown>) => ClassicLevelDatabase> {
  const imported = await import(pathToFileURL(entry).href) as ClassicLevelModule;
  if (!imported.ClassicLevel) throw new Error(`Configured classic-level entry has no ClassicLevel export: ${entry}`);
  return imported.ClassicLevel;
}

async function removeLevelDbLogs(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.toLocaleUpperCase('en').startsWith('LOG') || entry.name.toLocaleUpperCase('en') === 'LOCK')) await unlink(resolve(root, entry.name));
  }
}

export async function inspectModuleTree(root: string, config: BloodHunterLabConfig, requireOwnedMarker: boolean): Promise<ModuleInspection> {
  const stats = await lstat(root).catch(() => undefined);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) throw new Error(`Blood Hunter module tree is missing or unsafe: ${root}`);
  assertNoReparsePathComponents(parse(root).root, root, 'Blood Hunter module tree');
  const manifest = await readJson(resolve(root, 'module.json'));
  validateManifest(manifest);
  const marker = await readJson(resolve(root, 'data/owned-marker.json'));
  if (requireOwnedMarker && (marker.owned !== true || marker.moduleId !== MODULE_ID || marker.version !== MODULE_VERSION)) throw new Error(`Blood Hunter tree lacks its owned marker: ${root}`);
  const identity = await readJson(resolve(root, 'data/identity-manifest.json'));
  if (identity.moduleId !== MODULE_ID || identity.version !== MODULE_VERSION || typeof identity.logicalHash !== 'string') throw new Error('Blood Hunter identity manifest is incomplete.');
  const packs: Record<string, Array<Record<string, unknown>>> = {};
  for (const packName of PACK_NAMES) packs[packName] = await inspectLevelDbPack(resolve(root, 'packs', packName), config);
  assertIdentityMatchesPacks(identity, packs);
  const files = await hashTree(root);
  const hash = sha256Bytes(Buffer.from(canonicalJson(files)));
  return { root, hash, files, manifest, identity, packs };
}

export function compareModuleStaticFiles(left: ModuleInspection, right: ModuleInspection): boolean {
  const staticFiles = (inspection: ModuleInspection) => inspection.files.filter((file) => !file.path.startsWith('packs/'));
  return canonicalJson(staticFiles(left)) === canonicalJson(staticFiles(right));
}

function assertIdentityMatchesPacks(identity: Record<string, any>, packs: Record<string, Array<Record<string, unknown>>>): void {
  const identityDocuments = asArray<Record<string, unknown>>(identity.documents)
    .map((entry) => ({ id: entry.id, pack: entry.pack, uuid: entry.uuid, name: entry.name, type: entry.type }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'));
  const packDocuments = PACK_NAMES.flatMap((pack) => (packs[pack] ?? []).map((document) => ({
    id: document._id,
    pack,
    uuid: moduleUuid(pack, String(document._id)),
    name: document.name,
    type: document.type,
  }))).sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'));
  if (canonicalJson(identityDocuments) !== canonicalJson(packDocuments)) throw new Error('Identity manifest does not exactly cover the three LevelDB pack document/UUID sets.');
  const activityCount = packDocuments.reduce((total, entry) => {
    const packDocumentsForEntry = packs[String(entry.pack)] ?? [];
    const document = packDocumentsForEntry.find((candidate) => candidate._id === entry.id);
    return total + Object.keys(asRecord(asRecord(document?.system).activities)).length;
  }, 0);
  if (identity.activityCount !== activityCount) throw new Error('Identity manifest Activity count does not match the LevelDB pack documents.');
  const identityExternalUuids = Array.isArray(identity.externalDnd5eUuids) ? identity.externalDnd5eUuids.map(String).sort() : [];
  const expectedExternalUuids = [...EXPECTED_EXTERNAL_UUIDS].sort();
  if (canonicalJson(identityExternalUuids) !== canonicalJson(expectedExternalUuids)) throw new Error('Identity manifest must contain exactly all 12 recursive dnd5e external UUIDs.');
  for (const pack of PACK_NAMES) for (const document of packs[pack] ?? []) validateActivityStructure(document, `packs/${pack}/${String(document._id)}`);
}

function validateActivityStructure(document: Record<string, unknown>, path: string): void {
  const effects = asArray<Record<string, unknown>>(document.effects);
  const effectIds = new Set(effects.map((effect) => String(effect._id)));
  const rawActivities = asRecord(document.system).activities;
  if (Array.isArray(rawActivities)) throw new Error(`${path}/system/activities must be an object keyed by Activity _id.`);
  const activities = asRecord(rawActivities);
  for (const [activityId, activityValue] of Object.entries(activities)) {
    const activity = asRecord(activityValue);
    if (activity._id !== activityId || typeof activity.type !== 'string' || !asRecord(activity.activation) || !asRecord(activity.target)) throw new Error(`${path}/system/activities/${activityId} is structurally incomplete.`);
    for (const [index, reference] of asArray<Record<string, unknown>>(activity.effects).entries()) {
      if (typeof reference._id !== 'string' || !effectIds.has(reference._id) || Object.prototype.hasOwnProperty.call(reference, 'foundryId')) throw new Error(`${path}/system/activities/${activityId}/effects/${index} has a dangling or non-canonical Effect reference.`);
    }
  }
}

export function projectEffectForFoundryV14Pack(effect: Record<string, unknown>): Record<string, unknown> {
  const changes = asArray<Record<string, unknown>>(effect.changes).map((change) => {
    const type = typeof change.type === 'string'
      ? change.type
      : ACTIVE_EFFECT_TYPES[Number(change.mode)] ?? 'custom';
    return {
      key: change.key,
      value: parseEffectChangeValue(change.value),
      priority: change.priority ?? null,
      type,
    };
  });
  const sourceDuration = asRecord(effect.duration);
  const duration = normalizeEffectDuration(sourceDuration);
  const system = { ...asRecord(effect.system), changes };
  const projected: Record<string, unknown> = {
    ...effect,
    system,
    duration,
    disabled: Boolean(effect.disabled),
    transfer: effect.transfer === undefined ? true : Boolean(effect.transfer),
    statuses: Array.isArray(effect.statuses) ? [...effect.statuses] : [],
    tint: typeof effect.tint === 'string' ? effect.tint : '#ffffff',
    description: typeof effect.description === 'string' ? effect.description : '',
    showIcon: Number.isInteger(effect.showIcon) ? effect.showIcon : 2,
    sort: Number.isInteger(effect.sort) ? effect.sort : 0,
  };
  delete projected.changes;
  return projected;
}

function parseEffectChangeValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function normalizeEffectDuration(duration: Record<string, unknown>): Record<string, unknown> {
  const value = typeof duration.value === 'number'
    ? duration.value
    : typeof duration.seconds === 'number'
      ? duration.seconds
      : typeof duration.rounds === 'number'
        ? duration.rounds
        : typeof duration.turns === 'number'
          ? duration.turns
          : null;
  const units = typeof duration.units === 'string'
    ? duration.units
    : typeof duration.seconds === 'number'
      ? 'seconds'
      : typeof duration.rounds === 'number'
        ? 'rounds'
        : typeof duration.turns === 'number'
          ? 'turns'
          : 'seconds';
  return {
    value,
    units,
    expiry: duration.expiry ?? null,
    expired: Boolean(duration.expired),
  };
}

async function inspectLevelDbPack(path: string, config: BloodHunterLabConfig): Promise<Array<Record<string, unknown>>> {
  const ClassicLevel = await loadClassicLevel(config.classicLevelEntry);
  const stats = await lstat(path).catch(() => undefined);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) throw new Error(`Blood Hunter LevelDB pack is missing or unsafe: ${path}`);
  if (await containsLock(path)) throw new Error(`Blood Hunter LevelDB pack is locked or occupied: ${path}`);
  // classic-level rewrites CURRENT/MANIFEST/log files even when opened with
  // readOnly. Inspect a task-owned copy so validation never changes the bytes
  // that are about to be hashed, archived, installed, or backed up.
  const inspectionRoot = await mkdtemp(resolve(tmpdir(), 'fvtt-blood-hunter-pack-inspect-'));
  const inspectionPath = resolve(inspectionRoot, 'pack');
  try {
    await cp(path, inspectionPath, { recursive: true, force: false, errorOnExist: true });
    if (await containsLock(path)) throw new Error(`Blood Hunter LevelDB pack became locked during inspection: ${path}`);
    const database = new ClassicLevel(inspectionPath, { createIfMissing: false, readOnly: true, keyEncoding: 'utf8', valueEncoding: 'json' });
    await database.open();
    try {
      // Root iteration exposes the physical !items! key prefix used by
      // classic-level. It must not contain the old root !index record or any
      // other root-level content that Foundry 14 will ignore.
      for await (const [key] of database.iterator()) {
        if (key === '!index') throw new Error(`Blood Hunter LevelDB pack has an unsupported root-level !index pseudo-index: ${path}`);
        if (!isItemSublevelStorageKey(key)) throw new Error(`Blood Hunter LevelDB pack has unsupported root-level content: ${path}: ${key}`);
      }
      const items = database.sublevel(ITEM_SUBLEVEL, { keyEncoding: 'utf8', valueEncoding: 'json' });
      const embeddedEffects = database.sublevel(ITEM_EFFECT_SUBLEVEL, { keyEncoding: 'utf8', valueEncoding: 'json' });
      const documents: Array<Record<string, unknown>> = [];
      for await (const [key, value] of items.iterator()) {
        const stored = asRecord(value);
        if (stored._id !== key) throw new Error(`Blood Hunter LevelDB document key mismatch in ${path}: ${key}`);
        const effectIds = asArray<unknown>(stored.effects);
        const effects: Record<string, unknown>[] = [];
        for (const [index, effectIdValue] of effectIds.entries()) {
          if (typeof effectIdValue !== 'string' || effectIdValue.length === 0) throw new Error(`Blood Hunter LevelDB embedded Effect ID is invalid in ${path}: ${key}/effects/${index}`);
          let effect: unknown;
          try { effect = await embeddedEffects.get(`${key}.${effectIdValue}`); } catch { effect = undefined; }
          const record = asRecord(effect);
          if (record._id !== effectIdValue) throw new Error(`Blood Hunter LevelDB embedded Effect is missing or mismatched in ${path}: ${key}.${effectIdValue}`);
          effects.push(record);
        }
        documents.push({ ...stored, effects });
      }
      return documents.sort((left, right) => String(left._id).localeCompare(String(right._id), 'en'));
    } finally {
      await database.close();
    }
  } finally {
    await rm(inspectionRoot, { recursive: true });
  }
}

function isItemSublevelStorageKey(key: string): boolean {
  return key.startsWith(`!${ITEM_SUBLEVEL}!`) || key.startsWith(`!${ITEM_SUBLEVEL}.`);
}

export function validateManifest(manifest: Record<string, unknown>): void {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Blood Hunter module manifest ID/version mismatch.');
  const compatibility = asRecord(manifest.compatibility);
  if (compatibility.minimum !== '14.364' || compatibility.verified !== '14.364' || compatibility.maximum !== '14.364') throw new Error('Blood Hunter module manifest must pin Foundry to exact 14.364.');
  if (!Array.isArray(manifest.esmodules) || canonicalJson(manifest.esmodules) !== canonicalJson(['scripts/index.js'])) throw new Error('Blood Hunter module manifest must load scripts/index.js.');
  const relationships = asRecord(manifest.relationships);
  if (Object.prototype.hasOwnProperty.call(relationships, 'requires')) throw new Error('Blood Hunter module must not have hard module dependencies.');
  const systems = asArray<Record<string, unknown>>(relationships.systems);
  const dnd5e = systems.find((system) => system.id === 'dnd5e');
  const systemCompatibility = asRecord(dnd5e?.compatibility);
  if (!dnd5e || systemCompatibility.minimum !== '5.3.3' || systemCompatibility.verified !== '5.3.3' || systemCompatibility.maximum !== '5.3.3') throw new Error('Blood Hunter module manifest must pin dnd5e to exact 5.3.3.');
  const recommends = asArray<Record<string, unknown>>(relationships.recommends);
  const recommendedIds = recommends.map((entry) => entry.id).sort();
  if (canonicalJson(recommendedIds) !== canonicalJson(['dae', 'midi-qol'].sort())) throw new Error('Blood Hunter module must recommend exactly MIDI-QOL and DAE.');
  const serialized = JSON.stringify(manifest).toLocaleLowerCase('en');
  if (serialized.includes('plutonium') || serialized.includes('classpack')) throw new Error('Blood Hunter module manifest must not depend on Plutonium or classpack.');
  const packs = asArray<Record<string, unknown>>(manifest.packs);
  if (packs.length !== 3) throw new Error('Blood Hunter module manifest must declare exactly three Item packs.');
  for (const name of PACK_NAMES) {
    const pack = packs.find((entry) => entry.name === name);
    if (!pack || pack.type !== 'Item' || pack.system !== 'dnd5e' || pack.path !== `packs/${name}`) throw new Error(`Blood Hunter pack declaration is invalid: ${name}.`);
  }
}

async function containsLock(root: string): Promise<boolean> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.name.toLocaleUpperCase('en') === 'LOCK') return true;
    if (entry.isDirectory() && !entry.isSymbolicLink() && await containsLock(path)) return true;
  }
  return false;
}

async function hashTree(root: string): Promise<Array<{ path: string; size: number; sha256: string }>> {
  const entries: Array<{ path: string; size: number; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const child of children) {
      const path = resolve(directory, child.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Blood Hunter tree contains a symlink or junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) {
        const bytes = await readFile(path);
        entries.push({ path: relative(root, path).split(sep).join('/'), size: bytes.byteLength, sha256: sha256Bytes(bytes) });
      } else throw new Error(`Blood Hunter tree contains an unsupported filesystem entry: ${path}`);
    }
  }
  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function assertDeterministicArtifacts(first: ModuleInspection, second: ModuleInspection, firstPackage: NativeBloodHunterPackage, secondPackage: NativeBloodHunterPackage): void {
  if (first.identity.logicalHash !== second.identity.logicalHash || first.identity.sourceSha256 !== second.identity.sourceSha256) throw new Error('Two build candidates do not have the same logical/source identity.');
  const firstDocuments = PACK_NAMES.flatMap((pack) => first.packs[pack] ?? []).map((document) => ({ id: document._id, name: document.name, type: document.type })).sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'));
  const secondDocuments = PACK_NAMES.flatMap((pack) => second.packs[pack] ?? []).map((document) => ({ id: document._id, name: document.name, type: document.type })).sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'));
  if (canonicalJson(firstDocuments) !== canonicalJson(secondDocuments)) throw new Error('Two build candidates do not contain the same document/UUID identity.');
  if (first.files.length !== second.files.length) throw new Error('Two build candidates do not have the same file completeness.');
  if (firstPackage.logicalHash !== secondPackage.logicalHash) throw new Error('Two build candidates have different compiler logical hashes.');
}

function assertBrowserBundleSafe(text: string): void {
  const forbidden = [/node:/i, /bun:/i, /compileBloodHunterV14Package/i, /validateNativeBloodHunterPackage/i, /blood-hunter-v14/i, /classic-level/i, /process\.env/i, /readFile/i];
  const match = forbidden.find((pattern) => pattern.test(text));
  if (match) throw new Error(`Browser Blood Hunter bundle contains forbidden server/compiler dependency: ${match}.`);
}

async function publishDist(config: BloodHunterLabConfig, candidate: string): Promise<void> {
  const distRoot = resolve(config.moduleRoot, 'dist');
  assertExactRepoPath(config, distRoot, ['foundry-modules', MODULE_ID, 'dist'], 'Blood Hunter dist');
  const stage = resolve(config.moduleRoot, `.dist-staging-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  assertInsideRoot(config.moduleRoot, stage, 'Blood Hunter dist staging');
  await cp(candidate, stage, { recursive: true, force: false, errorOnExist: true });
  let previous: string | undefined;
  try {
    if (await exists(distRoot)) {
      const stats = await lstat(distRoot);
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Existing Blood Hunter dist is unsafe: ${distRoot}`);
      previous = resolve(config.moduleRoot, `.dist-previous-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await rename(distRoot, previous);
    }
    await rename(stage, distRoot);
    if (previous) await rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (await exists(stage)) await rm(stage, { recursive: true, force: true });
    if (previous && await exists(previous) && !(await exists(distRoot))) await rename(previous, distRoot).catch(() => undefined);
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => undefined));
}

export async function createDeterministicZip(root: string): Promise<Uint8Array> {
  const files = await hashTree(root);
  const localRecords: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = file.path;
    const nameBytes = new TextEncoder().encode(name);
    const data = await readFile(resolve(root, ...name.split('/')));
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(nameBytes.byteLength), u16(0), nameBytes, data,
    ]);
    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(nameBytes.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    localRecords.push(local);
    centralRecords.push(central);
    offset += local.byteLength;
  }
  const centralOffset = offset;
  const central = concatBytes(centralRecords);
  const local = concatBytes(localRecords);
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.byteLength), u32(centralOffset), u16(0)]);
  return concatBytes([local, central, end]);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function assertZipMatchesModule(zipPath: string, moduleRoot: string): Promise<void> {
  const bytes = await readFile(zipPath);
  const expected = await hashTree(moduleRoot);
  const localOffsets: number[] = [];
  const names: string[] = [];
  let offset = 0;
  for (const file of expected) {
    localOffsets.push(offset);
    if (readU32(bytes, offset) !== 0x04034b50) throw new Error(`ZIP local header is missing or out of order at ${file.path}.`);
    const flags = readU16(bytes, offset + 6);
    const method = readU16(bytes, offset + 8);
    const compressedSize = readU32(bytes, offset + 18);
    const uncompressedSize = readU32(bytes, offset + 22);
    const nameLength = readU16(bytes, offset + 26);
    const extraLength = readU16(bytes, offset + 28);
    if (flags !== 0x0800 || method !== 0 || compressedSize !== uncompressedSize) throw new Error(`ZIP entry ${file.path} is not an uncompressed UTF-8 deterministic entry.`);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    if (name !== file.path) throw new Error(`ZIP entry order/name mismatch: expected ${file.path}, found ${name}.`);
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) throw new Error(`ZIP entry ${file.path} is truncated.`);
    const data = bytes.slice(dataStart, dataEnd);
    if (readU32(bytes, offset + 14) !== crc32(data) || sha256Bytes(data) !== file.sha256 || data.byteLength !== file.size) throw new Error(`ZIP entry ${file.path} does not match the module file bytes.`);
    names.push(name);
    offset = dataEnd;
  }
  const centralOffset = offset;
  for (const [index, file] of expected.entries()) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error(`ZIP central directory is incomplete at ${file.path}.`);
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const crc = readU32(bytes, offset + 16);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    const nameStart = offset + 46;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    if (name !== file.path || localOffset !== localOffsets[index] || flags !== 0x0800 || method !== 0 || crc !== crc32(await readFile(resolve(moduleRoot, ...file.path.split('/')))) || compressedSize !== file.size || uncompressedSize !== file.size) {
      throw new Error(`ZIP central directory entry ${file.path} does not match the module file.`);
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  if (readU32(bytes, offset) !== 0x06054b50) throw new Error('ZIP end-of-central-directory record is missing.');
  if (readU16(bytes, offset + 8) !== expected.length || readU16(bytes, offset + 10) !== expected.length || readU32(bytes, offset + 12) !== offset - centralOffset || readU32(bytes, offset + 16) !== centralOffset || readU16(bytes, offset + 20) !== 0 || offset + 22 !== bytes.byteLength) throw new Error('ZIP end-of-central-directory record is incomplete or non-deterministic.');
  if (names.length !== expected.length || new Set(names).size !== expected.length) throw new Error('ZIP archive does not contain exactly one entry for every module file.');
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error('ZIP header is truncated.');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error('ZIP header is truncated.');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(canonicalize(value), null, 2)}\n`, 'utf8');
}

async function readJson(path: string): Promise<Record<string, any>> {
  return asRecord(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

function u16(value: number): Uint8Array {
  const result = new Uint8Array(2);
  new DataView(result.buffer).setUint16(0, value, true);
  return result;
}

function u32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value >>> 0, true);
  return result;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

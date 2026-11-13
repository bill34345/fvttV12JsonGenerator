import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export const BLOOD_HUNTER_ENVIRONMENT = {
  labRoot: 'FVTT_OPS_LAB_ROOT',
  backupRoot: 'FVTT_OPS_BACKUP_ROOT',
  evidenceRoot: 'FVTT_OPS_EVIDENCE_ROOT',
  classicLevelEntry: 'FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY',
  referenceCacheRoot: 'FVTT_REFERENCE_CACHE_ROOT',
  developmentFoundryVersion: 'FVTT_OPS_DEVELOPMENT_FOUNDRY_VERSION',
} as const;

export interface BloodHunterLabConfig {
  repoRoot: string;
  moduleRoot: string;
  labRoot: string;
  labRootConfigured: boolean;
  backupRoot: string;
  evidenceRoot: string;
  referenceCacheRoot: string;
  classicLevelEntry: string;
  versions: { foundry: string; dnd5e: '6.0.6' };
  moduleId: 'fvtt-blood-hunter-2024';
  profiles: { development: { id: 'development'; dataPath: string; host: '127.0.0.1'; port: 30001 } };
}

type Environment = Readonly<Record<string, string | undefined>>;

export function createLabConfig(
  repoRoot = findRepoRoot(process.cwd()),
  environment: Environment = process.env,
): BloodHunterLabConfig {
  const root = resolve(repoRoot);
  const moduleRoot = resolve(root, 'foundry-modules/fvtt-blood-hunter-2024');
  assertNoProductionEnvironment(environment);
  const foundryVersion = configuredFoundryVersion(environment);
  const configuredLab = environment[BLOOD_HUNTER_ENVIRONMENT.labRoot]?.trim();
  const labRoot = resolve(configuredLab || resolve(root, '.local/foundry-v14'));
  assertSpecificRoot(root, labRoot, BLOOD_HUNTER_ENVIRONMENT.labRoot);
  rejectProductionPath(labRoot, 'FVTT_OPS_LAB_ROOT');
  const backupRoot = resolve(environment[BLOOD_HUNTER_ENVIRONMENT.backupRoot]?.trim() || resolve(labRoot, 'backups'));
  const evidenceRoot = resolve(environment[BLOOD_HUNTER_ENVIRONMENT.evidenceRoot]?.trim() || resolve(labRoot, 'evidence'));
  assertSpecificRoot(labRoot, backupRoot, BLOOD_HUNTER_ENVIRONMENT.backupRoot);
  assertSpecificRoot(labRoot, evidenceRoot, BLOOD_HUNTER_ENVIRONMENT.evidenceRoot);
  rejectProductionPath(backupRoot, BLOOD_HUNTER_ENVIRONMENT.backupRoot);
  rejectProductionPath(evidenceRoot, BLOOD_HUNTER_ENVIRONMENT.evidenceRoot);
  assertInsideRoot(labRoot, backupRoot, 'backup root');
  assertInsideRoot(labRoot, evidenceRoot, 'evidence root');
  const referenceCacheRoot = resolve(environment[BLOOD_HUNTER_ENVIRONMENT.referenceCacheRoot]?.trim() || resolve(labRoot, '..', 'reference-cache'));
  rejectProductionPath(referenceCacheRoot, BLOOD_HUNTER_ENVIRONMENT.referenceCacheRoot);
  const classicLevelEntry = resolveConfiguredClassicLevelEntry(root, labRoot, environment);
  return {
    repoRoot: root,
    moduleRoot,
    labRoot,
    labRootConfigured: Boolean(configuredLab),
    backupRoot,
    evidenceRoot,
    referenceCacheRoot,
    classicLevelEntry,
    versions: { foundry: foundryVersion, dnd5e: '6.0.6' },
    moduleId: 'fvtt-blood-hunter-2024',
    profiles: {
      development: {
        id: 'development',
        dataPath: resolve(labRoot, 'data/server-mirror'),
        host: '127.0.0.1',
        port: 30001,
      },
    },
  };
}

export function findRepoRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsAsDirectory(resolve(current, 'foundry-modules')) && existsAsFile(resolve(current, 'packages/blood-hunter-v14/src/index.ts'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`Unable to locate fvttV12JsonGenerator repository root from ${start}.`);
    current = parent;
  }
}

export function resolveConfiguredClassicLevelEntry(repoRoot: string, labRoot: string, environment: Environment): string {
  const explicit = environment[BLOOD_HUNTER_ENVIRONMENT.classicLevelEntry]?.trim();
  const version = configuredFoundryVersion(environment);
  const entry = resolve(explicit || resolve(labRoot, 'app', version, 'node_modules/classic-level/index.js'));
  const installation = /[\\/]app[\\/]14\.(\d+)[\\/]node_modules[\\/]classic-level[\\/]index\.js$/i.exec(entry);
  if (!installation || Number(installation[1]) < 368) {
    throw new Error(`${BLOOD_HUNTER_ENVIRONMENT.classicLevelEntry} must name a Core 14.368+ classic-level entry.`);
  }
  const root = parse(entry).root;
  assertNoReparsePathComponents(root, entry, 'Foundry classic-level read-only entry');
  if (!explicit) assertExactLabPath(labRoot, entry, ['app', version, 'node_modules', 'classic-level', 'index.js'], 'Foundry classic-level read-only entry');
  if (!isAbsolute(entry) || resolve(repoRoot) === entry) throw new Error('classic-level entry must be an absolute file outside the repository root.');
  return entry;
}

function configuredFoundryVersion(environment: Environment): string {
  if (environment.FVTT_OPS_MIRROR_FOUNDRY_VERSION?.trim()) throw new Error('FVTT_OPS_MIRROR_FOUNDRY_VERSION is retired; use FVTT_OPS_DEVELOPMENT_FOUNDRY_VERSION for development 30001. ServerMirror is 30004.');
  const version = environment[BLOOD_HUNTER_ENVIRONMENT.developmentFoundryVersion]?.trim() || '14.370';
  if (!/^14\.\d+$/.test(version) || Number(version.split('.')[1]) < 368) throw new Error(`${BLOOD_HUNTER_ENVIRONMENT.developmentFoundryVersion} requires Core 14.368 or later within Core 14.`);
  return version;
}

export function assertInstalledBloodHunterCore(config: BloodHunterLabConfig): void {
  const path = resolve(config.labRoot, 'app', config.versions.foundry, 'package.json');
  assertNoReparsePathComponents(config.labRoot, path, 'Blood Hunter selected Foundry release');
  const installed = JSON.parse(readFileSync(path, 'utf8'));
  const version = `${installed.release?.generation}.${installed.release?.build}`;
  if (installed.name !== 'foundryvtt' || version !== config.versions.foundry) throw new Error(`Blood Hunter installed Foundry identity ${version} differs from selected ${config.versions.foundry}.`);
}

export function assertExactRepoPath(config: BloodHunterLabConfig, target: string, segments: readonly string[], label: string): void {
  const expected = resolve(config.repoRoot, ...segments);
  if (resolve(target) !== expected) throw new Error(`${label} must be the exact repository path: ${expected}`);
  assertNoReparsePathComponents(config.repoRoot, target, label);
}

export function assertExactLabPath(configOrRoot: BloodHunterLabConfig | string, target: string, segments: readonly string[], label: string): void {
  const labRoot = typeof configOrRoot === 'string' ? resolve(configOrRoot) : configOrRoot.labRoot;
  const expected = resolve(labRoot, ...segments);
  if (resolve(target) !== expected) throw new Error(`${label} must be the exact configured Lab path: ${expected}`);
  assertInsideRoot(labRoot, target, label);
}

export function assertInsideLabRoot(config: BloodHunterLabConfig, target: string, label = 'Lab target'): void {
  assertInsideRoot(config.labRoot, target, label);
}

export function assertInsideRoot(root: string, target: string, label: string): void {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  assertNoReparsePathComponents(parse(lexicalRoot).root, lexicalRoot, `${label} configured root`);
  assertNoReparsePathComponents(lexicalRoot, lexicalTarget, label);
  const physicalRoot = resolveThroughExistingAncestor(lexicalRoot);
  const physicalTarget = resolveThroughExistingAncestor(lexicalTarget);
  if (resolvesOutside(physicalRoot, physicalTarget)) throw new Error(`${label} escapes its approved root: ${lexicalTarget}`);
}

export function assertNoReparsePathComponents(root: string, target: string, label: string): void {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (resolvesOutside(lexicalRoot, lexicalTarget)) throw new Error(`${label} escapes its approved root: ${lexicalTarget}`);
  let current = lexicalRoot;
  const rel = relative(lexicalRoot, lexicalTarget);
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory() && !stats.isFile()) throw new Error(`${label} contains an unsafe reparse point or unsupported entry: ${current}`);
      const physical = resolve(realpathSync.native(current));
      if (resolvesOutside(parse(lexicalRoot).root, physical)) throw new Error(`${label} resolves outside its volume root: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function resolveThroughExistingAncestor(target: string): string {
  let existing = resolve(target);
  const missing: string[] = [];
  while (true) {
    try {
      const stats = lstatSync(existing);
      if (stats.isSymbolicLink()) throw new Error(`Unsafe symlink or junction in path: ${existing}`);
      return resolve(realpathSync.native(existing), ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(existing);
    if (parent === existing) return resolve(existing, ...missing.reverse());
    missing.push(basename(existing));
    existing = parent;
  }
}

function assertSpecificRoot(parent: string, target: string, variable: string): void {
  const resolvedTarget = resolve(target);
  const volumeRoot = parse(resolvedTarget).root;
  if (relative(volumeRoot, resolvedTarget) === '' || relative(resolve(parent), resolvedTarget) === '') {
    throw new Error(`${variable} must name a specific directory, not a volume or repository root: ${resolvedTarget}`);
  }
}

function resolvesOutside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function assertNoProductionEnvironment(environment: Environment): void {
  const suspicious = Object.entries(environment).filter(([key, value]) => {
    if (!value) return false;
    const upper = key.toLocaleUpperCase('en-US');
    return (upper.includes('PRODUCTION') || upper.includes('REMOTE') || upper.includes('SSH'))
      && !upper.includes('REFERENCE_CACHE');
  });
  if (suspicious.length > 0) throw new Error(`Production/remote environment variables are forbidden for Blood Hunter Lab operations: ${suspicious.map(([key]) => key).join(', ')}`);
  const values = Object.values(environment).filter((value): value is string => Boolean(value));
  if (values.some((value) => /(^|[^0-9])8080([^0-9]|$)/.test(value))) throw new Error('Foundry production port 8080 is forbidden for Blood Hunter Lab operations.');
}

function rejectProductionPath(target: string, label: string): void {
  if (/production|remote|(^|[\\/])8080([\\/]|$)/i.test(target)) throw new Error(`${label} points to a production/remote/8080 target: ${target}`);
}

function existsAsDirectory(path: string): boolean {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}

function existsAsFile(path: string): boolean {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

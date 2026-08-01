import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export const SPELL_RESOLVER_ENVIRONMENT = {
  labRoot: 'FVTT_OPS_LAB_ROOT',
  evidenceRoot: 'FVTT_OPS_EVIDENCE_ROOT',
  backupRoot: 'FVTT_OPS_BACKUP_ROOT',
  testClassicLevelEntry: 'FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY',
} as const;

export interface FoundryLabConfig {
  repoRoot: string;
  labRoot: string;
  appRoot: string;
  evidenceRoot: string;
  backupRoot: string;
  versions: { foundry: '14.364'; dnd5e: '5.3.3' };
  spellResolver: {
    moduleId: 'fvtt-json-generator-spell-resolver';
    disposableWorldId: 'fvtt-v14-module-matrix';
  };
  profiles: {
    serverMirror: { id: 'server-mirror'; dataPath: string; host: '127.0.0.1'; port: 30001 };
  };
}

type Environment = Readonly<Record<string, string | undefined>>;

export function createLabConfig(
  repoRoot = process.cwd(),
  environment: Environment = process.env,
): FoundryLabConfig {
  const root = resolve(repoRoot);
  const labRoot = resolve(
    environment[SPELL_RESOLVER_ENVIRONMENT.labRoot] || resolve(root, '.local/foundry-v14'),
  );
  const evidenceRoot = resolve(
    environment[SPELL_RESOLVER_ENVIRONMENT.evidenceRoot] || resolve(labRoot, 'evidence'),
  );
  const backupRoot = resolve(
    environment[SPELL_RESOLVER_ENVIRONMENT.backupRoot] || resolve(labRoot, 'backups'),
  );
  assertConfiguredRootIsSpecific(root, labRoot, SPELL_RESOLVER_ENVIRONMENT.labRoot);
  assertConfiguredRootIsSpecific(root, evidenceRoot, SPELL_RESOLVER_ENVIRONMENT.evidenceRoot);
  assertConfiguredRootIsSpecific(root, backupRoot, SPELL_RESOLVER_ENVIRONMENT.backupRoot);

  return {
    repoRoot: root,
    labRoot,
    appRoot: resolve(labRoot, 'app/14.364'),
    evidenceRoot,
    backupRoot,
    versions: { foundry: '14.364', dnd5e: '5.3.3' },
    spellResolver: {
      moduleId: 'fvtt-json-generator-spell-resolver',
      disposableWorldId: 'fvtt-v14-module-matrix',
    },
    profiles: {
      serverMirror: {
        id: 'server-mirror',
        dataPath: resolve(labRoot, 'data/server-mirror'),
        host: '127.0.0.1',
        port: 30001,
      },
    },
  };
}

export function createHermeticLabConfig(
  repoRoot = process.cwd(),
  environment: Environment = {},
): FoundryLabConfig {
  return createLabConfig(repoRoot, environment);
}

export function resolveConfiguredClassicLevelEntry(
  repoRoot = process.cwd(),
  environment: Environment = process.env,
): string {
  const explicitEntry = environment[SPELL_RESOLVER_ENVIRONMENT.testClassicLevelEntry]?.trim();
  if (explicitEntry) {
    if (!isAbsolute(explicitEntry)) {
      throw new Error(`${SPELL_RESOLVER_ENVIRONMENT.testClassicLevelEntry} must be an absolute file path`);
    }
    const entry = resolve(explicitEntry);
    const volumeRoot = parse(entry).root;
    const expectedSuffix = resolve(
      volumeRoot,
      'app',
      '14.364',
      'node_modules',
      'classic-level',
      'index.js',
    ).slice(volumeRoot.length).toLocaleLowerCase();
    if (!entry.slice(volumeRoot.length).toLocaleLowerCase().endsWith(expectedSuffix)) {
      throw new Error(
        `${SPELL_RESOLVER_ENVIRONMENT.testClassicLevelEntry} must name the Foundry 14.364 classic-level entry`,
      );
    }
    assertNoReparsePathComponents(volumeRoot, entry, 'Foundry classic-level read-only test dependency');
    return entry;
  }
  const config = createLabConfig(repoRoot, environment);
  const entry = resolve(config.appRoot, 'node_modules/classic-level/index.js');
  assertExactLabPath(config, entry, [
    'app',
    config.versions.foundry,
    'node_modules',
    'classic-level',
    'index.js',
  ], 'Foundry classic-level read-only runtime entry');
  return entry;
}

function assertConfiguredRootIsSpecific(repoRoot: string, target: string, variable: string): void {
  const resolvedTarget = resolve(target);
  const volumeRoot = parse(resolvedTarget).root;
  if (relative(volumeRoot, resolvedTarget) === '' || relative(repoRoot, resolvedTarget) === '') {
    throw new Error(`${variable} must name a specific directory, not a volume or repository root: ${resolvedTarget}`);
  }
}

function resolvesOutside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

export function resolveThroughExistingAncestor(target: string): string {
  let existingAncestor = resolve(target);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const stats = lstatSync(existingAncestor);
      if (stats.isSymbolicLink()) {
        throw new Error(`Unsafe symlink or junction in path: ${existingAncestor}`);
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return resolve(existingAncestor, ...missingSegments.reverse());
    missingSegments.push(basename(existingAncestor));
    existingAncestor = parent;
  }

  return resolve(realpathSync.native(existingAncestor), ...missingSegments.reverse());
}

export function assertNoReparsePathComponents(root: string, target: string, label: string): void {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (resolvesOutside(lexicalRoot, lexicalTarget)) {
    throw new Error(`${label} escapes its approved root: ${lexicalTarget}`);
  }
  const rel = relative(lexicalRoot, lexicalTarget);
  let current = lexicalRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`${label} contains an unsafe symlink, junction, or reparse point: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function assertExactRepoPath(
  config: FoundryLabConfig,
  target: string,
  repoRelativeSegments: readonly string[],
  label: string,
): void {
  const lexicalExpected = resolve(config.repoRoot, ...repoRelativeSegments);
  if (relative(lexicalExpected, resolve(target)) !== '') {
    throw new Error(`${label} must be the exact repository path: ${lexicalExpected}`);
  }
  assertNoReparsePathComponents(config.repoRoot, target, label);

  const realRepoRoot = resolveThroughExistingAncestor(config.repoRoot);
  const physicalExpected = resolve(realRepoRoot, ...repoRelativeSegments);
  const physicalTarget = resolveThroughExistingAncestor(target);
  if (relative(physicalExpected, physicalTarget) !== '') {
    throw new Error(`${label} must not cross a symlink or junction: ${lexicalExpected}`);
  }
}

export function assertExactLabPath(
  config: FoundryLabConfig,
  target: string,
  labRelativeSegments: readonly string[],
  label: string,
): void {
  const expected = resolve(config.labRoot, ...labRelativeSegments);
  if (relative(expected, resolve(target)) !== '') {
    throw new Error(`${label} must be the exact configured Foundry lab path: ${expected}`);
  }
  assertInsideLabRoot(config, target);
}

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  const approvedRoots = [...new Set([
    config.labRoot,
    config.evidenceRoot,
    config.backupRoot,
  ].map((root) => resolve(root)))];
  const approvedRoot = approvedRoots.find((root) => !resolvesOutside(root, candidate));
  if (!isAbsolute(candidate) || !approvedRoot) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }

  const volumeRoot = parse(approvedRoot).root;
  assertNoReparsePathComponents(volumeRoot, approvedRoot, 'Target escapes Foundry lab root; configured root');
  assertNoReparsePathComponents(approvedRoot, candidate, 'Target escapes Foundry lab root; path');

  const physicalRoot = resolveThroughExistingAncestor(approvedRoot);
  const physicalCandidate = resolveThroughExistingAncestor(candidate);
  if (resolvesOutside(physicalRoot, physicalCandidate)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
}

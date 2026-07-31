import { lstatSync } from 'node:fs';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';

export const REFERENCE_CACHE_ROOT_ENV = 'FVTT_REFERENCE_CACHE_ROOT';
const LEGACY_CACHE_PREFIX = '.local/references/';

type Environment = Readonly<Record<string, string | undefined>>;

export function resolveReferenceCacheRoot(
  repoRoot = process.cwd(),
  environment: Environment = process.env,
): string {
  const repo = resolve(repoRoot);
  const configuredRoot = environment[REFERENCE_CACHE_ROOT_ENV]?.trim();
  const cacheRoot = resolve(configuredRoot || resolve(repo, '.local/references'));
  if (relative(parse(cacheRoot).root, cacheRoot) === '' || relative(repo, cacheRoot) === '') {
    throw new Error(`${REFERENCE_CACHE_ROOT_ENV} must name a specific directory, not a volume or repository root: ${cacheRoot}`);
  }
  if (configuredRoot && isInside(repo, cacheRoot)) {
    throw new Error(`${REFERENCE_CACHE_ROOT_ENV} must be outside the repository when explicitly configured: ${cacheRoot}`);
  }
  assertNoExistingLinkComponents(parse(cacheRoot).root, cacheRoot);
  return cacheRoot;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function resolveReferenceComponentTarget(
  cacheRoot: string,
  manifestTarget: string,
): string {
  if (isAbsolute(manifestTarget)) {
    throw new Error(`Reference manifest target must be repository-relative: ${manifestTarget}`);
  }
  const normalized = manifestTarget.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized.startsWith(LEGACY_CACHE_PREFIX)) {
    throw new Error(`Reference manifest target must stay under ${LEGACY_CACHE_PREFIX}: ${manifestTarget}`);
  }
  const relativeTarget = normalized.slice(LEGACY_CACHE_PREFIX.length);
  if (!relativeTarget || relativeTarget.split('/').includes('..')) {
    throw new Error(`Unsafe reference manifest target: ${manifestTarget}`);
  }
  const target = resolve(cacheRoot, ...relativeTarget.split('/'));
  const rel = relative(resolve(cacheRoot), target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Reference manifest target escapes the configured cache root: ${manifestTarget}`);
  }
  return target;
}

function assertNoExistingLinkComponents(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target));
  let current = resolve(root);
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`Reference cache path contains an unsafe symlink or junction: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

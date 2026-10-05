import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const cachePath = /^(?:\.local\/(?:midi-qol\/(?:source|test-sources)|next-finish-20261002\/dae-upstream|classpack-next-20261002)(?:\/|$)|foundry-modules\/server-next-external-candidates\/(?:(?:classpack|item-piles|vision-macro)\/)?(?:sources|upstream|dist(?:-local[12])?)(?:\/|$))/;

/** Reuse read-only, ignored historical inputs; never redirect implementation, lock or patch files. */
export function legacyNextInputPath(candidatePath, options = {}) {
  const root = resolve(options.repositoryRoot ?? repositoryRoot);
  const requested = candidatePath instanceof URL ? fileURLToPath(candidatePath) : candidatePath;
  const localPath = resolve(requested);
  const name = relative(root, localPath);
  if (isAbsolute(name) || name === '..' || name.startsWith(`..${sep}`) || !cachePath.test(name.replaceAll('\\', '/'))) {
    throw new Error(`Not a relocatable historical Next input: ${localPath}`);
  }
  const inputRoot = options.inputRoot ?? process.env.FVTT_LEGACY_NEXT_INPUT_ROOT;
  if (!inputRoot) return localPath;
  if (!isAbsolute(inputRoot)) throw new Error('FVTT_LEGACY_NEXT_INPUT_ROOT must be an absolute existing input-workspace path.');
  return resolve(inputRoot, name);
}

export function legacyNextInputURL(candidateURL) {
  return pathToFileURL(legacyNextInputPath(candidateURL));
}

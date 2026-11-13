import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const generatorRoot = fileURLToPath(new URL('../', import.meta.url));

export function foundryPatchRoot(root = generatorRoot, override = process.env.FVTT_PATCH_ROOT) {
  if (override) {
    if (!isAbsolute(override)) throw new Error('FVTT_PATCH_ROOT must be an absolute path.');
    return resolve(override);
  }
  let gitDir;
  try {
    gitDir = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(`Cannot locate the Foundry patch checkout from ${root}. Set FVTT_PATCH_ROOT to its absolute path.`);
  }
  return resolve(dirname(gitDir), '..', 'foundry-compat-patches');
}

export function foundryPatchFile(relativePath, root = foundryPatchRoot()) {
  const file = resolve(root, relativePath);
  const child = relative(root, file);
  if (!child || isAbsolute(child) || child === '..' || child.startsWith('..' + sep)) {
    throw new Error(`Foundry patch file escapes its checkout: ${relativePath}`);
  }
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Foundry patch checkout is missing ${relativePath} at ${root}. Set FVTT_PATCH_ROOT to the absolute path of the checkout containing this patch.`);
  }
  return file;
}

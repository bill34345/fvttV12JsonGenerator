import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const catalogPath = fileURLToPath(new URL('./manifest.json', import.meta.url));
export const libraryName = '.local/legacy-next-test-inputs';
export const inputPattern = /^(?:\.local\/(?:midi-qol\/(?:source|test-sources)|next-finish-20261002\/dae-upstream|classpack-next-20261002)(?:\/|$)|foundry-modules\/server-next-external-candidates\/(?:(?:classpack|item-piles|vision-macro)\/)?(?:sources|upstream|dist(?:-local[12])?)(?:\/|$))/;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
// The identity is independent of Git's checkout line-ending conversion.
export const catalogDigest = catalog => digest(JSON.stringify(catalog));

export function checkedInputPath(root, name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes(':') || name.startsWith('/')
      || name.split('/').some(part => !part || part === '.' || part === '..' || part === '.git') || !inputPattern.test(name)
      || /(?:^|\/)(?:lost|LOG(?:\.old)?)(?:\/|$)|\.baiduyun\.uploading\.cfg$/i.test(name)
      || /(?:^|\/)(?:\.git|\.env(?:\..*)?|[^/]*(?:cookie|credential|private-key)[^/]*)$/i.test(name)) {
    throw new Error(`Not an approved test-input path: ${name}`);
  }
  const path = resolve(root, name), child = relative(resolve(root), path);
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error(`Test input escapes its root: ${name}`);
  }
  return path;
}

export function validateCatalog(catalog) {
  if (catalog?.format !== 1 || catalog.id !== 'legacy-next-test-inputs'
      || !Array.isArray(catalog.files) || !catalog.files.length || !Array.isArray(catalog.gitRepositories)) {
    throw new Error('Invalid legacy Next input catalog.');
  }
  const names = new Set();
  for (const file of catalog.files) {
    checkedInputPath(resolve('.'), file.path);
    if (names.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid or duplicate input identity: ${file.path}`);
    }
    names.add(file.path);
  }
  const repositories = new Set();
  for (const repository of catalog.gitRepositories) {
    if (repository.path !== '.local/midi-qol/source' || !/^[a-f0-9]{40}$/.test(repository.commit)
        || repositories.has(repository.path)) throw new Error('Invalid Midi source Git identity.');
    repositories.add(repository.path);
  }
  return catalog;
}

export const readCatalog = (path = catalogPath) => validateCatalog(readJson(path));

export function readyInputRoot(repositoryRoot, catalog = readCatalog()) {
  const root = existsSync(repositoryRoot) ? realpathSync.native(repositoryRoot) : resolve(repositoryRoot);
  const library = resolve(root, libraryName);
  if (!existsSync(library)) return undefined;
  const inside = path => {
    const child = relative(root, realpathSync.native(path));
    if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
      throw new Error(`Next test input resolves outside its prepared checkout: ${path}`);
    }
  };
  inside(library);
  const marker = resolve(library, 'ready.json');
  if (!existsSync(marker)) throw new Error(`Incomplete Next test inputs: ${library}`);
  inside(marker);
  const ready = readJson(marker), data = resolve(library, 'data');
  if (ready.format !== 1 || ready.status !== 'ready' || ready.catalogSha256 !== catalogDigest(catalog)
      || !existsSync(data) || !statSync(data).isDirectory()) {
    throw new Error(`Next test-input catalog or readiness differs: ${library}`);
  }
  inside(data);
  return data;
}

/** Own prepared inputs take precedence; sibling worktrees may share the primary checkout's inputs. */
export function managedInputRoot(repositoryRoot, catalog = readCatalog()) {
  const root = existsSync(repositoryRoot) ? realpathSync.native(repositoryRoot) : resolve(repositoryRoot);
  const own = readyInputRoot(root, catalog);
  if (own) return own;
  if (!existsSync(root)) return undefined;
  let common;
  try {
    common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { return undefined; }
  const primary = dirname(resolve(common));
  return primary === root ? undefined : readyInputRoot(primary, catalog);
}

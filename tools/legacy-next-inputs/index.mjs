import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogDigest, checkedInputPath, digest, libraryName, readCatalog, readyInputRoot, validateCatalog } from './library.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

function checkoutRoot(value) {
  if (!isAbsolute(value ?? '') || !existsSync(value)) throw new Error('Input and target roots must be existing absolute Git checkout paths.');
  const root = realpathSync.native(value);
  if (relative(root, realpathSync.native(git(root, 'rev-parse', '--show-toplevel'))) !== '') {
    throw new Error(`Expected a checkout root: ${value}`);
  }
  return root;
}

function insideRoot(root, path) {
  const child = relative(root, realpathSync.native(path));
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error(`Input resolves outside its approved root: ${path}`);
  }
}

function verifyFiles(root, catalog) {
  for (const file of catalog.files) {
    const path = checkedInputPath(root, file.path);
    insideRoot(root, path);
    if (!statSync(path).isFile() || statSync(path).size !== file.bytes || digest(readFileSync(path)) !== file.sha256) {
      throw new Error(`Test-input SHA-256 or size differs: ${file.path}`);
    }
  }
  for (const repository of catalog.gitRepositories) {
    const path = checkedInputPath(root, repository.path);
    insideRoot(root, path);
    if (git(path, 'rev-parse', 'HEAD') !== repository.commit) throw new Error(`Midi source commit differs: ${repository.path}`);
    git(path, 'cat-file', '-e', `${repository.commit}^{commit}`);
    if (git(path, 'diff', '--cached', '--name-only')) throw new Error(`Midi source index differs from its original commit: ${repository.path}`);
  }
}

export function checkInputs({ targetRoot, catalog = readCatalog() }) {
  validateCatalog(catalog);
  const target = checkoutRoot(targetRoot), data = readyInputRoot(target, catalog);
  if (!data) throw new Error(`Next test inputs are not prepared at ${target}`);
  insideRoot(target, data);
  verifyFiles(data, catalog);
  return { status: 'verified', files: catalog.files.length,
    bytes: catalog.files.reduce((total, file) => total + file.bytes, 0), inputRoot: data, catalogSha256: catalogDigest(catalog) };
}

/** Validate the entire whitelist before any write. A failed import never receives a ready marker. */
export function prepareInputs({ sourceRoot, targetRoot, apply = false, catalog = readCatalog() }) {
  validateCatalog(catalog);
  const source = checkoutRoot(sourceRoot), target = checkoutRoot(targetRoot);
  if (source === target) throw new Error('Source and target checkouts must differ.');
  const library = resolve(target, libraryName), data = resolve(library, 'data');
  if (existsSync(library)) throw new Error(`Input library already exists; use --check instead: ${library}`);
  verifyFiles(source, catalog);
  const result = { status: 'plan', files: catalog.files.length,
    bytes: catalog.files.reduce((total, file) => total + file.bytes, 0), sourceRoot: source, inputRoot: data };
  if (!apply) return result;
  // An existing .local junction must not redirect this delivery outside the approved checkout.
  const local = resolve(target, '.local');
  if (existsSync(local)) insideRoot(target, local);
  mkdirSync(library, { recursive: true });
  mkdirSync(data);
  for (const repository of catalog.gitRepositories) {
    const sourceRepository = checkedInputPath(source, repository.path), destination = checkedInputPath(data, repository.path);
    mkdirSync(destination, { recursive: true });
    git(destination, 'init', '--quiet');
    // Fetch only local Git objects; do not copy source remotes, configuration, credentials or logs.
    git(destination, '-c', 'protocol.file.allow=always', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', sourceRepository, repository.commit);
    git(destination, 'update-ref', '--no-deref', 'HEAD', repository.commit);
    // The existing source regression compares working files against the original Git index.
    // Retain that index while marking unneeded upstream files absent from this minimal input delivery.
    git(destination, 'read-tree', repository.commit);
    const retained = new Set(catalog.files.filter(file => file.path.startsWith(`${repository.path}/`))
      .map(file => file.path.slice(repository.path.length + 1)));
    const omitted = git(destination, 'ls-tree', '-r', '--name-only', '-z', repository.commit).split('\0')
      .filter(name => name && !retained.has(name));
    if (omitted.length) execFileSync('git', ['-C', destination, 'update-index', '--skip-worktree', '-z', '--stdin'], {
      input: `${omitted.join('\0')}\0`, stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  for (const file of catalog.files) {
    const from = checkedInputPath(source, file.path), to = checkedInputPath(data, file.path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to, constants.COPYFILE_EXCL);
  }
  verifyFiles(data, catalog);
  writeFileSync(resolve(library, 'ready.json'), `${JSON.stringify({ format: 1, status: 'ready', catalogSha256: catalogDigest(catalog) }, null, 2)}\n`, { flag: 'wx' });
  return checkInputs({ targetRoot: target, catalog });
}

export function runCli(args = process.argv.slice(2)) {
  const options = { targetRoot: process.cwd() };
  let check = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--apply') options.apply = true;
    else if (option === '--check') check = true;
    else if (option === '--source-root' || option === '--target-root') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing path for ${option}`);
      options[option === '--source-root' ? 'sourceRoot' : 'targetRoot'] = value;
    } else if (option === '--help') {
      return { usage: 'bun run legacy-next-inputs:prepare -- --source-root <absolute-checkout> [--target-root <absolute-checkout>] [--apply]\nbun run legacy-next-inputs:prepare -- --check [--target-root <absolute-checkout>]',
        note: 'Default is read-only planning. --check verifies prepared inputs without their old source.' };
    } else throw new Error(`Unknown option: ${option}`);
  }
  if (check && (options.apply || options.sourceRoot)) throw new Error('--check cannot be combined with --apply or --source-root.');
  return check ? checkInputs(options) : prepareInputs(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runCli(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

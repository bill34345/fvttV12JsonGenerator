import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { checkInputs, prepareInputs, runCli } from './index.mjs';
import { checkedInputPath, digest, libraryName, managedInputRoot, readyInputRoot } from './library.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const inputName = '.local/midi-qol/source/src/module/Workflow.ts';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'next-input-delivery-'));
  const source = join(root, 'source'), target = join(root, 'target');
  for (const directory of [source, target]) {
    mkdirSync(directory);
    git(directory, 'init', '--quiet');
  }
  const original = checkedInputPath(source, inputName), upstream = 'export const fixture = 1;\n', content = 'export const fixture = 2;\n';
  mkdirSync(dirname(original), { recursive: true });
  writeFileSync(original, upstream);
  const sourceRepository = resolve(source, '.local/midi-qol/source');
  git(sourceRepository, 'init', '--quiet');
  writeFileSync(join(sourceRepository, 'unused.txt'), 'Not needed by the test consumer.\n');
  git(sourceRepository, 'add', 'src/module/Workflow.ts', 'unused.txt');
  git(sourceRepository, '-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture');
  const commit = git(sourceRepository, 'rev-parse', 'HEAD');
  writeFileSync(original, content);
  const catalog = { format: 1, id: 'legacy-next-test-inputs',
    files: [{ path: inputName, bytes: Buffer.byteLength(content), sha256: digest(content) }],
    gitRepositories: [{ path: '.local/midi-qol/source', commit }] };
  try { run({ root, source, target, catalog, original, content, upstream, commit }); }
  finally { rmSync(root, { recursive: true }); }
}

test('a verified plan does not create files; apply delivers inputs and exact Git objects without source configuration', () => {
  fixture(({ source, target, catalog, original, content, upstream, commit }) => {
    const sourceRepository = resolve(source, '.local/midi-qol/source');
    git(sourceRepository, 'config', 'remote.origin.url', 'https://example.invalid/private-upstream');
    assert.equal(prepareInputs({ sourceRoot: source, targetRoot: target, catalog }).status, 'plan');
    assert.equal(existsSync(resolve(target, libraryName)), false);
    const result = prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true });
    assert.equal(result.status, 'verified');
    assert.equal(readFileSync(original, 'utf8'), content);
    const inputRepository = resolve(result.inputRoot, '.local/midi-qol/source');
    assert.equal(git(inputRepository, 'show', `${commit}:src/module/Workflow.ts`), upstream.trim());
    assert.equal(git(inputRepository, 'diff', '--name-only'), 'src/module/Workflow.ts');
    assert.equal(git(inputRepository, 'diff', '--cached', '--name-only'), '');
    assert.equal(git(inputRepository, 'remote'), '');
    assert.equal(managedInputRoot(target, catalog), result.inputRoot);
    // The target is usable when the old input source is gone.
    rmSync(source, { recursive: true });
    assert.equal(checkInputs({ targetRoot: target, catalog }).status, 'verified');
  });
});

test('changed or missing source files fail before the first destination write', () => {
  fixture(({ source, target, catalog, original }) => {
    writeFileSync(original, 'wrong');
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true }), /SHA-256 or size differs/);
    assert.equal(existsSync(resolve(target, libraryName)), false);
    rmSync(original);
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true }), /ENOENT/);
    assert.equal(existsSync(resolve(target, libraryName)), false);
  });
});

test('a wrong source commit cannot produce a ready library', () => {
  fixture(({ source, target, catalog }) => {
    catalog.gitRepositories[0].commit = '0'.repeat(40);
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true }), /commit differs/);
    assert.equal(existsSync(resolve(target, libraryName)), false);
  });
});

test('existing libraries are not overwritten and changed delivered bytes are rejected', () => {
  fixture(({ source, target, catalog }) => {
    const result = prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true });
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true }), /already exists/);
    writeFileSync(checkedInputPath(result.inputRoot, inputName), 'tampered');
    assert.throws(() => checkInputs({ targetRoot: target, catalog }), /SHA-256 or size differs/);
  });
});

test('partial libraries and changed catalogs cannot silently fall back to another input root', () => {
  fixture(({ source, target, catalog }) => {
    assert.equal(managedInputRoot(target, catalog), undefined);
    mkdirSync(resolve(target, libraryName), { recursive: true });
    assert.throws(() => managedInputRoot(target, catalog), /Incomplete/);
    rmdirSync(resolve(target, libraryName));
    prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true });
    const changed = structuredClone(catalog);
    changed.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => readyInputRoot(target, changed), /catalog or readiness differs/);
  });
});

test('paths outside the input whitelist, traversal and sensitive files are rejected', () => {
  for (const name of ['../escape', '.local/midi-qol/source/../../escape', '.local/midi-qol/source/.git/config',
    '.local/midi-qol/source/.env', '.local/midi-qol/source/credentials.json', '.local/midi-qol/source/cookies.json',
    '.local/midi-qol/source/LOG.old', '.local/midi-qol/source/lost/old.log', '.local/midi-qol/source/0001.log.baiduyun.uploading.cfg',
    'foundry-modules/midi-qol/upstream.lock.json', 'C:/outside', '.local/midi-qol/source\\file']) {
    assert.throws(() => checkedInputPath(tmpdir(), name), /approved/);
  }
  fixture(({ source, target, catalog }) => {
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: source, catalog }), /must differ/);
    assert.throws(() => prepareInputs({ sourceRoot: source, targetRoot: join(target, '.git'), catalog }), /checkout root|not a git repository|work tree/);
  });
});

test('automatic input discovery rejects a prepared directory redirected outside its checkout', () => {
  fixture(({ root, source, target, catalog }) => {
    const result = prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true });
    const outside = join(root, 'outside-input-data');
    renameSync(result.inputRoot, outside);
    symlinkSync(outside, result.inputRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => managedInputRoot(target, catalog), /outside its prepared checkout/);
  });
});

test('sibling worktrees share prepared primary inputs and prefer their own prepared library', () => {
  fixture(({ root, source, target, catalog }) => {
    writeFileSync(join(target, 'fixture.txt'), 'fixture');
    git(target, 'add', 'fixture.txt');
    git(target, '-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture');
    const sibling = join(root, 'sibling');
    git(target, 'worktree', 'add', '--quiet', '--detach', sibling);
    const primary = prepareInputs({ sourceRoot: source, targetRoot: target, catalog, apply: true });
    assert.equal(managedInputRoot(sibling, catalog), primary.inputRoot);
    const own = prepareInputs({ sourceRoot: source, targetRoot: sibling, catalog, apply: true });
    assert.equal(managedInputRoot(sibling, catalog), own.inputRoot);
  });
});

test('CLI refuses missing paths and incompatible check/apply options', () => {
  assert.throws(() => runCli(['--source-root']), /Missing path/);
  assert.throws(() => runCli(['--unknown']), /Unknown/);
  assert.throws(() => runCli(['--check', '--apply']), /cannot be combined/);
});

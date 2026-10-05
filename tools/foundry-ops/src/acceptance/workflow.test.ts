import { afterEach, beforeEach, expect, test as bunTest } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AcceptanceRequest } from './model';
import { exactPath, readJson } from './files';
import { collectAcceptance, dispatchPrepared, executeAcceptance, loadContract, prepareAcceptance, requireReady, resumeAcceptance } from './workflow';
import { runAcceptanceCli } from './cli';
import { runCommand } from '../process';

const cliPath = resolve(import.meta.dir, '../cli.ts');
const test = (name: string, run: () => void | Promise<void>) => bunTest(name, run, 15000);
const node = Bun.which('node');
if (!node) throw new Error('Node is required for the real node --check regression.');
let sandbox: string;
let root: string;
let source: string;
let input: string;
let request: AcceptanceRequest;

function git(...args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
}
function saveRequest() { writeFileSync(input, JSON.stringify(request)); }
async function prepare() { saveRequest(); return prepareAcceptance(input); }
async function execute() { const contract = await prepare(); const receipt = await executeAcceptance(contract.contractAbsolutePath); return { contract, receipt, path: join(dirname(contract.contractAbsolutePath), 'receipt.json') }; }

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fvtt-acceptance-test-'));
  root = join(sandbox, 'worktree');
  mkdirSync(join(root, '.ruler'), { recursive: true });
  mkdirSync(join(root, 'docs/runbooks'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), 'fixture instructions\n');
  writeFileSync(join(root, '.ruler/AGENTS.md'), 'fixture instruction source\n');
  writeFileSync(join(root, 'docs/runbooks/development-feedback-loop.md'), 'fixture feedback rule\n');
  source = join(root, 'check.js');
  writeFileSync(source, 'console.log(JSON.stringify({ok: true}));\n');
  git('init', '-b', 'codex/fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Acceptance fixture');
  git('add', '--', 'AGENTS.md', '.ruler/AGENTS.md', 'docs/runbooks/development-feedback-loop.md', 'check.js');
  git('commit', '-m', 'fixture baseline');
  input = join(root, 'request.json');
  request = {
    goal: 'Verify the local check result', acceptance: ['ok:true exits zero', 'missing proof stays incomplete'], caseId: 'local-json-check', workspaceRoot: root,
    candidatePaths: [source], authority: { source: 'Owned hermetic test fixture', scope: 'local-file-checks' },
    preflight: [{ id: 'syntax', argv: [node!, '--check', source], timeoutMs: 5000 }],
    operation: { id: 'check', argv: [node!, source], timeoutMs: 5000 }, adapter: 'json-ok',
  };
});

afterEach(() => {
  const absolute = resolve(sandbox);
  if (dirname(absolute) !== resolve(tmpdir()) || !absolute.split(/[\\/]/).at(-1)?.startsWith('fvtt-acceptance-test-')) throw new Error('Unowned cleanup target');
  rmSync(absolute, { recursive: true, force: false });
});

test('real syntax exit 1 blocks dispatch and never runs a later successful check', async () => {
  // Historical mapping: wmp-process.md M:6015 -> M:6020 (failed syntax check followed by dispatch).
  writeFileSync(source, 'const report = { broken: ; };\n');
  request.preflight.push({ id: 'later-success', argv: [node!, '-e', 'console.log("later")'], timeoutMs: 5000 });
  const contract = await prepare();
  expect(contract.preflight).toHaveLength(1);
  expect(contract.preflight[0]!.exitCode).not.toBe(0);
  let dispatchCalls = 0;
  await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { dispatchCalls++; })).rejects.toThrow('Preflight failed');
  expect(dispatchCalls).toBe(0);
  expect(existsSync(join(dirname(contract.contractAbsolutePath), 'dispatch-claim.json'))).toBe(false);
  expect(resumeAcceptance(contract.contractAbsolutePath).phase).toBe('BLOCKED');
});

test('zero exit cannot hide a false or empty structured preflight', async () => {
  for (const script of ['console.log(JSON.stringify({ok:false}))', '/* empty output */']) {
    request.preflight = [{ id: 'structured', argv: [node!, '-e', script], timeoutMs: 5000, expectJsonOk: true }];
    const contract = await prepare();
    expect(contract.preflight[0]!.exitCode).toBe(0);
    expect(() => requireReady(contract.contractAbsolutePath)).toThrow('Preflight failed');
  }
});

test('wrong worktree, relative and escaping candidate paths fail before preparation', async () => {
  for (const candidate of ['check.js', join(sandbox, 'outside.js')]) {
    writeFileSync(join(sandbox, 'outside.js'), '');
    request.candidatePaths = [candidate];
    await expect(prepare()).rejects.toThrow();
  }
  request.workspaceRoot = join(root, 'docs');
  await expect(prepare()).rejects.toThrow('exact Git worktree root');
  expect(existsSync(join(root, '.local/development-feedback'))).toBe(false);
});

test('junction candidates cannot escape the declared workspace', async () => {
  mkdirSync(join(sandbox, 'outside'));
  writeFileSync(join(sandbox, 'outside/check.js'), '');
  symlinkSync(join(sandbox, 'outside'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  request.candidatePaths = [join(root, 'linked/check.js')];
  await expect(prepare()).rejects.toThrow('unsafe symlink');
  // Remove only the owned link so recursive cleanup cannot follow it.
  unlinkSync(join(root, 'linked'));
});

test('contract and candidates survive JSON readback and bind actual instruction baseline', async () => {
  const contract = await prepare();
  expect(loadContract(contract.contractAbsolutePath)).toEqual(contract);
  expect(contract.workspace.head).toBe(contract.workspace.instructionBaseline);
  expect(contract.executables[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(contract.candidates[0]!.absolutePath).toBe(exactPath(source));
  expect(requireReady(contract.contractAbsolutePath).dispatchId).toBe(contract.dispatchId);
});

test('candidate or instruction drift blocks the callback', async () => {
  for (const path of [source, join(root, 'AGENTS.md')]) {
    const contract = await prepare();
    const original = readFileSync(path);
    writeFileSync(path, 'changed');
    let calls = 0;
    await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { calls++; })).rejects.toThrow('changed');
    expect(calls).toBe(0);
    writeFileSync(path, original);
  }
});

test('branch and HEAD drift cannot reuse a contract', async () => {
  const contract = await prepare();
  git('switch', '-c', 'codex/other');
  expect(() => requireReady(contract.contractAbsolutePath)).toThrow('branch, HEAD');
});

test('altered or relocated contract cannot be used', async () => {
  const contract = await prepare();
  const copy = join(root, 'copied-contract.json');
  writeFileSync(copy, readFileSync(contract.contractAbsolutePath));
  expect(() => loadContract(copy)).toThrow('absolute path');
  writeFileSync(contract.contractAbsolutePath, JSON.stringify({ ...contract, createdAt: 'altered' }));
  expect(() => loadContract(contract.contractAbsolutePath)).toThrow('Contract bytes changed');
});

test('one real operation yields immutable raw evidence and idempotent collection', async () => {
  const { contract, receipt, path } = await execute();
  const rawBytes = readFileSync(receipt.raw.absolutePath);
  const first = collectAcceptance(contract.contractAbsolutePath, path);
  expect(first).toMatchObject({ behavior: 'PASS', evidence: 'COMPLETE', cleanup: 'NOT_REQUIRED', parentReview: 'PENDING' });
  expect(collectAcceptance(contract.contractAbsolutePath, path)).toEqual(first);
  expect(readFileSync(receipt.raw.absolutePath)).toEqual(rawBytes);
  expect(resumeAcceptance(contract.contractAbsolutePath).phase).toBe('REVIEW');
  await expect(executeAcceptance(contract.contractAbsolutePath)).rejects.toThrow('already claimed');
});

test('old receipt and wrong receipt path are rejected', async () => {
  const first = await execute();
  const second = await execute();
  expect(() => collectAcceptance(second.contract.contractAbsolutePath, first.path)).toThrow('another worktree or run');
  writeFileSync(second.path, readFileSync(first.path));
  expect(() => collectAcceptance(second.contract.contractAbsolutePath, second.path)).toThrow('Stale or mismatched');
});

test('wrong revision, case and raw bytes never become accepted evidence', async () => {
  const { contract, receipt, path } = await execute();
  for (const changed of [{ contractRevision: 0 }, { caseId: 'wrong' }, { dispatchId: 'wrong' }, { contractSha256: 'wrong' }]) {
    writeFileSync(path, JSON.stringify({ ...receipt, ...changed }));
    expect(() => collectAcceptance(contract.contractAbsolutePath, path)).toThrow('Stale or mismatched');
  }
  writeFileSync(path, JSON.stringify(receipt));
  writeFileSync(receipt.raw.absolutePath, '{}');
  expect(() => collectAcceptance(contract.contractAbsolutePath, path)).toThrow('Raw receipt bytes');
});

test('empty output or a PASS label cannot replace supported semantic evidence', async () => {
  for (const content of ['', 'console.log(JSON.stringify({status:"PASS"}));']) {
    writeFileSync(source, content);
    const { contract, path } = await execute();
    expect(collectAcceptance(contract.contractAbsolutePath, path)).toMatchObject({ behavior: 'INCOMPLETE', evidence: 'INCOMPLETE', exitCode: 2 });
  }
});

test('a real failed check stays FAIL while manual semantics remain INCOMPLETE', async () => {
  writeFileSync(source, 'console.log(JSON.stringify({ok:false})); process.exitCode=1;');
  const failed = await execute();
  expect(collectAcceptance(failed.contract.contractAbsolutePath, failed.path)).toMatchObject({ behavior: 'FAIL', evidence: 'COMPLETE', failureLayer: 'behavior', exitCode: 1 });
  request.adapter = 'manual';
  const manual = await execute();
  expect(collectAcceptance(manual.contract.contractAbsolutePath, manual.path)).toMatchObject({ behavior: 'INCOMPLETE', evidence: 'COMPLETE', exitCode: 2 });
});

test('a claimed dispatch with no receipt resumes at inspection instead of replay', async () => {
  const contract = await prepare();
  await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { throw new Error('transport failed'); })).rejects.toThrow('transport failed');
  expect(resumeAcceptance(contract.contractAbsolutePath).phase).toBe('INSPECT');
  expect(() => requireReady(contract.contractAbsolutePath)).toThrow('already claimed');
});

test('timeout saves the observed failure and prevents blind replay', async () => {
  request.operation = { id: 'timeout', argv: [node!, '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 100 };
  const { contract, receipt, path } = await execute();
  expect(readJson(receipt.raw.absolutePath)).toMatchObject({ timedOut: true });
  expect(collectAcceptance(contract.contractAbsolutePath, path)).toMatchObject({ behavior: 'INCOMPLETE', failureLayer: 'tool' });
  await expect(executeAcceptance(contract.contractAbsolutePath)).rejects.toThrow('already claimed');
});

test('local checks remove production environment settings regardless of Windows key casing', async () => {
  const key = 'fvtt_ops_production_acceptance_fixture';
  const previous = process.env[key];
  process.env[key] = 'fixture-only';
  try {
    writeFileSync(source, 'console.log(JSON.stringify({ok: process.env.fvtt_ops_production_acceptance_fixture === undefined && process.env.FVTT_OPS_PRODUCTION_ACCEPTANCE_FIXTURE === undefined}));');
    const { contract, path } = await execute();
    expect(collectAcceptance(contract.contractAbsolutePath, path).behavior).toBe('PASS');
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('direct CLI preserves prepare failures and separates save success from semantic result', async () => {
  saveRequest();
  const invoke = (args: string[]) => runCommand(process.execPath, ['run', cliPath, 'acceptance', ...args], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  const prepared = await invoke(['prepare', `--input=${input}`]);
  expect(prepared.exitCode).toBe(0);
  const contractPath = JSON.parse(prepared.stdout).contractAbsolutePath;
  const executed = await invoke(['execute', `--contract=${contractPath}`]);
  expect(executed.exitCode).toBe(0);
  const collected = await invoke(['collect', `--contract=${contractPath}`, `--receipt=${join(dirname(contractPath), 'receipt.json')}`]);
  expect(JSON.parse(collected.stdout).behavior).toBe('PASS');
  writeFileSync(source, 'broken syntax ; }');
  const blocked = await invoke(['prepare', `--input=${input}`]);
  expect(blocked.exitCode).toBe(1);
  const ready = await invoke(['ready', `--contract=${JSON.parse(blocked.stdout).contractAbsolutePath}`]);
  expect(ready.exitCode).toBe(2);
  expect(JSON.parse(ready.stdout).reason).toContain('Preflight failed');
});

test('run CLI executes once, then reads the same receipt without rerunning checks or rewriting originals', async () => {
  const preflightMarker = join(root, 'preflight.marker');
  const operationMarker = join(root, 'operation.marker');
  request.preflight = [{ id: 'marker-preflight', argv: [node!, '-e', `require('fs').appendFileSync(${JSON.stringify(preflightMarker)}, 'p')`], timeoutMs: 5000 }];
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(operationMarker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  saveRequest();
  const invoke = (args: string[]) => runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', ...args], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  const first = await invoke([`--input=${input}`]);
  expect(first.exitCode).toBe(0);
  const result = JSON.parse(first.stdout);
  expect(result).toMatchObject({ executionStatus: 'EXECUTED', phase: 'REVIEW', summary: { behavior: 'PASS', evidence: 'COMPLETE', parentReview: 'PENDING' } });
  const directory = dirname(result.contractAbsolutePath);
  const original = ['contract.json', 'dispatch-claim.json', 'raw.json', 'receipt.json', `summary.${result.summary.receiptId}.json`].map(name => readFileSync(join(directory, name)));
  const second = await invoke([`--contract=${result.contractAbsolutePath}`]);
  expect(second.exitCode).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ executionStatus: 'REUSED_RECEIPT', contractAbsolutePath: result.contractAbsolutePath, summary: result.summary });
  expect(readFileSync(preflightMarker, 'utf8')).toBe('p');
  expect(readFileSync(operationMarker, 'utf8')).toBe('o');
  expect(['contract.json', 'dispatch-claim.json', 'raw.json', 'receipt.json', `summary.${result.summary.receiptId}.json`].map(name => readFileSync(join(directory, name)))).toEqual(original);
});

test('run CLI keeps a claimed contract incomplete and does not replay its operation', async () => {
  const marker = join(root, 'operation.marker');
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(marker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  const contract = await prepare();
  await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { throw new Error('delivery unknown'); })).rejects.toThrow('delivery unknown');
  const result = await runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', `--contract=${contract.contractAbsolutePath}`], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ contractAbsolutePath: contract.contractAbsolutePath, executionStatus: 'CLAIMED_NO_RECEIPT', phase: 'INSPECT', behavior: 'INCOMPLETE', exitCode: 2 });
  expect(existsSync(marker)).toBe(false);
});

test('run CLI returns the contract path when receipt persistence fails after the operation', async () => {
  const marker = join(root, 'operation.marker');
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(marker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  const contract = await prepare();
  const rawPath = join(dirname(contract.contractAbsolutePath), 'raw.json');
  writeFileSync(rawPath, 'occupied');
  const invoke = () => runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', `--contract=${contract.contractAbsolutePath}`], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  const first = await invoke();
  expect(first.exitCode).toBe(2);
  expect(JSON.parse(first.stdout)).toMatchObject({ contractAbsolutePath: contract.contractAbsolutePath, executionStatus: 'CLAIMED_NO_RECEIPT', phase: 'INSPECT', behavior: 'INCOMPLETE', exitCode: 2 });
  expect(readFileSync(rawPath, 'utf8')).toBe('occupied');
  const second = await invoke();
  expect(JSON.parse(second.stdout)).toMatchObject({ contractAbsolutePath: contract.contractAbsolutePath, executionStatus: 'CLAIMED_NO_RECEIPT', phase: 'INSPECT' });
  expect(readFileSync(marker, 'utf8')).toBe('o');
});

test('run CLI reports unknown history after candidate drift and never replays a completed operation', async () => {
  const marker = join(root, 'operation.marker');
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(marker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  saveRequest();
  const invoke = (args: string[]) => runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', ...args], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  const first = JSON.parse((await invoke([`--input=${input}`])).stdout);
  expect(first.executionStatus).toBe('EXECUTED');
  const receiptPath = join(dirname(first.contractAbsolutePath), 'receipt.json');
  const receiptBytes = readFileSync(receiptPath);
  writeFileSync(source, 'console.log(JSON.stringify({ok:true, changed:true}));');
  const second = await invoke([`--contract=${first.contractAbsolutePath}`]);
  expect(second.exitCode).toBe(2);
  expect(JSON.parse(second.stdout)).toMatchObject({ contractAbsolutePath: first.contractAbsolutePath, executionStatus: 'UNKNOWN', phase: 'INSPECT', behavior: 'INCOMPLETE', exitCode: 2 });
  expect(readFileSync(marker, 'utf8')).toBe('o');
  expect(readFileSync(receiptPath)).toEqual(receiptBytes);
});

test('run CLI reports invalid existing raw or receipt bytes without replaying or rewriting them', async () => {
  const marker = join(root, 'operation.marker');
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(marker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  const invoke = (args: string[]) => runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', ...args], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  for (const filename of ['raw.json', 'receipt.json']) {
    saveRequest();
    const first = JSON.parse((await invoke([`--input=${input}`])).stdout);
    expect(first.executionStatus).toBe('EXECUTED');
    const damagedPath = join(dirname(first.contractAbsolutePath), filename);
    writeFileSync(damagedPath, '{}');
    const damagedBytes = readFileSync(damagedPath);
    const before = readFileSync(marker, 'utf8');
    const second = await invoke([`--contract=${first.contractAbsolutePath}`]);
    expect(second.exitCode).toBe(2);
    expect(JSON.parse(second.stdout)).toMatchObject({ contractAbsolutePath: first.contractAbsolutePath, executionStatus: 'RECEIPT_INVALID', phase: 'INSPECT', behavior: 'INCOMPLETE', exitCode: 2 });
    expect(readFileSync(marker, 'utf8')).toBe(before);
    expect(readFileSync(damagedPath)).toEqual(damagedBytes);
  }
});

test('run CLI blocks failed preflight and rejects unsupported scope or selection before any check', async () => {
  const marker = join(root, 'preflight.marker');
  const operationMarker = join(root, 'operation.marker');
  request.preflight = [{ id: 'failing', argv: [node!, '-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'p'); process.exit(1)`], timeoutMs: 5000 }];
  writeFileSync(source, `require('fs').appendFileSync(${JSON.stringify(operationMarker)}, 'o'); console.log(JSON.stringify({ok:true}));`);
  const invoke = async () => runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', `--input=${input}`], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  saveRequest();
  const failed = await invoke();
  expect(failed.exitCode).toBe(2);
  expect(JSON.parse(failed.stdout)).toMatchObject({ executionStatus: 'NOT_EXECUTED', phase: 'BLOCKED', behavior: 'INCOMPLETE', exitCode: 2 });
  expect(JSON.parse(failed.stdout).contractAbsolutePath).toBeTruthy();
  expect(readFileSync(marker, 'utf8')).toBe('p');
  expect(existsSync(operationMarker)).toBe(false);
  unlinkSync(marker);
  (request as unknown as Record<string, unknown>).externalBatch = {};
  saveRequest();
  const unsupported = await invoke();
  expect(unsupported.exitCode).toBe(2);
  expect(JSON.parse(unsupported.stdout).reason).toContain('ordinary local-file-checks');
  expect(existsSync(marker)).toBe(false);
  delete (request as unknown as Record<string, unknown>).externalBatch;
  (request as unknown as Record<string, unknown>).runtime = {};
  saveRequest();
  const runtime = await invoke();
  expect(runtime.exitCode).toBe(2);
  expect(JSON.parse(runtime.stdout).reason).toContain('ordinary local-file-checks');
  expect(existsSync(marker)).toBe(false);
  delete (request as unknown as Record<string, unknown>).runtime;
  request.validationSelection = { cases: [{ id: 'case', layer: 'behavior', decision: 'defer', reason: 'Unchanged', context: { revision: 'same' } }] };
  saveRequest();
  const selection = await invoke();
  expect(selection.exitCode).toBe(2);
  expect(JSON.parse(selection.stdout).reason).toContain('Validation selection');
  expect(existsSync(marker)).toBe(false);
});

test('run CLI accepts a module-specific local check and leaves manual semantics incomplete', async () => {
  request.caseId = 'unregistered-module';
  request.adapter = 'manual';
  saveRequest();
  const result = await runCommand(process.execPath, ['run', cliPath, 'acceptance', 'run', `--input=${input}`], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 15000 });
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ executionStatus: 'EXECUTED', summary: { behavior: 'INCOMPLETE', evidence: 'COMPLETE', parentReview: 'PENDING' }, exitCode: 2 });
});

test('CLI rejects typo, duplicate and missing options instead of guessing a target', async () => {
  for (const args of [['collect'], ['prepare', '--input=a', '--input=b'], ['ready', '--receipt=x'], ['run'], ['run', '--input=a', '--contract=b'], ['run', '--input=a', '--input=b'], ['unknown']]) {
    const output: string[] = [];
    expect(await runAcceptanceCli(args, text => output.push(text))).toBe(2);
    expect(JSON.parse(output[0]!).ok).toBe(false);
  }
});

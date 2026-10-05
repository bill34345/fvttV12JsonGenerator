import { afterAll, beforeAll, expect, test as bunTest } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileIdentity } from './files';
import type { AcceptanceContract, AcceptanceRequest, ValidationCase, ValidationEvidence } from './model';
import { runAcceptanceCli } from './cli';
import { collectAcceptance, dispatchPrepared, executeAcceptance, prepareAcceptance, requireReady, resumeAcceptance } from './workflow';

const test = (name: string, run: () => void | Promise<void>) => bunTest(name, run, 15000);
const node = Bun.which('node');
if (!node) throw new Error('Node required for real local-file preflight.');
let sandbox: string;
let root: string;
let source: string;
let sequence = 0;
const context = { target: 'synthetic-file-check', interface: 'v1' };
function save(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); return fileIdentity(path); }
function git(...args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
}
beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fvtt-selection-test-')); root = join(sandbox, 'worktree');
  mkdirSync(join(root, '.ruler'), { recursive: true }); mkdirSync(join(root, 'docs/runbooks'), { recursive: true });
  for (const path of ['AGENTS.md', '.ruler/AGENTS.md', 'docs/runbooks/development-feedback-loop.md']) writeFileSync(join(root, path), 'Synthetic fixture instructions\n');
  source = join(root, 'check.js'); writeFileSync(source, 'console.log(JSON.stringify({ok:true}));\n');
  git('init', '-b', 'codex/fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Selection fixture');
  git('add', '--', 'AGENTS.md', '.ruler/AGENTS.md', 'docs/runbooks/development-feedback-loop.md', 'check.js'); git('commit', '-m', 'synthetic baseline');
});
afterAll(() => {
  const absolute = resolve(sandbox);
  if (dirname(absolute) !== resolve(tmpdir()) || !absolute.split(/[\\/]/).at(-1)?.startsWith('fvtt-selection-test-') || lstatSync(absolute).isSymbolicLink()) throw new Error('Unowned fixture cleanup');
  rmSync(absolute, { recursive: true, force: false });
});
function fixture() {
  const directory = join(root, `case-${++sequence}`); mkdirSync(directory);
  const rawPath = join(directory, 'raw.json'); const raw = save(rawPath, { business: 'PASS', export: 'INCOMPLETE', restoration: 'NOT_EXECUTED' });
  const prior = save(join(directory, 'accepted-behavior.json'), { caseId: 'draw', layer: 'behavior', outcome: 'PASS', context, evidence: [raw] } satisfies ValidationEvidence);
  const gap = save(join(directory, 'gap.json'), { fact: 'Synthetic change or specific missing evidence', noRuntime: true });
  const row: ValidationCase = { id: 'draw', layer: 'behavior', decision: 'reuse', reason: 'Relevant interface and accepted behavior are unchanged.', context: { ...context }, previous: prior };
  const request: AcceptanceRequest = {
    goal: 'Verify declared case selection', acceptance: ['Reject unsupported repeats before dispatch'], caseId: 'selection-fixture', workspaceRoot: root,
    candidatePaths: [source], authority: { source: 'Owned synthetic fixture', scope: 'local-file-checks' },
    preflight: [{ id: 'syntax', argv: [node!, '--check', source], timeoutMs: 5000, validationCases: [] }],
    operation: { id: 'selected-check', argv: [node!, source], timeoutMs: 5000, validationCases: [] }, adapter: 'json-ok',
    validationSelection: { cases: [row] },
  };
  const input = join(directory, 'request.json');
  const prepare = () => { save(input, request); return prepareAcceptance(input); };
  return { directory, rawPath, prior, gap, row, request, input, prepare };
}
// A synthetic producer can emit an intact envelope with a bad declaration; ready must also reject it.
function updateContract(contract: AcceptanceContract) {
  save(contract.contractAbsolutePath, contract);
  save(join(dirname(contract.contractAbsolutePath), 'contract-integrity.json'), { sha256: fileIdentity(contract.contractAbsolutePath).sha256 });
}

test('reuse-only selection retains prior evidence and never invokes execution', async () => {
  const f = fixture(), before = readFileSync(f.rawPath);
  const marker = join(f.directory, 'preflight-ran');
  f.request.preflight[0]!.argv = [node!, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`];
  await expect(f.prepare()).rejects.toThrow('no case is selected'); expect(existsSync(marker)).toBe(false);
  f.request.validationSelection!.cases.push({ id: 'new', layer: 'evidence', decision: 'check', reason: 'New file check.', context });
  f.request.operation.validationCases = [{ id: 'new', layer: 'evidence' }];
  const contract = await f.prepare(); contract.request.validationSelection!.cases.pop(); contract.request.operation.validationCases = []; updateContract(contract);
  let calls = 0;
  await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { calls++; })).rejects.toThrow('no case is selected');
  expect(calls).toBe(0); expect(existsSync(join(dirname(contract.contractAbsolutePath), 'dispatch-claim.json'))).toBe(false);
  expect(readFileSync(f.rawPath)).toEqual(before);
});

test('repeat without invalidation is blocked both before preflight and on the actual ready/dispatch path', async () => {
  const f = fixture(); f.row.decision = 'check'; f.request.operation.validationCases = [{ id: 'draw', layer: 'behavior' }];
  const marker = join(f.directory, 'preflight-ran');
  f.request.preflight[0]!.argv = [node!, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`];
  await expect(f.prepare()).rejects.toThrow('repeat needs');
  expect(existsSync(marker)).toBe(false);
  f.row.invalidation = { kind: 'required-integration', reason: 'Synthetic explicit integration boundary.', evidence: f.gap };
  const contract = await f.prepare(); delete contract.request.validationSelection!.cases[0]!.invalidation; updateContract(contract);
  expect(() => requireReady(contract.contractAbsolutePath)).toThrow('repeat needs');
  let calls = 0; await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { calls++; })).rejects.toThrow('repeat needs');
  expect(calls).toBe(0); expect(existsSync(join(dirname(contract.contractAbsolutePath), 'dispatch-claim.json'))).toBe(false);
});

test('changed interface selects only the affected check, while reuse/defer stay out of command coverage', async () => {
  const f = fixture();
  const oldRoll = save(join(f.directory, 'roll.json'), { caseId: 'roll', layer: 'behavior', outcome: 'PASS', context, evidence: [f.prior] } satisfies ValidationEvidence);
  f.request.validationSelection!.cases.push(
    { id: 'roll', layer: 'behavior', decision: 'check', reason: 'The real integration boundary changed.', context: { ...context, interface: 'v2' }, previous: oldRoll, invalidation: { kind: 'interface-change', reason: 'The canonical sender field changed at this boundary.', evidence: f.gap } },
    { id: 'other-ui', layer: 'behavior', decision: 'defer', reason: 'Outside this batch.', context },
  );
  f.request.operation.validationCases = [{ id: 'roll', layer: 'behavior' }];
  const contract = await f.prepare(), output: string[] = [];
  expect(await runAcceptanceCli(['ready', `--contract=${contract.contractAbsolutePath}`], line => output.push(line))).toBe(0);
  const ready = JSON.parse(output[0]!);
  expect(ready.validation.check.map((item: {id: string}) => item.id)).toEqual(['roll']);
  expect(ready.validation.reuse.map((item: {id: string}) => item.id)).toEqual(['draw']);
  expect(ready.validation.defer.map((item: {id: string}) => item.id)).toEqual(['other-ui']);
  let calls = 0;
  await dispatchPrepared(contract.contractAbsolutePath, async bound => { calls++; expect(bound.request.operation.validationCases).toEqual([{ id: 'roll', layer: 'behavior' }]); });
  expect(calls).toBe(1);
});

test('unreadable, changed, wrong-case or unknown-context evidence cannot authorize reuse', async () => {
  const f = fixture();
  f.request.validationSelection!.cases.push({ id: 'new', layer: 'evidence', decision: 'check', reason: 'New check only.', context });
  f.request.operation.validationCases = [{ id: 'new', layer: 'evidence' }];
  const contract = await f.prepare(); const raw = readFileSync(f.rawPath);
  writeFileSync(f.rawPath, 'changed'); expect(() => requireReady(contract.contractAbsolutePath)).toThrow('evidence bytes changed');
  rmSync(f.rawPath); expect(() => requireReady(contract.contractAbsolutePath)).toThrow(); writeFileSync(f.rawPath, raw);
  const row = contract.request.validationSelection!.cases[0]!;
  row.context = { ...context, interface: 'unknown' }; updateContract(contract); expect(() => requireReady(contract.contractAbsolutePath)).toThrow('reuse context');
  row.context = { ...context, interface: 'v2' }; updateContract(contract); expect(() => requireReady(contract.contractAbsolutePath)).toThrow('reuse context');
  row.context = { ...context }; row.previous = save(join(f.directory, 'wrong.json'), { caseId: 'foreign', layer: 'behavior', outcome: 'PASS', context, evidence: [fileIdentity(f.rawPath)] }); updateContract(contract);
  expect(() => requireReady(contract.contractAbsolutePath)).toThrow('case/layer differs');
  expect(existsSync(join(dirname(contract.contractAbsolutePath), 'dispatch-claim.json'))).toBe(false);
});

test('export failure leaves independent passed behavior and unfinished restoration separate', async () => {
  const f = fixture(), before = readFileSync(f.rawPath);
  const priorExport = save(join(f.directory, 'export.json'), { caseId: 'draw', layer: 'evidence', outcome: 'INCOMPLETE', context, evidence: [fileIdentity(f.rawPath)] } satisfies ValidationEvidence);
  f.request.validationSelection!.cases.push(
    { id: 'draw', layer: 'evidence', decision: 'check', reason: 'Only repair the missing exported value.', context, previous: priorExport, invalidation: { kind: 'tool-repair', reason: 'The serializer emitted an unusable value.', evidence: f.gap } },
    { id: 'draw', layer: 'restoration', decision: 'defer', reason: 'Still unverified; this file batch does not restore a world.', context },
  );
  f.request.operation.validationCases = [{ id: 'draw', layer: 'evidence' }];
  f.request.operation.argv = [node!, '-e', 'process.exit(2)'];
  const contract = await f.prepare(); await executeAcceptance(contract.contractAbsolutePath);
  const summary = collectAcceptance(contract.contractAbsolutePath, join(dirname(contract.contractAbsolutePath), 'receipt.json'));
  expect(summary).toMatchObject({ behavior: 'INCOMPLETE', failureLayer: 'tool', parentReview: 'PENDING' });
  expect(resumeAcceptance(contract.contractAbsolutePath).phase).toBe('REVIEW');
  expect(readFileSync(f.rawPath)).toEqual(before);
  expect(contract.request.validationSelection!.cases.map(item => [item.layer, item.decision])).toEqual([['behavior', 'reuse'], ['evidence', 'check'], ['restoration', 'defer']]);
  f.row.decision = 'check'; f.row.invalidation = { kind: 'tool-repair', reason: 'A serializer alone failed.', evidence: f.gap };
  f.request.operation.validationCases.push({ id: 'draw', layer: 'behavior' });
  await expect(f.prepare()).rejects.toThrow('cannot invalidate passed behavior');
});

test('missing prior proof can select a narrow replacement only with a bound insufficiency record', async () => {
  const f = fixture(); f.row.decision = 'check'; f.request.operation.validationCases = [{ id: 'draw', layer: 'behavior' }];
  rmSync(f.prior.absolutePath);
  f.row.invalidation = { kind: 'interface-change', reason: 'A version changed.', evidence: f.gap };
  await expect(f.prepare()).rejects.toThrow();
  f.row.invalidation = { kind: 'insufficient-evidence', reason: 'The specific prior proof cannot be read.', evidence: f.gap };
  const contract = await f.prepare(); let calls = 0;
  await dispatchPrepared(contract.contractAbsolutePath, async () => { calls++; }); expect(calls).toBe(1);
});

test('an appended plan cannot retain broad or unmapped commands that cover reused/deferred cases', async () => {
  const f = fixture();
  const marker = join(f.directory, 'preflight-ran');
  f.request.preflight[0]!.argv = [node!, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`];
  f.request.validationSelection!.cases.push({ id: 'new', layer: 'evidence', decision: 'check', reason: 'New narrow check.', context }, { id: 'later', layer: 'behavior', decision: 'defer', reason: 'Not this batch.', context });
  for (const refs of [undefined, [], [{ id: 'draw', layer: 'behavior' as const }, { id: 'new', layer: 'evidence' as const }], [{ id: 'later', layer: 'behavior' as const }]]) {
    f.request.operation.validationCases = refs;
    await expect(f.prepare()).rejects.toThrow('execution');
    expect(existsSync(marker)).toBe(false);
  }
  f.request.operation.validationCases = [{ id: 'new', layer: 'evidence' }];
  f.request.preflight[0]!.validationCases = [{ id: 'draw', layer: 'behavior' }];
  await expect(f.prepare()).rejects.toThrow('reused');
  expect(existsSync(marker)).toBe(false);
  f.request.preflight[0]!.validationCases = [];
  const contract = await f.prepare(); contract.request.operation.validationCases!.push({ id: 'draw', layer: 'behavior' }); updateContract(contract);
  let calls = 0; await expect(dispatchPrepared(contract.contractAbsolutePath, async () => { calls++; })).rejects.toThrow('reused'); expect(calls).toBe(0);
});

test('legacy file contracts without selection keep their existing execution and collection behavior', async () => {
  const f = fixture(); delete f.request.validationSelection; delete f.request.preflight[0]!.validationCases; delete f.request.operation.validationCases;
  const contract = await f.prepare(); expect(contract.request.validationSelection).toBeUndefined();
  await executeAcceptance(contract.contractAbsolutePath);
  expect(collectAcceptance(contract.contractAbsolutePath, join(dirname(contract.contractAbsolutePath), 'receipt.json'))).toMatchObject({ behavior: 'PASS', parentReview: 'PENDING', cleanup: 'NOT_REQUIRED' });
});

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileIdentity, sha256, workspaceIdentity } from './files';
import { inspectTaskState } from './handoff';
import { inspectPreservation } from './preservation';
import { runAcceptanceCli } from './cli';
import { runCommand } from '../process';

const owner = '11111111-1111-4111-8111-111111111111';
const reviewer = '22222222-2222-4222-8222-222222222222';
let sandbox: string;
let main: string;
let root: string;
let input: string;

function git(at: string, ...args: string[]) {
  const result = spawnSync('git', ['-C', at, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function save(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); return fileIdentity(path); }
function bytes(path: string, value: string) { writeFileSync(path, value); return fileIdentity(path); }
function snapshot(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    if (item.isDirectory()) Object.assign(result, snapshot(child));
    else result[child] = sha256(readFileSync(child));
  }
  return result;
}
function state() {
  return {
    protocolVersion: 1,
    task: { id: 'handoff-fixture', ownerThreadId: owner, reviewerThreadId: reviewer, goal: 'Verify a bounded candidate' },
    workspace: workspaceIdentity(root), candidates: [fileIdentity(join(root, 'source.txt'))],
    authority: { userInstructionRef: 'synthetic-authority', allowed: ['local fixture checks'] },
    case: { id: 'case-one', phase: 'REPORTED' },
    result: { reportStatus: 'COMPLETE', receiptId: 'receipt-one' },
    resume: { nextAction: 'Review this candidate', supersedes: [] as ReturnType<typeof fileIdentity>[], decision: null as ReturnType<typeof fileIdentity> | null },
    integration: { status: 'NOT_INTEGRATED', target: { repositoryRoot: main, ref: 'refs/heads/master', commit: git(main, 'rev-parse', 'HEAD') } },
  };
}
function decision(current: ReturnType<typeof state>) {
  return {
    taskId: current.task.id, caseId: current.case.id, reviewerThreadId: reviewer,
    authorityRef: current.authority.userInstructionRef, workspace: current.workspace, candidates: current.candidates,
    status: 'ACCEPTED_LIMITED_SCOPE', scope: 'case-one only', receiptId: current.result.receiptId,
    supersedes: current.resume.supersedes, nextAction: current.resume.nextAction,
    acceptedEvidence: [save(join(sandbox, 'raw.json'), { receiptId: 'receipt-one', parentReview: 'PENDING', behavior: 'INCOMPLETE' })],
  };
}
function preservation() {
  return { protocolVersion: 1, taskId: 'preservation-fixture', ownerThreadId: owner, workspace: workspaceIdentity(root), integration: { repositoryRoot: main, ref: 'refs/heads/master', commit: git(main, 'rev-parse', 'HEAD') }, entries: [] as Record<string, unknown>[], unknowns: [] as string[] };
}
function retain(kind: string, path: string, content: string) {
  const recovery = join(sandbox, `${kind}-${path.replaceAll('/', '_')}.saved`);
  bytes(recovery, content);
  return { kind, path, disposition: 'retain', reason: 'Unique fixture content', recovery: { kind: 'file', absolutePath: recovery } };
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fvtt-inspection-test-'));
  main = join(sandbox, 'main'); root = join(sandbox, 'candidate'); input = join(sandbox, 'input.json');
  mkdirSync(main);
  git(main, 'init', '-b', 'master');
  git(main, 'config', 'user.email', 'fixture@example.invalid'); git(main, 'config', 'user.name', 'Inspection fixture');
  git(main, 'config', 'core.autocrlf', 'false');
  bytes(join(main, 'AGENTS.md'), 'Fixture instructions\n'); bytes(join(main, '.gitignore'), '.local/\n'); bytes(join(main, 'source.txt'), 'base\n');
  git(main, 'add', '--', 'AGENTS.md', '.gitignore', 'source.txt'); git(main, 'commit', '-m', 'synthetic baseline');
  git(main, 'worktree', 'add', '-b', 'codex/fixture', root, 'master');
});
afterEach(() => {
  if (dirname(resolve(sandbox)) !== resolve(tmpdir()) || !sandbox.split(/[\\/]/).at(-1)?.startsWith('fvtt-inspection-test-')) throw new Error('Unowned fixture');
  rmSync(sandbox, { recursive: true, force: false });
});

test('report completion is separate from parent acceptance, integration and publication', () => {
  save(input, state()); const before = snapshot(sandbox);
  expect(inspectTaskState(input)).toMatchObject({ ok: true, reportStatus: 'COMPLETE', parentAcceptance: 'PENDING', integration: 'NOT_INTEGRATED', publication: 'NOT_CHECKED', authorityGranted: false });
  expect(snapshot(sandbox)).toEqual(before);
});

test('explicit bound parent acceptance supersedes an old STOP while the automatic receipt stays PENDING', () => {
  const current = state();
  current.resume.supersedes = [save(join(sandbox, 'old-stop.json'), { phase: 'STOP', updatedAt: '2099-01-01', nextAction: 'Repeat operation' })];
  const review = { ...decision(current), reviewedAt: '2020-01-01' };
  current.resume.decision = save(join(sandbox, 'decision.json'), review); save(input, current);
  const before = snapshot(sandbox);
  expect(inspectTaskState(input)).toMatchObject({ ok: true, parentAcceptance: 'ACCEPTED_LIMITED_SCOPE', supersededCount: 1, nextAction: 'Review this candidate', integration: 'NOT_INTEGRATED' });
  expect(snapshot(sandbox)).toEqual(before);
  expect(JSON.parse(readFileSync(join(sandbox, 'raw.json'), 'utf8')).parentReview).toBe('PENDING');
});

test('timestamps and a claimed supersession without a decision cannot replace an old stop', () => {
  const current = state(); current.resume.supersedes = [save(join(sandbox, 'stop.json'), { phase: 'STOP' })]; save(input, current);
  expect(() => inspectTaskState(input)).toThrow('require a decision');
});

test('a continuation can replace a stop without claiming acceptance', () => {
  const current = state(); current.resume.supersedes = [save(join(sandbox, 'stop.json'), { phase: 'STOP' })];
  current.resume.decision = save(join(sandbox, 'decision.json'), { ...decision(current), status: 'CONTINUE' }); save(input, current);
  expect(inspectTaskState(input)).toMatchObject({ parentAcceptance: 'PENDING', supersededCount: 1 });
});

test('wrong reviewer, receipt, case, next action and supersession bindings are rejected', () => {
  const current = state(); const valid = decision(current);
  for (const change of [{ reviewerThreadId: owner }, { receiptId: 'another' }, { caseId: 'another' }, { nextAction: 'Replay operation' }, { supersedes: [valid.acceptedEvidence[0]] }]) {
    current.resume.decision = save(join(sandbox, 'decision.json'), { ...valid, ...change }); save(input, current);
    expect(() => inspectTaskState(input)).toThrow();
  }
});

test('missing evidence, changed candidate and a newer mismatched workspace remain rejected', () => {
  const current = state(); current.resume.decision = save(join(sandbox, 'decision.json'), decision(current)); save(input, current);
  bytes(join(root, 'source.txt'), 'changed\n');
  expect(() => inspectTaskState(input)).toThrow('Readback mismatch');
  current.candidates = [fileIdentity(join(root, 'source.txt'))]; save(input, current);
  expect(() => inspectTaskState(input)).toThrow('Readback mismatch');
  current.resume.decision = { absolutePath: join(sandbox, 'missing.json'), sha256: 'a'.repeat(64) }; save(input, current);
  expect(() => inspectTaskState(input)).toThrow();
  current.resume.decision = null; current.workspace.head = 'a'.repeat(40); save(input, current);
  expect(() => inspectTaskState(input)).toThrow('baseline');
});

test('declared integration needs ancestry and cannot cover dirty candidate content', () => {
  const current = state(); current.integration.status = 'INTEGRATED'; save(input, current);
  expect(inspectTaskState(input).integration).toBe('INTEGRATED');
  bytes(join(root, 'source.txt'), 'dirty\n'); current.candidates = [fileIdentity(join(root, 'source.txt'))]; save(input, current);
  expect(() => inspectTaskState(input)).toThrow('Dirty candidate');
});

test('pure committed and explicitly integrated content passes without granting deletion', () => {
  save(input, preservation()); const before = snapshot(sandbox);
  expect(inspectPreservation(input)).toMatchObject({ ok: true, status: 'EVIDENCE_COMPLETE', counts: { index: 0, worktree: 0, ignored: 0, untracked: 0 }, deletionAuthorized: false, publication: 'NOT_CHECKED' });
  expect(snapshot(sandbox)).toEqual(before);
});

test('Git clean does not cover an ignored evidence file; a real matching retained file does', () => {
  mkdirSync(join(root, '.local')); bytes(join(root, '.local/evidence.json'), 'unique evidence');
  expect(git(root, 'status', '--porcelain=v1')).toBe('');
  const request = preservation(); save(input, request);
  expect(inspectPreservation(input)).toMatchObject({ ok: false, counts: { ignored: 1 }, unknowns: ['Unclassified ignored:.local/evidence.json'] });
  request.entries = [retain('ignored', '.local/evidence.json', 'unique evidence')]; save(input, request);
  const before = snapshot(sandbox);
  expect(inspectPreservation(input).ok).toBe(true); expect(snapshot(sandbox)).toEqual(before);
});

test('missing recovery, mismatched readback and recovery inside removal scope stay incomplete', () => {
  bytes(join(root, 'untracked.txt'), 'keep this');
  const request = preservation(); const entry = retain('untracked', 'untracked.txt', 'wrong version'); request.entries = [entry]; save(input, request);
  expect(inspectPreservation(input).unknowns.join()).toContain('do not match');
  entry.recovery.absolutePath = join(sandbox, 'missing'); save(input, request);
  expect(inspectPreservation(input).ok).toBe(false);
  entry.recovery.absolutePath = join(root, 'untracked.txt'); save(input, request);
  expect(inspectPreservation(input).unknowns.join()).toContain('inside');
}, 15_000);

test('staged, working and untracked versions require separate matching readbacks', () => {
  bytes(join(root, 'source.txt'), 'staged version'); git(root, 'add', '--', 'source.txt');
  bytes(join(root, 'source.txt'), 'working version'); bytes(join(root, 'draft.txt'), 'untracked version');
  const request = preservation(); request.entries = [retain('index', 'source.txt', 'staged version'), retain('worktree', 'source.txt', 'working version'), retain('untracked', 'draft.txt', 'untracked version')]; save(input, request);
  expect(inspectPreservation(input)).toMatchObject({ ok: true, counts: { index: 1, worktree: 1, untracked: 1 } });
  request.entries.shift(); save(input, request);
  expect(inspectPreservation(input).unknowns).toContain('Unclassified index:source.txt');
});

test('a reachable Git file is read back, while merely similar current implementation fails', () => {
  bytes(join(root, 'draft.txt'), 'base\n');
  const request = preservation(); request.entries = [{ kind: 'untracked', path: 'draft.txt', disposition: 'retain', reason: 'Exact bytes held by a retained ref', recovery: { kind: 'git', ...request.integration, path: 'source.txt' } }]; save(input, request);
  expect(inspectPreservation(input).ok).toBe(true);
  bytes(join(root, 'draft.txt'), 'base plus unique old delta\n');
  expect(inspectPreservation(input).unknowns.join()).toContain('do not match');
}, 15_000);

test('historical unknown scope stays unknown even with a clean integrated worktree', () => {
  const request = preservation(); request.unknowns = ['50 historical original versions have not been fully reconstructed']; save(input, request);
  expect(inspectPreservation(input)).toMatchObject({ ok: false, status: 'INCOMPLETE', unknowns: request.unknowns });
});

test('an unintegrated commit, stale ref or missing retained repository is not preserved integration', () => {
  const request = preservation(); bytes(join(root, 'source.txt'), 'topic commit'); git(root, 'add', '--', 'source.txt'); git(root, 'commit', '-m', 'unintegrated fixture');
  request.workspace = workspaceIdentity(root); save(input, request);
  expect(inspectPreservation(input).ok).toBe(false);
  request.integration.commit = 'a'.repeat(40); save(input, request); expect(inspectPreservation(input).ok).toBe(false);
  request.integration.repositoryRoot = join(sandbox, 'missing'); save(input, request); expect(inspectPreservation(input).ok).toBe(false);
}, 15_000);

test('regenerable declarations are exact, explicit and cannot waive tracked edits', () => {
  mkdirSync(join(root, '.local')); bytes(join(root, '.local/cache.txt'), 'generated');
  const request = preservation(); request.entries = [{ kind: 'ignored', path: '.local/cache.txt', disposition: 'regenerable', reason: 'Synthetic cache can be produced from the committed source' }]; save(input, request);
  expect(inspectPreservation(input).ok).toBe(true);
  bytes(join(root, 'source.txt'), 'unique'); request.entries.push({ kind: 'worktree', path: 'source.txt', disposition: 'regenerable', reason: 'Unsupported waiver' }); save(input, request);
  expect(inspectPreservation(input).ok).toBe(false);
});

test('hidden tracked edits and mode-only differences cannot pass a clean-content claim', () => {
  git(root, 'update-index', '--assume-unchanged', 'source.txt'); bytes(join(root, 'source.txt'), 'hidden draft');
  const request = preservation(); save(input, request);
  expect(inspectPreservation(input).unknowns.join()).toContain('Assume-unchanged');
  git(root, 'update-index', '--no-assume-unchanged', 'source.txt'); bytes(join(root, 'source.txt'), 'base\n');
  git(root, 'update-index', '--chmod=+x', 'source.txt');
  request.entries = [retain('index', 'source.txt', 'base\n')]; save(input, request);
  expect(inspectPreservation(input).unknowns.join()).toContain('mode changes');
});

test('a newly staged executable needs mode review despite an identical ordinary recovery file', () => {
  git(root, 'config', 'core.filemode', 'false');
  const content = '#!/bin/sh\nexit 0\n';
  bytes(join(root, 'script.sh'), content); git(root, 'add', '--', 'script.sh');
  git(root, 'update-index', '--chmod=+x', 'script.sh');
  expect(git(root, 'ls-files', '--stage', '--', 'script.sh')).toStartWith('100755 ');
  const request = preservation(); request.entries = [retain('index', 'script.sh', content)]; save(input, request);
  const inspection = inspectPreservation(input);
  expect(inspection.counts).toMatchObject({ index: 1, worktree: 0, untracked: 0, ignored: 0 });
  expect(inspection.evidence).toContainEqual(expect.objectContaining({ kind: 'index', path: 'script.sh', status: 'READ_BACK_MATCH' }));
  expect(inspection).toMatchObject({ ok: false, status: 'INCOMPLETE', deletionAuthorized: false });
  expect(inspection.unknowns.join()).toContain('mode changes');
});

test('a newly staged regular file still passes with an identical ordinary recovery file', () => {
  git(root, 'config', 'core.filemode', 'false');
  const content = 'new regular file\n';
  bytes(join(root, 'new.txt'), content); git(root, 'add', '--', 'new.txt');
  git(root, 'update-index', '--chmod=-x', 'new.txt');
  expect(git(root, 'ls-files', '--stage', '--', 'new.txt')).toStartWith('100644 ');
  const request = preservation(); request.entries = [retain('index', 'new.txt', content)]; save(input, request);
  expect(inspectPreservation(input)).toMatchObject({ ok: true, status: 'EVIDENCE_COMPLETE', unknowns: [], deletionAuthorized: false });
});

test('deletion intent and duplicate declarations remain unresolved rather than fabricated bytes', () => {
  // Deletes only this test's synthetic file, never a project or historical source.
  rmSync(join(root, 'source.txt')); git(root, 'add', '--', 'source.txt');
  const request = preservation(); request.entries = [retain('index', 'source.txt', 'base\n')]; save(input, request);
  expect(inspectPreservation(input).unknowns.join()).toContain('separate intent review');
  request.entries.push(request.entries[0]!); save(input, request);
  expect(() => inspectPreservation(input)).toThrow('Duplicate');
});

test('CLI preserves read-only refusal, exit code 2, and rejects action-bearing options', async () => {
  save(input, state()); const before = snapshot(sandbox); const output: string[] = [];
  expect(await runAcceptanceCli(['inspect-state', `--input=${input}`], line => output.push(line))).toBe(0);
  expect(JSON.parse(output.at(-1)!).parentAcceptance).toBe('PENDING');
  expect(await runAcceptanceCli(['inspect-state', `--input=${input}`, '--apply=true'], () => {})).toBe(2);
  expect(snapshot(sandbox)).toEqual(before);
  const request = preservation(); request.unknowns = ['Uninventoried ignored history']; save(input, request);
  const execution = await runCommand(process.execPath, [resolve(import.meta.dir, '../cli.ts'), 'acceptance', 'inspect-preservation', `--input=${input}`], { cwd: resolve(import.meta.dir, '../../../..'), timeoutMs: 10000 });
  expect(execution.exitCode).toBe(2);
  expect(JSON.parse(execution.stdout)).toMatchObject({ status: 'INCOMPLETE', deletionAuthorized: false });
});

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { runCommand } from '../process';
import { assertCurrent, exactPath, fileIdentity, instructionFiles, readJson, record, sha256, workspaceIdentity, writeNewJson } from './files';
import { AcceptanceError, type AcceptanceContract, type AcceptanceReceipt, type AcceptanceRequest, type AcceptanceSummary, type CheckCommand, type CheckResult } from './model';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(nonempty);

function validateCommand(value: unknown): CheckCommand {
  const command = record(value);
  if (!nonempty(command.id) || !strings(command.argv) || !Number.isInteger(command.timeoutMs)
    || (command.timeoutMs as number) < 1 || (command.timeoutMs as number) > 120_000
    || (command.expectJsonOk !== undefined && typeof command.expectJsonOk !== 'boolean')) {
    throw new AcceptanceError('precondition', 'Check requires id, nonempty argv and timeoutMs between 1 and 120000.');
  }
  fileIdentity(command.argv[0]!);
  return command as unknown as CheckCommand;
}

function validateRequest(value: unknown): AcceptanceRequest {
  const request = record(value);
  const authority = record(request.authority);
  if (!nonempty(request.goal) || !strings(request.acceptance) || !nonempty(request.caseId)
    || !nonempty(request.workspaceRoot) || !strings(request.candidatePaths)
    || !nonempty(authority.source) || authority.scope !== 'local-file-checks'
    || !['json-ok', 'manual'].includes(String(request.adapter))
    || !Array.isArray(request.preflight) || request.preflight.length === 0) {
    throw new AcceptanceError('precondition', 'Expected goal, acceptance, caseId, absolute workspace/candidates, local-file-checks authority, preflight and adapter.');
  }
  const checks = [...request.preflight.map(validateCommand), validateCommand(request.operation)];
  if (request.readonlySourcePaths !== undefined && !strings(request.readonlySourcePaths)) throw new AcceptanceError('precondition', 'readonlySourcePaths must be a nonempty absolute file list.');
  if (Array.isArray(request.readonlySourcePaths) && new Set(request.readonlySourcePaths.map(path => fileIdentity(path).absolutePath)).size !== request.readonlySourcePaths.length) throw new AcceptanceError('precondition', 'Read-only source paths must be unique.');
  if (request.externalBatch !== undefined) {
    const batch = record(request.externalBatch);
    if (batch.consumer !== 'server-next-vision-macro' || batch.runtimeAuthority !== 'NONE'
      || !strings(request.readonlySourcePaths)) throw new AcceptanceError('precondition', 'External batches require read-only sources and NONE runtime authority.');
  }
  if (new Set(checks.map(check => check.id)).size !== checks.length) throw new AcceptanceError('precondition', 'Check ids must be unique.');
  return request as unknown as AcceptanceRequest;
}

function jsonOk(stdout: string): boolean {
  try { return record(JSON.parse(stdout)).ok === true; } catch { return false; }
}

async function runCheck(command: CheckCommand, root: string): Promise<CheckResult> {
  // File-side checks do not implicitly inherit production connection settings.
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('FVTT_OPS_PRODUCTION_')));
  try {
    const result = await runCommand(command.argv[0]!, command.argv.slice(1), { cwd: root, timeoutMs: command.timeoutMs, environment });
    return { ...result, id: command.id, ok: result.exitCode === 0 && !result.timedOut && (!command.expectJsonOk || jsonOk(result.stdout)) };
  } catch (error) {
    return { id: command.id, ok: false, exitCode: 1, stdout: '', stderr: '', commandLine: command.argv.join(' '), error: error instanceof Error ? error.message : String(error) };
  }
}

export async function prepareAcceptance(inputPath: string): Promise<AcceptanceContract> {
  const request = validateRequest(readJson(inputPath));
  const workspace = workspaceIdentity(request.workspaceRoot);
  fileIdentity(inputPath, workspace.absoluteRoot);
  const candidates = [...new Set(request.candidatePaths)].map(path => fileIdentity(path, workspace.absoluteRoot));
  const instructions = instructionFiles(workspace.absoluteRoot, candidates);
  const runId = randomUUID();
  const directory = exactPath(join(workspace.absoluteRoot, '.local/development-feedback', runId), workspace.absoluteRoot);
  const contract: AcceptanceContract = {
    protocolVersion: 1, runId, dispatchId: randomUUID(), contractRevision: 1,
    contractAbsolutePath: join(directory, 'contract.json'), createdAt: new Date().toISOString(),
    request, workspace, candidates, instructions,
    executables: [...new Set([...request.preflight, request.operation].map(command => command.argv[0]!))].map(path => fileIdentity(path)),
    ...(request.readonlySourcePaths ? { readonlySources: [...new Set(request.readonlySourcePaths)].map(path => fileIdentity(path)) } : {}),
    preflight: [],
  };
  for (const check of request.preflight) {
    const result = await runCheck(check, workspace.absoluteRoot);
    contract.preflight.push(result);
    if (!result.ok) break;
  }
  assertCurrent(contract);
  mkdirSync(directory, { recursive: true });
  writeNewJson(contract.contractAbsolutePath, contract);
  writeNewJson(join(directory, 'contract-integrity.json'), { sha256: fileIdentity(contract.contractAbsolutePath).sha256 });
  // Minimum file serialization boundary, independent of a browser's display boundary.
  if (JSON.stringify(readJson(contract.contractAbsolutePath)) !== JSON.stringify(contract)) throw new AcceptanceError('evidence', 'Contract serialization readback failed.');
  return contract;
}

export function loadContract(path: string): AcceptanceContract {
  const absolute = exactPath(path);
  const value = record(readJson(absolute));
  if (value.protocolVersion !== 1 || value.contractRevision !== 1 || !uuid.test(String(value.runId))
    || !uuid.test(String(value.dispatchId)) || value.contractAbsolutePath !== absolute
    || !Array.isArray(value.candidates) || value.candidates.length === 0 || !Array.isArray(value.instructions)
    || !Array.isArray(value.executables) || value.executables.length === 0
    || (value.readonlySources !== undefined && !Array.isArray(value.readonlySources))
    || !Array.isArray(value.preflight)) throw new AcceptanceError('precondition', 'Invalid contract identity or absolute path.');
  validateRequest(value.request);
  const contract = value as unknown as AcceptanceContract;
  if (contract.request.readonlySourcePaths && JSON.stringify(contract.request.readonlySourcePaths.map(path => fileIdentity(path).absolutePath)) !== JSON.stringify(contract.readonlySources?.map(source => source.absolutePath))) throw new AcceptanceError('precondition', 'Read-only source list does not match its contract.');
  const expected = join(contract.workspace.absoluteRoot, '.local/development-feedback', contract.runId, 'contract.json');
  if (relative(resolve(expected), absolute)) throw new AcceptanceError('precondition', 'Contract belongs to another worktree or run.');
  if (record(readJson(join(dirname(absolute), 'contract-integrity.json'))).sha256 !== fileIdentity(absolute).sha256) throw new AcceptanceError('evidence', 'Contract bytes changed.');
  assertCurrent(contract);
  return contract;
}

export function assertPreflight(contract: AcceptanceContract): void {
  if (contract.preflight.length !== contract.request.preflight.length || contract.preflight.some((check, index) =>
    check.id !== contract.request.preflight[index]!.id || !check.ok || check.exitCode !== 0 || check.timedOut
    || (contract.request.preflight[index]!.expectJsonOk && !jsonOk(check.stdout)))) {
    throw new AcceptanceError('precondition', 'Preflight failed; dispatch is blocked.');
  }
}

export function requireReady(path: string): AcceptanceContract {
  const contract = loadContract(path);
  assertPreflight(contract);
  if (existsSync(join(dirname(path), 'dispatch-claim.json'))) throw new AcceptanceError('precondition', 'This dispatch was already claimed. Read resume; do not replay it.');
  return contract;
}

/** Host integration port. A failed preflight can never invoke the dispatch callback. */
export async function dispatchPrepared<T>(path: string, dispatch: (contract: AcceptanceContract) => Promise<T>): Promise<T> {
  const contract = requireReady(path);
  writeNewJson(join(dirname(path), 'dispatch-claim.json'), { dispatchId: contract.dispatchId, claimedAt: new Date().toISOString() });
  return dispatch(contract);
}

export async function executeAcceptance(path: string): Promise<AcceptanceReceipt> {
  return dispatchPrepared(path, async contract => {
    const result = await runCheck(contract.request.operation, contract.workspace.absoluteRoot);
    const directory = dirname(path);
    const rawPath = join(directory, 'raw.json');
    writeNewJson(rawPath, result);
    const receipt: AcceptanceReceipt = {
      protocolVersion: 1, receiptId: randomUUID(), runId: contract.runId, dispatchId: contract.dispatchId,
      contractRevision: contract.contractRevision, contractSha256: fileIdentity(path).sha256,
      caseId: contract.request.caseId, finishedAt: new Date().toISOString(), raw: fileIdentity(rawPath),
    };
    writeNewJson(join(directory, 'receipt.json'), receipt);
    return receipt;
  });
}

export function collectAcceptance(contractPath: string, receiptPath: string): AcceptanceSummary {
  const contract = loadContract(contractPath);
  assertPreflight(contract);
  if (record(readJson(join(dirname(contractPath), 'dispatch-claim.json'))).dispatchId !== contract.dispatchId) throw new AcceptanceError('evidence', 'Dispatch claim does not match this contract.');
  if (relative(join(dirname(contractPath), 'receipt.json'), exactPath(receiptPath))) throw new AcceptanceError('evidence', 'Receipt belongs to another worktree or run.');
  const receipt = record(readJson(receiptPath)) as unknown as AcceptanceReceipt;
  if (receipt.protocolVersion !== 1 || !uuid.test(String(receipt.receiptId)) || receipt.runId !== contract.runId
    || receipt.dispatchId !== contract.dispatchId || receipt.contractRevision !== contract.contractRevision
    || receipt.caseId !== contract.request.caseId || receipt.contractSha256 !== fileIdentity(contractPath).sha256) {
    throw new AcceptanceError('evidence', 'Stale or mismatched receipt identity.');
  }
  const rawPath = join(dirname(contractPath), 'raw.json');
  if (receipt.raw?.absolutePath !== rawPath || fileIdentity(rawPath).sha256 !== receipt.raw.sha256) throw new AcceptanceError('evidence', 'Raw receipt bytes or path changed.');
  const raw = record(readJson(rawPath)) as unknown as CheckResult;
  if (raw.id !== contract.request.operation.id || !Number.isInteger(raw.exitCode) || typeof raw.stdout !== 'string') throw new AcceptanceError('evidence', 'Invalid raw operation result.');
  const summary: AcceptanceSummary = {
    receiptId: receipt.receiptId, runId: contract.runId, caseId: receipt.caseId,
    behavior: 'INCOMPLETE', evidence: 'COMPLETE', cleanup: 'NOT_REQUIRED', parentReview: 'PENDING',
    failureLayer: 'evidence', reason: 'No automatic semantic adapter; independent review of the raw evidence is required.', raw: receipt.raw, exitCode: 2,
  };
  if (raw.timedOut || raw.error) {
    summary.failureLayer = 'tool';
    summary.reason = 'Operation timed out or failed to start. Inspect the recorded state before any new operation.';
  } else if (contract.request.adapter === 'json-ok') {
    let output: Record<string, unknown> | undefined;
    try { output = record(JSON.parse(raw.stdout)); } catch { /* Raw output remains available for review. */ }
    if (output?.ok === false) {
      Object.assign(summary, { behavior: 'FAIL', failureLayer: 'behavior', reason: 'The declared local JSON check reported ok:false.', exitCode: 1 });
    } else if (raw.exitCode !== 0) {
      Object.assign(summary, { failureLayer: 'tool', reason: 'Operation exited nonzero without a semantic failure result.' });
    } else if (output?.ok === true) {
      Object.assign(summary, { behavior: 'PASS', failureLayer: null, reason: 'The declared local JSON check reported ok:true and exited zero.', exitCode: 0 });
    } else {
      Object.assign(summary, { evidence: 'INCOMPLETE', reason: 'Expected one JSON object with a boolean ok; empty, malformed or unsupported output is incomplete.' });
    }
  }
  const summaryPath = join(dirname(contractPath), `summary.${receipt.receiptId}.json`);
  if (existsSync(summaryPath)) {
    if (sha256(readFileSync(summaryPath)) !== sha256(`${JSON.stringify(summary, null, 2)}\n`)) throw new AcceptanceError('evidence', 'Existing summary differs; do not overwrite accepted evidence.');
  } else writeNewJson(summaryPath, summary);
  return summary;
}

export function resumeAcceptance(path: string) {
  const contract = loadContract(path);
  const receiptPath = join(dirname(path), 'receipt.json');
  if (existsSync(receiptPath)) return { phase: 'REVIEW', nextAction: 'Review the linked raw evidence; parent acceptance is still pending.', summary: collectAcceptance(path, receiptPath) };
  if (existsSync(join(dirname(path), 'dispatch-claim.json'))) return { phase: 'INSPECT', nextAction: 'Dispatch is claimed without a receipt. Inspect existing process/output state; do not replay automatically.' };
  try { requireReady(path); return { phase: 'READY', nextAction: 'Execute the one declared local check or dispatch through the guarded host port.', contractAbsolutePath: contract.contractAbsolutePath }; }
  catch (error) { return { phase: 'BLOCKED', nextAction: 'Fix the failed preflight and prepare a new contract.', reason: error instanceof Error ? error.message : String(error) }; }
}

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assessNextVmReadback, inspectNextVmSource } from './adapters/next-vision-macro';
import { exactPath, fileIdentity, readJson, record, sha256, writeNewJson } from './files';
import { AcceptanceError, type AcceptanceContract, type AcceptanceRequest } from './model';
import { assertPreflight, loadContract, prepareAcceptance } from './workflow';
import { assertValidationSelection, validateValidationSelection } from './selection';

export async function prepareExternalBatch(inputPath: string): Promise<AcceptanceContract> {
  const input = record(readJson(inputPath));
  const authority = record(input.authority);
  if (typeof input.workspaceRoot !== 'string' || typeof input.sourceContractPath !== 'string'
    || typeof authority.source !== 'string' || !authority.source.trim() || authority.scope !== 'offline-batch-preparation') throw new AcceptanceError('precondition', 'Expected workspaceRoot, sourceContractPath and offline-batch-preparation authority.');
  const root = exactPath(input.workspaceRoot);
  fileIdentity(inputPath, root);
  const inspected = inspectNextVmSource(input.sourceContractPath);
  const validationSelection = validateValidationSelection(input.validationSelection);
  const cli = resolve(import.meta.dir, 'cli.ts');
  const inspectArgs = [process.execPath, 'run', cli, 'inspect-batch', `--source=${inspected.binding.sourceContract.absolutePath}`];
  const request: AcceptanceRequest = {
    goal: 'Prepare the existing Vision5e + Item Macro batch offline, preserving source ownership and runtime pause.',
    acceptance: ['Candidate and prepared tool bytes match the existing contract.', 'Offline PASS grants no runtime dispatch or cleanup authority.'],
    caseId: `${inspected.binding.sourceDispatchId}:offline-preparation`, workspaceRoot: root,
    candidatePaths: [fileIdentity(inputPath, root).absolutePath],
    authority: { source: authority.source, scope: 'local-file-checks' },
    preflight: [{ id: 'source-inspection', argv: inspectArgs, timeoutMs: 30000, expectJsonOk: true, ...(validationSelection ? { validationCases: [] } : {}) }],
    operation: { id: 'offline-source-readback', argv: inspectArgs, timeoutMs: 30000, ...(validationSelection ? { validationCases: [{ id: 'offline-source-readback', layer: 'evidence' as const }] } : {}) }, adapter: 'json-ok',
    readonlySourcePaths: [...new Set([...inspected.files.map(file => file.absolutePath), ...['model.ts', 'files.ts', 'workflow.ts', 'external.ts', 'selection.ts', 'cli.ts', 'adapters/next-vision-macro.ts'].map(path => fileIdentity(resolve(import.meta.dir, path)).absolutePath)])], externalBatch: inspected.binding,
    ...(validationSelection ? { validationSelection } : {}),
  };
  const directory = exactPath(join(root, '.local/development-feedback/requests'), root);
  mkdirSync(directory, { recursive: true });
  const generated = join(directory, `${randomUUID()}.json`);
  writeNewJson(generated, request);
  return prepareAcceptance(generated);
}

function batchContract(path: string) {
  const contract = loadContract(path);
  assertPreflight(contract);
  const batch = contract.request.externalBatch;
  if (!batch || batch.consumer !== 'server-next-vision-macro' || batch.runtimeAuthority !== 'NONE') throw new AcceptanceError('precondition', 'Expected an offline external batch contract.');
  return { contract, batch };
}

export function externalReadiness(path: string) {
  const { contract, batch } = batchContract(path);
  const validation = assertValidationSelection(contract.request.validationSelection);
  const offlineReady = contract.preflight.length === contract.request.preflight.length && contract.preflight.every(check => check.ok && check.exitCode === 0 && !check.timedOut);
  return { offlineReady, dispatchable: false as const, executionScope: 'offline-batch-preparation' as const, ...(validation ? { validation } : {}),
    sourceDispatchId: batch.sourceDispatchId, sourceStage: batch.sourceStage, parentContinuation: batch.parentContinuation,
    parentThreadId: batch.parentThreadId, childThreadId: batch.childThreadId,
    reason: 'Current scope has no runtime authority; source owner, pause/resume, fresh runtime identity and executor permission must be resolved before a real dispatch.' };
}

/** Guarded host port. This increment deliberately authorizes only offline preparation. */
export async function dispatchExternalBatch<T>(path: string, _dispatch: (contract: AcceptanceContract) => Promise<T>): Promise<T> {
  const readiness = externalReadiness(path);
  throw new AcceptanceError('precondition', readiness.reason);
}

function envelopeBinding(path: string, contract: AcceptanceContract) {
  const batch = contract.request.externalBatch!;
  return { protocolVersion: 1, runId: contract.runId, dispatchId: contract.dispatchId, contractRevision: contract.contractRevision,
    contractSha256: fileIdentity(path).sha256, sourceDispatchId: batch.sourceDispatchId, sourceContractSha256: batch.sourceContract.sha256 };
}

/** Wrap saved native output with known IDs; no user-entered run/dispatch/hash fields. */
export function captureExternalReceipt(contractPath: string, rawPath: string, contextPath: string) {
  const { contract, batch } = batchContract(contractPath);
  const bytes = readFileSync(fileIdentity(rawPath).absolutePath);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new AcceptanceError('evidence', 'Native receipt must be lossless UTF-8.');
  const suppliedContext = record(readJson(contextPath));
  const context = Object.fromEntries(Object.keys(batch.target).map(key => [key, suppliedContext[key]]));
  assessNextVmReadback(batch, context, text);
  const envelope = { binding: envelopeBinding(contractPath, contract), context, raw: { text, sha256: sha256(bytes) } };
  const directory = exactPath(join(dirname(contractPath), 'captures'), contract.workspace.absoluteRoot);
  mkdirSync(directory, { recursive: true });
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  const envelopePath = join(directory, `${sha256(serialized)}.json`);
  if (!existsSync(envelopePath)) writeNewJson(envelopePath, envelope);
  else if (readFileSync(envelopePath, 'utf8') !== serialized) throw new AcceptanceError('evidence', 'Captured envelope bytes changed.');
  return { envelopePath, ...envelopeBinding(contractPath, contract), runtime: 'NOT_EXECUTED', purpose: 'REFERENCE_ONLY' };
}

export function importExternalReceipt(contractPath: string, inputPath: string) {
  const { contract, batch } = batchContract(contractPath);
  const input = fileIdentity(inputPath);
  const bytes = readFileSync(input.absolutePath);
  const envelope = record(JSON.parse(bytes.toString('utf8')));
  const binding = record(envelope.binding);
  const expected = envelopeBinding(contractPath, contract);
  for (const [key, value] of Object.entries(expected)) if (binding[key] !== value) throw new AcceptanceError('evidence', `Old or wrong external receipt binding: ${key}`);
  const raw = record(envelope.raw);
  if (typeof raw.text !== 'string' || raw.sha256 !== sha256(raw.text)) throw new AcceptanceError('evidence', 'Native receipt bytes changed or are missing.');
  const assessment = assessNextVmReadback(batch, envelope.context, raw.text);
  const directory = exactPath(join(dirname(contractPath), 'imports', input.sha256), contract.workspace.absoluteRoot);
  const summaryPath = join(directory, 'summary.json');
  if (existsSync(summaryPath)) {
    const existing = record(readJson(summaryPath));
    if (fileIdentity(join(directory, 'envelope.json')).sha256 !== input.sha256 || fileIdentity(join(directory, 'native.json')).sha256 !== raw.sha256) throw new AcceptanceError('evidence', 'Imported original bytes changed.');
    const { receiptId: _id, importedAt: _time, ...stable } = existing;
    const intended = { ...expected, ...assessment, inputSha256: input.sha256, nativeSha256: raw.sha256, parentReview: 'PENDING', purpose: 'REFERENCE_ONLY' };
    if (JSON.stringify(stable) !== JSON.stringify(intended)) throw new AcceptanceError('evidence', 'Imported summary changed.');
    return existing;
  }
  mkdirSync(directory, { recursive: true });
  exactPath(directory, contract.workspace.absoluteRoot);
  const saveOriginal = (path: string, content: Buffer) => {
    if (existsSync(path)) {
      if (!readFileSync(fileIdentity(path, directory).absolutePath).equals(content)) throw new AcceptanceError('evidence', 'Partial imported original differs; inspect it instead of overwriting.');
    } else writeFileSync(exactPath(path, directory), content, { flag: 'wx' });
  };
  saveOriginal(join(directory, 'envelope.json'), bytes);
  saveOriginal(join(directory, 'native.json'), Buffer.from(raw.text, 'utf8'));
  const summary = { receiptId: randomUUID(), importedAt: new Date().toISOString(), ...expected, ...assessment,
    inputSha256: input.sha256, nativeSha256: raw.sha256, parentReview: 'PENDING', purpose: 'REFERENCE_ONLY' };
  writeNewJson(summaryPath, summary);
  return summary;
}

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { assessNextVmReadback } from './adapters/next-vision-macro';
import { exactPath, fileIdentity, readJson, record, writeNewJson } from './files';
import { AcceptanceError, type AcceptanceContract, type FileIdentity } from './model';
import { assertPreflight, loadContract } from './workflow';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export interface RuntimeBatchContract {
  protocolVersion: 1; dispatchId: string; contractRevision: 1; createdAt: string; contractAbsolutePath: string;
  offlineContract: FileIdentity; authority: FileIdentity; permissions: FileIdentity; service: FileIdentity;
  implementation: FileIdentity[]; parentThreadId: string; childThreadId: string; model: string; reasoningEffort: string;
}
type RuntimeProbe = (contract: RuntimeBatchContract, offline: AcceptanceContract) => void;

/** Inspect only metadata in the exact executor session, never export history or credentials. */
async function latestContext(path: string) {
  let context: Record<string, unknown> | undefined;
  const lines = createInterface({ input: createReadStream(fileIdentity(path).absolutePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"turn_context"')) continue;
    const event = record(JSON.parse(line));
    if (event.type === 'turn_context') context = record(event.payload);
  }
  if (!context) throw new AcceptanceError('precondition', 'Executor actual turn_context is missing.');
  return context;
}

async function checkPermissions(path: string, authority: Record<string, unknown>, current = true) {
  const permission = record(readJson(path));
  if (permission.threadId !== authority.childThreadId || permission.model !== authority.model
    || permission.reasoningEffort !== authority.reasoningEffort || permission.sandboxMode !== 'danger-full-access'
    || permission.approvalPolicy !== 'never' || permission.verifiedFromActualHostContext !== true
    || !text(permission.actualContextPath) || !text(permission.actualTurnId)) {
    throw new AcceptanceError('precondition', 'Matching actual executor model/effort and Full Access receipt required.');
  }
  // This session must belong to the exact child. A different Full Access task is not proof.
  if (!permission.actualContextPath.endsWith(`${authority.childThreadId}.jsonl`)) throw new AcceptanceError('precondition', 'Executor context belongs to another thread.');
  if (current) {
    const context = await latestContext(permission.actualContextPath);
    if (context.turn_id !== permission.actualTurnId || context.model !== authority.model || context.effort !== authority.reasoningEffort
      || context.approval_policy !== 'never' || record(context.sandbox_policy).type !== 'danger-full-access') {
      throw new AcceptanceError('precondition', 'Executor actual configuration changed; refresh its preflight receipt.');
    }
  }
}

function checkAuthority(path: string, offline: AcceptanceContract) {
  const authority = record(readJson(path));
  if (authority.scope !== 'local-next-vm-runtime' || authority.resumeSourceDispatchId !== offline.request.externalBatch?.sourceDispatchId
    || authority.explicitUserResume !== true || !text(authority.source) || !text(authority.model) || !text(authority.reasoningEffort)
    || !uuid.test(String(authority.parentThreadId)) || !uuid.test(String(authority.childThreadId))
    || authority.parentThreadId === authority.childThreadId || authority.childThreadId !== offline.request.externalBatch?.childThreadId) {
    throw new AcceptanceError('precondition', 'Explicit current batch resume, callback parent and original executor are required.');
  }
  // Host authorization remains the caller's responsibility; JSON records it, never grants it.
  return authority;
}

function offlineContract(path: string) {
  const offline = loadContract(path); assertPreflight(offline);
  if (offline.request.externalBatch?.consumer !== 'server-next-vision-macro') throw new AcceptanceError('precondition', 'Expected a prepared Next Vision/Macro batch.');
  return offline;
}

function probeService(contract: RuntimeBatchContract, offline: AcceptanceContract) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', resolve(import.meta.dir, 'runtime-service-check.ps1'),
    '-ServiceReceipt', contract.service.absolutePath, '-SourceContract', offline.request.externalBatch!.sourceContract.absolutePath,
    '-ParentThreadId', contract.parentThreadId, '-ExecutorThreadId', contract.childThreadId],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.error || result.status !== 0) throw new AcceptanceError('precondition', `Fresh service identity check failed: ${result.error?.message ?? result.stderr.trim()}`);
  if (record(JSON.parse(result.stdout)).ok !== true) throw new AcceptanceError('precondition', 'Service probe did not return explicit success.');
  const source = record(readJson(offline.request.externalBatch!.sourceContract.absolutePath));
  // Verify installed bytes against the already-bound candidate inventory, not just manifest versions.
  for (const value of source.candidates as unknown[]) {
    const candidate = record(value);
    const root = exactPath(join(offline.request.externalBatch!.target.dataPath, 'Data/modules', String(candidate.id)));
    for (const value of candidate.files as unknown[]) {
      const expected = record(value);
      if (fileIdentity(join(root, String(expected.path)), root).sha256 !== expected.sha256) throw new AcceptanceError('precondition', `Installed candidate hash changed: ${candidate.id}/${expected.path}`);
    }
  }
}

export async function prepareRuntimeBatch(inputPath: string, probe: RuntimeProbe = probeService) {
  const input = record(readJson(inputPath));
  for (const key of ['offlineContractPath', 'authorityPath', 'executorPermissionsPath', 'serviceReceiptPath']) if (!text(input[key])) throw new AcceptanceError('precondition', `Missing runtime ${key}.`);
  const offline = offlineContract(String(input.offlineContractPath));
  fileIdentity(inputPath, offline.workspace.absoluteRoot);
  const authority = checkAuthority(String(input.authorityPath), offline);
  await checkPermissions(String(input.executorPermissionsPath), authority);
  const directory = exactPath(join(dirname(offline.contractAbsolutePath), 'runtime', randomUUID()), offline.workspace.absoluteRoot);
  const contract: RuntimeBatchContract = { protocolVersion: 1, dispatchId: randomUUID(), contractRevision: 1,
    createdAt: new Date().toISOString(), contractAbsolutePath: join(directory, 'contract.json'),
    offlineContract: fileIdentity(offline.contractAbsolutePath), authority: fileIdentity(String(input.authorityPath)),
    permissions: fileIdentity(String(input.executorPermissionsPath)), service: fileIdentity(String(input.serviceReceiptPath)),
    implementation: ['runtime.ts', 'runtime-service-check.ps1'].map(path => fileIdentity(resolve(import.meta.dir, path))),
    parentThreadId: String(authority.parentThreadId), childThreadId: String(authority.childThreadId), model: String(authority.model), reasoningEffort: String(authority.reasoningEffort) };
  probe(contract, offline);
  mkdirSync(directory, { recursive: true }); writeNewJson(contract.contractAbsolutePath, contract);
  writeNewJson(join(directory, 'integrity.json'), fileIdentity(contract.contractAbsolutePath));
  return contract;
}

function loadRuntime(path: string) {
  const identity = fileIdentity(path), value = record(readJson(path));
  if (record(readJson(join(dirname(path), 'integrity.json'))).sha256 !== identity.sha256 || value.contractAbsolutePath !== identity.absolutePath
    || value.protocolVersion !== 1 || value.contractRevision !== 1 || !uuid.test(String(value.dispatchId))) throw new AcceptanceError('evidence', 'Runtime contract identity or bytes changed.');
  const contract = value as unknown as RuntimeBatchContract;
  const offline = offlineContract(contract.offlineContract.absolutePath);
  exactPath(path, offline.workspace.absoluteRoot);
  for (const identity of [contract.offlineContract, contract.authority, contract.permissions, contract.service, ...contract.implementation]) {
    if (fileIdentity(identity.absolutePath).sha256 !== identity.sha256) throw new AcceptanceError('precondition', `Runtime prerequisite bytes changed: ${identity.absolutePath}`);
  }
  const authority = checkAuthority(contract.authority.absolutePath, offline);
  for (const key of ['parentThreadId', 'childThreadId', 'model', 'reasoningEffort'] as const) if (authority[key] !== contract[key]) throw new AcceptanceError('evidence', `Runtime authority mismatch: ${key}`);
  return { contract, offline, authority };
}

export async function runtimeReadiness(path: string, probe: RuntimeProbe = probeService) {
  const { contract, offline, authority } = loadRuntime(path);
  await checkPermissions(contract.permissions.absolutePath, authority); probe(contract, offline);
  if (existsSync(join(dirname(path), 'claim.json'))) throw new AcceptanceError('precondition', 'Runtime dispatch already claimed; inspect results, do not replay.');
  return { dispatchable: true, executionScope: 'local-next-vm-runtime', ...contract,
    sourceDispatchId: offline.request.externalBatch!.sourceDispatchId, target: offline.request.externalBatch!.target,
    fixtureIds: offline.request.externalBatch!.fixtureIds, sourceContract: offline.request.externalBatch!.sourceContract,
    parentReview: 'PENDING', cleanup: 'NOT_EXECUTED' };
}

/** Atomic one-time boundary; transport failure leaves the claim for inspection, not automatic replay. */
export async function dispatchRuntimeBatch<T>(path: string, dispatch: (ready: Awaited<ReturnType<typeof runtimeReadiness>>) => Promise<T>, probe: RuntimeProbe = probeService): Promise<T> {
  const ready = await runtimeReadiness(path, probe);
  writeNewJson(join(dirname(path), 'claim.json'), { dispatchId: ready.dispatchId, contractRevision: ready.contractRevision,
    parentThreadId: ready.parentThreadId, childThreadId: ready.childThreadId, claimedAt: new Date().toISOString() });
  return dispatch(ready);
}

/** Saved evidence is bound independently of its PASS labels; UI and cleanup require parent review. */
export function collectRuntimeBatch(path: string, inputPath: string) {
  const { contract, offline } = loadRuntime(path);
  const claim = record(readJson(join(dirname(path), 'claim.json'))), input = record(readJson(inputPath));
  const binding = record(input.binding);
  const expected = { dispatchId: contract.dispatchId, contractRevision: contract.contractRevision, contractSha256: fileIdentity(path).sha256,
    parentThreadId: contract.parentThreadId, childThreadId: contract.childThreadId };
  for (const [key, value] of Object.entries(expected)) if (binding[key] !== value || (key !== 'contractSha256' && claim[key] !== value)) throw new AcceptanceError('evidence', `Wrong runtime callback binding: ${key}`);
  if (!text(input.nativePath) || !text(input.contextPath) || !Array.isArray(input.evidencePaths) || input.evidencePaths.length === 0 || !input.evidencePaths.every(text)) throw new AcceptanceError('evidence', 'Native readback, independent context and evidence paths required.');
  const native = fileIdentity(input.nativePath), context = fileIdentity(input.contextPath);
  const assessment = assessNextVmReadback(offline.request.externalBatch!, readJson(context.absolutePath), readFileSync(native.absolutePath, 'utf8'));
  const artifacts = input.evidencePaths.map(path => fileIdentity(path));
  const stable = { ...expected, sourceDispatchId: offline.request.externalBatch!.sourceDispatchId, observations: assessment.observations,
    native, context, artifacts, input: fileIdentity(inputPath), runtime: 'OBSERVED', behavior: 'INCOMPLETE', evidence: 'PENDING_PARENT_REVIEW', cleanup: 'PENDING_PARENT_REVIEW', parentReview: 'PENDING' };
  const output = join(dirname(path), `receipt-${stable.input.sha256}.json`);
  if (existsSync(output)) {
    const { receiptId: _id, collectedAt: _time, ...saved } = record(readJson(output));
    if (JSON.stringify(saved) !== JSON.stringify(stable)) throw new AcceptanceError('evidence', 'Saved runtime receipt changed.');
  } else writeNewJson(output, { receiptId: randomUUID(), collectedAt: new Date().toISOString(), ...stable });
  return { receiptPath: output, ...record(readJson(output)) } as Record<string, unknown> & { receiptPath: string };
}

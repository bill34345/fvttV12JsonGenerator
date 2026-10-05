import type { CommandResult } from '../types';

/** File-side pilot only. Commands are reviewed local checks, not a permission grant or sandbox. */
export interface CheckCommand {
  id: string;
  argv: string[];
  timeoutMs: number;
  expectJsonOk?: boolean;
  /** Explicit coverage when validationSelection is enabled; [] is only for preparation. */
  validationCases?: ValidationCaseRef[];
}

export interface AcceptanceRequest {
  goal: string;
  acceptance: string[];
  caseId: string;
  workspaceRoot: string;
  candidatePaths: string[];
  authority: { source: string; scope: 'local-file-checks' };
  preflight: CheckCommand[];
  operation: CheckCommand;
  adapter: 'json-ok' | 'manual';
  readonlySourcePaths?: string[];
  externalBatch?: ExternalBatchBinding;
  validationSelection?: ValidationSelection;
}

export type ValidationLayer = 'behavior' | 'evidence' | 'restoration';
export interface ValidationCaseRef { id: string; layer: ValidationLayer }
export interface ValidationEvidence {
  caseId: string;
  layer: ValidationLayer;
  outcome: AcceptanceStatus;
  /** Only the relevant target/interface/code facts, as established by the evidence reviewer. */
  context: Record<string, string>;
  evidence: FileIdentity[];
}
export interface ValidationCase {
  id: string;
  layer: ValidationLayer;
  decision: 'reuse' | 'check' | 'defer';
  reason: string;
  context: Record<string, string>;
  /** Immutable case-level binding; it references legacy originals without rewriting them. */
  previous?: FileIdentity;
  invalidation?: {
    kind: 'behavior-change' | 'interface-change' | 'new-failure' | 'insufficient-evidence' | 'required-integration' | 'unknown-impact' | 'tool-repair' | 'restoration-gap';
    reason: string;
    evidence: FileIdentity;
  };
}
export interface ValidationSelection { cases: ValidationCase[] }

export interface ExternalBatchBinding {
  consumer: 'server-next-vision-macro';
  sourceContract: FileIdentity;
  sourceDispatchId: string;
  sourceWorkspace: AcceptanceContract['workspace'];
  parentThreadId: string;
  childThreadId: string;
  sourceStage: string;
  parentContinuation: string;
  runtimeAuthority: 'NONE';
  target: { origin: string; dataPath: string; world: string; foundry: string; system: string; systemVersion: string };
  candidates: Array<{ id: string; version: string }>;
  fixtureIds: Record<string, string>;
  itemCommandSha256: string;
}

export interface FileIdentity { absolutePath: string; sha256: string }
export interface CheckResult extends CommandResult { id: string; ok: boolean; error?: string }
export interface AcceptanceContract {
  protocolVersion: 1;
  runId: string;
  dispatchId: string;
  contractRevision: 1;
  contractAbsolutePath: string;
  createdAt: string;
  request: AcceptanceRequest;
  workspace: { absoluteRoot: string; branch: string; head: string; instructionBaseline: string };
  candidates: FileIdentity[];
  instructions: FileIdentity[];
  executables: FileIdentity[];
  readonlySources?: FileIdentity[];
  preflight: CheckResult[];
}

export interface AcceptanceReceipt {
  protocolVersion: 1;
  receiptId: string;
  runId: string;
  dispatchId: string;
  contractRevision: 1;
  contractSha256: string;
  caseId: string;
  finishedAt: string;
  raw: FileIdentity;
}

export type AcceptanceStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';
export interface AcceptanceSummary {
  receiptId: string;
  runId: string;
  caseId: string;
  behavior: AcceptanceStatus;
  evidence: 'COMPLETE' | 'INCOMPLETE';
  cleanup: 'NOT_REQUIRED';
  parentReview: 'PENDING';
  failureLayer: 'tool' | 'behavior' | 'evidence' | null;
  reason: string;
  raw: FileIdentity;
  exitCode: number;
}

export class AcceptanceError extends Error {
  constructor(readonly layer: 'precondition' | 'evidence', message: string) { super(message); }
}

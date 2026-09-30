import type { CommandResult } from '../types';

/** File-side pilot only. Commands are reviewed local checks, not a permission grant or sandbox. */
export interface CheckCommand {
  id: string;
  argv: string[];
  timeoutMs: number;
  expectJsonOk?: boolean;
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

import { relative } from 'node:path';
import { exactPath, readJson, record, workspaceIdentity } from './files';
import { AcceptanceError } from './model';
import { gitRead, integratedCommit, list, readback, requiredText, samePath } from './inspection';

/** Inspect the current task contract, never mutate immutable per-run receipts. */
export function inspectTaskState(path: string) {
  const currentStatePath = exactPath(path);
  const state = record(readJson(currentStatePath));
  if (state.template === true || state.protocolVersion !== 1) throw new AcceptanceError('evidence', 'An actual protocolVersion 1 task contract is required.');
  const task = record(state.task);
  const taskId = requiredText(task.id, 'task.id');
  const ownerThreadId = requiredText(task.ownerThreadId, 'task.ownerThreadId');
  const reviewerThreadId = requiredText(task.reviewerThreadId, 'task.reviewerThreadId');
  if (![ownerThreadId, reviewerThreadId].every(id => /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))) throw new AcceptanceError('evidence', 'Owner and reviewer must be exact thread UUIDs.');
  requiredText(task.goal, 'task.goal');
  const declared = record(state.workspace);
  const workspace = workspaceIdentity(requiredText(declared.absoluteRoot, 'workspace.absoluteRoot'));
  if (!samePath(workspace.absoluteRoot, String(declared.absoluteRoot)) || workspace.branch !== declared.branch || workspace.head !== declared.head || workspace.instructionBaseline !== declared.instructionBaseline) throw new AcceptanceError('evidence', 'Current workspace identity differs from the declared baseline.');
  const candidates = list(state.candidates, 'candidates').map(value => {
    const identity = readback(value);
    exactPath(identity.absolutePath, workspace.absoluteRoot);
    return identity;
  }).sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
  if (!candidates.length || new Set(candidates.map(item => item.absolutePath)).size !== candidates.length) throw new AcceptanceError('evidence', 'Declare distinct candidate files.');
  const authority = record(state.authority);
  const authorityRef = requiredText(authority.userInstructionRef, 'authority.userInstructionRef');
  if (!list(authority.allowed, 'authority.allowed').map(value => requiredText(value, 'allowed scope')).length) throw new AcceptanceError('evidence', 'Declare the authorized scope.');
  const caseId = requiredText(record(state.case).id, 'case.id');
  const phase = requiredText(record(state.case).phase, 'case.phase');
  const result = record(state.result);
  const reportStatus = requiredText(result.reportStatus, 'result.reportStatus');
  if (!['NOT_REPORTED', 'COMPLETE', 'INCOMPLETE'].includes(reportStatus)) throw new AcceptanceError('evidence', 'Invalid reportStatus.');
  const resume = record(state.resume);
  const nextAction = requiredText(resume.nextAction, 'resume.nextAction');
  const supersedes = list(resume.supersedes, 'resume.supersedes').map(readback);
  if (supersedes.some(item => !relative(item.absolutePath, currentStatePath))) throw new AcceptanceError('evidence', 'The current state cannot supersede itself.');
  let parentAcceptance = 'PENDING';
  let acceptedEvidence: ReturnType<typeof readback>[] = [];
  if (resume.decision != null) {
    const decisionIdentity = readback(resume.decision);
    const decision = record(readJson(decisionIdentity.absolutePath));
    if (decision.template === true) throw new AcceptanceError('evidence', 'A template is not a decision.');
    if (decision.taskId !== taskId || decision.caseId !== caseId || decision.reviewerThreadId !== reviewerThreadId || decision.authorityRef !== authorityRef || decision.nextAction !== nextAction) throw new AcceptanceError('evidence', 'Decision task, reviewer, authority or next action does not match.');
    const decisionWorkspace = record(decision.workspace);
    if (!samePath(String(decisionWorkspace.absoluteRoot), workspace.absoluteRoot) || decisionWorkspace.head !== workspace.head) throw new AcceptanceError('evidence', 'Decision belongs to a different workspace baseline.');
    const decisionCandidates = list(decision.candidates, 'decision.candidates').map(readback).sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
    if (JSON.stringify(decisionCandidates) !== JSON.stringify(candidates)) throw new AcceptanceError('evidence', 'Decision candidate set differs.');
    const replaced = list(decision.supersedes, 'decision.supersedes').map(readback);
    if (JSON.stringify(replaced) !== JSON.stringify(supersedes)) throw new AcceptanceError('evidence', 'Each superseded stop needs an explicitly bound decision.');
    requiredText(decision.scope, 'decision.scope');
    if (!['CONTINUE', 'ACCEPTED_LIMITED_SCOPE'].includes(String(decision.status))) throw new AcceptanceError('evidence', 'Unsupported decision status.');
    if (decision.status === 'ACCEPTED_LIMITED_SCOPE') {
      if (ownerThreadId === reviewerThreadId) throw new AcceptanceError('evidence', 'Independent acceptance requires a distinct reviewer.');
      if (!result.receiptId || decision.receiptId !== result.receiptId) throw new AcceptanceError('evidence', 'Accepted receipt identity differs.');
      acceptedEvidence = list(decision.acceptedEvidence, 'decision.acceptedEvidence').map(readback);
      if (!acceptedEvidence.length) throw new AcceptanceError('evidence', 'Acceptance requires linked evidence.');
      parentAcceptance = 'ACCEPTED_LIMITED_SCOPE';
    }
  } else if (supersedes.length) throw new AcceptanceError('evidence', 'Superseded stops require a decision; timestamps do not grant authority.');
  const integration = record(state.integration);
  if (!['NOT_INTEGRATED', 'INTEGRATED'].includes(String(integration.status))) throw new AcceptanceError('evidence', 'Invalid integration status.');
  if (integration.status === 'INTEGRATED') {
    integratedCommit(integration.target, workspace.head);
    if (gitDirty(workspace.absoluteRoot)) throw new AcceptanceError('evidence', 'Dirty candidate content is not proved integrated by its HEAD.');
    for (const candidate of candidates) gitRead(workspace.absoluteRoot, ['ls-files', '--error-unmatch', '--', relative(workspace.absoluteRoot, candidate.absolutePath)]);
    if (gitRead(workspace.absoluteRoot, ['ls-files', '-v', '-z']).toString().split('\0').some(item => /^[a-zS] /.test(item))) throw new AcceptanceError('evidence', 'Hidden working tree flags require separate content review.');
  }
  return { ok: true, currentStatePath, taskId, ownerThreadId, reviewerThreadId, workspace, caseId, phase, reportStatus, parentAcceptance, acceptedEvidence, supersededCount: supersedes.length, integration: integration.status, publication: 'NOT_CHECKED', nextAction, authorityGranted: false, note: 'Checks identity and explicit decision bindings; human authority, evidence meaning and cross-project acceptance require source review.' };
}

function gitDirty(root: string): boolean { return gitRead(root, ['status', '--porcelain=v1', '--untracked-files=all']).length > 0; }

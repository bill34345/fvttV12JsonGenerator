import { isAbsolute } from 'node:path';
import { fileIdentity, readJson, record } from './files';
import { AcceptanceError, type CheckCommand, type FileIdentity, type ValidationCaseRef, type ValidationEvidence, type ValidationSelection } from './model';

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const layers = ['behavior', 'evidence', 'restoration'];
const causes = ['behavior-change', 'interface-change', 'new-failure', 'insufficient-evidence', 'required-integration', 'unknown-impact', 'tool-repair', 'restoration-gap'];
function fail(message: string): never { throw new AcceptanceError('precondition', `Validation selection: ${message}`); }
function context(value: unknown): Record<string, string> {
  const facts = record(value);
  if (!Object.keys(facts).length || Object.entries(facts).some(([key, value]) => !text(key) || !text(value))) fail('context must declare nonempty relevant facts.');
  return facts as Record<string, string>;
}
function reference(value: unknown): FileIdentity {
  const file = record(value);
  if (!text(file.absolutePath) || !isAbsolute(file.absolutePath) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) fail('evidence requires an absolute path and SHA-256.');
  return file as unknown as FileIdentity;
}
function readback(value: unknown): FileIdentity {
  const file = reference(value), actual = fileIdentity(file.absolutePath);
  if (actual.sha256 !== file.sha256) fail(`evidence bytes changed: ${file.absolutePath}`);
  return actual;
}

/** Shape validation is also safe when collecting old observations; it does not invalidate results. */
export function validateValidationSelection(value: unknown): ValidationSelection | undefined {
  if (value === undefined) return undefined;
  const selection = record(value);
  if (!Array.isArray(selection.cases) || !selection.cases.length) fail('cases must be a nonempty array.');
  const seen = new Set<string>();
  for (const value of selection.cases as unknown[]) {
    const item = record(value);
    if (!text(item.id) || !layers.includes(String(item.layer)) || !['reuse', 'check', 'defer'].includes(String(item.decision)) || !text(item.reason)) fail('each case needs id, layer, decision and a concrete reason.');
    const key = JSON.stringify([item.id, item.layer]);
    if (seen.has(key)) fail(`duplicate case/layer: ${item.id}/${item.layer}`);
    seen.add(key); context(item.context);
    if (item.previous !== undefined) reference(item.previous);
    if (item.invalidation !== undefined) {
      const cause = record(item.invalidation);
      if (!causes.includes(String(cause.kind)) || !text(cause.reason)) fail('invalidation needs a supported kind and a concrete reason.');
      reference(cause.evidence);
    }
  }
  return selection as unknown as ValidationSelection;
}

function previousEvidence(identity: FileIdentity): ValidationEvidence {
  const proof = record(readJson(readback(identity).absolutePath));
  if (!text(proof.caseId) || !layers.includes(String(proof.layer)) || !['PASS', 'FAIL', 'INCOMPLETE'].includes(String(proof.outcome)) || !Array.isArray(proof.evidence) || !proof.evidence.length) fail('previous binding needs caseId, layer, outcome, context and original evidence.');
  context(proof.context);
  proof.evidence.forEach(readback);
  return proof as unknown as ValidationEvidence;
}
function known(facts: Record<string, string>): boolean {
  return Object.values(facts).every(value => !/^(unknown|unverified|pending|tbd|n\/a|\?|<.*>)$/i.test(value.trim()));
}
function sameContext(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

export function validationSelectionSummary(selection: ValidationSelection) {
  const rows = (decision: string) => selection.cases.filter(item => item.decision === decision).map(item => ({ id: item.id, layer: item.layer, reason: item.reason, ...(item.previous ? { previous: item.previous } : {}) }));
  return { check: rows('check'), reuse: rows('reuse'), defer: rows('defer'), scope: 'DECLARATIONS_AND_EVIDENCE_BINDINGS_ONLY' as const };
}

/** Called before preparation and at the real readiness/claim boundary. Never writes or runs cases. */
export function assertValidationSelection(selection: ValidationSelection | undefined, dispatch = false) {
  if (selection === undefined) return undefined;
  validateValidationSelection(selection);
  for (const item of selection.cases) {
    const label = `${item.id}/${item.layer}`;
    // Deferred scope is neither executed nor promoted to accepted evidence.
    if (item.decision === 'defer') continue;
    if (item.invalidation) readback(item.invalidation.evidence);
    let prior: ValidationEvidence | undefined;
    if (item.previous) {
      try { prior = previousEvidence(item.previous); }
      catch (error) {
        // Missing/corrupt old proof may justify a new narrow check, never a reused PASS.
        if (item.decision !== 'check' || item.invalidation?.kind !== 'insufficient-evidence') throw error;
      }
      if (prior && (prior.caseId !== item.id || prior.layer !== item.layer)) fail(`previous case/layer differs: ${label}`);
    }
    if (item.decision === 'reuse') {
      if (!prior || prior.outcome !== 'PASS') fail(`reuse needs prior PASS: ${label}`);
      if (item.invalidation || !known(item.context) || !known(prior.context) || !sameContext(item.context, prior.context)) fail(`reuse context is changed, unknown or explicitly invalidated: ${label}`);
    } else {
      if (item.previous && !item.invalidation) fail(`repeat needs a concrete invalidation: ${label}`);
      if (item.layer === 'behavior' && prior?.outcome === 'PASS' && ['tool-repair', 'restoration-gap'].includes(item.invalidation?.kind ?? '')) fail(`a tool/restoration defect alone cannot invalidate passed behavior: ${label}`);
    }
  }
  const summary = validationSelectionSummary(selection);
  if (dispatch && !summary.check.length) fail('no case is selected for execution; retain reused/deferred results without dispatch.');
  return summary;
}

/** Check coverage declarations for the concrete entry being invoked, not just a detached plan. */
export function assertExecutionCases(selection: ValidationSelection | undefined, value: unknown, exact = true): void {
  if (selection === undefined) {
    if (value !== undefined) fail('execution cases require validationSelection.');
    return;
  }
  if (!Array.isArray(value)) fail('enabled selection requires explicit execution cases.');
  const selected = new Set(selection.cases.filter(item => item.decision === 'check').map(item => JSON.stringify([item.id, item.layer])));
  const covered = new Set<string>();
  for (const item of value) {
    const ref = record(item);
    if (!text(ref.id) || !layers.includes(String(ref.layer))) fail('execution cases require id and layer.');
    const key = JSON.stringify([ref.id, ref.layer]);
    if (covered.has(key) || !selected.has(key)) fail(`execution includes duplicate, reused, deferred or undeclared case: ${ref.id}/${ref.layer}`);
    covered.add(key);
  }
  if (exact && (covered.size !== selected.size || [...selected].some(key => !covered.has(key)))) fail('execution coverage must equal the selected checks; narrow the command or justify the remaining checks.');
}

export function assertFileExecutionCases(selection: ValidationSelection | undefined, preflight: CheckCommand[], operation: CheckCommand): void {
  // Preparation may cover a subset, including explicit [] for syntax/identity setup.
  for (const command of preflight) assertExecutionCases(selection, command.validationCases, false);
  assertExecutionCases(selection, operation.validationCases);
}

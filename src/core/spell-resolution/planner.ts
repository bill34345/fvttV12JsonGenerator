import { hashManifest } from './hash';
import { sha256 } from './sha256';
import { DEFAULT_SPELL_RESOLUTION_CONFIGURATION, hashResolutionConfiguration, hashSourceInventoryMetadata, isSpellResolutionConfiguration, logicalSpellRefKey, resolveSpellRef } from './resolver';
import type {
  HydrationPreflight,
  ManagedSpellProjection,
  PortableSpellManifest,
  SavedSpellMapping,
  SpellCandidateMetadata,
  SpellHydrationPlan,
  SpellHydrationSelection,
  SpellManualDecision,
  SpellResolutionFinding,
  SpellResolutionConfiguration,
  SpellResolutionReport,
} from './types';
import { validatePortableSpellManifestStructure } from './validator';

export interface PlanSpellHydrationInput {
  manifest: PortableSpellManifest;
  candidates: readonly SpellCandidateMetadata[];
  /** SHA-256 over enabled source package versions plus candidate metadata, supplied by the source index. */
  sourceInventoryHash: string;
  savedMappings?: readonly SavedSpellMapping[];
  currentManagedProjection?: readonly ManagedSpellProjection[];
  manualDecisions?: readonly SpellManualDecision[];
  configuration?: SpellResolutionConfiguration;
}

export function planSpellHydration(input: PlanSpellHydrationInput): HydrationPreflight {
  const safeInput: Partial<PlanSpellHydrationInput> = isRecord(input) ? input : {};
  const manifestValidation = validatePortableSpellManifestStructure(safeInput.manifest);
  const manifestId = manifestValidation.ok ? manifestValidation.value.manifestId : '';
  const candidatesShapeValid = Array.isArray(safeInput.candidates);
  const candidates = candidatesShapeValid ? safeInput.candidates! : [];
  const sourceInventoryHash = safeInput.sourceInventoryHash;
  const candidateMetadataHash = hashSourceInventoryMetadata(candidates);
  const configuration = safeInput.configuration ?? DEFAULT_SPELL_RESOLUTION_CONFIGURATION;
  const resolutionConfigHash = isSpellResolutionConfiguration(configuration) ? hashResolutionConfiguration(configuration) : '';
  const emptyInputHash = hashCanonical([]);
  if (!manifestValidation.ok) {
    const report: SpellResolutionReport = { manifestId, sourceInventoryHash: isInventoryHash(sourceInventoryHash) ? sourceInventoryHash : '', candidateMetadataHash, resolutionConfigHash, currentManagedProjectionHash: emptyInputHash, manualDecisionsHash: emptyInputHash, results: [], findings: manifestValidation.findings };
    return { status: 'incompatible', findings: manifestValidation.findings, report };
  }
  if (!candidatesShapeValid) {
    const invalid = [finding('INVALID_CANDIDATE_COLLECTION', '/candidates', 'Candidate metadata must be an array.')];
    const report: SpellResolutionReport = { manifestId, sourceInventoryHash: isInventoryHash(sourceInventoryHash) ? sourceInventoryHash : '', candidateMetadataHash, resolutionConfigHash, currentManagedProjectionHash: emptyInputHash, manualDecisionsHash: emptyInputHash, results: [], findings: invalid };
    return { status: 'incompatible', findings: invalid, report };
  }
  if (!isInventoryHash(sourceInventoryHash)) {
    const invalid = [finding('INVALID_SOURCE_INVENTORY_HASH', '/sourceInventoryHash', 'Authoritative source inventory hash must be a lowercase SHA-256 value.')];
    const report: SpellResolutionReport = { manifestId, sourceInventoryHash: '', candidateMetadataHash, resolutionConfigHash, currentManagedProjectionHash: emptyInputHash, manualDecisionsHash: emptyInputHash, results: [], findings: invalid };
    return { status: 'incompatible', findings: invalid, report };
  }
  if (!isSpellResolutionConfiguration(configuration)) {
    const invalid = [finding('INVALID_RESOLUTION_CONFIGURATION', '/configuration', 'Resolution configuration is malformed or unsupported.')];
    const report: SpellResolutionReport = { manifestId, sourceInventoryHash, candidateMetadataHash, resolutionConfigHash: '', currentManagedProjectionHash: emptyInputHash, manualDecisionsHash: emptyInputHash, results: [], findings: invalid };
    return { status: 'incompatible', findings: invalid, report };
  }

  const savedMappings = Array.isArray(safeInput.savedMappings) ? safeInput.savedMappings : [];
  const projections = Array.isArray(safeInput.currentManagedProjection) ? safeInput.currentManagedProjection : [];
  const decisions = Array.isArray(safeInput.manualDecisions) ? safeInput.manualDecisions : [];
  const validLogicalKeys = new Set(manifestValidation.value.spellcastingGroups.flatMap((group) => group.spellRefs.map((ref) => logicalSpellRefKey(manifestId, group.groupId, ref.refId))));
  const shapeFindings = [
    ...validateOptionalArrayShapes(safeInput),
    ...validatePlannerCollections(savedMappings, projections, decisions, validLogicalKeys),
  ];
  const savedByKey = uniqueByKey(savedMappings);
  const projectionByKey = uniqueByKey(projections);
  const decisionByKey = uniqueByKey(decisions);
  const currentManagedProjectionHash = hashCanonical(projections.filter(isValidManagedProjection).map(projectManagedProjection).sort(compareLogicalKeys));
  const manualDecisionsHash = hashCanonical(decisions.filter(isValidManualDecision).map(projectManualDecision).sort(compareLogicalKeys));

  const results = manifestValidation.value.spellcastingGroups.flatMap((group) => group.spellRefs.map((ref) => resolveSpellRef({
    manifestId,
    groupId: group.groupId,
    ref,
    candidates,
    sourceInventoryHash,
    savedMapping: savedByKey.get(logicalSpellRefKey(manifestId, group.groupId, ref.refId)),
    configuration,
  })));

  const findings: SpellResolutionFinding[] = [...shapeFindings];
  const selections: SpellHydrationSelection[] = [];
  for (const result of results) {
    findings.push(...result.findings);
    if (result.status !== 'resolved') continue;
    const projection = projectionByKey.get(result.logicalRefKey);
    const decision = decisionByKey.get(result.logicalRefKey)?.decision;
    if (projection?.manualConflict) {
      if (decision === undefined) {
        findings.push(finding('MANUAL_CONFLICT_UNDECIDED', result.logicalRefKey, 'Manual edit conflict requires Keep, Overwrite, or Cancel.'));
        continue;
      }
      if (decision === 'cancel') {
        findings.push(finding('MANUAL_REVIEW_CANCELLED', result.logicalRefKey, 'Manual conflict review was cancelled; no plan may be produced.'));
        continue;
      }
    }
    selections.push({
      logicalRefKey: result.logicalRefKey,
      groupId: result.groupId,
      refId: result.refId,
      uuid: result.selected.uuid,
      rules: result.selected.rules,
      selectionOrigin: result.origin,
      ...(projection?.manualConflict && (decision === 'keep' || decision === 'overwrite') ? { manualDecision: decision } : {}),
    });
  }

  const stableFindings = sortFindings(findings);
  const report: SpellResolutionReport = { manifestId, sourceInventoryHash, candidateMetadataHash, resolutionConfigHash, currentManagedProjectionHash, manualDecisionsHash, results, findings: stableFindings };
  if (stableFindings.length > 0 || results.some((result) => result.status !== 'resolved') || selections.length !== results.length) {
    return { status: 'needs_review', findings: stableFindings, report };
  }

  const planWithoutHash = {
    manifestId,
    manifestHash: hashManifest(manifestValidation.value),
    sourceInventoryHash,
    candidateMetadataHash,
    resolutionConfigHash,
    resolutionConfiguration: structuredClone(configuration),
    currentManagedProjectionHash,
    manualDecisionsHash,
    selections,
  };
  const plan: SpellHydrationPlan = { ...planWithoutHash, planHash: sha256(canonicalStringify(planWithoutHash)) };
  return { status: 'ready', plan, report };
}

function validateOptionalArrayShapes(input: Partial<PlanSpellHydrationInput>): SpellResolutionFinding[] {
  const findings: SpellResolutionFinding[] = [];
  for (const [key, value] of [
    ['savedMappings', input.savedMappings],
    ['currentManagedProjection', input.currentManagedProjection],
    ['manualDecisions', input.manualDecisions],
  ] as const) {
    if (value !== undefined && !Array.isArray(value)) findings.push(finding('MALFORMED_PREFLIGHT_INPUT', `/${key}`, `${key} must be an array.`));
  }
  return findings;
}

function validatePlannerCollections(
  mappings: readonly SavedSpellMapping[],
  projections: readonly ManagedSpellProjection[],
  decisions: readonly SpellManualDecision[],
  validLogicalKeys: Set<string>,
): SpellResolutionFinding[] {
  const findings: SpellResolutionFinding[] = [];
  validateKeyedCollection(mappings, '/savedMappings', isValidSavedMappingInput, findings, validLogicalKeys);
  validateKeyedCollection(projections, '/currentManagedProjection', isValidManagedProjection, findings, validLogicalKeys);
  validateKeyedCollection(decisions, '/manualDecisions', isValidManualDecision, findings, validLogicalKeys);
  const projectionByKey = uniqueByKey(projections.filter(isValidManagedProjection));
  decisions.forEach((decision, index) => {
    if (isValidManualDecision(decision) && !projectionByKey.get(decision.logicalRefKey)?.manualConflict) {
      findings.push(finding('INVALID_MANUAL_DECISION_TARGET', `/manualDecisions/${index}`, 'Manual decision must target a declared managed-content conflict.'));
    }
  });
  return findings;
}

function validateKeyedCollection(values: readonly unknown[], path: string, validate: (entry: any) => boolean, findings: SpellResolutionFinding[], validLogicalKeys: Set<string>): void {
  const seen = new Set<string>();
  values.forEach((entry, index) => {
    if (!validate(entry)) {
      findings.push(finding('MALFORMED_PREFLIGHT_INPUT', `${path}/${index}`, 'Preflight metadata is malformed.'));
      return;
    }
    const key = (entry as { logicalRefKey: string }).logicalRefKey;
    if (seen.has(key)) findings.push(finding('DUPLICATE_PREFLIGHT_KEY', `${path}/${index}`, `Duplicate logical ref key: ${key}.`));
    if (!validLogicalKeys.has(key)) findings.push(finding('UNKNOWN_PREFLIGHT_KEY', `${path}/${index}`, `Unknown logical ref key: ${key}.`));
    seen.add(key);
  });
}

function isValidSavedMappingInput(entry: unknown): entry is SavedSpellMapping {
  return isRecord(entry)
    && hasOnlyKeys(entry, ['logicalRefKey', 'selectedUuid', 'rules', 'sourceInventoryHash', 'candidateMetadataHash', 'resolutionConfigHash', 'selectionOrigin'])
    && typeof entry.logicalRefKey === 'string'
    && typeof entry.selectedUuid === 'string'
    && (entry.rules === '2024' || entry.rules === '2014')
    && isInventoryHash(entry.sourceInventoryHash)
    && isInventoryHash(entry.candidateMetadataHash)
    && isInventoryHash(entry.resolutionConfigHash)
    && ((entry.rules === '2024' && (entry.selectionOrigin === 'automatic-2024' || entry.selectionOrigin === 'manual-review')) || (entry.rules === '2014' && (entry.selectionOrigin === 'fallback-2014' || entry.selectionOrigin === 'manual-review')));
}

function isValidManagedProjection(entry: unknown): entry is ManagedSpellProjection {
  return isRecord(entry)
    && hasOnlyKeys(entry, ['logicalRefKey', 'manualConflict', 'managedContentHash'])
    && typeof entry.logicalRefKey === 'string'
    && (entry.manualConflict === undefined || typeof entry.manualConflict === 'boolean')
    && (entry.managedContentHash === undefined || typeof entry.managedContentHash === 'string');
}

function isValidManualDecision(entry: unknown): entry is SpellManualDecision {
  return isRecord(entry)
    && hasOnlyKeys(entry, ['logicalRefKey', 'decision'])
    && typeof entry.logicalRefKey === 'string'
    && (entry.decision === 'keep' || entry.decision === 'overwrite' || entry.decision === 'cancel');
}

function projectManagedProjection(entry: ManagedSpellProjection): ManagedSpellProjection {
  return { logicalRefKey: entry.logicalRefKey, ...(entry.manualConflict === undefined ? {} : { manualConflict: entry.manualConflict }), ...(entry.managedContentHash === undefined ? {} : { managedContentHash: entry.managedContentHash }) };
}

function projectManualDecision(entry: SpellManualDecision): SpellManualDecision {
  return { logicalRefKey: entry.logicalRefKey, decision: entry.decision };
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function uniqueByKey<T extends { logicalRefKey: string }>(values: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) if (isRecord(value) && typeof value.logicalRefKey === 'string' && !result.has(value.logicalRefKey)) result.set(value.logicalRefKey, value);
  return result;
}

function finding(code: string, path: string, message: string): SpellResolutionFinding {
  return { code, path, message, blocking: true, evidence: [] };
}

function sortFindings(findings: SpellResolutionFinding[]): SpellResolutionFinding[] {
  return [...findings].sort((left, right) => `${left.path}\0${left.code}`.localeCompare(`${right.path}\0${right.code}`, 'en'));
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalStringify(value));
}

function compareLogicalKeys(left: { logicalRefKey: string }, right: { logicalRefKey: string }): number {
  return left.logicalRefKey.localeCompare(right.logicalRefKey, 'en');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInventoryHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

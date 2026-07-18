import { normalizeSpellIdentity } from './normalize';
import { sha256 } from './sha256';
import type {
  PortableSpellRef,
  SavedSpellMapping,
  SpellCandidateMetadata,
  SpellResolutionFinding,
  SpellResolutionResult,
  SpellResolutionTraceEntry,
  SpellResolutionConfiguration,
  SpellRulesGeneration,
} from './types';

export interface ResolveSpellRefInput {
  manifestId: string;
  groupId: string;
  ref: PortableSpellRef;
  candidates: readonly SpellCandidateMetadata[];
  /** SHA-256 over enabled source package versions plus candidate metadata, supplied by the source index. */
  sourceInventoryHash: string;
  savedMapping?: SavedSpellMapping;
  configuration?: SpellResolutionConfiguration;
}

export const DEFAULT_SPELL_RESOLUTION_CONFIGURATION: SpellResolutionConfiguration = {
  policyVersion: '2024-first-v1',
  sourcePriority: [
    { packageId: 'dnd-players-handbook' },
    { packageId: 'dnd5e', packId: 'spells24' },
  ],
};

export function logicalSpellRefKey(manifestId: string, groupId: string, refId: string): string {
  return JSON.stringify([manifestId, groupId, refId]);
}

/** Metadata-only helper for pure tests; runtime uses the Task 6 authoritative inventory hash. */
export function hashSourceInventoryMetadata(candidates: readonly SpellCandidateMetadata[]): string {
  const projected = [...candidates]
    .map(projectCandidateForHash)
    .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right), 'en'));
  return sha256(canonicalStringify(projected));
}

export function hashResolutionConfiguration(configuration: SpellResolutionConfiguration): string {
  return sha256(canonicalStringify(projectConfiguration(configuration)));
}

export function resolveSpellRef(input?: ResolveSpellRefInput): SpellResolutionResult {
  const safeInput: Partial<ResolveSpellRefInput> = isRecord(input) ? input : {};
  const manifestId = typeof safeInput.manifestId === 'string' ? safeInput.manifestId : '';
  const groupId = typeof safeInput.groupId === 'string' ? safeInput.groupId : '';
  const ref = safeInput.ref;
  const refId = isRecord(ref) && typeof ref.refId === 'string' ? ref.refId : '';
  const key = logicalSpellRefKey(manifestId, groupId, refId);
  const evidence = isRecord(ref) && Array.isArray(ref.evidence) ? ref.evidence : [];
  const base = { logicalRefKey: key, groupId, refId, trace: [] as SpellResolutionTraceEntry[], findings: [] as SpellResolutionFinding[], suggestions: [] as SpellCandidateMetadata[] };

  const configuration = safeInput.configuration ?? DEFAULT_SPELL_RESOLUTION_CONFIGURATION;
  if (!isNonEmptyString(safeInput.manifestId) || !isNonEmptyString(safeInput.groupId) || !isValidRefForResolution(ref) || !Array.isArray(safeInput.candidates) || !isSpellResolutionConfiguration(configuration) || !isInventoryHash(safeInput.sourceInventoryHash)) {
    return unresolved(base, 'needs_review', [finding('MALFORMED_RESOLUTION_INPUT', `/${refId || 'ref'}`, 'Spell resolution input is malformed.', evidence)]);
  }

  const malformed = safeInput.candidates.filter((candidate) => !isValidCandidate(candidate));
  if (malformed.length > 0) {
    return unresolved(base, 'needs_review', [finding('MALFORMED_CANDIDATE', '/candidates', `${malformed.length} candidate metadata record(s) are malformed.`, evidence)]);
  }

  const candidates = [...safeInput.candidates].sort(compareCandidates);
  const inventoryHash = safeInput.sourceInventoryHash;
  const candidateMetadataHash = hashSourceInventoryMetadata(candidates);
  const configurationHash = hashResolutionConfiguration(configuration);
  const saved = safeInput.savedMapping;
  if (saved !== undefined) {
    const savedShapeValid = isValidSavedMapping(saved) && saved.logicalRefKey === key;
    if (!savedShapeValid) {
      return unresolved(base, 'needs_review', [finding('INVALID_SAVED_MAPPING', `/${ref.refId}`, 'Saved mapping does not belong to this logical spell reference.', evidence)]);
    }
    if (saved.sourceInventoryHash === inventoryHash && saved.candidateMetadataHash !== candidateMetadataHash) {
      return unresolved(base, 'needs_review', [finding('INVALID_SAVED_MAPPING', `/${ref.refId}`, 'Saved mapping metadata hash contradicts the authoritative inventory hash.', evidence)]);
    }
    if (saved.sourceInventoryHash === inventoryHash && saved.resolutionConfigHash === configurationHash) {
      const selected = candidates.find((candidate) => candidate.uuid === saved.selectedUuid);
      if (!selected || !savedCandidateStillValid(saved, selected, candidates, ref)) {
        return unresolved(base, 'needs_review', [finding('INVALID_SAVED_MAPPING', `/${ref.refId}`, 'Saved mapping no longer satisfies UUID, identity, rules, or source facts.', evidence)]);
      }
      base.trace.push(trace('REUSE_SAVED_MAPPING', 'Reused a concrete mapping against the unchanged source inventory.', [selected]));
      return resolved(base, selected, saved.selectionOrigin);
    }
  }

  if (saved !== undefined && saved.sourceInventoryHash !== inventoryHash && saved.candidateMetadataHash === candidateMetadataHash) {
    const selected = candidates.find((candidate) => candidate.uuid === saved.selectedUuid);
    return unresolved(base, 'needs_review', [finding(
      'STALE_SOURCE_INVENTORY',
      `/${ref.refId}`,
      'Authoritative source inventory changed while candidate metadata stayed equal; selected document content may have changed.',
      evidence,
      selected ? [selected] : undefined,
    )], selected ? [selected] : undefined);
  }

  const automatic = resolveAutomatically(base, ref, candidates, configuration);
  if (saved === undefined) return automatic;

  if (automatic.status === 'resolved' && automatic.selected.uuid === saved.selectedUuid && automatic.selected.rules === saved.rules) {
    automatic.trace.unshift(trace('SOURCE_INVENTORY_CHANGED_SELECTION_STABLE', 'Source inventory changed, but the deterministic selection is unchanged.', [automatic.selected]));
    return automatic;
  }

  const staleFinding = finding('STALE_SAVED_SELECTION', `/${ref.refId}`, 'Source inventory changed the saved selection or made it unresolved; review is required.', evidence, automatic.status === 'resolved' ? [automatic.selected] : automatic.candidates);
  return {
    ...automatic,
    status: 'needs_review',
    findings: stableFindings([...automatic.findings, staleFinding]),
  };
}

function resolveAutomatically(
  base: ReturnType<typeof makeBase> | { logicalRefKey: string; groupId: string; refId: string; trace: SpellResolutionTraceEntry[]; findings: SpellResolutionFinding[]; suggestions: SpellCandidateMetadata[] },
  ref: PortableSpellRef,
  candidates: SpellCandidateMetadata[],
  configuration: SpellResolutionConfiguration,
): SpellResolutionResult {
  const refKeys = spellRefKeys(ref);
  const exact = candidates.map((candidate) => ({ candidate, keys: candidateKeys(candidate) })).filter((entry) => intersects(refKeys, entry.keys));
  base.trace.push(trace('EXACT_IDENTITY_FILTER', `Found ${exact.length} candidate(s) by exact identifier, English name, or explicit alias.`, exact.map((entry) => entry.candidate)));

  const unknownRules = exact.filter((entry) => entry.candidate.rules === undefined).map((entry) => entry.candidate);
  if (unknownRules.length > 0) {
    const findings = [finding('MISSING_RULES_METADATA', `/${ref.refId}`, 'Exact candidate has no rules generation metadata.', ref.evidence, unknownRules)];
    return unresolved(base, 'needs_review', findings, unknownRules);
  }
  const unsupportedRules = exact.filter((entry) => entry.candidate.rules !== '2024' && entry.candidate.rules !== '2014').map((entry) => entry.candidate);
  if (unsupportedRules.length > 0) {
    return unresolved(base, 'needs_review', [finding('UNSUPPORTED_RULES_METADATA', `/${ref.refId}`, 'Exact candidate uses a rules generation other than 2024 or 2014.', ref.evidence, unsupportedRules)], unsupportedRules);
  }

  const exact2024 = exact.map((entry) => entry.candidate).filter(isSupportedRulesCandidate('2024'));
  if (exact2024.length > 0) {
    const contradictory = exact2024.filter((candidate) => candidateContradictions(candidate, ref).length > 0);
    if (contradictory.length > 0) {
      base.trace.push(trace('BLOCK_CONTRADICTORY_2024', 'At least one same-key 2024 candidate contradicts source facts.', contradictory));
      return unresolved(base, 'needs_review', [finding('CONTRADICTORY_2024_CANDIDATE', `/${ref.refId}`, 'Same-key 2024 metadata contradicts expected spell facts.', ref.evidence, contradictory)], exact2024);
    }
    return choose2024(base, ref, exact2024, configuration);
  }

  const exact2014 = exact.map((entry) => entry.candidate).filter(isSupportedRulesCandidate('2014'));
  if (exact2014.length > 0) {
    const contradictory = exact2014.filter((candidate) => candidateContradictions(candidate, ref).length > 0);
    if (contradictory.length > 0) {
      return unresolved(base, 'needs_review', [finding('CONTRADICTORY_2014_CANDIDATE', `/${ref.refId}`, 'Same-key 2014 metadata contradicts expected spell facts.', ref.evidence, contradictory)], exact2014);
    }
    return choose2014(base, ref, exact2014);
  }

  const suggestions = approximateSuggestions(ref, candidates);
  if (suggestions.length > 0) {
    base.trace.push(trace('APPROXIMATE_SUGGESTIONS_ONLY', 'Near-name candidates are suggestions and are never selected automatically.', suggestions));
    return unresolved(base, 'needs_review', [finding('APPROXIMATE_MATCH_REVIEW', `/${ref.refId}`, 'Only approximate spell-name suggestions were found.', ref.evidence, suggestions)], undefined, suggestions);
  }
  base.trace.push(trace('NO_EXACT_MATCH', 'No exact identity candidate exists.', []));
  return unresolved(base, 'missing', [finding('SPELL_MISSING', `/${ref.refId}`, 'No exact destination spell candidate exists.', ref.evidence)]);
}

function choose2014(base: ReturnType<typeof makeBase>, ref: PortableSpellRef, candidates: (SpellCandidateMetadata & { rules: '2014' })[]): SpellResolutionResult {
  let remaining = [...candidates];
  if (ref.sourceBookHint) {
    const hint = normalizeSpellIdentity(ref.sourceBookHint);
    const hinted = remaining.filter((candidate) => candidate.sourceBook !== undefined && normalizeSpellIdentity(candidate.sourceBook) === hint);
    if (hinted.length === 0) {
      return unresolved(base, 'needs_review', [finding('SOURCE_BOOK_HINT_UNSATISFIED', `/${ref.refId}`, 'No exact 2014 candidate satisfies the explicit source-book hint.', ref.evidence, remaining)], remaining);
    }
    remaining = hinted;
    base.trace.push(trace('PREFER_2014_SOURCE_BOOK_HINT', 'Applied the explicit source-book hint to 2014 fallbacks.', remaining));
  }
  if (remaining.length === 1) {
    base.trace.push(trace('SELECT_2014_FALLBACK', 'Selected the unique exact 2014 match because no same-key 2024 candidate exists.', remaining));
    return resolved(base, remaining[0]!, 'fallback-2014');
  }
  return unresolved(base, 'needs_review', [finding('AMBIGUOUS_2014_FALLBACK', `/${ref.refId}`, 'Multiple exact 2014 fallbacks remain.', ref.evidence, remaining)], remaining);
}

function choose2024(base: ReturnType<typeof makeBase>, ref: PortableSpellRef, candidates: (SpellCandidateMetadata & { rules: '2024' })[], configuration: SpellResolutionConfiguration): SpellResolutionResult {
  let remaining = [...candidates];
  if (ref.sourceBookHint) {
    const hint = normalizeSpellIdentity(ref.sourceBookHint);
    const missingSource = remaining.filter((candidate) => candidate.sourceBook === undefined);
    if (missingSource.length > 0) {
      return unresolved(base, 'needs_review', [finding('MISSING_SOURCE_BOOK_METADATA', `/${ref.refId}`, 'Source-book hint cannot be checked against candidate metadata.', ref.evidence, missingSource)], remaining);
    }
    const hinted = remaining.filter((candidate) => normalizeSpellIdentity(candidate.sourceBook!) === hint);
    if (hinted.length === 0) {
      return unresolved(base, 'needs_review', [finding('SOURCE_BOOK_HINT_UNSATISFIED', `/${ref.refId}`, 'No exact 2024 candidate satisfies the explicit source-book hint.', ref.evidence, remaining)], remaining);
    }
    remaining = hinted;
    base.trace.push(trace('PREFER_SOURCE_BOOK_HINT', 'Applied the explicit source-book hint.', remaining));
  }

  for (const priority of configuration.sourcePriority) {
    const preferred = remaining.filter((candidate) => candidate.packageId === priority.packageId && (priority.packId === undefined || candidate.packId === priority.packId));
    if (preferred.length > 0) {
      remaining = preferred;
      base.trace.push(trace('PREFER_CONFIGURED_SOURCE', `Preferred configured source ${priority.packageId}${priority.packId ? `.${priority.packId}` : ''}.`, remaining));
      break;
    }
  }

  if (remaining.length === 1) {
    base.trace.push(trace('SELECT_2024', 'Selected the unique candidate after ordered 2024 priorities.', remaining));
    return resolved(base, remaining[0]!, 'automatic-2024');
  }
  base.trace.push(trace('REVIEW_INDISTINGUISHABLE_2024', 'Multiple valid 2024 candidates remain after all priorities.', remaining));
  return unresolved(base, 'needs_review', [finding('AMBIGUOUS_EXACT_MATCH', `/${ref.refId}`, 'Multiple indistinguishable exact 2024 candidates remain.', ref.evidence, remaining)], remaining);
}

function candidateContradictions(candidate: SpellCandidateMetadata, ref: PortableSpellRef): string[] {
  const result: string[] = [];
  if (ref.expectedLevel !== undefined && candidate.level !== ref.expectedLevel) result.push('level');
  if (ref.expectedSchool !== undefined && normalizeOptional(candidate.school) !== normalizeSpellIdentity(ref.expectedSchool)) result.push('school');
  if (ref.sourceBookHint && candidate.sourceBook === undefined) result.push('sourceBook');
  return result;
}

function candidateMatchesRef(candidate: SpellCandidateMetadata, ref: PortableSpellRef): boolean {
  return intersects(spellRefKeys(ref), candidateKeys(candidate));
}

function spellRefKeys(ref: PortableSpellRef): Set<string> {
  return normalizedSet([ref.identifier, ref.englishName, ...ref.aliases]);
}

function candidateKeys(candidate: SpellCandidateMetadata): Set<string> {
  return normalizedSet([candidate.identifier, candidate.name]);
}

function savedCandidateStillValid(saved: SavedSpellMapping, selected: SpellCandidateMetadata, candidates: SpellCandidateMetadata[], ref: PortableSpellRef): selected is SpellCandidateMetadata & { rules: SpellRulesGeneration } {
  if (selected.rules !== saved.rules || !candidateMatchesRef(selected, ref) || candidateContradictions(selected, ref).length > 0) return false;
  if (ref.sourceBookHint && normalizeOptional(selected.sourceBook) !== normalizeSpellIdentity(ref.sourceBookHint)) return false;
  if (saved.rules === '2024') return true;

  const sameKey = candidates.filter((candidate) => candidateMatchesRef(candidate, ref));
  if (sameKey.some((candidate) => candidate.rules !== '2014')) return false;
  if (saved.selectionOrigin === 'manual-review') return true;
  const valid2014 = sameKey.filter((candidate) => candidate.rules === '2014' && candidateContradictions(candidate, ref).length === 0);
  const hinted2014 = ref.sourceBookHint
    ? valid2014.filter((candidate) => candidate.sourceBook !== undefined && normalizeSpellIdentity(candidate.sourceBook) === normalizeSpellIdentity(ref.sourceBookHint!))
    : valid2014;
  return hinted2014.length === 1 && hinted2014[0]?.uuid === selected.uuid;
}

function normalizedSet(values: (string | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => typeof value === 'string').map(normalizeSpellIdentity).filter(Boolean));
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function approximateSuggestions(ref: PortableSpellRef, candidates: SpellCandidateMetadata[]): SpellCandidateMetadata[] {
  const refKeys = [...spellRefKeys(ref)];
  return candidates.filter((candidate) => {
    for (const left of refKeys) for (const right of candidateKeys(candidate)) {
      const maxLength = Math.max(left.length, right.length);
      if (maxLength >= 5 && levenshtein(left, right) <= Math.min(2, Math.floor(maxLength / 4))) return true;
    }
    return false;
  });
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function resolved(base: ReturnType<typeof makeBase>, selected: SpellCandidateMetadata & { rules: SpellRulesGeneration }, origin: 'automatic-2024' | 'fallback-2014' | 'manual-review'): SpellResolutionResult {
  return { ...base, status: 'resolved', selected, origin };
}

function isSupportedRulesCandidate<T extends SpellRulesGeneration>(rules: T): (candidate: SpellCandidateMetadata) => candidate is SpellCandidateMetadata & { rules: T } {
  return (candidate): candidate is SpellCandidateMetadata & { rules: T } => candidate.rules === rules;
}

function unresolved(
  base: ReturnType<typeof makeBase>,
  status: 'needs_review' | 'missing',
  findings: SpellResolutionFinding[],
  candidates?: SpellCandidateMetadata[],
  suggestions: SpellCandidateMetadata[] = [],
): SpellResolutionResult {
  return { ...base, status, findings: stableFindings([...base.findings, ...findings]), candidates, suggestions };
}

function makeBase() {
  return { logicalRefKey: '', groupId: '', refId: '', trace: [] as SpellResolutionTraceEntry[], findings: [] as SpellResolutionFinding[], suggestions: [] as SpellCandidateMetadata[] };
}

function finding(code: string, path: string, message: string, evidence: PortableSpellRef['evidence'], candidates?: SpellCandidateMetadata[]): SpellResolutionFinding {
  return { code, path, message, blocking: true, evidence: [...evidence], ...(candidates ? { candidates: [...candidates] } : {}) };
}

function trace(code: string, message: string, candidates: SpellCandidateMetadata[]): SpellResolutionTraceEntry {
  return { code, message, candidateUuids: candidates.map((candidate) => candidate.uuid).sort() };
}

function stableFindings(findings: SpellResolutionFinding[]): SpellResolutionFinding[] {
  return [...findings].sort((left, right) => `${left.path}\0${left.code}`.localeCompare(`${right.path}\0${right.code}`, 'en'));
}

function isValidRefForResolution(value: unknown): value is PortableSpellRef {
  return isRecord(value)
    && typeof value.refId === 'string' && value.refId.length > 0
    && typeof value.identifier === 'string' && value.identifier.length > 0
    && Array.isArray(value.aliases) && value.aliases.every((entry) => typeof entry === 'string')
    && Array.isArray(value.evidence);
}

function isValidCandidate(value: unknown): value is SpellCandidateMetadata {
  if (!isRecord(value)) return false;
  if (!['id', 'uuid', 'packageId', 'packId', 'name'].every((key) => typeof value[key] === 'string' && (value[key] as string).length > 0)) return false;
  if (value.identifier !== undefined && typeof value.identifier !== 'string') return false;
  if (value.rules !== undefined && typeof value.rules !== 'string') return false;
  if (value.sourceBook !== undefined && typeof value.sourceBook !== 'string') return false;
  if (value.level !== undefined && (!Number.isInteger(value.level) || value.level < 0 || value.level > 9)) return false;
  if (value.school !== undefined && typeof value.school !== 'string') return false;
  return true;
}

function isValidSavedMapping(value: unknown): value is SavedSpellMapping {
  return isRecord(value)
    && Object.keys(value).every((key) => ['logicalRefKey', 'selectedUuid', 'rules', 'sourceInventoryHash', 'candidateMetadataHash', 'resolutionConfigHash', 'selectionOrigin'].includes(key))
    && typeof value.logicalRefKey === 'string'
    && typeof value.selectedUuid === 'string'
    && (value.rules === '2024' || value.rules === '2014')
    && isInventoryHash(value.sourceInventoryHash)
    && isInventoryHash(value.candidateMetadataHash)
    && isInventoryHash(value.resolutionConfigHash)
    && ((value.rules === '2024' && (value.selectionOrigin === 'automatic-2024' || value.selectionOrigin === 'manual-review')) || (value.rules === '2014' && (value.selectionOrigin === 'fallback-2014' || value.selectionOrigin === 'manual-review')));
}

function isInventoryHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSpellResolutionConfiguration(value: unknown): value is SpellResolutionConfiguration {
  if (!isRecord(value) || value.policyVersion !== '2024-first-v1' || !Array.isArray(value.sourcePriority) || value.sourcePriority.length === 0) return false;
  const seen = new Set<string>();
  for (const priority of value.sourcePriority) {
    if (!isRecord(priority) || typeof priority.packageId !== 'string' || priority.packageId.length === 0 || (priority.packId !== undefined && (typeof priority.packId !== 'string' || priority.packId.length === 0))) return false;
    if (!Object.keys(priority).every((key) => key === 'packageId' || key === 'packId')) return false;
    const key = `${priority.packageId}\0${priority.packId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return Object.keys(value).every((key) => key === 'policyVersion' || key === 'sourcePriority');
}

function compareCandidates(left: SpellCandidateMetadata, right: SpellCandidateMetadata): number {
  return [left.uuid, left.packageId, left.packId, left.id, left.name].join('\0').localeCompare([right.uuid, right.packageId, right.packId, right.id, right.name].join('\0'), 'en');
}

function projectCandidateForHash(candidate: unknown): unknown {
  if (!isRecord(candidate)) return { malformed: canonicalize(candidate) };
  return {
    id: projectScalar(candidate.id),
    uuid: projectScalar(candidate.uuid),
    packageId: projectScalar(candidate.packageId),
    packId: projectScalar(candidate.packId),
    name: projectScalar(candidate.name),
    identifier: projectScalar(candidate.identifier),
    rules: projectScalar(candidate.rules),
    sourceBook: projectScalar(candidate.sourceBook),
    level: projectScalar(candidate.level),
    school: projectScalar(candidate.school),
  };
}

function projectConfiguration(configuration: SpellResolutionConfiguration): unknown {
  return {
    policyVersion: configuration.policyVersion,
    sourcePriority: configuration.sourcePriority.map((entry) => ({ packageId: entry.packageId, packId: entry.packId })),
  };
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return { malformedType: 'bigint', value: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value)) return { malformedType: 'nonfinite-number', value: String(value) };
  if (typeof value === 'function' || typeof value === 'symbol') return { malformedType: typeof value };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function projectScalar(value: unknown): unknown {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : { malformedType: 'nonfinite-number', value: String(value) };
  if (typeof value === 'bigint') return { malformedType: 'bigint', value: value.toString() };
  return { malformedType: Array.isArray(value) ? 'array' : typeof value };
}

function normalizeOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeSpellIdentity(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

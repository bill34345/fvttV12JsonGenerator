import { createHash } from 'node:crypto';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { SpeciesMechanic } from '@fvtt-json-generator/models/species';
import type { SpeciesDiscoveryCandidate, SpeciesIntakeFinding, SpeciesIntakeIR } from './species-types';

export function validateSpeciesIntakeIR(source: string, value: unknown, candidate: SpeciesDiscoveryCandidate): SpeciesIntakeFinding[] {
  const findings: SpeciesIntakeFinding[] = [];
  const add = (code: string, path: string, message: string, origin: SpeciesIntakeFinding['origin'], evidence?: EvidenceRef[]) => findings.push({ id: `${code}:${path}`, code, path, message, blocking: true, origin, ...(evidence ? { evidence } : {}) });
  if (!isRecord(value)) { add('INVALID_IR', '/', 'Species Intake response must be an object.', 'schema'); return findings; }
  const ir = value as SpeciesIntakeIR;
  if (ir.schemaVersion !== 1) add('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', 'schemaVersion must be 1.', 'schema');
  if (ir.source?.sha256 !== sha256(source)) add('SOURCE_HASH_MISMATCH', '/source/sha256', 'IR hash does not match the immutable run source.', 'evidence');
  if (ir.source?.length !== source.length) add('SOURCE_LENGTH_MISMATCH', '/source/length', 'IR source length must use UTF-16 code units.', 'evidence');
  if (!validEvidence(source, candidate, candidate)) add('INVALID_DISCOVERY_BOUNDARY', '/candidate', 'Candidate must be one exact source slice.', 'evidence', [candidate]);
  if (!isRecord(ir.species)) { add('MISSING_SPECIES', '/species', 'species is required.', 'schema'); return findings; }
  if (typeof ir.species.name !== 'string' || !ir.species.name.trim() || typeof ir.species.englishName !== 'string' || !ir.species.englishName.trim() || typeof ir.species.displayName !== 'string' || !ir.species.displayName.trim()) add('SPECIES_IDENTITY', '/species', 'Chinese name, English name, and display name are required.', 'schema');
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(ir.species.identifier ?? '')) add('INVALID_IDENTIFIER', '/species/identifier', 'Species identifier must be stable lowercase ASCII.', 'schema');
  if (ir.species.rules !== '2024') add('RULES', '/species/rules', 'Species Intake v1 only supports 2024 rules.', 'semantic');
  if (typeof ir.species.creatureType?.value !== 'string' || !ir.species.creatureType.value.trim() || typeof ir.species.creatureType?.subtype !== 'string' || !ir.species.creatureType.subtype.trim()) add('CREATURE_TYPE', '/species/creatureType', 'Creature type value and subtype are required.', 'schema');
  if (!Array.isArray(ir.species.size?.options) || ir.species.size.options.length !== 1 || !['lg', 'med', 'sm'].includes(ir.species.size.options[0] ?? '') || typeof ir.species.size?.hint !== 'string' || !ir.species.size.hint.trim()) add('SIZE', '/species/size', 'Species size requires one supported option and a source-faithful hint.', 'schema');
  if (!Number.isInteger(ir.species.movement?.walk) || ir.species.movement.walk < 1) add('MOVEMENT', '/species/movement/walk', 'Walk speed must be a positive integer.', 'schema');
  if (ir.species.senses?.darkvision !== undefined && (!Number.isInteger(ir.species.senses.darkvision) || ir.species.senses.darkvision < 1)) add('SENSES', '/species/senses/darkvision', 'Darkvision must be a positive integer when present.', 'schema');
  if (ir.species.source?.kind !== 'private-homebrew') add('SOURCE_KIND', '/species/source/kind', 'Species source must remain private-homebrew.', 'semantic');
  if (ir.species.source?.sha256 !== sha256(candidate.quote)) add('CANDIDATE_SOURCE_HASH', '/species/source/sha256', 'Canonical Species source hash must identify this exact candidate slice.', 'evidence');
  if (!Number.isInteger(ir.species.source?.irRevision) || ir.species.source.irRevision < 1) add('IR_REVISION', '/species/source/irRevision', 'IR revision must be a positive integer.', 'schema');
  if (!Array.isArray(ir.species.features) || !ir.species.features.length) add('FEATURES', '/species/features', 'At least one feature is required.', 'schema');
  const featureIds = new Set<string>(); const partIds = new Set<string>();
  for (const [featureIndex, feature] of (ir.species.features ?? []).entries()) {
    const path = `/species/features/${featureIndex}`;
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(feature.id ?? '') || featureIds.has(feature.id)) add('DUPLICATE_FEATURE_ID', `${path}/id`, 'Feature ids must be stable lowercase ASCII and unique.', 'semantic'); else featureIds.add(feature.id);
    if (!feature.description?.trim()) add('FEATURE_DESCRIPTION', `${path}/description`, 'Feature source text must be preserved.', 'evidence');
    if (!Array.isArray(feature.parts) || !feature.parts.length) add('FEATURE_PARTS', `${path}/parts`, 'Every feature requires at least one explicit part.', 'schema');
    const levels = new Set((Array.isArray(feature.parts) ? feature.parts : []).map((part) => part.level));
    if (levels.size > 1) add('MIXED_FEATURE_GRANT_LEVELS', `${path}/parts`, 'One feature Item may only contain parts granted at one level; later benefits require a separate feature.', 'semantic');
    for (const [partIndex, part] of (Array.isArray(feature.parts) ? feature.parts : []).entries()) {
      const partPath = `${path}/parts/${partIndex}`;
      if (!/^[a-z0-9][a-z0-9-]*$/u.test(part.id ?? '') || partIds.has(part.id)) add('DUPLICATE_PART_ID', `${partPath}/id`, 'Part ids must be stable lowercase ASCII and globally unique.', 'semantic'); else partIds.add(part.id);
      if (!Number.isInteger(part.level) || part.level < 0 || part.level > 20) add('PART_LEVEL', `${partPath}/level`, 'Grant level must be an integer from 0 to 20.', 'schema');
      if (!Array.isArray(part.mechanics) || !part.mechanics.length) add('PART_MECHANICS', `${partPath}/mechanics`, 'Every feature part requires at least one declared mechanic.', 'schema');
      for (const [mechanicIndex, mechanic] of (Array.isArray(part.mechanics) ? part.mechanics : []).entries()) {
        validateMechanic(mechanic, `${partPath}/mechanics/${mechanicIndex}`, add);
        validateAutomation(part.automation, mechanic, `${partPath}/automation`, add);
      }
    }
  }
  const claims = Array.isArray(ir.claims) ? ir.claims : [];
  if (!claims.length) add('CLAIMS_REQUIRED', '/claims', 'Species Evidence IR requires field-level claims.', 'evidence');
  const claimPaths = new Set<string>();
  for (const [index, claim] of claims.entries()) {
    if (!/^\/species\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/u.test(claim.path ?? '') || claimPaths.has(claim.path)) add('INVALID_CLAIM', `/claims/${index}`, 'Every claim needs a unique Species JSON-pointer path and exact evidence.', 'evidence');
    else claimPaths.add(claim.path);
    if (!Array.isArray(claim.evidence) || !claim.evidence.length) add('INVALID_CLAIM', `/claims/${index}`, 'Every claim needs a unique Species JSON-pointer path and exact evidence.', 'evidence');
    for (const [evidenceIndex, evidence] of (claim.evidence ?? []).entries()) if (!validEvidence(source, candidate, evidence)) add('INVALID_EVIDENCE', `/claims/${index}/evidence/${evidenceIndex}`, 'Evidence must be an exact source slice inside the candidate.', 'evidence', [evidence]);
  }
  for (const path of requiredClaimPaths(ir)) if (!claimPaths.has(path)) add('MISSING_FIELD_CLAIM', '/claims', `Missing evidence claim for ${path}.`, 'evidence');
  const coverage = [...(Array.isArray(ir.coverage) ? ir.coverage : [])].sort((a, b) => a.start - b.start || a.end - b.end);
  const referencedClaims = new Set<string>();
  let cursor = candidate.start;
  for (const [index, entry] of coverage.entries()) {
    if (!validEvidence(source, candidate, entry)) add('INVALID_COVERAGE_EVIDENCE', `/coverage/${index}`, 'Coverage entry must quote the exact source.', 'coverage', [entry]);
    if (!['mechanical', 'narrative', 'ignored-with-reason'].includes(entry.classification)) add('INVALID_COVERAGE_CLASSIFICATION', `/coverage/${index}/classification`, 'Coverage classification is unsupported.', 'coverage');
    if (entry.classification === 'ignored-with-reason' && !entry.reason?.trim()) add('MISSING_COVERAGE_REASON', `/coverage/${index}/reason`, 'Ignored source requires an explicit reason.', 'coverage');
    if (entry.classification !== 'ignored-with-reason' && (!Array.isArray(entry.claimPaths) || !entry.claimPaths.length)) add('MISSING_COVERAGE_CLAIMS', `/coverage/${index}/claimPaths`, 'Mechanical and narrative coverage must reference claims.', 'coverage');
    for (const path of entry.claimPaths ?? []) { if (!claimPaths.has(path)) add('UNKNOWN_COVERAGE_CLAIM', `/coverage/${index}/claimPaths`, `Coverage references unknown claim ${path}.`, 'coverage'); else referencedClaims.add(path); }
    if (entry.start !== cursor) { add('COVERAGE_GAP_OR_OVERLAP', `/coverage/${index}`, 'Coverage must partition the candidate without gaps or overlaps.', 'coverage'); break; }
    cursor = entry.end;
  }
  if (cursor !== candidate.end) add('COVERAGE_INCOMPLETE', '/coverage', 'Coverage must reach the candidate end.', 'coverage');
  for (const path of claimPaths) if (!referencedClaims.has(path)) add('UNREFERENCED_CLAIM', '/coverage', `Claim ${path} is not referenced by coverage.`, 'coverage');
  for (const uncertainty of Array.isArray(ir.uncertainties) ? ir.uncertainties : []) if (uncertainty.blocking) findings.push({ id: uncertainty.id, code: uncertainty.code, path: uncertainty.path, message: uncertainty.message, blocking: true, origin: 'semantic', evidence: uncertainty.evidence });
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

function requiredClaimPaths(ir: SpeciesIntakeIR): string[] {
  return [
    '/species/name', '/species/englishName', '/species/displayName', '/species/identifier', '/species/rules',
    '/species/creatureType', '/species/size', '/species/movement', '/species/senses',
    ...((Array.isArray(ir.species?.features) ? ir.species.features : []).map((_, index) => `/species/features/${index}`)),
  ];
}

function validateMechanic(mechanic: SpeciesMechanic, path: string, add: (code: string, path: string, message: string, origin: SpeciesIntakeFinding['origin']) => void): void {
  if (!mechanic || !['descriptive-passive', 'gm-assisted', 'external-rule', 'hp-per-level', 'ac-bonus', 'limited-utility'].includes(mechanic.kind)) { add('UNSUPPORTED_MECHANIC', `${path}/kind`, 'Unsupported mechanics cannot be represented as automation.', 'semantic'); return; }
  if ((mechanic.kind === 'gm-assisted' || mechanic.kind === 'external-rule') && (!Array.isArray(mechanic.boundaries) || !mechanic.boundaries.length)) add('MISSING_ASSISTED_BOUNDARY', `${path}/boundaries`, 'Assisted rules require explicit non-automation boundaries.', 'semantic');
  if ((mechanic.kind === 'hp-per-level' || mechanic.kind === 'ac-bonus') && (!Number.isInteger(mechanic.value) || mechanic.value === 0)) add('INVALID_EFFECT_VALUE', `${path}/value`, 'Effect value must be an explicit non-zero integer.', 'schema');
  if (mechanic.kind === 'limited-utility') {
    if (!Number.isInteger(mechanic.uses?.max) || mechanic.uses.max < 1 || !['lr', 'sr'].includes(mechanic.uses?.recovery)) add('INVALID_UTILITY_USES', `${path}/uses`, 'Limited Utility needs a positive maximum and lr/sr recovery.', 'schema');
    if (!Number.isInteger(mechanic.consumption) || mechanic.consumption < 1) add('INVALID_UTILITY_CONSUMPTION', `${path}/consumption`, 'Limited Utility must consume at least one use.', 'schema');
    if (!mechanic.chatFlavor?.trim()) add('MISSING_CHAT_FLAVOR', `${path}/chatFlavor`, 'Limited Utility requires truthful chat instructions.', 'semantic');
  }
}
function validateAutomation(automation: string, mechanic: SpeciesMechanic, path: string, add: (code: string, path: string, message: string, origin: SpeciesIntakeFinding['origin']) => void): void {
  const expected = mechanic.kind === 'gm-assisted' ? 'gm-assisted'
    : mechanic.kind === 'external-rule' ? 'external-rule'
      : mechanic.kind === 'descriptive-passive' ? 'descriptive'
        : 'native';
  if (automation !== expected) add('AUTOMATION_CLASSIFICATION', path, `${mechanic.kind} requires ${expected} automation.`, 'semantic');
}
function validEvidence(source: string, candidate: EvidenceRef, evidence: EvidenceRef): boolean { return Number.isInteger(evidence?.start) && Number.isInteger(evidence?.end) && evidence.start >= candidate.start && evidence.end <= candidate.end && evidence.end > evidence.start && source.slice(evidence.start, evidence.end) === evidence.quote; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

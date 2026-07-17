import { createHash } from 'node:crypto';
import type {
  AbilityKey,
  EvidenceRef,
  IntakeClaim,
  IntakeFinding,
  IntakeValidationResult,
  MonsterIntakeIR,
  SourceCoverageEntry,
} from './types';

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SIZES = new Set(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
const REQUIRED_CLAIM_PATHS = [
  '/creature/identity/name',
  '/creature/identity/size',
  '/creature/identity/creatureType',
  '/creature/attributes/ac',
  '/creature/attributes/hp',
  '/creature/attributes/movement',
  '/creature/attributes/cr',
  '/creature/abilities',
] as const;

export function validateMonsterIntakeIR(
  source: string,
  value: unknown,
  options: { coverageRange?: { start: number; end: number } } = {},
): IntakeValidationResult {
  const findings: IntakeFinding[] = [];
  const finding = (
    code: string,
    path: string,
    message: string,
    origin: IntakeFinding['origin'],
    evidence?: EvidenceRef[],
  ) => findings.push({
    id: stableFindingId(code, path),
    code,
    path,
    message,
    blocking: true,
    origin,
    evidence,
  });

  if (!isRecord(value)) {
    finding('INVALID_IR', '/', 'Monster intake response must be an object.', 'schema');
    return summarize(findings);
  }
  const ir = value as unknown as MonsterIntakeIR;

  if (ir.schemaVersion !== 1) {
    finding('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', 'schemaVersion must be 1.', 'schema');
  }
  const expectedHash = createHash('sha256').update(source).digest('hex');
  if (!ir.source || ir.source.sha256 !== expectedHash) {
    finding('SOURCE_HASH_MISMATCH', '/source/sha256', 'IR source hash does not match the submitted source.', 'evidence');
  }
  if (!ir.source || ir.source.length !== source.length) {
    finding('SOURCE_LENGTH_MISMATCH', '/source/length', 'IR source length does not match UTF-16 source length.', 'evidence');
  }

  validateCreature(ir, finding);
  validateExplicitAcConflicts(source, options.coverageRange, finding);

  const claims = Array.isArray(ir.claims) ? ir.claims : [];
  if (!Array.isArray(ir.claims)) {
    finding('INVALID_CLAIMS', '/claims', 'claims must be an array.', 'schema');
  }
  claims.forEach((claim, index) => validateClaim(source, claim, index, finding));
  for (const path of REQUIRED_CLAIM_PATHS) {
    if (!claims.some((claim) => claimCovers(claim, path))) {
      finding('MISSING_REQUIRED_CLAIM', path, `Required field has no source-backed claim: ${path}`, 'evidence');
    }
  }
  for (const path of collectMechanicalClaimPaths(ir)) {
    if (!claims.some((claim) => claimCovers(claim, path))) {
      finding('UNSUPPORTED_MECHANICAL_VALUE', path, `Mechanical value has no evidence-backed claim: ${path}`, 'evidence');
    }
  }
  validateConflictingClaims(claims, finding);

  const coverage = Array.isArray(ir.coverage) ? ir.coverage : [];
  if (!Array.isArray(ir.coverage)) {
    finding('INVALID_COVERAGE', '/coverage', 'coverage must be an array.', 'schema');
  }
  coverage.forEach((entry, index) => validateCoverage(source, entry, index, claims, finding));
  validateFullCoverage(source, coverage, finding, options.coverageRange);

  if (!Array.isArray(ir.uncertainties)) {
    finding('INVALID_UNCERTAINTIES', '/uncertainties', 'uncertainties must be an array.', 'schema');
  } else {
    for (const uncertainty of ir.uncertainties) {
      if (uncertainty?.blocking) {
        findings.push({
          id: String(uncertainty.id || stableFindingId(uncertainty.code, uncertainty.path)),
          code: String(uncertainty.code || 'AI_UNCERTAINTY'),
          path: String(uncertainty.path || '/'),
          message: String(uncertainty.message || 'AI reported an unresolved blocking uncertainty.'),
          blocking: true,
          origin: 'semantic',
          evidence: Array.isArray(uncertainty.evidence) ? uncertainty.evidence : [],
          candidates: uncertainty.candidates,
        });
      }
    }
  }

  return summarize(dedupeFindings(findings));
}

function validateCreature(
  ir: MonsterIntakeIR,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const creature = ir.creature;
  if (!isRecord(creature)) {
    finding('MISSING_CREATURE', '/creature', 'creature must be an object.', 'schema');
    return;
  }
  if (!creature.identity?.name?.trim()) finding('MISSING_REQUIRED_FIELD', '/creature/identity/name', 'Monster name is required.', 'schema');
  if (!SIZES.has(String(creature.identity?.size))) finding('INVALID_SIZE', '/creature/identity/size', 'Monster size is missing or unsupported.', 'schema');
  if (!creature.identity?.creatureType?.trim()) finding('MISSING_REQUIRED_FIELD', '/creature/identity/creatureType', 'Creature type is required.', 'schema');

  for (const ability of ABILITIES) {
    const value = creature.abilities?.[ability];
    if (!Number.isInteger(value) || value < 1 || value > 30) {
      finding('INVALID_ABILITY', `/creature/abilities/${ability}`, `${ability} must be an integer from 1 to 30.`, 'schema');
    }
  }
  const ac = creature.attributes?.ac;
  if (!Number.isInteger(ac) || ac < 1 || ac > 40) finding('INVALID_AC', '/creature/attributes/ac', 'AC must be an integer from 1 to 40.', 'schema');
  const hp = creature.attributes?.hp;
  if (!hp || !Number.isInteger(hp.value) || hp.value < 1) finding('INVALID_HP', '/creature/attributes/hp/value', 'HP value must be a positive integer.', 'schema');
  if (hp?.formula && !isDiceFormula(hp.formula)) finding('INVALID_DICE_FORMULA', '/creature/attributes/hp/formula', `Invalid HP dice formula: ${hp.formula}`, 'schema');
  if (!creature.attributes?.movement || !Object.values(creature.attributes.movement).some((value) => typeof value === 'number' && value >= 0)) {
    finding('MISSING_REQUIRED_FIELD', '/creature/attributes/movement', 'At least one movement speed is required.', 'schema');
  }
  const cr = creature.attributes?.cr;
  if (typeof cr !== 'number' || !Number.isFinite(cr) || cr < 0 || cr > 40) finding('INVALID_CR', '/creature/attributes/cr', 'CR must be a finite number from 0 to 40.', 'schema');

  for (const [section, features] of [
    ['traits', creature.traits],
    ['actions', creature.actions],
    ['bonusActions', creature.bonusActions],
    ['reactions', creature.reactions],
    ['legendaryActions', creature.legendaryActions],
  ] as const) {
    if (!Array.isArray(features)) {
      finding('INVALID_FEATURE_SECTION', `/creature/${section}`, `${section} must be an array.`, 'schema');
      continue;
    }
    const names = new Set<string>();
    features.forEach((feature, index) => {
      if (!feature?.name?.trim()) finding('MISSING_FEATURE_NAME', `/creature/${section}/${index}/name`, 'Feature name is required.', 'schema');
      if (!feature?.description?.trim()) finding('MISSING_FEATURE_DESCRIPTION', `/creature/${section}/${index}/description`, 'Feature description is required.', 'schema');
      const normalized = feature?.name?.trim().toLowerCase();
      if (normalized && names.has(normalized)) finding('DUPLICATE_FEATURE', `/creature/${section}/${index}/name`, `Duplicate feature name: ${feature.name}`, 'semantic');
      if (normalized) names.add(normalized);
      feature?.damage?.forEach((part, damageIndex) => {
        if (!isDiceFormula(part.formula)) finding('INVALID_DICE_FORMULA', `/creature/${section}/${index}/damage/${damageIndex}/formula`, `Invalid damage formula: ${part.formula}`, 'schema');
      });
    });
  }
}

function validateClaim(
  source: string,
  claim: IntakeClaim,
  index: number,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  if (!claim || typeof claim.path !== 'string' || !claim.path.startsWith('/creature/')) {
    finding('INVALID_CLAIM_PATH', `/claims/${index}/path`, 'Claim path must be a JSON Pointer under /creature.', 'schema');
  }
  if (!['explicit', 'derived', 'preserved-literal', 'user-confirmed'].includes(String(claim?.valueKind))) {
    finding('INVALID_CLAIM_KIND', `/claims/${index}/valueKind`, 'Unsupported claim kind.', 'schema');
  }
  if (!Array.isArray(claim?.evidence) || claim.evidence.length === 0) {
    finding('MISSING_EVIDENCE', `/claims/${index}/evidence`, 'Every claim requires at least one evidence reference.', 'evidence');
    return;
  }
  claim.evidence.forEach((ref, refIndex) => validateEvidence(source, ref, `/claims/${index}/evidence/${refIndex}`, finding));
}

function validateCoverage(
  source: string,
  entry: SourceCoverageEntry,
  index: number,
  claims: IntakeClaim[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  validateEvidence(source, entry, `/coverage/${index}`, finding);
  if (!['mechanical', 'narrative', 'ignored-with-reason'].includes(String(entry?.classification))) {
    finding('INVALID_COVERAGE_CLASS', `/coverage/${index}/classification`, 'Unsupported coverage classification.', 'coverage');
  }
  if (entry?.classification === 'ignored-with-reason' && !entry.reason?.trim()) {
    finding('MISSING_IGNORE_REASON', `/coverage/${index}/reason`, 'Ignored source requires an explicit reason.', 'coverage');
  }
  if (entry?.classification === 'mechanical' && (!Array.isArray(entry.claimPaths) || entry.claimPaths.length === 0)) {
    finding('UNCLAIMED_MECHANICAL_COVERAGE', `/coverage/${index}/claimPaths`, 'Mechanical coverage must point to at least one claim path.', 'coverage');
  }
  if (entry?.classification === 'mechanical' && entry.claimPaths?.some((path) => !claims.some((claim) => claim.path === path))) {
    finding('UNKNOWN_COVERAGE_CLAIM', `/coverage/${index}/claimPaths`, 'Mechanical coverage references a claim path that is not present in claims.', 'coverage');
  }
}

function validateEvidence(
  source: string,
  ref: EvidenceRef,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  if (!ref || !Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.start < 0 || ref.end < ref.start || ref.end > source.length) {
    finding('EVIDENCE_OUT_OF_RANGE', path, 'Evidence range is outside the submitted source.', 'evidence', ref ? [ref] : undefined);
    return;
  }
  if (source.slice(ref.start, ref.end) !== ref.quote) {
    finding('EVIDENCE_MISMATCH', path, 'Evidence quote does not match the exact UTF-16 source range.', 'evidence', [ref]);
  }
}

function validateFullCoverage(
  source: string,
  coverage: SourceCoverageEntry[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
  coverageRange?: { start: number; end: number },
): void {
  const covered = new Uint8Array(source.length);
  for (const entry of coverage) {
    if (!Number.isInteger(entry?.start) || !Number.isInteger(entry?.end)) continue;
    for (let index = Math.max(0, entry.start); index < Math.min(source.length, entry.end); index++) covered[index] = 1;
  }
  const start = coverageRange?.start ?? 0;
  const limit = coverageRange?.end ?? source.length;
  for (let index = start; index < limit; index++) {
    if (!covered[index] && !/\s/.test(source[index]!)) {
      const end = Math.min(source.length, index + 80);
      finding('UNCOVERED_SOURCE', '/coverage', 'Non-whitespace source text is not classified by the coverage ledger.', 'coverage', [{
        start: index,
        end,
        quote: source.slice(index, end),
      }]);
      return;
    }
  }
}

function validateConflictingClaims(
  claims: IntakeClaim[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const byPath = new Map<string, IntakeClaim[]>();
  for (const claim of claims) {
    if (claim?.value === undefined) continue;
    byPath.set(claim.path, [...(byPath.get(claim.path) ?? []), claim]);
  }
  for (const [path, pathClaims] of byPath) {
    const values = new Set(pathClaims.map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) {
      finding('CONFLICTING_CLAIMS', path, `Multiple claims assert different values for ${path}.`, 'conflict', pathClaims.flatMap((claim) => claim.evidence));
    }
  }
}

function validateExplicitAcConflicts(
  source: string,
  range: { start: number; end: number } | undefined,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const start = range?.start ?? 0;
  const end = range?.end ?? source.length;
  const text = source.slice(start, end);
  const evidence: Array<EvidenceRef & { value: number }> = [];
  const pattern = /(?:\bAC\b|护甲等级|Armor\s+Class)\s*(?:为|是|[:：])?\s*(\d{1,2})/giu;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue;
    const value = Number.parseInt(match[1], 10);
    const refStart = start + match.index;
    evidence.push({
      start: refStart,
      end: refStart + match[0].length,
      quote: match[0],
      value,
    });
  }
  const values = [...new Set(evidence.map((ref) => ref.value))];
  if (values.length > 1) {
    finding(
      'CONFLICTING_SOURCE_VALUES',
      '/creature/attributes/ac',
      `Source contains conflicting explicit AC values: ${values.join(', ')}.`,
      'conflict',
      evidence.map(({ value: _value, ...ref }) => ref),
    );
  }
}

function claimCovers(claim: IntakeClaim, requiredPath: string): boolean {
  if (claim?.path === requiredPath) return true;
  if (!requiredPath.startsWith(`${claim?.path}/`)) return false;
  return claim.path === '/creature/abilities'
    || claim.path === '/creature/saves'
    || claim.path === '/creature/skills'
    || claim.path === '/creature/defenses'
    || claim.path === '/creature/senses'
    || claim.path === '/creature/languages'
    || /^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions)\/\d+$/.test(claim.path);
}

function collectMechanicalClaimPaths(ir: MonsterIntakeIR): string[] {
  const creature = ir.creature;
  const paths = [
    '/creature/identity/name', '/creature/identity/size', '/creature/identity/creatureType',
    '/creature/abilities', '/creature/attributes/ac', '/creature/attributes/hp',
    '/creature/attributes/movement', '/creature/attributes/cr',
  ];
  if (creature.identity?.alignment) paths.push('/creature/identity/alignment');
  if (creature.attributes?.initiative != null) paths.push('/creature/attributes/initiative');
  if (creature.attributes?.xp != null) paths.push('/creature/attributes/xp');
  if (creature.attributes?.proficiencyBonus != null) paths.push('/creature/attributes/proficiencyBonus');
  if (Object.keys(creature.saves ?? {}).length > 0) paths.push('/creature/saves');
  if (Object.keys(creature.skills ?? {}).length > 0) paths.push('/creature/skills');
  if (Object.values(creature.defenses ?? {}).some((value) => Array.isArray(value) && value.length > 0)) paths.push('/creature/defenses');
  if (Object.keys(creature.senses ?? {}).length > 0) paths.push('/creature/senses');
  if ((creature.languages?.values?.length ?? 0) > 0 || creature.languages?.custom) paths.push('/creature/languages');
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
    creature[section]?.forEach((_feature, index) => paths.push(`/creature/${section}/${index}`));
  }
  return paths;
}

function isDiceFormula(value: string): boolean {
  return /^\d+d\d+(?:\s*[+-]\s*\d+)?$/i.test(value.trim());
}

function stableFindingId(code: string, path: string): string {
  return `${code.toLowerCase()}:${path}`.replace(/[^a-z0-9:/_-]+/g, '-');
}

function summarize(findings: IntakeFinding[]): IntakeValidationResult {
  return {
    findings,
    blocking: findings.filter((finding) => finding.blocking),
    warnings: findings.filter((finding) => !finding.blocking),
  };
}

function dedupeFindings(findings: IntakeFinding[]): IntakeFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

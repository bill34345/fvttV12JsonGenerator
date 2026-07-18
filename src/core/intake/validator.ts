import { createHash } from 'node:crypto';
import { validatePortableSpellManifest } from '../spell-resolution/validator';
import type {
  AbilityKey,
  CanonicalSpellUsageGroup,
  CanonicalSpellcastingGroup,
  EvidenceRef,
  IntakeClaim,
  IntakeFinding,
  IntakeValidationResult,
  MonsterIntakeIR,
  SourceCoverageEntry,
} from './types';

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SIZES = new Set(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
const SOURCE_SPELL_REF_KEYS = new Set([
  'refId', 'identifier', 'originalName', 'englishName', 'chineseName', 'aliases', 'restrictions', 'evidence',
]);
const SPELLCASTING_GROUP_KEYS = new Set([
  'groupId', 'featureName', 'featureEnglishName', 'description', 'evidence', 'ability', 'abilityEvidence',
  'saveDc', 'saveDcEvidence', 'attackBonus', 'attackBonusEvidence', 'componentWaivers', 'usageGroups',
]);
const SPELL_USAGE_GROUP_KEYS = new Set(['usage', 'evidence', 'spellRefs']);
const COMPONENT_WAIVER_KEYS = new Set(['component', 'evidence']);
const SPELL_RESTRICTION_KEYS = new Set(['kind', 'text', 'value', 'evidence']);
const SPELL_EVIDENCE_KEYS = new Set(['start', 'end', 'quote']);
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
  validateSpellcasting(source, ir, claims, coverage, finding);

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
  if (entry?.classification === 'mechanical' && entry.claimPaths?.some((path) => !claims.some((claim) => (
    isRecord(claim) && claim.path === path
  )))) {
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
  if (!isRecord(ir.creature)) return [];
  const creature = ir.creature as unknown as MonsterIntakeIR['creature'];
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
  if (Array.isArray(creature.spellcasting)) {
    creature.spellcasting.forEach((_group, index) => paths.push(`/creature/spellcasting/${index}`));
  }
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
    const features = creature[section];
    if (Array.isArray(features)) {
      features.forEach((_feature, index) => paths.push(`/creature/${section}/${index}`));
    }
  }
  return paths;
}

function validateSpellcasting(
  source: string,
  ir: MonsterIntakeIR,
  claims: IntakeClaim[],
  coverage: SourceCoverageEntry[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const groups = ir.creature?.spellcasting;
  if (groups === undefined) return;
  if (!Array.isArray(groups) || groups.length === 0) {
    finding('INVALID_SPELLCASTING_GROUPS', '/creature/spellcasting', 'spellcasting must be a non-empty array when present.', 'schema');
    return;
  }

  const portableGroups: Array<Record<string, unknown>> = [];
  const portablePathMappings: Array<{ portable: string; intake: string }> = [];

  groups.forEach((group, groupIndex) => {
    const path = `/creature/spellcasting/${groupIndex}`;
    if (!isRecord(group)) {
      finding('INVALID_SPELLCASTING_GROUP', path, 'Structured spellcasting group must be an object.', 'schema');
      return;
    }
    validateSpellcastingGroupFields(source, group, path, finding);
    validateSpellcastingNotDuplicated(ir, group, path, finding);
    validateSpellcastingCoverage(source, group, path, claims, coverage, finding);

    const spellRefs: Array<Record<string, unknown>> = [];
    if (Array.isArray(group.usageGroups)) {
      group.usageGroups.forEach((usageGroup, usageIndex) => {
        const usagePath = `${path}/usageGroups/${usageIndex}`;
        validateSpellUsageGroup(source, usageGroup, usagePath, finding);
        if (!isRecord(usageGroup) || !Array.isArray(usageGroup.spellRefs)) return;
        usageGroup.spellRefs.forEach((ref, refIndex) => {
          const portableRefIndex = spellRefs.length;
          const intakeRefPath = `${usagePath}/spellRefs/${refIndex}`;
          portablePathMappings.push({
            portable: `/spellcastingGroups/${groupIndex}/spellRefs/${portableRefIndex}`,
            intake: intakeRefPath,
          });
          const atWill = usageGroup.usage === 'at-will';
          spellRefs.push({
            ...(isRecord(ref) ? ref : {}),
            method: atWill ? 'at-will' : 'innate',
            ...(atWill ? {} : { uses: { value: 1, recovery: 'day', shared: false } }),
            ignoresMaterialComponents: Array.isArray(group.componentWaivers)
              && group.componentWaivers.some((waiver) => isRecord(waiver) && waiver.component === 'material'),
          });
        });
      });
    }
    portableGroups.push({
      groupId: group.groupId,
      featureItemKey: group.groupId,
      ability: group.ability,
      ...(group.saveDc === undefined ? {} : { saveDc: group.saveDc }),
      ...(group.attackBonus === undefined ? {} : { attackBonus: group.attackBonus }),
      spellRefs,
    });
  });

  const portableValidation = validatePortableSpellManifest({
    schemaVersion: 1,
    manifestId: `intake-${expectedSourceSha256(ir, source).slice(0, 16)}`,
    sourceSha256: expectedSourceSha256(ir, source),
    rulesPreference: '2024',
    spellcastingGroups: portableGroups,
  }, source);
  if (!portableValidation.ok) {
    for (const portableFinding of portableValidation.findings) {
      finding(
        portableFinding.code,
        mapPortableSpellPath(portableFinding.path, portablePathMappings),
        portableFinding.message,
        portableFinding.code.includes('EVIDENCE') ? 'evidence' : 'semantic',
        portableFinding.evidence,
      );
    }
  }
}

function validateSpellcastingGroupFields(
  source: string,
  group: CanonicalSpellcastingGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  validateUnknownSpellcastingProperties(group as unknown as Record<string, unknown>, SPELLCASTING_GROUP_KEYS, path, finding);
  if (typeof group.groupId !== 'string' || !group.groupId.trim()) {
    finding('INVALID_GROUP_ID', `${path}/groupId`, 'Spellcasting groupId must be a non-empty stable identifier.', 'schema');
  }
  if (typeof group.featureName !== 'string' || !group.featureName.trim()) {
    finding('MISSING_FEATURE_NAME', `${path}/featureName`, 'Structured spellcasting featureName is required.', 'schema');
  }
  if (typeof group.description !== 'string' || !group.description.trim()) {
    finding('MISSING_FEATURE_DESCRIPTION', `${path}/description`, 'Structured spellcasting description is required.', 'schema');
  } else if (!Array.isArray(group.evidence) || !group.evidence.some((ref) => (
    isRecord(ref)
    && typeof ref.quote === 'string'
    && ref.quote === group.description
    && Number.isInteger(ref.start)
    && Number.isInteger(ref.end)
    && source.slice(ref.start as number, ref.end as number) === group.description
  ))) {
    finding(
      'UNSUPPORTED_SPELLCASTING_DESCRIPTION',
      `${path}/description`,
      'Visible spellcasting description must exactly equal a verified source slice carried by group evidence.',
      'evidence',
      Array.isArray(group.evidence) ? group.evidence : undefined,
    );
  }
  if (!ABILITIES.includes(group.ability)) {
    finding('INVALID_ABILITY', `${path}/ability`, 'Spellcasting ability must be a supported stable ability key.', 'schema');
  }
  validateSpellEvidenceArray(source, group.evidence, `${path}/evidence`, finding);
  validateSpellEvidenceArray(source, group.abilityEvidence, `${path}/abilityEvidence`, finding);
  if (group.saveDc !== undefined) {
    if (!Number.isFinite(group.saveDc)) finding('INVALID_SAVE_DC', `${path}/saveDc`, 'Spell save DC must be finite.', 'schema');
    validateSpellEvidenceArray(source, group.saveDcEvidence, `${path}/saveDcEvidence`, finding);
  }
  if (group.attackBonus !== undefined) {
    if (!Number.isFinite(group.attackBonus)) finding('INVALID_ATTACK_BONUS', `${path}/attackBonus`, 'Spell attack bonus must be finite.', 'schema');
    validateSpellEvidenceArray(source, group.attackBonusEvidence, `${path}/attackBonusEvidence`, finding);
  }
  if (!Array.isArray(group.componentWaivers)) {
    finding('INVALID_COMPONENT_WAIVERS', `${path}/componentWaivers`, 'componentWaivers must be an array.', 'schema');
  } else {
    group.componentWaivers.forEach((waiver, waiverIndex) => {
      const waiverPath = `${path}/componentWaivers/${waiverIndex}`;
      if (!isRecord(waiver) || waiver.component !== 'material') {
        finding('INVALID_COMPONENT_WAIVER', waiverPath, 'Only an explicit material component waiver is supported.', 'schema');
        return;
      }
      validateUnknownSpellcastingProperties(waiver, COMPONENT_WAIVER_KEYS, waiverPath, finding);
      validateSpellEvidenceArray(source, waiver.evidence as EvidenceRef[], `${waiverPath}/evidence`, finding);
    });
  }
  if (!Array.isArray(group.usageGroups) || group.usageGroups.length === 0) {
    finding('INVALID_SPELL_USE_GROUP', `${path}/usageGroups`, 'At least one explicit spell use group is required.', 'schema');
  }
}

function validateSpellUsageGroup(
  source: string,
  usageGroup: CanonicalSpellUsageGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  if (!isRecord(usageGroup) || !['at-will', '1/day-each'].includes(String(usageGroup.usage))) {
    finding('INVALID_SPELL_USE_GROUP', `${path}/usage`, 'Only at-will and independent 1/day-each spell use groups are supported.', 'semantic');
    return;
  }
  for (const key of Object.keys(usageGroup)) {
    if (SPELL_USAGE_GROUP_KEYS.has(key)) continue;
    finding(
      key === 'shared' || key === 'uses' || key === 'sharedUses'
        ? 'INVALID_SPELL_USE_GROUP'
        : 'UNKNOWN_SPELLCASTING_PROPERTY',
      `${path}/${escapePointerSegment(key)}`,
      `Spell use group does not allow field ${key}.`,
      'schema',
    );
  }
  validateSpellEvidenceArray(source, usageGroup.evidence, `${path}/evidence`, finding);
  if (!Array.isArray(usageGroup.spellRefs) || usageGroup.spellRefs.length === 0) {
    finding('INVALID_SPELL_REFS', `${path}/spellRefs`, 'Spell use group must contain at least one source-granted spell.', 'schema');
  } else {
    usageGroup.spellRefs.forEach((ref, refIndex) => {
      if (!isRecord(ref)) return;
      const refPath = `${path}/spellRefs/${refIndex}`;
      for (const key of Object.keys(ref)) {
        if (!SOURCE_SPELL_REF_KEYS.has(key)) {
          finding(
            'UNSUPPORTED_SOURCE_SPELL_FIELD',
            `${refPath}/${escapePointerSegment(key)}`,
            `Source spell IR does not allow destination or fabricated field ${key}.`,
            'schema',
          );
        }
      }
      if (Array.isArray(ref.evidence)
        && ref.evidence.length > 0
        && !allEvidenceWithinGrants(ref.evidence, usageGroup.evidence)) {
        finding(
          'SPELL_EVIDENCE_OUTSIDE_GRANT',
          `${refPath}/evidence`,
          'Spell evidence must be contained in the explicit usage-group grant span.',
          'evidence',
          ref.evidence as EvidenceRef[],
        );
      }
      if (Array.isArray(ref.restrictions)) {
        ref.restrictions.forEach((restriction, restrictionIndex) => {
          if (!isRecord(restriction)) return;
          const restrictionPath = `${refPath}/restrictions/${restrictionIndex}`;
          validateUnknownSpellcastingProperties(
            restriction,
            SPELL_RESTRICTION_KEYS,
            restrictionPath,
            finding,
          );
          if (Array.isArray(restriction.evidence)
            && restriction.evidence.length > 0
            && !allEvidenceWithinGrants(restriction.evidence, usageGroup.evidence)) {
            finding(
              'SPELL_RESTRICTION_EVIDENCE_OUTSIDE_GRANT',
              `${restrictionPath}/evidence`,
              'Spell restriction evidence must be contained in the explicit usage-group grant span.',
              'evidence',
              restriction.evidence as EvidenceRef[],
            );
          }
        });
      }
    });
  }
  validateMinimalGrantSpans(usageGroup, path, finding);
}

function validateSpellcastingNotDuplicated(
  ir: MonsterIntakeIR,
  group: CanonicalSpellcastingGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const names = [group.featureName, group.featureEnglishName].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const traits = Array.isArray(ir.creature.traits) ? ir.creature.traits : [];
  const groupClaim = Array.isArray(ir.claims)
    ? ir.claims.find((claim) => isRecord(claim) && claim.path === path)
    : undefined;
  const duplicateIndex = traits.findIndex((trait, traitIndex) => {
    if (!isRecord(trait)) return false;
    const sameName = [trait.name, trait.englishName]
      .some((name) => typeof name === 'string' && names.some((groupName) => normalizeFeatureName(name) === normalizeFeatureName(groupName)));
    const sameDescription = typeof trait.description === 'string'
      && typeof group.description === 'string'
      && normalizeDescription(trait.description) === normalizeDescription(group.description);
    const traitClaim = Array.isArray(ir.claims)
      ? ir.claims.find((claim) => isRecord(claim) && claim.path === `/creature/traits/${traitIndex}`)
      : undefined;
    const overlappingProvenance = evidenceArraysOverlap(
      isRecord(groupClaim) && Array.isArray(groupClaim.evidence) ? groupClaim.evidence : [],
      isRecord(traitClaim) && Array.isArray(traitClaim.evidence) ? traitClaim.evidence : [],
    );
    return sameName || sameDescription || overlappingProvenance;
  });
  if (duplicateIndex >= 0) {
    finding(
      'DUPLICATE_STRUCTURED_SPELLCASTING',
      `/creature/traits/${duplicateIndex}`,
      `Structured spellcasting ${group.groupId} must not also be emitted as an ordinary trait.`,
      'semantic',
      group.evidence,
    );
  }
}

function validateSpellcastingCoverage(
  source: string,
  group: CanonicalSpellcastingGroup,
  path: string,
  claims: IntakeClaim[],
  coverage: SourceCoverageEntry[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const claimPresent = claims.some((claim) => isRecord(claim)
    && claim.path === path
    && Array.isArray(claim.evidence)
    && claim.evidence.length > 0);
  const evidence = Array.isArray(group.evidence) ? group.evidence : [];
  let exactlyOnce = claimPresent && evidence.length > 0;
  for (const ref of evidence) {
    if (!isValidEvidenceShape(ref)) {
      exactlyOnce = false;
      break;
    }
    for (let index = ref.start; index < ref.end; index += 1) {
      if (/\s/u.test(source[index] ?? '')) continue;
      const covering = coverage.filter((entry) => isRecord(entry)
        && entry.classification === 'mechanical'
        && typeof entry.start === 'number'
        && typeof entry.end === 'number'
        && entry.start <= index
        && entry.end > index
        && Array.isArray(entry.claimPaths)
        && entry.claimPaths.includes(path));
      if (covering.length !== 1) {
        exactlyOnce = false;
        break;
      }
    }
    if (!exactlyOnce) break;
  }
  if (!exactlyOnce) {
    finding(
      'UNCOVERED_SPELLCASTING_MECHANIC',
      path,
      'Structured spellcasting text must be mechanically covered exactly once by its source-backed claim.',
      'coverage',
      evidence,
    );
  }
}

function validateSpellEvidenceArray(
  source: string,
  evidence: EvidenceRef[] | undefined,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    finding('MISSING_EVIDENCE', path, 'Every structured spellcasting mechanic requires exact source evidence.', 'evidence');
    return;
  }
  evidence.forEach((ref, index) => validateEvidence(source, ref, `${path}/${index}`, finding));
  evidence.forEach((ref, index) => {
    if (isRecord(ref)) validateUnknownSpellcastingProperties(ref, SPELL_EVIDENCE_KEYS, `${path}/${index}`, finding);
  });
}

function mapPortableSpellPath(
  path: string,
  mappings: Array<{ portable: string; intake: string }>,
): string {
  const refMapping = mappings.find((mapping) => path === mapping.portable || path.startsWith(`${mapping.portable}/`));
  if (refMapping) return `${refMapping.intake}${path.slice(refMapping.portable.length)}`;
  return path.replace(/^\/spellcastingGroups\/(\d+)/u, '/creature/spellcasting/$1');
}

function normalizeFeatureName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/gu, '');
}

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function validateMinimalGrantSpans(
  usageGroup: CanonicalSpellUsageGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const grants = Array.isArray(usageGroup.evidence) ? usageGroup.evidence : [];
  const validGrants = grants.filter(isValidEvidenceShape);
  const hasAnchoredLabel = validGrants.some((grant) => matchGrantLabel(grant.quote, usageGroup.usage) !== null);
  const hasAnyLabel = validGrants.some((grant) => grantLabelPattern(usageGroup.usage, false).test(grant.quote));
  const childEvidence: Array<{ evidence: EvidenceRef; path: string }> = [];
  if (Array.isArray(usageGroup.spellRefs)) {
    usageGroup.spellRefs.forEach((ref, refIndex) => {
      if (!isRecord(ref)) return;
      if (Array.isArray(ref.evidence)) {
        ref.evidence.forEach((evidence, evidenceIndex) => {
          if (isValidEvidenceShape(evidence)) childEvidence.push({
            evidence,
            path: `${path}/spellRefs/${refIndex}/evidence/${evidenceIndex}`,
          });
        });
      }
      if (Array.isArray(ref.restrictions)) {
        ref.restrictions.forEach((restriction, restrictionIndex) => {
          if (!isRecord(restriction) || !Array.isArray(restriction.evidence)) return;
          restriction.evidence.forEach((evidence, evidenceIndex) => {
            if (isValidEvidenceShape(evidence)) childEvidence.push({
              evidence,
              path: `${path}/spellRefs/${refIndex}/restrictions/${restrictionIndex}/evidence/${evidenceIndex}`,
            });
          });
        });
      }
    });
  }

  grants.forEach((grant, grantIndex) => {
    if (!isValidEvidenceShape(grant)) return;
    const evidencePath = `${path}/evidence/${grantIndex}`;
    const label = matchGrantLabel(grant.quote, usageGroup.usage);
    if (!label) {
      const containsLabel = grantLabelPattern(usageGroup.usage, false).test(grant.quote);
      if (containsLabel || hasAnchoredLabel) {
        finding(
          'INVALID_SPELL_GRANT_SPAN',
          evidencePath,
          'Every usage evidence ref must begin with the matching usage label and form a self-contained grant span.',
          'semantic',
          [grant],
        );
      }
      return;
    }
    const labelEnd = grant.start + label[0].length;
    const supported = childEvidence
      .filter((child) => child.evidence.start >= grant.start && child.evidence.end <= grant.end)
      .sort((left, right) => left.evidence.start - right.evidence.start || left.evidence.end - right.evidence.end);
    if (supported.length === 0) {
      finding(
        'INVALID_SPELL_GRANT_SPAN',
        evidencePath,
        'Every usage evidence span must contain at least one supported spell or restriction evidence range.',
        'evidence',
        [grant],
      );
      return;
    }
    let cursor = labelEnd;
    let selfContained = true;
    for (const child of supported) {
      if (child.evidence.start < cursor
        || !isGrantSeparator(grant.quote.slice(cursor - grant.start, child.evidence.start - grant.start))) {
        selfContained = false;
        break;
      }
      cursor = child.evidence.end;
    }
    if (selfContained && !isGrantSeparator(grant.quote.slice(cursor - grant.start))) selfContained = false;
    if (!selfContained) {
      finding(
        'INVALID_SPELL_GRANT_SPAN',
        evidencePath,
        'Usage grant evidence must contain only its label, supported child evidence, punctuation, Markdown markers, and whitespace.',
        'evidence',
        [grant],
      );
    }
  });

  if (validGrants.length > 0 && !hasAnchoredLabel && !hasAnyLabel) {
    finding(
      'SPELL_NOT_EXPLICITLY_GRANTED',
      path,
      'Spell use group evidence does not explicitly grant the listed spells.',
      'semantic',
      validGrants,
    );
  }

  for (const child of childEvidence) {
    const parentCount = grants.filter((grant) => isValidEvidenceShape(grant)
      && child.evidence.start >= grant.start
      && child.evidence.end <= grant.end).length;
    if (parentCount === 0) continue; // The field-specific containment finding is emitted above.
    if (parentCount !== 1) {
      finding(
        'INVALID_SPELL_GRANT_SPAN',
        child.path,
        'Each spell or restriction evidence range must belong to exactly one self-contained usage grant span.',
        'evidence',
        [child.evidence],
      );
    }
  }
}

function matchGrantLabel(quote: string, usage: CanonicalSpellUsageGroup['usage']): RegExpMatchArray | null {
  return quote.match(grantLabelPattern(usage, true));
}

function grantLabelPattern(usage: CanonicalSpellUsageGroup['usage'], anchored: boolean): RegExp {
  const label = usage === 'at-will'
    ? '(?:随意|at[\\s-]*will)'
    : '(?:每(?:项|个)\\s*1\\s*\\/\\s*日|1\\s*\\/\\s*day\\s*each)';
  const prefix = anchored
    ? '^\\s*(?:(?:[-+*]|>)\\s+)?(?:[*_~]{1,3})?\\s*'
    : '';
  return new RegExp(`${prefix}${label}\\s*[:：]\\s*(?:[*_~]{1,3})?\\s*`, 'iu');
}

function isGrantSeparator(value: string): boolean {
  const lexical = value.replace(/[\s\p{P}>+]+/gu, ' ').trim().toLocaleLowerCase('en-US');
  return lexical === '' || /^(?:(?:and|or|和|与|及|以及)(?:\s+|$))+$/u.test(lexical);
}

function allEvidenceWithinGrants(evidence: unknown[], grants: unknown): boolean {
  if (!Array.isArray(grants) || grants.length === 0) return false;
  return evidence.every((child) => isValidEvidenceShape(child) && grants.some((parent) => (
    isValidEvidenceShape(parent)
    && child.start >= parent.start
    && child.end <= parent.end
  )));
}

function evidenceArraysOverlap(left: unknown[], right: unknown[]): boolean {
  return left.some((leftRef) => isValidEvidenceShape(leftRef) && right.some((rightRef) => (
    isValidEvidenceShape(rightRef)
    && leftRef.start < rightRef.end
    && rightRef.start < leftRef.end
  )));
}

function isValidEvidenceShape(value: unknown): value is EvidenceRef {
  return isRecord(value)
    && Number.isInteger(value.start)
    && Number.isInteger(value.end)
    && typeof value.quote === 'string';
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function validateUnknownSpellcastingProperties(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    finding(
      'UNKNOWN_SPELLCASTING_PROPERTY',
      `${path}/${escapePointerSegment(key)}`,
      `Structured spellcasting does not allow field ${key}.`,
      'schema',
    );
  }
}

function expectedSourceSha256(ir: MonsterIntakeIR, source: string): string {
  return typeof ir.source?.sha256 === 'string'
    ? ir.source.sha256
    : createHash('sha256').update(source).digest('hex');
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

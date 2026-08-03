import { createHash } from 'node:crypto';
import { validatePortableSpellManifest } from '@fvtt-json-generator/spell-manifest-contracts/validator';
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
  'casterLevel', 'casterLevelEvidence', 'saveDc', 'saveDcEvidence', 'attackBonus', 'attackBonusEvidence',
  'componentWaivers', 'usageGroups',
]);
const SPELL_USAGE_GROUP_KEYS = new Set(['usage', 'evidence', 'spellRefs']);
const PREPARED_SLOT_USAGE_GROUP_KEYS = new Set([
  ...SPELL_USAGE_GROUP_KEYS, 'level', 'levelEvidence', 'slots', 'slotsEvidence',
]);
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

  validateCreature(source, ir, finding);
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
  source: string,
  ir: MonsterIntakeIR,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const creature = ir.creature;
  if (!isRecord(creature)) {
    finding('MISSING_CREATURE', '/creature', 'creature must be an object.', 'schema');
    return;
  }
  if (typeof creature.identity?.name !== 'string' || !creature.identity.name.trim()) {
    finding('MISSING_REQUIRED_FIELD', '/creature/identity/name', 'Monster name is required.', 'schema');
  }
  if (!SIZES.has(String(creature.identity?.size))) finding('INVALID_SIZE', '/creature/identity/size', 'Monster size is missing or unsupported.', 'schema');
  if (typeof creature.identity?.creatureType !== 'string' || !creature.identity.creatureType.trim()) {
    finding('MISSING_REQUIRED_FIELD', '/creature/identity/creatureType', 'Creature type is required.', 'schema');
  }
  if (creature.biography != null && typeof creature.biography !== 'string') {
    finding('INVALID_BIOGRAPHY', '/creature/biography', 'Biography must be a string when present.', 'schema');
  }
  if (creature.languages?.custom != null && typeof creature.languages.custom !== 'string') {
    finding('INVALID_LANGUAGE_CUSTOM', '/creature/languages/custom', 'Custom language text must be a string when present.', 'schema');
  }
  if (creature.legendary !== undefined) {
    if (!isRecord(creature.legendary)) {
      finding('INVALID_LEGENDARY_METADATA', '/creature/legendary', 'legendary must be an object when present.', 'schema');
    } else {
      if (!Number.isInteger(creature.legendary.max) || (creature.legendary.max as number) < 1) {
        finding('INVALID_LEGENDARY_ACTION_COUNT', '/creature/legendary/max', 'legendary.max must be a positive integer.', 'schema');
      }
      if (typeof creature.legendary.preamble !== 'string' || !creature.legendary.preamble.trim()) {
        finding('INVALID_LEGENDARY_PREAMBLE', '/creature/legendary/preamble', 'legendary.preamble must preserve the exact visible source text.', 'schema');
      }
      const evidence = creature.legendary.evidence;
      if (!Array.isArray(evidence) || !evidence.some((ref) => isValidEvidenceShape(ref)
        && source.slice(ref.start, ref.end) === ref.quote
        && ref.quote === creature.legendary!.preamble)) {
        finding('LEGENDARY_PREAMBLE_EVIDENCE_MISMATCH', '/creature/legendary/preamble', 'Legendary preamble must exactly match source evidence.', 'evidence', evidence as EvidenceRef[] | undefined);
      }
    }
  }

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
    ['mythicActions', creature.mythicActions],
  ] as const) {
    if (!Array.isArray(features)) {
      if (section === 'mythicActions' && features === undefined) continue;
      finding('INVALID_FEATURE_SECTION', `/creature/${section}`, `${section} must be an array.`, 'schema');
      continue;
    }
    const names = new Set<string>();
    features.forEach((feature, index) => {
      if (typeof feature?.name !== 'string' || !feature.name.trim()) {
        finding('MISSING_FEATURE_NAME', `/creature/${section}/${index}/name`, 'Feature name is required.', 'schema');
      }
      if (typeof feature?.description !== 'string' || !feature.description.trim()) {
        finding('MISSING_FEATURE_DESCRIPTION', `/creature/${section}/${index}/description`, 'Feature description is required.', 'schema');
      }
      const normalized = typeof feature?.name === 'string' ? feature.name.trim().toLowerCase() : '';
      if (normalized && names.has(normalized)) finding('DUPLICATE_FEATURE', `/creature/${section}/${index}/name`, `Duplicate feature name: ${feature.name}`, 'semantic');
      if (normalized) names.add(normalized);
      if (feature?.damage !== undefined && !Array.isArray(feature.damage)) {
        finding('INVALID_DAMAGE', `/creature/${section}/${index}/damage`, 'Feature damage must be an array when present.', 'schema');
      } else if (Array.isArray(feature?.damage)) {
        feature.damage.forEach((part, damageIndex) => {
          const partPath = `/creature/${section}/${index}/damage/${damageIndex}`;
          if (!isRecord(part)) {
            finding('INVALID_DAMAGE_PART', partPath, 'Each damage entry must be an object.', 'schema');
            return;
          }
          if (typeof part.formula !== 'string' || !isDiceFormula(part.formula)) {
            finding('INVALID_DICE_FORMULA', `${partPath}/formula`, 'Damage formula must be a valid dice-formula string.', 'schema');
          }
        });
      }
    });
  }
  validateSourceFeaturePresence(source, creature, finding);
}

function validateSourceFeaturePresence(
  source: string,
  creature: MonsterIntakeIR['creature'],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const checks: Array<{ section: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions' | 'mythicActions'; label: string; pattern: RegExp }> = [
    { section: 'actions', label: 'Actions/动作', pattern: /(?:^|\n)\s*(?:Actions|动作)(?=\s|$)/imu },
    { section: 'bonusActions', label: 'Bonus Actions/附赠动作', pattern: /(?:^|\n)\s*(?:Bonus Actions|附赠动作)(?=\s|$)/imu },
    { section: 'reactions', label: 'Reactions/反应', pattern: /(?:^|\n)\s*(?:Reactions?|反应)(?=\s|$)/imu },
    { section: 'legendaryActions', label: 'Legendary Actions/传奇动作', pattern: /(?:^|\n)\s*(?:Legendary Actions|传奇动作)(?=\s|$)/imu },
    { section: 'mythicActions', label: 'Mythic Actions/神话动作', pattern: /(?:^|\n)\s*(?:Mythic Actions|神话动作)(?=\s|$)/imu },
    { section: 'traits', label: 'Traits/特性', pattern: /(?:^|\n)\s*(?:Traits?|特性)(?=\s|$)/imu },
  ];
  for (const check of checks) {
    const features = creature?.[check.section];
    const hasExplicitSection = check.pattern.test(source);
    const hasInlineTrait = check.section === 'traits' && sourceHasInlineTrait(source);
    if ((hasExplicitSection || hasInlineTrait) && Array.isArray(features) && features.length === 0) {
      finding(
        'MISSING_SOURCE_FEATURES',
        `/creature/${check.section}`,
        `Source contains ${check.label}, but the corresponding IR collection is empty; every named source feature must be reconstructed with exact evidence.`,
        'evidence',
      );
    }
  }
}

function sourceHasInlineTrait(source: string): boolean {
  const actionMarker = /(?:^|\n)\s*(?:Actions|动作)(?=\s|$)/imu;
  const actionIndex = source.search(actionMarker);
  if (actionIndex < 0) return false;
  const prefix = source.slice(0, actionIndex);
  return prefix.split(/\r?\n/).some((line) => {
    const value = line.replace(/<!--.*?-->/g, '').trim();
    if (!value || /^#|^(?:AC|HP|Speed|Type|Size|Initiative|STR|DEX|CON|INT|WIS|CHA|护甲等级|生命值|速度|类型|体型|先攻|力量|敏捷|体质|智力|感知|魅力|感官|语言|挑战等级|熟练加值)/iu.test(value)) return false;
    return /^[^.!?。！？]{2,80}[.!?。！？]/u.test(value);
  });
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
    || /^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions|mythicActions)\/\d+$/.test(claim.path);
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
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions', 'mythicActions'] as const) {
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
        validateUsageEvidenceWithinGroup(source, group, usageGroup, usagePath, finding);
        validateSpellUsageGroup(source, usageGroup, usagePath, finding);
        if (!isRecord(usageGroup) || !Array.isArray(usageGroup.spellRefs)) return;
        usageGroup.spellRefs.forEach((ref, refIndex) => {
          const portableRefIndex = spellRefs.length;
          const intakeRefPath = `${usagePath}/spellRefs/${refIndex}`;
          portablePathMappings.push({
            portable: `/spellcastingGroups/${groupIndex}/spellRefs/${portableRefIndex}`,
            intake: intakeRefPath,
          });
          const atWill = usageGroup.usage === 'at-will' || usageGroup.usage === 'prepared-cantrip';
          const prepared = usageGroup.usage === 'prepared-slots';
          spellRefs.push({
            ...(isRecord(ref) ? ref : {}),
            method: atWill ? 'at-will' : prepared ? 'prepared' : 'innate',
            ...(prepared
              ? { castingLevel: usageGroup.level }
              : atWill ? {} : { uses: { value: 1, recovery: 'day', shared: false } }),
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

  validatePreparedSpellcastingCompatibility(groups, finding);

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

function validatePreparedSpellcastingCompatibility(
  groups: CanonicalSpellcastingGroup[],
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const prepared = groups.map((group, index) => ({ group, index })).filter(({ group }) => (
    isRecord(group) && Array.isArray(group.usageGroups) && group.usageGroups.some((usage) => (
      isRecord(usage) && (usage.usage === 'prepared-cantrip' || usage.usage === 'prepared-slots')
    ))
  ));
  if (prepared.length < 2) return;
  const first = prepared[0]!.group;
  const slots = new Map<number, number>();
  for (const { group, index } of prepared) {
    if (group.ability !== first.ability || group.casterLevel !== first.casterLevel) {
      finding(
        'CONFLICTING_PREPARED_SPELLCASTING_PROFILE',
        `/creature/spellcasting/${index}`,
        'Prepared spellcasting groups sharing one Actor must use the same ability and caster level.',
        'semantic',
        group.evidence,
      );
    }
    for (const usage of group.usageGroups) {
      if (usage.usage !== 'prepared-slots') continue;
      const existing = slots.get(usage.level);
      if (existing !== undefined && existing !== usage.slots) {
        finding(
          'CONFLICTING_PREPARED_SPELL_SLOTS',
          `/creature/spellcasting/${index}/usageGroups`,
          `Prepared level-${usage.level} slot pools disagree (${existing} versus ${usage.slots}).`,
          'semantic',
          usage.evidence,
        );
      } else {
        slots.set(usage.level, usage.slots);
      }
    }
  }
}

function validateUsageEvidenceWithinGroup(
  source: string,
  group: CanonicalSpellcastingGroup,
  usageGroup: CanonicalSpellUsageGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const verifiedGroupEvidence = Array.isArray(group.evidence)
    ? group.evidence.filter((ref) => isValidEvidenceShape(ref)
      && typeof group.description === 'string'
      && ref.quote === group.description
      && source.slice(ref.start, ref.end) === ref.quote)
    : [];
  if (!Array.isArray(usageGroup?.evidence)) return;
  usageGroup.evidence.forEach((ref, index) => {
    if (!isValidEvidenceShape(ref)) return;
    const contained = verifiedGroupEvidence.some((groupRef) => (
      ref.start >= groupRef.start && ref.end <= groupRef.end
    ));
    if (!contained) {
      finding(
        'SPELL_USAGE_OUTSIDE_GROUP',
        `${path}/evidence/${index}`,
        'Usage grant evidence must be fully contained in the exact complete spellcasting group description evidence.',
        'evidence',
        [ref],
      );
    }
  });
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
  if (ABILITIES.includes(group.ability) && !evidenceEntailsAbility(source, group.abilityEvidence, group.ability)) {
    finding(
      'SPELL_ABILITY_EVIDENCE_MISMATCH',
      `${path}/ability`,
      `Exact spellcasting evidence does not entail ability ${group.ability}.`,
      'evidence',
      group.abilityEvidence,
    );
  }
  const hasPreparedUsage = Array.isArray(group.usageGroups)
    && group.usageGroups.some((usageGroup) => isRecord(usageGroup)
      && (usageGroup.usage === 'prepared-cantrip' || usageGroup.usage === 'prepared-slots'));
  if (group.casterLevel !== undefined || group.casterLevelEvidence !== undefined || hasPreparedUsage) {
    if (!Number.isInteger(group.casterLevel) || (group.casterLevel as number) < 1 || (group.casterLevel as number) > 20) {
      finding(
        'INVALID_SPELLCASTER_LEVEL',
        `${path}/casterLevel`,
        'Prepared spellcasting requires a casterLevel integer from 1 to 20.',
        'schema',
      );
    }
    validateSpellEvidenceArray(source, group.casterLevelEvidence, `${path}/casterLevelEvidence`, finding);
    if (Number.isInteger(group.casterLevel)
      && !evidenceEntailsCasterLevel(source, group.casterLevelEvidence, group.casterLevel as number)) {
      finding(
        'SPELLCASTER_LEVEL_EVIDENCE_MISMATCH',
        `${path}/casterLevel`,
        `Exact spellcasting evidence does not entail caster level ${group.casterLevel}.`,
        'evidence',
        group.casterLevelEvidence,
      );
    }
  }
  if (group.saveDc !== undefined) {
    if (!Number.isFinite(group.saveDc)) finding('INVALID_SAVE_DC', `${path}/saveDc`, 'Spell save DC must be finite.', 'schema');
    validateSpellEvidenceArray(source, group.saveDcEvidence, `${path}/saveDcEvidence`, finding);
    if (Number.isFinite(group.saveDc) && !evidenceEntailsSaveDc(source, group.saveDcEvidence, group.saveDc)) {
      finding(
        'SPELL_SAVE_DC_EVIDENCE_MISMATCH',
        `${path}/saveDc`,
        `Exact spellcasting evidence does not entail save DC ${group.saveDc}.`,
        'evidence',
        group.saveDcEvidence,
      );
    }
  }
  if (group.attackBonus !== undefined) {
    if (!Number.isFinite(group.attackBonus)) finding('INVALID_ATTACK_BONUS', `${path}/attackBonus`, 'Spell attack bonus must be finite.', 'schema');
    validateSpellEvidenceArray(source, group.attackBonusEvidence, `${path}/attackBonusEvidence`, finding);
    if (Number.isFinite(group.attackBonus) && !evidenceEntailsAttackBonus(source, group.attackBonusEvidence, group.attackBonus)) {
      finding(
        'SPELL_ATTACK_BONUS_EVIDENCE_MISMATCH',
        `${path}/attackBonus`,
        `Exact spellcasting evidence does not entail spell attack bonus ${group.attackBonus}.`,
        'evidence',
        group.attackBonusEvidence,
      );
    }
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
      if (!evidenceEntailsMaterialWaiver(source, waiver.evidence as EvidenceRef[])) {
        finding(
          'SPELL_COMPONENT_WAIVER_EVIDENCE_MISMATCH',
          waiverPath,
          'Exact component-waiver evidence does not entail ignoring material components.',
          'evidence',
          waiver.evidence as EvidenceRef[],
        );
      }
    });
    if (textEntailsMaterialWaiver(exactEvidenceText(source, group.evidence))
      && !group.componentWaivers.some((waiver) => isRecord(waiver) && waiver.component === 'material')) {
      finding(
        'SPELL_COMPONENT_WAIVER_MISSING',
        `${path}/componentWaivers`,
        'Source spellcasting text explicitly waives material components, but the structured waiver is missing.',
        'evidence',
        group.evidence,
      );
    }
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
  if (!isRecord(usageGroup)
    || !['at-will', '1/day-each', 'prepared-cantrip', 'prepared-slots'].includes(String(usageGroup.usage))) {
    finding(
      'INVALID_SPELL_USE_GROUP',
      `${path}/usage`,
      'Only at-will, independent 1/day-each, prepared-cantrip, and prepared-slots spell use groups are supported.',
      'semantic',
    );
    return;
  }
  const allowedKeys = usageGroup.usage === 'prepared-slots'
    ? PREPARED_SLOT_USAGE_GROUP_KEYS
    : SPELL_USAGE_GROUP_KEYS;
  for (const key of Object.keys(usageGroup)) {
    if (allowedKeys.has(key)) continue;
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
  if (usageGroup.usage === 'prepared-slots') {
    if (!Number.isInteger(usageGroup.level) || (usageGroup.level as number) < 1 || (usageGroup.level as number) > 9) {
      finding('INVALID_SPELL_USE_GROUP', `${path}/level`, 'Prepared spell level must be an integer from 1 to 9.', 'schema');
    }
    validateSpellEvidenceArray(source, usageGroup.levelEvidence, `${path}/levelEvidence`, finding);
    if (Number.isInteger(usageGroup.level)
      && !evidenceEntailsSpellLevel(source, usageGroup.levelEvidence, usageGroup.level as number)) {
      finding(
        'SPELL_SLOT_LEVEL_EVIDENCE_MISMATCH',
        `${path}/level`,
        `Exact prepared-spell evidence does not entail spell level ${usageGroup.level}.`,
        'evidence',
        usageGroup.levelEvidence as EvidenceRef[] | undefined,
      );
    }
    if (!Number.isInteger(usageGroup.slots) || (usageGroup.slots as number) < 1) {
      finding('INVALID_SPELL_USE_GROUP', `${path}/slots`, 'Prepared spell slots must be a positive integer.', 'schema');
    }
    validateSpellEvidenceArray(source, usageGroup.slotsEvidence, `${path}/slotsEvidence`, finding);
    if (Number.isInteger(usageGroup.slots)
      && !evidenceEntailsSpellSlots(source, usageGroup.slotsEvidence, usageGroup.slots as number)) {
      finding(
        'SPELL_SLOT_COUNT_EVIDENCE_MISMATCH',
        `${path}/slots`,
        `Exact prepared-spell evidence does not entail ${usageGroup.slots} spell slots.`,
        'evidence',
        usageGroup.slotsEvidence as EvidenceRef[] | undefined,
      );
    }
    for (const [field, evidence] of [
      ['levelEvidence', usageGroup.levelEvidence],
      ['slotsEvidence', usageGroup.slotsEvidence],
    ] as const) {
      if (Array.isArray(evidence) && evidence.length > 0
        && !allEvidenceWithinGrants(evidence, usageGroup.evidence)) {
        finding(
          'SPELL_SLOT_EVIDENCE_OUTSIDE_GRANT',
          `${path}/${field}`,
          'Prepared spell level and slot evidence must be contained in the explicit usage-group grant span.',
          'evidence',
          evidence as EvidenceRef[],
        );
      }
    }
  }
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
      if (!evidenceEntailsSpellRef(source, ref, ref.evidence as EvidenceRef[])) {
        finding(
          'SPELL_REF_EVIDENCE_MISMATCH',
          refPath,
          'Exact spell evidence does not entail a source-side spell name, or the structured identifier and aliases are internally inconsistent.',
          'evidence',
          Array.isArray(ref.evidence) ? ref.evidence as EvidenceRef[] : undefined,
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

// source-derived: these checks bind structured spell mechanics to exact source slices.
// The vocabulary below is schema-derived (stable dnd5e ability keys and their English/Chinese labels).
function exactEvidenceText(source: string, evidence: unknown): string {
  if (!Array.isArray(evidence)) return '';
  return evidence.flatMap((value) => {
    if (!isRecord(value)
      || !Number.isInteger(value.start)
      || !Number.isInteger(value.end)
      || typeof value.quote !== 'string'
      || source.slice(value.start as number, value.end as number) !== value.quote) return [];
    return [value.quote];
  }).join('\n');
}

function evidenceEntailsCasterLevel(source: string, evidence: unknown, casterLevel: number): boolean {
  const text = exactEvidenceText(source, evidence);
  const level = String(casterLevel);
  return new RegExp(
    `(?:\\b${level}(?:st|nd|rd|th)[\\s-]*level\\s+(?:spellcaster|caster)\\b|\\b(?:spellcaster|caster)\\s+level\\s+${level}\\b|${level}\\s*\\u7ea7(?:\\u7684)?\\u65bd\\u6cd5\\u8005)`,
    'iu',
  ).test(text);
}

function evidenceEntailsSpellLevel(source: string, evidence: unknown, spellLevel: number): boolean {
  const text = exactEvidenceText(source, evidence);
  const level = String(spellLevel);
  return new RegExp(`(?:\\b${level}(?:st|nd|rd|th)?[\\s-]*level\\b|${level}\\s*\\u73af)`, 'iu').test(text);
}

function evidenceEntailsSpellSlots(source: string, evidence: unknown, slots: number): boolean {
  const text = exactEvidenceText(source, evidence);
  const count = String(slots);
  return new RegExp(`(?:\\b${count}\\s*(?:spell\\s+)?slots?\\b|${count}\\s*\\u6cd5\\u4f4d)`, 'iu').test(text);
}

function normalizeEvidenceToken(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\p{P}\p{S}\s]+/gu, '');
}

function evidenceEntailsSpellRef(source: string, ref: Record<string, unknown>, evidence: EvidenceRef[]): boolean {
  const evidenceText = exactEvidenceText(source, evidence);
  if (!evidenceText) return false;
  const names = [ref.originalName, ref.englishName, ref.chineseName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const aliases = (Array.isArray(ref.aliases) ? ref.aliases : [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const identifier = normalizeEvidenceToken(ref.identifier);
  const hasEnglishName = typeof ref.englishName === 'string' && ref.englishName.trim().length > 0;
  const englishName = hasEnglishName && isLatinLetterOnlyName(ref.englishName as string)
    ? normalizeEvidenceToken(ref.englishName)
    : '';
  const originalName = normalizeEvidenceToken(ref.originalName);
  const stableEnglishName = hasEnglishName
    ? englishName
    : (typeof ref.originalName === 'string' && isLatinLetterOnlyName(ref.originalName) ? originalName : '');
  const provenNames = names.filter((name) => evidenceContainsPhrase(evidenceText, name));
  const aliasesInternallyConsistent = aliases.every((alias) => {
    const normalizedAlias = normalizeEvidenceToken(alias);
    return Boolean(normalizedAlias) && (
      provenNames.some((name) => normalizeEvidenceToken(name) === normalizedAlias)
      || evidenceContainsPhrase(evidenceText, alias)
    );
  });
  return provenNames.length > 0
    && Boolean(identifier)
    && Boolean(stableEnglishName)
    && identifier === stableEnglishName
    && provenNames.some((name) => normalizeEvidenceToken(name) === stableEnglishName)
    && aliasesInternallyConsistent;
}

function isLatinLetterOnlyName(value: string): boolean {
  const letters = Array.from(value.normalize('NFKC')).filter((character) => /\p{L}/u.test(character));
  return letters.length > 0 && letters.every((character) => /\p{Script=Latin}/u.test(character));
}

function evidenceContainsPhrase(evidenceText: string, phrase: string): boolean {
  const text = evidenceText.normalize('NFKC').toLocaleLowerCase('en-US');
  const phraseCharacters = Array.from(phrase.normalize('NFKC').toLocaleLowerCase('en-US'))
    .filter((character) => !/[\p{P}\p{S}\s]/u.test(character));
  if (phraseCharacters.length === 0) return false;
  const flexibleSeparator = '[\\p{P}\\p{S}\\s]*';
  const matcher = new RegExp(phraseCharacters.map(escapeRegExp).join(flexibleSeparator), 'giu');
  for (const match of text.matchAll(matcher)) {
    const start = match.index;
    const end = start + match[0].length;
    const before = adjacentPhraseCharacter(text, start, -1);
    const after = adjacentPhraseCharacter(text, end, 1);
    if (!sameTokenClass(before, phraseCharacters[0])
      && !sameTokenClass(after, phraseCharacters.at(-1))) return true;
  }
  return false;
}

function adjacentPhraseCharacter(text: string, offset: number, direction: -1 | 1): string | undefined {
  const characters = direction < 0
    ? Array.from(text.slice(0, offset)).reverse()
    : Array.from(text.slice(offset));
  return characters.find((character) => !/[\s\p{Pd}\p{Pc}'’]/u.test(character));
}

function sameTokenClass(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  return evidenceTokenClass(left) === evidenceTokenClass(right) && evidenceTokenClass(left) !== undefined;
}

function evidenceTokenClass(character: string): 'latin-number' | 'cjk' | 'unicode-letter' | undefined {
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)) return 'cjk';
  if (/[\p{Script=Latin}\p{N}]/u.test(character)) return 'latin-number';
  if (/\p{L}/u.test(character)) return 'unicode-letter';
  return undefined;
}

function evidenceEntailsAbility(source: string, evidence: EvidenceRef[] | undefined, ability: AbilityKey): boolean {
  const labels: Record<AbilityKey, string[]> = {
    str: ['strength', '\u529b\u91cf'], dex: ['dexterity', '\u654f\u6377'], con: ['constitution', '\u4f53\u8d28'],
    int: ['intelligence', '\u667a\u529b'], wis: ['wisdom', '\u611f\u77e5'], cha: ['charisma', '\u9b45\u529b'],
  };
  const text = exactEvidenceText(source, evidence).normalize('NFKC').toLocaleLowerCase('en-US');
  return labels[ability].some((label) => {
    const escaped = escapeRegExp(label);
    return new RegExp(`(?:spellcasting\\s+ability\\s+(?:is|uses?)\\s*${escaped}|uses?\\s+${escaped}\\s+as\\s+(?:(?:its|the)\\s+)?spellcasting\\s+ability|\\u65bd\\u6cd5(?:\\u5173\\u952e)?\\u5c5e\\u6027(?:\\u662f|\\u4e3a)\\s*${escaped}|\\u4f7f\\u7528\\s*${escaped}\\s*\\u4f5c\\u4e3a\\s*\\u65bd\\u6cd5\\u5c5e\\u6027)(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}

function evidenceEntailsSaveDc(source: string, evidence: EvidenceRef[] | undefined, dc: number): boolean {
  const text = exactEvidenceText(source, evidence).normalize('NFKC');
  const value = escapeRegExp(String(dc));
  return new RegExp(`(?:spell\\s*save|save|\\u8c41\\u514d)[^\\n\\d]{0,20}DC\\s*[:：]?\\s*${value}(?!\\d)`, 'iu').test(text);
}

function evidenceEntailsAttackBonus(source: string, evidence: EvidenceRef[] | undefined, bonus: number): boolean {
  const text = exactEvidenceText(source, evidence).normalize('NFKC');
  const signed = bonus >= 0 ? `\\+\\s*${escapeRegExp(String(bonus))}` : `-\\s*${escapeRegExp(String(Math.abs(bonus)))}`;
  return new RegExp(`(?:spell\\s*attack(?:\\s+(?:roll|modifier|bonus))?\\s*(?:is|:)?|\\u6cd5\\u672f\\u653b\\u51fb)[^\\n]{0,20}${signed}(?!\\d)`, 'iu').test(text)
    || new RegExp(`${signed}(?!\\d)[^\\n]{0,40}(?:to\\s+hit\\s+with\\s+)?spell\\s*attacks?`, 'iu').test(text);
}

function evidenceEntailsMaterialWaiver(source: string, evidence: EvidenceRef[]): boolean {
  return textEntailsMaterialWaiver(exactEvidenceText(source, evidence));
}

function textEntailsMaterialWaiver(value: unknown): boolean {
  const text = String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-US');
  return /(?:without|requires?\s+no|requiring\s+no)\s+material\s+components?/iu.test(text)
    || /(?:\u65e0\u9700|\u4e0d\u9700|\u4e0d\u9700\u8981)\s*(?:\u4efb\u4f55|\u4efb\u610f|\u5168\u90e8|\u6240\u6709)?\s*(?:(?:\u6750\u6599|\u6cd5\u672f)\u6210\u5206|\u6784\u6750)/u.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateSpellcastingNotDuplicated(
  ir: MonsterIntakeIR,
  group: CanonicalSpellcastingGroup,
  path: string,
  finding: (code: string, path: string, message: string, origin: IntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  const names = [group.featureName, group.featureEnglishName].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const traits = Array.isArray(ir.creature.traits) ? ir.creature.traits : [];
  const duplicateIndex = traits.findIndex((trait) => {
    if (!isRecord(trait)) return false;
    const sameName = [trait.name, trait.englishName]
      .some((name) => typeof name === 'string' && names.some((groupName) => normalizeFeatureName(name) === normalizeFeatureName(groupName)));
    const sameDescription = typeof trait.description === 'string'
      && typeof group.description === 'string'
      && normalizeDescription(trait.description) === normalizeDescription(group.description);
    return sameName || sameDescription;
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
    : usage === '1/day-each'
      ? '(?:每(?:项|个)\\s*1\\s*\\/\\s*日|1\\s*次\\s*\\/\\s*每日|1\\s*\\/\\s*day\\s*each)'
      : usage === 'prepared-cantrip'
        ? '(?:戏法(?:\\s*[（(]\\s*随意\\s*[）)])?|cantrips?(?:\\s*[（(]\\s*at[\\s-]*will\\s*[）)])?)'
        : '(?:(?:[1-9](?:st|nd|rd|th)?\\s*(?:[-–—]\\s*)?level|[1-9]\\s*环)\\s*[（(]?\\s*\\d+\\s*(?:法位|spell\\s+slots?|slots?)\\s*[）)]?)';
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

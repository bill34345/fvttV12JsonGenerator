import { createHash } from 'node:crypto';
import { resolveLockedDnd5eV14Spell, resolveLockedDnd5eV14SpellActivation } from '@fvtt-json-generator/generation/v14-spell-catalog';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type {
  ItemDiscoveryCandidate,
  ItemIntakeAbility,
  ItemIntakeFinding,
  ItemIntakeIR,
  ItemIntakeValidationResult,
} from './item-types';

export function validateItemIntakeIR(
  source: string,
  value: unknown,
  candidate: ItemDiscoveryCandidate,
): ItemIntakeValidationResult {
  const findings: ItemIntakeFinding[] = [];
  const add = (
    code: string,
    path: string,
    message: string,
    origin: ItemIntakeFinding['origin'],
    evidence?: EvidenceRef[],
  ) => findings.push({
    id: `${code}:${path}`,
    code,
    path,
    message,
    blocking: true,
    origin,
    ...(evidence ? { evidence } : {}),
  });
  if (!isRecord(value)) {
    add('INVALID_IR', '/', 'Item Intake response must be a JSON object.', 'schema');
    return summarize(findings);
  }
  const ir = value as ItemIntakeIR;
  if (ir.schemaVersion !== 1) add('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', 'schemaVersion must be 1.', 'schema');
  const expectedHash = createHash('sha256').update(source).digest('hex');
  if (ir.source?.sha256 !== expectedHash) add('SOURCE_HASH_MISMATCH', '/source/sha256', 'IR source hash does not match the submitted source.', 'evidence');
  if (ir.source?.length !== source.length) add('SOURCE_LENGTH_MISMATCH', '/source/length', 'IR source length must use UTF-16 code units.', 'evidence');
  if (!isCandidate(source, candidate)) add('INVALID_DISCOVERY_BOUNDARY', '/candidate', 'Discovery candidate does not identify one exact source slice.', 'evidence', [candidate]);

  if (!isRecord(ir.item)) {
    add('MISSING_ITEM', '/item', 'item must be an object.', 'schema');
    return summarize(findings);
  }
  if (typeof ir.item.name !== 'string' || !ir.item.name.trim()) add('MISSING_ITEM_NAME', '/item/name', 'Item name is required.', 'schema');
  if (typeof ir.item.type !== 'string' || !ir.item.type.trim()) add('MISSING_ITEM_TYPE', '/item/type', 'Item type is required.', 'schema');
  if (!Array.isArray(ir.item.abilities)) add('INVALID_ABILITIES', '/item/abilities', 'abilities must be an array.', 'schema');

  const abilityIds = new Set<string>();
  const expectedClaimPaths = ['/item/name', '/item/type'];
  if (ir.item.uses) {
    expectedClaimPaths.push('/item/uses/max');
    if (!Number.isInteger(ir.item.uses.max) || ir.item.uses.max < 1) {
      add('INVALID_USES_MAX', '/item/uses/max', 'Item use maximum must be a positive integer.', 'schema');
    }
    if (!Array.isArray(ir.item.uses.recovery) || !ir.item.uses.recovery.every((entry) => entry?.period === 'dawn' && entry?.type === 'recoverAll')) {
      add('INVALID_USES_RECOVERY', '/item/uses/recovery', 'This V14 Item contract currently supports explicit dawn recoverAll only.', 'schema');
    }
  }
  for (const [index, ability] of (Array.isArray(ir.item.abilities) ? ir.item.abilities : []).entries()) {
    const path = `/item/abilities/${index}`;
    validateAbility(source, candidate, ability, path, add);
    if (typeof ability?.id !== 'string' || !ability.id.trim()) {
      add('MISSING_ABILITY_ID', `${path}/id`, 'Ability id is required.', 'schema');
    } else if (abilityIds.has(ability.id)) {
      add('DUPLICATE_ABILITY_ID', `${path}/id`, `Duplicate ability id: ${ability.id}`, 'semantic');
    } else {
      abilityIds.add(ability.id);
      expectedClaimPaths.push(`/item/abilities/${ability.id}`);
    }
  }

  const claims = Array.isArray(ir.claims) ? ir.claims : [];
  if (!Array.isArray(ir.claims)) add('INVALID_CLAIMS', '/claims', 'claims must be an array.', 'schema');
  for (const [index, claim] of claims.entries()) {
    if (!isRecord(claim) || typeof claim.path !== 'string' || !Array.isArray(claim.evidence) || !claim.evidence.length) {
      add('INVALID_CLAIM', `/claims/${index}`, 'Every claim requires a path and at least one exact source evidence range.', 'schema');
      continue;
    }
    validateEvidence(source, candidate, claim.evidence as EvidenceRef[], `/claims/${index}/evidence`, add);
  }
  for (const expectedPath of expectedClaimPaths) {
    if (!claims.some((claim: any) => claim?.path === expectedPath && Array.isArray(claim.evidence) && claim.evidence.length)) {
      add('MISSING_MECHANICAL_CLAIM', expectedPath, 'Every mechanical Item field must have an explicit source-backed claim.', 'evidence');
    }
  }

  const coverage = Array.isArray(ir.coverage) ? ir.coverage : [];
  if (!Array.isArray(ir.coverage)) add('INVALID_COVERAGE', '/coverage', 'coverage must be an array.', 'schema');
  for (const [index, entry] of coverage.entries()) {
    if (!isRecord(entry) || !['mechanical', 'narrative', 'ignored-with-reason'].includes(String(entry.classification))) {
      add('INVALID_COVERAGE_ENTRY', `/coverage/${index}`, 'Coverage entry requires a valid classification.', 'schema');
      continue;
    }
    validateEvidence(source, candidate, [entry as unknown as EvidenceRef], `/coverage/${index}`, add);
  }
  validateCoveragePartition(coverage as EvidenceRef[], candidate, add);

  if (!Array.isArray(ir.uncertainties)) add('INVALID_UNCERTAINTIES', '/uncertainties', 'uncertainties must be an array.', 'schema');
  for (const uncertainty of ir.uncertainties ?? []) {
    if (uncertainty?.blocking) {
      findings.push({
        id: String(uncertainty.id || `AI_UNCERTAINTY:${uncertainty.path ?? '/'}`),
        code: String(uncertainty.code || 'AI_UNCERTAINTY'),
        path: String(uncertainty.path || '/'),
        message: String(uncertainty.message || 'AI reported an unresolved Item ambiguity.'),
        blocking: true,
        origin: 'semantic',
        evidence: Array.isArray(uncertainty.evidence) ? uncertainty.evidence : [],
      });
    }
  }
  return summarize(dedupe(findings));
}

function validateAbility(
  source: string,
  candidate: ItemDiscoveryCandidate,
  ability: ItemIntakeAbility,
  path: string,
  add: (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  if (!isRecord(ability)) {
    add('INVALID_ABILITY', path, 'Ability must be an object.', 'schema');
    return;
  }
  const evidence = Array.isArray(ability.evidence) ? ability.evidence as EvidenceRef[] : [];
  if (!evidence.length) add('MISSING_ABILITY_EVIDENCE', `${path}/evidence`, 'Every Item mechanic requires an exact source evidence range.', 'evidence');
  else validateEvidence(source, candidate, evidence, `${path}/evidence`, add);
  if (ability.kind === 'passive-ac') {
    if (!Number.isInteger(ability.value) || ability.value === 0) add('INVALID_AC_BONUS', `${path}/value`, 'passive-ac value must be a non-zero integer explicitly stated by the source.', 'schema');
    const text = evidence.map((entry) => entry.quote).join('\n');
    if (!new RegExp(`AC\\s*\\+\\s*${String(ability.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text)) {
      add('AC_BONUS_NOT_EXPLICIT', `${path}/value`, 'passive-ac requires explicit source wording AC +N; an AC total is not an Item bonus.', 'semantic', evidence);
    }
    return;
  }
  if (ability.kind === 'light') {
    if (ability.activation !== 'action' && ability.activation !== 'bonus' && ability.activation !== 'reaction' && ability.activation !== 'free') add('INVALID_LIGHT_ACTIVATION', `${path}/activation`, 'Light activation is invalid.', 'schema');
    if (ability.consumption !== 0) add('LIGHT_MUST_NOT_CONSUME_USES', `${path}/consumption`, 'A light mechanic with consumption is ambiguous and must be reviewed.', 'semantic');
    if (!Number.isFinite(ability.bright) || !Number.isFinite(ability.dim) || ability.bright < 0 || ability.dim < ability.bright) add('INVALID_LIGHT_RADIUS', path, 'Light requires non-negative bright and outer dim radii with dim >= bright.', 'schema');
    if (ability.extinguish !== 'disable-effect') add('INVALID_LIGHT_EXTINGUISH', `${path}/extinguish`, 'The V14 core contract uses disable-effect to extinguish Item light.', 'schema');
    const text = evidence.map((entry) => entry.quote).join('\n');
    if (!/(?:以|用|使用|as)\s*(?:一个|an?)?\s*(?:动作|action)/iu.test(text)) {
      add('LIGHT_ACTIVATION_NOT_EXPLICIT', `${path}/activation`, 'Token light requires an explicit activation action; decorative shine is not token light.', 'semantic', evidence);
    }
    const chineseRadii = text.match(/(\d+)\s*尺[^。\n]{0,32}明亮光照[^。\n]{0,48}在此之外\s*(\d+)\s*尺[^。\n]{0,32}微光/iu);
    if (chineseRadii) {
      const bright = Number(chineseRadii[1]);
      const additionalDim = Number(chineseRadii[2]);
      if (ability.bright !== bright || ability.dim !== bright + additionalDim) {
        add('LIGHT_RADIUS_EVIDENCE_MISMATCH', path, 'Light radii do not match the source bright radius plus additional dim distance.', 'semantic', evidence);
      }
    } else if (!/(?:bright light|明亮光照)/iu.test(text) || !/(?:dim light|微光)/iu.test(text)) {
      add('LIGHT_NOT_EXPLICIT', path, 'Light requires explicit bright and dim light source wording.', 'semantic', evidence);
    }
    return;
  }
  if (ability.kind === 'spell') {
    if (!Number.isInteger(ability.consumption) || ability.consumption < 0) add('INVALID_SPELL_CONSUMPTION', `${path}/consumption`, 'Spell use consumption must be a non-negative integer.', 'schema');
    if (typeof ability.spell?.identifier !== 'string' || typeof ability.spell?.name !== 'string') {
      add('INVALID_SPELL_REFERENCE', `${path}/spell`, 'Spell requires identifier and canonical English name.', 'schema');
      return;
    }
    const text = evidence.map((entry) => entry.quote).join('\n').toLowerCase();
    if (!text.includes(ability.spell.identifier.toLowerCase()) && !text.includes(ability.spell.name.toLowerCase())) {
      add('SPELL_NOT_EXPLICIT', `${path}/spell`, 'Spell evidence must contain the selected spell identifier or canonical name.', 'semantic', evidence);
    }
    const resolvedSpell = resolveLockedDnd5eV14Spell(ability.spell.identifier, ability.spell.name);
    if (!resolvedSpell) {
      add('UNRESOLVED_SPELL', `${path}/spell`, `No unique locked dnd5e 5.3.3 spell resolves "${ability.spell.identifier}".`, 'semantic', evidence);
    } else {
      const canonicalActivation = resolveLockedDnd5eV14SpellActivation(ability.spell.identifier, ability.spell.name);
      if (canonicalActivation && ability.activation !== canonicalActivation) {
        add('SPELL_ACTIVATION_MISMATCH', `${path}/activation`, `Spell activation ${ability.activation} does not match the locked dnd5e 5.3.3 spell activation ${canonicalActivation}.`, 'semantic', evidence);
      }
    }
    return;
  }
  add('UNSUPPORTED_ABILITY_KIND', `${path}/kind`, `Unsupported Item ability kind: ${String((ability as any).kind)}.`, 'schema');
}

function validateEvidence(
  source: string,
  candidate: ItemDiscoveryCandidate,
  refs: EvidenceRef[],
  path: string,
  add: (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  for (const [index, ref] of refs.entries()) {
    if (!ref || !Number.isInteger(ref.start) || !Number.isInteger(ref.end) || typeof ref.quote !== 'string'
      || ref.start < candidate.start || ref.end > candidate.end || ref.end <= ref.start
      || source.slice(ref.start, ref.end) !== ref.quote) {
      add('INVALID_EVIDENCE', `${path}/${index}`, 'Evidence must be an exact non-empty source slice within this item boundary.', 'evidence', [ref]);
    }
  }
}

function validateCoveragePartition(
  coverage: EvidenceRef[],
  candidate: ItemDiscoveryCandidate,
  add: (code: string, path: string, message: string, origin: ItemIntakeFinding['origin']) => void,
): void {
  const sorted = coverage.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = candidate.start;
  for (const [index, entry] of sorted.entries()) {
    if (entry.start !== cursor) {
      add('COVERAGE_GAP_OR_OVERLAP', `/coverage/${index}`, 'Coverage must partition the full item candidate range without gaps or overlaps.', 'coverage');
      return;
    }
    cursor = entry.end;
  }
  if (cursor !== candidate.end) add('COVERAGE_INCOMPLETE', '/coverage', 'Coverage must reach the end of the item candidate range.', 'coverage');
}

function isCandidate(source: string, candidate: ItemDiscoveryCandidate): boolean {
  return Number.isInteger(candidate.start) && Number.isInteger(candidate.end)
    && candidate.start >= 0 && candidate.end > candidate.start && candidate.end <= source.length
    && source.slice(candidate.start, candidate.end) === candidate.quote;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarize(findings: ItemIntakeFinding[]): ItemIntakeValidationResult {
  return { findings, blocking: findings.filter((finding) => finding.blocking), warnings: findings.filter((finding) => !finding.blocking) };
}

function dedupe(findings: ItemIntakeFinding[]): ItemIntakeFinding[] {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

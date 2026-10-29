import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type {
  ManifestValidationResult,
  PortableSpellManifest,
  PortableSpellSchool,
  SpellResolutionFinding,
} from './types';
import { listUnknownManifestProperties } from './schema';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { findForbiddenTargetWorldIdentifiers } from './forbiddenTargetIdentifier';

const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const METHODS = new Set(['innate', 'prepared', 'pact', 'at-will']);
const RECOVERIES = new Set(['day', 'shortRest', 'longRest']);
const SCHOOLS = new Set<PortableSpellSchool>(['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation']);
const RESTRICTION_KINDS = new Set(['target', 'summoning', 'casting', 'other']);

type RecordValue = Record<string, unknown>;

export function validatePortableSpellManifest(manifest: unknown, source: string): ManifestValidationResult {
  return validateManifest(manifest, source);
}

/**
 * Validates the portable schema without claiming access to the original source.
 *
 * Evidence offsets in a rendered Markdown file still refer to the pre-render Intake
 * source. This boundary therefore validates exact keys, types, ranges, and the
 * UTF-16 quote span length, while `validatePortableSpellManifest` remains the
 * stronger source-backed check that verifies the source hash and quote contents.
 */
export function validatePortableSpellManifestStructure(manifest: unknown): ManifestValidationResult {
  return validateManifest(manifest);
}

/** Actor candidates retain declared spells when their source ledger is incomplete.
 * Source-backed Intake and the other portable consumers keep the strict contract. */
export function validateActorSpellManifestStructure(manifest: unknown): ManifestValidationResult {
  return validateManifest(manifest, undefined, true);
}

function validateManifest(manifest: unknown, source?: string, actorCandidate = false): ManifestValidationResult {
  const findings: SpellResolutionFinding[] = [];
  const usedIds = new Map<string, string>();
  const logicalSpells = new Map<string, string>();
  const addFinding = (
    code: string,
    path: string,
    message: string,
    evidence: EvidenceRef[] = [],
    candidates?: unknown[],
  ): void => {
    findings.push({ code, path, message, blocking: true, evidence, ...(candidates === undefined ? {} : { candidates }) });
  };

  if (!isRecord(manifest)) {
    addFinding('INVALID_MANIFEST', '/', '法术清单必须是对象。');
    return { ok: false, findings };
  }

  for (const unknown of listUnknownManifestProperties(manifest)) {
    addFinding('UNKNOWN_PROPERTY', unknown.path, `法术清单不允许未知字段 ${unknown.key}。`);
  }
  for (const forbidden of findForbiddenTargetWorldIdentifiers(manifest)) {
    addFinding(
      forbidden.code,
      forbidden.path,
      `便携法术清单不得包含目标世界文档标识符 ${forbidden.match}。`,
    );
  }

  if (manifest.schemaVersion !== 1) {
    addFinding('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', '不支持的法术清单 schemaVersion；当前只接受数字 1。');
  }

  if (!isNonEmptyString(manifest.manifestId)) {
    addFinding('INVALID_MANIFEST_ID', '/manifestId', 'manifestId 必须是非空字符串。');
  } else {
    usedIds.set(manifest.manifestId, '/manifestId');
  }

  if (typeof manifest.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sourceSha256)) {
    addFinding('INVALID_SOURCE_SHA256', '/sourceSha256', 'sourceSha256 必须是 64 位小写十六进制 SHA-256。');
  } else if (source !== undefined) {
    const expected = sha256(source);
    if (manifest.sourceSha256 !== expected) {
      addFinding('SOURCE_HASH_MISMATCH', '/sourceSha256', 'sourceSha256 与提交的源文本不一致。');
    }
  }

  if (manifest.rulesPreference !== '2024') {
    addFinding('UNSUPPORTED_RULES_PREFERENCE', '/rulesPreference', 'rulesPreference 必须严格为 2024。');
  }

  if (!Array.isArray(manifest.spellcastingGroups) || manifest.spellcastingGroups.length === 0) {
    addFinding('INVALID_SPELLCASTING_GROUPS', '/spellcastingGroups', 'spellcastingGroups 必须是非空数组。');
  } else {
    manifest.spellcastingGroups.forEach((group, groupIndex) => {
      validateGroup(group, groupIndex, source, usedIds, logicalSpells, addFinding,actorCandidate);
    });
  }

  validateExplicitSpellReuse(manifest, addFinding,actorCandidate);

  if (findings.length > 0) return { ok: false, findings };
  return { ok: true, value: manifest as unknown as PortableSpellManifest };
}

function validateGroup(
  groupValue: unknown,
  groupIndex: number,
  source: string | undefined,
  usedIds: Map<string, string>,
  logicalSpells: Map<string, string>,
  addFinding: FindingWriter,
  actorCandidate:boolean,
): void {
  const path = `/spellcastingGroups/${groupIndex}`;
  if (!isRecord(groupValue)) {
    addFinding('INVALID_SPELLCASTING_GROUP', path, '施法组必须是对象。');
    return;
  }
  const group = groupValue;

  validateUniqueId(group.groupId, `${path}/groupId`, 'groupId', usedIds, addFinding);
  if (!isNonEmptyString(group.featureItemKey)) {
    addFinding('INVALID_FEATURE_ITEM_KEY', `${path}/featureItemKey`, 'featureItemKey 必须是非空字符串。');
  }
  if (group.ability !== undefined && (typeof group.ability !== 'string' || !ABILITIES.has(group.ability))) {
    addFinding('INVALID_ABILITY', `${path}/ability`, '施法关键属性必须是 str、dex、con、int、wis 或 cha。');
  }
  if (group.saveDc !== undefined && !isFiniteNumber(group.saveDc)) {
    addFinding('INVALID_SAVE_DC', `${path}/saveDc`, '豁免 DC 必须是有限数字。');
  }
  if (group.attackBonus !== undefined && !isFiniteNumber(group.attackBonus)) {
    addFinding('INVALID_ATTACK_BONUS', `${path}/attackBonus`, '法术攻击加值必须是有限数字。');
  }
  if(group.recharge!==undefined&&(!Array.isArray(group.recharge)||group.recharge.length!==2||group.recharge.some(value=>!Number.isInteger(value)||value<1||value>6)||group.recharge[1]!==6||group.recharge[0]>group.recharge[1]))
    addFinding('INVALID_FEATURE_RECHARGE',`${path}/recharge`,'Parent Recharge must be an ordered pair of d6 thresholds.');
  if (!Array.isArray(group.spellRefs) || group.spellRefs.length === 0) {
    addFinding('INVALID_SPELL_REFS', `${path}/spellRefs`, 'spellRefs 必须是非空数组。');
    return;
  }

  group.spellRefs.forEach((ref, refIndex) => {
    validateRef(ref, `${path}/spellRefs/${refIndex}`, source, usedIds, logicalSpells, addFinding,actorCandidate);
  });
  if(group.recharge!==undefined&&group.spellRefs.some(ref=>isRecord(ref)&&(ref.uses!==undefined||ref.method!=='at-will')))
    addFinding('CONFLICTING_FEATURE_RECHARGE',`${path}/recharge`,'A parent Recharge Cast cannot also consume spell slots or an independent spell-use pool.');
  validateSharedUses(group.spellRefs, path, addFinding);
}

function validateRef(
  refValue: unknown,
  path: string,
  source: string | undefined,
  usedIds: Map<string, string>,
  logicalSpells: Map<string, string>,
  addFinding: FindingWriter,
  actorCandidate:boolean,
): void {
  if (!isRecord(refValue)) {
    addFinding('INVALID_SPELL_REF', path, '法术引用必须是对象。');
    return;
  }
  const ref = refValue;

  validateUniqueId(ref.refId, `${path}/refId`, 'refId', usedIds, addFinding);
  if (!isNonEmptyString(ref.identifier)) {
    addFinding('MISSING_IDENTIFIER', `${path}/identifier`, '法术引用必须提供非空 identifier。');
  }

  const names = [ref.originalName, ref.englishName, ref.chineseName];
  if (typeof ref.originalName !== 'string' || !names.some(isNonEmptyString)) {
    addFinding('MISSING_SPELL_NAME', `${path}/originalName`, '法术引用必须至少提供一个非空名称。');
  }
  if (ref.englishName !== undefined && typeof ref.englishName !== 'string') {
    addFinding('INVALID_SPELL_NAME', `${path}/englishName`, 'englishName 必须是字符串。');
  }
  if (ref.chineseName !== undefined && typeof ref.chineseName !== 'string') {
    addFinding('INVALID_SPELL_NAME', `${path}/chineseName`, 'chineseName 必须是字符串。');
  }

  if (!Array.isArray(ref.aliases) || ref.aliases.some((alias) => !isNonEmptyString(alias))) {
    addFinding('INVALID_ALIASES', `${path}/aliases`, 'aliases 必须是非空字符串数组。');
  }
  if (ref.expectedLevel !== undefined && (!Number.isInteger(ref.expectedLevel) || (ref.expectedLevel as number) < 0 || (ref.expectedLevel as number) > 9)) {
    addFinding('INVALID_EXPECTED_LEVEL', `${path}/expectedLevel`, '预期法术环阶必须是 0 到 9 的整数。');
  }
  if (ref.expectedSchool !== undefined && (typeof ref.expectedSchool !== 'string' || !SCHOOLS.has(ref.expectedSchool as PortableSpellSchool))) {
    addFinding('INVALID_EXPECTED_SCHOOL', `${path}/expectedSchool`, '预期法术学派必须使用完整小写英文名：abjuration、conjuration、divination、enchantment、evocation、illusion、necromancy 或 transmutation。');
  }
  if (ref.sourceBookHint !== undefined && !isNonEmptyString(ref.sourceBookHint)) {
    addFinding('INVALID_SOURCE_BOOK_HINT', `${path}/sourceBookHint`, 'sourceBookHint 必须是非空字符串。');
  }
  if (typeof ref.method !== 'string' || !METHODS.has(ref.method)) {
    addFinding('INVALID_METHOD', `${path}/method`, '施法方式必须是 innate、prepared、pact 或 at-will。');
  }

  validateUses(ref.uses, `${path}/uses`, addFinding);
  if (ref.castingLevel !== undefined && (!Number.isInteger(ref.castingLevel) || (ref.castingLevel as number) < 0 || (ref.castingLevel as number) > 9)) {
    addFinding('INVALID_CASTING_LEVEL', `${path}/castingLevel`, '施法环阶必须是 0 到 9 的整数。');
  }
  if (ref.ignoresMaterialComponents !== undefined && typeof ref.ignoresMaterialComponents !== 'boolean') {
    addFinding('INVALID_MATERIAL_COMPONENT_FLAG', `${path}/ignoresMaterialComponents`, 'ignoresMaterialComponents 必须是布尔值。');
  }

  validateRestrictions(ref.restrictions, `${path}/restrictions`, source, addFinding,actorCandidate);
  validateEvidenceArray(ref.evidence, `${path}/evidence`, source, addFinding,actorCandidate);
  // A reuse is independently checked against exactly one existing definition.
  // All ordinary logical-definition duplicate checks remain unchanged.
  if(ref.reuseOf===undefined)validateLogicalSpell(ref, path, logicalSpells, addFinding);
}

/** Explicit relationships cannot hide duplicate definitions or introduce a
 * second quota/profile. Exact source-clause ownership remains the producer's
 * stronger check; this pure boundary also rejects dangling, cyclic or changed
 * identities, mechanics and copied evidence before any world hydration. */
function validateExplicitSpellReuse(manifest:RecordValue,addFinding:FindingWriter,actorCandidate:boolean):void{
  if(!Array.isArray(manifest.spellcastingGroups))return;
  const entries=manifest.spellcastingGroups.flatMap((g,gi)=>isRecord(g)&&Array.isArray(g.spellRefs)
    ?g.spellRefs.flatMap((r,ri)=>isRecord(r)?[{group:g,ref:r,path:`/spellcastingGroups/${gi}/spellRefs/${ri}`}]:[]):[]);
  const text=(value:unknown)=>typeof value==='string'?value.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase():value;
  const profile=(g:RecordValue)=>JSON.stringify([g.ability,g.saveDc,g.attackBonus,g.recharge]);
  const identity=(r:RecordValue)=>JSON.stringify([text(r.identifier),text(r.originalName),text(r.englishName),text(r.chineseName),
    Array.isArray(r.aliases)?r.aliases.map(text):r.aliases,r.expectedLevel,r.expectedSchool,r.sourceBookHint,r.method,r.uses,r.castingLevel,!!r.ignoresMaterialComponents,
    Array.isArray(r.restrictions)?r.restrictions.map(x=>isRecord(x)?[x.kind,text(x.text),x.value]:x):r.restrictions]);
  for(const entry of entries){
    const link=entry.ref.reuseOf;if(link===undefined)continue;
    const targets=isRecord(link)?entries.filter(x=>x.group.groupId===link.groupId&&x.ref.refId===link.refId):[];
    const target=targets[0];
    if(!isRecord(link)||!isNonEmptyString(link.groupId)||!isNonEmptyString(link.refId)||targets.length!==1||!target
      ||target.group.groupId===entry.group.groupId||target.ref.reuseOf!==undefined
      ||entry.ref.method!=='at-will'||target.ref.method!=='at-will'||entry.ref.uses!==undefined||target.ref.uses!==undefined
      ||entry.group.recharge!==undefined||target.group.recharge!==undefined
      ||profile(entry.group)!==profile(target.group)||identity(entry.ref)!==identity(target.ref)
      ||!actorCandidate&&JSON.stringify(entry.ref.evidence)===JSON.stringify(target.ref.evidence))
      addFinding('INVALID_SPELL_REUSE',entry.path+'/reuseOf','A source Cast reuse must identify one distinct existing at-will definition with identical identity/profile/restrictions, no extra pool, and its own source evidence.');
  }
}

function validateUses(value: unknown, path: string, addFinding: FindingWriter): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addFinding('INVALID_USES', path, 'uses 必须是对象。');
    return;
  }
  if (!Number.isInteger(value.value) || (value.value as number) <= 0) {
    addFinding('INVALID_USES_VALUE', `${path}/value`, '使用次数必须是正整数。');
  }
  if (typeof value.recovery !== 'string' || !RECOVERIES.has(value.recovery)) {
    addFinding('INVALID_RECOVERY', `${path}/recovery`, '恢复周期必须是 day、shortRest 或 longRest。');
  }
  if (typeof value.shared !== 'boolean') {
    addFinding('INVALID_SHARED_USE', `${path}/shared`, 'shared 必须是布尔值。');
  }
}

function validateSharedUses(refs: unknown[], groupPath: string, addFinding: FindingWriter): void {
  const shared = refs.flatMap((ref, refIndex) => {
    if (!isRecord(ref) || !isRecord(ref.uses) || ref.uses.shared !== true) return [];
    return [{ uses: ref.uses, path: `${groupPath}/spellRefs/${refIndex}/uses/shared` }];
  });
  if (shared.length === 1) {
    addFinding('INVALID_SHARED_USE', shared[0]!.path, '共享使用次数至少需要同组两个具有相同次数和恢复周期的法术。');
    return;
  }
  if (shared.length < 2) return;
  const expected = shared[0]!.uses;
  for (const entry of shared.slice(1)) {
    if (entry.uses.value !== expected.value || entry.uses.recovery !== expected.recovery) {
      addFinding('INVALID_SHARED_USE', entry.path, '同组共享使用次数的 value 和 recovery 必须一致。');
    }
  }
}

function validateRestrictions(value: unknown, path: string, source: string | undefined, addFinding: FindingWriter,actorCandidate:boolean): void {
  if (!Array.isArray(value)) {
    addFinding('INVALID_RESTRICTIONS', path, 'restrictions 必须是数组。');
    return;
  }
  value.forEach((restriction, index) => {
    const restrictionPath = `${path}/${index}`;
    if (!isRecord(restriction)) {
      addFinding('INVALID_RESTRICTION', restrictionPath, '保留限制必须是对象。');
      return;
    }
    if (typeof restriction.kind !== 'string' || !RESTRICTION_KINDS.has(restriction.kind)) {
      addFinding('INVALID_RESTRICTION_KIND', `${restrictionPath}/kind`, '限制 kind 必须是 target、summoning、casting 或 other。');
    }
    if (!isNonEmptyString(restriction.text)) {
      addFinding('INVALID_RESTRICTION_TEXT', `${restrictionPath}/text`, '限制 text 必须是非空字符串。');
    }
    if (typeof restriction.value === 'number' && !Number.isFinite(restriction.value)) {
      addFinding('INVALID_RESTRICTION_VALUE', `${restrictionPath}/value`, '限制 value 的数字必须是有限值。');
    } else if (restriction.value !== undefined && !['string', 'number', 'boolean'].includes(typeof restriction.value)) {
      addFinding('INVALID_RESTRICTION_VALUE', `${restrictionPath}/value`, '限制 value 必须是字符串、有限数字或布尔值。');
    }
    validateEvidenceArray(restriction.evidence, `${restrictionPath}/evidence`, source, addFinding,actorCandidate);
  });
}

function validateEvidenceArray(value: unknown, path: string, source: string | undefined, addFinding: FindingWriter,actorCandidate:boolean): void {
  if (!Array.isArray(value) || !actorCandidate&&value.length === 0) {
    addFinding('MISSING_EVIDENCE', path, '每个法术或限制都必须至少有一条证据。');
    return;
  }
  value.forEach((entry, index) => validateEvidence(entry, `${path}/${index}`, source, addFinding));
}

function validateEvidence(value: unknown, path: string, source: string | undefined, addFinding: FindingWriter): void {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.start)
    || !Number.isSafeInteger(value.end)
    || (value.start as number) < 0
    || (value.end as number) <= (value.start as number)
    || typeof value.quote !== 'string'
    || value.quote.length === 0) {
    addFinding('INVALID_EVIDENCE', path, '证据范围必须是源文本内有效的 UTF-16 整数区间。');
    return;
  }
  const evidence = value as unknown as EvidenceRef;
  if (evidence.quote.length !== evidence.end - evidence.start) {
    addFinding('INVALID_EVIDENCE_QUOTE_LENGTH', path, '证据 quote 的 UTF-16 长度必须与 end - start 一致。', [evidence]);
    return;
  }
  if (source === undefined) return;
  if (evidence.end > source.length) {
    addFinding('INVALID_EVIDENCE', path, '证据范围必须位于原始源文本的 UTF-16 范围内。', [evidence]);
    return;
  }
  if (source.slice(evidence.start, evidence.end) !== evidence.quote) {
    addFinding('EVIDENCE_MISMATCH', path, '证据摘录与源文本 UTF-16 范围不完全一致。', [evidence]);
  }
}

function validateUniqueId(
  value: unknown,
  path: string,
  label: string,
  usedIds: Map<string, string>,
  addFinding: FindingWriter,
): void {
  if (!isNonEmptyString(value)) {
    addFinding(`INVALID_${label.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`, path, `${label} 必须是非空字符串。`);
    return;
  }
  const firstPath = usedIds.get(value);
  if (firstPath) {
    const message = firstPath === '/manifestId'
      ? `标识 ${value} 与 manifestId 重复。`
      : `标识 ${value} 已在清单中使用。`;
    addFinding('DUPLICATE_ID', path, message);
    return;
  }
  usedIds.set(value, path);
}

function validateLogicalSpell(
  ref: RecordValue,
  path: string,
  logicalSpells: Map<string, string>,
  addFinding: FindingWriter,
): void {
  if (!isNonEmptyString(ref.identifier)) return;
  const logicalId = normalizeIdentifier(ref.identifier);
  const keys = new Set([`identifier:${logicalId}`]);
  for (const name of [ref.originalName, ref.englishName, ref.chineseName, ...(Array.isArray(ref.aliases) ? ref.aliases : [])]) {
    if (isNonEmptyString(name)) keys.add(`name:${normalizeName(name)}`);
  }
  for (const key of keys) {
    const firstPath = logicalSpells.get(key);
    if (firstPath && firstPath !== path) {
      addFinding('DUPLICATE_LOGICAL_SPELL', `${path}/identifier`, `逻辑法术 ${logicalId} 在清单中重复。`);
      return;
    }
  }
  for (const key of keys) logicalSpells.set(key, path);
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, ' ');
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type FindingWriter = (
  code: string,
  path: string,
  message: string,
  evidence?: EvidenceRef[],
  candidates?: unknown[],
) => void;

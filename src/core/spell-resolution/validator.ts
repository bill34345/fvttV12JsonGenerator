import { createHash } from 'node:crypto';
import type { EvidenceRef } from '../intake/types';
import type {
  ManifestValidationResult,
  PortableSpellManifest,
  SpellResolutionFinding,
} from './types';
import { listUnknownManifestProperties } from './schema';

const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const METHODS = new Set(['innate', 'prepared', 'pact', 'at-will']);
const RECOVERIES = new Set(['day', 'shortRest', 'longRest']);
const SCHOOLS = new Set(['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation']);
const RESTRICTION_KINDS = new Set(['target', 'summoning', 'casting', 'other']);

type RecordValue = Record<string, unknown>;

export function validatePortableSpellManifest(manifest: unknown, source: string): ManifestValidationResult {
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
  } else {
    const expected = createHash('sha256').update(source).digest('hex');
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
      validateGroup(group, groupIndex, source, usedIds, logicalSpells, addFinding);
    });
  }

  if (findings.length > 0) return { ok: false, findings };
  return { ok: true, value: manifest as unknown as PortableSpellManifest };
}

function validateGroup(
  groupValue: unknown,
  groupIndex: number,
  source: string,
  usedIds: Map<string, string>,
  logicalSpells: Map<string, string>,
  addFinding: FindingWriter,
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
  if (!Array.isArray(group.spellRefs) || group.spellRefs.length === 0) {
    addFinding('INVALID_SPELL_REFS', `${path}/spellRefs`, 'spellRefs 必须是非空数组。');
    return;
  }

  group.spellRefs.forEach((ref, refIndex) => {
    validateRef(ref, `${path}/spellRefs/${refIndex}`, source, usedIds, logicalSpells, addFinding);
  });
  validateSharedUses(group.spellRefs, path, addFinding);
}

function validateRef(
  refValue: unknown,
  path: string,
  source: string,
  usedIds: Map<string, string>,
  logicalSpells: Map<string, string>,
  addFinding: FindingWriter,
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
  if (ref.expectedSchool !== undefined && (typeof ref.expectedSchool !== 'string' || !SCHOOLS.has(ref.expectedSchool))) {
    addFinding('INVALID_EXPECTED_SCHOOL', `${path}/expectedSchool`, '预期法术学派必须使用受支持的小写标识。');
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

  validateRestrictions(ref.restrictions, `${path}/restrictions`, source, addFinding);
  validateEvidenceArray(ref.evidence, `${path}/evidence`, source, addFinding);
  validateLogicalSpell(ref, path, logicalSpells, addFinding);
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

function validateRestrictions(value: unknown, path: string, source: string, addFinding: FindingWriter): void {
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
    validateEvidenceArray(restriction.evidence, `${restrictionPath}/evidence`, source, addFinding);
  });
}

function validateEvidenceArray(value: unknown, path: string, source: string, addFinding: FindingWriter): void {
  if (!Array.isArray(value) || value.length === 0) {
    addFinding('MISSING_EVIDENCE', path, '每个法术或限制都必须至少有一条证据。');
    return;
  }
  value.forEach((entry, index) => validateEvidence(entry, `${path}/${index}`, source, addFinding));
}

function validateEvidence(value: unknown, path: string, source: string, addFinding: FindingWriter): void {
  if (!isRecord(value)
    || !Number.isInteger(value.start)
    || !Number.isInteger(value.end)
    || (value.start as number) < 0
    || (value.end as number) < (value.start as number)
    || (value.end as number) > source.length
    || typeof value.quote !== 'string') {
    addFinding('INVALID_EVIDENCE', path, '证据范围必须是源文本内有效的 UTF-16 整数区间。');
    return;
  }
  const evidence = value as unknown as EvidenceRef;
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

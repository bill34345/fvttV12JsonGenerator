const MANIFEST_KEYS = new Set(['schemaVersion', 'manifestId', 'sourceSha256', 'rulesPreference', 'spellcastingGroups']);
const GROUP_KEYS = new Set(['groupId', 'featureItemKey', 'ability', 'saveDc', 'attackBonus', 'spellRefs']);
const REF_KEYS = new Set([
  'refId',
  'identifier',
  'originalName',
  'englishName',
  'chineseName',
  'aliases',
  'expectedLevel',
  'expectedSchool',
  'sourceBookHint',
  'method',
  'uses',
  'castingLevel',
  'ignoresMaterialComponents',
  'restrictions',
  'evidence',
]);
const USES_KEYS = new Set(['value', 'recovery', 'shared']);
const RESTRICTION_KEYS = new Set(['kind', 'text', 'value', 'evidence']);
const EVIDENCE_KEYS = new Set(['start', 'end', 'quote']);

export interface UnknownManifestProperty {
  key: string;
  path: string;
}

export function listUnknownManifestProperties(value: unknown): UnknownManifestProperty[] {
  if (!isRecord(value)) return [];
  const result: UnknownManifestProperty[] = [];
  collectUnknownKeys(value, MANIFEST_KEYS, '', result);

  if (!Array.isArray(value.spellcastingGroups)) return result;
  value.spellcastingGroups.forEach((group, groupIndex) => {
    if (!isRecord(group)) return;
    const groupPath = `/spellcastingGroups/${groupIndex}`;
    collectUnknownKeys(group, GROUP_KEYS, groupPath, result);
    if (!Array.isArray(group.spellRefs)) return;
    group.spellRefs.forEach((ref, refIndex) => {
      if (!isRecord(ref)) return;
      const refPath = `${groupPath}/spellRefs/${refIndex}`;
      collectUnknownKeys(ref, REF_KEYS, refPath, result);
      if (isRecord(ref.uses)) collectUnknownKeys(ref.uses, USES_KEYS, `${refPath}/uses`, result);
      collectRestrictions(ref.restrictions, `${refPath}/restrictions`, result);
      collectEvidenceArray(ref.evidence, `${refPath}/evidence`, result);
    });
  });

  return result;
}

function collectRestrictions(value: unknown, path: string, result: UnknownManifestProperty[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((restriction, index) => {
    if (!isRecord(restriction)) return;
    const restrictionPath = `${path}/${index}`;
    collectUnknownKeys(restriction, RESTRICTION_KEYS, restrictionPath, result);
    collectEvidenceArray(restriction.evidence, `${restrictionPath}/evidence`, result);
  });
}

function collectEvidenceArray(value: unknown, path: string, result: UnknownManifestProperty[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((evidence, index) => {
    if (isRecord(evidence)) collectUnknownKeys(evidence, EVIDENCE_KEYS, `${path}/${index}`, result);
  });
}

function collectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  parentPath: string,
  result: UnknownManifestProperty[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) result.push({ key, path: `${parentPath}/${escapePointerSegment(key)}` });
  }
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

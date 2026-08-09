import { createHash } from 'node:crypto';

import { asArray, asRecord, normalizeName, sha256, stableId, stringValue } from './internals';
import type {
  BloodHunterEnrichedSource,
  BloodHunterFeatureGroup,
  BloodHunterSideData,
  BloodHunterSourceEntry,
  BloodHunterSourceIdentity,
  BloodHunterValidationFinding,
  BloodHunterValidationResult,
} from './types';

export const BLOOD_HUNTER_SOURCE = 'BloodHunter2024';
export const BLOOD_HUNTER_CLASS_NAME = '血猎手';
export const REQUIRED_SUBCLASSES = ['弑灵', '渎魂', '突变', '化狼'] as const;
export const EXPECTED_BLOOD_HUNTER_SOURCE_SHA256 = '3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65' as const;

/**
 * Reject source drift using the original UTF-8 byte stream. This deliberately
 * does not parse, normalize, or stringify JSON before hashing.
 */
export function assertBloodHunterSourceBytes(bytes: Uint8Array | string): void {
  const rawBytes = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const actual = createHash('sha256').update(rawBytes).digest('hex').toUpperCase();
  if (actual !== EXPECTED_BLOOD_HUNTER_SOURCE_SHA256) {
    throw new Error(`BloodHunter2024 source SHA-256 不匹配：expected ${EXPECTED_BLOOD_HUNTER_SOURCE_SHA256}, got ${actual}。`);
  }
}

export interface CollectedBloodHunterFeature {
  entry: BloodHunterSourceEntry;
  group: BloodHunterFeatureGroup;
  sourceIndex: number;
  sourceKey: string;
  sourceIdentity: BloodHunterSourceIdentity;
  textHash: string;
  sideData?: BloodHunterSideData;
}

export function validateBloodHunterEnrichedSource(source: unknown): BloodHunterValidationResult {
  const findings: BloodHunterValidationFinding[] = [];
  const add = (code: string, path: string, message: string): void => { findings.push({ code, path, message }); };
  if (!asRecord(source) || Array.isArray(source)) {
    add('INVALID_SOURCE', '/', 'Blood Hunter enriched source 必须是对象。');
    return { ok: false, findings };
  }
  const candidate = source as BloodHunterEnrichedSource;
  const metaSources = asArray<JsonRecord>(asRecord(candidate._meta).sources);
  if (!metaSources.some((entry) => entry.json === BLOOD_HUNTER_SOURCE)) {
    add('SOURCE_IDENTITY_MISMATCH', '/_meta/sources', `必须声明 ${BLOOD_HUNTER_SOURCE} source identity。`);
  }
  const expectedCounts: Record<string, number> = {
    class: 1,
    subclass: 4,
    classFeature: 22,
    subclassFeature: 30,
    optionalfeature: 42,
  };
  for (const [group, expected] of Object.entries(expectedCounts)) {
    const entries = asArray(candidate[group as keyof BloodHunterEnrichedSource]);
    if (entries.length !== expected) add('SOURCE_COUNT_DRIFT', `/${group}`, `${group} 必须恰为 ${expected} 项，当前为 ${entries.length}。`);
  }
  const classes = asArray<BloodHunterSourceEntry>(candidate.class);
  const primaryClass = classes[0];
  if (!primaryClass || primaryClass.name !== BLOOD_HUNTER_CLASS_NAME || primaryClass.source !== BLOOD_HUNTER_SOURCE) {
    add('CLASS_IDENTITY_MISMATCH', '/class/0', `唯一 class 必须是 ${BLOOD_HUNTER_CLASS_NAME} / ${BLOOD_HUNTER_SOURCE}。`);
  }
  const subclasses = asArray<BloodHunterSourceEntry>(candidate.subclass);
  const seenSubclasses = new Set(subclasses.map((entry) => entry.shortName));
  for (const subclass of REQUIRED_SUBCLASSES) {
    if (!seenSubclasses.has(subclass)) add('SUBCLASS_DRIFT', '/subclass', `缺少必需子职 ${subclass}。`);
  }
  if (seenSubclasses.size !== REQUIRED_SUBCLASSES.length || subclasses.some((entry) =>
    entry.source !== BLOOD_HUNTER_SOURCE || entry.className !== BLOOD_HUNTER_CLASS_NAME || entry.classSource !== BLOOD_HUNTER_SOURCE,
  )) add('SUBCLASS_IDENTITY_MISMATCH', '/subclass', '子职必须严格属于 BloodHunter2024 的血猎手。');

  for (const group of ['classFeature', 'subclassFeature', 'optionalfeature'] as const) {
    for (const [index, feature] of asArray<BloodHunterSourceEntry>(candidate[group]).entries()) {
      const path = `/${group}/${index}`;
      if (!feature || feature.source !== BLOOD_HUNTER_SOURCE || !stringValue(feature.name)) {
        add('FEATURE_IDENTITY_MISMATCH', path, 'feature 必须有名称并严格属于 BloodHunter2024。');
        continue;
      }
      if (group !== 'optionalfeature'
        && (feature.className !== BLOOD_HUNTER_CLASS_NAME || feature.classSource !== BLOOD_HUNTER_SOURCE || !Number.isInteger(feature.level))) {
        add('FEATURE_PARENT_MISMATCH', path, 'class/subclass feature 必须有严格 class identity 和整数等级。');
      }
      if (group === 'subclassFeature'
        && (!REQUIRED_SUBCLASSES.includes(feature.subclassShortName as typeof REQUIRED_SUBCLASSES[number])
          || feature.subclassSource !== BLOOD_HUNTER_SOURCE)) {
        add('FEATURE_SUBCLASS_MISMATCH', path, 'subclass feature 必须属于四个锁定子职之一。');
      }
    }
  }
  validateSideData(candidate, findings);
  return { ok: findings.length === 0, findings };
}

export function collectBloodHunterFeatures(source: BloodHunterEnrichedSource): CollectedBloodHunterFeature[] {
  const result = validateBloodHunterEnrichedSource(source);
  if (!result.ok) throw new Error(formatSourceFindings(result.findings));
  const raw: Omit<CollectedBloodHunterFeature, 'sourceKey'>[] = [];
  for (const group of ['classFeature', 'subclassFeature', 'optionalfeature'] as const) {
    for (const [sourceIndex, entry] of source[group].entries()) {
      const sourceIdentity = identityForFeature(group, entry);
      raw.push({
        entry,
        group,
        sourceIndex,
        sourceIdentity,
        textHash: sha256({ name: entry.name, englishName: entry.ENG_name, entries: entry.entries ?? [] }),
        sideData: findSideData(source, group, entry),
      });
    }
  }
  const grouped = new Map<string, typeof raw>();
  for (const item of raw) {
    const key = sourceKeyBase(item.sourceIdentity);
    const items = grouped.get(key) ?? [];
    items.push(item);
    grouped.set(key, items);
  }
  const collected: CollectedBloodHunterFeature[] = [];
  for (const [base, items] of grouped) {
    if (items.length === 1) {
      const item = items[0]!;
      collected.push({ ...item, sourceKey: base });
      continue;
    }
    const hashes = new Set(items.map((item) => item.textHash));
    if (hashes.size !== items.length) {
      throw new Error(`无法消歧重复 feature source identity: ${base}`);
    }
    for (const item of items) collected.push({ ...item, sourceKey: `${base}#${item.textHash.slice(0, 12)}` });
  }
  return collected.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, 'en'));
}

export function sourceKeyForDocument(group: 'class' | 'subclass', entry: BloodHunterSourceEntry): string {
  const identity: BloodHunterSourceIdentity = {
    source: BLOOD_HUNTER_SOURCE,
    group,
    className: group === 'subclass' ? BLOOD_HUNTER_CLASS_NAME : undefined,
    subclassShortName: group === 'subclass' ? stringValue(entry.shortName) : undefined,
    normalizedName: normalizeName(entry.ENG_name ?? entry.name),
  };
  return sourceKeyBase(identity);
}

export function identityForFeature(group: BloodHunterFeatureGroup, entry: BloodHunterSourceEntry): BloodHunterSourceIdentity {
  return {
    source: BLOOD_HUNTER_SOURCE,
    group,
    className: group === 'optionalfeature' ? undefined : BLOOD_HUNTER_CLASS_NAME,
    subclassShortName: group === 'subclassFeature' ? entry.subclassShortName : undefined,
    level: group === 'optionalfeature' ? undefined : entry.level,
    normalizedName: normalizeName(entry.ENG_name ?? entry.name),
  };
}

export function sourceKeyBase(identity: BloodHunterSourceIdentity): string {
  return [
    identity.source,
    identity.group,
    identity.className ?? '-',
    identity.subclassShortName ?? '-',
    identity.level === undefined ? '-' : String(identity.level),
    identity.normalizedName,
  ].join('|');
}

export function itemIdForSourceKey(prefix: string, sourceKey: string): string {
  return stableId(prefix, BLOOD_HUNTER_SOURCE, sourceKey);
}

function validateSideData(source: BloodHunterEnrichedSource, findings: BloodHunterValidationFinding[]): void {
  const sideGroups: Array<[BloodHunterFeatureGroup, keyof BloodHunterEnrichedSource]> = [
    ['classFeature', 'foundryClassFeature'],
    ['subclassFeature', 'foundrySubclassFeature'],
    ['optionalfeature', 'foundryOptionalfeature'],
  ];
  for (const [group, sideGroup] of sideGroups) {
    const sideEntries = asArray<BloodHunterSideData>(source[sideGroup]);
    for (const [index, side] of sideEntries.entries()) {
      if (side.source !== undefined && side.source !== BLOOD_HUNTER_SOURCE) {
        findings.push({ code: 'SIDE_DATA_IDENTITY_MISMATCH', path: `/${String(sideGroup)}/${index}`, message: 'side data source 不能漂移。' });
        continue;
      }
      const matches = asArray<BloodHunterSourceEntry>(source[group]).filter((feature) => sideMatchesFeature(side, feature, group));
      if (matches.length !== 1) findings.push({
        code: matches.length === 0 ? 'ORPHAN_SIDE_DATA' : 'AMBIGUOUS_SIDE_DATA',
        path: `/${String(sideGroup)}/${index}`,
        message: `side data 必须严格匹配一条 ${group}。`,
      });
    }
  }
}

function findSideData(source: BloodHunterEnrichedSource, group: BloodHunterFeatureGroup, feature: BloodHunterSourceEntry): BloodHunterSideData | undefined {
  const sideGroup: keyof BloodHunterEnrichedSource = group === 'classFeature'
    ? 'foundryClassFeature'
    : group === 'subclassFeature'
      ? 'foundrySubclassFeature'
      : 'foundryOptionalfeature';
  const matches = asArray<BloodHunterSideData>(source[sideGroup]).filter((side) => sideMatchesFeature(side, feature, group));
  if (matches.length > 1) throw new Error(`side data 匹配不唯一: ${feature.name}`);
  return matches[0];
}

function sideMatchesFeature(side: BloodHunterSideData, feature: BloodHunterSourceEntry, group: BloodHunterFeatureGroup): boolean {
  return side.name === feature.name
    && (side.source === undefined || side.source === feature.source)
    && (group === 'optionalfeature' || side.className === feature.className)
    && (group !== 'subclassFeature' || side.subclassShortName === feature.subclassShortName)
    && (side.level === undefined || side.level === feature.level);
}

function formatSourceFindings(findings: BloodHunterValidationFinding[]): string {
  return `BloodHunter2024 source 被拒绝: ${findings.map((finding) => `${finding.code}@${finding.path}`).join(', ')}`;
}

type JsonRecord = Record<string, unknown>;

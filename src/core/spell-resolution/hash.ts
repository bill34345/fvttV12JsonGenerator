import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { listUnknownManifestProperties } from '@fvtt-json-generator/spell-manifest-contracts/schema';
import { RESOLVER_MODULE_ID, type PortableSpellManifest } from './types';

const MANAGED_TOP_LEVEL_KEYS = [
  '_id',
  '_stats',
  'name',
  'type',
  'img',
  'system',
  'effects',
  'flags',
  'activation',
  'consumption',
  'duration',
  'range',
  'target',
  'uses',
  'spell',
  'description',
  'attack',
  'save',
] as const;

const VOLATILE_KEYS = new Set([
  'sort',
  'ownership',
  'folder',
  'chat',
  'runtime',
  'timestamps',
  'createdTime',
  'modifiedTime',
  'lastModifiedBy',
  'exportSource',
  'duplicateSource',
]);

export function hashManifest(manifest: PortableSpellManifest): string {
  const unknown = listUnknownManifestProperties(manifest)[0];
  if (unknown) throw new TypeError(`无法哈希包含未知字段的法术清单：${unknown.path}。`);
  return sha256(canonicalStringify(projectManifest(manifest)));
}

export function hashManagedProjection(value: unknown): string {
  return sha256(canonicalStringify(projectManagedDocument(value)));
}

function projectManifest(manifest: PortableSpellManifest): unknown {
  return compact({
    schemaVersion: manifest.schemaVersion,
    manifestId: manifest.manifestId,
    sourceSha256: manifest.sourceSha256,
    rulesPreference: manifest.rulesPreference,
    spellcastingGroups: manifest.spellcastingGroups.map((group) => compact({
      groupId: group.groupId,
      featureItemKey: group.featureItemKey,
      ability: group.ability,
      saveDc: group.saveDc,
      attackBonus: group.attackBonus,
      spellRefs: group.spellRefs.map((ref) => compact({
        refId: ref.refId,
        identifier: ref.identifier,
        originalName: ref.originalName,
        englishName: ref.englishName,
        chineseName: ref.chineseName,
        aliases: [...ref.aliases],
        expectedLevel: ref.expectedLevel,
        expectedSchool: ref.expectedSchool,
        sourceBookHint: ref.sourceBookHint,
        method: ref.method,
        uses: ref.uses === undefined ? undefined : {
          value: ref.uses.value,
          recovery: ref.uses.recovery,
          shared: ref.uses.shared,
        },
        castingLevel: ref.castingLevel,
        ignoresMaterialComponents: ref.ignoresMaterialComponents,
        restrictions: ref.restrictions.map((restriction) => compact({
          kind: restriction.kind,
          text: restriction.text,
          value: restriction.value,
          evidence: restriction.evidence.map(projectEvidence),
        })),
        evidence: ref.evidence.map(projectEvidence),
      })),
    })),
  });
}

function projectEvidence(value: { start: number; end: number; quote: string }): unknown {
  return { start: value.start, end: value.end, quote: value.quote };
}

function projectManagedDocument(value: unknown): unknown {
  if (!isRecord(value)) return normalizeManagedValue(value, []);
  const result: Record<string, unknown> = {};
  for (const key of MANAGED_TOP_LEVEL_KEYS) {
    if (!(key in value)) continue;
    const projected = key === 'flags'
      ? projectManagedFlags(value[key])
      : normalizeManagedValue(value[key], [key]);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
}

function projectManagedFlags(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};

  if (isRecord(value.dnd5e) && 'cachedFor' in value.dnd5e) {
    result.dnd5e = { cachedFor: normalizeManagedValue(value.dnd5e.cachedFor, ['flags', 'dnd5e', 'cachedFor']) };
  }

  if (RESOLVER_MODULE_ID in value) {
    const resolverFlags = normalizeManagedValue(value[RESOLVER_MODULE_ID], ['flags', RESOLVER_MODULE_ID]);
    if (!isRecord(resolverFlags) || Object.keys(resolverFlags).length > 0) result[RESOLVER_MODULE_ID] = resolverFlags;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

function normalizeManagedValue(value: unknown, path: string[]): unknown {
  if (Array.isArray(value)) return value.map((entry, index) => normalizeManagedValue(entry, [...path, String(index)]));
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (isVolatilePath(path, key)) continue;
    const projected = normalizeManagedValue(value[key], [...path, key]);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
}

function isVolatilePath(path: string[], key: string): boolean {
  if (VOLATILE_KEYS.has(key)) return true;
  if (path.at(-1) === '_stats' && (key === 'coreVersion' || key === 'systemVersion')) return true;
  if (key === 'spent' && path.at(-1) === 'uses') return true;
  if (path.length >= 2 && path[0] === 'flags' && path[1] === RESOLVER_MODULE_ID) {
    return key === 'generatedContentHash' || key === 'transactionId';
  }
  return false;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, []));
}

function canonicalize(value: unknown, path: string[]): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`无法哈希非有限数字：/${path.map(escapePointerSegment).join('/')}。`);
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, [...path, String(index)]));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], [...path, key])]));
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { listUnknownManifestProperties } from './schema';
import type { PortableSpellManifest } from './types';

export function hashManifest(manifest: PortableSpellManifest): string {
  const unknown = listUnknownManifestProperties(manifest)[0];
  if (unknown) {
    throw new TypeError(`无法哈希包含未知字段的法术清单：${unknown.path}。`);
  }
  return sha256(canonicalStringify(projectManifest(manifest)));
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

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, []));
}

function canonicalize(value: unknown, path: string[]): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`无法哈希非有限数字：/${path.map(escapePointerSegment).join('/')}。`);
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalize(entry, [...path, String(index)]));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key], [...path, key])]),
  );
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

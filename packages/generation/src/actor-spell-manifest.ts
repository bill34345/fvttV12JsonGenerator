import type { FvttTargetVersion } from './target';
import { hashManifest } from '@fvtt-json-generator/spell-manifest-contracts/hash-manifest';
import {
  findForbiddenTargetWorldIdentifiers,
  RESOLVER_MODULE_ID,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
} from '@fvtt-json-generator/spell-manifest-contracts';

const featureKeys = new WeakMap<object, string>();

export const SPELL_MANIFEST_UNSUPPORTED_TARGET = 'SPELL_MANIFEST_UNSUPPORTED_TARGET' as const;

export class ActorSpellManifestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ActorSpellManifestError';
  }
}

export function markSpellcastingFeatureItem(item: object, featureItemKey: string): void {
  featureKeys.set(item, featureItemKey);
}

export function assertNoOrphanedSpellcastingFeatureLinks(actor: Record<string, any>): void {
  const orphan = (Array.isArray(actor.items) ? actor.items : [])
    .find((item: unknown) => Boolean(item && typeof item === 'object' && featureKeys.has(item as object)));
  if (orphan) {
    throw new ActorSpellManifestError(
      'SPELL_FEATURE_LINK_ORPHANED',
      'Generated spellcasting feature linkage requires a portable spell manifest.',
    );
  }
}

export function assertPortableActorHasNoTargetWorldIdentifiers(actor: Record<string, any>): void {
  if (!actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest) return;
  const forbidden = findForbiddenTargetWorldIdentifiers(actor)[0];
  if (forbidden) {
    throw new ActorSpellManifestError(
      'SPELL_ACTOR_FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      `${forbidden.path} contains ${forbidden.match}.`,
    );
  }
}

export function assertSpellManifestTarget(
  manifest: PortableSpellManifest | undefined,
  target: FvttTargetVersion,
): void {
  if (manifest && target !== '14') {
    throw new ActorSpellManifestError(
      SPELL_MANIFEST_UNSUPPORTED_TARGET,
      `Portable spell manifests require Foundry v14; requested v${target}.`,
    );
  }
}

/**
 * Adds the schema-derived portable Actor boundary without resolving destination
 * documents. Feature linkage is source-derived and exact; names and item order
 * never participate in the match.
 */
export function buildActorSpellManifest(
  actor: Record<string, any>,
  manifest: PortableSpellManifest,
  target: FvttTargetVersion,
): void {
  assertSpellManifestTarget(manifest, target);
  const validation = validatePortableSpellManifestStructure(manifest);
  if (!validation.ok) {
    const details = validation.findings.map((finding) => `${finding.code} ${finding.path}`).join('; ');
    throw new ActorSpellManifestError('SPELL_MANIFEST_INVALID', details);
  }
  const validated = validation.value;
  const groupsByFeature = new Map<string, typeof validated.spellcastingGroups>();
  for (const group of validated.spellcastingGroups) {
    const groups = groupsByFeature.get(group.featureItemKey) ?? [];
    groups.push(group);
    groupsByFeature.set(group.featureItemKey, groups);
  }
  for (const [key, groups] of groupsByFeature) {
    if (groups.length !== 1) {
      throw new ActorSpellManifestError(
        'SPELL_FEATURE_LINK_DUPLICATE_MANIFEST_KEY',
        `featureItemKey ${key} must identify exactly one manifest group.`,
      );
    }
  }

  const items = Array.isArray(actor.items) ? actor.items : [];
  const itemsByFeature = new Map<string, any[]>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = featureKeys.get(item);
    if (!key) continue;
    const linked = itemsByFeature.get(key) ?? [];
    linked.push(item);
    itemsByFeature.set(key, linked);
  }

  for (const key of itemsByFeature.keys()) {
    if (!groupsByFeature.has(key)) {
      throw new ActorSpellManifestError('SPELL_FEATURE_LINK_UNKNOWN', `Generated feature key ${key} is absent from the manifest.`);
    }
  }
  for (const group of validated.spellcastingGroups) {
    const linked = itemsByFeature.get(group.featureItemKey) ?? [];
    if (linked.length === 0) {
      throw new ActorSpellManifestError('SPELL_FEATURE_LINK_MISSING', `No generated feature has key ${group.featureItemKey}.`);
    }
    if (linked.length !== 1) {
      throw new ActorSpellManifestError('SPELL_FEATURE_LINK_DUPLICATE', `Feature key ${group.featureItemKey} matched ${linked.length} generated items.`);
    }
    const item = linked[0]!;
    item.flags = item.flags ?? {};
    // source-derived: this stable project-owned marker preserves the exact
    // structured feature key independently of display names and descriptions.
    item.flags.fvttJsonGenerator = {
      ...(item.flags.fvttJsonGenerator ?? {}),
      spellcastingFeatureKey: group.featureItemKey,
    };
    item.flags[RESOLVER_MODULE_ID] = {
      featureItemKey: group.featureItemKey,
      groupId: group.groupId,
    };
  }

  actor.flags = actor.flags ?? {};
  actor.flags[RESOLVER_MODULE_ID] = {
    spellManifest: validated,
    spellResolution: {
      status: 'pending',
      manifestHash: hashManifest(validated),
    },
  };
}

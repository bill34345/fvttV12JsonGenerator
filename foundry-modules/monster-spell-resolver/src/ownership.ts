import { logicalSpellRefKey, RESOLVER_MODULE_ID } from '../../../src/core/spell-resolution';
import type { ResolverManagedFlags } from './cast-activity';

const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;

export interface ResolverDocumentIdentity {
  manifestId: string;
  groupId: string;
  refId: string;
  featureId: string;
  logicalRefKey: string;
  selectedUuid: string;
  activityId: string;
}

export class ResolverOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolverOwnershipError';
  }
}

export function assertLinkedFeatureOwnership(
  actor: any,
  feature: any,
  identity: ResolverDocumentIdentity,
): void {
  assertIdentity(identity);
  if (!actor || actor.type !== 'npc' || !FOUNDRY_ID.test(documentId(actor))) fail('Current parent must be a valid NPC Actor.');
  if (!feature || feature.type !== 'feat' || !FOUNDRY_ID.test(documentId(feature))) fail('Linked generated feature must be a valid feat Item.');
  if (documentId(feature) !== identity.featureId) fail('Linked feature ID does not match resolver identity.');
  if (feature.parent !== actor || feature.actor !== actor) fail('Linked feature is not currently embedded in the expected Actor.');

  const manifest = actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest;
  if (manifest?.manifestId !== identity.manifestId) fail('Actor resolver manifest ID does not match the managed identity.');
  const manifestGroups = Array.isArray(manifest?.spellcastingGroups)
    ? manifest.spellcastingGroups.filter((group: unknown) => isRecord(group) && group.groupId === identity.groupId)
    : [];
  if (manifestGroups.length !== 1) fail('Actor resolver manifest does not contain exactly one expected spellcasting group.');
  const manifestFeatureItemKey = manifestGroups[0]?.featureItemKey;
  if (typeof manifestFeatureItemKey !== 'string' || manifestFeatureItemKey.length === 0) {
    fail('Actor resolver manifest group has an invalid featureItemKey.');
  }
  const manifestRefs = Array.isArray(manifestGroups[0]?.spellRefs)
    ? manifestGroups[0].spellRefs.filter((ref: unknown) => isRecord(ref) && ref.refId === identity.refId)
    : [];
  if (manifestRefs.length !== 1) fail('Actor resolver manifest group does not contain exactly one expected spell reference.');
  const featureFlags = feature.flags?.[RESOLVER_MODULE_ID];
  if (!isRecord(featureFlags)
    || featureFlags.groupId !== identity.groupId
    || featureFlags.featureItemKey !== manifestFeatureItemKey) {
    fail('Feature is not explicitly linked to the expected generated spellcasting group.');
  }
  if (feature.flags?.fvttJsonGenerator?.spellcastingFeatureKey !== manifestFeatureItemKey) {
    fail('Feature lacks the exact project-generator spellcasting feature marker.');
  }
}

export function assertResolverDocumentOwnership(
  actor: any,
  feature: any,
  document: any,
  identity: ResolverDocumentIdentity,
  expectedType: 'activity' | 'spell',
  expectedCachedFor?: string,
): void {
  assertLinkedFeatureOwnership(actor, feature, identity);
  if (!document || !FOUNDRY_ID.test(documentId(document))) fail(`Managed ${expectedType} has an invalid Foundry Document ID.`);
  const flags = document.flags?.[RESOLVER_MODULE_ID] as Partial<ResolverManagedFlags> | undefined;
  if (!flags || flags.managed !== true || flags.documentType !== expectedType) {
    fail(`Document lacks resolver ${expectedType} ownership.`);
  }
  for (const key of ['manifestId', 'groupId', 'refId', 'featureId', 'logicalRefKey', 'selectedUuid', 'activityId'] as const) {
    if (flags[key] !== identity[key]) fail(`Managed ${expectedType} ownership mismatch at ${key}.`);
  }

  if (expectedType === 'activity') {
    if (document.type !== 'cast') fail('Managed Activity must be native type cast.');
    if (documentId(document) !== identity.activityId) fail('Managed Activity ID does not match its ownership identity.');
    if (document.actor !== actor || document.item !== feature) {
      fail('Managed Activity is not currently parented by the linked feature and Actor.');
    }
    if (document.spell?.uuid !== identity.selectedUuid) fail('Managed Cast Activity destination UUID does not match ownership.');
    return;
  }

  if (document.type !== 'spell') fail('Managed cache must be an embedded Spell Item.');
  if (document.parent !== actor || document.actor !== actor) fail('Managed Spell is not currently embedded in the expected Actor.');
  if (typeof expectedCachedFor !== 'string' || !expectedCachedFor) fail('Expected cachedFor is required for Spell ownership.');
  if (document.flags?.dnd5e?.cachedFor !== expectedCachedFor) fail('Managed Spell cachedFor does not match the prepared Activity.');
  if (readCompendiumSource(document) !== identity.selectedUuid) fail('Managed Spell Compendium source does not match selection ownership.');
}

/**
 * The one narrow adoption path for dnd5e's automatic cache creation. The cache
 * must be new relative to the transaction snapshot and carry exact native
 * provenance. Foreign flags are legitimate cloned source data and are inert.
 */
export function assertAdoptableNativeCache(
  actor: any,
  feature: any,
  activity: any,
  cache: any,
  identity: ResolverDocumentIdentity,
  snapshotItemIds: ReadonlySet<string>,
): void {
  assertResolverDocumentOwnership(actor, feature, activity, identity, 'activity');
  const id = documentId(cache);
  if (!FOUNDRY_ID.test(id)) fail(`Native cache has an invalid Foundry Document ID: ${id || '<missing>'} (${Object.keys(cache ?? {}).join(',')}).`);
  if (snapshotItemIds.has(id)) fail('A pre-existing unowned cache cannot be adopted.');
  if (cache.type !== 'spell' || cache.parent !== actor || cache.actor !== actor) fail('Native cache is not an embedded Spell on the expected Actor.');
  if (cache.flags?.[RESOLVER_MODULE_ID] !== undefined) fail('Native cache already has a resolver ownership namespace.');
  if (cache.flags?.dnd5e?.cachedFor !== activity.relativeUUID) fail('Native cache cachedFor does not match the new owned Activity.');
  if (readCompendiumSource(cache) !== identity.selectedUuid) fail('Native cache Compendium source does not match the selected UUID.');
}

export function resolverOwnershipFlags(
  identity: ResolverDocumentIdentity,
  documentType: 'activity' | 'spell',
  transactionId?: string,
): ResolverManagedFlags {
  assertIdentity(identity);
  if (transactionId !== undefined && !FOUNDRY_ID.test(transactionId)) fail('transactionId must be a 16-character Foundry-compatible ID.');
  return {
    managed: true,
    documentType,
    ...identity,
    ...(transactionId === undefined ? {} : { transactionId }),
  };
}

export function documentId(document: any): string {
  return typeof document?.id === 'string' ? document.id : (typeof document?._id === 'string' ? document._id : '');
}

export function readCompendiumSource(document: any): unknown {
  if (typeof document?.toObject === 'function') return document.toObject()?._stats?.compendiumSource;
  return document?._stats?.compendiumSource;
}

function assertIdentity(identity: ResolverDocumentIdentity): void {
  if (!identity || typeof identity !== 'object') fail('Resolver ownership identity is required.');
  for (const key of ['manifestId', 'groupId', 'refId', 'logicalRefKey', 'selectedUuid'] as const) {
    if (typeof identity[key] !== 'string' || !identity[key]) fail(`Resolver identity ${key} is invalid.`);
  }
  if (!FOUNDRY_ID.test(identity.featureId) || !FOUNDRY_ID.test(identity.activityId)) {
    fail('Resolver feature/activity IDs must satisfy Foundry\'s 16-character Document ID contract.');
  }
  if (identity.logicalRefKey !== logicalSpellRefKey(identity.manifestId, identity.groupId, identity.refId)) {
    fail('Resolver logicalRefKey does not match the Task 5 public identity contract.');
  }
}

function fail(message: string): never {
  throw new ResolverOwnershipError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

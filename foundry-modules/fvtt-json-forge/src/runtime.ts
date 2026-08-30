import {
  decodeForgeActorResponse,
  hashArtifact,
  type ForgeActorResponse,
  type ForgeAcceptedVerificationSummary,
  type ForgeSourceId,
  type JsonObject,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  resolveFoundrySpellUuid,
  resolveLegacySpellUuid,
} from '@fvtt-json-generator/forge-browser-runtime';

export const MODULE_ID = 'fvtt-json-forge' as const;
export const EXPECTED_FOUNDRY_VERSION = '14.364' as const;
export const EXPECTED_SYSTEM_ID = 'dnd5e' as const;
export const EXPECTED_SYSTEM_VERSION = '5.3.3' as const;

export interface ForgeGameLike {
  version?: string;
  system?: { id?: string; version?: string };
  user?: { id?: string; isGM?: boolean };
  actors?: ForgeActorCollectionLike;
}

export interface ForgeActorLike {
  id?: string;
  uuid?: string;
  name?: string;
  flags?: Record<string, unknown>;
  delete(): Promise<unknown>;
  toObject(): unknown;
}

export interface ForgeActorCollectionLike {
  contents?: ForgeActorLike[];
  values?: () => IterableIterator<ForgeActorLike>;
  get?: (id: string) => ForgeActorLike | undefined;
  documentClass: ForgeActorDocumentClass;
}

export interface ForgeActorDocumentClass {
  create(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<ForgeActorLike>;
}

export interface ForgeAcceptedActorCreateInput {
  game: ForgeGameLike;
  response: ForgeActorResponse;
  rawSourceHash?: Sha256;
  signal?: AbortSignal;
}

export interface ForgeActorCreateResult {
  status: 'created' | 'existing';
  actor: ForgeActorLike;
  uuid: string;
  sourceId: ForgeSourceId;
  artifactHash: Sha256;
}

export class ForgeTemporaryActorCleanupError extends Error {
  public readonly actorUuid: string;

  public constructor(actorUuid: string, cause: unknown) {
    super(
      `New Forge Actor ${actorUuid} could not be deleted and may remain in the world. Inspect it before retrying.`,
      { cause },
    );
    this.name = 'ForgeTemporaryActorCleanupError';
    this.actorUuid = actorUuid;
  }
}

export async function createAcceptedForgeActor(
  input: ForgeAcceptedActorCreateInput,
): Promise<ForgeActorCreateResult> {
  assertGm(input.game);
  assertExactRuntime(input.game);
  const decoded = decodeForgeActorResponse(input.response);
  if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted') {
    throw new Error('Only a decoded accepted Forge Actor response can be created.');
  }
  throwIfAborted(input.signal);
  const result = decoded.value.result;
  assertResponseTarget(result.target, input.game);
  const accepted = result.verification as ForgeAcceptedVerificationSummary;
  if (accepted.status !== 'accepted' || !result.artifact || !result.artifactHash || result.diagnostics.length > 0 || result.actorVerification.warnings.length > 0) {
    throw new Error('Forge Actor response is not applyable.');
  }
  if (hashArtifact(result.artifact) !== result.artifactHash) {
    throw new Error('Forge Actor artifact hash does not match before creation.');
  }

  const collection = input.game.actors;
  if (!collection) throw new Error('Foundry world Actor collection is unavailable.');
  const importArtifact = prepareFoundryImportArtifact(result.artifact);
  const documentId = forgeActorDocumentId(result.sourceIdentity.sourceId);
  const identity = {
    protocolVersion: 1,
    requestId: input.response.requestId,
    sourceId: result.sourceIdentity.sourceId,
    sourceHash: result.sourceIdentity.sourceHash,
    ...(input.rawSourceHash ? { rawSourceHash: input.rawSourceHash } : {}),
    artifactHash: result.artifactHash,
  } as const;
  // Document.create() is the single world write and receives the complete,
  // already-verified Actor plus Forge identity. If the browser dies after the
  // server commits this write, the complete Actor may remain. Cancellation is
  // honored before submission; ordinary readback failures attempt rollback.
  const worldCreateData = prepareWorldCreateData(importArtifact, identity, documentId);
  const existing = findActors(collection, result.sourceIdentity.sourceId);
  const conflicting = existing.filter((actor) => getForgeIdentity(actor)?.artifactHash !== result.artifactHash);
  if (conflicting.length > 0) {
    throw new Error('The same Forge source ID already exists with a different artifact hash. Existing Actor was not changed.');
  }
  if (existing.length > 1) {
    throw new Error('Multiple existing Actors claim the same Forge source ID. Resolve the world conflict before creating or reusing an Actor.');
  }
  if (existing[0]) {
    throwIfAborted(input.signal);
    return verifyReusableActor(
      existing[0],
      importArtifact,
      result.sourceIdentity.sourceId,
      result.sourceIdentity.sourceHash,
      result.artifactHash,
    );
  }
  const idCollision = findActorById(collection, documentId);
  if (idCollision) {
    throw new Error(`The deterministic Forge Actor ID ${documentId} is already occupied by another world Actor. Existing Actor was not changed.`);
  }

  let created: ForgeActorLike | undefined;
  let cleanupRequired = true;
  try {
    throwIfAborted(input.signal);
    try {
      created = await collection.documentClass.create(
        worldCreateData,
        { renderSheet: false, keepId: true },
      );
    } catch (error) {
      const concurrent = findActorById(collection, documentId);
      const concurrentIdentity = concurrent && getForgeIdentity(concurrent);
      if (concurrentIdentity?.sourceId === result.sourceIdentity.sourceId) {
        if (concurrentIdentity.artifactHash !== result.artifactHash) {
          throw new Error('A concurrent Forge operation claimed the same source ID with a different artifact hash. Existing Actor was not changed.', { cause: error });
        }
        return verifyReusableActor(
          concurrent!,
          importArtifact,
          result.sourceIdentity.sourceId,
          result.sourceIdentity.sourceHash,
          result.artifactHash,
        );
      }
      throw error;
    }
    const actor = created;
    if (!actor) throw new Error('Foundry did not return the created Actor document.');
    if (actor.id !== documentId) {
      throw new Error('Foundry did not preserve the deterministic Forge Actor ID during creation.');
    }
    const readback = actor.toObject();
    assertReadback(
      importArtifact,
      readback,
      input.response.requestId,
      result.sourceIdentity.sourceId,
      result.sourceIdentity.sourceHash,
      result.artifactHash,
      input.rawSourceHash,
    );
    cleanupRequired = false;
    return {
      status: 'created',
      actor,
      uuid: requireActorUuid(actor),
      sourceId: result.sourceIdentity.sourceId,
      artifactHash: result.artifactHash,
    };
  } finally {
    if (cleanupRequired && created) {
      try {
        await created.delete();
      } catch (error) {
        throw new ForgeTemporaryActorCleanupError(created.uuid ?? created.id ?? '[unknown Actor]', error);
      }
    }
  }
}

function prepareWorldCreateData(
  artifact: JsonObject,
  identity: {
    protocolVersion: 1;
    requestId: string;
    sourceId: ForgeSourceId;
    sourceHash: Sha256;
    rawSourceHash?: Sha256;
    artifactHash: Sha256;
  },
  documentId: string,
): JsonObject {
  const copy = JSON.parse(JSON.stringify(artifact)) as JsonObject;
  const flags = getRecord(copy.flags);
  copy._id = documentId;
  copy.flags = { ...flags, [MODULE_ID]: { ...identity } };
  return copy;
}

function prepareFoundryImportArtifact(artifact: JsonObject): JsonObject {
  const copy = JSON.parse(JSON.stringify(artifact)) as JsonObject;
  if (!Array.isArray(copy.items)) return copy;

  for (const itemValue of copy.items) {
    const item = getRecord(itemValue);
    const system = getRecord(item.system);
    normalizeLegacySpellReferencesForFoundry(system);
    const parentRange = getRecord(system.range);
    if (!Object.prototype.hasOwnProperty.call(system, 'range') || parentRange.long !== null) continue;

    const activityLongs = new Set<number>();
    for (const activityValue of Object.values(getRecord(system.activities))) {
      const activityRange = getRecord(getRecord(activityValue).range);
      if (typeof activityRange.long === 'number') activityLongs.add(activityRange.long);
    }
    if (activityLongs.size > 1) {
      throw new Error('Foundry dnd5e cannot represent multiple long ranges on one Item parent range.');
    }
    const [long] = activityLongs;
    if (long !== undefined) parentRange.long = long;
  }

  return copy;
}

export function assertGm(game: ForgeGameLike): void {
  if (game.user?.isGM !== true) throw new Error('Forge Actor creation requires an active GM user.');
}

export function assertExactRuntime(game: ForgeGameLike): void {
  if (game.version !== EXPECTED_FOUNDRY_VERSION) throw new Error(`Forge Actor requires Foundry ${EXPECTED_FOUNDRY_VERSION}.`);
  if (game.system?.id !== EXPECTED_SYSTEM_ID || game.system?.version !== EXPECTED_SYSTEM_VERSION) {
    throw new Error(`Forge Actor requires dnd5e ${EXPECTED_SYSTEM_VERSION}.`);
  }
}

function assertResponseTarget(
  target: {
    fvttRuntimeVersion: string;
    generatorProfile: string;
    systemId: string;
    systemVersionObserved: string;
    effectProfile: string;
    iconMode: string;
  },
  game: ForgeGameLike,
): void {
  const expected = {
    fvttRuntimeVersion: EXPECTED_FOUNDRY_VERSION,
    generatorProfile: 'v14',
    systemId: EXPECTED_SYSTEM_ID,
    systemVersionObserved: EXPECTED_SYSTEM_VERSION,
    effectProfile: 'core',
    iconMode: 'off',
  } as const;
  const actual = {
    fvttRuntimeVersion: target.fvttRuntimeVersion,
    generatorProfile: target.generatorProfile,
    systemId: target.systemId,
    systemVersionObserved: target.systemVersionObserved,
    effectProfile: target.effectProfile,
    iconMode: target.iconMode,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Forge Actor response target does not match the supported Foundry runtime at ${key}.`);
    }
  }
  if (game.version !== expected.fvttRuntimeVersion || game.system?.id !== expected.systemId || game.system?.version !== expected.systemVersionObserved) {
    throw new Error('Forge Actor response target does not match the active Foundry runtime.');
  }
}

function assertReadback(
  artifact: JsonObject,
  readback: unknown,
  requestId: string,
  sourceId: ForgeSourceId,
  sourceHash: Sha256,
  artifactHash: Sha256,
  rawSourceHash?: Sha256,
): void {
  assertActorSemantics(artifact, readback);
  const identity = getForgeIdentity(readback);
  if (
    identity?.protocolVersion !== 1
    || identity.requestId !== requestId
    || identity.sourceId !== sourceId
    || identity.sourceHash !== sourceHash
    || identity.artifactHash !== artifactHash
    || (rawSourceHash !== undefined && identity.rawSourceHash !== rawSourceHash)
  ) {
    throw new Error('Foundry Actor readback does not preserve Forge source identity.');
  }
}

function assertActorSemantics(artifact: JsonObject, readback: unknown): void {
  const actual = actorSemantics(readback, 'readback');
  const expected = actorSemantics(artifact, 'artifact');
  const projected = projectReadbackToExpected(actual, expected);
  if (stableJson(projected) !== stableJson(expected)) {
    const path = firstDifferencePath(projected, expected) ?? 'unknown';
    throw new Error(`Foundry Actor readback does not match the generated artifact semantics at ${path}.`);
  }
}

function verifyReusableActor(
  actor: ForgeActorLike,
  artifact: JsonObject,
  sourceId: ForgeSourceId,
  sourceHash: Sha256,
  artifactHash: Sha256,
): ForgeActorCreateResult {
  try {
    const readback = actor.toObject();
    assertActorSemantics(artifact, readback);
    const identity = getForgeIdentity(readback);
    if (
      identity?.protocolVersion !== 1
      || !identity.requestId
      || identity.sourceId !== sourceId
      || identity.sourceHash !== sourceHash
      || identity.artifactHash !== artifactHash
    ) {
      throw new Error('Existing Actor does not preserve the expected Forge source identity.');
    }
  } catch (cause) {
    throw new Error('Existing Forge Actor failed readback verification and was not changed.', { cause });
  }
  return {
    status: 'existing',
    actor,
    uuid: requireActorUuid(actor),
    sourceId,
    artifactHash,
  };
}

function forgeActorDocumentId(sourceId: ForgeSourceId): string {
  return hashArtifact({ sourceId }).slice(0, 16);
}

function findActorById(collection: ForgeActorCollectionLike, id: string): ForgeActorLike | undefined {
  const direct = collection.get?.(id);
  if (direct) return direct;
  const contents = collection.contents ?? (collection.values ? [...collection.values()] : []);
  return contents.find((actor) => actor.id === id);
}

function findActors(collection: ForgeActorCollectionLike, sourceId: ForgeSourceId): ForgeActorLike[] {
  const contents = collection.contents ?? (collection.values ? [...collection.values()] : []);
  return contents.filter((actor) => getForgeIdentity(actor)?.sourceId === sourceId);
}

function getForgeIdentity(value: ForgeActorLike | unknown): {
  protocolVersion?: number;
  requestId?: string;
  sourceId?: string;
  sourceHash?: string;
  rawSourceHash?: string;
  artifactHash?: string;
} | undefined {
  const flags = getRecord(getRecord(value).flags);
  const identity = getRecord(flags[MODULE_ID]);
  if (!identity.sourceId && !identity.sourceHash && !identity.artifactHash) return undefined;
  return {
    protocolVersion: typeof identity.protocolVersion === 'number' ? identity.protocolVersion : undefined,
    requestId: typeof identity.requestId === 'string' ? identity.requestId : undefined,
    sourceId: typeof identity.sourceId === 'string' ? identity.sourceId : undefined,
    sourceHash: typeof identity.sourceHash === 'string' ? identity.sourceHash : undefined,
    rawSourceHash: typeof identity.rawSourceHash === 'string' ? identity.rawSourceHash : undefined,
    artifactHash: typeof identity.artifactHash === 'string' ? identity.artifactHash : undefined,
  };
}

function actorSemantics(value: unknown, effectSource: 'artifact' | 'readback'): unknown {
  const actor = getRecord(value);
  const system = getRecord(actor.system);
  const attributes = getRecord(system.attributes);
  const details = getRecord(system.details);
  const traits = getRecord(system.traits);
  const items = Array.isArray(actor.items) ? actor.items.map((item) => itemSemantics(item, effectSource)) : [];
  return {
    name: actor.name,
    type: actor.type,
    hp: attributes.hp,
    ac: attributes.ac,
    cr: details.cr,
    creatureType: details.type,
    senses: attributes.senses ?? traits.senses,
    abilities: system.abilities,
    items,
    effects: Array.isArray(actor.effects) ? actor.effects.map((effect) => effectSemantics(effect, effectSource)) : undefined,
  };
}

function itemSemantics(value: unknown, effectSource: 'artifact' | 'readback'): unknown {
  const item = getRecord(value);
  const system = getRecord(item.system);
  const itemRange = system.range === undefined ? undefined : stripDocumentNoise(system.range);
  const activities = Object.entries(getRecord(system.activities)).sort(([a], [b]) => a.localeCompare(b)).map(([id, activity]) => ({
    id,
    value: projectActivityReadback(activity, itemRange),
  }));
  return {
    name: item.name,
    type: item.type,
    activation: system.activation,
    uses: system.uses,
    ...(itemRange === undefined ? {} : { range: itemRange }),
    activities,
    effects: Array.isArray(item.effects) ? item.effects.map((effect) => effectSemantics(effect, effectSource)) : [],
  };
}

function projectActivityReadback(value: unknown, itemRange: unknown): unknown {
  const activity = getRecord(stripDocumentNoise(value));
  normalizeLegacySpellReferenceForComparison(activity);
  normalizeInactiveActivityTemplateForComparison(activity);
  const activityRange = getRecord(activity.range);
  const parentRange = getRecord(itemRange);
  const itemReach = parentRange.reach;
  const itemLong = parentRange.long;
  // dnd5e 5.3.3 stores melee reach on the parent weapon's system.range. Its
  // Activity RangeField intentionally has no reach field, so importFromJSON()
  // drops the protocol's activity-level copy. Project the supported parent
  // field back into the source-shaped comparison without changing the artifact.
  if (activityRange.reach === undefined && typeof itemReach === 'number') {
    activity.range = { ...activityRange, reach: itemReach };
  }
  if ((activityRange.long === undefined || activityRange.long === null) && typeof itemLong === 'number') {
    activity.range = { ...getRecord(activity.range), long: itemLong };
  }
  return activity;
}

function normalizeInactiveActivityTemplateForComparison(activity: Record<string, any>): void {
  const target = getRecord(activity.target);
  const template = getRecord(target.template);
  const hasType = template.type !== undefined && template.type !== null && template.type !== '';
  const hasDimension = ['count', 'size', 'width', 'height']
    .some((key) => template[key] !== undefined && template[key] !== null && template[key] !== '');
  if (hasType || hasDimension || !Object.hasOwn(template, 'units')) return;
  const { units: _units, ...templateWithoutInactiveUnits } = template;
  activity.target = { ...target, template: templateWithoutInactiveUnits };
}

const LEGACY_SPELL_UUID_PATTERN = /^[0-9a-f]{16}$/u;
const LEGACY_SPELL_REFERENCE_PATTERN = /^Compendium\.dnd5e\.spells\.Item\.([0-9a-f]{16})$/u;

function normalizeLegacySpellReferencesForFoundry(system: Record<string, any>): void {
  const activities = getRecord(system.activities);
  for (const activityValue of Object.values(activities)) {
    const activity = getRecord(activityValue);
    const spell = getRecord(activity.spell);
    if (typeof spell.uuid !== 'string') continue;
    const legacyUuid = LEGACY_SPELL_UUID_PATTERN.test(spell.uuid)
      ? spell.uuid
      : spell.uuid.match(LEGACY_SPELL_REFERENCE_PATTERN)?.[1];
    if (!legacyUuid) continue;
    const foundryUuid = resolveFoundrySpellUuid(legacyUuid);
    if (!foundryUuid) {
      throw new Error(`Legacy dnd5e spell ID "${legacyUuid}" has no unique dnd5e 5.3.3 Item mapping.`);
    }
    spell.uuid = foundryUuid;
  }
}

function normalizeLegacySpellReferenceForComparison(activity: Record<string, any>): void {
  const spell = getRecord(activity.spell);
  if (typeof spell.uuid !== 'string') return;
  const legacyUuid = resolveLegacySpellUuid(spell.uuid)
    ?? spell.uuid.match(LEGACY_SPELL_REFERENCE_PATTERN)?.[1];
  if (legacyUuid) spell.uuid = legacyUuid;
}

function effectSemantics(value: unknown, source: 'artifact' | 'readback'): unknown {
  const effect = getRecord(value);
  const systemChanges = getRecord(effect.system).changes;
  const usesCanonicalChanges = Array.isArray(systemChanges);
  const changes = usesCanonicalChanges ? systemChanges : effect.changes;
  return {
    id: effect._id,
    name: effect.name,
    changes: Array.isArray(changes)
      ? changes.map((changeValue: unknown) => {
        const change = getRecord(changeValue);
        const projectedChange = source === 'artifact' && !usesCanonicalChanges
          ? normalizeFoundryV14LegacyEffectChange(change)
          : change;
        return {
          ...projectedChange,
          value: stableJson(projectedChange.value),
        };
      })
      : changes,
    transfer: effect.transfer,
    statuses: effect.statuses,
  };
}

const FOUNDRY_V14_EFFECT_TYPES_BY_MODE: Readonly<Record<number, string>> = {
  0: 'custom',
  1: 'multiply',
  2: 'add',
  3: 'downgrade',
  4: 'upgrade',
  5: 'override',
};

function normalizeFoundryV14LegacyEffectChange(change: Record<string, any>): Record<string, any> {
  const normalized = { ...change };
  if (!Object.hasOwn(normalized, 'type') && typeof normalized.mode === 'number') {
    normalized.type = FOUNDRY_V14_EFFECT_TYPES_BY_MODE[normalized.mode] ?? `custom.${normalized.mode}`;
    delete normalized.mode;
  }
  normalized.value = normalizeFoundryV14EffectChangeValue(normalized.value);
  return normalized;
}

function normalizeFoundryV14EffectChangeValue(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  try {
    return normalizeFoundryV14EffectChangeValue(JSON.parse(value));
  } catch {
    return value;
  }
}

function stripDocumentNoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocumentNoise);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '_stats' || key === 'folder' || key === 'ownership' || key === 'permission' || key === 'sort') continue;
    result[key] = stripDocumentNoise(entry);
  }
  return result;
}

function projectReadbackToExpected(actual: unknown, expected: unknown): unknown {
  if (expected === undefined) return undefined;
  if (expected === null) return actual === undefined ? null : actual;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return actual;
    return expected.map((entry, index) => projectReadbackToExpected(actual[index], entry));
  }
  if (typeof expected === 'object') {
    const actualRecord = getRecord(actual);
    return Object.fromEntries(
      Object.entries(expected as Record<string, unknown>).map(([key, entry]) => [
        key,
        projectReadbackToExpected(actualRecord[key], entry),
      ]),
    );
  }
  if (typeof expected === 'number' && typeof actual === 'string' && actual.trim() !== '' && Number(actual) === expected) {
    return expected;
  }
  return actual;
}

function getRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function requireActorUuid(actor: ForgeActorLike): string {
  const uuid = actor.uuid ?? actor.id;
  if (!uuid) throw new Error('Foundry Actor did not expose a UUID after creation.');
  return uuid;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function firstDifferencePath(actual: unknown, expected: unknown, path = '$'): string | undefined {
  if (stableJson(actual) === stableJson(expected)) return undefined;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return path;
    if (actual.length !== expected.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifferencePath(actual[index], expected[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return path;
  }
  if (expected && typeof expected === 'object') {
    const actualRecord = getRecord(actual);
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      const difference = firstDifferencePath(actualRecord[key], value, `${path}.${key}`);
      if (difference) return difference;
    }
    return path;
  }
  return path;
}

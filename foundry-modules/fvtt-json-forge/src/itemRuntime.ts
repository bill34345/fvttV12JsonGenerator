import {
  decodeForgeItemResponse,
  hashArtifact,
  projectForgeItemDocument,
  type ForgeAcceptedVerificationSummary,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type JsonObject,
  type JsonValue,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  assertExactRuntime,
  assertGm,
  MODULE_ID,
  type ForgeGameLike,
} from './runtime';

export interface ForgeItemLike {
  id?: string;
  uuid?: string;
  name?: string;
  flags?: Record<string, unknown>;
  delete(): Promise<unknown>;
  toObject(): unknown;
}

export interface ForgeItemCollectionLike {
  contents?: ForgeItemLike[];
  values?: () => IterableIterator<ForgeItemLike>;
  get?: (id: string) => ForgeItemLike | undefined;
  documentClass?: ForgeItemDocumentClass;
}

export interface ForgeItemDocumentClass {
  create(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<ForgeItemLike>;
}

export interface ForgeItemGameLike extends ForgeGameLike {
  items?: ForgeItemCollectionLike;
}

export interface ForgeAcceptedItemCreateInput {
  game: ForgeItemGameLike;
  response: ForgeItemResponse;
}

export interface ForgeItemCreateResult {
  status: 'created' | 'existing';
  item: ForgeItemLike;
  uuid: string;
  sourceId: ForgeItemSourceId;
  artifactHash: Sha256;
}

interface ForgeItemWorldIdentity {
  protocolVersion: 1;
  requestId: string;
  sourceId: ForgeItemSourceId;
  sourceHash: Sha256;
  artifactHash: Sha256;
  target: {
    fvttRuntimeVersion: string;
    generatorProfile: string;
    generatorVersion: string;
    systemId: string;
    systemVersionObserved: string;
    effectProfile: string;
    iconMode: string;
  };
}

export class ForgeTemporaryItemCleanupError extends Error {
  public readonly itemUuid: string;

  public constructor(itemUuid: string, cause: unknown) {
    super(
      `New Forge Item ${itemUuid} could not be deleted and may remain in the world. Inspect it before retrying.`,
      { cause },
    );
    this.name = 'ForgeTemporaryItemCleanupError';
    this.itemUuid = itemUuid;
  }
}

export async function createAcceptedForgeItem(
  input: ForgeAcceptedItemCreateInput,
): Promise<ForgeItemCreateResult> {
  assertGm(input.game);
  assertExactRuntime(input.game);
  const decoded = decodeForgeItemResponse(input.response);
  if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted') {
    throw new Error('Only a decoded accepted Forge Item response can be created.');
  }
  const result = decoded.value.result;
  const accepted = result.verification as ForgeAcceptedVerificationSummary;
  if (
    accepted.status !== 'accepted'
    || !result.artifact
    || !result.artifactHash
    || result.diagnostics.some((entry) => entry.severity === 'warning' || entry.severity === 'error')
    || hashArtifact(result.artifact) !== result.artifactHash
  ) {
    throw new Error('Forge Item response is not applyable.');
  }

  const collection = input.game.items;
  if (!collection) throw new Error('Foundry world Item collection is unavailable.');
  const documentId = forgeItemDocumentId(result.sourceIdentity.sourceId);
  const identity: ForgeItemWorldIdentity = {
    protocolVersion: 1,
    requestId: input.response.requestId,
    sourceId: result.sourceIdentity.sourceId,
    sourceHash: result.sourceIdentity.sourceHash,
    artifactHash: result.artifactHash,
    target: { ...result.target },
  };
  const importArtifact = prepareFoundryItemArtifact(result.artifact, identity, documentId);

  const claimed = findItemsBySourceId(collection, result.sourceIdentity.sourceId);
  if (claimed.length > 1) {
    throw new Error('Multiple existing Items claim the same Forge Item source ID. Resolve the world conflict before retrying.');
  }
  if (claimed[0]) {
    if (claimed[0].id !== documentId) {
      throw new Error(
        `The Forge Item source ID is claimed by world Item ${requireItemUuid(claimed[0])} instead of its deterministic ID ${documentId}. Existing Item was not changed.`,
      );
    }
    const existingIdentity = readForgeItemIdentity(claimed[0]);
    if (existingIdentity?.artifactHash !== result.artifactHash) {
      throw new Error('The same Forge Item source ID already exists with a different artifact hash. Existing Item was not changed.');
    }
    return verifyReusableItem(
      claimed[0],
      importArtifact,
      result.sourceIdentity.sourceId,
      result.sourceIdentity.sourceHash,
      result.artifactHash,
      result.target,
    );
  }

  const occupied = findItemById(collection, documentId);
  if (occupied) {
    throw new Error(`The deterministic Forge Item ID ${documentId} is occupied by another world Item. Existing Item was not changed.`);
  }

  const createDocument = collection.documentClass?.create;
  if (typeof createDocument !== 'function') throw new Error('Foundry Item documentClass.create() is unavailable.');
  let created: ForgeItemLike | undefined;
  let cleanupRequired = true;
  try {
    try {
      created = await createDocument.call(collection.documentClass, importArtifact, { renderSheet: false, keepId: true });
    } catch (error) {
      const concurrent = findItemById(collection, documentId);
      const concurrentIdentity = concurrent && readForgeItemIdentity(concurrent);
      if (
        concurrent
        && concurrentIdentity?.sourceId === result.sourceIdentity.sourceId
        && concurrentIdentity.artifactHash === result.artifactHash
      ) {
        return verifyReusableItem(
          concurrent,
          importArtifact,
          result.sourceIdentity.sourceId,
          result.sourceIdentity.sourceHash,
          result.artifactHash,
          result.target,
        );
      }
      if (concurrentIdentity?.sourceId === result.sourceIdentity.sourceId) {
        throw new Error('A concurrent Forge Item operation claimed the same source ID with a different artifact hash. Existing Item was not changed.', { cause: error });
      }
      throw error;
    }
    if (!created) throw new Error('Foundry did not return the created Item document.');
    if (created.id !== documentId) {
      throw new Error('Foundry did not preserve the deterministic Forge Item ID during creation.');
    }
    assertItemReadback(
      importArtifact,
      created.toObject(),
      identity,
      true,
    );
    cleanupRequired = false;
    return {
      status: 'created',
      item: created,
      uuid: requireItemUuid(created),
      sourceId: result.sourceIdentity.sourceId,
      artifactHash: result.artifactHash,
    };
  } finally {
    if (cleanupRequired && created) {
      try {
        await created.delete();
      } catch (error) {
        throw new ForgeTemporaryItemCleanupError(created.uuid ?? created.id ?? '[unknown Item]', error);
      }
    }
  }
}

export function forgeItemDocumentId(sourceId: ForgeItemSourceId): string {
  return hashArtifact({ sourceId }).slice(0, 16);
}

function prepareFoundryItemArtifact(
  artifact: JsonObject,
  identity: ForgeItemWorldIdentity,
  documentId: string,
): JsonObject {
  const copy = cloneJson(artifact) as JsonObject;
  const artifactId = typeof copy._id === 'string' ? copy._id : undefined;
  const relinked = artifactId ? replaceStringIdentity(copy, artifactId, documentId) as JsonObject : copy;
  relinked._id = documentId;
  relinked.flags = {
    ...asRecord(relinked.flags),
    [MODULE_ID]: cloneJson(identity) as JsonObject,
  };
  return relinked;
}

function verifyReusableItem(
  item: ForgeItemLike,
  expectedArtifact: JsonObject,
  sourceId: ForgeItemSourceId,
  sourceHash: Sha256,
  artifactHash: Sha256,
  target: ForgeItemWorldIdentity['target'],
): ForgeItemCreateResult {
  try {
    assertItemReadback(expectedArtifact, item.toObject(), {
      protocolVersion: 1,
      requestId: '',
      sourceId,
      sourceHash,
      artifactHash,
      target,
    }, false);
  } catch (cause) {
    throw new Error('Existing Forge Item failed readback verification and was not changed.', { cause });
  }
  return { status: 'existing', item, uuid: requireItemUuid(item), sourceId, artifactHash };
}

function assertItemReadback(
  expectedArtifact: JsonObject,
  readback: unknown,
  identity: ForgeItemWorldIdentity,
  requireRequestId: boolean,
): void {
  const expectedSummary = projectForgeItemDocument(expectedArtifact);
  let actualSummary;
  try {
    actualSummary = projectForgeItemDocument(readback);
  } catch (cause) {
    throw new Error('Foundry Item readback cannot be projected to the source-related Item summary.', { cause });
  }
  if (stableJson(actualSummary) !== stableJson(expectedSummary)) {
    throw new Error(`Foundry Item readback does not match generated semantics at ${firstDifferencePath(actualSummary, expectedSummary) ?? 'unknown'}.`);
  }
  const actualIdentity = readForgeItemIdentity(readback);
  if (
    actualIdentity?.protocolVersion !== identity.protocolVersion
    || (requireRequestId ? actualIdentity.requestId !== identity.requestId : !actualIdentity.requestId)
    || actualIdentity.sourceId !== identity.sourceId
    || actualIdentity.sourceHash !== identity.sourceHash
    || actualIdentity.artifactHash !== identity.artifactHash
    || stableJson(actualIdentity.target) !== stableJson(identity.target)
  ) {
    throw new Error('Foundry Item readback does not preserve complete Forge identity and target flags.');
  }
}

function findItemsBySourceId(collection: ForgeItemCollectionLike, sourceId: ForgeItemSourceId): ForgeItemLike[] {
  return itemContents(collection).filter((item) => readForgeItemIdentity(item)?.sourceId === sourceId);
}

function findItemById(collection: ForgeItemCollectionLike, id: string): ForgeItemLike | undefined {
  return collection.get?.(id) ?? itemContents(collection).find((item) => item.id === id);
}

function itemContents(collection: ForgeItemCollectionLike): ForgeItemLike[] {
  return collection.contents ?? (collection.values ? [...collection.values()] : []);
}

function readForgeItemIdentity(value: unknown): Partial<ForgeItemWorldIdentity> | undefined {
  const identity = asRecord(asRecord(asRecord(value).flags)[MODULE_ID]);
  if (!identity.sourceId && !identity.sourceHash && !identity.artifactHash) return undefined;
  return {
    ...(typeof identity.protocolVersion === 'number' ? { protocolVersion: identity.protocolVersion as 1 } : {}),
    ...(typeof identity.requestId === 'string' ? { requestId: identity.requestId } : {}),
    ...(typeof identity.sourceId === 'string' ? { sourceId: identity.sourceId as ForgeItemSourceId } : {}),
    ...(typeof identity.sourceHash === 'string' ? { sourceHash: identity.sourceHash as Sha256 } : {}),
    ...(typeof identity.artifactHash === 'string' ? { artifactHash: identity.artifactHash as Sha256 } : {}),
    ...(identity.target && typeof identity.target === 'object' ? { target: identity.target as ForgeItemWorldIdentity['target'] } : {}),
  };
}

function replaceStringIdentity(value: JsonValue, from: string, to: string): JsonValue {
  if (typeof value === 'string') return value.replaceAll(from, to);
  if (Array.isArray(value)) return value.map((entry) => replaceStringIdentity(entry, from, to));
  if (!value || typeof value !== 'object') return value;
  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    const nextKey = key === from ? to : key;
    if (Object.prototype.hasOwnProperty.call(output, nextKey)) throw new Error(`Forge Item root identity replacement collided at ${nextKey}.`);
    output[nextKey] = replaceStringIdentity(entry, from, to);
  }
  return output;
}

function cloneJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!value || typeof value !== 'object') throw new TypeError('Forge Item world data must be JSON.');
  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) output[key] = cloneJson(entry);
  return output;
}

function requireItemUuid(item: ForgeItemLike): string {
  const uuid = item.uuid ?? item.id;
  if (!uuid) throw new Error('Foundry Item did not expose a UUID after creation.');
  return uuid;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function firstDifferencePath(actual: unknown, expected: unknown, path = '$'): string | undefined {
  if (stableJson(actual) === stableJson(expected)) return undefined;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(actual.length, expected.length);
    for (let index = 0; index < length; index += 1) {
      const difference = firstDifferencePath(actual[index], expected[index], `${path}/${index}`);
      if (difference) return difference;
    }
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(actual as object)]);
    for (const key of [...keys].sort()) {
      const difference = firstDifferencePath((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}/${key}`);
      if (difference) return difference;
    }
  }
  return path;
}

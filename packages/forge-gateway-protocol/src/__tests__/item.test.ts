import { describe, expect, test } from 'bun:test';
import {
  attachForgeItemSourceId,
  decodeForgeCapability,
  decodeForgeItemRequest,
  decodeForgeItemResponse,
  decodeForgeItemSourceCreateRequest,
  decodeForgeItemSourceCreateResult,
  hashArtifact,
  hashSource,
  isForgeItemSourceId,
  isForgeSourceId,
  readForgeItemSourceId,
  readForgeSourceId,
  type ForgeItemSourceId,
} from '..';

const ITEM_SOURCE_ID = 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId;
const ACTOR_SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000';
const FINAL_SOURCE = `---\nforge-source-id: ${ITEM_SOURCE_ID}\n名称: Test Item\n---\nBody`;

function itemRequest(content = FINAL_SOURCE): Record<string, unknown> {
  return {
    protocolVersion: 1,
    capabilityId: 'item.standard.generate.v1',
    requestId: 'item-request-1',
    source: {
      displayName: 'Test Item',
      content,
      sourceId: ITEM_SOURCE_ID,
      utf8Sha256: hashSource(content),
    },
    foundryRuntime: { fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
    resolvedTarget: { generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
  };
}

const SAFE_ITEM_VERIFICATION = {
  name: 'Test Item',
  type: 'equipment',
  activation: '',
  activityTypes: [],
  activities: [],
  effects: [],
};

const SAFE_ITEM_DOCUMENT = {
  name: 'Test Item',
  type: 'equipment',
  description: { value: 'Shield description.', chat: '' },
  rarity: 'rare',
  attunement: 'required',
  armor: { value: 2, dex: null, magicalBonus: 1 },
  itemType: { value: 'shield', baseItem: 'shield' },
  properties: ['mgc'],
  weight: { value: 6, units: 'lb' },
  uses: { spent: 0, max: '', recovery: [] },
  activities: [{
    id: 'activity-1',
    name: 'Test Activity',
    type: 'utility',
    description: { chatFlavor: 'Activity description.' },
    effectIds: [],
  }],
  effects: [],
};

function itemResultBase() {
  return {
    sourceIdentity: { sourceId: ITEM_SOURCE_ID, sourceHash: hashSource(FINAL_SOURCE) },
    target: {
      fvttRuntimeVersion: '14.364',
      generatorProfile: 'v14',
      generatorVersion: '0.1.0',
      systemId: 'dnd5e',
      systemVersionObserved: '5.3.3',
      effectProfile: 'core',
      iconMode: 'off',
    },
    diagnostics: [],
    verification: { status: 'accepted', mechanicsCoverage: [] },
    itemVerification: SAFE_ITEM_VERIFICATION,
    itemDocument: SAFE_ITEM_DOCUMENT,
  };
}

describe('Forge Item v1 protocol', () => {
  test('keeps Actor and Item source identities type-separated', () => {
    expect(isForgeItemSourceId(ITEM_SOURCE_ID)).toBe(true);
    expect(isForgeSourceId(ITEM_SOURCE_ID)).toBe(false);
    expect(isForgeItemSourceId(ACTOR_SOURCE_ID)).toBe(false);
    expect(isForgeSourceId(ACTOR_SOURCE_ID)).toBe(true);
    expect(readForgeItemSourceId(FINAL_SOURCE)).toEqual({ status: 'valid', sourceId: ITEM_SOURCE_ID });
    expect(readForgeSourceId(FINAL_SOURCE).status).toBe('invalid');
  });

  test('attaches one Item identity while rejecting invalid, duplicate, Actor-prefixed, and replacement IDs', () => {
    const source = '---\n名称: Test\n---\nBody';
    const attached = attachForgeItemSourceId(source, ITEM_SOURCE_ID);
    expect(attached.changed).toBe(true);
    expect(attached.sourceHash).toBe(hashSource(attached.content));
    expect(attachForgeItemSourceId(attached.content, ITEM_SOURCE_ID).changed).toBe(false);
    expect(() => attachForgeItemSourceId(attached.content, 'item:v1:223e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId)).toThrow(/replace/u);
    expect(() => attachForgeItemSourceId(`---\nforge-source-id: ${ACTOR_SOURCE_ID}\n---\nBody`)).toThrow(/invalid/u);
    expect(() => attachForgeItemSourceId(`---\nforge-source-id: ${ITEM_SOURCE_ID}\nforge-source-id: ${ITEM_SOURCE_ID}\n---\nBody`)).toThrow(/invalid/u);
  });

  test('decodes Item capabilities without changing the Actor capability shapes', () => {
    expect(decodeForgeCapability({
      id: 'item.standard.generate.v1',
      systemId: 'dnd5e',
      generatorProfiles: ['v12', 'v14'],
      versionRouting: [
        { fvttVersion: '12.x', generatorProfile: 'v12' },
        { fvttVersion: '13.x', generatorProfile: 'v12' },
        { fvttVersion: '14.x', generatorProfile: 'v14' },
      ],
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
    }).ok).toBe(true);
    expect(decodeForgeCapability({
      id: 'source.item.create.v1',
      sourceKind: 'item',
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
    }).ok).toBe(true);
    expect(decodeForgeCapability({
      id: 'source.item.create.v1',
      sourceKind: 'actor',
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
    }).ok).toBe(false);
  });

  test('binds Item request identity and hash to the exact final source', () => {
    expect(decodeForgeItemRequest(itemRequest()).ok).toBe(true);
    expect(decodeForgeItemRequest({ ...itemRequest(), unexpected: true }).ok).toBe(false);
    expect(decodeForgeItemRequest({
      ...itemRequest(),
      source: { ...(itemRequest().source as object), sourceId: ACTOR_SOURCE_ID },
    }).ok).toBe(false);
    expect(decodeForgeItemRequest({
      ...itemRequest(),
      source: { ...(itemRequest().source as object), utf8Sha256: '0'.repeat(64) },
    }).ok).toBe(false);
  });

  test('accepts 200000 final UTF-8 bytes and rejects 200001 before hash or identity work', () => {
    const exact = boundarySource(200_000);
    expect(decodeForgeItemRequest(itemRequest(exact)).ok).toBe(true);
    const oversized = boundarySource(200_001).replace(ITEM_SOURCE_ID, ACTOR_SOURCE_ID);
    const request = itemRequest(oversized);
    (request.source as Record<string, unknown>).utf8Sha256 = '0'.repeat(64);
    const decoded = decodeForgeItemRequest(request);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error('Expected oversized Item source rejection.');
    expect(decoded.issues.map((entry) => entry.code)).toContain('INPUT_TOO_LARGE');
    expect(decoded.issues.map((entry) => entry.code)).not.toContain('SOURCE_HASH_MISMATCH');
    expect(decoded.issues.map((entry) => entry.code)).not.toContain('SOURCE_IDENTITY_MISMATCH');
  });

  test('keeps source.item.create request and result strictly type-separated', () => {
    const source = '---\n名称: Test\n---\nBody';
    const request = {
      protocolVersion: 1,
      capabilityId: 'source.item.create.v1',
      requestId: 'source-item-1',
      source: { displayName: 'Test', content: source, utf8Sha256: hashSource(source) },
    };
    expect(decodeForgeItemSourceCreateRequest(request).ok).toBe(true);
    expect(decodeForgeItemSourceCreateRequest({ ...request, sourcePath: 'C:\\secret.md' }).ok).toBe(false);
    expect(decodeForgeItemSourceCreateResult({
      sourceRef: 'source:v1:YWJj',
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Test',
      sourceHash: hashSource(source),
    }).ok).toBe(true);
    expect(decodeForgeItemSourceCreateResult({
      sourceRef: 'source:v1:YWJj',
      sourceId: ACTOR_SOURCE_ID,
      displayName: 'Test',
      sourceHash: hashSource(source),
    }).ok).toBe(false);
  });

  test('enforces the Item accepted/needs_review/failed union and closed nested projections', () => {
    const artifact = { name: 'Test Item' };
    const accepted = {
      ...itemResultBase(),
      status: 'accepted',
      artifact,
      artifactHash: hashArtifact(artifact),
    };
    expect(decodeForgeItemResponse({ protocolVersion: 1, requestId: 'item-request-1', result: accepted }).ok).toBe(true);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: { ...accepted, itemDocument: { ...SAFE_ITEM_DOCUMENT, localCache: 'C:\\secret' } },
    }).ok).toBe(false);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: { ...accepted, itemDocument: { ...SAFE_ITEM_DOCUMENT, armor: { ...SAFE_ITEM_DOCUMENT.armor, secret: 1 } } },
    }).ok).toBe(false);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: {
        ...accepted,
        itemDocument: {
          ...SAFE_ITEM_DOCUMENT,
          description: { ...SAFE_ITEM_DOCUMENT.description, cachePath: 'C:\\secret' },
        },
      },
    }).ok).toBe(false);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: {
        ...accepted,
        itemDocument: {
          ...SAFE_ITEM_DOCUMENT,
          activities: [{
            ...SAFE_ITEM_DOCUMENT.activities[0],
            description: { ...SAFE_ITEM_DOCUMENT.activities[0]!.description, internal: true },
          }],
        },
      },
    }).ok).toBe(false);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: {
        ...itemResultBase(),
        status: 'needs_review',
        verification: { status: 'needs_review', mechanicsCoverage: [] },
        diagnostics: [{ code: 'REVIEW', severity: 'warning', stage: 'semantic', path: 'item', message: 'Review required.' }],
      },
    }).ok).toBe(true);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: {
        ...itemResultBase(),
        status: 'failed',
        verification: { status: 'failed', mechanicsCoverage: [] },
        diagnostics: [{ code: 'FAILED', severity: 'error', stage: 'semantic', path: 'item', message: 'Failed.' }],
      },
    }).ok).toBe(true);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: { ...accepted, diagnostics: [{ code: 'WARN', severity: 'warning', stage: 'semantic', path: 'item', message: 'Warning.' }] },
    }).ok).toBe(false);
    expect(decodeForgeItemResponse({
      protocolVersion: 1,
      requestId: 'item-request-1',
      result: {
        ...itemResultBase(),
        status: 'needs_review',
        artifactHash: hashArtifact(artifact),
        verification: { status: 'needs_review', mechanicsCoverage: [] },
        diagnostics: [{ code: 'REVIEW', severity: 'warning', stage: 'semantic', path: 'item', message: 'Review required.' }],
      },
    }).ok).toBe(false);
  });
});

function boundarySource(byteLength: number): string {
  const prefix = `---\nforge-source-id: ${ITEM_SOURCE_ID}\n名称: Boundary\n---\n`;
  const remaining = byteLength - new TextEncoder().encode(prefix).byteLength;
  if (remaining < 0) throw new Error('Boundary prefix exceeds requested size.');
  return prefix + '中'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
}

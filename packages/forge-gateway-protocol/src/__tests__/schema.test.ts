import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  decodeForgeActorRequest,
  decodeForgeActorResponse,
  decodeForgeCapability,
  decodeForgeError,
  decodeForgeHealth,
  decodeForgeSourceCreateRequest,
  decodeForgeSourceCreateResult,
  FORGE_INPUT_ISSUE_TO_ERROR_CODE,
  hashArtifact,
  mapForgeInputIssueToErrorCode,
  projectForgeVerification,
  type ForgeSourceId,
} from '..';

const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId;
const CONTENT = '---\nname: Test\n---\nBody';
const ACTOR_CONTENT = `---\nforge-source-id: ${SOURCE_ID}\nname: Test\n---\nBody`;
const TARGET = {
  generatorProfile: 'v12' as const,
  effectProfile: 'core' as const,
  iconMode: 'off' as const,
};
const SAFE_VERIFICATION = { status: 'accepted' as const, mechanicsCoverage: [] };
const SAFE_ACTOR_VERIFICATION = {
  actor: { name: 'Test Actor', type: 'npc', senses: {} },
  items: [],
  warnings: [],
};
const WARNING_DIAGNOSTIC = {
  code: 'NEEDS_REVIEW',
  severity: 'warning' as const,
  stage: 'semantic' as const,
  path: 'actor',
  message: 'Manual review is required.',
};
const ERROR_DIAGNOSTIC = {
  code: 'WORKFLOW_FAILED',
  severity: 'error' as const,
  stage: 'semantic' as const,
  path: 'actor',
  message: 'Workflow failed.',
};

function actorRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocolVersion: 1,
    capabilityId: 'actor.standard.generate.v1',
     requestId: 'request-1',
     source: {
       displayName: 'Test Actor',
       content: ACTOR_CONTENT,
       sourceId: SOURCE_ID,
       utf8Sha256: sha256(ACTOR_CONTENT),
    },
    foundryRuntime: {
      fvttVersion: '13.340',
      systemId: 'dnd5e',
      systemVersion: '4.3.9',
    },
    resolvedTarget: TARGET,
    ...overrides,
  };
}

describe('Forge protocol schemas', () => {
  test('accepts a valid Actor request and verifies its source hash and route', () => {
    const decoded = decodeForgeActorRequest(actorRequest());
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Expected Actor request to decode.');
    expect(decoded.value.source.sourceId).toBe(SOURCE_ID);
  });

  test('keeps an unverified dnd5e version as a warning instead of changing the route', () => {
    const decoded = decodeForgeActorRequest(actorRequest({
      foundryRuntime: {
        fvttVersion: '13.340',
        systemId: 'dnd5e',
        systemVersion: '5.3.3',
      },
    }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Expected Actor request to decode.');
    expect(decoded.value.resolvedTarget.generatorProfile).toBe('v12');
    expect(decoded.warnings?.[0]).toMatchObject({ code: 'FORGE_SYSTEM_VERSION_UNVERIFIED' });
  });

  test('rejects unknown keys, mismatched hashes, and a forged FVTT 13 profile', () => {
    expect(decodeForgeActorRequest(actorRequest({ unexpected: true })).ok).toBe(false);
    expect(decodeForgeActorRequest(actorRequest({
      source: { ...actorRequest().source as Record<string, unknown>, utf8Sha256: '0'.repeat(64) },
    })).ok).toBe(false);
    expect(decodeForgeActorRequest(actorRequest({
      resolvedTarget: { ...TARGET, generatorProfile: 'v14' },
    })).ok).toBe(false);
    expect(decodeForgeActorRequest(actorRequest({ capabilityId: 'unknown.v1' })).ok).toBe(false);
    expect(decodeForgeActorRequest(actorRequest({
      foundryRuntime: { fvttVersion: 'not-a-version', systemId: 'dnd5e', systemVersion: '4.3.9' },
    })).ok).toBe(false);
  });

  test('binds the request source ID to the final Markdown frontmatter', () => {
    const source = actorRequest().source as Record<string, unknown>;
    const otherSourceId = 'actor:v1:123e4567-e89b-42d3-a456-426614174001';
    const mismatchedContent = ACTOR_CONTENT.replace(SOURCE_ID, otherSourceId);
    expect(decodeForgeActorRequest(actorRequest({
      source: { ...source, content: mismatchedContent, utf8Sha256: sha256(mismatchedContent) },
    })).ok).toBe(false);
    expect(decodeForgeActorRequest(actorRequest({
      source: { ...source, content: CONTENT, utf8Sha256: sha256(CONTENT) },
    })).ok).toBe(false);
  });

  test('accepts and rejects source creation only at the managed-source boundary', () => {
    const valid = {
      protocolVersion: 1,
      capabilityId: 'source.actor.create.v1',
      requestId: 'request-source-1',
      source: { displayName: 'Test Actor', content: CONTENT, utf8Sha256: sha256(CONTENT) },
    };
    expect(decodeForgeSourceCreateRequest(valid).ok).toBe(true);
    expect(decodeForgeSourceCreateRequest({ ...valid, sourcePath: 'C:\\actor.md' }).ok).toBe(false);

    const result = decodeForgeSourceCreateResult({
      sourceRef: 'source:v1:YWJj',
      sourceId: SOURCE_ID,
      displayName: 'Test Actor',
      sourceHash: sha256(CONTENT),
    });
    expect(result.ok).toBe(true);
  });

  test('applies the shared empty and UTF-8 byte input policy before hashing', () => {
    const sourceCreate = (content: string) => ({
      protocolVersion: 1,
      capabilityId: 'source.actor.create.v1',
      requestId: 'request-source-policy',
      source: { displayName: 'Test Actor', content, utf8Sha256: sha256(content) },
    });
    const empty = decodeForgeSourceCreateRequest(sourceCreate(' \n\t '));
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error('Expected whitespace-only source content to be rejected.');
    expect(empty.issues.map((issue) => issue.code)).toContain('INPUT_EMPTY');
    expect(mapForgeInputIssueToErrorCode({ code: 'INPUT_EMPTY' })).toBe(FORGE_INPUT_ISSUE_TO_ERROR_CODE.INPUT_EMPTY);

    const exact = '中'.repeat(66_666) + 'aa';
    expect(new TextEncoder().encode(exact).byteLength).toBe(200_000);
    expect(decodeForgeSourceCreateRequest(sourceCreate(exact)).ok).toBe(true);
    expect(mapForgeInputIssueToErrorCode({ code: 'INPUT_TOO_LARGE' })).toBe(FORGE_INPUT_ISSUE_TO_ERROR_CODE.INPUT_TOO_LARGE);

    const tooLarge = '中'.repeat(66_667);
    expect(new TextEncoder().encode(tooLarge).byteLength).toBe(200_001);
    const rejected = decodeForgeSourceCreateRequest(sourceCreate(tooLarge));
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('Expected an over-limit source to be rejected.');
    expect(rejected.issues.map((issue) => issue.code)).toContain('INPUT_TOO_LARGE');
    expect(rejected.issues.map((issue) => issue.code)).not.toContain('SOURCE_HASH_MISMATCH');
  });

  test('applies the same byte limit to Actor requests at the exact boundary', () => {
    const source = actorRequest().source as Record<string, unknown>;
    const encoder = new TextEncoder();
    const padToBytes = (prefix: string, bytes: number): string => {
      const current = encoder.encode(prefix).byteLength;
      if (current > bytes) throw new Error('Test prefix is larger than its requested boundary.');
      return prefix + 'a'.repeat(bytes - current);
    };
    const exactContent = padToBytes(ACTOR_CONTENT, 200_000);
    const exact = decodeForgeActorRequest(actorRequest({
      source: { ...source, content: exactContent, utf8Sha256: sha256(exactContent) },
    }));
    expect(exact.ok).toBe(true);

    const tooLargeContent = padToBytes(ACTOR_CONTENT, 200_001);
    const tooLarge = decodeForgeActorRequest(actorRequest({
      source: { ...source, content: tooLargeContent, utf8Sha256: sha256(tooLargeContent) },
    }));
    expect(tooLarge.ok).toBe(false);
    if (tooLarge.ok) throw new Error('Expected an over-limit Actor source to be rejected.');
    expect(tooLarge.issues.map((issue) => issue.code)).toContain('INPUT_TOO_LARGE');
  });

  test('projects workflow verification without copying path-like internal fields', () => {
    const projection = projectForgeVerification({
      verification: {
        status: 'accepted',
        mechanicsCoverage: [{
          mechanicId: 'attack-1',
          kind: 'attack',
          sourcePath: 'C:\\repo\\source.md:actions/0',
          status: 'projected',
          outputPaths: ['documents/0/system/activities/0'],
          target: { reference: { localCache: 'C:\\cache' } },
        }],
        sourcePath: 'C:\\repo\\source.md',
      },
      actorVerification: {
        actor: { name: 'Test Actor', type: 'npc', senses: {}, actorPath: 'C:\\actor.json' },
        items: [],
        warnings: [],
        localCache: 'C:\\cache',
      },
    });

    expect(projection.verification.mechanicsCoverage[0]?.sourceField).toBe('actor.actions');
    expect(JSON.stringify(projection)).not.toMatch(/sourcePath|actorPath|localCache|reference|C:\\/u);
  });

  test('projects workflow-supported empty creature types and heal activities', () => {
    const projection = projectForgeVerification({
      verification: SAFE_VERIFICATION,
      actorVerification: {
        actor: { name: 'Test Actor', type: 'npc', creatureType: '', senses: {} },
        items: [{
          name: 'Healing Rider',
          type: 'feat',
          activation: '',
          activityTypes: ['heal'],
          activities: [{ type: 'heal' }],
          effects: [],
        }],
        warnings: [],
      },
    });

    expect(projection.actorVerification.actor.creatureType).toBe('');
    expect(projection.actorVerification.items[0]?.activityTypes).toEqual(['heal']);
    expect(projection.actorVerification.items[0]?.activities).toEqual([{ type: 'heal' }]);
  });

  test('rejects sparse arrays at the projection boundary', () => {
    const sparseMechanics: unknown[] = [];
    sparseMechanics.length = 1;

    expect(() => projectForgeVerification({
      verification: { status: 'accepted', mechanicsCoverage: sparseMechanics },
      actorVerification: SAFE_ACTOR_VERIFICATION,
    })).toThrow(/dense array/u);
  });

  test('enforces accepted/needs_review/failed result semantics', () => {
    const base = {
      sourceIdentity: { sourceId: SOURCE_ID, sourceHash: sha256(CONTENT) },
      target: {
        fvttRuntimeVersion: '13.340',
        generatorProfile: 'v12',
        generatorVersion: '0.1.0',
        systemId: 'dnd5e',
        systemVersionObserved: '4.3.9',
        effectProfile: 'core',
        iconMode: 'off',
      },
      diagnostics: [],
      verification: SAFE_VERIFICATION,
      actorVerification: SAFE_ACTOR_VERIFICATION,
    };
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(true);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [WARNING_DIAGNOSTIC],
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      status: 'needs_review',
      artifact: { name: 'Test Actor' },
    } }).ok).toBe(true);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [ERROR_DIAGNOSTIC],
      verification: { status: 'failed', mechanicsCoverage: [] },
      status: 'failed',
    } }).ok).toBe(true);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [ERROR_DIAGNOSTIC],
      verification: { status: 'failed', mechanicsCoverage: [] },
      status: 'failed',
      artifact: { name: 'must-not-write' },
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      status: 'accepted',
      artifact: { name: 'Test Actor' },
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      status: 'needs_review',
      artifact: { name: 'Test Actor' },
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [ERROR_DIAGNOSTIC],
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      status: 'needs_review',
      artifact: { name: 'Test Actor' },
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      status: 'failed',
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      artifact: { name: 'changed' },
      status: 'accepted',
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [WARNING_DIAGNOSTIC],
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      actorVerification: { ...SAFE_ACTOR_VERIFICATION, warnings: ['review'] },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      verification: { status: 'failed', mechanicsCoverage: [] },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      verification: { ...SAFE_VERIFICATION, sourcePath: 'C:\\secret' },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      actorVerification: { ...SAFE_ACTOR_VERIFICATION, actorPath: 'C:\\secret' },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    const safeMechanic = {
      mechanicId: 'attack-1',
      kind: 'attack',
      sourceField: 'actor.actions',
      status: 'projected',
      outputPaths: ['documents/0/system/activities/0'],
    };
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      verification: { status: 'accepted', mechanicsCoverage: [{ ...safeMechanic, outputPaths: ['/tmp/secret'] }] },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      verification: { status: 'accepted', mechanicsCoverage: [{ ...safeMechanic, outputPaths: ['documents/../secret'] }] },
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(false);
  });

  test('validates health and the closed error-code union', () => {
    expect(decodeForgeHealth({
      protocolVersion: 1,
      service: 'foundry-forge-gateway',
      serviceVersion: '0.1.0',
      instanceId: 'instance-1',
      deployment: 'local-companion',
      status: 'idle',
    }).ok).toBe(true);
    expect(decodeForgeHealth({
      protocolVersion: 1,
      service: 'foundry-forge-gateway',
      serviceVersion: '0.1.0',
      instanceId: 'instance-1',
      deployment: 'local-companion',
      status: 'idle',
      path: 'C:\\secret',
    }).ok).toBe(false);
    expect(decodeForgeHealth({
      protocolVersion: 2,
      service: 'foundry-forge-gateway',
      serviceVersion: '0.1.0',
      instanceId: 'instance-1',
      deployment: 'local-companion',
      status: 'idle',
    }).ok).toBe(false);
    expect(decodeForgeError({ code: 'FORGE_TARGET_UNSUPPORTED', message: 'Unsupported target', retryable: false }).ok).toBe(true);
    expect(decodeForgeError({ code: 'JOB_FAILED', message: 'too generic', retryable: false }).ok).toBe(false);
    const sparseDetails: unknown[] = [];
    sparseDetails.length = 1;
    expect(decodeForgeError({
      code: 'FORGE_TARGET_UNSUPPORTED',
      message: 'Unsupported target',
      retryable: false,
      details: { sparseDetails },
    }).ok).toBe(false);
  });

  test('decodes the closed capability descriptors and rejects unknown capability fields', () => {
    expect(decodeForgeCapability({
      id: 'actor.standard.generate.v1',
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
      id: 'source.actor.create.v1',
      sourceKind: 'actor',
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
    }).ok).toBe(true);
    expect(decodeForgeCapability({
      id: 'source.actor.create.v1',
      sourceKind: 'actor',
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
      root: 'C:\\managed',
    }).ok).toBe(false);
    expect(decodeForgeCapability({
      id: 'actor.standard.generate.v1',
      systemId: 'dnd5e',
      generatorProfiles: ['v12', 'v14'],
      versionRouting: [
        { fvttVersion: '12.x', generatorProfile: 'v12' },
        { fvttVersion: '13.x', generatorProfile: 'v14' },
        { fvttVersion: '14.x', generatorProfile: 'v14' },
      ],
      maxInputUtf8Bytes: 200_000,
      maxConcurrentJobs: 1,
    }).ok).toBe(false);
  });
});

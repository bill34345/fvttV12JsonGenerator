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
  hashArtifact,
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
      verification: { status: 'accepted' },
      actorVerification: { warnings: [] },
    };
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      status: 'accepted',
      artifact: { name: 'Test Actor' },
      artifactHash: hashArtifact({ name: 'Test Actor' }),
    } }).ok).toBe(true);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      status: 'needs_review',
      artifact: { name: 'Test Actor' },
    } }).ok).toBe(true);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
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
      status: 'needs_review',
      verification: { unsupported: undefined },
    } }).ok).toBe(false);
    expect(decodeForgeActorResponse({ protocolVersion: 1, requestId: 'request-1', result: {
      ...base,
      diagnostics: [{
        code: 'INVALID',
        severity: 'warning',
        stage: 'semantic',
        path: '$',
        message: 'negative span',
        evidence: [{ start: -1, end: 0, quote: 'x' }],
      }],
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

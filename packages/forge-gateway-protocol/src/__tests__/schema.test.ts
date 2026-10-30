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
  hashSource,
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

  test('preserves Actor content above the legacy source-creation byte limit', () => {
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
    expect(tooLarge.ok).toBe(true);
    if (!tooLarge.ok) throw new Error('Expected the complete Actor source to remain available.');
    expect(tooLarge.value.source.content).toBe(tooLargeContent);
    expect(tooLarge.value.source.utf8Sha256).toBe(hashSource(tooLargeContent));
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
    const decode = (result: Record<string, unknown>) => decodeForgeActorResponse({
      protocolVersion: 1, requestId: 'request-1', result: { ...base, ...result },
    });
    const artifact = { name: 'Test Actor' };
    const accepted = decode({ status: 'accepted', artifact });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok || !('result' in accepted.value)) throw new Error('Expected an Actor result.');
    expect(accepted.value.result).toMatchObject({ status: 'accepted', artifact, artifactHash: hashArtifact(artifact) });
    expect(decode({ status: 'accepted', artifact, artifactHash: hashArtifact(artifact) }).ok).toBe(true);

    for (const status of ['needs_review', 'failed'] as const) {
      const diagnostic = status === 'failed' ? ERROR_DIAGNOSTIC : WARNING_DIAGNOSTIC;
      const decoded = decode({ status, diagnostics: [diagnostic], verification: { status, mechanicsCoverage: [] }, artifact });
      expect(decoded.ok).toBe(true);
      if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected a retained candidate.');
      expect(decoded.value.result).toMatchObject({ status, artifact, artifactHash: hashArtifact(artifact), diagnostics: [diagnostic] });
    }
    for (const diagnostics of [[], [ERROR_DIAGNOSTIC]]) {
      const decoded = decode({ status: 'needs_review', verification: { status: 'needs_review', mechanicsCoverage: [] }, artifact, diagnostics });
      expect(decoded.ok).toBe(true);
      if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected the review candidate to remain available.');
      expect(decoded.value.result).toMatchObject({ status: 'needs_review', artifact, diagnostics });
    }
    const failedWithoutArtifact = decode({ status: 'failed', diagnostics: [ERROR_DIAGNOSTIC], verification: { status: 'failed', mechanicsCoverage: [] } });
    expect(failedWithoutArtifact.ok).toBe(true);
    if (!failedWithoutArtifact.ok || !('result' in failedWithoutArtifact.value)) throw new Error('Expected a failure report.');
    expect(failedWithoutArtifact.value.result).not.toHaveProperty('artifact');
    expect(decode({ status: 'failed' }).ok).toBe(false);
    expect(decode({ status: 'accepted' }).ok).toBe(false);

    for (const [override, code, expectedStatus] of [
      [{ diagnostics: [WARNING_DIAGNOSTIC] }, 'ACCEPTED_WITH_DIAGNOSTICS', 'needs_review'],
      [{ diagnostics: [ERROR_DIAGNOSTIC] }, 'ACCEPTED_WITH_DIAGNOSTICS', 'failed'],
      [{ actorVerification: { ...SAFE_ACTOR_VERIFICATION, warnings: ['review'] } }, 'ACCEPTED_WITH_WARNINGS', 'needs_review'],
      [{ verification: { status: 'failed', mechanicsCoverage: [] } }, 'STATUS_MISMATCH', 'needs_review'],
      [{ verification: { ...SAFE_VERIFICATION, sourcePath: 'C:\\secret' } }, 'UNKNOWN_FIELD', 'needs_review'],
      [{ actorVerification: { ...SAFE_ACTOR_VERIFICATION, actorPath: 'C:\\secret' } }, 'UNKNOWN_FIELD', 'needs_review'],
      [{ artifactHash: hashArtifact({ name: 'changed' }) }, 'ARTIFACT_HASH_MISMATCH', 'needs_review'],
    ] as const) {
      const decoded = decode({ status: 'accepted', artifact, ...override });
      expect(decoded.ok).toBe(true);
      if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected an ancillary report failure to retain the Actor.');
      const result = decoded.value.result;
      expect(result).toMatchObject({ status: expectedStatus, verification: { status: expectedStatus }, artifact, artifactHash: hashArtifact(artifact) });
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FORGE_REPORT_INCOMPLETE', message: expect.stringContaining(code) }));
      expect(JSON.stringify(result)).not.toMatch(/sourcePath|actorPath|C:\\/u);
    }
    for (const outputPath of ['/tmp/secret', 'documents/../secret']) {
      const decoded = decode({ status: 'accepted', artifact, verification: { status: 'accepted', mechanicsCoverage: [{
        mechanicId: 'attack-1', kind: 'attack', sourceField: 'actor.actions', status: 'projected', outputPaths: [outputPath],
      }] } });
      expect(decoded.ok).toBe(true);
      if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected the report to retain its candidate.');
      expect(decoded.value.result).toMatchObject({ status: 'needs_review', artifact });
      expect(decoded.value.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FORGE_REPORT_INCOMPLETE', message: expect.stringContaining('INVALID_OUTPUT_PATH') }));
      expect(JSON.stringify(decoded.value.result)).not.toContain(outputPath);
    }
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

  test('retains a usable failed Actor candidate without promoting its strict verdict', () => {
    const artifact = { name: 'Review candidate', type: 'npc', system: { attributes: { hp: { value: 12 } } },
      items: [{ name: 'Attack', type: 'feat', system: { activities: {} } }], effects: [] };
    const result = { sourceIdentity: { sourceId: SOURCE_ID, sourceHash: sha256(CONTENT) },
      target: { fvttRuntimeVersion: '14.364', generatorProfile: 'v14', generatorVersion: '0.1.0',
        systemId: 'dnd5e', systemVersionObserved: '5.3.3', effectProfile: 'core', iconMode: 'off' },
      status: 'failed', verification: { status: 'failed', mechanicsCoverage: [] },
      diagnostics: [ERROR_DIAGNOSTIC], actorVerification: SAFE_ACTOR_VERIFICATION, artifact };
    const response = { protocolVersion: 1, requestId: 'failed-candidate', result };
    const decoded = decodeForgeActorResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected candidate result.');
    expect(decoded.value.result).toMatchObject({ status: 'failed', artifact, diagnostics: [ERROR_DIAGNOSTIC], verification: { status: 'failed' } });
    expect(decoded.value.result.artifactHash).toBe(hashArtifact(artifact));
    for (const incomplete of [
      { ...artifact, system: null }, { ...artifact, items: ['unreadable'] }, { ...artifact, type: 'Item' },
      { ...artifact, system: JSON.parse('{"__proto__":{"polluted":true}}') },
    ]) {
      const retained = decodeForgeActorResponse({ ...response, result: { ...result, artifact: incomplete } });
      expect(retained.ok).toBe(true);
      if (!retained.ok || !('result' in retained.value)) throw new Error('Expected a readable candidate.');
      expect(retained.value.result).toMatchObject({ status: 'failed', artifact: incomplete });
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
    for (const invalid of [
      { ...artifact, system: { hp: Infinity } }, { ...artifact, effects: [undefined] },
      { ...artifact, system: Object.create({ inherited: true }) },
    ]) expect(decodeForgeActorResponse({ ...response, result: { ...result, artifact: invalid } }).ok).toBe(false);
    const falseAcceptance = decodeForgeActorResponse({ ...response, result: { ...result, status: 'accepted' } });
    expect(falseAcceptance.ok).toBe(true);
    if (!falseAcceptance.ok || !('result' in falseAcceptance.value)) throw new Error('Expected the candidate to remain available.');
    expect(falseAcceptance.value.result).toMatchObject({ status: 'failed', artifact });
    expect(falseAcceptance.value.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FORGE_REPORT_INCOMPLETE' }));
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

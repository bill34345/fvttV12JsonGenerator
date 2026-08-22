import { describe, expect, test } from 'bun:test';
import {
  decodeForgeActorResponse,
  decodeForgeError,
  hashArtifact,
  projectForgeDiagnostics,
  projectForgeVerification,
  type ForgeDiagnostic,
  type ForgeSourceId,
} from '..';

const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId;
const HASH = 'a'.repeat(64);

describe('Forge wire safety boundaries', () => {
  test('accepts only Foundry document-field output paths', () => {
    expect(() => projectForgeVerification({
      verification: verificationWithOutputPath('documents/0/system/activities/0'),
      actorVerification: actorVerification(),
    })).not.toThrow();
    expect(() => projectForgeVerification({
      verification: verificationWithOutputPath('private/cache/output.json'),
      actorVerification: actorVerification(),
    })).toThrow(/safe document field path/u);
    expect(() => projectForgeVerification({
      verification: verificationWithOutputPath('documents/0/packages/parser/src/yaml.ts'),
      actorVerification: actorVerification(),
    })).toThrow(/safe document field path/u);
    expect(() => projectForgeVerification({
      verification: verificationWithOutputPath('documents/0/system/packages/parser/src/yaml.ts'),
      actorVerification: actorVerification(),
    })).toThrow(/safe document field path/u);

    const decoded = decodeForgeActorResponse(response({
      verification: verificationWithOutputPath('private/cache/output.json'),
    }));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error('Expected a repository-relative output path to be rejected.');
    expect(decoded.issues.map((issue) => issue.code)).toContain('INVALID_OUTPUT_PATH');

    const prefixedBypass = decodeForgeActorResponse(response({
      verification: verificationWithOutputPath('documents/0/packages/parser/src/yaml.ts'),
    }));
    expect(prefixedBypass.ok).toBe(false);
    if (prefixedBypass.ok) throw new Error('Expected a prefixed repository path to be rejected.');
    expect(prefixedBypass.issues.map((issue) => issue.code)).toContain('INVALID_OUTPUT_PATH');
  });

  test.each(['literal-only', 'unsupported', 'missing', 'duplicate'] as const)(
    'does not decode accepted with %s mechanics coverage as applyable',
    (status) => {
      const decoded = decodeForgeActorResponse(response({
        verification: {
          status: 'accepted',
          mechanicsCoverage: [{
            mechanicId: 'attack-1',
            kind: 'attack',
            sourceField: 'actor.actions',
            status,
            outputPaths: [],
          }],
        },
      }));
      expect(decoded.ok).toBe(false);
      if (decoded.ok) throw new Error(`Expected accepted + ${status} coverage to be rejected.`);
      expect(decoded.issues.map((issue) => issue.code)).toContain('ACCEPTED_WITH_REVIEW_COVERAGE');
    },
  );

  test('does not accept projected mechanics without a projected output field', () => {
    const decoded = decodeForgeActorResponse(response({
      verification: {
        status: 'accepted',
        mechanicsCoverage: [{
          mechanicId: 'attack-1',
          kind: 'attack',
          sourceField: 'actor.actions',
          status: 'projected',
          outputPaths: [],
        }],
      },
    }));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error('Expected projected mechanics without output paths to be rejected.');
    expect(decoded.issues.map((issue) => issue.code)).toContain('ACCEPTED_WITH_REVIEW_COVERAGE');
  });

  test.each([
    { expressionCoverage: 'literal' },
    { expressionCoverage: 'missing' },
    { executionMode: 'gm-assisted' },
    { executionMode: 'external-rule' },
  ] as const)('does not accept review-only mechanic metadata: %o', (reviewMetadata) => {
    const decoded = decodeForgeActorResponse(response({
      verification: {
        status: 'accepted',
        mechanicsCoverage: [{
          mechanicId: 'behavior-1',
          kind: 'behavior-trigger',
          sourceField: 'actor.behaviors',
          status: 'projected',
          outputPaths: ['documents/0/flags/fvttJsonGenerator/behaviorMechanics/0'],
          ...reviewMetadata,
        }],
      },
    }));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error('Expected review-only mechanic metadata to be rejected.');
    expect(decoded.issues.map((issue) => issue.code)).toContain('ACCEPTED_WITH_REVIEW_COVERAGE');
  });

  test('projects and decodes only logical diagnostics without internal paths', () => {
    expect(projectForgeDiagnostics([safeWarning()])).toEqual([safeWarning()]);
    expect(() => projectForgeDiagnostics([{
      ...safeWarning(),
      path: 'actor/structuredActions/传奇动作/1/save',
    }])).not.toThrow();
    expect(() => projectForgeDiagnostics([{ ...safeWarning(), path: 'C:\\repo\\secret.md' }]))
      .toThrow(/closed Forge logical namespaces/u);
    const redactedLogicalPath = projectForgeDiagnostics([{
      ...safeWarning(),
      path: 'actor/OpenCode/fvttV12JsonGenerator-worktrees/private-output',
    }]);
    expect(redactedLogicalPath[0]?.path).toBe('actor');
    expect(JSON.stringify(redactedLogicalPath)).not.toMatch(/OpenCode|worktrees|private-output/u);
    expect(() => projectForgeDiagnostics([{ ...safeWarning(), message: 'Failed at packages/parser/src/yaml.ts' }]))
      .toThrow(/unsafe internal path text/u);
    expect(() => projectForgeDiagnostics([{ ...safeWarning(), message: 'Failed at custom/private/secret.txt' }]))
      .toThrow(/unsafe internal path text/u);

    const unsafePath = decodeForgeActorResponse(response({
      status: 'needs_review',
      diagnostics: [{ ...safeWarning(), path: 'repo/private/output.json' }],
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      artifactHash: undefined,
    }));
    expect(unsafePath.ok).toBe(false);
    if (unsafePath.ok) throw new Error('Expected an internal diagnostic path to be rejected.');
    expect(unsafePath.issues.map((issue) => issue.code)).toContain('UNSAFE_DIAGNOSTIC_PATH');

    const unsafeMessage = decodeForgeActorResponse(response({
      status: 'needs_review',
      diagnostics: [{ ...safeWarning(), message: 'Failed at C:\\repo\\secret.md' }],
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      artifactHash: undefined,
    }));
    expect(unsafeMessage.ok).toBe(false);
    if (unsafeMessage.ok) throw new Error('Expected an internal path in a diagnostic message to be rejected.');
    expect(unsafeMessage.issues.map((issue) => issue.code)).toContain('UNSAFE_DIAGNOSTIC_MESSAGE');
  });

  test('keeps Gateway errors closed and rejects path-bearing messages', () => {
    expect(decodeForgeError({
      code: 'FORGE_TARGET_UNSUPPORTED',
      message: 'Unsupported target.',
      retryable: false,
    }).ok).toBe(true);
    expect(decodeForgeError({
      code: 'FORGE_TARGET_UNSUPPORTED',
      message: 'Unsupported target.',
      retryable: false,
      details: { sourcePath: 'C:\\repo\\secret.md' },
    }).ok).toBe(false);
    const unsafeMessage = decodeForgeError({
      code: 'FORGE_WORKFLOW_FAILED',
      message: 'Workflow failed at C:\\repo\\secret.md',
      retryable: false,
    });
    expect(unsafeMessage.ok).toBe(false);
    if (unsafeMessage.ok) throw new Error('Expected an internal error path to be rejected.');
    expect(unsafeMessage.issues.map((issue) => issue.code)).toContain('UNSAFE_MESSAGE');
  });

  test('preserves an explicitly empty creature type through response decoding', () => {
    const decoded = decodeForgeActorResponse(response({
      actorVerification: actorVerification(''),
    }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) {
      throw new Error('Expected the accepted Actor response to decode.');
    }
    expect(decoded.value.result.actorVerification.actor.creatureType).toBe('');
    expect(Object.prototype.hasOwnProperty.call(
      decoded.value.result.actorVerification.actor,
      'creatureType',
    )).toBe(true);
  });
});

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const artifact = { name: 'Safe Actor' };
  return {
    protocolVersion: 1,
    requestId: 'wire-safety-request',
    result: {
      sourceIdentity: { sourceId: SOURCE_ID, sourceHash: HASH },
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
      actorVerification: actorVerification(),
      status: 'accepted',
      artifact,
      artifactHash: hashArtifact(artifact),
      ...overrides,
    },
  };
}

function verificationWithOutputPath(outputPath: string): Record<string, unknown> {
  return {
    status: 'accepted',
    mechanicsCoverage: [{
      mechanicId: 'attack-1',
      kind: 'attack',
      sourcePath: 'actions/0',
      sourceField: 'actor.actions',
      status: 'projected',
      outputPaths: [outputPath],
    }],
  };
}

function actorVerification(creatureType?: string): Record<string, unknown> {
  return {
    actor: {
      name: 'Safe Actor',
      type: 'npc',
      ...(creatureType !== undefined ? { creatureType } : {}),
      senses: {},
    },
    items: [],
    warnings: [],
  };
}

function safeWarning(): ForgeDiagnostic {
  return {
    code: 'NEEDS_REVIEW',
    severity: 'warning',
    stage: 'semantic',
    path: 'actor.actions',
    message: 'Manual review is required.',
  };
}

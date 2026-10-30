import { describe, expect, test } from 'bun:test';
import { mapForgeSourceField } from '../projection';
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
  test('keeps Item armor in the Item source-field namespace', () => {
    expect(mapForgeSourceField('item/armor')).toBe('item.armor');
    expect(mapForgeSourceField('item/armor/magicalBonus')).toBe('item.armor');
    expect(mapForgeSourceField('actor/armor')).toBe('actor.attributes');
    const verification = {
      status: 'accepted',
      mechanicsCoverage: [{ mechanicId: 'armor-1', kind: 'armor', sourcePath: 'item/armor',
        status: 'projected', outputPaths: ['documents/0/system/armor'] }],
    };
    expect(projectForgeVerification({ verification, actorVerification: actorVerification() }).verification.mechanicsCoverage[0]!.sourceField).toBe('item.armor');
  });
  test('accepts only Foundry document-field output paths', () => {
    for (const field of ['armor', 'type']) {
      expect(() => projectForgeVerification({
        verification: verificationWithOutputPath(`documents/0/system/${field}`),
        actorVerification: actorVerification(),
      })).not.toThrow();
      expect(() => projectForgeVerification({
        verification: verificationWithOutputPath(`documents/0/system/${field}/../../private`),
        actorVerification: actorVerification(),
      })).toThrow(/safe document field path/u);
    }
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
    const retained = retainedReview(decoded, 'INVALID_OUTPUT_PATH');
    expect(retained.verification.mechanicsCoverage[0]?.outputPaths).toEqual([]);
    expect(JSON.stringify(retained)).not.toContain('private/cache/output.json');

    const prefixedBypass = decodeForgeActorResponse(response({
      verification: verificationWithOutputPath('documents/0/packages/parser/src/yaml.ts'),
    }));
    expect(retainedReview(prefixedBypass, 'INVALID_OUTPUT_PATH').verification.mechanicsCoverage[0]?.outputPaths).toEqual([]);
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
      expect(retainedReview(decoded, 'ACCEPTED_WITH_REVIEW_COVERAGE').verification.mechanicsCoverage).toEqual([{
        mechanicId: 'attack-1', kind: 'attack', sourceField: 'actor.actions', status, outputPaths: [],
      }]);
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
    expect(retainedReview(decoded, 'ACCEPTED_WITH_REVIEW_COVERAGE').verification.mechanicsCoverage[0]).toMatchObject({
      status: 'projected', outputPaths: [],
    });
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
    expect(retainedReview(decoded, 'ACCEPTED_WITH_REVIEW_COVERAGE').verification.mechanicsCoverage[0]).toMatchObject(reviewMetadata);
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
    const pathResult = retainedReview(unsafePath, 'UNSAFE_DIAGNOSTIC_PATH');
    expect(JSON.stringify(pathResult)).not.toContain('repo/private/output.json');

    const unsafeMessage = decodeForgeActorResponse(response({
      status: 'needs_review',
      diagnostics: [{ ...safeWarning(), message: 'Failed at C:\\repo\\secret.md' }],
      verification: { status: 'needs_review', mechanicsCoverage: [] },
      artifactHash: undefined,
    }));
    const messageResult = retainedReview(unsafeMessage, 'UNSAFE_DIAGNOSTIC_MESSAGE');
    expect(JSON.stringify(messageResult)).not.toContain('C:\\repo\\secret.md');
    expect(messageResult.diagnostics).toContainEqual(expect.objectContaining({ code: 'NEEDS_REVIEW', path: 'actor.actions' }));
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

function retainedReview(decoded: ReturnType<typeof decodeForgeActorResponse>, issueCode: string) {
  expect(decoded.ok).toBe(true);
  if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected an ancillary report issue to retain the candidate.');
  const result = decoded.value.result;
  expect(result).toMatchObject({ status: 'needs_review', verification: { status: 'needs_review' },
    artifact: { name: 'Safe Actor' }, artifactHash: hashArtifact({ name: 'Safe Actor' }) });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'FORGE_REPORT_INCOMPLETE',
    severity: 'warning', path: 'actor', message: expect.stringContaining(issueCode) }));
  return result;
}

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

import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  forgeGmModelFindingsHash,
  forgeGmTargetHash,
  serializeForgeIntakeReviewBundle,
  type ForgeIntakeReviewBundleInput,
} from '../packages/forge-browser-runtime/src/intakeReview';
import {
  buildForgeIntakeReviewBundleV2,
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
} from '../packages/forge-browser-runtime/src/intakeReviewImport';

function acceptedActorReview(): ForgeIntakeReviewBundleInput {
  const rawSource = 'Scout. Claw deals 1d6 + 2 Slashing damage.';
  const sourceId = 'actor:v1:123e4567-e89b-42d3-a456-426614174000';
  const canonicalSource = `---\nforge-source-id: ${sourceId}\n---\n${rawSource}`;
  return {
    objectKind: 'actor', mode: 'ai-monster', requestId: 'review-request', attemptId: 'review-attempt', status: 'accepted',
    rawSource, rawSourceHash: hashSource(rawSource), canonicalSource,
    sourceIdentity: { sourceId, finalSourceHash: hashSource(canonicalSource) },
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3',
      generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    candidate: { id: 'scout', label: 'Scout', start: 0, end: rawSource.length, quote: rawSource },
    evidence: { source: { sha256: hashSource(rawSource), length: rawSource.length }, claims: [], coverage: [], uncertainties: [] },
    deterministicFindings: [], aiReviewFindings: [], reviewVerdict: 'accepted',
    candidateResponse: { requestId: 'review-request', status: 'accepted', verificationStatus: 'accepted',
      artifactHash: hashSource('complete Actor'), diagnostics: [],
      semanticSummary: { actor: { name: 'Scout', hp: 12 }, items: [{ name: 'Claw', damage: '1d6 + 2', type: 'slashing' }] } },
  };
}

const blockingFinding = {
  id: 'existing-finding', code: 'EXISTING_CONTENT_ISSUE', path: '/creature/actions/0', message: 'Review the attack.',
  blocking: true, origin: 'semantic', evidence: [],
};

describe('Actor review candidate consistency reports', () => {
  test.each([
    ['request identity', (input: ForgeIntakeReviewBundleInput) => { input.candidateResponse!.requestId = 'other-request'; }, 'FORGE_REVIEW_REQUEST_ID_MISMATCH', '/candidateResponse/requestId'],
    ['artifact identity', (input: ForgeIntakeReviewBundleInput) => { delete input.candidateResponse!.artifactHash; }, 'FORGE_REVIEW_ARTIFACT_HASH_MISSING', '/candidateResponse/artifactHash'],
    ['verification verdict', (input: ForgeIntakeReviewBundleInput) => { input.candidateResponse!.verificationStatus = 'needs_review'; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/candidateResponse/verificationStatus'],
    ['deterministic finding', (input: ForgeIntakeReviewBundleInput) => { input.deterministicFindings = [blockingFinding]; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/deterministicFindings'],
    ['AI finding', (input: ForgeIntakeReviewBundleInput) => { input.aiReviewFindings = [blockingFinding]; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/aiReviewFindings'],
    ['evidence uncertainty', (input: ForgeIntakeReviewBundleInput) => {
      const { origin: _origin, ...uncertainty } = blockingFinding;
      input.evidence!.uncertainties = [uncertainty];
    }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/evidence/uncertainties'],
    ['response diagnostic', (input: ForgeIntakeReviewBundleInput) => { input.candidateResponse!.diagnostics = [{ severity: 'warning', code: 'EXISTING_WARNING', message: 'Review the output.' }]; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/candidateResponse/diagnostics'],
    ['recorded review verdict', (input: ForgeIntakeReviewBundleInput) => { input.reviewVerdict = 'revise'; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/reviewVerdict'],
    ['recorded failed model review', (input: ForgeIntakeReviewBundleInput) => { input.modelReviewStatus = 'failed'; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/modelReviewStatus'],
    ['missing target', (input: ForgeIntakeReviewBundleInput) => { delete input.target; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/target'],
    ['missing canonical source', (input: ForgeIntakeReviewBundleInput) => { delete input.canonicalSource; delete input.sourceIdentity; }, 'FORGE_REVIEW_ACCEPTANCE_CONFLICT', '/canonicalSource'],
  ] as const)('retains %s inconsistencies with a concrete review finding through V1 and V2', (_label, mutate, code, path) => {
    const input = acceptedActorReview();
    mutate(input);
    const original = structuredClone(input);
    for (const version of [1, 2]) {
      const bundle = version === 1 ? buildForgeIntakeReviewBundle(input) : buildForgeIntakeReviewBundleV2(input);
      expect(bundle.status).toBe('needs_review');
      expect(bundle.candidateResponse).toEqual(input.candidateResponse);
      expect(bundle.candidate).toEqual(input.candidate);
      expect(bundle.evidence).toEqual(input.evidence);
      expect(bundle.canonicalSource).toBe(input.canonicalSource);
      expect(bundle.aiReviewFindings).toEqual(input.aiReviewFindings!);
      expect(bundle.deterministicFindings).toContainEqual(expect.objectContaining({ code, path, blocking: true }));
      if (input.deterministicFindings!.length) expect(bundle.deterministicFindings).toContainEqual(blockingFinding);
      const serialized = version === 1 ? serializeForgeIntakeReviewBundle(bundle as ReturnType<typeof buildForgeIntakeReviewBundle>)
        : serializeForgeIntakeReviewBundleV2(bundle as ReturnType<typeof buildForgeIntakeReviewBundleV2>);
      const imported = decodeForgeIntakeReviewBundleText(serialized).bundle;
      expect(imported.status).toBe('needs_review');
      expect(imported.candidateResponse).toEqual(input.candidateResponse);
      expect(imported.deterministicFindings.filter(finding => finding.code === code && finding.path === path)).toHaveLength(1);
      expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(imported)).bundle).toEqual(imported);
    }
    expect(input).toEqual(original);
  });

  test('keeps a consistent accepted Actor summary accepted with no generated findings', () => {
    const input = acceptedActorReview();
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe('accepted');
    expect(bundle.deterministicFindings).toEqual([]);
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle)).bundle.status).toBe('accepted');
  });

  test('does not promote a valid non-accepted candidate or rewrite its original response diagnostics', () => {
    const input = acceptedActorReview();
    input.status = 'needs_review';
    input.candidateResponse!.status = 'failed';
    input.candidateResponse!.verificationStatus = 'failed';
    input.candidateResponse!.diagnostics = [{ severity: 'error', code: 'EXISTING_FAILURE', message: 'Keep this candidate.' }];
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe('needs_review');
    expect(bundle.candidateResponse).toEqual(input.candidateResponse);
    expect(bundle.deterministicFindings).toEqual([]);
  });

  test.each(['reviewed_candidate', 'accepted'] as const)('preserves explicit GM adoption as reviewed_candidate from %s', status => {
    const input = acceptedActorReview();
    input.status = status;
    input.candidateResponse!.status = 'needs_review';
    input.candidateResponse!.verificationStatus = 'needs_review';
    input.modelReviewStatus = 'needs_review';
    input.candidateHash = hashSource('reviewed candidate');
    input.deterministicFindings = [blockingFinding];
    input.gmApproval = { gmId: 'test-gm', sourceHash: input.rawSourceHash, finalSourceHash: input.sourceIdentity!.finalSourceHash,
      artifactHash: input.candidateResponse!.artifactHash!, candidateHash: input.candidateHash, modelReviewStatus: input.modelReviewStatus,
      targetHash: forgeGmTargetHash(input.target!), modelFindingsHash: forgeGmModelFindingsHash(input.aiReviewFindings!) };
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe('reviewed_candidate');
    expect(bundle.deterministicFindings).toEqual([blockingFinding]);
    expect(bundle.gmApproval).toEqual(input.gmApproval);
    expect(bundle.candidateResponse).toEqual(input.candidateResponse);
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle)).bundle).toEqual(bundle);
  });

  test.each(['failed', 'rejected'] as const)('preserves the terminal %s verdict while reporting a mismatched response', status => {
    const input = acceptedActorReview();
    input.status = status;
    input.candidateResponse!.requestId = 'other-request';
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe(status);
    expect(bundle.candidateResponse).toEqual(input.candidateResponse);
    expect(bundle.deterministicFindings).toContainEqual(expect.objectContaining({
      code: 'FORGE_REVIEW_REQUEST_ID_MISMATCH', path: '/candidateResponse/requestId',
    }));
  });

  test.each([
    ['reviewed_candidate', 'needs_review'], ['reviewed_candidate', 'failed'],
    ['committing_and_reading_back', 'needs_review'], ['committing_and_reading_back', 'failed'],
  ] as const)('preserves the historical %s stage and strict %s conclusion without requiring prior GM approval', (status, strictStatus) => {
    const input = acceptedActorReview();
    const rawSource = `${input.rawSource}\r\n`;
    input.canonicalSource = input.canonicalSource!.replace(input.rawSource, rawSource);
    input.rawSource = rawSource;
    input.rawSourceHash = hashSource(rawSource);
    input.sourceIdentity!.finalSourceHash = hashSource(input.canonicalSource);
    input.candidate = { ...input.candidate!, end: rawSource.length, quote: rawSource };
    input.evidence!.source = { sha256: input.rawSourceHash, length: rawSource.length };
    input.status = status;
    input.candidateResponse!.status = strictStatus;
    input.candidateResponse!.verificationStatus = strictStatus;
    input.candidateResponse!.diagnostics = [{ severity: strictStatus === 'failed' ? 'error' : 'warning', code: 'SOURCE_REVIEW_REQUIRED', message: 'Keep the original review conclusion.' }];
    input.deterministicFindings = [blockingFinding];
    const original = structuredClone(input);
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe(status);
    expect(bundle.rawSource).toBe(rawSource);
    expect(bundle.candidateResponse).toEqual(input.candidateResponse);
    expect(bundle.deterministicFindings).toEqual([blockingFinding]);
    expect(bundle.gmApproval).toBeUndefined();
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle)).bundle).toEqual(bundle);
    expect(input).toEqual(original);
  });

  test('reports genuine identity issues without overwriting a historical operation stage', () => {
    const input = acceptedActorReview();
    input.status = 'committing_and_reading_back';
    input.candidateResponse!.requestId = 'other-request';
    delete input.candidateResponse!.artifactHash;
    const bundle = buildForgeIntakeReviewBundleV2(input);
    expect(bundle.status).toBe('committing_and_reading_back');
    expect(bundle.candidateResponse).toEqual(input.candidateResponse);
    expect(bundle.deterministicFindings.map(finding => ({ code: finding.code, path: finding.path }))).toEqual([
      { code: 'FORGE_REVIEW_REQUEST_ID_MISMATCH', path: '/candidateResponse/requestId' },
      { code: 'FORGE_REVIEW_ARTIFACT_HASH_MISSING', path: '/candidateResponse/artifactHash' },
    ]);
    expect(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle)).bundle).toEqual(bundle);
  });

  test('keeps the Item response identity and hash contract strict', () => {
    const input = acceptedActorReview();
    input.objectKind = 'item'; input.mode = 'ai-item';
    expect(() => buildForgeIntakeReviewBundle({ ...input, candidateResponse: { ...input.candidateResponse!, requestId: 'other' } })).toThrow(/requestId/u);
    expect(() => buildForgeIntakeReviewBundle({ ...input, candidateResponse: { ...input.candidateResponse!, artifactHash: undefined } })).toThrow(/artifactHash/u);
    expect(() => buildForgeIntakeReviewBundleV2({ ...input, deterministicFindings: [blockingFinding] })).toThrow(/blocking finding/u);
  });
});

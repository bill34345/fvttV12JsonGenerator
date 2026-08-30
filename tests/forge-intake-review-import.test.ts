import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  serializeForgeIntakeReviewBundle,
  type ForgeIntakeReviewBundleInput,
} from '../packages/forge-browser-runtime/src/intakeReview';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES,
  FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES,
  buildForgeIntakeReviewBundleV2,
  createForgeIntakeRecoveryLineage,
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
} from '../packages/forge-browser-runtime/src/intakeReviewImport';

const ACTOR_SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000';

function acceptedInput(): ForgeIntakeReviewBundleInput {
  const rawSource = 'Rat source';
  const canonicalSource = `---\nforge-source-id: ${ACTOR_SOURCE_ID}\n---\nRat source`;
  return {
    objectKind: 'actor',
    mode: 'ai-monster',
    requestId: 'request-1',
    attemptId: 'attempt-1',
    status: 'accepted',
    rawSource,
    rawSourceHash: hashSource(rawSource),
    candidate: { id: 'rat', label: '<b>Rat</b>', start: 0, end: 3, quote: 'Rat' },
    evidence: {
      source: { sha256: hashSource(rawSource), length: rawSource.length },
      claims: [{ path: '/name', valueKind: 'explicit', value: { label: '<script>alert(1)</script>' }, evidence: [{ start: 0, end: 3, quote: 'Rat' }] }],
      coverage: [{ start: 0, end: rawSource.length, quote: rawSource, classification: 'mechanical', claimPaths: ['/name'] }],
      uncertainties: [],
    },
    deterministicFindings: [],
    aiReviewFindings: [],
    reviewVerdict: 'accepted',
    provider: {
      name: 'provider-label',
      extractionModel: 'extract-model',
      reviewModel: 'review-model',
      protocol: 'openai-compatible',
      promptVersions: { discover: 'd1', extract: 'e1', review: 'r1', repair: 'p1' },
    },
    calls: { discovery: 1, extraction: 1, review: 1, repair: 0 },
    repairCount: 0,
    canonicalSource,
    sourceIdentity: { sourceId: ACTOR_SOURCE_ID, finalSourceHash: hashSource(canonicalSource) },
    target: {
      generatorVersion: '0.1.0',
      fvttVersion: '14.364',
      systemId: 'dnd5e',
      systemVersion: '5.3.3',
      generatorProfile: 'v14',
      effectProfile: 'core',
      iconMode: 'off',
    },
    candidateResponse: {
      requestId: 'request-1',
      status: 'accepted',
      artifactHash: hashSource('artifact'),
      verificationStatus: 'accepted',
      diagnostics: [],
      semanticSummary: { name: 'Rat' },
    },
    history: [{ sequence: 1, action: 'regenerate', attemptId: 'attempt-0', resultingStatus: 'analyzing' }],
  };
}

function decodeObject(value: unknown) {
  return decodeForgeIntakeReviewBundleText(JSON.stringify(value));
}

describe('Forge Intake untrusted review bundle import', () => {
  test('strictly decodes V1, migrates it to an immutable read-only V2 record, and normalizes whitespace', () => {
    const bundle = buildForgeIntakeReviewBundle(acceptedInput());
    const pretty = serializeForgeIntakeReviewBundle(bundle);
    const compact = JSON.stringify(JSON.parse(pretty));
    const first = decodeForgeIntakeReviewBundleText(pretty);
    const second = decodeForgeIntakeReviewBundleText(compact);

    expect(first.originalVersion).toBe(1);
    expect(first.bundle.version).toBe(2);
    expect(first.normalizedBundleHash).toBe(second.normalizedBundleHash);
    expect(first.bundle.candidate?.label).toBe('<b>Rat</b>');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.bundle.evidence?.claims[0]?.value)).toBe(true);
    expect(() => ((first.bundle as { status: string }).status = 'failed')).toThrow();
  });

  test('round-trips V2 source labels and normalized recovery lineage', () => {
    const imported = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle(acceptedInput())));
    const lineage = createForgeIntakeRecoveryLineage(imported);
    const nextInput = { ...acceptedInput(), requestId: 'request-2', attemptId: 'attempt-2' };
    nextInput.candidateResponse = { ...nextInput.candidateResponse!, requestId: 'request-2' };
    const v2 = buildForgeIntakeReviewBundleV2(nextInput, { sourceLabel: 'Recovered Rat', recoveredFrom: lineage });
    const decoded = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(v2));

    expect(decoded.originalVersion).toBe(2);
    expect(decoded.bundle.sourceLabel).toBe('Recovered Rat');
    expect(decoded.bundle.recoveredFrom).toEqual(lineage);
    expect(decoded.bundle.recoveredFrom?.requestId).toBe('request-1');
  });

  test('rejects unknown schema, version, keys, prototype keys, roots, and excessive structures', () => {
    const base = buildForgeIntakeReviewBundle(acceptedInput()) as unknown as Record<string, unknown>;
    expect(() => decodeObject({ ...base, schema: 'other' })).toThrow(/schema/u);
    expect(() => decodeObject({ ...base, version: 99 })).toThrow(/version/u);
    expect(() => decodeObject({ ...base, authorization: 'Bearer secret' })).toThrow(/unknown key/u);
    expect(() => decodeForgeIntakeReviewBundleText('{"__proto__":{},"schema":"forge-intake-review-bundle","version":1}')).toThrow(/prototype key/u);
    expect(() => decodeObject([])).toThrow(/object/u);
    expect(() => decodeObject('bundle')).toThrow(/object/u);
    const nested = Array.from({ length: 22 }).reduce<unknown>((value) => [value], null);
    expect(() => decodeObject({ ...base, candidateResponse: { ...(base.candidateResponse as object), semanticSummary: nested } })).toThrow(/depth/u);
    expect(() => decodeObject({ ...base, history: Array.from({ length: 1_025 }, (_, sequence) => ({ sequence, action: 'repair', attemptId: 'a', resultingStatus: 'repairing' })) })).toThrow(/array/u);
  });

  test('rejects file and raw-source byte limits before accepting state', () => {
    expect(() => decodeForgeIntakeReviewBundleText(' '.repeat(FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES + 1))).toThrow(/UTF-8 bytes/u);
    const rawSource = 'é'.repeat(Math.floor(FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES / 2) + 1);
    const input = { ...acceptedInput(), rawSource, rawSourceHash: hashSource(rawSource), candidate: undefined, evidence: undefined };
    expect(() => decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle(input)))).toThrow(/UTF-8 byte limit/u);
  });

  test('rejects tampered hashes, source identity, target, accepted summary, history, and exact evidence quotes', () => {
    const base = buildForgeIntakeReviewBundle(acceptedInput());
    const cases: Array<[unknown, RegExp]> = [
      [{ ...base, rawSourceHash: hashSource('other') }, /raw source hash/u],
      [{ ...base, sourceIdentity: { ...base.sourceIdentity!, finalSourceHash: hashSource('other') } }, /final source hash/u],
      [{ ...base, sourceIdentity: { ...base.sourceIdentity!, sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174000' } }, /sourceId|source identity/u],
      [{ ...base, sourceIdentity: { ...base.sourceIdentity!, sourceId: 'actor:v1:223e4567-e89b-42d3-a456-426614174000' } }, /canonicalSource/u],
      [{ ...base, target: { ...base.target!, iconMode: 'safe' } }, /target/u],
      [{ ...base, candidateResponse: { ...base.candidateResponse!, requestId: 'other' } }, /requestId/u],
      [{ ...base, candidateResponse: { ...base.candidateResponse!, artifactHash: undefined } }, /artifactHash/u],
      [{ ...base, history: [{ sequence: 2, action: 'repair', attemptId: 'a', resultingStatus: 'repairing' }, { sequence: 1, action: 'reject', attemptId: 'a', resultingStatus: 'rejected' }] }, /strictly increasing/u],
      [{ ...base, candidate: { ...base.candidate!, quote: 'Bat' } }, /quote/u],
      [{ ...base, evidence: { ...base.evidence!, source: { sha256: hashSource('other'), length: base.rawSource.length } } }, /evidence source identity/u],
      [{ ...base, evidence: { ...base.evidence!, claims: [{ ...base.evidence!.claims[0]!, evidence: [{ start: 0, end: 3, quote: 'Rat', cookie: 'secret' }] }] } }, /unknown key/u],
    ];
    for (const [value, message] of cases) expect(() => decodeObject(value)).toThrow(message);
  });

  test('rejects contradictory accepted history and invalid diagnostic severity', () => {
    const base = buildForgeIntakeReviewBundle(acceptedInput());
    const blockingFinding = { id: 'blocking', code: 'BLOCKING', path: '/', message: 'blocked', blocking: true, origin: 'deterministic', evidence: [] };
    const cases: Array<[unknown, RegExp]> = [
      [{ ...base, deterministicFindings: [blockingFinding] }, /blocking finding/u],
      [{ ...base, evidence: { ...base.evidence!, uncertainties: [{ id: 'u', code: 'UNCERTAIN', path: '/', message: 'uncertain', blocking: true, evidence: [] }] } }, /blocking evidence uncertainty/u],
      [{ ...base, reviewVerdict: 'revise' }, /accepted review verdict/u],
      [{ ...base, target: undefined }, /target metadata/u],
      [{ ...base, canonicalSource: undefined, sourceIdentity: undefined }, /canonical source identity/u],
      [{ ...base, candidateResponse: { ...base.candidateResponse!, diagnostics: [{ severity: 'warning', code: 'WARN', message: 'warning' }] } }, /warning or error/u],
      [{ ...base, candidateResponse: { ...base.candidateResponse!, diagnostics: [{ severity: 'fatalish', code: 'BAD', message: 'bad' }] } }, /unsupported value/u],
    ];
    for (const [value, message] of cases) expect(() => decodeObject(value)).toThrow(message);
  });

  test('never reflects an attacker-controlled unknown key in decoder errors', () => {
    const base = buildForgeIntakeReviewBundle(acceptedInput());
    let caught: unknown;
    try {
      decodeObject({ ...base, '<img src=x onerror=alert(1)>': true });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/unknown key/u);
    expect((caught as Error).message).not.toContain('<img');
  });

  test('rejects object-kind/mode mismatch and preserves hostile labels only as inert strings', () => {
    const base = buildForgeIntakeReviewBundle(acceptedInput());
    expect(() => decodeObject({ ...base, objectKind: 'item' })).toThrow(/object kind|not valid for item/u);
    const imported = decodeObject(base);
    expect(imported.bundle.candidate?.label).toBe('<b>Rat</b>');
    expect(JSON.stringify(imported.bundle)).not.toContain('Bearer secret');
  });
});

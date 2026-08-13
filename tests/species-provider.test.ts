import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  OpenAICompatibleSpeciesIntakeProvider,
  SPECIES_INTAKE_PROMPT_VERSIONS,
} from '@fvtt-json-generator/intake-ai/species-provider';
import type { HttpClient, HttpResponse } from '@fvtt-json-generator/intake-ai/http';

const source = '食人魔Ogre\n- 速度：40尺。';
const candidate = { id: 'ogre', label: '食人魔Ogre', start: 0, end: source.length, quote: source };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function response(content: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: JSON.stringify(content) } }] };
    },
  };
}

function provider(httpClient: HttpClient) {
  return new OpenAICompatibleSpeciesIntakeProvider({
    authMode: 'codex-oauth',
    apiKey: 'local-bridge',
    baseUrl: 'http://127.0.0.1:8787/v1',
    model: 'extractor',
    reviewModel: 'reviewer',
    timeoutMs: 10_000,
    repairTimeoutMs: 10_000,
    reasoningEffort: 'high',
    httpClient,
  });
}

describe('Species OpenAI-compatible provider', () => {
  test('supplies the complete IR contract and deterministic candidate hash to extraction', async () => {
    let requestBody: Record<string, any> | undefined;
    const httpClient: HttpClient = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return response({
        schemaVersion: 1,
        source: { sha256: sha256(source), length: source.length },
        species: {},
        claims: [],
        coverage: [],
        uncertainties: [],
      });
    };

    await provider(httpClient).extract({ source, sourceSha256: sha256(source), candidate });

    expect(SPECIES_INTAKE_PROMPT_VERSIONS.discover).toBe('species-intake-discover-v2');
    expect(SPECIES_INTAKE_PROMPT_VERSIONS.extract).toBe('species-intake-extract-v6');
    expect(SPECIES_INTAKE_PROMPT_VERSIONS.review).toBe('species-intake-review-v3');
    expect(requestBody?.messages[0].content).toContain('"source":{"sha256"');
    expect(requestBody?.messages[0].content).toContain('"claims"');
    expect(requestBody?.messages[0].content).toContain('"uncertainties":[]');
    expect(requestBody?.messages[0].content).toContain('One coverage entry equal to the complete candidate');
    expect(requestBody?.messages[0].content).toContain('must not be repeated as features');
    expect(requestBody?.messages[0].content).toContain('all of its parts must have the same level');
    expect(requestBody?.messages[0].content).toContain('Orge to Ogre');
    expect(requestBody?.messages[0].content).toContain('do not create a blocking uncertainty merely because the wording is not interpreted');
    expect(requestBody?.messages[0].content).toContain('does not make it gm-assisted');
    expect(requestBody?.messages[0].content).toContain('身强力壮：附赠动作脱困');
    expect(requestBody?.messages[0].content).toContain('underlying check, outcome, and condition handling remain manual');
    const payload = JSON.parse(requestBody?.messages[1].content);
    expect(payload.candidateSha256).toBe(sha256(candidate.quote));
    expect(payload.sourceSha256).toBe(sha256(source));
  });

  test('reports only missing top-level contract fields after the bounded retry', async () => {
    let calls = 0;
    const httpClient: HttpClient = async () => {
      calls += 1;
      return response({ schemaVersion: 1, species: {} });
    };

    await expect(provider(httpClient).extract({ source, sourceSha256: sha256(source), candidate }))
      .rejects.toMatchObject({
        code: 'invalid_response',
        message: 'extract is not a complete SpeciesIntakeIR; missing or invalid: source, claims, coverage, uncertainties.',
      });
    expect(calls).toBe(2);
  });

  test('rejects review findings outside the public Species finding contract', async () => {
    let calls = 0;
    const httpClient: HttpClient = async () => {
      calls += 1;
      return response({
        schemaVersion: 1,
        verdict: 'revise',
        findings: [{ severity: 'error', code: 'BAD_SHAPE', paths: ['/ir'] }],
      });
    };

    await expect(provider(httpClient).review({} as never)).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('strict SpeciesIntakeFinding'),
    });
    expect(calls).toBe(2);
  });
});

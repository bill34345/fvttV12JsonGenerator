import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_BRIDGE_TOKEN,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_CODEX_OAUTH_REPAIR_TIMEOUT_MS,
  DEFAULT_CODEX_OAUTH_REASONING_EFFORT,
  DEFAULT_CODEX_OAUTH_TIMEOUT_MS,
  loadMonsterIntakeConfig,
  MonsterIntakeConfigurationError,
} from '../config';
import { runMonsterIntakeDoctor } from '@fvtt-json-generator/intake-ai/doctor';
import { createMonsterIntakeProvider } from '@fvtt-json-generator/intake-ai/factory';
import {
  INTAKE_PROMPT_VERSIONS,
  MonsterIntakeProviderError,
  OpenAICompatibleMonsterIntakeProvider,
  parseStrictJson,
  type IntakeProviderAuditEvent,
} from '../provider';
import type { HttpClient, HttpRequest, HttpResponse } from '../../translation/types';
import { validateMonsterIntakeIR } from '../validator';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from './fixtures/rat-warlock';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';
import {sourceLineCatalog,sourceProofCatalog,materializeSourceLineReferences} from '../../../../packages/intake-ai/src/source-line-references';
import {SOURCE_OPERATION_SCHEMA} from '../../../../packages/intake-ai/src/source-operation-contract';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';

// Compile-time contract check: a future canonical attack-kind change must
// update the actual prompt, before another paid model trial discovers drift.
type SplitKinds<S extends string>=S extends `${infer First}|${infer Rest}`?First|SplitKinds<Rest>:S;
type PromptAttackKinds=typeof SOURCE_OPERATION_SCHEMA extends `${string}attack?:{type:${infer Kinds},toHit:${string}`?SplitKinds<Kinds>:never;
type MustBeNever<T extends never>=T;
type _MissingPromptKinds=MustBeNever<Exclude<NonNullable<SourceOperation['attack']>['type'],PromptAttackKinds>>;
type _InventedPromptKinds=MustBeNever<Exclude<PromptAttackKinds,NonNullable<SourceOperation['attack']>['type']>>;

function response(status: number, content: string): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { choices: [{ message: { content } }] };
    },
  };
}

describe('monster intake configuration', () => {
  test('reads only MONSTER_INTAKE variables and defaults reviewer/timeout', () => {
    const config = loadMonsterIntakeConfig({
      MONSTER_INTAKE_API_KEY: 'intake-key',
      MONSTER_INTAKE_BASE_URL: 'https://example.test/v1/',
      MONSTER_INTAKE_MODEL: 'extractor',
      OPENAI_API_KEY: 'must-not-be-used',
      TRANSLATION_API_KEY: 'must-not-be-used',
    });
    expect(config).toEqual({
      authMode: 'api-key',
      apiKey: 'intake-key',
      baseUrl: 'https://example.test/v1',
      model: 'extractor',
      reviewModel: 'extractor',
      timeoutMs: 60_000,
      repairTimeoutMs: 180_000,
    });
  });

  test('fails closed when the dedicated configuration is absent', () => {
    expect(() => loadMonsterIntakeConfig({ OPENAI_API_KEY: 'not-authorized' })).toThrow(
      MonsterIntakeConfigurationError,
    );
  });

  test('loads Codex OAuth mode without requiring an OAuth token in the app', () => {
    const config = loadMonsterIntakeConfig({
      MONSTER_INTAKE_AUTH_MODE: 'codex-oauth',
    });

    expect(config).toEqual({
      authMode: 'codex-oauth',
      apiKey: DEFAULT_CODEX_OAUTH_BRIDGE_TOKEN,
      baseUrl: DEFAULT_CODEX_OAUTH_BASE_URL,
      model: DEFAULT_CODEX_OAUTH_MODEL,
      reviewModel: DEFAULT_CODEX_OAUTH_MODEL,
      timeoutMs: DEFAULT_CODEX_OAUTH_TIMEOUT_MS,
      repairTimeoutMs: DEFAULT_CODEX_OAUTH_REPAIR_TIMEOUT_MS,
      reasoningEffort: DEFAULT_CODEX_OAUTH_REASONING_EFFORT,
    });
  });

  test('maps the UI ultra label to the API xhigh reasoning effort', () => {
    expect(loadMonsterIntakeConfig({
      MONSTER_INTAKE_AUTH_MODE: 'codex-oauth',
      MONSTER_INTAKE_CODEX_OAUTH_REASONING_EFFORT: 'ultra',
    }).reasoningEffort).toBe('xhigh');
  });

  test('rejects a non-loopback Codex OAuth bridge URL', () => {
    expect(() => loadMonsterIntakeConfig({
      MONSTER_INTAKE_AUTH_MODE: 'codex-oauth',
      MONSTER_INTAKE_CODEX_OAUTH_BASE_URL: 'https://example.test/v1',
      MONSTER_INTAKE_MODEL: 'gpt-5.4',
    })).toThrow(/loopback/i);
  });

  test('doctor checks the local bridge health endpoint and configured model', async () => {
    const requests: Array<{ url: string; method: string | undefined }> = [];
    const report = await runMonsterIntakeDoctor({
      MONSTER_INTAKE_AUTH_MODE: 'codex-oauth',
      MONSTER_INTAKE_CODEX_OAUTH_BASE_URL: 'http://127.0.0.1:9001/v1',
      MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN: 'must-not-be-logged',
    }, async (input, init) => {
      requests.push({ url: String(input), method: init?.method });
      return requests.at(-1)?.url.endsWith('/v1/models')
        ? Response.json({ data: [{ id: DEFAULT_CODEX_OAUTH_MODEL }] })
        : new Response('{"ok":true}', { status: 200 });
    });

    expect(report).toEqual({
      configured: true,
      authMode: 'codex-oauth',
      model: DEFAULT_CODEX_OAUTH_MODEL,
      baseUrl: 'http://127.0.0.1:9001/v1',
      bridge: {
        healthUrl: 'http://127.0.0.1:9001/health',
        modelsUrl: 'http://127.0.0.1:9001/v1/models',
        reachable: true,
        modelAdvertised: true,
        status: 200,
        message: 'Codex OAuth bridge is reachable and exposes the configured model.',
      },
    });
    expect(requests).toEqual([
      { url: 'http://127.0.0.1:9001/health', method: 'GET' },
      { url: 'http://127.0.0.1:9001/v1/models', method: 'GET' },
    ]);
    expect(JSON.stringify(report)).not.toContain('must-not-be-logged');
  });
});

describe('OpenAI-compatible monster intake provider', () => {
  test('routes Codex OAuth mode through the local OpenAI-compatible bridge contract', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const provider = createMonsterIntakeProvider({
      env: {
        MONSTER_INTAKE_AUTH_MODE: 'codex-oauth',
        MONSTER_INTAKE_CODEX_OAUTH_BASE_URL: 'http://127.0.0.1:8787/v1',
        MONSTER_INTAKE_CODEX_OAUTH_REASONING_EFFORT: 'ultra',
      },
      httpClient: async (url, init) => {
        requests.push({ url, init });
        return response(200, '{"schemaVersion":1,"candidates":[]}');
      },
    });

    await provider.discover({ source: 'text', sourceSha256: 'hash', chunkStart: 0, chunkEnd: 4 });

    expect(requests[0]?.url).toBe('http://127.0.0.1:8787/v1/chat/completions');
    expect(requests[0]?.init.headers.Authorization).toBe(`Bearer ${DEFAULT_CODEX_OAUTH_BRIDGE_TOKEN}`);
    const body = JSON.parse(requests[0]!.init.body) as Record<string, unknown>;
    expect(body.model).toBe(DEFAULT_CODEX_OAUTH_MODEL);
    expect(body.reasoning_effort).toBe('xhigh');
  });

  test('uses versioned independent stage prompts and strict JSON mode', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const client: HttpClient = async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"candidates":[]}');
    };
    const provider = makeProvider(client);
    await provider.discover({ source: 'text', sourceSha256: 'hash', chunkStart: 0, chunkEnd: 4 });
    const body = JSON.parse(requests[0]!.init.body) as Record<string, unknown>;
    expect(requests[0]!.url).toBe('https://example.test/v1/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body)).toContain('untrusted data');
    expect(requests[0]!.init.headers.Authorization).toBe('Bearer secret');
  });

  test('extraction prompt uses the canonical shape and exact quotes without a second source grammar', async () => {
    const requests: HttpRequest[] = [];
    const provider = makeProvider(async (_url, init) => {
      requests.push(init);
      return response(200, '{"schemaVersion":1,"creature":{},"claims":[],"coverage":[],"uncertainties":[]}');
    });
    await provider.extract({ source: 'monster', sourceSha256: 'hash', candidate: { id: 'monster', label: 'Monster', start: 0, end: 7, quote: 'monster' } });
    const body = JSON.parse(requests[0]!.body), prompt = body.messages[0].content as string;
    expect(INTAKE_PROMPT_VERSIONS.extract).toBe('monster-intake-extract-v48-consolidated-source-operations');
    expect(prompt).toContain(SOURCE_OPERATION_SCHEMA);
    for (const required of [
      'The program checks structure, references and faithful conversion/save',
      'All source mechanical fields are model-owned; the program does not infer them from titles or prose',
      'Required feature collections are arrays', 'Printed AC stays fixed',
      'EvidenceRef is {start:-1,end:-1,quote:string}',
      'No source-line/clause IDs or manual offsets are requested',
      'For a new default response, set claims:[] and coverage:[]',
      'No per-leaf claim proof or whitespace partition is requested',
      'Interpret resource scope from the whole governing ability and its alternatives',
      'The literal word Shared/each is not required',
      'Do not force a multi-spell ability to manual solely because its daily qualifier is in the title or parent sentence',
      'Populate explicit capacities and recovery, not title-derived defaults',
      'Attack/Save OP damage contains only unconditional base/additional parts',
      'Conditional or replacement damage requires a separate Damage OP',
      'Follow-ups are GM-invoked helpers and never spend the initial action/resource again',
      'Use sourceOperations for every executable basic',
      'Timed/staged/conditional consequences without an exact supported native representation stay in GM prose',
      'prepared-cantrip', 'prepared-slots', 'casterLevelEvidence', 'slotsEvidence',
      'manualGrants?:[]', 'aliases:[],restrictions:[],evidence:[]',
      'An all-manual group still has usageGroups:[]',
      'Declare actual unresolved meaning/conflict in your own reading',
      'Do not manufacture bookkeeping/offset/coverage uncertainties',
      'ordinary-gear-out-of-scope',
    ]) expect(prompt).toContain(required);
    for (const obsolete of ['Parent object claims do not support child values', 'partition the full candidate range',
      'begin with the usage label after optional Markdown', 'EXAMPLE_IR_FRAGMENT_JSON:']) expect(prompt).not.toContain(obsolete);
    const payload = JSON.parse(body.messages[1].content);
    expect(payload).toEqual({ source: 'monster', sourceSha256: 'hash', sourceLength: 7, candidate: { id: 'monster', label: 'Monster', start: 0, end: 7 } });
  });

  test('review prompt uses program candidate scope and concrete AI findings without ledger-driven source grammar', async () => {
    const requests: HttpRequest[] = [], ir = buildValidLurkerIr();
    const candidate = { id: 'review-scope', label: 'Lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE };
    const provider = makeProvider(async (_url, init) => {
      requests.push(init);
      return response(200, '{"schemaVersion":1,"verdict":"accepted","findings":[]}');
    });
    await provider.review({ source: LURKER_SOURCE, candidate, ir, markdown: '', actorProjection: {}, deterministicFindings: [] });
    const body = JSON.parse(requests[0]!.body), prompt = body.messages[0].content as string;
    expect(INTAKE_PROMPT_VERSIONS.review).toBe('monster-intake-review-v37-consolidated-full-ir');
    for (const required of [
      'Act as an independent AI content reviewer',
      'Return exactly {schemaVersion:1,verdict:accepted|revise|needs_review,findings:',
      'Accepted has no blocking finding; revise/needs_review must have an actual finding',
      'Program-provided candidate bounds define scope when present',
      'a model-authored coverage ledger must not shrink the review scope',
      'AI, not a deterministic source grammar, judges content',
      'printed AC stays fixed and ordinary inventory is intentionally omitted',
      'Unclassified 2024 melee/ranged attacks deliberately use a labelled GM attack roll',
      'Explicit AI uncertainties remain visible',
      'without enforcing per-leaf claims, whitespace coverage or a fixed grant-line grammar',
      'Do not call a supported shared pool ambiguous just because its source lacks a literal keyword',
      'Do not claim gameplay execution or script behavior that this projection cannot demonstrate',
      'EvidenceRef is {start:-1,end:-1,quote:string}',
    ]) expect(prompt).toContain(required);
    expect(prompt).not.toContain('usage evidence must cover the complete grant span');
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.source).toBe(LURKER_SOURCE);
    expect(payload.candidate).toEqual({ id: candidate.id, label: candidate.label, start: candidate.start, end: candidate.end });
    expect(payload.ir).toEqual(ir);
    for (const field of ['sourceLines', 'sourceProofClauses', 'sourceSpellGrants']) expect(payload).not.toHaveProperty(field);
  });

  test('repair prompt uses bounded patches and preserves source identity, valid fields and real AI uncertainty', async () => {
    const requests: HttpRequest[] = [], ir = buildValidLurkerIr();
    const candidate = { id: 'repair-scope', label: 'Lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE };
    const provider = makeProvider(async (_url, init) => {
      requests.push(init);
      return response(200, '{"schemaVersion":1,"operations":[]}');
    });
    const repaired = await provider.repair({ stage: 'deterministic-validation', source: LURKER_SOURCE, candidate, ir, deterministicFindings: [] });
    const body = JSON.parse(requests[0]!.body), prompt = body.messages[0].content as string;
    expect(INTAKE_PROMPT_VERSIONS.repair).toBe('monster-intake-repair-v41-consolidated-source-operations');
    expect(prompt).toContain(SOURCE_OPERATION_SCHEMA);
    for (const required of [
      'Repair only the supplied IR problems',
      'Return exactly {schemaVersion:1,operations:[{op:add|replace|remove,path,value?}]}',
      'at most 64 JSON Patch operations',
      'Paths stay under /creature, /claims, /coverage or /uncertainties',
      'never edit request source identity, final Actor JSON or unrelated data',
      'add/replace require value, remove omits value',
      'Preserve valid mechanics and complete rule text',
      'do not delete it merely to obtain an accepted status',
      'repair preserves ir.source',
      'The literal word Shared/each is not required',
      'Do not force a multi-spell ability to manual solely because its daily qualifier is in the title or parent sentence',
      'For a new default response, set claims:[] and coverage:[]',
      'EvidenceRef is {start:-1,end:-1,quote:string}',
    ]) expect(prompt).toContain(required);
    expect(prompt).not.toContain('EXAMPLE_IR_FRAGMENT_JSON:');
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.candidate).toEqual({ id: candidate.id, label: candidate.label, start: candidate.start, end: candidate.end });
    expect(payload.ir).toEqual(ir); expect(repaired).toEqual(ir);
    for (const field of ['sourceLines', 'sourceProofClauses', 'sourceSpellGrants']) expect(payload).not.toHaveProperty(field);
  });

  test('retries retryable 429 once and audits without secrets', async () => {
    let calls = 0;
    const audit: IntakeProviderAuditEvent[] = [];
    const provider = makeProvider(async () => {
      calls += 1;
      return calls === 1
        ? response(429, '{}')
        : response(200, '{"schemaVersion":1,"candidates":[]}');
    }, audit);
    await provider.discover({ source: 'text', sourceSha256: 'hash', chunkStart: 0, chunkEnd: 4 });
    expect(calls).toBe(2);
    expect(audit.map((event) => event.errorCode)).toEqual(['rate_limited', undefined]);
    expect(JSON.stringify(audit)).not.toContain('secret');
  });

  test('retries malformed JSON once, then fails closed', async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls += 1;
      return response(200, 'not json');
    });
    await expect(provider.discover({ source: 'x', sourceSha256: 'h', chunkStart: 0, chunkEnd: 1 }))
      .rejects.toMatchObject({ code: 'invalid_response', retryable: true });
    expect(calls).toBe(2);
  });

  test('retries an empty OAuth bridge response once', async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls += 1;
      return calls === 1
        ? response(200, '')
        : response(200, '{"schemaVersion":1,"candidates":[]}');
    });

    await expect(provider.discover({ source: 'x', sourceSha256: 'h', chunkStart: 0, chunkEnd: 1 }))
      .resolves.toEqual({ schemaVersion: 1, candidates: [] });
    expect(calls).toBe(2);
  });

  test('retries an incomplete extraction or repair IR once', async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls += 1;
      return calls === 1
        ? response(200, '{"schemaVersion":1,"creature":{}}')
        : response(200, '{"schemaVersion":1,"source":{"sha256":"hash","length":0},"creature":{},"claims":[],"coverage":[],"uncertainties":[]}');
    });

    await expect(provider.repair({} as never)).resolves.toMatchObject({ schemaVersion: 1, claims: [] });
    expect(calls).toBe(2);
  });

  test('applies a compact repair patch to the supplied IR without requiring a complete rewritten IR', async () => {
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      operations: [
        { op: 'replace', path: '/creature/attributes/ac', value: 20 },
        { op: 'remove', path: '/uncertainties/0' },
        { op: 'add', path: '/creature/actions/-', value: { name: 'Eye Ray', description: 'Source-backed ray.', evidence: [] } },
      ],
    })));
    const ir = {
      schemaVersion: 1,
      source: { sha256: 'hash', length: 0 },
      creature: { attributes: { ac: 19 }, actions: [] },
      claims: [],
      coverage: [],
      uncertainties: [{ id: 'old' }],
    };

    await expect(provider.repair({ stage: 'deterministic-validation', source: '', ir, deterministicFindings: [] } as never))
      .resolves.toMatchObject({
        creature: { attributes: { ac: 20 }, actions: [{ name: 'Eye Ray' }] },
        uncertainties: [],
      });
    expect(ir.creature.attributes.ac).toBe(19);
    expect(ir.creature.actions).toEqual([]);
  });

  test('rejects compact repair patches outside the governed IR roots', async () => {
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      operations: [{ op: 'replace', path: '/schemaVersion', value: 2 }],
    })));
    const ir = {
      schemaVersion: 1, source: { sha256: 'hash', length: 0 }, creature: {}, claims: [], coverage: [], uncertainties: [],
    };

    await expect(provider.repair({ stage: 'deterministic-validation', source: '', ir, deterministicFindings: [] } as never))
      .rejects.toMatchObject({ code: 'invalid_response', retryable: true });
  });

  test('repair failures retain safe JSON/schema paths without model values', async () => {
    const ir = {schemaVersion: 1, creature: {}, claims: [], coverage: [], uncertainties: []};
    const cases = [
      { content: '{"secret-value":', stage: 'json', path: '/', expected: 'object' },
      { content: JSON.stringify({schemaVersion: 1, operations: 'secret-value'}), stage: 'repair-envelope', path: '/operations', expected: 'array<=64' },
      { content: JSON.stringify({schemaVersion: 1, operations: [{op: 'secret-value', path: '/creature/name'}]}), stage: 'repair-operation', path: '/operations/0/op', expected: 'patch-op' },
      { content: JSON.stringify({schemaVersion: 1, operations: [{op: 'replace', path: '/secret-value', value: 'secret-value'}]}), stage: 'repair-operation', path: '/operations/0/path', expected: 'allowed-path' },
      { content: JSON.stringify({schemaVersion: 1, operations: [{op: 'add', path: '/creature/name'}]}), stage: 'repair-operation', path: '/operations/0/value', expected: 'present' },
      { content: JSON.stringify({schemaVersion: 1, operations: [{op: 'replace', path: '/claims', value: 'secret-value'}]}), stage: 'repair-operation', path: '/operations/0/path', expected: 'allowed-path' },
    ];
    for (const entry of cases) {
      const audit: IntakeProviderAuditEvent[] = [];
      const provider = makeProvider(async () => response(200, entry.content), audit);
      let caught: MonsterIntakeProviderError | undefined;
      try { await provider.repair({stage: 'deterministic-validation', source: '', ir, deterministicFindings: []} as never); }
      catch (error) { caught = error as MonsterIntakeProviderError; }
      expect(caught?.code).toBe('invalid_response');
      expect(caught?.diagnostic).toMatchObject({stage: entry.stage, path: entry.path, expected: entry.expected});
      expect(caught?.diagnosticMessage).not.toContain('secret-value');
      expect(JSON.stringify(audit)).not.toContain('secret-value');
      expect(audit.at(-1)?.diagnostic).toEqual(caught?.diagnostic);
    }
  });

  test('rejects a review finding that omits the required schema fields', async () => {
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{ severity: 'blocking', message: 'Unstructured reviewer prose.' }],
    })));

    await expect(provider.review({} as never)).rejects.toMatchObject({
      code: 'invalid_response',
      retryable: false,
    });
  });

  test.each([
    {
      label: 'malformed evidence elements',
      finding: {
        id: 'bad-evidence', code: 'BAD_EVIDENCE', path: '/', message: 'Malformed evidence.', blocking: true,
        evidence: [null, { start: '0', end: -1, quote: 42 }],
      },
    },
    {
      label: 'unknown finding key',
      finding: {
        id: 'extra', code: 'EXTRA', path: '/', message: 'Unexpected key.', blocking: true,
        severity: 'blocking',
      },
    },
    {
      label: 'evidence range whose UTF-16 length differs from quote',
      finding: {
        id: 'length', code: 'LENGTH', path: '/', message: 'Length mismatch.', blocking: true,
        evidence: [{ start: 0, end: 2, quote: 'x' }],
      },
    },
  ])('rejects malformed structured review finding: $label', async ({ finding }) => {
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [finding],
    })));

    await expect(provider.review({} as never)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  test('retries a review response with malformed evidence once', async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls += 1;
      return calls === 1
        ? response(200, JSON.stringify({
          schemaVersion: 1,
          verdict: 'revise',
          findings: [{
            id: 'bad-evidence', code: 'BAD_EVIDENCE', path: '/', message: 'Retry this finding.', blocking: true,
            evidence: [{ start: 0, end: 2, quote: 'x' }],
          }],
        }))
        : response(200, JSON.stringify({
          schemaVersion: 1,
          verdict: 'accepted',
          findings: [],
        }));
    });

    await expect(provider.review({} as never)).resolves.toEqual({
      schemaVersion: 1,
      verdict: 'accepted',
      findings: [],
    });
    expect(calls).toBe(2);
  });

  test('re-anchors a unique review evidence quote before enforcing the strict UTF-16 range contract', async () => {
    const source = 'prefix exact review quote suffix';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'offset', code: 'OFFSET', path: '/', message: 'Offset drift.', blocking: true,
        evidence: [{ start: 0, end: 2, quote: 'exact review quote' }],
      }],
    })));

    const review = await provider.review({ source } as never);
    expect(review.findings[0]!.evidence).toEqual([{
      start: source.indexOf('exact review quote'),
      end: source.indexOf('exact review quote') + 'exact review quote'.length,
      quote: 'exact review quote',
    }]);
  });

  test('re-anchors exact extraction evidence without replacing an explicitly empty spellcasting group id', async () => {
    const source = 'prefix\nInnate Spellcasting. Its spellcasting ability is Charisma.\nAt will: mage armor\nsuffix';
    const quote = 'Innate Spellcasting. Its spellcasting ability is Charisma.';
    const grant = 'At will: mage armor';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: {
        spellcasting: [{
          groupId: '',
          featureName: 'Innate Spellcasting',
          featureEnglishName: 'Innate Spellcasting',
          description: quote,
          evidence: [{ start: 0, end: 1, quote }],
          ability: 'cha',
          abilityEvidence: [{ start: 0, end: 1, quote: 'spellcasting ability is Charisma' }],
          usageGroups: [{
            usage: 'at-will',
            evidence: [{ start: 0, end: 1, quote: grant }],
            spellRefs: [{
              refId: 'mage-armor', identifier: 'mage-armor', originalName: 'mage armor', aliases: ['mage armor'],
              evidence: [{ start: 0, end: 1, quote: 'mage armor' }],
            }],
          }],
        }],
      },
      claims: [{
        path: '/creature/spellcasting/0', valueKind: 'explicit', confidence: 'high',
        evidence: [{ start: 0, end: 1, quote }],
      }],
      coverage: [{
        start: 0, end: 1, quote: source, classification: 'mechanical',
        claimPaths: ['/creature/spellcasting/0'],
      }],
      uncertainties: [],
    })));

    const result = await provider.extract({
      source,
      sourceSha256: 'hash',
      candidate: { id: 'candidate', label: 'Candidate', start: 0, end: source.length, quote: source },
    });
    const group = result.creature.spellcasting![0]!;
    expect(group.groupId).toBe('');
    expect(validateMonsterIntakeIR(source, result).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_STRUCTURE', path: '/creature/spellcasting/0/groupId',
    }));
    expect(group.evidence).toEqual([{
      start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote,
    }]);
    expect(group.usageGroups[0]!.evidence[0]).toEqual({
      start: source.indexOf(grant), end: source.indexOf(grant) + grant.length, quote: grant,
    });
    expect(result.coverage[0]).toMatchObject({ start: 0, end: source.length, quote: source });
  });

  test('restores request-owned source identity and preserves the AI empty spellcasting collection', async () => {
    const source = 'Clockwork scout\nArmor Class 13';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'provider-invented', length: 999 },
      creature: { spellcasting: [] },
      claims: [],
      coverage: [],
      uncertainties: [],
    })));

    const result = await provider.extract({
      source,
      sourceSha256: 'request-owned-sha256',
      candidate: { id: 'scout', label: 'Scout', start: 0, end: source.length, quote: source },
    });

    expect(result.source).toEqual({ sha256: 'request-owned-sha256', length: source.length });
    expect(result.creature as unknown).toEqual({ spellcasting: [] });
  });

  test('preserves AI caster levels in both innate and prepared groups without deriving them from prose', async () => {
    const source = [
      'Innate Spellcasting. At will: mage armor.',
      'Spellcasting. The mage is a 5th-level spellcaster. 1st level (4 slots): shield.',
    ].join('\n');
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: {
        spellcasting: [
          {
            groupId: 'innate', featureName: 'Innate Spellcasting', casterLevel: 9,
            casterLevelEvidence: [{ start: 0, end: 1, quote: 'Innate Spellcasting' }],
            usageGroups: [{ usage: 'at-will', evidence: [], spellRefs: [] }],
          },
          {
            groupId: 'prepared', featureName: 'Spellcasting', casterLevel: 5,
            casterLevelEvidence: [{ start: 0, end: 1, quote: '5th-level spellcaster' }],
            usageGroups: [{ usage: 'prepared-slots', level: 1, slots: 4, evidence: [], spellRefs: [] }],
          },
        ],
      },
      claims: [], coverage: [], uncertainties: [],
    })));

    const result = await provider.extract({
      source,
      sourceSha256: 'hash',
      candidate: { id: 'mage', label: 'Mage', start: 0, end: source.length, quote: source },
    });

    expect(result.creature.spellcasting?.[0]).toMatchObject({ casterLevel: 9 });
    expect(result.creature.spellcasting?.[0]!.casterLevelEvidence).toEqual([{
      start: 0, end: 'Innate Spellcasting'.length, quote: 'Innate Spellcasting',
    }]);
    expect(result.creature.spellcasting?.[1]).toMatchObject({ casterLevel: 5 });
  });

  test('preserves both AI-declared attack records without classifying Multiattack prose', async () => {
    const multiattack = 'Multiattack. The lurker makes two Claw attacks.';
    const claw = 'Claw. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.';
    const source = `${multiattack}\n${claw}`;
    const evidence = (quote: string) => ({
      start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote,
    });
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: {
        actions: [
          {
            name: '多重攻击（Multiattack）', description: multiattack, activityType: 'attack', evidence: [evidence(multiattack)],
            attack: { type: 'mwak', toHit: 0, reach: 5 },
          },
          {
            name: 'Claw', description: claw, activityType: 'attack', evidence: [evidence(claw)],
            attack: { type: 'mwak', toHit: 4, reach: 5 },
          },
        ],
      },
      claims: [], coverage: [], uncertainties: [],
    })));

    const result = await provider.extract({
      source,
      sourceSha256: 'hash',
      candidate: { id: 'lurker', label: 'Lurker', start: 0, end: source.length, quote: source },
    });

    expect(result.creature.actions?.[0]).toMatchObject({
      name: '多重攻击（Multiattack）', description: multiattack, activityType: 'attack', evidence: [evidence(multiattack)],
      attack: { type: 'mwak', toHit: 0, reach: 5 },
    });
    expect(result.creature.actions?.[1]).toMatchObject({
      name: 'Claw', activityType: 'attack', attack: { type: 'mwak', toHit: 4, reach: 5 },
    });
  });

  test('restores Lurker source identity while keeping every AI mechanic and optional collection', async () => {
    const ir = buildValidLurkerIr();
    ir.source = { sha256: 'provider-drift', length: LURKER_SOURCE.length + 77 };
    ir.creature.spellcasting = [];
    const multiattack = ir.creature.actions![0]!;
    multiattack.activityType = 'attack';
    multiattack.attack = { type: 'mwak', toHit: 0, reach: 5 };
    const before = structuredClone(ir);
    const provider = makeProvider(async () => response(200, JSON.stringify(ir)));
    const candidate = {
      id: 'lurker', label: 'Lurker in the Dark', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    };

    const normalized = await provider.extract({
      source: LURKER_SOURCE,
      sourceSha256: buildValidLurkerIr().source.sha256,
      candidate,
    });

    expect(normalized.source).toEqual({ sha256: buildValidLurkerIr().source.sha256, length: LURKER_SOURCE.length });
    expect(normalized.creature).toEqual(before.creature);
    expect(normalized.creature.spellcasting).toEqual([]);
    expect(ir).toEqual(before);
    expect(validateMonsterIntakeIR(LURKER_SOURCE, normalized, { coverageRange: candidate }).blocking).toEqual([]);
  });

  test.each([
    { label: 'null', legendary: null },
    { label: 'array', legendary: [] },
    { label: 'empty string', legendary: '' },
    { label: 'empty object', legendary: {} },
    { label: 'invented zero object', legendary: { max: 0, preamble: '', evidence: [] } },
  ])('preserves invalid AI legendary value $label and reports its structure regardless of prose', async ({ legendary }) => {
    const source = 'Claw. Melee Weapon Attack: +4 to hit.';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: { legendary }, claims: [], coverage: [], uncertainties: [],
    })));

    const result = await provider.extract({
      source, sourceSha256: 'hash',
      candidate: { id: 'claw', label: 'Claw', start: 0, end: source.length, quote: source },
    });

    expect((result.creature as any).legendary).toEqual(legendary);
    expect(validateMonsterIntakeIR(source, result).blocking.some(finding => finding.path.startsWith('/creature/legendary'))).toBe(true);
  });

  test('reports invalid legendary metadata as a shape error when the prose mentions legendary actions', async () => {
    const source = 'Legendary Actions. The dragon can take 3 legendary actions.';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: { legendary: null }, claims: [], coverage: [], uncertainties: [],
    })));

    const result = await provider.extract({
      source, sourceSha256: 'hash',
      candidate: { id: 'dragon', label: 'Dragon', start: 0, end: source.length, quote: source },
    });

    expect((result.creature as any).legendary).toBeNull();
    expect(validateMonsterIntakeIR(source, result).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_STRUCTURE', path: '/creature/legendary',
    }));
  });

  test('preserves valid source-backed legendary metadata', async () => {
    const source = 'Legendary Actions. The dragon can take 3 legendary actions.';
    const preamble = 'The dragon can take 3 legendary actions.';
    const start = source.indexOf(preamble);
    const legendary = { max: 3, preamble, evidence: [{ start, end: start + preamble.length, quote: preamble }] };
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: { legendary }, claims: [], coverage: [], uncertainties: [],
    })));

    const result = await provider.extract({
      source, sourceSha256: 'hash',
      candidate: { id: 'dragon', label: 'Dragon', start: 0, end: source.length, quote: source },
    });

    expect(result.creature.legendary).toEqual(legendary);
  });

  test('keeps ambiguous extraction evidence invalid instead of guessing between equal source occurrences', async () => {
    const source = 'same marker / same marker';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      source: { sha256: 'hash', length: source.length },
      creature: {},
      claims: [{
        path: '/creature/identity/name', valueKind: 'explicit', confidence: 'high',
        evidence: [{ start: 7, end: 8, quote: 'same marker' }],
      }],
      coverage: [],
      uncertainties: [],
    })));

    const result = await provider.extract({
      source,
      sourceSha256: 'hash',
      candidate: { id: 'candidate', label: 'Candidate', start: 0, end: source.length, quote: source },
    });
    expect(result.claims[0]!.evidence[0]).toEqual({ start: 7, end: 8, quote: 'same marker' });
  });

  test('formats missing technical IDs, ability notation and evidence without filling omitted AI aliases', async () => {
    const ir = buildRatWarlockIr();
    const statblockStart = RAT_WARLOCK_SOURCE.indexOf('鼠神邪术师 Warlock of the Rat God', 1);
    const candidate = {
      id: 'rat-warlock', label: '鼠神邪术师', start: statblockStart,
      end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE.slice(statblockStart),
    };
    const groupEvidence = ir.creature.spellcasting![0]!.evidence[0]!;
    const usageStarts = ir.creature.spellcasting![0]!.usageGroups.map((usageGroup) => usageGroup.evidence[0]!.start);
    const coverageBreaks = [candidate.start, groupEvidence.start, ...usageStarts, groupEvidence.end + 2, candidate.end];
    ir.coverage = coverageBreaks.slice(0, -1).map((start, index) => {
      const end = coverageBreaks[index + 1]!;
      return {
        start, end, quote: RAT_WARLOCK_SOURCE.slice(start, end), classification: 'mechanical' as const,
        claimPaths: ir.claims.map((claim) => claim.path).filter((path) => (
          path !== '/creature/spellcasting/0' || (start === groupEvidence.start && end === usageStarts[0])
        )),
      };
    });
    delete (ir.creature.spellcasting![0] as any).groupId;
    delete (ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0] as any).refId;
    (ir.creature.spellcasting![0] as any).ability = 'charisma';
    for (const usageGroup of ir.creature.spellcasting![0]!.usageGroups) {
      for (const spellRef of usageGroup.spellRefs) delete (spellRef as any).aliases;
    }
    driftEveryEvidenceRange(ir);
    const before = structuredClone(ir);
    const provider = makeProvider(async () => response(200, JSON.stringify(ir)));

    const normalized = await provider.extract({
      source: RAT_WARLOCK_SOURCE,
      sourceSha256: ir.source.sha256,
      candidate,
    });

    expect(normalized.creature.spellcasting![0]!.groupId).toBe('casting-1');
    expect(normalized.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.refId).toBe('spell-1-1-1');
    expect(normalized.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[1]!.refId).toBe(before.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[1]!.refId);
    expect(normalized.creature.spellcasting![0]!.ability).toBe('cha');
    expect(normalized.creature.spellcasting![0]!.usageGroups.every((usageGroup) => (
      usageGroup.spellRefs.every((spellRef) => !Object.hasOwn(spellRef, 'aliases'))
    ))).toBe(true);
    const findings = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, normalized, { coverageRange: candidate }).blocking;
    const refs = normalized.creature.spellcasting![0]!.usageGroups.flatMap(group => group.spellRefs);
    expect(findings).toHaveLength(refs.length);
    expect(findings.every(finding => finding.path.endsWith('/aliases') && finding.code === 'INVALID_STRUCTURE')).toBe(true);
    expect(ir).toEqual(before);
  });

  test('rebinds a unique review evidence quote when only source whitespace was compressed', async () => {
    const source = 'prefix exact\nreview quote suffix';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'whitespace', code: 'WHITESPACE', path: '/', message: 'Whitespace drift.', blocking: true,
        evidence: [{ start: 0, end: 2, quote: 'exact review quote' }],
      }],
    })));

    const review = await provider.review({ source } as never);
    const start = source.indexOf('exact\nreview quote');
    expect(review.findings[0]!.evidence).toEqual([{
      start,
      end: start + 'exact\nreview quote'.length,
      quote: 'exact\nreview quote',
    }]);
  });

  test('rebinds a close reported review range when the model changes at most two characters', async () => {
    const source = 'prefix exact review quote suffix';
    const provider = makeProvider(async () => response(200, JSON.stringify({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'close-range', code: 'CLOSE_RANGE', path: '/', message: 'One copied character drifted.', blocking: true,
        evidence: [{ start: 7, end: 25, quote: 'exact reView quote' }],
      }],
    })));

    const review = await provider.review({ source } as never);
    expect(review.findings[0]!.evidence).toEqual([{
      start: 7,
      end: 25,
      quote: 'exact review quote',
    }]);
  });

  test.each([
    {
      label: 'revise with no findings',
      payload: { schemaVersion: 1, verdict: 'revise', findings: [] },
    },
    {
      label: 'accepted with a blocking finding',
      payload: {
        schemaVersion: 1,
        verdict: 'accepted',
        findings: [{ id: 'real', code: 'REAL', path: '/', message: 'Still blocking.', blocking: true }],
      },
    },
  ])('rejects inconsistent review response: $label', async ({ payload }) => {
    const provider = makeProvider(async () => response(200, JSON.stringify(payload)));
    await expect(provider.review({} as never)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  test.each([
    {
      label: 'revise with one structured blocking finding',
      payload: {
        schemaVersion: 1,
        verdict: 'revise',
        findings: [{ id: 'real', code: 'REAL', path: '/creature/ac', message: 'Actual drift.', blocking: true }],
      },
    },
    {
      label: 'accepted with one structured nonblocking warning',
      payload: {
        schemaVersion: 1,
        verdict: 'accepted',
        findings: [{ id: 'warning', code: 'WARNING', path: '/', message: 'Literal limitation.', blocking: false }],
      },
    },
  ])('accepts consistent structured review response: $label', async ({ payload }) => {
    const provider = makeProvider(async () => response(200, JSON.stringify(payload)));
    await expect(provider.review({} as never)).resolves.toEqual(payload as any);
  });

  test('bounds all timeout attempts to one total stage budget', async () => {
    let calls = 0;
    const provider = makeProvider(async (_url, init) => {
      calls += 1;
      await new Promise<void>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      return response(200, '{}');
    }, [], 5);
    await expect(provider.discover({ source: 'x', sourceSha256: 'h', chunkStart: 0, chunkEnd: 1 }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });
    expect(calls).toBe(1);
  });
});

describe('strict provider JSON parsing', () => {
  test('allows a removable leading reasoning wrapper and JSON fence', () => {
    expect(parseStrictJson('<think>private</think>```json\n{"schemaVersion":1}\n```'))
      .toEqual({ schemaVersion: 1 });
  });

  test('recovers a bounded duplicated closing brace from the OAuth bridge', () => {
    expect(parseStrictJson('{"schemaVersion":1,"creature":{}}}'))
      .toEqual({ schemaVersion: 1, creature: {} });
  });

  test('rejects trailing text and unresolved reasoning', () => {
    expect(() => parseStrictJson('{"a":1} trailing')).toThrow(MonsterIntakeProviderError);
    expect(() => parseStrictJson('{"a":"<think>"}')).toThrow(MonsterIntakeProviderError);
  });
});

function makeProvider(
  httpClient: HttpClient,
  audit: IntakeProviderAuditEvent[] = [],
  timeoutMs = 60_000,
  repairTimeoutMs = Math.max(timeoutMs, 180_000),
): OpenAICompatibleMonsterIntakeProvider {
  return new OpenAICompatibleMonsterIntakeProvider({
    authMode: 'api-key',
    apiKey: 'secret',
    baseUrl: 'https://example.test/v1',
    model: 'extractor',
    reviewModel: 'reviewer',
    timeoutMs,
    repairTimeoutMs,
    httpClient,
    audit: (event) => audit.push(event),
  });
}

function driftEveryEvidenceRange(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(driftEveryEvidenceRange);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.quote === 'string' && Number.isInteger(record.start) && Number.isInteger(record.end)) {
    record.start = Math.max(0, (record.start as number) - 1);
    record.end = Math.max((record.start as number) + 1, (record.end as number) - 1);
  }
  Object.values(record).forEach(driftEveryEvidenceRange);
}

describe('ordinary model source line references (format checks, no live AI)',()=>{
  test('the AI chooses the full manual grant with an exact line subquote, without a grant-token catalog',()=>{
    const token='Shapechange (Beast or Humanoid form only, no\nTemporary Hit Points gained from the spell)',source='At Will: '+token+', Speak with Animals\n';
    const selected={firstLineId:'L1',lastLineId:'L2',quote:token};
    const exact={start:9,end:9+token.length,quote:token};
    expect(materializeSourceLineReferences(source,{manualGrants:[selected]})).toEqual({manualGrants:[exact]});
    expect(materializeSourceLineReferences(source,{manualGrants:[exact]})).toEqual({manualGrants:[exact]});
    expect(materializeSourceLineReferences(source,{manualGrants:[{grantId:'G1'}]})).toEqual({manualGrants:[{grantId:'G1'}]});
    const invalid=buildRatWarlockIr();invalid.creature.spellcasting![0]!.manualGrants=[{grantId:'G1'}] as any;
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,invalid).blocking.some(row=>row.path.includes('/manualGrants/0/'))).toBe(true);
    for(const value of [{manualGrants:[{...selected,lastLineId:'L9'}]},{manualGrants:[{...selected,quote:'not in the source'}]},{manualGrants:[{...selected,start:9,end:99}]}])
      expect(()=>materializeSourceLineReferences(source,value)).toThrow();
    expect(materializeSourceLineReferences('0/Day: Unknown\n',{description:{firstLineId:'L1',lastLineId:'L1'}}))
      .toEqual({description:'0/Day: Unknown\n'});
  });
  test('formats an omitted spell lookup from AI-declared names and preserves an explicit different identity',async()=>{
    const original=buildRatWarlockIr(),candidate={id:'source-identity',label:'Rat Warlock',start:0,end:RAT_WARLOCK_SOURCE.length,quote:''};
    candidate.quote=RAT_WARLOCK_SOURCE.slice(candidate.start);
    for(const conflict of [false,true]){
      const reply:any=structuredClone(original);
      for(const group of reply.creature.spellcasting)for(const usage of group.usageGroups)for(const ref of usage.spellRefs)delete ref.identifier;
      if(conflict)reply.creature.spellcasting[0].usageGroups[0].spellRefs[0].identifier='wrong-spell-identity';
      const provider=makeProvider(async()=>response(200,JSON.stringify(reply)));
      const normalized=await provider.extract({source:RAT_WARLOCK_SOURCE,sourceSha256:original.source.sha256,candidate});
      const ref=normalized.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!;
      expect(ref.identifier).toBe(conflict?'wrong-spell-identity':ref.englishName??ref.originalName);
      const errors=validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,normalized,{coverageRange:candidate}).blocking;
      expect(errors).toEqual([]);
    }
  });
  test('still rejects evidence outside the selected candidate instead of hiding a scope mismatch during formatting',async()=>{
    const original=buildRatWarlockIr(),start=RAT_WARLOCK_SOURCE.indexOf('鼠神邪术师 Warlock of the Rat God',1);
    const candidate={id:'scope',label:'Rat Warlock',start,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE.slice(start)};
    const provider=makeProvider(async()=>response(200,JSON.stringify(original)));
    const normalized=await provider.extract({source:RAT_WARLOCK_SOURCE,sourceSha256:original.source.sha256,candidate});
    expect(normalized.coverage[0]).toEqual(original.coverage[0]);
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,normalized,{coverageRange:candidate}).blocking).toContainEqual(expect.objectContaining({code:'EVIDENCE_OUT_OF_RANGE',path:'/coverage/0'}));
  });
  test('selects the complete attack proof including the Hit clause after the ft abbreviation',()=>{
    const source='Rend. Melee Attack Roll: +11, reach 10 ft. Hit: 15 (2d8\n+ 6) Slashing damage plus 7 (2d6) Poison damage.\n';
    const catalog=sourceProofCatalog(source);
    expect(catalog).toEqual([{id:'P1',text:'Rend.'},{id:'P2',text:source.slice(6).trim()}]);
    expect(materializeSourceLineReferences(source,{proof:{attack:{clauseId:'P2'},damage:[{clauseId:'P2'}]}}))
      .toEqual({proof:{attack:source.slice(6).trim(),damage:[source.slice(6).trim()]}});
  });
  test('rejects unknown, mixed and misplaced proof references within the same candidate bounds',()=>{
    const source='Other.\nSave DC 12.\n',range={start:7,end:source.length};
    expect(sourceProofCatalog(source,range)).toEqual([{id:'P1',text:'Save DC 12.'}]);
    for(const value of [{proof:{save:{clauseId:'P2'}}},{description:{clauseId:'P1'}},{proof:{save:{clauseId:'P1',quote:'Other.'}}}])
      expect(()=>materializeSourceLineReferences(source,value,range)).toThrow();
  });
  for(const newline of ['\n','\r\n','\r'])test(`copies selected lines and computes exact Unicode positions ${JSON.stringify(newline)}`,()=>{
    const prefix='Other creature'+newline,body='Probe 🐉'+newline+'HP 7 (3d4)'+newline+'Save DC 12.'+newline,source=prefix+body+'Outside';
    const range={start:prefix.length,end:prefix.length+body.length};
    expect(sourceLineCatalog(source,range)).toEqual([{id:'L1',text:'Probe 🐉'},{id:'L2',text:'HP 7 (3d4)'},{id:'L3',text:'Save DC 12.'}]);
    const proposal={description:{firstLineId:'L2',lastLineId:'L3'},evidence:[{firstLineId:'L2',lastLineId:'L2',quote:'3d4'}],coverage:[{firstLineId:'L1',lastLineId:'L3',classification:'mechanical',claimPaths:['/creature/test']}]};
    const before=structuredClone(proposal),actual:any=materializeSourceLineReferences(source,proposal,range);
    expect(proposal).toEqual(before);expect(actual.description).toBe('HP 7 (3d4)'+newline+'Save DC 12.'+newline);
    const at=source.indexOf('3d4');expect(actual.evidence).toEqual([{start:at,end:at+3,quote:'3d4'}]);
    expect(actual.coverage).toEqual([{...range,quote:body,classification:'mechanical',claimPaths:['/creature/test']}]);
  });
  test('copies proof sentences and restriction text without changing words',()=>{
    const source='Save DC 12.\nFailure: 7 (2d6) fire damage.\n(level 3 version)\n';
    const actual:any=materializeSourceLineReferences(source,{proof:{save:{firstLineId:'L1',lastLineId:'L1'},damage:[{firstLineId:'L2',lastLineId:'L2'}]},restriction:{text:{firstLineId:'L3',lastLineId:'L3',quote:'(level 3 version)'}}});
    expect(actual.proof).toEqual({save:'Save DC 12.\n',damage:['Failure: 7 (2d6) fire damage.\n']});expect(actual.restriction.text).toBe('(level 3 version)');
  });
  for(const ref of [
    {firstLineId:'L0',lastLineId:'L1'}, {firstLineId:'L2',lastLineId:'L1'}, {firstLineId:'L1',lastLineId:'L9'},
    {firstLineId:'L1'}, {firstLineId:'L1',lastLineId:'L1',start:0,end:4},
    {firstLineId:'L1',lastLineId:'L1',quote:'its ability'},
    {firstLineId:'L2',lastLineId:'L2',quote:'HP 7'},
  ])test('rejects bad, mixed, paraphrased or ambiguous references '+JSON.stringify(ref),()=>{
    expect(()=>materializeSourceLineReferences('the ability\nHP 7 HP 7\n',{evidence:[ref]})).toThrow();
  });
  test('retains the legacy numeric reply and cannot select another candidate',()=>{
    const source='Other\nHP 7\n',legacy={evidence:[{start:6,end:10,quote:'HP 7'}],number:99};
    expect(materializeSourceLineReferences(source,legacy)).toEqual(legacy);
    expect(()=>materializeSourceLineReferences(source,{evidence:[{firstLineId:'L2',lastLineId:'L2'}]},{start:0,end:6})).toThrow();
  });
  test('the default request sends source once while the historical line-based reply reader stays compatible',async()=>{
    const original=buildValidLurkerIr(),reply:any=structuredClone(original),ref=reply.claims[0].evidence[0];
    const catalog=sourceLineCatalog(LURKER_SOURCE);
    reply.claims[0].evidence[0]={firstLineId:'L1',lastLineId:catalog.at(-1)!.id,quote:ref.quote};
    const requests:HttpRequest[]=[];
    const provider=makeProvider(async(_url,init)=>{requests.push(init);return response(200,JSON.stringify(reply));});
    const actual=await provider.extract({source:LURKER_SOURCE,sourceSha256:original.source.sha256,candidate:{id:'source-lines',label:'Lurker',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE}});
    const content=JSON.parse(requests[0]!.body).messages[1].content,payload=JSON.parse(content);
    expect(payload.source).toBe(LURKER_SOURCE);expect(payload.sourceLength).toBe(LURKER_SOURCE.length);
    expect(payload.candidate).toEqual({id:'source-lines',label:'Lurker',start:0,end:LURKER_SOURCE.length});
    for(const field of ['sourceLines','sourceProofClauses','sourceSpellGrants'])expect(payload).not.toHaveProperty(field);
    expect(content.split(JSON.stringify(LURKER_SOURCE)).length-1).toBe(1);
    expect(actual.claims[0]!.evidence).toEqual(original.claims[0]!.evidence);
    expect(validateMonsterIntakeIR(LURKER_SOURCE,actual).blocking).toEqual([]);
  });
});

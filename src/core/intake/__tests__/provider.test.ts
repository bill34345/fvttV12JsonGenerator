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

  test('extraction prompt requires numeric CR, leaf claims, and exact full coverage', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const provider = makeProvider(async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"creature":{},"claims":[],"coverage":[],"uncertainties":[]}');
    });

    await provider.extract({
      source: 'monster',
      sourceSha256: 'hash',
      candidate: { id: 'monster', label: 'Monster', start: 0, end: 7, quote: 'monster' },
    });

    const body = JSON.parse(requests[0]!.init.body) as { messages: Array<{ content: string }> };
    const prompt = body.messages[0]!.content;
    expect(INTAKE_PROMPT_VERSIONS.extract).toBe('monster-intake-extract-v15');
    expect(prompt).toContain('biography is optional string prose, never an array or object');
    expect(prompt).toContain('cr must be a JSON number');
    expect(prompt).toContain('Parent object claims do not support child values');
    expect(prompt).toContain('partition the full candidate range');
    expect(prompt).toContain('activationType(action|bonus|reaction|legendary|special)');
    expect(prompt).toContain('regardless of which section contains the feature');
    expect(prompt).toContain('Never use special merely because a feature appears under traits');
    expect(prompt).toContain('If a save DC is explicit but its ability is not');
    expect(prompt).toContain('do not emit structured save automation');
    expect(prompt).toContain('canonical hybrid representation');
    expect(prompt).toContain('legendaryCost is a supported feature field');
    expect(prompt).toContain('printed average damage');
    expect(prompt).toContain('Medium (any race)');
    expect(prompt).toContain('explicitly granted spells only');
    expect(prompt).toContain('never invent expectedLevel, expectedSchool, sourceBookHint, UUID, rules text, damage, or effects');
    expect(prompt).toContain('usageGroups');
    expect(prompt).toContain('prepared-cantrip');
    expect(prompt).toContain('prepared-slots');
    expect(prompt).toContain('casterLevelEvidence');
    expect(prompt).toContain('levelEvidence');
    expect(prompt).toContain('slotsEvidence');
    expect(prompt.toLowerCase()).toContain('never infer spell levels, slot counts, or caster level from spell names');
    expect(prompt).toContain('evidence to every spell, saveDc, attackBonus, component waiver, and restriction');
    expect(prompt).toContain('Do not also emit structured spellcasting as an ordinary trait');
    expect(prompt).toContain('complete literal grant line or span');
    expect(prompt).toContain('each Spell ref and restriction evidence range must be contained');
    expect(prompt).toContain('description must exactly equal one complete verified source slice');
    expect(prompt).toContain('minimal, self-contained grant span');
    expect(prompt).toContain('begin with the usage label after optional Markdown');
    expect(prompt).toContain('standalone list conjunctions');
    expect(prompt).toContain('exact keys {kind,text,value,evidence}');
    expect(prompt).toContain('Never use literal or literalValue as restriction keys');
    expect(prompt).toContain('complete explicit spellcasting group block including every usage grant');
    expect(prompt).toContain('Ability evidence must be a complete source clause that explicitly binds the chosen ability to spellcasting');
    expect(prompt).toContain('not a bare ability token or partial clause suffix');
    expect(prompt).toContain('Every non-separator source phrase inside a usage grant');
    expect(prompt).toContain('including parenthetical count, target, summoning, or casting limitations');
    expect(prompt).toContain('represented by spell or restriction evidence');
    expect(prompt).toContain('Spell-ref evidence must cover only the literal spell identity or name phrase');
    expect(prompt).toContain('must exclude any parenthetical or limitation text represented by a restriction');
    expect(prompt).toContain('Spell-ref and restriction evidence ranges');
    expect(prompt).toContain('must be disjoint');
    expect(prompt).toContain('Omit nullable senses and attack range fields when the source does not state them');
    expect(prompt).toContain('never encode absence as numeric 0');
    expect(prompt).toContain('hover is an optional JSON boolean');
    expect(prompt).toContain('Biography, when present, must remain one JSON string');
    expect(prompt).toContain('languages.custom is an optional JSON string, never an array or object');
    expect(prompt).toContain('defenses use all four empty arrays');
    expect(prompt).toContain('Do not emit an evidence claim or uncertainty solely because the source omits that optional list section');
    expect(prompt).toContain('not an inferred immunity, resistance, skill, or language');
    expect(prompt).toContain('Uncertainties are only for actual source ambiguity or conflict');
    expect(prompt).toContain('Never emit provider bookkeeping uncertainty or ask a downstream validator to check offsets or slices');
  });

  test('review prompt independently checks source action economy against IR and Actor activation', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const provider = makeProvider(async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"verdict":"accepted","findings":[]}');
    });

    await provider.review({} as never);

    const body = JSON.parse(requests[0]!.init.body) as { messages: Array<{ content: string }> };
    const prompt = body.messages[0]!.content;
    expect(INTAKE_PROMPT_VERSIONS.review).toBe('monster-intake-review-v20');
    expect(prompt).toContain('source explicitly says bonus action');
    expect(prompt).toContain('special, passive, or empty');
    expect(prompt).toContain('护甲等级：<base AC>（<literal condition>）');
    expect(prompt).toContain('same structured spellcasting contract');
    expect(prompt).toContain('prepared-cantrip');
    expect(prompt).toContain('prepared-slots');
    expect(prompt).toContain('casterLevelEvidence');
    expect(prompt.toLowerCase()).toContain('never infer spell levels, slot counts, or caster level from spell names');
    expect(prompt).toContain('explicitly granted');
    expect(prompt).toContain('usage evidence must cover the complete grant span');
    expect(prompt).toContain('visible description must match verified group evidence');
    expect(prompt).toContain('minimal and self-contained');
    expect(prompt).toContain('null/undefined/omitted are equivalent');
    expect(prompt).toContain('fixed diagnostic shape');
    expect(prompt).toContain('never report those placeholders');
    expect(prompt).toContain('exact keys {kind,text,value,evidence}');
    expect(prompt).toContain('Never use literal or literalValue as restriction keys');
    expect(prompt).toContain('complete explicit spellcasting group block including every usage grant');
    expect(prompt).toContain('Ability evidence must be a complete source clause that explicitly binds the chosen ability to spellcasting');
    expect(prompt).toContain('not a bare ability token or partial clause suffix');
    expect(prompt).toContain('Every non-separator source phrase inside a usage grant');
    expect(prompt).toContain('including parenthetical count, target, summoning, or casting limitations');
    expect(prompt).toContain('represented by spell or restriction evidence');
    expect(prompt).toContain('Spell-ref evidence must cover only the literal spell identity or name phrase');
    expect(prompt).toContain('must exclude any parenthetical or limitation text represented by a restriction');
    expect(prompt).toContain('Spell-ref and restriction evidence ranges');
    expect(prompt).toContain('must be disjoint');
    expect(prompt).toContain('Omit nullable senses and attack range fields when the source does not state them');
    expect(prompt).toContain('never encode absence as numeric 0');
    expect(prompt).toContain('Biography, when present, must remain one JSON string');
    expect(prompt).toContain('Uncertainties are only for actual source ambiguity or conflict');
    expect(prompt).toContain('Never emit provider bookkeeping uncertainty or ask a downstream validator to check offsets or slices');
    expect(prompt).toContain('must create exactly one visible feat item');
    expect(prompt).toContain('two views of the same generated feature');
    expect(prompt).toContain('Report duplication only if creature.traits independently contains an additional spellcasting feature');
    expect(prompt).toContain('findings must contain only actual unresolved defects');
    expect(prompt).toContain('Do not echo a dismissed candidate finding');
    expect(prompt).toContain('法术清单 metadata plus that one generated feat is not two traits');
    expect(prompt).toContain('defenses use all four empty arrays');
    expect(prompt).toContain('Each finding must use exactly {id,code,path,message,blocking,evidence?}');
    expect(prompt).toContain('/creature/attributes/ac claim and its exact evidence jointly support base AC and acNote');
    expect(prompt).toContain('do not require a second acNote claim');
  });

  test('repair prompt preserves the same source-evidenced spellcasting boundary', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const provider = makeProvider(async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"source":{"sha256":"hash","length":0},"creature":{},"claims":[],"coverage":[],"uncertainties":[]}');
    });

    await provider.repair({} as never);

    const body = JSON.parse(requests[0]!.init.body) as { messages: Array<{ content: string }> };
    const prompt = body.messages[0]!.content;
    expect(INTAKE_PROMPT_VERSIONS.repair).toBe('monster-intake-repair-v15');
    expect(prompt).toContain('Return a compact JSON Patch envelope only');
    expect(prompt).toContain('Do not repeat the complete MonsterIntakeIR');
    expect(prompt).toContain('at most 64 operations');
    expect(prompt).toContain('same structured spellcasting contract');
    expect(prompt).toContain('prepared-cantrip');
    expect(prompt).toContain('prepared-slots');
    expect(prompt).toContain('casterLevelEvidence');
    expect(prompt.toLowerCase()).toContain('never infer spell levels, slot counts, or caster level from spell names');
    expect(prompt).toContain('Do not invent');
    expect(prompt).toContain('exact keys {kind,text,value,evidence}');
    expect(prompt).toContain('Never use literal or literalValue as restriction keys');
    expect(prompt).toContain('complete explicit spellcasting group block including every usage grant');
    expect(prompt).toContain('deterministic-validation stage may run before Markdown or Actor projection exists');
    expect(prompt).toContain('Every EvidenceRef must use exact keys {start,end,quote}');
    expect(prompt).toContain('quote must be non-empty and exactly equal source.slice(start,end)');
    expect(prompt).toContain('absolute JavaScript UTF-16 offsets');
    expect(prompt).toContain('Start from the supplied IR and patch only paths implicated by the supplied findings');
    expect(prompt).toContain('Unchanged fields and evidence are preserved by the caller');
    expect(prompt).toContain('Never drop quote or fabricate quote text from offsets');
    expect(prompt).toContain('keep a blocking uncertainty instead of claiming the IR is repaired');
    expect(prompt).toContain('Ability evidence must be a complete source clause that explicitly binds the chosen ability to spellcasting');
    expect(prompt).toContain('not a bare ability token or partial clause suffix');
    expect(prompt).toContain('Every non-separator source phrase inside a usage grant');
    expect(prompt).toContain('including parenthetical count, target, summoning, or casting limitations');
    expect(prompt).toContain('represented by spell or restriction evidence');
    expect(prompt).toContain('Spell-ref evidence must cover only the literal spell identity or name phrase');
    expect(prompt).toContain('must exclude any parenthetical or limitation text represented by a restriction');
    expect(prompt).toContain('Spell-ref and restriction evidence ranges');
    expect(prompt).toContain('must be disjoint');
    expect(prompt).toContain('Omit nullable senses and attack range fields when the source does not state them');
    expect(prompt).toContain('never encode absence as numeric 0');
    expect(prompt).toContain('Biography, when present, must remain one JSON string');
    expect(prompt).toContain('languages.custom is an optional JSON string, never an array or object');
    expect(prompt).toContain('defenses use all four empty arrays');
    expect(prompt).toContain('Do not emit an evidence claim or uncertainty solely because the source omits that optional list section');
    expect(prompt).toContain('Uncertainties are only for actual source ambiguity or conflict');
    expect(prompt).toContain('Never emit provider bookkeeping uncertainty or ask a downstream validator to check offsets or slices');
    expect(prompt).toContain('Remove or resolve finding-related process uncertainties once exact evidence is established');
    expect(prompt).toContain('Preserve unrelated real source uncertainties');
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

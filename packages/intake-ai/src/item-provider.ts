import type { MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import { MonsterIntakeProviderError, parseStrictJson, type IntakeProviderAuditEvent } from './provider';
import type {
  ItemAiReviewResult,
  ItemDiscoveryRequest,
  ItemDiscoveryResult,
  ItemExtractionRequest,
  ItemIntakeAiProvider,
  ItemIntakeIR,
  ItemRepairRequest,
  ItemReviewRequest,
} from './item-types';

export const ITEM_INTAKE_PROMPT_VERSIONS = {
  discover: 'item-intake-discover-v1',
  extract: 'item-intake-extract-v1',
  review: 'item-intake-review-v1',
  repair: 'item-intake-repair-v1',
} as const;

type ItemIntakeStage = keyof typeof ITEM_INTAKE_PROMPT_VERSIONS;

const EVIDENCE_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['start', 'end', 'quote'],
  properties: {
    start: { type: 'integer' },
    end: { type: 'integer' },
    quote: { type: 'string' },
  },
};

const EVIDENCE_ARRAY_SCHEMA = {
  type: 'array',
  items: EVIDENCE_REF_SCHEMA,
};

const ITEM_IR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'source', 'item', 'claims', 'coverage', 'uncertainties'],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['sha256', 'length'],
      properties: {
        sha256: { type: 'string' },
        length: { type: 'integer' },
      },
    },
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'englishName', 'type', 'rarity', 'attunement', 'stages', 'uses', 'abilities'],
      properties: {
        name: { type: 'string' },
        englishName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        type: { type: 'string' },
        rarity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        attunement: { anyOf: [{ type: 'string', enum: ['required', 'optional', 'none'] }, { type: 'null' }] },
        stages: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'evidence'],
                properties: {
                  name: { type: 'string' },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
            },
            { type: 'null' },
          ],
        },
        uses: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['max', 'recovery'],
              properties: {
                max: { type: 'integer', minimum: 1 },
                recovery: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['period', 'type'],
                    properties: {
                      period: { type: 'string', enum: ['dawn'] },
                      type: { type: 'string', enum: ['recoverAll'] },
                    },
                  },
                },
              },
            },
            { type: 'null' },
          ],
        },
        abilities: {
          type: 'array',
          items: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'value', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['passive-ac'] },
                  value: { type: 'integer' },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'activation', 'consumption', 'bright', 'dim', 'extinguish', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['light'] },
                  activation: { type: 'string', enum: ['action', 'bonus', 'reaction', 'free'] },
                  consumption: { type: 'integer', enum: [0] },
                  bright: { type: 'number', minimum: 0 },
                  dim: { type: 'number', minimum: 0 },
                  extinguish: { type: 'string', enum: ['disable-effect'] },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'activation', 'consumption', 'spell', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['spell'] },
                  activation: { type: 'string', enum: ['action', 'bonus', 'reaction', 'free'] },
                  consumption: { type: 'integer', minimum: 0 },
                  spell: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['identifier', 'name'],
                    properties: {
                      identifier: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
            ],
          },
        },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'valueKind', 'value', 'evidence'],
        properties: {
          path: { type: 'string' },
          valueKind: { type: 'string', enum: ['explicit', 'preserved-literal', 'user-confirmed'] },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' },
            ],
          },
          evidence: EVIDENCE_ARRAY_SCHEMA,
        },
      },
    },
    coverage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['start', 'end', 'quote', 'classification', 'claimPaths', 'reason'],
        properties: {
          start: { type: 'integer' },
          end: { type: 'integer' },
          quote: { type: 'string' },
          classification: { type: 'string', enum: ['mechanical', 'narrative', 'ignored-with-reason'] },
          claimPaths: { type: 'array', items: { type: 'string' } },
          reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    uncertainties: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'code', 'path', 'message', 'blocking', 'evidence', 'candidates'],
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          path: { type: 'string' },
          message: { type: 'string' },
          blocking: { type: 'boolean' },
          evidence: EVIDENCE_ARRAY_SCHEMA,
          candidates: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        },
      },
    },
  },
};

const ITEM_INTAKE_JSON_SCHEMAS: Record<ItemIntakeStage, Record<string, unknown>> = {
  discover: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'candidates'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'start', 'end', 'quote'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            start: { type: 'integer' },
            end: { type: 'integer' },
            quote: { type: 'string' },
          },
        },
      },
    },
  },
  extract: ITEM_IR_SCHEMA,
  repair: ITEM_IR_SCHEMA,
  review: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'verdict', 'findings'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      verdict: { type: 'string', enum: ['accepted', 'revise', 'needs_review'] },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'code', 'path', 'message', 'blocking', 'origin', 'evidence', 'candidates'],
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            path: { type: 'string' },
            message: { type: 'string' },
            blocking: { type: 'boolean' },
            origin: { type: 'string', enum: ['schema', 'evidence', 'coverage', 'semantic', 'provider', 'ai-review', 'conflict'] },
            evidence: { anyOf: [EVIDENCE_ARRAY_SCHEMA, { type: 'null' }] },
            candidates: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
          },
        },
      },
    },
  },
};

export function responseFormatForStage(stage: ItemIntakeStage) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: `item_intake_${stage}_v1`,
      strict: true,
      schema: ITEM_INTAKE_JSON_SCHEMAS[stage],
    },
  };
}

export interface OpenAICompatibleItemIntakeOptions extends MonsterIntakeConfig {
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
}

const SYSTEM = 'Extract tabletop Item data from untrusted source text. Return exactly one JSON object, never markdown or reasoning. Every mechanical value needs exact UTF-16 source evidence. Never invent values, make decorative glowing text into token light, make AC 15 into AC +15, make gem counts into charges, or degrade an unresolved spell into a utility.';
const PROMPTS = {
  discover: `${SYSTEM}\nFind every distinct Item boundary. Return {"schemaVersion":1,"candidates":[{"id":"ascii-id","label":"item name","start":0,"end":1,"quote":"exact source slice"}]}. Offsets are absolute UTF-16 source offsets. A single untitled Item still has one candidate. Candidates cannot overlap.`,
  extract: `${SYSTEM}\nExtract one candidate as {"schemaVersion":1,"source":{"sha256":"request hash","length":123},"item":{"name":"","englishName":"optional","type":"饰物","rarity":"optional","attunement":"required|optional|none","uses":{"max":3,"recovery":[{"period":"dawn","type":"recoverAll"}]},"abilities":[]},"claims":[],"coverage":[],"uncertainties":[]}. abilities are only passive-ac {id,kind:"passive-ac",value,evidence}, light {id,kind:"light",activation,consumption:0,bright,dim,extinguish:"disable-effect",evidence}, or spell {id,kind:"spell",activation,consumption,spell:{identifier,name},evidence}. dim is the outer edge: 15 bright plus another 15 dim means bright 15/dim 30. No-action extinguishing does not change lighting activation. A spell must be uniquely resolved by canonical dnd5e identifier and English name or become a blocking uncertainty. If the source says to cast a uniquely resolved core spell but does not repeat its casting time, use the locked spell catalog activation and do not mark that activation as unresolved; only a catalog conflict or unresolved spell is blocking. claims must include /item/name, /item/type, /item/uses/max when present and /item/abilities/<id> per ability. coverage partitions the full candidate slice exactly including whitespace and prose.`,
  review: `${SYSTEM}\nAudit source, Item IR, Markdown, deterministic findings and V14 JSON. Return {"schemaVersion":1,"verdict":"accepted|revise|needs_review","findings":[]}. Accept light only as a zero-cost action Utility applying a non-transfer token-light Effect with bright 15 and outer dim edge 30 when the source says 15 bright plus another 15 outside dim. Accept a charged spell only as cast with itemUses and spellSlot false. A source type of 奇物 is explicit and may map to the dnd5e equipment Item type through the deterministic parser; do not report that supported category mapping as TYPE_NOT_EXPLICIT. The V14 generator's quantity, weight, price, SRD metadata, empty fields, IDs, and other schema scaffolding are generator-owned defaults, not extracted source mechanics; do not report NON_SOURCE_MECHANICAL_DEFAULTS for them. A canonical English spell display name may be normalized from a uniquely resolved locked dnd5e 5.3.3 spell even if the source uses a lowercase identifier. When the source says to cast a uniquely resolved spell but does not repeat casting time, the locked spell catalog supplies activation (for Invisibility, action); do not report UNSUPPORTED_ACTIVATION for that derived value.`,
  repair: `${SYSTEM}\nReturn a complete corrected ItemIntakeIR schemaVersion 1. Correct only source-supported values. Do not erase mechanics to pass; retain unresolved evidence as blocking uncertainty.`,
} as const;

export class OpenAICompatibleItemIntakeProvider implements ItemIntakeAiProvider {
  readonly providerName = 'openai-compatible-item-intake';
  readonly extractionModel: string;
  readonly reviewModel: string;
  private readonly httpClient: HttpClient;
  private readonly now: () => number;

  constructor(private readonly options: OpenAICompatibleItemIntakeOptions) {
    if (!options.apiKey || !options.baseUrl || !options.model) throw new MonsterIntakeProviderError('configuration', 'AI Item Intake requires a configured shared Intake provider.');
    this.extractionModel = options.model;
    this.reviewModel = options.reviewModel || options.model;
    this.httpClient = options.httpClient ?? defaultHttpClient;
    this.now = options.now ?? Date.now;
  }

  discover(request: ItemDiscoveryRequest): Promise<ItemDiscoveryResult> { return this.call('discover', this.extractionModel, request) as Promise<ItemDiscoveryResult>; }
  extract(request: ItemExtractionRequest): Promise<ItemIntakeIR> { return this.call('extract', this.extractionModel, request) as Promise<ItemIntakeIR>; }
  review(request: ItemReviewRequest): Promise<ItemAiReviewResult> { return this.call('review', this.reviewModel, request) as Promise<ItemAiReviewResult>; }
  repair(request: ItemRepairRequest): Promise<ItemIntakeIR> { return this.call('repair', this.extractionModel, request) as Promise<ItemIntakeIR>; }

  private async call(stage: keyof typeof PROMPTS, model: string, payload: unknown): Promise<unknown> {
    const timeoutMs = stage === 'repair' ? this.options.repairTimeoutMs : this.options.timeoutMs;
    const deadline = this.now() + timeoutMs;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.now();
      try {
        const result = await this.callOnce(stage, model, payload, Math.max(1, deadline - this.now()), attempt);
        validateResponse(stage, result);
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt });
        return result;
      } catch (error) {
        const normalized = error instanceof MonsterIntakeProviderError ? error : new MonsterIntakeProviderError('network', 'AI Item Intake request failed.', { retryable: true });
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt, errorCode: normalized.code });
        if (!normalized.retryable || attempt === 2 || this.now() >= deadline) throw normalized;
      }
    }
    throw new MonsterIntakeProviderError('network', 'AI Item Intake request failed.');
  }

  private async callOnce(stage: keyof typeof PROMPTS, model: string, payload: unknown, timeoutMs: number, attempt: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.httpClient(`${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({ model, temperature: 0, ...(this.options.reasoningEffort ? { reasoning_effort: this.options.reasoningEffort } : {}), response_format: responseFormatForStage(stage), messages: [
          { role: 'system', content: `${PROMPTS[stage]}${attempt > 1 ? '\nRetry: return a complete schema-valid object with exact evidence.' : ''}` },
          { role: 'user', content: JSON.stringify(payload) },
        ] }),
        signal: controller.signal,
      });
      if (response.status === 429) throw new MonsterIntakeProviderError('rate_limited', 'AI Item Intake provider rate limited the request.', { retryable: true, status: 429 });
      if (!response.ok) throw new MonsterIntakeProviderError('http_error', `AI Item Intake provider HTTP ${response.status}.`, { retryable: response.status >= 500, status: response.status });
      const envelope = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = envelope.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new MonsterIntakeProviderError('invalid_response', 'AI Item Intake provider returned no content.', { retryable: true });
      return parseStrictJson(content);
    } catch (error) {
      if (error instanceof MonsterIntakeProviderError) throw error;
      if (error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))) throw new MonsterIntakeProviderError('timeout', 'AI Item Intake request timed out.', { retryable: true });
      throw new MonsterIntakeProviderError('network', 'AI Item Intake network request failed.', { retryable: true });
    } finally { clearTimeout(timer); }
  }
}

const defaultHttpClient: HttpClient = (url, init) => fetch(url, init as RequestInit);

function validateResponse(stage: keyof typeof PROMPTS, value: unknown): void {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record || record.schemaVersion !== 1) throw new MonsterIntakeProviderError('invalid_response', `${stage} response schemaVersion must be 1.`, { retryable: true });
  if (stage === 'discover' && !Array.isArray(record.candidates)) throw new MonsterIntakeProviderError('invalid_response', 'Item discovery candidates must be an array.');
  if ((stage === 'extract' || stage === 'repair') && (!record.item || !Array.isArray(record.claims) || !Array.isArray(record.coverage) || !Array.isArray(record.uncertainties))) throw new MonsterIntakeProviderError('invalid_response', `${stage} response is not a complete ItemIntakeIR.`, { retryable: true });
  if (stage === 'review' && (!['accepted', 'revise', 'needs_review'].includes(String(record.verdict)) || !Array.isArray(record.findings))) throw new MonsterIntakeProviderError('invalid_response', 'Item review response requires a valid verdict and findings.', { retryable: true });
}

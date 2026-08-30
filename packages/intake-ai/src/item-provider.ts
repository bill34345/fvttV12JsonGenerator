import type { MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import { MonsterIntakeProviderError, parseStrictJson, type IntakeProviderAuditEvent } from './provider';
import {
  IntakeTransportError,
  requestIntakeProvider,
  type IntakeRequestWaitPolicy,
  type IntakeProviderActivity,
  type IntakeTransportOptions,
} from './transport';
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
  extract: 'item-intake-extract-v3',
  review: 'item-intake-review-v2',
  repair: 'item-intake-repair-v3',
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

export type ItemIntakeResponseFormat = 'json_schema' | 'json_object';

export function responseFormatForStage(
  stage: ItemIntakeStage,
  responseFormat: ItemIntakeResponseFormat = 'json_schema',
) {
  if (responseFormat === 'json_object') return { type: 'json_object' as const };
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
  responseFormat?: ItemIntakeResponseFormat;
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
  /** Optional protocol adapter. Omitted means the legacy OpenAI Chat path. */
  transport?: IntakeTransportOptions;
  /** Browser-only opt-in. Pending requests remain open until this policy asks the user. */
  waitPolicy?: IntakeRequestWaitPolicy;
  /** Safe semantic provider activity; raw SSE and reasoning never cross this boundary. */
  onActivity?: (activity: IntakeProviderActivity) => void;
}

const SYSTEM = 'Extract tabletop Item data from untrusted source text. Return exactly one JSON object, never markdown or reasoning. Every mechanical value needs exact UTF-16 source evidence. Never invent values, make decorative glowing text into token light, make AC 15 into AC +15, make gem counts into charges, or degrade an unresolved spell into a utility.';
const ITEM_IR_CONTRACT = `Return one complete ItemIntakeIR object with exactly these top-level keys: schemaVersion, source, item, claims, coverage, uncertainties.
Every evidence reference MUST be an object shaped exactly {"start":0,"end":1,"quote":"exact source slice"}; never return a string, a text field, or a nested range object. start/end are absolute UTF-16 offsets into request.source and source.slice(start,end) must equal quote.
Every claim MUST be shaped exactly {"path":"/item/name","valueKind":"explicit|preserved-literal|user-confirmed","value":"JSON scalar when applicable","evidence":[{"start":0,"end":1,"quote":"exact source slice"}]}.
Every coverage entry MUST be flat, never nested under range, and shaped exactly {"start":0,"end":1,"quote":"exact source slice","classification":"mechanical|narrative|ignored-with-reason","claimPaths":["/item/name"],"reason":null}. Sorted coverage entries must partition the complete request.candidate range without gaps or overlaps, including whitespace and prose. Mechanical and narrative entries reference the claims they support; ignored-with-reason entries give a non-empty reason.
Every uncertainty MUST be shaped exactly {"id":"ascii-id","code":"CODE","path":"/json/path","message":"human explanation","blocking":true,"evidence":[{"start":0,"end":1,"quote":"exact source slice"}],"candidates":null}. Do not create a blocking uncertainty for faithfully preserved narrative description or for an explicitly named item stage. Only an ambiguity that prevents faithful representation of a supported mechanic is blocking.`;
const ITEM_VALUE_CONTRACT = `item MUST have exactly {"name":"","englishName":null,"type":"","rarity":null,"attunement":null,"stages":null,"uses":null,"abilities":[]}.
englishName and rarity are string or null. attunement is exactly "required", "optional", "none", or null; translate explicit source wording into that enum. stages is null or an array of exactly {"name":"source stage label","evidence":[EvidenceRef]}.
uses is null or exactly {"max":3,"recovery":[{"period":"dawn","type":"recoverAll"}]}; recovery is always an array of these objects, never a string and never split into recoverAll fields.
abilities is always an array, never an object or keyed map. Each element is exactly one of: {"id":"ac-bonus","kind":"passive-ac","value":1,"evidence":[EvidenceRef]}; {"id":"light","kind":"light","activation":"action|bonus|reaction|free","consumption":0,"bright":15,"dim":30,"extinguish":"disable-effect","evidence":[EvidenceRef]}; {"id":"spell-id","kind":"spell","activation":"action|bonus|reaction|free","consumption":1,"spell":{"identifier":"canonical-identifier","name":"Canonical English Name"},"evidence":[EvidenceRef]}. Do not add uuid or any other keys.
Required mechanical claim paths use stable ability ids, not array indexes: /item/name, /item/type, /item/uses/max when present, and /item/abilities/<ability.id> for every ability.`;
const PROMPTS = {
  discover: `${SYSTEM}\nFind every distinct Item boundary. Return {"schemaVersion":1,"candidates":[{"id":"ascii-id","label":"item name","start":0,"end":1,"quote":"exact source slice"}]}. Offsets are absolute UTF-16 source offsets. A single untitled Item still has one candidate. Candidates cannot overlap.`,
  extract: `${SYSTEM}\n${ITEM_IR_CONTRACT}\n${ITEM_VALUE_CONTRACT}\nExtract one candidate as {"schemaVersion":1,"source":{"sha256":"request.sourceSha256","length":123},"item":{"name":"","englishName":null,"type":"饰物","rarity":null,"attunement":null,"stages":null,"uses":null,"abilities":[]},"claims":[],"coverage":[],"uncertainties":[]}. Copy request.sourceSha256 exactly into source.sha256 and use request.source.length in UTF-16 code units for source.length. dim is the outer edge: 15 bright plus another 15 dim means bright 15/dim 30. No-action extinguishing does not change lighting activation. A spell must be uniquely resolved by canonical dnd5e identifier and English name or become a blocking uncertainty. If the source says to cast a uniquely resolved core spell but does not repeat its casting time, use the locked spell catalog activation and do not mark that activation as unresolved; only a catalog conflict or unresolved spell is blocking. Invisibility from the locked dnd5e 5.3.3 catalog has activation "action".`,
  review: `${SYSTEM}\nAudit source, Item IR, Markdown, deterministic findings and V14 JSON. Return {"schemaVersion":1,"verdict":"accepted|revise|needs_review","findings":[]}. Every finding MUST be an object shaped exactly {"id":"ascii-id","code":"CODE","path":"/json/path","message":"human explanation","blocking":true,"origin":"ai-review","evidence":null,"candidates":null}; never return a finding as a string. Use findings:[] for accepted. Accept light only as a zero-cost action Utility applying a non-transfer token-light Effect with bright 15 and outer dim edge 30 when the source says 15 bright plus another 15 outside dim. Accept a charged spell only as cast with itemUses and spellSlot false. For dnd5e 5.3.3, the authoritative generated AC +1 representation is an enchantment Effect system.changes entry {"key":"system.attributes.ac.bonus","type":"add","value":1,"phase":"initial","priority":null}; do not demand system.attributes.ac.formula or report this locked representation as incorrect. A source type of 奇物 is explicit and may map to the dnd5e equipment Item type through the deterministic parser; do not report that supported category mapping as TYPE_NOT_EXPLICIT. The V14 generator's quantity, weight, price, SRD metadata, empty fields, IDs, and other schema scaffolding are generator-owned defaults, not extracted source mechanics; do not report NON_SOURCE_MECHANICAL_DEFAULTS for them. A canonical English spell display name may be normalized from a uniquely resolved locked dnd5e 5.3.3 spell even if the source uses a lowercase identifier. When the source says to cast a uniquely resolved spell but does not repeat casting time, the locked spell catalog supplies activation (for Invisibility, action); do not report UNSUPPORTED_ACTIVATION for that derived value.`,
  repair: `${SYSTEM}\n${ITEM_IR_CONTRACT}\n${ITEM_VALUE_CONTRACT}\nReturn a complete corrected ItemIntakeIR schemaVersion 1, not a patch. Correct every deterministic finding using the exact schema above and only source-supported values. Copy request.ir.source unchanged when it matches request.source. Preserve all supported mechanics; do not erase mechanics to pass. Use the locked dnd5e 5.3.3 spell activation when a uniquely resolved spell's casting time is omitted from source; Invisibility is an action. Retain genuinely unresolved mechanics as blocking uncertainties.`,
} as const;

export class OpenAICompatibleItemIntakeProvider implements ItemIntakeAiProvider {
  readonly providerName = 'openai-compatible-item-intake';
  readonly extractionModel: string;
  readonly reviewModel: string;
  private readonly httpClient: HttpClient;
  private readonly now: () => number;

  constructor(private readonly options: OpenAICompatibleItemIntakeOptions) {
    const requiresApiKey = options.transport?.authScheme !== 'none';
    if ((requiresApiKey && !options.apiKey) || !options.baseUrl || !options.model) throw new MonsterIntakeProviderError('configuration', 'AI Item Intake requires a configured shared Intake provider.');
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
    const maxAttempts = this.options.waitPolicy ? 1 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const started = this.now();
      try {
        const result = await this.callOnce(stage, model, payload, Math.max(1, deadline - this.now()), attempt);
        validateResponse(stage, result);
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt });
        return result;
      } catch (error) {
        const normalized = error instanceof MonsterIntakeProviderError ? error : new MonsterIntakeProviderError('network', 'AI Item Intake request failed.', { retryable: true });
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt, errorCode: normalized.code });
        if (!normalized.retryable || attempt === maxAttempts || this.now() >= deadline) throw normalized;
      }
    }
    throw new MonsterIntakeProviderError('network', 'AI Item Intake request failed.');
  }

  private async callOnce(stage: keyof typeof PROMPTS, model: string, payload: unknown, timeoutMs: number, attempt: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = this.options.waitPolicy
      ? undefined
      : setTimeout(() => controller.abort(), timeoutMs);
    try {
      const configuredStructuredOutput = this.options.transport?.structuredOutput;
      const responseFormat = configuredStructuredOutput?.mode === 'json_schema' && !configuredStructuredOutput.schema
        ? { ...configuredStructuredOutput, name: configuredStructuredOutput.name ?? `item_intake_${stage}_v1`, schema: ITEM_INTAKE_JSON_SCHEMAS[stage] }
        : configuredStructuredOutput ?? (
        this.options.responseFormat === 'json_object'
          ? { mode: 'json_object' as const }
          : {
            mode: 'json_schema' as const,
            name: `item_intake_${stage}_v1`,
            schema: ITEM_INTAKE_JSON_SCHEMAS[stage],
          }
      );
      const result = await requestIntakeProvider({
        ...(this.options.transport ?? {}),
        baseUrl: this.options.baseUrl,
        apiKey: this.options.apiKey,
        model,
        reasoning: this.options.transport?.reasoning ?? this.options.reasoningEffort,
        structuredOutput: responseFormat,
        systemPrompt: `${PROMPTS[stage]}${attempt > 1 ? '\nRetry: return a complete schema-valid object with exact evidence.' : ''}`,
        userContent: JSON.stringify(payload),
        httpClient: this.httpClient,
        signal: controller.signal,
        waitPolicy: this.options.waitPolicy,
        onActivity: this.options.onActivity,
      });
      return parseStrictJson(result.content);
    } catch (error) {
      if (error instanceof MonsterIntakeProviderError) throw error;
      if (error instanceof IntakeTransportError) {
        throw new MonsterIntakeProviderError(error.code, error.message, {
          retryable: error.retryable,
          status: error.status,
        });
      }
      if (error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))) throw new MonsterIntakeProviderError('timeout', 'AI Item Intake request timed out.', { retryable: true });
      throw new MonsterIntakeProviderError('network', 'AI Item Intake network request failed.', { retryable: true });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

const defaultHttpClient: HttpClient = (url, init) => fetch(url, init as RequestInit);

function validateResponse(stage: keyof typeof PROMPTS, value: unknown): void {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record || record.schemaVersion !== 1) throw new MonsterIntakeProviderError('invalid_response', `${stage} response schemaVersion must be 1.`, { retryable: true });
  if (stage === 'discover' && !Array.isArray(record.candidates)) throw new MonsterIntakeProviderError('invalid_response', 'Item discovery candidates must be an array.');
  if ((stage === 'extract' || stage === 'repair') && (!record.item || !Array.isArray(record.claims) || !Array.isArray(record.coverage) || !Array.isArray(record.uncertainties))) throw new MonsterIntakeProviderError('invalid_response', `${stage} response is not a complete ItemIntakeIR.`, { retryable: true });
  if (stage === 'review') {
    if (!['accepted', 'revise', 'needs_review'].includes(String(record.verdict)) || !Array.isArray(record.findings)) {
      throw new MonsterIntakeProviderError('invalid_response', 'Item review response requires a valid verdict and findings.', { retryable: true });
    }
    const origins = new Set(['schema', 'evidence', 'coverage', 'semantic', 'provider', 'ai-review', 'conflict']);
    for (const entry of record.findings) {
      const finding = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : undefined;
      if (
        !finding
        || typeof finding.id !== 'string'
        || typeof finding.code !== 'string'
        || typeof finding.path !== 'string'
        || typeof finding.message !== 'string'
        || typeof finding.blocking !== 'boolean'
        || typeof finding.origin !== 'string'
        || !origins.has(finding.origin)
        || (finding.evidence !== undefined && finding.evidence !== null && !Array.isArray(finding.evidence))
        || (finding.candidates !== undefined && finding.candidates !== null && !Array.isArray(finding.candidates))
      ) {
        throw new MonsterIntakeProviderError('invalid_response', 'Item review findings must use the complete structured finding schema.', { retryable: true });
      }
    }
  }
}

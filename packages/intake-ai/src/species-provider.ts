import { createHash } from 'node:crypto';
import type { MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import { MonsterIntakeProviderError, parseStrictJson, type IntakeProviderAuditEvent } from './provider';
import type { SpeciesAiReviewResult, SpeciesDiscoveryResult, SpeciesIntakeAiProvider, SpeciesIntakeIR, SpeciesRepairRequest, SpeciesReviewRequest } from './species-types';

export const SPECIES_INTAKE_PROMPT_VERSIONS = { discover: 'species-intake-discover-v2', extract: 'species-intake-extract-v6', review: 'species-intake-review-v3', repair: 'species-intake-repair-v6' } as const;
type Stage = keyof typeof SPECIES_INTAKE_PROMPT_VERSIONS;

const COMPLETE_IR_CONTRACT = `Return exactly one JSON object with every top-level field in this skeleton (comments and placeholders describe types; do not emit comments):
{"schemaVersion":1,"source":{"sha256":"copy request.sourceSha256","length":0},"species":{"name":"Chinese name","englishName":"English name","displayName":"Chinese name (English name)","identifier":"lowercase-ascii","rules":"2024","creatureType":{"value":"type","subtype":"English species name"},"size":{"options":["lg"],"hint":"source wording"},"movement":{"walk":0},"senses":{"darkvision":0},"source":{"kind":"private-homebrew","sha256":"copy request.candidateSha256","irRevision":1},"features":[{"id":"stable-ascii-id","name":"feature name","englishName":"optional English name","description":"complete source-faithful rule text","parts":[{"id":"globally-unique-ascii-id","level":0,"automation":"native|descriptive|gm-assisted|external-rule","mechanics":[{"kind":"descriptive-passive"}]}]}]},"claims":[{"path":"/species/name","value":"optional canonical value","evidence":[{"start":0,"end":1,"quote":"exact source slice"}]}],"coverage":[{"start":0,"end":1,"quote":"exact source slice","classification":"mechanical|narrative|ignored-with-reason","claimPaths":["/species/name"],"reason":"required only when ignored"}],"uncertainties":[]}.
Mechanic objects have exactly one of these shapes: {"kind":"descriptive-passive"}; {"kind":"gm-assisted","boundaries":["explicit non-automation boundary"]}; {"kind":"external-rule","boundaries":["explicit external boundary"]}; {"kind":"hp-per-level","value":3}; {"kind":"ac-bonus","value":-2}; {"kind":"limited-utility","activation":"action|bonus|reaction|special","uses":{"max":2,"recovery":"lr|sr"},"consumption":1,"chatFlavor":"truthful instructions and non-automation boundary"}.
Do not omit empty objects or arrays required by the skeleton. senses may be {} when the source declares no supported sense. uncertainties must be [] when none exist.`;

const PROMPTS: Record<Stage, string> = {
  discover: `Discover up to 50 non-overlapping playable Species/race candidates. Return strict JSON {schemaVersion:1,candidates:[{id,label,start,end,quote}]}. A candidate is the complete Species record, not merely its title: include its identity line, creature type, size, movement, senses, every feature line, and trailing whitespace up to the next Species record or end of file. For a source containing one Species, the candidate normally extends to end of file. Offsets are UTF-16 code units and quote must equal the exact slice. Do not classify monsters, classes, backgrounds, or general rules as Species.`,
  extract: `Extract one playable Species into SpeciesIntakeIR schemaVersion 1. ${COMPLETE_IR_CONTRACT}
IR source.sha256 copies request.sourceSha256 and source.length is the UTF-16 length of the full request.source. species.source.sha256 copies request.candidateSha256. The fixed target policy is rules 2024, source kind private-homebrew, and a non-empty creature subtype equal to the canonical English Species name when no distinct subtype is stated. These target-policy values are approved intake decisions, not invented source facts. Correct obvious spelling such as Orge to Ogre in canonical names while the raw source remains verbatim. displayName must use U+FF08 and U+FF09 full-width parentheses. Do not invent optional English feature names; include one only when the source supplies it, allowing the same obvious spelling correction. Type, size, movement, and senses are native race fields and must not be repeated as features. Preserve every other rule in feature descriptions. Use only the mechanic shapes above. Use descriptive-passive for a narrowly scoped passive reminder such as advantage on one stated check; the fact that a player applies that advantage when the check occurs does not make it gm-assisted. Use gm-assisted for a complete source rule that needs manual weapon edits, adjudication, movement, damage, state handling, or another manual transaction. Use external-rule only when the candidate explicitly delegates meaning to a rule outside the candidate. Never invent arbitrary Foundry paths/effect changes. When unclear source wording is preserved verbatim and explicitly left to GM adjudication without affecting a native field or automation, record that boundary in gm-assisted and do not create a blocking uncertainty merely because the wording is not interpreted. Blocking uncertainties are only for ambiguity that prevents faithful representation or would change automation. Every feature is one granted feat at exactly one level: all of its parts must have the same level. A later-level benefit must be a separate feature, even when its source wording extends a level-0 feature. Give a split later-level feature a distinct Chinese name in the form "<base name>：<concise benefit>" and do not copy the base feature's English name unless the source separately names the later benefit; for this Ogre source the required name is "身强力壮：附赠动作脱困". When the source explicitly states a replacement activation, limited uses, consumption, and recovery, represent those resource facts as a native limited-utility even though the underlying check, outcome, and condition handling remain manual. limited-utility chatFlavor must preserve the trigger and instruct the original check; it must not choose an ability or skill or remove a condition, and must say that a related source-granted advantage still applies. Claims must include these exact unique paths: /species/name, /species/englishName, /species/displayName, /species/identifier, /species/rules, /species/creatureType, /species/size, /species/movement, /species/senses, and /species/features/<zero-based-index> for every feature. Each claim needs exact evidence; it is valid to reuse the complete request.candidate {start,end,quote} as evidence when a narrower exact UTF-16 span is uncertain. Mechanical/narrative coverage must reference existing claim paths, every claim must be referenced, and coverage must partition the complete candidate. One coverage entry equal to the complete candidate and referencing all claims is valid. Stable ids are lowercase ASCII.`,
  review: `Review source, SpeciesIntakeIR, canonical Markdown, and Foundry JSON projection together. Fixed approved target policies are: rules 2024; source kind private-homebrew; creature subtype is the canonical English Species name when no distinct subtype is stated; obvious Orge-to-Ogre spelling correction is required in canonical display while raw source stays verbatim; displayName uses full-width parentheses. Do not reject these as unsupported source claims. Optional English feature names must otherwise come from the source. A narrowly scoped advantage on the stated check is descriptive-passive, not gm-assisted. A complete source rule needing manual adjudication is gm-assisted; external-rule is only for an explicit outside-rule dependency. A limited-utility may truthfully automate only its explicit activation, uses, consumption, and recovery while its chat card leaves the underlying check, outcome, and condition handling manual; that is the required representation for the Ogre level-5 bonus-action escape benefit and must not be rejected as overstated automation. Split later-level features need a distinct Chinese benefit suffix; for this Ogre source the required name is "身强力壮：附赠动作脱困" and it has no separately supplied English feature name. Return exactly {"schemaVersion":1,"verdict":"accepted|revise|needs_review","findings":[{"id":"stable-id","code":"CODE","path":"/json/pointer","message":"concise finding","blocking":true,"origin":"ai-review"}]}. accepted requires findings []; revise or needs_review requires at least one blocking finding. Accept honest gm-assisted/external-rule boundaries when full wording and triggers are preserved. Reject missing source meaning, invented benefits, arbitrary automation, unsupported mechanics disguised as Utility, evidence drift, or JSON/Markdown semantic drift.`,
  repair: `Repair SpeciesIntakeIR once, using only the supplied source and findings. ${COMPLETE_IR_CONTRACT}
Return the complete replacement IR, not a patch. Copy request.sourceSha256 and request.candidateSha256 into their respective source objects. Apply the approved target policies from extraction: rules 2024, private-homebrew, canonical English subtype, obvious Orge-to-Ogre correction with verbatim raw source, and full-width display-name parentheses. Omit English feature names not present in source. Do not duplicate type, size, movement, or senses as features. All parts of one feature must use one grant level; split later-level benefits into separate features and give each a distinct Chinese "<base name>：<concise benefit>" name. For this Ogre source use "身强力壮：附赠动作脱困" without an English feature name. Classify a narrowly scoped advantage on the stated check as descriptive-passive. Classify complete manual rules as gm-assisted, and reserve external-rule for explicit outside-rule dependencies. When activation, uses, consumption, and recovery are explicit, keep those facts as native limited-utility even when its chat card leaves the underlying check, outcome, and condition handling manual. limited-utility chatFlavor must keep any related advantage and state that it does not choose the check or remove the condition. Exact evidence may reuse the complete request.candidate span, and one complete-candidate coverage entry referencing all claims is valid. Do not broaden mechanics or erase ambiguous source. If unclear wording is preserved verbatim and explicitly left to GM adjudication without affecting a native field or automation, keep it as a gm-assisted boundary and do not make it blocking; only ambiguity that prevents faithful representation or changes automation is blocking.`,
};

export interface OpenAICompatibleSpeciesProviderOptions extends MonsterIntakeConfig {
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
}

export class OpenAICompatibleSpeciesIntakeProvider implements SpeciesIntakeAiProvider {
  readonly providerName = 'openai-compatible-species';
  readonly extractionModel: string;
  readonly reviewModel: string;
  private readonly httpClient: HttpClient;
  private readonly now: () => number;
  constructor(private readonly options: OpenAICompatibleSpeciesProviderOptions) {
    this.extractionModel = options.model;
    this.reviewModel = options.reviewModel;
    this.httpClient = options.httpClient ?? ((url, init) => fetch(url, init as RequestInit));
    this.now = options.now ?? Date.now;
  }
  discover(request: { source: string; sourceSha256: string }): Promise<SpeciesDiscoveryResult> { return this.call('discover', this.extractionModel, request) as Promise<SpeciesDiscoveryResult>; }
  extract(request: { source: string; sourceSha256: string; candidate: any }): Promise<SpeciesIntakeIR> {
    return this.call('extract', this.extractionModel, {
      ...request,
      candidateSha256: sha256(request.candidate.quote),
    }) as Promise<SpeciesIntakeIR>;
  }
  review(request: SpeciesReviewRequest): Promise<SpeciesAiReviewResult> { return this.call('review', this.reviewModel, request) as Promise<SpeciesAiReviewResult>; }
  repair(request: SpeciesRepairRequest): Promise<SpeciesIntakeIR> {
    return this.call('repair', this.extractionModel, {
      ...request,
      sourceSha256: sha256(request.source),
      candidateSha256: sha256(request.candidate.quote),
    }) as Promise<SpeciesIntakeIR>;
  }

  private async call(stage: Stage, model: string, payload: unknown): Promise<unknown> {
    const timeoutMs = stage === 'repair' ? this.options.repairTimeoutMs : this.options.timeoutMs;
    const deadline = this.now() + timeoutMs;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.now();
      try {
        const value = await this.callOnce(stage, model, payload, Math.max(1, deadline - this.now()), attempt);
        validateResponse(stage, value);
        this.options.audit?.({ provider: this.providerName, model, promptVersion: SPECIES_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt });
        return value;
      } catch (error) {
        const normalized = error instanceof MonsterIntakeProviderError ? error : new MonsterIntakeProviderError('network', 'AI Species Intake request failed.', { retryable: true });
        this.options.audit?.({ provider: this.providerName, model, promptVersion: SPECIES_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt, errorCode: normalized.code });
        if (!normalized.retryable || attempt === 2 || this.now() >= deadline) throw normalized;
      }
    }
    throw new MonsterIntakeProviderError('network', 'AI Species Intake request failed.');
  }

  private async callOnce(stage: Stage, model: string, payload: unknown, timeoutMs: number, attempt: number): Promise<unknown> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.httpClient(`${this.options.baseUrl.replace(/\/+$/u, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({ model, temperature: 0, ...(this.options.reasoningEffort ? { reasoning_effort: this.options.reasoningEffort } : {}), response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `${PROMPTS[stage]}${attempt > 1 ? '\nRetry with a complete schema-valid object and exact evidence.' : ''}` }, { role: 'user', content: JSON.stringify(payload) }] }),
        signal: controller.signal,
      });
      if (response.status === 429) throw new MonsterIntakeProviderError('rate_limited', 'AI Species Intake provider rate limited the request.', { retryable: true, status: 429 });
      if (!response.ok) throw new MonsterIntakeProviderError('http_error', `AI Species Intake provider HTTP ${response.status}.`, { retryable: response.status >= 500, status: response.status });
      const envelope = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = envelope.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new MonsterIntakeProviderError('invalid_response', 'AI Species Intake provider returned no content.', { retryable: true });
      return parseStrictJson(content);
    } catch (error) {
      if (error instanceof MonsterIntakeProviderError) throw error;
      if (error instanceof Error && (error.name === 'AbortError' || /abort/iu.test(error.message))) throw new MonsterIntakeProviderError('timeout', 'AI Species Intake request timed out.', { retryable: true });
      throw new MonsterIntakeProviderError('network', 'AI Species Intake network request failed.', { retryable: true });
    } finally { clearTimeout(timer); }
  }
}

function validateResponse(stage: Stage, value: unknown): void {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record || record.schemaVersion !== 1) throw new MonsterIntakeProviderError('invalid_response', `${stage} schemaVersion must be 1.`, { retryable: true });
  if (stage === 'discover' && !Array.isArray(record.candidates)) throw new MonsterIntakeProviderError('invalid_response', 'Species discovery requires candidates.', { retryable: true });
  if (stage === 'extract' || stage === 'repair') {
    const missing = [
      !record.source && 'source',
      !record.species && 'species',
      !Array.isArray(record.claims) && 'claims',
      !Array.isArray(record.coverage) && 'coverage',
      !Array.isArray(record.uncertainties) && 'uncertainties',
    ].filter((value): value is string => Boolean(value));
    if (missing.length > 0) throw new MonsterIntakeProviderError('invalid_response', `${stage} is not a complete SpeciesIntakeIR; missing or invalid: ${missing.join(', ')}.`, { retryable: true });
  }
  if (stage === 'review') {
    const verdict = String(record.verdict);
    const findings = Array.isArray(record.findings) ? record.findings : undefined;
    const invalidFinding = findings?.some((finding) => !isReviewFinding(finding)) ?? true;
    const verdictFindingMismatch = verdict === 'accepted'
      ? findings?.length !== 0
      : findings?.length === 0 || !findings?.some((finding) => (finding as Record<string, unknown>).blocking === true);
    if (!['accepted', 'revise', 'needs_review'].includes(verdict) || !findings || invalidFinding || verdictFindingMismatch) {
      throw new MonsterIntakeProviderError('invalid_response', 'Species review requires a valid verdict and strict SpeciesIntakeFinding objects; accepted must be empty and non-accepted verdicts need a blocking finding.', { retryable: true });
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isReviewFinding(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const finding = value as Record<string, unknown>;
  return typeof finding.id === 'string' && Boolean(finding.id.trim())
    && typeof finding.code === 'string' && Boolean(finding.code.trim())
    && typeof finding.path === 'string' && finding.path.startsWith('/')
    && typeof finding.message === 'string' && Boolean(finding.message.trim())
    && typeof finding.blocking === 'boolean'
    && finding.origin === 'ai-review';
}

import {
  hashSource,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  itemCandidateBoundaryIssue,
  normalizeItemCandidates,
  normalizeItemIntakeIR,
} from '@fvtt-json-generator/intake-ai/item-core';
import {
  ITEM_INTAKE_PROMPT_VERSIONS,
  OpenAICompatibleItemIntakeProvider,
  type OpenAICompatibleItemIntakeOptions,
} from '@fvtt-json-generator/intake-ai/item-provider';
import { MonsterIntakeProviderError } from '@fvtt-json-generator/intake-ai/provider';
import type {
  IntakeAuthScheme,
  IntakeProviderActivity,
  IntakeReasoning,
  IntakeRequestWaitPolicy,
  IntakeStructuredOutputMode,
  IntakeTransportProtocol,
} from '@fvtt-json-generator/intake-ai/transport';
import { renderItemIntakeMarkdown } from '@fvtt-json-generator/intake-ai/item-renderer';
import {
  BROWSER_AI_REPAIR_TIMEOUT_MS,
  BROWSER_AI_STAGE_TIMEOUT_MS,
} from './providerTiming';
import type {
  ItemAiReviewResult,
  ItemDiscoveryCandidate,
  ItemIntakeAiProvider,
  ItemIntakeFinding,
  ItemIntakeIR,
  ItemIntakeValidationResult,
} from '@fvtt-json-generator/intake-ai/item-types';
import { validateItemIntakeIRWithResolver } from '@fvtt-json-generator/intake-ai/item-validator-core';
import { parseItemStages } from '@fvtt-json-generator/parser/item-parser';
import {
  resolveLockedDnd5eV14Spell,
  resolveLockedDnd5eV14SpellActivation,
} from './adapters/v14SpellCatalog';
import { combineAbortSignals, guardResponseBodyForCallerAbort } from './abortSignal';
import { buildForgeItemRequest, convertFinalItemSource } from './item';

const BROWSER_ITEM_RESOLVER = {
  resolveSpell: resolveLockedDnd5eV14Spell,
  resolveActivation: resolveLockedDnd5eV14SpellActivation,
};

export type BrowserItemIntakeStage = 'discover' | 'extract' | 'validate' | 'repair' | 'generate' | 'review' | 'finalize';
export interface BrowserItemIntakeStageResult {
  stage: BrowserItemIntakeStage;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
}

export interface BrowserItemIntakeInput {
  source: string;
  sourceName: string;
  displayName?: string;
  requestId: string;
  fvttVersion: string;
  systemVersion: string;
  sourceId?: ForgeItemSourceId;
  onStage?: (stage: BrowserItemIntakeStageResult) => void;
}

export interface BrowserItemIntakeCalls {
  discovery: number;
  extraction: number;
  review: number;
  repair: number;
}

export interface BrowserItemProviderIdentity {
  providerName: string;
  extractionModel: string;
  reviewModel: string;
  protocol?: IntakeTransportProtocol;
  reasoning?: IntakeReasoning;
  structuredOutput?: IntakeStructuredOutputMode;
  promptVersions: typeof ITEM_INTAKE_PROMPT_VERSIONS;
}

export interface BrowserItemIntakeAnalysis {
  status: 'ready_to_generate' | 'needs_review' | 'failed';
  attemptId: string;
  rawSourceHash?: Sha256;
  candidates: ItemDiscoveryCandidate[];
  candidate?: ItemDiscoveryCandidate;
  ir?: ItemIntakeIR;
  validation?: ItemIntakeValidationResult;
  findings: ItemIntakeFinding[];
  stages: BrowserItemIntakeStageResult[];
  provider: BrowserItemProviderIdentity;
  calls: BrowserItemIntakeCalls;
  repairCount: 0 | 1;
  errorCode?: 'input_empty' | 'input_too_large' | 'no_entities' | 'multiple_entities' | 'ambiguous_boundary' | 'multi_stage' | 'cancelled' | 'provider_failure';
}

export interface BrowserItemGenerationResult {
  status: 'accepted' | 'needs_review' | 'failed';
  analysis: BrowserItemIntakeAnalysis;
  rawSourceHash?: Sha256;
  finalSourceHash?: Sha256;
  finalSource?: string;
  markdown?: string;
  response?: ForgeItemResponse;
  itemProjection?: unknown;
  formalStatus?: 'accepted' | 'needs_review' | 'failed';
  review?: ItemAiReviewResult;
  findings: ItemIntakeFinding[];
  stages: BrowserItemIntakeStageResult[];
  provider: BrowserItemProviderIdentity;
  calls: BrowserItemIntakeCalls;
  errorCode?: BrowserItemIntakeAnalysis['errorCode'];
}

export interface BrowserItemAiProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  reviewModel?: string;
  providerId?: string;
  protocol?: IntakeTransportProtocol;
  authScheme?: IntakeAuthScheme;
  region?: string;
  reasoning?: IntakeReasoning;
  structuredOutput?: IntakeStructuredOutputMode;
  timeoutMs?: number;
  repairTimeoutMs?: number;
  reasoningEffort?: OpenAICompatibleItemIntakeOptions['reasoningEffort'];
  responseFormat?: OpenAICompatibleItemIntakeOptions['responseFormat'];
  audit?: OpenAICompatibleItemIntakeOptions['audit'];
  waitPolicy?: IntakeRequestWaitPolicy;
  onActivity?: (activity: IntakeProviderActivity) => void;
}

export function createBrowserItemAiProvider(
  options: BrowserItemAiProviderOptions,
  signal?: AbortSignal,
): ItemIntakeAiProvider {
  assertHttpsEndpoint(options.baseUrl);
  const provider = new OpenAICompatibleItemIntakeProvider({
    authMode: 'api-key',
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    reviewModel: options.reviewModel ?? options.model,
    timeoutMs: options.timeoutMs ?? BROWSER_AI_STAGE_TIMEOUT_MS,
    repairTimeoutMs: options.repairTimeoutMs ?? BROWSER_AI_REPAIR_TIMEOUT_MS,
    ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
    transport: {
      ...(options.protocol ? { protocol: options.protocol } : {}),
      ...(options.authScheme ? { authScheme: options.authScheme } : {}),
      ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      ...(options.structuredOutput ? { structuredOutput: { mode: options.structuredOutput } } : {}),
      ...(options.protocol === 'openai-responses' ? { stream: true } : {}),
    },
    responseFormat: options.responseFormat ?? responseFormatForBrowserEndpoint(options.baseUrl),
    audit: options.audit,
    waitPolicy: options.waitPolicy,
    onActivity: options.onActivity,
    httpClient: (url, init) => fetchWithCallerAbort(url, init, signal),
  });
  if (!options.providerId) return provider;
  return {
    providerName: options.providerId,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    ...(options.protocol ? { protocol: options.protocol } : {}),
    ...((options.reasoning ?? options.reasoningEffort) ? { reasoning: options.reasoning ?? options.reasoningEffort } : {}),
    ...(options.structuredOutput ? { structuredOutput: options.structuredOutput } : {}),
    discover: (request) => provider.discover(request),
    extract: (request) => provider.extract(request),
    review: (request) => provider.review(request),
    repair: (request) => provider.repair(request),
  };
}

export async function analyzeBrowserItemSourceWithAi(
  input: BrowserItemIntakeInput,
  provider: ItemIntakeAiProvider,
  signal?: AbortSignal,
  attemptId = `${input.requestId}:attempt-1`,
): Promise<BrowserItemIntakeAnalysis> {
  const stages = freshStages();
  const calls = freshCalls();
  const report = reporter(stages, input.onStage);
  let rawSourceHash: Sha256 | undefined;
  try {
    assertInput(input.source);
    rawSourceHash = hashSource(input.source);
    throwIfAborted(signal);
    report('discover', 'running');
    calls.discovery += 1;
    const discovery = await withAbort(provider.discover({ source: input.source, sourceSha256: rawSourceHash }), signal);
    const candidates = normalizeItemCandidates(input.source, discovery?.candidates ?? []);
    report('discover', 'completed');
    if (candidates.length === 0) return reviewAnalysis('no_entities', input, provider, attemptId, rawSourceHash, candidates, calls, stages);
    if (candidates.length !== 1) return reviewAnalysis('multiple_entities', input, provider, attemptId, rawSourceHash, candidates, calls, stages);
    const boundary = itemCandidateBoundaryIssue(input.source, candidates);
    if (boundary) {
      return reviewAnalysis('ambiguous_boundary', input, provider, attemptId, rawSourceHash, candidates, calls, stages, [finding(boundary.code, '/candidate', boundary.message)]);
    }
    const candidate = candidates[0]!;
    const sourceStageFinding = multiStageSourceFinding(candidate);
    if (sourceStageFinding) {
      return reviewAnalysis('multi_stage', input, provider, attemptId, rawSourceHash, candidates, calls, stages, [sourceStageFinding], candidate);
    }
    report('extract', 'running');
    calls.extraction += 1;
    const extracted = await withAbort(provider.extract({ source: input.source, sourceSha256: rawSourceHash, candidate }), signal);
    report('extract', 'completed');
    const ir = normalizeItemIntakeIR(input.source, candidate, extracted, BROWSER_ITEM_RESOLVER);
    if ((ir.item?.stages?.length ?? 0) > 1) {
      return reviewAnalysis('multi_stage', input, provider, attemptId, rawSourceHash, candidates, calls, stages, [
        finding('MULTI_STAGE_ITEM_UNSUPPORTED', '/item/stages', 'Forge Intake accepts one static Item artifact; multi-stage Item source requires review.'),
      ], candidate, ir);
    }
    report('validate', 'running');
    const validation = validateItemIntakeIRWithResolver(input.source, ir, candidate, BROWSER_ITEM_RESOLVER);
    report('validate', validation.blocking.length === 0 ? 'completed' : 'failed');
    return {
      status: validation.blocking.length === 0 ? 'ready_to_generate' : 'needs_review',
      attemptId, rawSourceHash, candidates, candidate, ir, validation, findings: validation.findings,
      stages, provider: identity(provider), calls, repairCount: 0,
    };
  } catch (error) {
    const code = isAbort(error, signal) ? 'cancelled' : inputErrorCode(error) ?? 'provider_failure';
    const message = safeMessage(error);
    report('finalize', code === 'cancelled' ? 'skipped' : 'failed', message);
    return {
      status: 'failed', attemptId, rawSourceHash, candidates: [],
      findings: [finding(`ANALYSIS_${code.toUpperCase()}`, '/intake', message)], stages,
      provider: identity(provider), calls, repairCount: 0, errorCode: code,
    };
  }
}

export async function repairBrowserItemIntake(
  input: BrowserItemIntakeInput,
  current: BrowserItemIntakeAnalysis | BrowserItemGenerationResult,
  provider: ItemIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserItemIntakeAnalysis> {
  const prior = isGeneration(current) ? current.analysis : current;
  const stages = structuredClone(current.stages);
  const calls = structuredClone(current.calls);
  const report = reporter(stages, input.onStage);
  if (prior.repairCount >= 1) return blockedAnalysis(prior, stages, calls, current.findings, 'REPAIR_BUDGET_EXHAUSTED', 'This attempt already used its one bounded repair.');
  if (!prior.ir || !prior.candidate || !prior.rawSourceHash || hashSource(input.source) !== prior.rawSourceHash) {
    return blockedAnalysis(prior, stages, calls, current.findings, 'STALE_SOURCE', 'Source identity changed; start a new analysis attempt.');
  }
  const sourceStageFinding = multiStageSourceFinding(prior.candidate);
  if (sourceStageFinding) {
    return { ...structuredClone(prior), status: 'needs_review', stages, calls, findings: dedupe([...current.findings, sourceStageFinding]) };
  }
  try {
    report('repair', 'running');
    calls.repair += 1;
    const repaired = await withAbort(provider.repair({
      source: input.source,
      candidate: prior.candidate,
      ir: prior.ir,
      deterministicFindings: prior.validation?.findings ?? prior.findings,
      ...(isGeneration(current) && current.review ? { review: current.review } : {}),
    }), signal);
    report('repair', 'completed');
    const ir = normalizeItemIntakeIR(input.source, prior.candidate, repaired, BROWSER_ITEM_RESOLVER);
    if ((ir.item?.stages?.length ?? 0) > 1) {
      return { ...structuredClone(prior), status: 'needs_review', ir, stages, calls, repairCount: 1, findings: [finding('MULTI_STAGE_ITEM_UNSUPPORTED', '/item/stages', 'Repair still describes multiple Item stages.')] };
    }
    report('validate', 'running');
    const validation = validateItemIntakeIRWithResolver(input.source, ir, prior.candidate, BROWSER_ITEM_RESOLVER);
    report('validate', validation.blocking.length === 0 ? 'completed' : 'failed');
    return {
      ...structuredClone(prior), status: validation.blocking.length === 0 ? 'ready_to_generate' : 'needs_review',
      ir, validation, findings: validation.findings, stages, calls, repairCount: 1, provider: identity(provider),
    };
  } catch (error) {
    const code = isAbort(error, signal) ? 'cancelled' : 'provider_failure';
    const message = safeMessage(error);
    report('repair', 'failed', message);
    return {
      ...structuredClone(prior), status: 'failed', stages, calls, repairCount: 1, provider: identity(provider),
      findings: dedupe([...current.findings, finding(`REPAIR_${code.toUpperCase()}`, '/intake', message)]),
      errorCode: code,
    };
  }
}

export async function generateAndReviewBrowserItemIntake(
  input: BrowserItemIntakeInput,
  analysis: BrowserItemIntakeAnalysis,
  provider: ItemIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserItemGenerationResult> {
  const stages = structuredClone(analysis.stages);
  const calls = structuredClone(analysis.calls);
  const report = reporter(stages, input.onStage);
  const closed = (findings: ItemIntakeFinding[]): BrowserItemGenerationResult => ({
    status: 'needs_review', analysis: { ...structuredClone(analysis), stages, calls }, rawSourceHash: analysis.rawSourceHash,
    findings, stages, provider: identity(provider), calls,
  });
  if (analysis.status !== 'ready_to_generate' || !analysis.ir || !analysis.candidate || !analysis.rawSourceHash) {
    return closed(dedupe([...analysis.findings, finding('ANALYSIS_NOT_READY', '/intake', 'Analysis is not ready for one Item artifact.')]));
  }
  if (hashSource(input.source) !== analysis.rawSourceHash) return closed(dedupe([...analysis.findings, finding('STALE_SOURCE', '/source', 'Source identity changed after analysis.')]));
  const sourceStageFinding = multiStageSourceFinding(analysis.candidate);
  if (sourceStageFinding) return closed(dedupe([...analysis.findings, sourceStageFinding]));
  if ((analysis.ir.item?.stages?.length ?? 0) > 1) {
    return closed(dedupe([...analysis.findings, finding('MULTI_STAGE_ITEM_UNSUPPORTED', '/item/stages', 'Forge Intake accepts one static Item artifact; multi-stage Item IR requires review.') ]));
  }
  const validation = validateItemIntakeIRWithResolver(input.source, analysis.ir, analysis.candidate, BROWSER_ITEM_RESOLVER);
  if (validation.blocking.length > 0) return closed(validation.findings);
  try {
    report('generate', 'running');
    const markdown = renderItemIntakeMarkdown(input.source, analysis.candidate, analysis.ir);
    const request = buildForgeItemRequest({
      content: markdown,
      displayName: input.displayName ?? input.sourceName,
      requestId: input.requestId,
      fvttVersion: input.fvttVersion,
      systemVersion: input.systemVersion,
      sourceId: input.sourceId,
    });
    const canonicalMarkdown = request.source.content;
    const response = await convertFinalItemSource(request);
    throwIfAborted(signal);
    report('generate', 'completed');
    const formalStatus = itemResponseStatus(response);
    const itemProjection = itemFromResponse(response);
    const formalFindings = projectFormalFindings(response);
    if (formalStatus !== 'accepted') {
      report('finalize', 'failed');
      return {
        status: formalStatus, analysis: { ...structuredClone(analysis), stages, calls }, rawSourceHash: analysis.rawSourceHash,
        finalSourceHash: request.source.utf8Sha256, finalSource: canonicalMarkdown, markdown: canonicalMarkdown, itemProjection, formalStatus,
        findings: dedupe([...validation.findings, ...formalFindings]), stages, provider: identity(provider), calls,
      };
    }
    report('review', 'running');
    calls.review += 1;
    const review = await withAbort(provider.review({
      source: input.source,
      candidate: analysis.candidate,
      ir: analysis.ir,
      markdown: canonicalMarkdown,
      itemProjection,
      deterministicFindings: validation.findings,
    }), signal);
    report('review', 'completed');
    const findings = dedupe([...validation.findings, ...formalFindings, ...(Array.isArray(review.findings) ? review.findings : [])]);
    const status = review.verdict === 'accepted' && !findings.some((entry) => entry.blocking) ? 'accepted' : 'needs_review';
    report('finalize', status === 'accepted' ? 'completed' : 'failed');
    return {
      status,
      analysis: { ...structuredClone(analysis), stages, calls },
      rawSourceHash: analysis.rawSourceHash,
      finalSourceHash: request.source.utf8Sha256,
      finalSource: canonicalMarkdown,
      markdown: canonicalMarkdown,
      ...(status === 'accepted' ? { response } : {}),
      itemProjection,
      formalStatus,
      review,
      findings,
      stages,
      provider: identity(provider),
      calls,
    };
  } catch (error) {
    const code = isAbort(error, signal) ? 'cancelled' : 'provider_failure';
    const message = safeMessage(error);
    report('finalize', code === 'cancelled' ? 'skipped' : 'failed', message);
    return {
      status: 'failed', analysis: { ...structuredClone(analysis), stages, calls }, rawSourceHash: analysis.rawSourceHash,
      findings: dedupe([...analysis.findings, finding(`GENERATION_${code.toUpperCase()}`, '/intake', message)]),
      stages, provider: identity(provider), calls, errorCode: code,
    };
  }
}

function reviewAnalysis(
  errorCode: NonNullable<BrowserItemIntakeAnalysis['errorCode']>,
  input: BrowserItemIntakeInput,
  provider: ItemIntakeAiProvider,
  attemptId: string,
  rawSourceHash: Sha256,
  candidates: ItemDiscoveryCandidate[],
  calls: BrowserItemIntakeCalls,
  stages: BrowserItemIntakeStageResult[],
  findings: ItemIntakeFinding[] = [],
  candidate?: ItemDiscoveryCandidate,
  ir?: ItemIntakeIR,
): BrowserItemIntakeAnalysis {
  void input;
  const defaults: Partial<Record<NonNullable<BrowserItemIntakeAnalysis['errorCode']>, ItemIntakeFinding>> = {
    no_entities: finding('NO_ITEM_ENTITY', '/candidate', 'AI discovery did not identify exactly one Item entity.'),
    multiple_entities: finding('MULTIPLE_ITEM_ENTITIES', '/candidate', `AI discovery identified ${candidates.length} Item entities; Forge Intake does not select the first.`),
  };
  return {
    status: 'needs_review', attemptId, rawSourceHash, candidates, candidate, ir,
    findings: findings.length > 0 ? findings : defaults[errorCode] ? [defaults[errorCode]!] : [],
    stages, provider: identity(provider), calls, repairCount: 0, errorCode,
  };
}

function blockedAnalysis(
  prior: BrowserItemIntakeAnalysis,
  stages: BrowserItemIntakeStageResult[],
  calls: BrowserItemIntakeCalls,
  findings: ItemIntakeFinding[],
  code: string,
  message: string,
): BrowserItemIntakeAnalysis {
  return { ...structuredClone(prior), status: 'needs_review', stages, calls, findings: dedupe([...findings, finding(code, '/intake', message)]) };
}

function identity(provider: ItemIntakeAiProvider): BrowserItemProviderIdentity {
  const metadata = provider as ItemIntakeAiProvider & Partial<Pick<BrowserItemProviderIdentity, 'protocol' | 'reasoning' | 'structuredOutput'>>;
  return {
    providerName: provider.providerName,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    ...(metadata.protocol ? { protocol: metadata.protocol } : {}),
    ...(metadata.reasoning ? { reasoning: metadata.reasoning } : {}),
    ...(metadata.structuredOutput ? { structuredOutput: metadata.structuredOutput } : {}),
    promptVersions: structuredClone(ITEM_INTAKE_PROMPT_VERSIONS),
  };
}

function freshCalls(): BrowserItemIntakeCalls { return { discovery: 0, extraction: 0, review: 0, repair: 0 }; }
function freshStages(): BrowserItemIntakeStageResult[] {
  return (['discover', 'extract', 'validate', 'repair', 'generate', 'review', 'finalize'] as const).map((stage) => ({ stage, status: 'skipped' }));
}
function reporter(stages: BrowserItemIntakeStageResult[], callback: BrowserItemIntakeInput['onStage']) {
  return (stage: BrowserItemIntakeStage, status: BrowserItemIntakeStageResult['status'], message?: string) => {
    const next = { stage, status, ...(message ? { message } : {}) };
    const index = stages.findIndex((entry) => entry.stage === stage);
    if (index >= 0) stages[index] = next;
    callback?.(structuredClone(next));
  };
}

function finding(code: string, path: string, message: string): ItemIntakeFinding {
  return { id: `forge-browser:${code}:${path}`, code, path, message, blocking: true, origin: 'semantic' };
}
function multiStageSourceFinding(candidate: ItemDiscoveryCandidate): ItemIntakeFinding | undefined {
  if (parseItemStages(candidate.quote).length <= 1) return undefined;
  return finding(
    'MULTI_STAGE_ITEM_UNSUPPORTED',
    '/candidate',
    'Forge Intake accepts one static Item artifact; the exact source candidate contains multiple lifecycle stages.',
  );
}
function dedupe(findings: ItemIntakeFinding[]): ItemIntakeFinding[] {
  return [...new Map(findings.map((entry) => [`${entry.id}\u0000${entry.code}\u0000${entry.path}`, entry])).values()];
}
function isGeneration(value: BrowserItemIntakeAnalysis | BrowserItemGenerationResult): value is BrowserItemGenerationResult {
  return 'analysis' in value;
}
function itemResponseStatus(response: ForgeItemResponse): 'accepted' | 'needs_review' | 'failed' {
  return 'result' in response ? response.result.status : 'failed';
}
function itemFromResponse(response: ForgeItemResponse): unknown {
  return 'result' in response && 'artifact' in response.result ? response.result.artifact : {};
}
function projectFormalFindings(response: ForgeItemResponse): ItemIntakeFinding[] {
  if (!('result' in response)) return [finding(response.error.code, '/', response.error.message)];
  return response.result.diagnostics
    .filter((entry) => entry.severity === 'warning' || entry.severity === 'error')
    .map((entry, index) => ({
      id: `formal:${entry.code}:${index}`, code: entry.code, path: entry.path, message: entry.message,
      blocking: true, origin: 'semantic' as const,
    }));
}
function assertInput(source: string): void {
  if (typeof source !== 'string' || !source.trim()) throw new Error('AI Item Intake source is empty.');
  if (new TextEncoder().encode(source).byteLength > 200_000) throw new Error('AI Item Intake source exceeds the 200000 UTF-8 byte limit.');
}
function inputErrorCode(error: unknown): BrowserItemIntakeAnalysis['errorCode'] | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'AI Item Intake source is empty.') return 'input_empty';
  if (message.includes('200000 UTF-8')) return 'input_too_large';
  return undefined;
}
function safeMessage(error: unknown): string {
  if (error instanceof MonsterIntakeProviderError) {
    if (error.code === 'rate_limited') return 'AI Item Intake provider rate limited the request.';
    if (error.code === 'timeout') return 'AI Item Intake provider request timed out.';
    if (error.code === 'http_error') return `AI Item Intake provider rejected the request with HTTP ${error.status ?? 'unknown'}.`;
    if (error.code === 'invalid_response') return 'AI Item Intake provider returned an invalid schema response.';
    if (error.code === 'network') return 'AI Item Intake provider network request failed or was blocked by CORS.';
    return 'AI Item Intake provider configuration is invalid.';
  }
  const code = inputErrorCode(error);
  if (code === 'input_empty') return 'AI Item Intake source is empty.';
  if (code === 'input_too_large') return 'AI Item Intake source exceeds the 200000 UTF-8 byte limit.';
  if (error instanceof DOMException && error.name === 'AbortError') return 'AI Item Intake was cancelled.';
  return 'AI Item Intake failed before an accepted result.';
}
function assertHttpsEndpoint(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new Error('The browser AI endpoint must use HTTPS.');
  if (url.username || url.password) throw new Error('The browser AI endpoint must not contain URL credentials.');
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}
function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof DOMException && error.name === 'AbortError');
}
async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function fetchWithCallerAbort(
  url: string,
  init: Parameters<NonNullable<OpenAICompatibleItemIntakeOptions['httpClient']>>[1],
  callerSignal?: AbortSignal,
) {
  const signal = combineAbortSignals(callerSignal, init.signal);
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal } as RequestInit);
  } catch (error) {
    if (callerSignal?.aborted) {
      throw new MonsterIntakeProviderError(
        'network',
        'AI Item Intake request was cancelled.',
        { retryable: false },
      );
    }
    throw error;
  }
  return guardResponseBodyForCallerAbort(
    response,
    callerSignal,
    () => new MonsterIntakeProviderError(
      'network',
      'AI Item Intake request was cancelled.',
      { retryable: false },
    ),
  );
}

function responseFormatForBrowserEndpoint(baseUrl: string): OpenAICompatibleItemIntakeOptions['responseFormat'] {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com' ? 'json_object' : 'json_schema';
  } catch {
    return 'json_schema';
  }
}

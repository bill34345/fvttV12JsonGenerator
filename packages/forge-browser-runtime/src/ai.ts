import {
  attachForgeSourceId,
  hashSource,
  type ForgeActorResponse,
  type ForgeSourceId,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  MonsterIntakeProviderError,
  OpenAICompatibleMonsterIntakeProvider,
  type OpenAICompatibleMonsterIntakeOptions,
} from '@fvtt-json-generator/intake-ai/provider';
import {
  chunkSource,
  normalizeDiscovery,
  partitionDiscoveryCandidates,
} from '@fvtt-json-generator/intake-ai/discovery';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import type {
  DiscoveryCandidate,
  IntakeFinding,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
} from '@fvtt-json-generator/intake-ai/types';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from './index';
import { resolveActorIntakeStatus } from './status';

export type BrowserActorIntakeStage =
  | 'discover'
  | 'extract'
  | 'validate'
  | 'repair'
  | 'generate'
  | 'review'
  | 'finalize';

const STAGE_ORDER: readonly BrowserActorIntakeStage[] = [
  'discover',
  'extract',
  'validate',
  'repair',
  'generate',
  'review',
  'finalize',
];

export interface BrowserActorIntakeStageResult {
  stage: BrowserActorIntakeStage;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
}

export interface BrowserActorIntakeInput {
  source: string;
  sourceName: string;
  displayName?: string;
  requestId: string;
  fvttVersion: string;
  systemVersion: string;
  sourceId?: ForgeSourceId;
  onStage?: (stage: BrowserActorIntakeStageResult) => void;
}

export interface BrowserActorEvidenceSummary {
  candidate: DiscoveryCandidate;
  source: MonsterIntakeIR['source'];
  claims: MonsterIntakeIR['claims'];
  coverage: MonsterIntakeIR['coverage'];
  uncertainties: MonsterIntakeIR['uncertainties'];
}

export interface BrowserActorIntakeResult {
  status: 'accepted' | 'needs_review' | 'failed';
  rawSourceHash?: Sha256;
  finalSourceHash?: Sha256;
  finalSource?: string;
  markdown?: string;
  evidence?: BrowserActorEvidenceSummary;
  response?: ForgeActorResponse;
  findings: IntakeFinding[];
  stages: BrowserActorIntakeStageResult[];
  errorCode?: MonsterIntakeProviderError['code'] | 'browser_transport' | 'multiple_entities' | 'no_entities' | 'cancelled' | 'input_empty' | 'input_too_large';
}

export interface BrowserAiProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  reviewModel?: string;
  timeoutMs?: number;
  repairTimeoutMs?: number;
  reasoningEffort?: OpenAICompatibleMonsterIntakeOptions['reasoningEffort'];
  audit?: OpenAICompatibleMonsterIntakeOptions['audit'];
}

export function createBrowserAiProvider(
  options: BrowserAiProviderOptions,
  signal?: AbortSignal,
): MonsterIntakeAiProvider {
  assertHttpsEndpoint(options.baseUrl);
  const provider = new OpenAICompatibleMonsterIntakeProvider({
    authMode: 'api-key',
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    reviewModel: options.reviewModel ?? options.model,
    timeoutMs: options.timeoutMs ?? 60_000,
    repairTimeoutMs: options.repairTimeoutMs ?? 180_000,
    ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
    audit: options.audit,
    httpClient: (url, init) => fetchWithCallerAbort(url, init, signal),
  });
  return {
    providerName: provider.providerName,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    discover: (request) => classifyBrowserProviderCall(provider.discover(request), signal),
    extract: (request) => classifyBrowserProviderCall(provider.extract(request), signal),
    review: (request) => classifyBrowserProviderCall(provider.review(request), signal),
    repair: (request) => classifyBrowserProviderCall(provider.repair(request), signal),
  };
}

function fetchWithCallerAbort(
  url: string,
  init: Parameters<NonNullable<OpenAICompatibleMonsterIntakeOptions['httpClient']>>[1],
  callerSignal?: AbortSignal,
): Promise<Response> {
  if (!callerSignal) {
    return fetch(url, { ...init, redirect: 'error' } as RequestInit);
  }
  const providerSignal = init.signal;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (callerSignal.aborted || providerSignal?.aborted) controller.abort();
  else {
    callerSignal.addEventListener('abort', abort, { once: true });
    providerSignal?.addEventListener('abort', abort, { once: true });
  }
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: controller.signal,
  } as RequestInit)
    .catch((error: unknown) => {
      if (callerSignal.aborted) {
        throw new MonsterIntakeProviderError(
          'network',
          'AI monster intake request was cancelled.',
          { retryable: false },
        );
      }
      throw error;
    })
    .finally(() => {
      callerSignal.removeEventListener('abort', abort);
      providerSignal?.removeEventListener('abort', abort);
    });
}

export async function convertRawActorSourceWithAi(
  input: BrowserActorIntakeInput,
  provider: MonsterIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserActorIntakeResult> {
  let rawSourceHash: Sha256 | undefined;
  const stages: BrowserActorIntakeStageResult[] = STAGE_ORDER.map((stage) => ({ stage, status: 'skipped' }));
  const report = (
    stage: BrowserActorIntakeStage,
    status: BrowserActorIntakeStageResult['status'],
    message?: string,
  ) => markStage(stages, input.onStage, stage, status, message);
  let currentFindings: IntakeFinding[] = [];
  let evidence: BrowserActorEvidenceSummary | undefined;
  try {
    assertInput(input.source);
    const sourceHash = hashSource(input.source);
    rawSourceHash = sourceHash;
    throwIfAborted(signal);

    const candidates = await runDiscovery(input.source, sourceHash, provider, report, signal);
    if (candidates.length === 0) {
      return reviewResult(rawSourceHash, stages, currentFindings, report, 'no_entities', 'AI did not identify one Actor entity.');
    }
    if (candidates.length !== 1) {
      return reviewResult(rawSourceHash, stages, currentFindings, report, 'multiple_entities', 'The source contains multiple Actor candidates; select exactly one before creating an Actor.');
    }
    const candidate = candidates[0]!;
    throwIfAborted(signal);

    report('extract', 'running');
    let ir = await withAbort(provider.extract({
      source: input.source,
      sourceSha256: sourceHash,
      candidate,
    }), signal);
    report('extract', 'completed');
    evidence = projectEvidence(ir, candidate);

    report('validate', 'running');
    let validation = validateMonsterIntakeIR(input.source, ir, { coverageRange: candidate });
    currentFindings = validation.findings;
    if (validation.blocking.length > 0) {
      report('repair', 'running');
      ir = await withAbort(provider.repair({
        stage: 'deterministic-validation',
        source: input.source,
        ir,
        deterministicFindings: validation.findings,
      }), signal);
      report('repair', 'completed');
      validation = validateMonsterIntakeIR(input.source, ir, { coverageRange: candidate });
      currentFindings = validation.findings;
      evidence = projectEvidence(ir, candidate);
    }
    if (validation.blocking.length > 0) {
      return reviewResult(rawSourceHash, stages, currentFindings, report, undefined, 'Deterministic validation still has blocking findings after one bounded repair.', evidence);
    }
    report('validate', 'completed');

    report('generate', 'running');
    let rendered = await renderAndAttach(ir, input.sourceId);
    let response = await convertRenderedActor(input, rendered.content, rendered.sourceId);
    throwIfAborted(signal);
    report('generate', 'completed');

    let intakeVerification = verifyRenderedActor(input.source, ir, rendered.content, response, candidate);
    currentFindings = dedupeFindings([...validation.findings, ...intakeVerification.findings]);
    report('review', 'running');
    let review = await withAbort(provider.review({
      source: input.source,
      ir,
      markdown: rendered.content,
      actorProjection: actorFromResponse(response),
      deterministicFindings: [...validation.findings, ...intakeVerification.findings],
    }), signal);

    if (review.verdict === 'revise') {
      report('repair', 'running');
      ir = await withAbort(provider.repair({
        stage: 'semantic-review',
        source: input.source,
        ir,
        markdown: rendered.content,
        actorProjection: actorFromResponse(response),
        deterministicFindings: [...validation.findings, ...intakeVerification.findings],
        review,
      }), signal);
      report('repair', 'completed');
      validation = validateMonsterIntakeIR(input.source, ir, { coverageRange: candidate });
      currentFindings = validation.findings;
      if (validation.blocking.length > 0) {
        return reviewResult(rawSourceHash, stages, currentFindings, report, undefined, 'Semantic repair produced blocking deterministic findings.', projectEvidence(ir, candidate));
      }
      report('generate', 'running');
      rendered = await renderAndAttach(ir, input.sourceId);
      response = await convertRenderedActor(input, rendered.content, rendered.sourceId);
      report('generate', 'completed');
      intakeVerification = verifyRenderedActor(input.source, ir, rendered.content, response, candidate);
      currentFindings = dedupeFindings([...validation.findings, ...intakeVerification.findings]);
      evidence = projectEvidence(ir, candidate);
      review = await withAbort(provider.review({
        source: input.source,
        ir,
        markdown: rendered.content,
        actorProjection: actorFromResponse(response),
        deterministicFindings: [...validation.findings, ...intakeVerification.findings],
      }), signal);
    }
    report('review', 'completed');

    const finalFindings = dedupeFindings([...currentFindings, ...review.findings]);
    const resolvedStatus = resolveActorIntakeStatus(
      responseStatus(response),
      review.verdict,
      intakeVerification.status,
    );
    const status = resolvedStatus === 'accepted' && finalFindings.some((finding) => finding.blocking)
      ? 'needs_review'
      : resolvedStatus;
    report('finalize', status === 'accepted' ? 'completed' : 'failed');
    return {
      status,
      rawSourceHash: sourceHash,
      finalSourceHash: hashSource(rendered.content),
      finalSource: rendered.content,
      markdown: rendered.content,
      evidence: evidence ?? projectEvidence(ir, candidate),
      response,
      findings: finalFindings,
      stages,
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      report('finalize', 'skipped', 'AI intake cancelled before Actor creation.');
      return { status: 'failed', rawSourceHash, findings: currentFindings, stages, errorCode: 'cancelled' };
    }
    const message = safeProviderMessage(error);
    report('finalize', 'failed', message);
    return {
      status: 'failed',
      rawSourceHash,
      findings: currentFindings,
      stages,
      errorCode: inputErrorCode(error) ?? providerErrorCode(error),
    };
  }
}

function dedupeFindings(findings: IntakeFinding[]): IntakeFinding[] {
  const unique = new Map<string, IntakeFinding>();
  for (const finding of findings) {
    unique.set(`${finding.origin}\u0000${finding.code}\u0000${finding.path}\u0000${finding.id}`, finding);
  }
  return [...unique.values()];
}

async function runDiscovery(
  source: string,
  sourceSha256: Sha256,
  provider: MonsterIntakeAiProvider,
  report: (stage: BrowserActorIntakeStage, status: BrowserActorIntakeStageResult['status'], message?: string) => void,
  signal?: AbortSignal,
): Promise<DiscoveryCandidate[]> {
  report('discover', 'running');
  const candidates: DiscoveryCandidate[] = [];
  for (const chunk of chunkSource(source)) {
    throwIfAborted(signal);
    const result = await withAbort(provider.discover({
      source: chunk.text,
      sourceSha256,
      chunkStart: chunk.start,
      chunkEnd: chunk.end,
    }), signal);
    if (result?.schemaVersion !== 1 || !Array.isArray(result.candidates)) {
      throw new MonsterIntakeProviderError('invalid_response', 'AI discovery returned an invalid schema response.');
    }
    candidates.push(...result.candidates);
  }
  try {
    const result = partitionDiscoveryCandidates(source, normalizeDiscovery(source, candidates));
    report('discover', 'completed');
    return result;
  } catch (error) {
    throw new MonsterIntakeProviderError(
      'invalid_response',
      `AI discovery candidates could not be normalized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function renderAndAttach(sourceIr: MonsterIntakeIR, sourceId?: ForgeSourceId) {
  const markdown = renderMonsterIntakeMarkdown(sourceIr);
  return attachForgeSourceId(markdown, sourceId);
}

async function convertRenderedActor(
  input: BrowserActorIntakeInput,
  content: string,
  sourceId: ForgeSourceId,
): Promise<ForgeActorResponse> {
  const request = buildForgeActorRequest({
    content,
    displayName: input.displayName ?? input.sourceName,
    requestId: input.requestId,
    fvttVersion: input.fvttVersion,
    systemVersion: input.systemVersion,
    sourceId,
  });
  return convertFinalActorSource(request);
}

function verifyRenderedActor(
  source: string,
  ir: MonsterIntakeIR,
  markdown: string,
  response: ForgeActorResponse,
  candidate: DiscoveryCandidate,
) {
  const actor = actorFromResponse(response);
  return verifyMonsterIntake(source, ir, markdown, actor, candidate);
}

function actorFromResponse(response: ForgeActorResponse): unknown {
  if (!('result' in response)) return {};
  return response.result && 'artifact' in response.result ? response.result.artifact : {};
}

function projectEvidence(ir: MonsterIntakeIR, candidate: DiscoveryCandidate): BrowserActorEvidenceSummary {
  return structuredClone({
    candidate,
    source: ir.source,
    claims: ir.claims,
    coverage: ir.coverage,
    uncertainties: ir.uncertainties,
  });
}

function responseStatus(response: ForgeActorResponse): 'accepted' | 'needs_review' | 'failed' {
  if (!('result' in response)) return 'failed';
  return response.result.status;
}

function reviewResult(
  rawSourceHash: Sha256 | undefined,
  stages: BrowserActorIntakeStageResult[],
  findings: IntakeFinding[],
  report: (stage: BrowserActorIntakeStage, status: BrowserActorIntakeStageResult['status'], message?: string) => void,
  errorCode: 'multiple_entities' | 'no_entities' | undefined,
  message: string,
  evidence?: BrowserActorEvidenceSummary,
): BrowserActorIntakeResult {
  report('finalize', 'failed', message);
  return { status: 'needs_review', rawSourceHash, findings, stages, ...(evidence ? { evidence } : {}), ...(errorCode ? { errorCode } : {}) };
}

function assertInput(source: string): void {
  if (typeof source !== 'string' || source.trim().length === 0) throw new Error('Source text must not be empty.');
  if (new TextEncoder().encode(source).byteLength > 200_000) throw new Error('Source text exceeds the 200000 UTF-8 byte limit.');
}

function inputErrorCode(error: unknown): 'input_empty' | 'input_too_large' | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'Source text must not be empty.') return 'input_empty';
  if (message === 'Source text exceeds the 200000 UTF-8 byte limit.') return 'input_too_large';
  return undefined;
}

function assertHttpsEndpoint(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new Error('The browser AI endpoint must use HTTPS.');
  if (url.username || url.password) throw new Error('The browser AI endpoint must not contain URL credentials.');
}

function markStage(
  stages: BrowserActorIntakeStageResult[],
  onStage: BrowserActorIntakeInput['onStage'],
  stage: BrowserActorIntakeStage,
  status: BrowserActorIntakeStageResult['status'],
  message?: string,
): void {
  const old = stages.findIndex((entry) => entry.stage === stage);
  const next = { stage, status, ...(message ? { message } : {}) };
  if (old >= 0) stages[old] = next;
  else stages.push(next);
  onStage?.(structuredClone(next));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function safeProviderMessage(error: unknown): string {
  if (error instanceof BrowserAiTransportError) {
    return 'The browser could not complete the AI provider request. The endpoint may be unreachable or blocked by CORS.';
  }
  if (error instanceof MonsterIntakeProviderError) {
    if (error.code === 'rate_limited') return 'AI provider rate limited the request.';
    if (error.code === 'timeout') return 'AI provider request timed out.';
    if (error.code === 'http_error') return `AI provider rejected the request with HTTP ${error.status ?? 'unknown'}.`;
    if (error.code === 'invalid_response') return 'AI provider returned an invalid schema response.';
    if (error.code === 'network') return 'AI provider network request failed.';
    return 'AI provider configuration is invalid.';
  }
  return error instanceof Error ? error.message.slice(0, 500) : 'AI intake failed.';
}

class BrowserAiTransportError extends Error {
  public readonly code = 'browser_transport' as const;

  public constructor(cause: unknown) {
    super('Browser transport could not reach the AI provider or was blocked by CORS.', { cause });
    this.name = 'BrowserAiTransportError';
  }
}

async function classifyBrowserProviderCall<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (signal?.aborted) throwIfAborted(signal);
    if (isAbortError(error)) throw error;
    if (!(error instanceof MonsterIntakeProviderError) || error.code !== 'network') throw error;
    throw new BrowserAiTransportError(error);
  }
}

function providerErrorCode(error: unknown): BrowserActorIntakeResult['errorCode'] {
  if (error instanceof BrowserAiTransportError) return error.code;
  return error instanceof MonsterIntakeProviderError ? error.code : undefined;
}

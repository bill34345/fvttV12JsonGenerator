import {
  attachForgeSourceId,
  hashSource,
  type ForgeActorResponse,
  type ForgeSourceId,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  INTAKE_PROMPT_VERSIONS,
  MonsterIntakeProviderError,
  OpenAICompatibleMonsterIntakeProvider,
  type OpenAICompatibleMonsterIntakeOptions,
} from '@fvtt-json-generator/intake-ai/provider';
import type {
  IntakeAuthScheme,
  IntakeProviderActivity,
  IntakeReasoning,
  IntakeRequestWaitPolicy,
  IntakeStructuredOutputMode,
  IntakeTransportProtocol,
} from '@fvtt-json-generator/intake-ai/transport';
export type { IntakeProviderActivity, IntakeRequestWaitStatus } from '@fvtt-json-generator/intake-ai/transport';
import {
  chunkSource,
  normalizeDiscovery,
  partitionDiscoveryCandidates,
} from '@fvtt-json-generator/intake-ai/discovery';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import {
  BROWSER_AI_REPAIR_TIMEOUT_MS,
  BROWSER_AI_STAGE_TIMEOUT_MS,
} from './providerTiming';
export {
  BROWSER_AI_WAIT_CYCLE_MS,
  BROWSER_AI_WAIT_CYCLES_BEFORE_DECISION,
} from './providerTiming';
import type {
  AiReviewResult,
  DiscoveryCandidate,
  IntakeFinding,
  IntakeValidationResult,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
} from '@fvtt-json-generator/intake-ai/types';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from './index';
import { combineAbortSignals, guardResponseBodyForCallerAbort } from './abortSignal';
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
  providerId?: string;
  protocol?: IntakeTransportProtocol;
  authScheme?: IntakeAuthScheme;
  region?: string;
  reasoning?: IntakeReasoning;
  structuredOutput?: IntakeStructuredOutputMode;
  timeoutMs?: number;
  repairTimeoutMs?: number;
  reasoningEffort?: OpenAICompatibleMonsterIntakeOptions['reasoningEffort'];
  audit?: OpenAICompatibleMonsterIntakeOptions['audit'];
  waitPolicy?: IntakeRequestWaitPolicy;
  onActivity?: (activity: IntakeProviderActivity) => void;
}

export interface BrowserActorIntakeCalls {
  discovery: number;
  extraction: number;
  review: number;
  repair: number;
}

export interface BrowserActorIntakeProviderIdentity {
  providerName: string;
  extractionModel: string;
  reviewModel: string;
  protocol?: IntakeTransportProtocol;
  reasoning?: IntakeReasoning;
  structuredOutput?: IntakeStructuredOutputMode;
  promptVersions: typeof INTAKE_PROMPT_VERSIONS;
}

export interface BrowserActorIntakeAnalysis {
  status: 'ready_to_generate' | 'needs_review' | 'failed';
  attemptId: string;
  rawSourceHash?: Sha256;
  candidates: DiscoveryCandidate[];
  candidate?: DiscoveryCandidate;
  ir?: MonsterIntakeIR;
  validation?: IntakeValidationResult;
  evidence?: BrowserActorEvidenceSummary;
  findings: IntakeFinding[];
  stages: BrowserActorIntakeStageResult[];
  provider: BrowserActorIntakeProviderIdentity;
  calls: BrowserActorIntakeCalls;
  repairCount: 0 | 1;
  errorCode?: BrowserActorIntakeResult['errorCode'];
}

export interface BrowserActorGenerationResult {
  status: 'accepted' | 'needs_review' | 'failed';
  analysis: BrowserActorIntakeAnalysis;
  rawSourceHash?: Sha256;
  finalSourceHash?: Sha256;
  finalSource?: string;
  markdown?: string;
  evidence?: BrowserActorEvidenceSummary;
  response?: ForgeActorResponse;
  actorProjection?: unknown;
  formalStatus?: 'accepted' | 'needs_review' | 'failed';
  intakeVerificationStatus?: 'accepted' | 'needs_review';
  review?: AiReviewResult;
  findings: IntakeFinding[];
  stages: BrowserActorIntakeStageResult[];
  provider: BrowserActorIntakeProviderIdentity;
  calls: BrowserActorIntakeCalls;
  errorCode?: BrowserActorIntakeResult['errorCode'];
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
    audit: options.audit,
    waitPolicy: options.waitPolicy,
    onActivity: options.onActivity,
    httpClient: (url, init) => fetchWithCallerAbort(url, init, signal),
  });
  return {
    providerName: options.providerId ?? provider.providerName,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    ...(options.protocol ? { protocol: options.protocol } : {}),
    ...((options.reasoning ?? options.reasoningEffort) ? { reasoning: options.reasoning ?? options.reasoningEffort } : {}),
    ...(options.structuredOutput ? { structuredOutput: options.structuredOutput } : {}),
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
  const signal = combineAbortSignals(callerSignal, init.signal);
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal,
  } as RequestInit)
    .then((response) => guardResponseBodyForCallerAbort(
      response,
      callerSignal,
      () => new MonsterIntakeProviderError(
        'network',
        'AI monster intake request was cancelled.',
        { retryable: false },
      ),
    ))
    .catch((error: unknown) => {
      if (callerSignal?.aborted) {
        throw new MonsterIntakeProviderError(
          'network',
          'AI monster intake request was cancelled.',
          { retryable: false },
        );
      }
      throw error;
    });
}

export async function analyzeBrowserActorSourceWithAi(
  input: BrowserActorIntakeInput,
  provider: MonsterIntakeAiProvider,
  signal?: AbortSignal,
  attemptId = `${input.requestId}:attempt-1`,
): Promise<BrowserActorIntakeAnalysis> {
  const stages = freshStages();
  const calls = freshCalls();
  const identity = providerIdentity(provider);
  const report = stageReporter(stages, input.onStage);
  let rawSourceHash: Sha256 | undefined;
  try {
    assertInput(input.source);
    rawSourceHash = hashSource(input.source);
    throwIfAborted(signal);
    const counted = countProviderCalls(provider, calls);
    const candidates = await runDiscovery(input.source, rawSourceHash, counted, report, signal);
    if (candidates.length === 0) {
      return {
        status: 'needs_review', attemptId, rawSourceHash, candidates,
        findings: [boundedFinding('NO_ACTOR_ENTITY', 'AI discovery did not identify exactly one Actor entity.')], stages,
        provider: identity, calls, repairCount: 0, errorCode: 'no_entities',
      };
    }
    if (candidates.length !== 1) {
      return {
        status: 'needs_review', attemptId, rawSourceHash, candidates,
        findings: [boundedFinding('MULTIPLE_ACTOR_ENTITIES', `AI discovery identified ${candidates.length} Actor entities; Forge Intake does not select the first.`)], stages,
        provider: identity, calls, repairCount: 0, errorCode: 'multiple_entities',
      };
    }
    const candidate = candidates[0]!;
    report('extract', 'running');
    const ir = normalizeBrowserMonsterIr(
      input.source,
      candidate,
      await withAbort(counted.extract({ source: input.source, sourceSha256: rawSourceHash, candidate }), signal),
    );
    report('extract', 'completed');
    report('validate', 'running');
    const validation = validateMonsterIntakeIR(input.source, ir, { coverageRange: candidate });
    report('validate', validation.blocking.length === 0 ? 'completed' : 'failed');
    return {
      status: validation.blocking.length === 0 ? 'ready_to_generate' : 'needs_review',
      attemptId,
      rawSourceHash,
      candidates,
      candidate,
      ir,
      validation,
      evidence: projectEvidence(ir, candidate),
      findings: validation.findings,
      stages,
      provider: identity,
      calls,
      repairCount: 0,
    };
  } catch (error) {
    const errorCode = isAbortError(error) || signal?.aborted
      ? 'cancelled'
      : inputErrorCode(error) ?? providerErrorCode(error);
    const message = safeProviderMessage(error);
    report('finalize', errorCode === 'cancelled' ? 'skipped' : 'failed', message);
    return {
      status: 'failed', attemptId, rawSourceHash, candidates: [],
      findings: [boundedFinding(`ANALYSIS_${String(errorCode ?? 'provider_failure').toUpperCase()}`, message)], stages,
      provider: identity, calls, repairCount: 0, ...(errorCode ? { errorCode } : {}),
    };
  }
}

const ABSENT_OPTIONAL_FEATURE_SECTION_SIGNALS = {
  bonusActions: /(?:\bbonus\s+actions?\b|附赠动作)/iu,
  reactions: /(?:\breactions?\b|反应)/iu,
  legendaryActions: /(?:\blegendary\s+actions?\b|传奇动作)/iu,
} as const;

function normalizeBrowserMonsterIr(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
): MonsterIntakeIR {
  const next = structuredClone(ir);
  for (const claim of Array.isArray(next.claims) ? next.claims : []) {
    for (const ref of Array.isArray(claim?.evidence) ? claim.evidence : []) {
      if (typeof ref.quote === 'string') continue;
      const rangeIsExact = Number.isInteger(ref.start)
        && Number.isInteger(ref.end)
        && ref.start >= candidate.start
        && ref.end > ref.start
        && ref.end <= candidate.end
        && ref.end <= source.length;
      if (rangeIsExact) ref.quote = source.slice(ref.start, ref.end);
    }
  }

  const referencedPaths = [
    ...(Array.isArray(next.claims) ? next.claims.map((claim) => claim?.path) : []),
    ...(Array.isArray(next.coverage) ? next.coverage.flatMap((entry) => (
      Array.isArray(entry?.claimPaths) ? entry.claimPaths : []
    )) : []),
  ].filter((path): path is string => typeof path === 'string');
  for (const [section, sourceSignal] of Object.entries(ABSENT_OPTIONAL_FEATURE_SECTION_SIGNALS)) {
    const featureSection = section as keyof typeof ABSENT_OPTIONAL_FEATURE_SECTION_SIGNALS;
    const parentPath = `/creature/${featureSection}`;
    const current = next.creature[featureSection];
    if (current !== undefined && current !== null) continue;
    if (sourceSignal.test(source)) continue;
    if (referencedPaths.some((path) => path === parentPath || path.startsWith(`${parentPath}/`))) continue;
    next.creature[featureSection] = [];
  }

  const claims = Array.isArray(next.claims) ? next.claims : [];
  for (const entry of Array.isArray(next.coverage) ? next.coverage : []) {
    if (!Array.isArray(entry?.claimPaths)) continue;
    entry.claimPaths = [...new Set(entry.claimPaths.flatMap((path) => {
      if (!/^\/creature\/(?:traits|actions|bonusActions|reactions|legendaryActions|mythicActions)$/u.test(path)) {
        return [path];
      }
      const childPaths = claims.filter((claim) => (
        typeof claim?.path === 'string'
        && claim.path.startsWith(`${path}/`)
        && Array.isArray(claim.evidence)
        && claim.evidence.some((ref) => (
          source.slice(ref.start, ref.end) === ref.quote
          && ref.start < entry.end
          && ref.end > entry.start
        ))
      )).map((claim) => claim.path);
      return childPaths.length > 0 ? childPaths : [path];
    }))];
  }
  return next;
}

export async function repairBrowserActorIntake(
  input: BrowserActorIntakeInput,
  current: BrowserActorIntakeAnalysis | BrowserActorGenerationResult,
  provider: MonsterIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserActorIntakeAnalysis> {
  const prior = isGenerationResult(current) ? current.analysis : current;
  const stages = structuredClone(current.stages);
  const calls = structuredClone(current.calls);
  const report = stageReporter(stages, input.onStage);
  if (prior.repairCount >= 1) {
    return {
      ...structuredClone(prior), status: 'needs_review', stages, calls,
      findings: dedupeFindings([...current.findings, boundedFinding('REPAIR_BUDGET_EXHAUSTED', 'This attempt already used its one bounded repair.')]),
    };
  }
  if (!prior.ir || !prior.candidate || !prior.rawSourceHash || hashSource(input.source) !== prior.rawSourceHash) {
    return {
      ...structuredClone(prior), status: 'needs_review', stages, calls,
      findings: dedupeFindings([...current.findings, boundedFinding('STALE_SOURCE', 'Source identity changed; start a new analysis attempt before repair.')]),
    };
  }
  const counted = countProviderCalls(provider, calls);
  try {
    report('repair', 'running');
    const rawRepaired = isGenerationResult(current) && current.review && current.markdown
      ? await withAbort(counted.repair({
          stage: 'semantic-review',
          source: input.source,
          ir: prior.ir,
          markdown: current.markdown,
          actorProjection: current.actorProjection ?? {},
          deterministicFindings: prior.validation?.findings ?? prior.findings,
          review: current.review,
        }), signal)
      : await withAbort(counted.repair({
          stage: 'deterministic-validation',
          source: input.source,
          ir: prior.ir,
          deterministicFindings: prior.validation?.findings ?? prior.findings,
        }), signal);
    const repaired = normalizeBrowserMonsterIr(input.source, prior.candidate, rawRepaired);
    report('repair', 'completed');
    report('validate', 'running');
    const validation = validateMonsterIntakeIR(input.source, repaired, { coverageRange: prior.candidate });
    report('validate', validation.blocking.length === 0 ? 'completed' : 'failed');
    return {
      ...structuredClone(prior),
      status: validation.blocking.length === 0 ? 'ready_to_generate' : 'needs_review',
      ir: repaired,
      validation,
      evidence: projectEvidence(repaired, prior.candidate),
      findings: validation.findings,
      stages,
      provider: providerIdentity(provider),
      calls,
      repairCount: 1,
    };
  } catch (error) {
    const errorCode = isAbortError(error) || signal?.aborted ? 'cancelled' : providerErrorCode(error);
    const message = safeProviderMessage(error);
    report('repair', 'failed', message);
    return {
      ...structuredClone(prior), status: 'failed', stages, calls, repairCount: 1,
      findings: dedupeFindings([...current.findings, boundedFinding(`REPAIR_${String(errorCode ?? 'provider_failure').toUpperCase()}`, message)]),
      provider: providerIdentity(provider), ...(errorCode ? { errorCode } : {}),
    };
  }
}

export async function generateAndReviewBrowserActorIntake(
  input: BrowserActorIntakeInput,
  analysis: BrowserActorIntakeAnalysis,
  provider: MonsterIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserActorGenerationResult> {
  const stages = structuredClone(analysis.stages);
  const calls = structuredClone(analysis.calls);
  const report = stageReporter(stages, input.onStage);
  const failClosed = (findings: IntakeFinding[], code?: BrowserActorIntakeResult['errorCode']): BrowserActorGenerationResult => ({
    status: 'needs_review', analysis: { ...structuredClone(analysis), stages, calls }, rawSourceHash: analysis.rawSourceHash,
    evidence: analysis.evidence, findings, stages, provider: providerIdentity(provider), calls, ...(code ? { errorCode: code } : {}),
  });
  if (analysis.status !== 'ready_to_generate' || !analysis.ir || !analysis.candidate || !analysis.rawSourceHash) {
    return failClosed(dedupeFindings([...analysis.findings, boundedFinding('ANALYSIS_NOT_READY', 'Analysis is not ready to generate one Actor candidate.')]));
  }
  if (hashSource(input.source) !== analysis.rawSourceHash) {
    return failClosed(dedupeFindings([...analysis.findings, boundedFinding('STALE_SOURCE', 'Source identity changed after analysis.') ]));
  }
  const validation = validateMonsterIntakeIR(input.source, analysis.ir, { coverageRange: analysis.candidate });
  if (validation.blocking.length > 0) return failClosed(validation.findings);
  const counted = countProviderCalls(provider, calls);
  try {
    report('generate', 'running');
    const rendered = await renderAndAttach(analysis.ir, input.sourceId);
    const response = await convertRenderedActor(input, rendered.content, rendered.sourceId);
    throwIfAborted(signal);
    report('generate', 'completed');
    const actorProjection = actorFromResponse(response);
    const intakeVerification = verifyRenderedActor(input.source, analysis.ir, rendered.content, response, analysis.candidate);
    const deterministicFindings = dedupeFindings([...validation.findings, ...intakeVerification.findings]);
    report('review', 'running');
    const rawReview = await withAbort(counted.review({
      source: input.source,
      ir: analysis.ir,
      markdown: rendered.content,
      actorProjection,
      deterministicFindings,
    }), signal);
    const review = adjudicateBrowserActorReview(
      input.source,
      analysis.ir,
      actorProjection,
      deterministicFindings,
      rawReview,
    );
    report('review', 'completed');
    const findings = dedupeFindings([...deterministicFindings, ...review.findings]);
    const formalStatus = responseStatus(response);
    const resolved = resolveActorIntakeStatus(formalStatus, review.verdict, intakeVerification.status);
    const status = resolved === 'accepted' && findings.some((finding) => finding.blocking)
      ? 'needs_review'
      : resolved;
    report('finalize', status === 'accepted' ? 'completed' : 'failed');
    return {
      status,
      analysis: { ...structuredClone(analysis), stages, calls },
      rawSourceHash: analysis.rawSourceHash,
      finalSourceHash: hashSource(rendered.content),
      finalSource: rendered.content,
      markdown: rendered.content,
      evidence: projectEvidence(analysis.ir, analysis.candidate),
      ...(status === 'accepted' ? { response } : {}),
      actorProjection,
      formalStatus,
      intakeVerificationStatus: intakeVerification.status,
      review,
      findings,
      stages,
      provider: providerIdentity(provider),
      calls,
    };
  } catch (error) {
    const errorCode = isAbortError(error) || signal?.aborted ? 'cancelled' : providerErrorCode(error);
    const message = safeProviderMessage(error);
    report('finalize', errorCode === 'cancelled' ? 'skipped' : 'failed', message);
    return {
      status: 'failed', analysis: { ...structuredClone(analysis), stages, calls }, rawSourceHash: analysis.rawSourceHash,
      evidence: analysis.evidence,
      findings: dedupeFindings([...analysis.findings, boundedFinding(`GENERATION_${String(errorCode ?? 'provider_failure').toUpperCase()}`, message)]),
      stages, provider: providerIdentity(provider), calls,
      ...(errorCode ? { errorCode } : {}),
    };
  }
}

export async function convertRawActorSourceWithAi(
  input: BrowserActorIntakeInput,
  provider: MonsterIntakeAiProvider,
  signal?: AbortSignal,
): Promise<BrowserActorIntakeResult> {
  let analysis = await analyzeBrowserActorSourceWithAi(input, provider, signal);
  if (analysis.status === 'needs_review' && analysis.ir && analysis.candidate) {
    analysis = await repairBrowserActorIntake(input, analysis, provider, signal);
  }
  if (analysis.status !== 'ready_to_generate') return legacyResultFromAnalysis(analysis);

  let generated = await generateAndReviewBrowserActorIntake(input, analysis, provider, signal);
  if (generated.status === 'needs_review' && generated.review?.verdict === 'revise' && analysis.repairCount === 0) {
    analysis = await repairBrowserActorIntake(input, generated, provider, signal);
    if (analysis.status === 'ready_to_generate') {
      generated = await generateAndReviewBrowserActorIntake(input, analysis, provider, signal);
    } else {
      return legacyResultFromAnalysis(analysis);
    }
  }
  return {
    status: generated.status,
    rawSourceHash: generated.rawSourceHash,
    finalSourceHash: generated.finalSourceHash,
    finalSource: generated.finalSource,
    markdown: generated.markdown,
    evidence: generated.evidence,
    response: generated.response,
    findings: generated.findings,
    stages: generated.stages,
    errorCode: generated.errorCode,
  };
}

function freshStages(): BrowserActorIntakeStageResult[] {
  return STAGE_ORDER.map((stage) => ({ stage, status: 'skipped' }));
}

function freshCalls(): BrowserActorIntakeCalls {
  return { discovery: 0, extraction: 0, review: 0, repair: 0 };
}

function providerIdentity(provider: MonsterIntakeAiProvider): BrowserActorIntakeProviderIdentity {
  const metadata = provider as MonsterIntakeAiProvider & Partial<Pick<BrowserActorIntakeProviderIdentity, 'protocol' | 'reasoning' | 'structuredOutput'>>;
  return {
    providerName: provider.providerName,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    ...(metadata.protocol ? { protocol: metadata.protocol } : {}),
    ...(metadata.reasoning ? { reasoning: metadata.reasoning } : {}),
    ...(metadata.structuredOutput ? { structuredOutput: metadata.structuredOutput } : {}),
    promptVersions: structuredClone(INTAKE_PROMPT_VERSIONS),
  };
}

function countProviderCalls(
  provider: MonsterIntakeAiProvider,
  calls: BrowserActorIntakeCalls,
): MonsterIntakeAiProvider {
  return {
    providerName: provider.providerName,
    extractionModel: provider.extractionModel,
    reviewModel: provider.reviewModel,
    ...(('protocol' in provider) ? { protocol: (provider as any).protocol } : {}),
    ...(('reasoning' in provider) ? { reasoning: (provider as any).reasoning } : {}),
    ...(('structuredOutput' in provider) ? { structuredOutput: (provider as any).structuredOutput } : {}),
    discover: (request) => {
      calls.discovery += 1;
      return provider.discover(request);
    },
    extract: (request) => {
      calls.extraction += 1;
      return provider.extract(request);
    },
    review: (request) => {
      calls.review += 1;
      return provider.review(request);
    },
    repair: (request) => {
      calls.repair += 1;
      return provider.repair(request);
    },
  };
}

function stageReporter(
  stages: BrowserActorIntakeStageResult[],
  onStage: BrowserActorIntakeInput['onStage'],
): (stage: BrowserActorIntakeStage, status: BrowserActorIntakeStageResult['status'], message?: string) => void {
  return (stage, status, message) => markStage(stages, onStage, stage, status, message);
}

function isGenerationResult(
  value: BrowserActorIntakeAnalysis | BrowserActorGenerationResult,
): value is BrowserActorGenerationResult {
  return 'analysis' in value;
}

function boundedFinding(code: string, message: string): IntakeFinding {
  return {
    id: `forge-browser:${code}`,
    code,
    path: '/intake',
    message,
    blocking: true,
    origin: 'semantic',
  };
}

function legacyResultFromAnalysis(analysis: BrowserActorIntakeAnalysis): BrowserActorIntakeResult {
  return {
    status: analysis.status === 'ready_to_generate' ? 'needs_review' : analysis.status,
    rawSourceHash: analysis.rawSourceHash,
    evidence: analysis.evidence,
    findings: analysis.findings,
    stages: analysis.stages,
    errorCode: analysis.errorCode,
  };
}

function dedupeFindings(findings: IntakeFinding[]): IntakeFinding[] {
  const unique = new Map<string, IntakeFinding>();
  for (const finding of findings) {
    unique.set(`${finding.origin}\u0000${finding.code}\u0000${finding.path}\u0000${finding.id}`, finding);
  }
  return [...unique.values()];
}

function adjudicateBrowserActorReview(
  source: string,
  ir: MonsterIntakeIR,
  actorProjection: unknown,
  deterministicFindings: IntakeFinding[],
  review: AiReviewResult,
): AiReviewResult {
  const findings = review.findings.filter((finding) => !(
    isDisprovedOptionalLegendaryPlaceholderFinding(source, ir, actorProjection, finding)
    || isDisprovedDerivedDamageBonusFinding(deterministicFindings, finding)
    || isDisprovedAbsentSenseZeroFinding(ir, actorProjection, deterministicFindings, finding)
    || isDisprovedCreatureTypeFinding(ir, actorProjection, finding)
  ));
  return {
    ...review,
    verdict: findings.some((finding) => finding.blocking) ? review.verdict : 'accepted',
    findings,
  };
}

function isDisprovedOptionalLegendaryPlaceholderFinding(
  source: string,
  ir: MonsterIntakeIR,
  actorProjection: unknown,
  finding: AiReviewResult['findings'][number],
): boolean {
  const findingText = normalizedFindingText(finding);
  if (!findingText.includes('legendary')) return false;
  if (ir.creature.legendary !== undefined) return false;
  if (ir.creature.legendaryActions.length > 0) return false;
  if (/(?:\blegendary\s+actions?\b|传奇动作)/iu.test(source)) return false;
  if (finding.code.toLocaleLowerCase('en-US') === 'optional-field-empty-placeholder'
    && /^\/(?:ir\/)?creature\/legendary$/iu.test(finding.path)) return true;
  if (!/(?:placeholder|zero|empty|legact|legres)/iu.test(findingText)) return false;
  const resources = record(record(actorProjection).system).resources;
  return ['legact', 'legres'].every((key) => {
    const resource = record(record(resources)[key]);
    return ['value', 'max', 'spent'].every((field) => resource[field] == null || Number(resource[field]) === 0);
  });
}

function isDisprovedDerivedDamageBonusFinding(
  deterministicFindings: IntakeFinding[],
  finding: AiReviewResult['findings'][number],
): boolean {
  const findingText = normalizedFindingText(finding);
  if (!/(?:lost[-_\s]?damage[-_\s]?bonus|damage\.base\.bonus)/iu.test(findingText)) return false;
  if (!/(?:empty|blank|missing|without)/iu.test(findingText)) return false;
  return !deterministicFindings.some((value) => value.blocking
    && /^(?:ACTOR_DAMAGE_FORMULA_DRIFT|ACTOR_DAMAGE_TYPE_DRIFT)$/u.test(value.code));
}

function isDisprovedAbsentSenseZeroFinding(
  ir: MonsterIntakeIR,
  actorProjection: unknown,
  deterministicFindings: IntakeFinding[],
  finding: AiReviewResult['findings'][number],
): boolean {
  const findingText = normalizedFindingText(finding);
  if (!/(?:absent[-_\s]?sense[-_\s]?zero|(?:blindsight|tremorsense|truesight).*(?:numeric\s+)?0)/iu.test(findingText)) return false;
  if (deterministicFindings.some((value) => value.blocking && value.code === 'ACTOR_SENSE_DRIFT')) return false;
  const senses = ir.creature.senses as Record<string, unknown>;
  const absent = ['blindsight', 'tremorsense', 'truesight'].filter((key) => senses[key] == null);
  if (absent.length === 0) return false;
  const actorSenses = record(record(record(actorProjection).system).attributes).senses;
  const ranges = record(actorSenses).ranges;
  const projectedRanges = Object.keys(record(ranges)).length > 0 ? record(ranges) : record(actorSenses);
  return absent.every((key) => Number(projectedRanges[key]) === 0);
}

function isDisprovedCreatureTypeFinding(
  ir: MonsterIntakeIR,
  actorProjection: unknown,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (!/(?:creature[-_\s]?type|details\.type)/iu.test(normalizedFindingText(finding))) return false;
  const details = record(record(actorProjection).system).details;
  const actual = String(record(record(details).type).value ?? '').trim().toLocaleLowerCase('en-US');
  const expected = ir.creature.identity.creatureType.trim().toLocaleLowerCase('en-US');
  return actual !== '' && actual === expected;
}

function normalizedFindingText(finding: AiReviewResult['findings'][number]): string {
  return `${finding.code} ${finding.path} ${finding.message}`.normalize('NFKC').toLocaleLowerCase('en-US');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  const inputCode = inputErrorCode(error);
  if (inputCode === 'input_empty') return 'Source text must not be empty.';
  if (inputCode === 'input_too_large') return 'Source text exceeds the 200000 UTF-8 byte limit.';
  if (isAbortError(error)) return 'AI intake was cancelled.';
  return 'AI intake failed before an accepted result.';
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

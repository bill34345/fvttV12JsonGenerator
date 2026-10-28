import type { HttpClient, HttpResponse } from './http';
import {FailureReplyBuffer, sanitizeFailureReply, type FailureReplyReason, type FailureEvidenceStatus,
  type TransportFailureDiagnostic, type TransportFailureEvidence} from './transport-failure-evidence';
export type {TransportFailureDiagnostic,TransportFailureEvidence} from './transport-failure-evidence';

/**
 * Protocols understood by the browser and Node Intake providers.  Keeping
 * these values transport-oriented prevents a provider preset from leaking its
 * response envelope into the Intake IR.
 */
export type IntakeTransportProtocol = 'openai-chat' | 'openai-responses' | 'anthropic-messages';
export type IntakeAuthScheme = 'bearer' | 'x-api-key' | 'api-key' | 'none';
export type IntakeStructuredOutputMode = 'json_schema' | 'json_object' | 'provider_schema' | 'prompt_fallback';
export type IntakeReasoning = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'adaptive';

export interface IntakeStructuredOutput {
  mode: IntakeStructuredOutputMode;
  name?: string;
  schema?: Record<string, unknown>;
}

export interface IntakeTransportOptions {
  protocol?: IntakeTransportProtocol;
  authScheme?: IntakeAuthScheme;
  endpointPath?: string;
  anthropicVersion?: string;
  reasoning?: IntakeReasoning;
  structuredOutput?: IntakeStructuredOutput;
  maxTokens?: number;
  /** OpenAI Responses streaming is opt-in; callers must explicitly request it. */
  stream?: boolean;
  /** Safe semantic activity only; raw provider events and reasoning are never exposed. */
  onActivity?: (activity: IntakeProviderActivity) => void;
  /** Private, opt-in persistence. Runs for transport failures before they reach callers. */
  onFailureEvidence?: (evidence: TransportFailureEvidence) => boolean | void | Promise<boolean | void>;
}

export type IntakeProviderActivityPhase =
  | 'sending'
  | 'awaiting_headers'
  | 'receiving_response'
  | 'streaming_reasoning'
  | 'streaming_output'
  | 'validating'
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'stopped';

export type IntakeProviderTransportState = 'pending' | 'body_open' | 'stream_open' | 'closed' | 'browser_error';
export type IntakeProviderActivityState = 'unknown' | 'reported_in_progress' | 'reported_reasoning' | 'reported_output' | 'completed' | 'failed';

export type IntakeRequestFailureReason = FailureReplyReason;

/** Counts and timestamps only: no body, endpoint, credentials or reasoning text. */
export interface IntakeRequestObservation {
  responseHeadersAtMs?: number;
  firstDataAtMs?: number;
  lastDataAtMs?: number;
  bodyCompletedAtMs?: number;
  receivedBytes?: number;
  keepAliveCount?: number;
  failureReason?: IntakeRequestFailureReason;
  failureEvidenceStatus?: FailureEvidenceStatus;
}

export interface IntakeProviderActivity extends IntakeRequestObservation {
  phase: IntakeProviderActivityPhase;
  transport: IntakeProviderTransportState;
  providerActivity: IntakeProviderActivityState;
  elapsedMs: number;
  /** Absolute browser timestamp of the last semantic event. */
  lastEventAtMs: number;
  lastEventType?: string;
  outputCharactersReceived: number;
}

export type IntakeRequestWaitDecision = 'continue' | 'stop';
export type IntakeRequestWaitPhase = 'awaiting_response_headers' | 'reading_response_body';

/**
 * Browser-observable request state. This deliberately does not claim that the
 * remote model is still thinking or that a low-level TCP connection is alive;
 * browsers do not expose either fact to application code.
 */
export interface IntakeRequestWaitStatus extends IntakeRequestObservation {
  phase: IntakeRequestWaitPhase;
  elapsedMs: number;
  completedCycles: number;
  decisionRound: number;
  responseHeadersReceived: boolean;
  httpStatus?: number;
  lastObservableProgressAtMs: number;
  requestPending: true;
  browserReportedConnectionError: false;
  aiActivity: IntakeProviderActivityState;
  transport?: IntakeProviderTransportState;
  providerActivity?: IntakeProviderActivityState;
  activityPhase?: IntakeProviderActivityPhase;
  lastEventAtMs?: number;
  lastEventType?: string;
  outputCharactersReceived?: number;
  /** Aborts when the original request succeeds or fails while a decision UI is open. */
  requestSettledSignal: AbortSignal;
}

export interface IntakeRequestWaitPolicy {
  cycleMs: number;
  cyclesBeforeDecision: number;
  onDecision(status: IntakeRequestWaitStatus): Promise<IntakeRequestWaitDecision>;
}

/** Forge may wait on the same request until completion or explicit cancellation. */
export function createContinuousIntakeWaitPolicy(): IntakeRequestWaitPolicy {
  return { cycleMs: 180_000, cyclesBeforeDecision: 4, onDecision: async () => 'continue' };
}

export interface IntakeTransportRequest extends IntakeTransportOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  httpClient?: HttpClient;
  signal?: AbortSignal;
  /** Actor reception owns its JSON/text format handling; request output hints stay unchanged. */
  deferContentParsing?: boolean;
  /** Opt-in interactive waiting. Omitted callers retain their existing timeout policy. */
  waitPolicy?: IntakeRequestWaitPolicy;
}

export interface NormalizedIntakeProviderResult {
  protocol: IntakeTransportProtocol;
  model: string;
  content: string;
  responseId?: string;
}

export type IntakeTransportErrorCode =
  | 'configuration'
  | 'timeout'
  | 'rate_limited'
  | 'http_error'
  | 'network'
  | 'invalid_response';

/** A safe error: it deliberately never stores a URL, request body, or key. */
export class IntakeTransportError extends Error {
  readonly code: IntakeTransportErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  failure?: TransportFailureDiagnostic;

  constructor(
    code: IntakeTransportErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = 'IntakeTransportError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

const DEFAULT_STRUCTURED_OUTPUT: IntakeStructuredOutput = { mode: 'json_object' };

interface ObservedProviderState extends IntakeRequestObservation {
  capture?: FailureReplyBuffer;
  captureUnavailable?:boolean;
  providerCode?: string;
  providerType?: string;
  bodyReadFailure?:TransportFailureDiagnostic['bodyReadFailure'];
  phase: IntakeRequestWaitPhase;
  activityPhase: IntakeProviderActivityPhase;
  responseHeadersReceived: boolean;
  httpStatus?: number;
  lastObservableProgressAtMs: number;
  lastEventAtMs: number;
  lastEventType?: string;
  transport: IntakeProviderTransportState;
  providerActivity: IntakeProviderActivityState;
  outputCharactersReceived: number;
}

/**
 * Execute one provider request and return the same minimal result for every
 * supported envelope.  Monster and Item validators remain responsible for
 * interpreting `content`; this layer only handles protocol framing.
 */
export async function requestIntakeProvider(
  request: IntakeTransportRequest,
): Promise<NormalizedIntakeProviderResult> {
  if (request.waitPolicy) assertWaitPolicy(request.waitPolicy);
  const startedAt = Date.now();
  const observed: ObservedProviderState = {
    phase: 'awaiting_response_headers' as IntakeRequestWaitPhase,
    activityPhase: 'sending',
    responseHeadersReceived: false,
    lastObservableProgressAtMs: startedAt,
    lastEventAtMs: startedAt,
    transport: 'pending',
    providerActivity: 'unknown',
    outputCharactersReceived: 0,
    receivedBytes: 0,
    keepAliveCount: 0,
    ...(request.onFailureEvidence ? {capture:new FailureReplyBuffer()} : {}),
  };
  emitActivity(request, observed, startedAt, 'sending');
  const interactiveAbort = request.waitPolicy
    ? createInteractiveAbort(request.signal)
    : undefined;
  const operation = executeIntakeProviderRequest(
    interactiveAbort ? { ...request, signal: interactiveAbort.signal } : request,
    observed,
    startedAt,
  );
  if (interactiveAbort) void operation.then(interactiveAbort.dispose, interactiveAbort.dispose);
  try {
    return await (request.waitPolicy
      ? waitForHumanDecision(operation, request, request.waitPolicy, observed, startedAt, interactiveAbort?.abort)
      : operation);
  } catch(error) {
    const snapshot=observed.capture?.snapshot();
    const diagnostic:TransportFailureDiagnostic={version:1,reason:observed.failureReason??(observed.responseHeadersReceived?'unexpected_response':'connection_failed'),phase:observed.phase,
      elapsedMs:Math.max(0,Date.now()-startedAt),responseHeadersAtMs:observed.responseHeadersAtMs,
      firstDataAtMs:observed.firstDataAtMs,lastDataAtMs:observed.lastDataAtMs,bodyCompletedAtMs:observed.bodyCompletedAtMs,
      ...(observed.httpStatus===undefined?{}:{httpStatus:observed.httpStatus}),receivedBytes:observed.receivedBytes??0,
      capturedBytes:snapshot?.capturedBytes??0,bodyComplete:observed.bodyCompletedAtMs!==undefined,
      captureTruncated:snapshot?.truncated??false,representation:observed.responseHeadersReceived&&!observed.captureUnavailable?(snapshot?.representation??'unavailable'):'unavailable',
      hashScope:!snapshot||!observed.responseHeadersReceived||observed.captureUnavailable?'unavailable':snapshot.representation==='reconstructed-json'?'reconstructed-json-bytes':
        snapshot.truncated?'captured-head-and-tail-bytes':observed.bodyCompletedAtMs===undefined?'received-prefix-bytes':'complete-response-bytes',
      ...(observed.providerCode?{providerCode:observed.providerCode}:{}),...(observed.providerType?{providerType:observed.providerType}:{}),
      ...(observed.bodyReadFailure?{bodyReadFailure:observed.bodyReadFailure}:{}),
      evidenceStatus:'not_configured'};
    if(request.onFailureEvidence){
      const raw=snapshot?.content??'',content=sanitizeFailureReply(raw,[request.apiKey,request.baseUrl]);
      const {evidenceStatus,...details}=diagnostic;
      try { diagnostic.evidenceStatus=await request.onFailureEvidence({diagnostic:details,content,capturedBodyHash:snapshot?.hash??'',redacted:content!==raw})===false?'save_failed':
        observed.responseHeadersReceived&&observed.captureUnavailable?'metadata_only':'saved'; }
      catch { diagnostic.evidenceStatus='save_failed'; }
    }
    observed.failureEvidenceStatus=diagnostic.evidenceStatus;
    if(error instanceof IntakeTransportError)error.failure=Object.freeze({...diagnostic});
    emitActivity(request,observed,startedAt,observed.lastEventType);
    throw error;
  }
}

async function executeIntakeProviderRequest(
  request: IntakeTransportRequest,
  observed: ObservedProviderState,
  startedAt: number,
): Promise<NormalizedIntakeProviderResult> {
  const protocol = request.protocol ?? 'openai-chat';
  const authScheme = request.authScheme ?? (protocol === 'anthropic-messages' ? 'x-api-key' : 'bearer');
  const url = buildEndpointUrl(request.baseUrl, request.endpointPath ?? defaultEndpointPath(protocol));
  const httpClient = request.httpClient ?? defaultHttpClient;
  const body = buildRequestBody(request, protocol);
  const headers = buildHeaders(request.apiKey, authScheme, protocol, request.anthropicVersion);
  if (request.stream && protocol === 'openai-responses') headers.Accept = 'text/event-stream';

  let response: Awaited<ReturnType<HttpClient>>;
  try {
    if (request.signal?.aborted) throw request.signal.reason;
    response = await withRequestAbort(httpClient(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    }), request.signal);
    observed.phase = 'reading_response_body';
    observed.responseHeadersReceived = true;
    observed.httpStatus = response.status;
    observed.responseHeadersAtMs = Date.now();
    observed.lastObservableProgressAtMs = Date.now();
    observed.transport = request.stream && protocol === 'openai-responses' ? 'stream_open' : 'body_open';
    observed.activityPhase = 'receiving_response';
    emitActivity(request, observed, startedAt, 'response.headers');
  } catch (error) {
    observed.transport = 'browser_error';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    const aborted = recordRequestAbort(error, request, observed, startedAt);
    if (aborted) throw aborted;
    observed.failureReason = 'connection_failed';
    if (error instanceof IntakeTransportError) {
      emitActivity(request, observed, startedAt, 'browser.error');
      throw error;
    }
    // Browser adapters use the existing MonsterIntakeProviderError to mark a
    // caller cancellation as non-retryable. Preserve that safe error shape so
    // the shared transport does not accidentally start a second request.
    if (error && typeof error === 'object' && 'code' in error && 'retryable' in error) {
      emitActivity(request, observed, startedAt, 'browser.error');
      throw error;
    }
    emitActivity(request, observed, startedAt, 'browser.error');
    throw new IntakeTransportError('network', 'AI provider network request failed.', { retryable: true });
  }

  if (!response.ok) {
    // Error bodies are evidence too: consume them once through the same observer.
    try { const value=await readObservedJson(response,request,observed,startedAt);recordProviderError(value,request,observed); }
    catch(error){const aborted=recordRequestAbort(error,request,observed,startedAt);if(aborted)throw aborted;
      observed.bodyReadFailure=['invalid_json','invalid_encoding','empty_response'].includes(observed.failureReason??'')
        ?observed.failureReason as TransportFailureDiagnostic['bodyReadFailure']:'interrupted';}
    observed.failureReason = 'http_error';
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError(response.status===429?'rate_limited':'http_error',response.status===429?'AI provider rate limited the request.':`AI provider HTTP ${response.status}.`, {
      retryable: response.status === 429 || response.status >= 500,
      status: response.status,
    });
  }

  if (request.stream && protocol === 'openai-responses') {
    try {
      return await readOpenAiResponsesStream(response, request, observed, startedAt);
    } catch (error) {
      if (error instanceof IntakeTransportError) {
        if (!['failed', 'incomplete', 'stopped'].includes(observed.activityPhase)) {
          observed.transport = 'closed';
          observed.activityPhase = 'failed';
          observed.providerActivity = 'failed';
          emitActivity(request, observed, startedAt, 'response.failed');
        }
        throw error;
      }
      const aborted = recordRequestAbort(error, request, observed, startedAt);
      if (aborted) throw aborted;
      observed.failureReason = 'response_interrupted';
      observed.transport = 'browser_error';
      observed.activityPhase = 'failed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, 'browser.error');
      throw new IntakeTransportError('network', 'AI provider stream could not be read.', { retryable: true });
    }
  }

  let envelope: unknown;
  try {
    envelope = await readObservedJson(response, request, observed, startedAt);
  } catch (error) {
    const aborted = recordRequestAbort(error, request, observed, startedAt);
    if (aborted) throw aborted;
    if (error && typeof error === 'object' && 'code' in error && 'retryable' in error) {
      observed.transport = 'closed';
      observed.activityPhase = 'failed';
      observed.providerActivity = 'failed';
      observed.failureReason ??= error.code === 'invalid_response' ? 'invalid_json' : 'response_interrupted';
      emitActivity(request, observed, startedAt, 'response.failed');
      throw error;
    }
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    observed.failureReason ??= error instanceof SyntaxError ? 'invalid_json' : 'response_interrupted';
    emitActivity(request, observed, startedAt, 'response.failed');
    if (observed.failureReason === 'response_interrupted') {
      throw new IntakeTransportError('network', 'AI provider response was interrupted before completion.', { retryable: true });
    }
    throw new IntakeTransportError('invalid_response', observed.failureReason==='invalid_encoding'?'AI provider returned unreadable response encoding.':'AI provider returned invalid or incomplete JSON.', { retryable: true });
  }
  if(recordProviderError(envelope,request,observed)){
    observed.failureReason='provider_error';observed.transport='closed';observed.activityPhase='failed';observed.providerActivity='failed';
    emitActivity(request,observed,startedAt,'response.failed');
    throw new IntakeTransportError('invalid_response','AI provider returned a service error instead of an answer.',{retryable:false,status:response.status});
  }
  const envelopeRecord = asRecord(envelope);
  const finishReason = asRecord(Array.isArray(envelopeRecord?.choices) ? envelopeRecord.choices[0] : undefined)?.finish_reason;
  if ((protocol === 'openai-chat' && typeof finishReason === 'string' && finishReason !== 'stop')
    || envelopeRecord?.status === 'incomplete'
    || (protocol === 'anthropic-messages' && envelopeRecord?.stop_reason === 'max_tokens')) {
    observed.transport = 'closed';
    observed.activityPhase = 'incomplete';
    observed.providerActivity = 'failed';
    observed.failureReason = 'provider_incomplete';
    emitActivity(request, observed, startedAt, 'response.incomplete');
    throw new IntakeTransportError('invalid_response', 'AI provider reported an unfinished response.', { retryable: true });
  }
  const content = extractProviderContent(protocol, envelope);
  if (!content) {
    observed.failureReason = hasAnswerSlot(protocol,envelope)?'empty_response':'unexpected_response';
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider returned no usable content.', { retryable: true });
  }
  const record = asRecord(envelope);
  observed.transport = 'closed';
  observed.activityPhase = 'completed';
  observed.providerActivity = 'completed';
  observed.outputCharactersReceived = content.length;
  emitActivity(request, observed, startedAt, 'response.completed');
  return {
    protocol,
    model: request.model,
    content,
    ...(typeof record?.id === 'string' ? { responseId: record.id } : {}),
  };
}

async function waitForHumanDecision<T>(
  operation: Promise<T>,
  request: IntakeTransportRequest,
  policy: IntakeRequestWaitPolicy,
  observed: ObservedProviderState,
  startedAt: number,
  stopRequest?: () => void,
): Promise<T> {
  const settled = operation.then(
    (value) => ({ kind: 'value' as const, value }),
    (error: unknown) => ({ kind: 'error' as const, error }),
  );
  const requestSettled = new AbortController();
  void settled.then(() => requestSettled.abort());
  let completedCycles = 0;
  let decisionRound = 0;
  while (true) {
    const outcome = await raceWithWaitCycle(settled, policy.cycleMs);
    if (outcome.kind === 'value') return outcome.value;
    if (outcome.kind === 'error') throw outcome.error;

    completedCycles += 1;
    if (completedCycles % policy.cyclesBeforeDecision !== 0) continue;
    decisionRound += 1;
    const decisionOrResult = await Promise.race([settled, policy.onDecision({
      phase: observed.phase,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      completedCycles,
      decisionRound,
      responseHeadersReceived: observed.responseHeadersReceived,
      ...(observed.httpStatus === undefined ? {} : { httpStatus: observed.httpStatus }),
      lastObservableProgressAtMs: observed.lastObservableProgressAtMs,
      requestPending: true,
      browserReportedConnectionError: false,
      aiActivity: observed.providerActivity,
      transport: observed.transport,
      providerActivity: observed.providerActivity,
      activityPhase: observed.activityPhase,
      lastEventAtMs: observed.lastEventAtMs,
      ...(observed.lastEventType ? { lastEventType: observed.lastEventType } : {}),
      outputCharactersReceived: observed.outputCharactersReceived,
      ...requestObservation(observed),
      requestSettledSignal: requestSettled.signal,
    }).then(decision => ({ kind: 'decision' as const, decision }))]);
    if (decisionOrResult.kind === 'value') return decisionOrResult.value;
    if (decisionOrResult.kind === 'error') throw decisionOrResult.error;
    if (decisionOrResult.decision === 'stop') {
      stopRequest?.();
      observed.activityPhase = 'stopped';
      observed.transport = 'closed';
      observed.failureReason = 'user_cancelled';
      emitActivity(request, observed, startedAt, 'stopped');
      throw new IntakeTransportError('network', 'AI provider request was stopped by the user.', { retryable: false });
    }
  }
}

function emitActivity(
  request: IntakeTransportRequest,
  observed: ObservedProviderState,
  startedAt: number,
  eventType?: string,
): void {
  const now = Date.now();
  observed.lastObservableProgressAtMs = now;
  observed.lastEventAtMs = now;
  if (eventType) observed.lastEventType = safeEventType(eventType);
  const activity: IntakeProviderActivity = {
    phase: observed.activityPhase,
    transport: observed.transport,
    providerActivity: observed.providerActivity,
    elapsedMs: Math.max(0, now - startedAt),
    lastEventAtMs: now,
    ...(observed.lastEventType ? { lastEventType: observed.lastEventType } : {}),
    outputCharactersReceived: observed.outputCharactersReceived,
    ...requestObservation(observed),
  };
  try { request.onActivity?.(activity); } catch { /* UI observers must not break the provider request. */ }
}

function requestObservation(observed: ObservedProviderState): IntakeRequestObservation {
  return {
    responseHeadersAtMs: observed.responseHeadersAtMs,
    firstDataAtMs: observed.firstDataAtMs,
    lastDataAtMs: observed.lastDataAtMs,
    bodyCompletedAtMs: observed.bodyCompletedAtMs,
    receivedBytes: observed.receivedBytes,
    keepAliveCount: observed.keepAliveCount,
    failureReason: observed.failureReason,
    failureEvidenceStatus: observed.failureEvidenceStatus,
  };
}

function recordProviderError(value:unknown,request:IntakeTransportRequest,observed:ObservedProviderState):boolean {
  const record=asRecord(value),error=record?.error??asRecord(record?.response)?.error;
  if(!error||(typeof error!=='object'&&typeof error!=='string'))return false;
  const details=asRecord(error);
  const hint=(value:unknown):string|undefined=>{
    if(typeof value!=='string'&&typeof value!=='number')return undefined;
    const safe=sanitizeFailureReply(String(value),[request.apiKey,request.baseUrl]);
    return /^[A-Za-z0-9_.:-]{1,80}$/u.test(safe)?safe:undefined;
  };
  observed.providerCode=hint(details?.code);observed.providerType=hint(details?.type);
  return true;
}
function hasAnswerSlot(protocol:IntakeTransportProtocol,value:unknown):boolean {
  const record=asRecord(value);if(!record)return false;
  if(protocol==='openai-responses')return typeof record.output_text==='string'||Array.isArray(record.output);
  if(protocol==='anthropic-messages')return Array.isArray(record.content);
  const message=asRecord(asRecord(Array.isArray(record.choices)?record.choices[0]:undefined)?.message);
  return !!message&&(message.content===null||typeof message.content==='string'||Array.isArray(message.content));
}

async function readObservedJson(
  response: HttpResponse, request: IntakeTransportRequest,
  observed: ObservedProviderState, startedAt: number,
): Promise<unknown> {
  // Structural test/legacy adapters without a body retain their JSON contract.
  if (!response.body) {
    observed.captureUnavailable=true;
    const result = await withRequestAbort(response.json(), request.signal);
    if(observed.capture){observed.capture.reconstructed=true;observed.capture.append(JSON.stringify(result)??'');observed.captureUnavailable=false;}
    observed.bodyCompletedAtMs = Date.now();
    return result;
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let jsonStarted = false;
  for await (const chunk of responseChunks(response.body, request.signal)) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    observed.capture?.append(bytes);
    if (bytes.byteLength === 0) continue;
    const now = Date.now();
    observed.firstDataAtMs ??= now;
    observed.lastDataAtMs = now;
    observed.receivedBytes = (observed.receivedBytes ?? 0) + bytes.byteLength;
    let text: string;
    try { text = decoder.decode(bytes, { stream: true }); }
    catch { observed.failureReason = 'invalid_encoding'; throw new SyntaxError('Invalid response encoding.'); }
    parts.push(text);
    // Only whitespace bytes count as a connection hint; they say nothing about inference.
    const keepAlive = !jsonStarted && bytes.every(byte => byte === 32 || byte === 9 || byte === 10 || byte === 13);
    if (!keepAlive) jsonStarted = true;
    if (keepAlive) observed.keepAliveCount = (observed.keepAliveCount ?? 0) + 1;
    emitActivity(request, observed, startedAt, keepAlive ? 'response.keep_alive' : 'response.body.data');
  }
  observed.bodyCompletedAtMs = Date.now();
  observed.activityPhase = 'validating';
  emitActivity(request, observed, startedAt, 'response.body.completed');
  const raw=parts.join('');
  if(!raw.trim()){observed.failureReason='empty_response';throw new IntakeTransportError('invalid_response','AI provider returned an empty response.',{retryable:true});}
  let tail:string;try{tail=decoder.decode();}catch{observed.failureReason='invalid_encoding';throw new SyntaxError('Invalid response encoding.');}
  try { return JSON.parse(raw + tail); }
  catch { observed.failureReason = 'invalid_json'; throw new SyntaxError('Invalid response JSON.'); }
}

function recordRequestAbort(
  error: unknown, request: IntakeTransportRequest,
  observed: ObservedProviderState, startedAt: number,
): IntakeTransportError | undefined {
  const reason = request.signal?.aborted ? request.signal.reason : error;
  const safeError = error instanceof Error && 'code' in error && 'retryable' in error ? error : undefined;
  const timeout = (reason instanceof Error && reason.name === 'TimeoutError') || safeError?.code === 'timeout';
  const callerCancelled = safeError?.code === 'network' && safeError.retryable === false && /cancelled|stopped/u.test(safeError.message);
  if (!request.signal?.aborted && !timeout && !callerCancelled && !isAbortError(error)) return undefined;
  const cancelled = (request.signal?.aborted && !timeout) || callerCancelled;
  observed.failureReason = cancelled ? 'user_cancelled' : 'deadline_exceeded';
  observed.activityPhase = cancelled ? 'stopped' : 'failed';
  observed.transport = 'closed';
  observed.providerActivity = 'failed';
  emitActivity(request, observed, startedAt, cancelled ? 'stopped' : 'response.failed');
  return new IntakeTransportError(cancelled ? 'network' : 'timeout', cancelled
    ? 'AI provider request was cancelled by the caller.'
    : 'AI provider request exceeded its configured deadline.', { retryable: !cancelled });
}

function withRequestAbort<T>(operation: Promise<T>, signal?: AbortSignal, cancel?: () => void): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { try { cancel?.(); } catch { /* original cancellation remains authoritative */ } reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function readOpenAiResponsesStream(
  response: HttpResponse,
  request: IntakeTransportRequest,
  observed: ObservedProviderState,
  startedAt: number,
): Promise<NormalizedIntakeProviderResult> {
  const body = response.body;
  if (!body) {
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider returned no response stream.', { retryable: true });
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let outputText = '';
  let terminal: 'completed' | 'incomplete' | 'failed' | undefined;
  let terminalResponse: unknown;
  let responseId: string | undefined;
  let previousSequence = -1;

  const processBlock = (block: string): void => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    let record: Record<string, any>;
    try {
      const value = JSON.parse(parsed.data) as unknown;
      record = asRecord(value) ?? (() => { throw new IntakeTransportError('invalid_response', 'AI provider returned an invalid stream event.', { retryable: true }); })();
    } catch (error) {
      if (error instanceof IntakeTransportError) throw error;
      throw new IntakeTransportError('invalid_response', 'AI provider returned an invalid stream event.', { retryable: true });
    }
    const eventType = typeof record.type === 'string' ? record.type : parsed.event;
    if (!eventType) return;
    if (terminal) {
      throw new IntakeTransportError('invalid_response', 'AI provider stream emitted data after its terminal event.', { retryable: true });
    }
    if (SEQUENCED_RESPONSES_EVENTS.has(eventType) && typeof record.sequence_number !== 'number') {
      throw new IntakeTransportError('invalid_response', 'AI provider stream event is missing sequence_number.', { retryable: true });
    }
    if (typeof record.sequence_number === 'number') {
      if (!Number.isInteger(record.sequence_number) || record.sequence_number < 0 || record.sequence_number <= previousSequence) {
        throw new IntakeTransportError('invalid_response', 'AI provider stream events arrived out of order.', { retryable: true });
      }
      previousSequence = record.sequence_number;
    }
    const safeType = safeEventType(eventType);
    if (eventType === 'response.created' || eventType === 'response.in_progress') {
      observed.activityPhase = 'receiving_response';
      observed.providerActivity = 'reported_in_progress';
      emitActivity(request, observed, startedAt, safeType);
      const id = asRecord(record.response)?.id ?? record.id;
      if (typeof id === 'string') responseId = id;
      return;
    }
    if (eventType === 'response.reasoning_text.delta') {
      observed.activityPhase = 'streaming_reasoning';
      observed.providerActivity = 'reported_reasoning';
      emitActivity(request, observed, startedAt, safeType);
      return;
    }
    if (eventType === 'response.output_text.delta') {
      if (typeof record.delta !== 'string') throw new IntakeTransportError('invalid_response', 'AI provider returned an invalid output delta.', { retryable: true });
      outputText += record.delta;
      observed.outputCharactersReceived = outputText.length;
      observed.activityPhase = 'streaming_output';
      observed.providerActivity = 'reported_output';
      emitActivity(request, observed, startedAt, safeType);
      return;
    }
    if (eventType.includes('reasoning') && eventType.includes('item')) {
      observed.activityPhase = 'streaming_reasoning';
      observed.providerActivity = 'reported_reasoning';
      emitActivity(request, observed, startedAt, safeType);
      return;
    }
    if (eventType.includes('output') || eventType.includes('content')) {
      observed.activityPhase = 'streaming_output';
      observed.providerActivity = 'reported_output';
      emitActivity(request, observed, startedAt, safeType);
      return;
    }
    if (eventType === 'response.completed') {
      terminal = 'completed';
      terminalResponse = record.response ?? record;
      const id = asRecord(terminalResponse)?.id ?? record.id;
      if (typeof id === 'string') responseId = id;
      observed.activityPhase = 'validating';
      observed.providerActivity = 'reported_output';
      emitActivity(request, observed, startedAt, safeType);
      return;
    }
    if (eventType === 'response.incomplete') {
      observed.failureReason='provider_incomplete';
      terminal = 'incomplete';
      observed.activityPhase = 'incomplete';
      observed.transport = 'closed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, safeType);
      throw new IntakeTransportError('invalid_response', 'AI provider returned an incomplete response.', { retryable: true });
    }
    if (eventType === 'response.failed') {
      recordProviderError(record,request,observed);observed.failureReason='provider_error';
      terminal = 'failed';
      observed.activityPhase = 'failed';
      observed.transport = 'closed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, safeType);
      throw new IntakeTransportError('invalid_response', 'AI provider returned a failed response.', { retryable: true });
    }
    // Unknown non-terminal events are deliberately ignored, but their safe
    // type is still available as activity evidence.
    emitActivity(request, observed, startedAt, safeType);
  };

  for await (const chunk of responseChunks(body, request.signal)) {
    observed.capture?.append(chunk);
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    if (bytes.byteLength) {
      observed.firstDataAtMs ??= Date.now();
      observed.lastDataAtMs = Date.now();
      observed.receivedBytes = (observed.receivedBytes ?? 0) + bytes.byteLength;
      emitActivity(request, observed, startedAt, 'response.body.data');
    }
    const value = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    buffer += value;
    const blocks = buffer.split(/\r?\n\r?\n/u);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) processBlock(block);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);
  observed.bodyCompletedAtMs = Date.now();

  if (terminal !== 'completed' || !terminalResponse) {
    observed.failureReason=(observed.receivedBytes??0)>0?'provider_incomplete':'empty_response';
    observed.transport = 'closed';
    observed.activityPhase = terminal === 'incomplete' ? 'incomplete' : 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, terminal === 'incomplete' ? 'response.incomplete' : 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider stream ended without a completed response.', { retryable: true });
  }
  // The terminal response is authoritative. Deltas are progress evidence only;
  // a completed event without a verifiable final envelope fails closed.
  const content = extractProviderContent('openai-responses', terminalResponse);
  if (!content) {
    observed.failureReason=hasAnswerSlot('openai-responses',terminalResponse)?'empty_response':'unexpected_response';
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider completed without usable content.', { retryable: true });
  }
  if (!request.deferContentParsing && request.structuredOutput?.mode !== 'prompt_fallback') {
    try { JSON.parse(content); } catch {
      observed.failureReason='invalid_json';
      observed.transport = 'closed';
      observed.activityPhase = 'failed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, 'response.failed');
      throw new IntakeTransportError('invalid_response', 'AI provider completed with invalid structured JSON.', { retryable: true });
    }
  }
  observed.transport = 'closed';
  observed.activityPhase = 'completed';
  observed.providerActivity = 'completed';
  emitActivity(request, observed, startedAt, 'response.completed');
  return {
    protocol: 'openai-responses',
    model: request.model,
    content,
    ...(responseId ? { responseId } : {}),
  };
}

function parseSseBlock(block: string): { event?: string; data: string } | undefined {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/u)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /u, ''));
  }
  if (data.length === 0) return undefined;
  if (data.join('\n') === '[DONE]') throw new IntakeTransportError('invalid_response', 'AI provider returned an invalid stream terminator.', { retryable: true });
  return { ...(event ? { event } : {}), data: data.join('\n') };
}

async function* responseChunks(body: NonNullable<HttpResponse['body']>, signal?: AbortSignal): AsyncGenerator<Uint8Array | string> {
  if (typeof (body as any).getReader === 'function') {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    let completed=false;
    try {
      while (true) {
        const next = await withRequestAbort(reader.read(), signal, () => { void reader.cancel().catch(() => undefined); });
        if (next.done) {completed=true;break;}
        if (next.value !== undefined) yield next.value;
      }
    } finally {
      if(!completed)try{await reader.cancel();}catch{/* Preserve the original read/parse failure. */}
      reader.releaseLock();
    }
    return;
  }
  if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
    const iterator = (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await withRequestAbort(iterator.next(), signal);
        if (next.done) break;
        yield next.value;
      }
    } finally { if (signal?.aborted) void iterator.return?.().catch(() => undefined); }
    return;
  }
  throw new IntakeTransportError('invalid_response', 'AI provider returned an unreadable response stream.', { retryable: true });
}

function safeEventType(eventType: string): string {
  const known = new Set([
    'sending', 'response.headers', 'response.keep_alive', 'response.body.data',
    'response.body.completed', 'stopped', 'browser.error',
    'response.created',
    'response.in_progress',
    'response.output_item.added',
    'response.content_part.added',
    'response.reasoning_item.added',
    'response.reasoning_text.delta',
    'response.output_text.delta',
    'response.completed',
    'response.incomplete',
    'response.failed',
  ]);
  return known.has(eventType) ? eventType : 'unknown';
}

const SEQUENCED_RESPONSES_EVENTS = new Set([
  'response.created',
  'response.in_progress',
  'response.output_item.added',
  'response.content_part.added',
  'response.reasoning_item.added',
  'response.reasoning_text.delta',
  'response.output_text.delta',
  'response.completed',
  'response.incomplete',
  'response.failed',
]);

function createInteractiveAbort(sourceSignal?: AbortSignal): {
  signal: AbortSignal;
  abort(): void;
  dispose(): void;
} {
  const controller = new AbortController();
  if (!sourceSignal) {
    return { signal: controller.signal, abort: () => controller.abort(), dispose: () => undefined };
  }
  const combined = new AbortController();
  const abortFromSource = () => combined.abort(sourceSignal.reason);
  const abortFromInteractive = () => combined.abort(controller.signal.reason);
  if (sourceSignal.aborted) abortFromSource();
  else sourceSignal.addEventListener('abort', abortFromSource, { once: true });
  controller.signal.addEventListener('abort', abortFromInteractive, { once: true });
  return {
    signal: combined.signal,
    abort: () => controller.abort(),
    dispose: () => {
      sourceSignal.removeEventListener('abort', abortFromSource);
      controller.signal.removeEventListener('abort', abortFromInteractive);
    },
  };
}

function assertWaitPolicy(policy: IntakeRequestWaitPolicy): void {
  if (!Number.isFinite(policy.cycleMs) || policy.cycleMs <= 0) {
    throw new IntakeTransportError('configuration', 'AI request wait cycle must be a positive duration.');
  }
  if (!Number.isInteger(policy.cyclesBeforeDecision) || policy.cyclesBeforeDecision <= 0) {
    throw new IntakeTransportError('configuration', 'AI request wait cycle count must be a positive integer.');
  }
}

async function raceWithWaitCycle<T>(
  settled: Promise<{ kind: 'value'; value: T } | { kind: 'error'; error: unknown }>,
  cycleMs: number,
): Promise<{ kind: 'value'; value: T } | { kind: 'error'; error: unknown } | { kind: 'cycle' }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      settled,
      new Promise<{ kind: 'cycle' }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: 'cycle' }), cycleMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function buildEndpointUrl(baseUrl: string, endpointPath: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new IntakeTransportError('configuration', 'AI provider base URL is invalid.');
  }
  if (base.username || base.password) {
    throw new IntakeTransportError('configuration', 'AI provider base URL must not contain URL credentials.');
  }
  const basePath = base.pathname.replace(/\/+$/u, '');
  const path = endpointPath.replace(/^\/+|\/+$/gu, '');
  const joinedPath = path === ''
    ? (basePath || '/')
    : basePath && (path === basePath.replace(/^\//u, '') || path.startsWith(`${basePath.replace(/^\//u, '')}/`))
      ? `/${path}`
      : `${basePath}/${path}`;
  base.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`;
  base.search = '';
  base.hash = '';
  return base.toString().replace(/\/$/u, '');
}

export function defaultEndpointPath(protocol: IntakeTransportProtocol): string {
  if (protocol === 'openai-responses') return 'responses';
  if (protocol === 'anthropic-messages') return 'v1/messages';
  return 'chat/completions';
}

export function buildRequestBody(
  request: IntakeTransportRequest,
  protocol: IntakeTransportProtocol = request.protocol ?? 'openai-chat',
): Record<string, unknown> {
  const structured = request.structuredOutput ?? DEFAULT_STRUCTURED_OUTPUT;
  const prompt = request.userContent;
  if (protocol === 'anthropic-messages') {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 16_384,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    };
    const thinking = anthropicThinking(request.reasoning);
    if (thinking) body.thinking = thinking;
    return body;
  }

  if (protocol === 'openai-responses') {
    const body: Record<string, unknown> = {
      model: request.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: request.systemPrompt }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] },
      ],
    };
    if (request.stream === true) body.stream = true;
    const format = openAiResponsesFormat(structured);
    if (format) body.text = { format };
    const reasoning = openAiReasoning(request.reasoning);
    if (reasoning) body.reasoning = reasoning;
    return body;
  }

  const body: Record<string, unknown> = {
    model: request.model,
    temperature: 0,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: prompt },
    ],
  };
  const format = openAiChatFormat(structured);
  if (format) body.response_format = format;
  const reasoning = openAiReasoning(request.reasoning);
  if (reasoning) body.reasoning_effort = reasoning.effort;
  return body;
}

export function buildHeaders(
  apiKey: string,
  authScheme: IntakeAuthScheme,
  protocol: IntakeTransportProtocol,
  anthropicVersion = '2023-06-01',
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && authScheme === 'bearer') headers.Authorization = `Bearer ${apiKey}`;
  if (apiKey && authScheme === 'x-api-key') headers['x-api-key'] = apiKey;
  if (apiKey && authScheme === 'api-key') headers['api-key'] = apiKey;
  if (protocol === 'anthropic-messages') headers['anthropic-version'] = anthropicVersion;
  return headers;
}

function openAiChatFormat(output: IntakeStructuredOutput): Record<string, unknown> | undefined {
  if (output.mode === 'prompt_fallback') return undefined;
  if (output.mode === 'json_object') return { type: 'json_object' };
  if (!output.schema) return { type: 'json_object' };
  return {
    type: 'json_schema',
    json_schema: {
      name: output.name ?? 'intake_response_v1',
      strict: true,
      schema: output.schema,
    },
  };
}

function openAiResponsesFormat(output: IntakeStructuredOutput): Record<string, unknown> | undefined {
  if (output.mode === 'prompt_fallback') return undefined;
  if (output.mode === 'json_object') return { type: 'json_object' };
  if (!output.schema) return { type: 'json_object' };
  return {
    type: 'json_schema',
    name: output.name ?? 'intake_response_v1',
    strict: true,
    schema: output.schema,
  };
}

function openAiReasoning(reasoning: IntakeReasoning | undefined): { effort: string } | undefined {
  if (!reasoning || reasoning === 'auto' || reasoning === 'none' || reasoning === 'adaptive') return undefined;
  return { effort: reasoning };
}

function anthropicThinking(reasoning: IntakeReasoning | undefined): Record<string, unknown> | undefined {
  if (!reasoning || reasoning === 'auto' || reasoning === 'none') return undefined;
  if (reasoning === 'adaptive') return { type: 'adaptive' };
  const budget = reasoning === 'low' ? 2_048
    : reasoning === 'medium' ? 4_096
      : reasoning === 'high' ? 8_192
        : 16_384;
  return { type: 'enabled', budget_tokens: budget };
}

function extractProviderContent(protocol: IntakeTransportProtocol, envelope: unknown): string | undefined {
  const record = asRecord(envelope);
  if (!record) return undefined;
  if (protocol === 'openai-responses') {
    if (typeof record.output_text === 'string') return record.output_text;
    const output = Array.isArray(record.output) ? record.output : [];
    const texts = output.flatMap((entry) => {
      const item = asRecord(entry);
      if (item?.type !== 'message') return [];
      const content = Array.isArray(item?.content) ? item.content : [];
      return content.flatMap((part) => {
        const value = asRecord(part);
        return value?.type === 'output_text' && typeof value.text === 'string' ? [value.text] : [];
      });
    });
    return texts.length > 0 ? texts.join('') : undefined;
  }
  if (protocol === 'anthropic-messages') {
    const content = Array.isArray(record.content) ? record.content : [];
    const texts = content.flatMap((part) => {
      const value = asRecord(part);
      return value?.type === 'text' && typeof value.text === 'string' ? [value.text] : [];
    });
    return texts.length > 0 ? texts.join('') : undefined;
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = asRecord(asRecord(choices[0])?.message);
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    const texts = message.content.flatMap((part) => {
      const value = asRecord(part);
      return typeof value?.text === 'string' ? [value.text] : [];
    });
    return texts.length > 0 ? texts.join('') : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
}

const defaultHttpClient: HttpClient = (url, init) => fetch(url, init as RequestInit);

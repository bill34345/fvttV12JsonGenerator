import type { HttpClient, HttpResponse } from './http';

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
}

export type IntakeProviderActivityPhase =
  | 'sending'
  | 'awaiting_headers'
  | 'streaming_reasoning'
  | 'streaming_output'
  | 'validating'
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'stopped';

export type IntakeProviderTransportState = 'pending' | 'stream_open' | 'closed' | 'browser_error';
export type IntakeProviderActivityState = 'unknown' | 'reported_in_progress' | 'reported_reasoning' | 'reported_output' | 'completed' | 'failed';

export interface IntakeProviderActivity {
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
export interface IntakeRequestWaitStatus {
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

export interface IntakeTransportRequest extends IntakeTransportOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  httpClient?: HttpClient;
  signal?: AbortSignal;
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

interface ObservedProviderState {
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
  return request.waitPolicy
    ? waitForHumanDecision(operation, request, request.waitPolicy, observed, startedAt, interactiveAbort?.abort)
    : operation;
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
    response = await httpClient(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });
    observed.phase = 'reading_response_body';
    observed.responseHeadersReceived = true;
    observed.httpStatus = response.status;
    observed.lastObservableProgressAtMs = Date.now();
    observed.transport = request.stream && protocol === 'openai-responses' ? 'stream_open' : 'pending';
    observed.activityPhase = 'awaiting_headers';
    emitActivity(request, observed, startedAt, 'response.headers');
  } catch (error) {
    observed.transport = 'browser_error';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    if (isAbortError(error)) {
      observed.activityPhase = 'stopped';
      emitActivity(request, observed, startedAt, 'stopped');
      throw new IntakeTransportError('timeout', 'AI provider request timed out.', { retryable: true });
    }
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

  if (response.status === 429) {
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('rate_limited', 'AI provider rate limited the request.', {
      retryable: true,
      status: 429,
    });
  }
  if (!response.ok) {
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('http_error', `AI provider HTTP ${response.status}.`, {
      retryable: response.status >= 500,
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
      if (isAbortError(error)) {
        observed.activityPhase = 'stopped';
        observed.transport = 'closed';
        observed.providerActivity = 'failed';
        emitActivity(request, observed, startedAt, 'stopped');
        throw new IntakeTransportError('timeout', 'AI provider request timed out.', { retryable: true });
      }
      observed.transport = 'browser_error';
      observed.activityPhase = 'failed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, 'browser.error');
      throw new IntakeTransportError('network', 'AI provider stream could not be read.', { retryable: true });
    }
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch (error) {
    if (isAbortError(error)) {
      observed.transport = 'closed';
      observed.activityPhase = 'stopped';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, 'stopped');
      throw new IntakeTransportError('timeout', 'AI provider request timed out.', { retryable: true });
    }
    if (error && typeof error === 'object' && 'code' in error && 'retryable' in error) {
      observed.transport = 'closed';
      observed.activityPhase = 'failed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, 'response.failed');
      throw error;
    }
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider returned invalid JSON.', { retryable: true });
  }
  const content = extractProviderContent(protocol, envelope);
  if (!content) {
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
    const decision = await policy.onDecision({
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
      requestSettledSignal: requestSettled.signal,
    });
    if (decision === 'stop') {
      stopRequest?.();
      observed.activityPhase = 'stopped';
      observed.transport = 'closed';
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
  };
  try { request.onActivity?.(activity); } catch { /* UI observers must not break the provider request. */ }
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
      observed.activityPhase = 'awaiting_headers';
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
      terminal = 'incomplete';
      observed.activityPhase = 'incomplete';
      observed.transport = 'closed';
      observed.providerActivity = 'failed';
      emitActivity(request, observed, startedAt, safeType);
      throw new IntakeTransportError('invalid_response', 'AI provider returned an incomplete response.', { retryable: true });
    }
    if (eventType === 'response.failed') {
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

  for await (const chunk of responseChunks(body)) {
    const value = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    buffer += value;
    const blocks = buffer.split(/\r?\n\r?\n/u);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) processBlock(block);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);

  if (terminal !== 'completed' || !terminalResponse) {
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
    observed.transport = 'closed';
    observed.activityPhase = 'failed';
    observed.providerActivity = 'failed';
    emitActivity(request, observed, startedAt, 'response.failed');
    throw new IntakeTransportError('invalid_response', 'AI provider completed without usable content.', { retryable: true });
  }
  if (request.structuredOutput?.mode !== 'prompt_fallback') {
    try { JSON.parse(content); } catch {
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

async function* responseChunks(body: NonNullable<HttpResponse['body']>): AsyncGenerator<Uint8Array | string> {
  if (typeof (body as any).getReader === 'function') {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (next.value !== undefined) yield next.value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body as AsyncIterable<Uint8Array>) yield chunk;
    return;
  }
  throw new IntakeTransportError('invalid_response', 'AI provider returned an unreadable response stream.', { retryable: true });
}

function safeEventType(eventType: string): string {
  const known = new Set([
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

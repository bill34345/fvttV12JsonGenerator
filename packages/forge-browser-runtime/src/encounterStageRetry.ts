import { MonsterIntakeProviderError } from '@fvtt-json-generator/intake-ai/provider';
import { IntakeTransportError } from '@fvtt-json-generator/intake-ai/transport';

export type EncounterRetryStage = 'discover' | 'extract' | 'review' | 'repair' | 'automation-generate' | 'automation-review';

export interface EncounterRetryMetadata {
  stage: EncounterRetryStage;
  attempt: 2;
  code: 'network' | 'invalid_response' | 'http_error';
}

export interface EncounterStageRetryOptions {
  signal?: AbortSignal;
  budgetMs?: number;
  maxAttempts?: 1 | 2;
  onRetry?: (metadata: EncounterRetryMetadata) => void;
}

const DEFAULT_BUDGET_MS = 30 * 60 * 1000;

/** Local-bridge-only bounded retry. Each logical stage owns one shared deadline. */
export async function retryEncounterStage<T>(
  stage: EncounterRetryStage,
  options: EncounterStageRetryOptions,
  invoke: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxAttempts = options.maxAttempts ?? 2;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > DEFAULT_BUDGET_MS) throw new TypeError('Encounter retry budget must be a safe integer from 1 to 1800000 milliseconds.');
  if (maxAttempts !== 1 && maxAttempts !== 2) throw new TypeError('Encounter retry maxAttempts must be 1 or 2.');
  throwIfAborted(options.signal);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), budgetMs);
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(options.signal);
      if (deadline.signal.aborted) throw stageTimeout();
      const attemptController = new AbortController();
      const signal = combineEncounterSignals(options.signal, deadline.signal, attemptController.signal);
      try {
        const value = await awaitStageResult(Promise.resolve().then(() => {
          if (signal.aborted) throw abortError();
          return invoke(signal);
        }), signal);
        throwIfAborted(options.signal);
        if (deadline.signal.aborted) throw stageTimeout();
        return value;
      } catch (error) {
        if (options.signal?.aborted) throw abortError();
        if (deadline.signal.aborted) throw stageTimeout();
        if (attempt >= maxAttempts) throw error;
        const retry = retryMetadata(stage, attempt, error);
        if (!retry) throw error;
        options.onRetry?.(retry);
      } finally {
        attemptController.abort();
      }
    }
    throw new Error('Encounter retry loop exhausted unexpectedly.');
  } finally {
    clearTimeout(timer);
  }
}

export function combineEncounterSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return new AbortController().signal;
  if (active.length === 1) return active[0]!;
  return AbortSignal.any(active);
}

function retryMetadata(
  stage: EncounterRetryStage,
  attempt: number,
  error: unknown,
): EncounterRetryMetadata | undefined {
  if (attempt !== 1 || !(error instanceof MonsterIntakeProviderError || error instanceof IntakeTransportError)) return undefined;
  if (error.retryable !== true) return undefined;
  if (error.code !== 'network' && error.code !== 'invalid_response' && !(error.code === 'http_error' && error.status !== undefined && error.status >= 500 && error.status <= 599)) {
    return undefined;
  }
  return { stage, attempt: 2, code: error.code };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException('Encounter AI stage was cancelled.', 'AbortError');
}

function stageTimeout(): MonsterIntakeProviderError {
  return new MonsterIntakeProviderError('timeout', 'Encounter AI stage exhausted its shared time budget.', { retryable: false });
}

function awaitStageResult<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const finishResolve = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => finishReject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finishResolve(value),
      (error) => finishReject(error),
    );
  });
}

export function combineAbortSignals(
  ...values: Array<AbortSignal | null | undefined>
): AbortSignal | undefined {
  const signals = values.filter((value): value is AbortSignal => Boolean(value));
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];

  const abortSignalWithAny = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  if (typeof abortSignalWithAny.any === 'function') return abortSignalWithAny.any(signals);

  const controller = new AbortController();
  const abortFrom = (signal: AbortSignal) => () => controller.abort(signal.reason);
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', abortFrom(signal), { once: true });
  }
  return controller.signal;
}

export function guardResponseBodyForCallerAbort(
  response: Response,
  callerSignal: AbortSignal | undefined,
  callerAbortError: () => Error,
): Response {
  if (!callerSignal) return response;
  return new Proxy(response, {
    get(target, property) {
      if (property === 'json') {
        return async () => {
          try {
            return await target.json();
          } catch (error) {
            if (callerSignal.aborted) throw callerAbortError();
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

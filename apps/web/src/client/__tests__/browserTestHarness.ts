type MessageListener = (event: MessageEvent<unknown>) => void;

interface TimerHarness {
  timeouts: Map<number, () => void>;
  intervals: Map<number, () => void>;
  clearedTimeouts: number[];
  clearedIntervals: number[];
  runNextTimeout(): void;
  runNextInterval(): void;
}

export interface BrowserHarness extends TimerHarness {
  window: Window;
  messageListeners: Set<MessageListener>;
  openCalls: Array<[string, string | undefined, string | undefined]>;
  emitMessage(event: MessageEvent<unknown>): void;
}

const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const baselineGlobals = new Map<string, PropertyDescriptor | undefined>(
  ['fetch', 'window', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
let nextTimerId = 1;

export function setTestGlobal(name: string, value: unknown): void {
  if (!originalGlobals.has(name)) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

export function installFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response,
): void {
  setTestGlobal('fetch', handler);
}

export function installBrowser(origin: string, userAgent = 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'): BrowserHarness {
  const timeouts = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  const clearedTimeouts: number[] = [];
  const clearedIntervals: number[] = [];
  const messageListeners = new Set<MessageListener>();
  const openCalls: Array<[string, string | undefined, string | undefined]> = [];
  const browser: BrowserHarness = {
    window: undefined as unknown as Window,
    timeouts,
    intervals,
    clearedTimeouts,
    clearedIntervals,
    messageListeners,
    openCalls,
    emitMessage(event) {
      for (const listener of [...messageListeners]) listener(event);
    },
    runNextTimeout() {
      const callback = timeouts.values().next().value as (() => void) | undefined;
      if (callback) callback();
    },
    runNextInterval() {
      const callback = intervals.values().next().value as (() => void) | undefined;
      if (callback) callback();
    },
  };

  const windowMock = {
    location: { origin },
    open(url: string, name?: string, features?: string): Window | null {
      openCalls.push([url, name, features]);
      return null;
    },
    setTimeout(callback: TimerHandler): number {
      const id = nextTimerId++;
      timeouts.set(id, callback as () => void);
      return id;
    },
    clearTimeout(id: number): void {
      clearedTimeouts.push(id);
      timeouts.delete(id);
    },
    setInterval(callback: TimerHandler): number {
      const id = nextTimerId++;
      intervals.set(id, callback as () => void);
      return id;
    },
    clearInterval(id: number): void {
      clearedIntervals.push(id);
      intervals.delete(id);
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      if (type === 'message' && typeof listener === 'function') {
        messageListeners.add(listener as MessageListener);
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      if (type === 'message' && typeof listener === 'function') {
        messageListeners.delete(listener as MessageListener);
      }
    },
  } as unknown as Window;

  browser.window = windowMock;
  setTestGlobal('window', windowMock);
  setTestGlobal('navigator', { userAgent });
  return browser;
}

export function restoreTestGlobals(): void {
  for (const [name, descriptor] of [...originalGlobals.entries()].reverse()) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originalGlobals.clear();
}

export function globalsAreRestored(): boolean {
  for (const [name, baseline] of baselineGlobals) {
    const current = Object.getOwnPropertyDescriptor(globalThis, name);
    if (!descriptorsEqual(current, baseline)) return false;
  }
  return true;
}

function descriptorsEqual(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
  if (!left || !right) return left === right;
  return left.configurable === right.configurable
    && left.enumerable === right.enumerable
    && left.writable === right.writable
    && left.value === right.value
    && left.get === right.get
    && left.set === right.set;
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

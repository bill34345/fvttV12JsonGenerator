import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export class CdpConnection {
  readonly #socket: WebSocket;
  #sequence = 0;
  #pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  #listeners = new Map<string, Set<(params: any) => void>>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === 'number') {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('CDP connection closed.'));
      this.#pending.clear();
    });
  }

  static async connect(url: string, timeoutMs = 10_000): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP connection timed out: ${url}`)), timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`CDP connection failed: ${url}`));
      }, { once: true });
    });
    return new CdpConnection(socket);
  }

  async send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.#socket.readyState !== WebSocket.OPEN) throw new Error('CDP connection is not open.');
    const id = ++this.#sequence;
    const result = new Promise<T>((resolveResult, reject) => {
      this.#pending.set(id, { resolve: resolveResult, reject });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  on(method: string, listener: (params: any) => void): () => void {
    const listeners = this.#listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close(): void {
    this.#socket.close();
  }
}

export async function readDevToolsPort(profileDirectory: string, timeoutMs = 60_000): Promise<{
  port: number;
  browserWebSocketUrl: string;
}> {
  const path = resolve(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await stat(path)).size > 0) {
        const [portText, browserPath] = (await readFile(path, 'utf8')).trim().split(/\r?\n/);
        const port = Number(portText);
        if (Number.isInteger(port) && browserPath) {
          return { port, browserWebSocketUrl: `ws://127.0.0.1:${port}${browserPath}` };
        }
      }
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error(`Chrome did not create ${path} within ${timeoutMs} ms.`);
}

export async function listTargets(port: number): Promise<CdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP target discovery returned HTTP ${response.status}.`);
  return response.json() as Promise<CdpTarget[]>;
}

export async function waitForPageTarget(
  port: number,
  urlIncludes: string,
  timeoutMs = 30_000,
): Promise<CdpTarget> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const target = (await listTargets(port)).find((entry) =>
      entry.type === 'page' && entry.url.includes(urlIncludes) && entry.webSocketDebuggerUrl
    );
    if (target) return target;
    await Bun.sleep(500);
  }
  throw new Error(`No CDP page target matched "${urlIncludes}" within ${timeoutMs} ms.`);
}

export async function evaluate<T>(connection: CdpConnection, expression: string): Promise<T> {
  const response = await connection.send<any>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  if (response.exceptionDetails) throw new Error('CDP Runtime.evaluate returned an exception.');
  return response.result?.value as T;
}

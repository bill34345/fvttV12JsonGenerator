import { randomBytes } from 'node:crypto';

import { CodexCliAdapter, type CodexChatRequest } from '../server/ai-connections/codexAdapter';
import {
  COMPANION_PROTOCOL_VERSION,
  decodeCompanionMessage,
  isCompanionGate,
  isCompanionRequest,
  type CompanionGateMessage,
  type CompanionRequestMessage,
} from '../server/ai-connections/protocol';
import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PORT,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
  COMPANION_SERVICE_NAME,
  COMPANION_WEB_ORIGIN,
  isLocalCompanionHealth,
  type LocalCompanionActionResponse,
  type LocalCompanionHealth,
  type LocalCompanionPairRequest,
  type LocalCompanionPairResponse,
  type LocalCompanionState,
} from './controlProtocol';

const COMPANION_VERSION = '1.0.0';
const IDLE_EXIT_MS = 30 * 60 * 1_000;
const MAX_CONTROL_BODY_BYTES = 16 * 1024;
const PAIR_RATE_WINDOW_MS = 60 * 1_000;
const PAIR_RATE_LIMIT = 10;

interface CliOptions {
  origin: string;
  pairingId: string;
  pairingToken: string;
  confirmOrigin: string;
  codex?: string;
}

interface RunCallbacks {
  onState?: (state: LocalCompanionState) => void;
  onSocket?: (socket: WebSocket) => void;
}

export async function runCompanion(options: CliOptions, callbacks: RunCallbacks = {}): Promise<void> {
  if (options.confirmOrigin !== options.origin) {
    throw new Error('Refusing to connect: --confirm-origin must exactly match the displayed server origin.');
  }
  const origin = validateOrigin(options.origin);
  const protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${origin.host}/api/ai-companion/connect`;
  const adapter = new CodexCliAdapter({ executable: options.codex });
  const socket = new WebSocket(socketUrl);
  callbacks.onSocket?.(socket);

  let handshakeComplete = false;
  let gateStarted = false;
  let resolveHandshake!: () => void;
  let rejectHandshake!: (error: Error) => void;
  const handshake = new Promise<void>((resolve, reject) => {
    resolveHandshake = resolve;
    rejectHandshake = reject;
  });
  const handshakeTimer = setTimeout(() => {
    rejectHandshake(new Error('Codex Companion handshake timed out; check the Web pairing status and retry.'));
    socket.close(1008, 'Companion handshake timed out.');
  }, 10 * 60 * 1_000);
  const closed = new Promise<void>((resolve) => {
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({
          type: 'pair',
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          pairingId: options.pairingId,
          token: options.pairingToken,
          origin: options.origin,
        }));
      } catch {
        socket.close(1008, 'Companion pairing handshake failed.');
      }
    };
    socket.onerror = () => {
      if (handshakeComplete) socket.close(1011, 'Companion websocket error.');
    };
    socket.onclose = () => {
      clearTimeout(handshakeTimer);
      if (!handshakeComplete) rejectHandshake(new Error('Codex Companion disconnected before the security gate completed.'));
      resolve();
    };
  });

  // Attach the message handler before waiting for open; the server sends the gate immediately after accepting.
  socket.onmessage = (event) => {
    let value: unknown;
    try {
      value = decodeCompanionMessage(event.data as string | ArrayBuffer | Uint8Array);
    } catch {
      socket.close(1003, 'Invalid Companion protocol JSON.');
      if (!handshakeComplete) rejectHandshake(new Error('Companion sent invalid protocol JSON.'));
      return;
    }
    if (!handshakeComplete) {
      if (!isCompanionGate(value)) {
        socket.close(1003, 'Expected the Companion security gate.');
        rejectHandshake(new Error('Companion sent an invalid or unsupported security gate.'));
        return;
      }
      if (gateStarted) {
        socket.close(1008, 'Companion sent a duplicate security gate.');
        rejectHandshake(new Error('Companion sent a duplicate security gate.'));
        return;
      }
      gateStarted = true;
      if (!value.connectionId) {
        socket.close(1008, 'Companion connection mismatch.');
        rejectHandshake(new Error('Companion connection identity did not match the pairing.'));
        return;
      }
      callbacks.onState?.('verifying');
      void completeGate(socket, adapter, value).then((result) => {
        if (!result.ok) {
          rejectHandshake(new Error(result.diagnostic ?? 'Companion zero-tool security gate failed.'));
          socket.close(1008, 'Companion security gate failed.');
          return;
        }
        handshakeComplete = true;
        callbacks.onState?.('connected');
        resolveHandshake();
      }).catch((error) => {
        const diagnostic = sanitizeDiagnostic(error);
        try {
          socket.send(JSON.stringify({
            type: 'gate-result',
            protocolVersion: COMPANION_PROTOCOL_VERSION,
            connectionId: value.connectionId,
            ok: false,
            diagnostic,
          }));
        } catch {
          // Closing below is the fail-closed path if the socket is already gone.
        }
        rejectHandshake(new Error(diagnostic));
        socket.close(1008, 'Companion security gate failed.');
      });
      return;
    }
    if (!isCompanionRequest(value)) {
      socket.close(1003, 'Unknown Companion protocol message.');
      return;
    }
    void handleMessage(socket, adapter, value).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      socket.close(1011, 'Companion request failed.');
    });
  };

  await handshake;
  clearTimeout(handshakeTimer);
  await closed;
}

async function completeGate(
  socket: WebSocket,
  adapter: CodexCliAdapter,
  gate: CompanionGateMessage,
): Promise<{ ok: boolean; diagnostic?: string }> {
  const uniqueModels = new Map<string, CompanionGateMessage['models'][number]>();
  for (const model of gate.models) uniqueModels.set(`${model.model}\u0000${model.reasoningEffort}`, model);
  const results = await Promise.all([...uniqueModels.values()].map((model) => (
    adapter.verifyZeroToolGate(model.model, model.reasoningEffort)
  )));
  const failed = results.find((result) => !result.ok);
  const diagnostic = failed?.diagnostic;
  socket.send(JSON.stringify({
    type: 'gate-result',
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    connectionId: gate.connectionId,
    ok: !failed,
    ...(diagnostic ? { diagnostic } : {}),
  }));
  if (failed) return { ok: false, ...(diagnostic ? { diagnostic } : {}) };
  return { ok: true };
}

async function handleMessage(socket: WebSocket, adapter: CodexCliAdapter, message: CompanionRequestMessage): Promise<void> {
  try {
    const request = JSON.parse(message.body) as CodexChatRequest;
    const result = await adapter.run(request);
    socket.send(JSON.stringify({
      type: 'response',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      requestId: message.requestId,
      status: 200,
      body: {
        id: `companion-${message.requestId}`,
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
      },
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Companion model request failed.');
    socket.send(JSON.stringify({
      type: 'response',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      requestId: message.requestId,
      status: 502,
      body: { error: { message: 'Companion model request failed.' } },
    }));
  }
}

async function startBackgroundCompanion(): Promise<void> {
  if (await existingCompanionIsRunning()) return;

  const instanceId = randomBytes(18).toString('base64url');
  let state: LocalCompanionState = 'idle';
  let diagnostic: string | undefined;
  let activeSocket: WebSocket | undefined;
  let activeRun: Promise<void> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const pairAttempts: number[] = [];

  const health = (): LocalCompanionHealth => ({
    protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
    service: COMPANION_SERVICE_NAME,
    version: COMPANION_VERSION,
    instanceId,
    status: state,
    ...(diagnostic ? { diagnostic } : {}),
  });

  const scheduleIdleExit = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (stopped || activeRun || state !== 'idle') return;
    idleTimer = setTimeout(() => {
      server.stop(true);
      process.exit(0);
    }, IDLE_EXIT_MS);
  };

  const handler = async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') return controlPreflight(origin);
    if (origin !== COMPANION_WEB_ORIGIN) return controlError(403, 'COMPANION_ORIGIN_REJECTED', '只允许来自 127.0.0.1:5173 的 Web 页面连接 Companion。');
    if (request.headers.get(COMPANION_CONTROL_HEADER) !== String(COMPANION_CONTROL_PROTOCOL_VERSION)) {
      return controlError(400, 'COMPANION_PROTOCOL_UNSUPPORTED', 'Companion control protocol version is unsupported.');
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/health') return controlJson(health());
    if (request.method !== 'POST') return controlError(405, 'COMPANION_METHOD_NOT_ALLOWED', 'Only the documented Companion control methods are allowed.');

    let body: unknown;
    try {
      body = await readControlBody(request);
    } catch {
      return controlError(400, 'COMPANION_INVALID_CONTROL_BODY', 'Companion control body is invalid or too large.');
    }
    if (url.pathname === '/v1/pair') {
      if (!consumePairRateLimit(pairAttempts)) return controlError(429, 'COMPANION_RATE_LIMITED', '本机 Companion 配对请求过于频繁，请稍后重试。');
      const input = parsePairRequest(body, instanceId);
      if (!input) return controlError(400, 'COMPANION_INVALID_PAIR_REQUEST', 'Companion 配对请求格式无效。');
      if (activeRun || state === 'connecting' || state === 'verifying' || state === 'connected') {
        return controlError(409, 'COMPANION_BUSY', '本机 Companion 已经连接到另一个 Web 会话。');
      }
      diagnostic = undefined;
      state = 'connecting';
      const run = runCompanion({
        origin: input.origin,
        pairingId: input.pairingId,
        pairingToken: input.pairingToken,
        confirmOrigin: input.origin,
      }, {
        onState: (nextState) => { state = nextState; },
        onSocket: (socket) => { activeSocket = socket; },
      });
      activeRun = run;
      void run.catch((error) => {
        diagnostic = sanitizeDiagnostic(error);
        state = 'blocked';
      }).finally(() => {
        activeSocket = undefined;
        activeRun = undefined;
        if (!stopped && state !== 'blocked') {
          state = 'idle';
          scheduleIdleExit();
        }
      });
      return controlJson<LocalCompanionPairResponse>({ accepted: true, instanceId, status: 'connecting' });
    }

    const input = parseInstanceRequest(body, instanceId);
    if (!input) return controlError(400, 'COMPANION_INVALID_CONTROL_REQUEST', 'Companion control request format is invalid.');
    if (url.pathname === '/v1/disconnect') {
      activeSocket?.close(1000, 'Disconnected by the Web page.');
      return controlJson<LocalCompanionActionResponse>({ accepted: true, instanceId, status: 'idle' });
    }
    if (url.pathname === '/v1/shutdown') {
      stopped = true;
      if (idleTimer) clearTimeout(idleTimer);
      activeSocket?.close(1000, 'Companion stopped by the Web page.');
      const response = controlJson<LocalCompanionActionResponse>({ accepted: true, instanceId, status: 'idle' });
      setTimeout(() => {
        server.stop(true);
        process.exit(0);
      }, 25);
      return response;
    }
    return controlError(404, 'COMPANION_ROUTE_NOT_FOUND', 'Companion control route not found.');
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: COMPANION_CONTROL_PORT,
    fetch: handler,
  });
  scheduleIdleExit();
  await new Promise<void>(() => undefined);
}

async function existingCompanionIsRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${COMPANION_CONTROL_URL}/v1/health`, {
      headers: {
        origin: COMPANION_WEB_ORIGIN,
        [COMPANION_CONTROL_HEADER]: String(COMPANION_CONTROL_PROTOCOL_VERSION),
      },
      signal: AbortSignal.timeout(500),
    });
    return response.ok && isLocalCompanionHealth(await response.json());
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    const result = index >= 0 ? argv[index + 1] : undefined;
    if (!result) throw new Error(`${name} is required.`);
    return result;
  };
  const options: CliOptions = {
    origin: value('--origin'),
    pairingId: value('--pairing-id'),
    pairingToken: value('--pairing-token'),
    confirmOrigin: value('--confirm-origin'),
  };
  const codexIndex = argv.indexOf('--codex');
  if (codexIndex >= 0 && argv[codexIndex + 1]) options.codex = argv[codexIndex + 1];
  return options;
}

function validateOrigin(value: string): URL {
  const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username
    || origin.password
    || origin.pathname !== '/'
    || origin.search
    || origin.hash
    || origin.origin !== value) {
    throw new Error('Refusing to connect: --origin must be the exact displayed HTTP(S) origin.');
  }
  return origin;
}

function controlPreflight(origin: string | null): Response {
  if (origin !== COMPANION_WEB_ORIGIN) return controlError(403, 'COMPANION_ORIGIN_REJECTED', 'Only the configured Web origin may use Companion control.');
  return new Response(null, {
    status: 204,
    headers: controlHeaders(),
  });
}

function controlJson<T>(value: T): Response {
  return new Response(JSON.stringify(value), {
    headers: controlHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function controlError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: controlHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function controlHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    'access-control-allow-origin': COMPANION_WEB_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': `content-type, ${COMPANION_CONTROL_HEADER}`,
    'access-control-allow-private-network': 'true',
    vary: 'Origin',
    ...extra,
  };
}

async function readControlBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_CONTROL_BODY_BYTES) throw new Error('control body too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control body too large');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parsePairRequest(value: unknown, instanceId: string): LocalCompanionPairRequest | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['protocolVersion', 'instanceId', 'origin', 'pairingId', 'pairingToken'])) return undefined;
  if (value.protocolVersion !== COMPANION_CONTROL_PROTOCOL_VERSION
    || value.instanceId !== instanceId
    || value.origin !== COMPANION_WEB_ORIGIN
    || !isSafeId(value.pairingId, 24)
    || !isSafeId(value.pairingToken, 32)) return undefined;
  return value as unknown as LocalCompanionPairRequest;
}

function parseInstanceRequest(value: unknown, instanceId: string): { instanceId: string } | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['protocolVersion', 'instanceId'])) return undefined;
  if (value.protocolVersion !== COMPANION_CONTROL_PROTOCOL_VERSION || value.instanceId !== instanceId) return undefined;
  return { instanceId };
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isSafeId(value: unknown, minimumLength: number): value is string {
  return typeof value === 'string' && value.length >= minimumLength && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

function consumePairRateLimit(attempts: number[]): boolean {
  const cutoff = Date.now() - PAIR_RATE_WINDOW_MS;
  while (attempts[0] !== undefined && attempts[0] < cutoff) attempts.shift();
  if (attempts.length >= PAIR_RATE_LIMIT) return false;
  attempts.push(Date.now());
  return true;
}

function sanitizeDiagnostic(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .trim()
    .slice(0, 500)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function printHelp(): void {
  console.log('FVTT AI Companion');
  console.log('Double-click this executable to start the local Companion control service.');
  console.log('Advanced diagnostic mode: --origin <origin> --pairing-id <id> --pairing-token <token> --confirm-origin <origin>');
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
  } else if (argv.length === 0) {
    startBackgroundCompanion().catch((error) => {
      console.error(sanitizeDiagnostic(error));
      process.exitCode = 1;
    });
  } else {
    runCompanion(parseArgs(argv)).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}

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
  COMPANION_LOCAL_WEB_ORIGIN,
  isCompanionWebOrigin,
  isLocalCompanionHealth,
} from './controlProtocol';
import {
  createCompanionControlService,
  type CompanionRunCallbacks,
  type CompanionRunInput,
} from './controlService';

const COMPANION_VERSION = '1.0.0';
const IDLE_EXIT_MS = 30 * 60 * 1_000;

export async function runCompanion(options: CompanionRunInput, callbacks: CompanionRunCallbacks = {}): Promise<void> {
  const origin = validateOrigin(options.origin);
  const protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${origin.host}/api/ai-companion/connect`;
  const adapter = new CodexCliAdapter();
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

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;

  const scheduleIdleExit = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (!server || service.isBusy() || service.health().status !== 'idle') return;
    idleTimer = setTimeout(() => {
      server?.stop(true);
      process.exit(0);
    }, IDLE_EXIT_MS);
  };

  const service = createCompanionControlService({
    version: COMPANION_VERSION,
    startRun: runCompanion,
    onStateChange: () => scheduleIdleExit(),
    onShutdown: () => {
      if (idleTimer) clearTimeout(idleTimer);
      server?.stop(true);
      process.exit(0);
    },
  });
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: COMPANION_CONTROL_PORT,
    fetch: service.fetch,
  });
  scheduleIdleExit();
  await new Promise<void>(() => undefined);
}

async function existingCompanionIsRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${COMPANION_CONTROL_URL}/v2/health`, {
      headers: {
        origin: COMPANION_LOCAL_WEB_ORIGIN,
        [COMPANION_CONTROL_HEADER]: String(COMPANION_CONTROL_PROTOCOL_VERSION),
      },
      signal: AbortSignal.timeout(500),
    });
    return response.ok && isLocalCompanionHealth(await response.json());
  } catch {
    return false;
  }
}

function validateOrigin(value: string): URL {
  const origin = new URL(value);
  if (!isCompanionWebOrigin(value)) {
    throw new Error('Refusing to connect: the displayed Web origin must be local 127.0.0.1:5173 or an exact HTTPS origin.');
  }
  return origin;
}

function sanitizeDiagnostic(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .trim()
    .slice(0, 500)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]');
}

function printHelp(): void {
  console.log('FVTT AI Companion');
  console.log('Double-click this executable to start the local Companion control service.');
  console.log('Pairing is only accepted through the local confirmation page; pairing tokens are never accepted on the command line.');
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
    console.error('命令行配对模式已删除：请双击启动 Companion，并在网页中完成本机确认。');
    process.exitCode = 1;
  }
}

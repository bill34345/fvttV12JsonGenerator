import { CodexCliAdapter, type CodexChatRequest } from '../server/ai-connections/codexAdapter';

interface CompanionRequest {
  type: 'request';
  requestId: string;
  url: string;
  method: 'POST';
  body: string;
}

interface CliOptions {
  origin: string;
  pairingId: string;
  pairingToken: string;
  confirmOrigin: string;
  model?: string;
  codex?: string;
}

export async function runCompanion(options: CliOptions): Promise<void> {
  if (options.confirmOrigin !== options.origin) {
    throw new Error('Refusing to connect: --confirm-origin must exactly match the displayed server origin.');
  }
  const origin = new URL(options.origin);
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username
    || origin.password
    || origin.pathname !== '/'
    || origin.search
    || origin.hash
    || origin.origin !== options.origin) {
    throw new Error('Refusing to connect: --origin must be the exact displayed HTTP(S) origin.');
  }
  const protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${origin.host}/api/ai-companion/connect?${new URLSearchParams({
    pairingId: options.pairingId,
    token: options.pairingToken,
    origin: options.origin,
  })}`;
  const adapter = new CodexCliAdapter({ executable: options.codex });
  const model = options.model ?? 'gpt-5.6-luna';
  const gate = await adapter.verifyZeroToolGate(model);
  if (!gate.ok) throw new Error(gate.diagnostic ?? 'Companion zero-tool security gate failed.');
  const socket = new WebSocket(socketUrl);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error('Could not connect to the AI Companion websocket.'));
  });
  console.log(`Codex Companion connected to ${options.origin}.`);
  socket.onmessage = (event) => {
    void handleMessage(socket, adapter, event.data).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      socket.close(1011, 'Companion request failed.');
    });
  };
  await new Promise<void>((resolve) => {
    socket.onclose = () => resolve();
  });
}

async function handleMessage(socket: WebSocket, adapter: CodexCliAdapter, raw: unknown): Promise<void> {
  const message = parseRequest(raw);
  try {
    const request = JSON.parse(message.body) as CodexChatRequest;
    const result = await adapter.run(request);
    socket.send(JSON.stringify({
      type: 'response',
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
      requestId: message.requestId,
      status: 502,
      body: { error: { message: 'Companion model request failed.' } },
    }));
  }
}

function parseRequest(raw: unknown): CompanionRequest {
  const text = typeof raw === 'string'
    ? raw
    : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : new TextDecoder().decode(raw as Uint8Array);
  const value = JSON.parse(text) as Partial<CompanionRequest>;
  if (value.type !== 'request' || typeof value.requestId !== 'string' || value.method !== 'POST' || value.url !== '/chat/completions' || typeof value.body !== 'string') {
    throw new Error('Companion received an invalid request envelope.');
  }
  return value as CompanionRequest;
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
  const modelIndex = argv.indexOf('--model');
  if (modelIndex >= 0 && argv[modelIndex + 1]) options.model = argv[modelIndex + 1];
  const codexIndex = argv.indexOf('--codex');
  if (codexIndex >= 0 && argv[codexIndex + 1]) options.codex = argv[codexIndex + 1];
  return options;
}

if (import.meta.main) {
  runCompanion(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

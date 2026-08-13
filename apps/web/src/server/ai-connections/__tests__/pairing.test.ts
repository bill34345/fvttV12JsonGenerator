import { describe, expect, it } from 'bun:test';

import { getWebSecurityConfig } from '../../security/config';
import { createAiConnectionsRuntime } from '../runtime';

describe('Codex Companion pairing', () => {
  it('creates a five-minute one-time pairing bound to the anonymous session', async () => {
    let now = 1_000;
    const runtime = createAiConnectionsRuntime(getWebSecurityConfig({ FVTT_WEB_CODEX_COMPANION_ENABLED: '1' }).aiConnections, { now: () => now });
    const bootstrap = await session(runtime);
    const created = await runtime.handleApiRequest(request('/api/ai-connections/codex/pairings', bootstrap, {
      model: 'gpt-5.5', reasoningEffort: 'xhigh',
    }), '127.0.0.1', 64_000);
    const payload = await created!.json();

    expect(created!.status).toBe(200);
    expect(payload.data.token).toBeString();
    expect(payload.data.expiresAt).toBe(new Date(301_000).toISOString());

    const status = await runtime.handleApiRequest(new Request(`http://localhost/api/ai-connections/codex/pairings/${payload.data.id}`, {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    expect((await status!.json()).data.status).toBe('pending');

    const accepted = runtime.companion.accept(new Request(`http://localhost/api/ai-companion/connect?pairingId=${payload.data.id}&token=${payload.data.token}&origin=http%3A%2F%2Flocalhost`, {
      headers: { origin: 'http://localhost' },
    }));
    expect(accepted).toBeDefined();
    expect(runtime.companion.accept(new Request(`http://localhost/api/ai-companion/connect?pairingId=${payload.data.id}&token=${payload.data.token}&origin=http%3A%2F%2Flocalhost`))).toBeUndefined();

    const sent: string[] = [];
    runtime.companion.open(accepted!.connectionId, {
      send(value) {
        sent.push(value);
        const message = JSON.parse(value) as { type?: string; requestId?: string };
        if (message.type === 'request' && message.requestId) {
          runtime.companion.message(accepted!.connectionId, JSON.stringify({
            type: 'response',
            requestId: message.requestId,
            status: 200,
            body: { choices: [{ message: { content: '{"ok":true}' } }] },
          }));
        }
      },
      close() {},
    });
    expect(sent[0]).toContain('"type":"ready"');
    const listed = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections', {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    const connection = (await listed!.json()).data.connections[0];
    expect(connection.status).toBe('ready');
    const tested = await runtime.handleApiRequest(request(`/api/ai-connections/${connection.id}/test`, bootstrap, {}), '127.0.0.1', 64_000);
    expect(await tested!.clone().json()).toEqual(expect.objectContaining({ ok: true }));
    expect(tested!.status).toBe(200);

    now = 301_001;
    const expired = await runtime.handleApiRequest(new Request(`http://localhost/api/ai-connections/codex/pairings/${payload.data.id}`, {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    expect((await expired!.json()).data.status).toBe('expired');
  });
});

async function session(runtime: ReturnType<typeof createAiConnectionsRuntime>) {
  const response = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections'), '127.0.0.1', 64_000);
  const body = await response!.clone().json();
  return {
    cookie: response!.headers.get('set-cookie')!.split(';', 1)[0]!,
    csrf: body.data.csrfToken as string,
  };
}

function request(path: string, session: { cookie: string; csrf: string }, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: 'http://localhost', 'x-fvtt-csrf': session.csrf, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

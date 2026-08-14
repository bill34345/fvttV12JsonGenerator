import { describe, expect, it } from 'bun:test';

import { getWebSecurityConfig } from '../../security/config';
import { createAiConnectionsRuntime } from '../runtime';

describe('Codex Companion pairing', () => {
  it('cancels an unconsumed pairing without exposing its token again', async () => {
    const runtime = createAiConnectionsRuntime(getWebSecurityConfig({ FVTT_WEB_CODEX_COMPANION_ENABLED: '1' }).aiConnections);
    const bootstrap = await session(runtime);
    const created = await runtime.handleApiRequest(request('/api/ai-connections/codex/pairings', bootstrap, {}), '127.0.0.1', 64_000);
    const payload = await created!.json();
    const cancelled = await runtime.handleApiRequest(new Request(`http://localhost/api/ai-connections/codex/pairings/${payload.data.id}`, {
      method: 'DELETE',
      headers: { cookie: bootstrap.cookie, origin: 'http://localhost', 'x-fvtt-csrf': bootstrap.csrf },
    }), '127.0.0.1', 64_000);
    expect(cancelled!.status).toBe(200);
    expect((await cancelled!.json()).data).toEqual({ cancelled: true });
    const status = await runtime.handleApiRequest(new Request(`http://localhost/api/ai-connections/codex/pairings/${payload.data.id}`, {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    expect(status!.status).toBe(404);
  });

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

    const pending = runtime.companion.createPending(new Request('http://localhost/api/ai-companion/connect', {
      headers: { origin: 'http://localhost' },
    }));
    const accepted = runtime.companion.acceptPending(pending!.pendingId, JSON.stringify({
      type: 'pair', protocolVersion: 1, pairingId: payload.data.id, token: payload.data.token, origin: 'http://localhost',
    }));
    expect(accepted).toBeDefined();
    expect(runtime.companion.acceptPending(pending!.pendingId, JSON.stringify({
      type: 'pair', protocolVersion: 1, pairingId: payload.data.id, token: payload.data.token, origin: 'http://localhost',
    }))).toBeUndefined();

    const sent: string[] = [];
    runtime.companion.open(accepted!.connectionId, {
      send(value) {
        sent.push(value);
        const message = JSON.parse(value) as { type?: string; requestId?: string; connectionId?: string };
        if (message.type === 'gate' && message.connectionId) {
          runtime.companion.message(accepted!.connectionId, JSON.stringify({
            type: 'gate-result',
            protocolVersion: 1,
            connectionId: message.connectionId,
            ok: true,
          }));
        }
        if (message.type === 'request' && message.requestId) {
          runtime.companion.message(accepted!.connectionId, JSON.stringify({
            type: 'response', protocolVersion: 1,
            requestId: message.requestId,
            status: 200,
            body: { choices: [{ message: { content: '{"ok":true}' } }] },
          }));
        }
      },
      close() {},
    });
    expect(sent[0]).toContain('"type":"gate"');
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

  it('blocks a pairing when the Companion gate fails and preserves a safe diagnostic', async () => {
    const runtime = createAiConnectionsRuntime(getWebSecurityConfig({ FVTT_WEB_CODEX_COMPANION_ENABLED: '1' }).aiConnections);
    const bootstrap = await session(runtime);
    const created = await runtime.handleApiRequest(request('/api/ai-connections/codex/pairings', bootstrap, {}), '127.0.0.1', 64_000);
    const payload = await created!.json();
    const pending = runtime.companion.createPending(new Request('http://localhost/api/ai-companion/connect', {
      headers: { origin: 'http://localhost' },
    }));
    const accepted = runtime.companion.acceptPending(pending!.pendingId, JSON.stringify({
      type: 'pair', protocolVersion: 1, pairingId: payload.data.id, token: payload.data.token, origin: 'http://localhost',
    }));
    expect(accepted).toBeDefined();

    runtime.companion.open(accepted!.connectionId, {
      send(value) {
        const message = JSON.parse(value) as { type?: string; connectionId?: string };
        if (message.type === 'gate' && message.connectionId) {
          runtime.companion.message(accepted!.connectionId, JSON.stringify({
            type: 'gate-result',
            protocolVersion: 1,
            connectionId: message.connectionId,
            ok: false,
            diagnostic: 'The official Codex CLI is not logged in.',
          }));
        }
      },
      close() {},
    });

    const pairing = await runtime.handleApiRequest(new Request(`http://localhost/api/ai-connections/codex/pairings/${payload.data.id}`, {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    expect((await pairing!.json()).data).toEqual(expect.objectContaining({
      status: 'blocked',
      diagnostic: 'The official Codex CLI is not logged in.',
    }));
    const listed = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections', {
      headers: { cookie: bootstrap.cookie },
    }), '127.0.0.1', 64_000);
    expect((await listed!.json()).data.connections[0].status).toBe('blocked');
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

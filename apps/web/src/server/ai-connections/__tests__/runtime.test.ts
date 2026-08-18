import { describe, expect, it } from 'bun:test';

import { getWebSecurityConfig } from '../../security/config';
import { createAiConnectionsRuntime } from '../runtime';

describe('AI connection API runtime', () => {
  it('creates a BYOK connection without returning or logging the key', async () => {
    const config = getWebSecurityConfig({});
    const runtime = createAiConnectionsRuntime(config.aiConnections);
    const initial = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections'), '127.0.0.1', 64_000);
    const initialBody = await initial!.clone().json();
    const cookie = initial!.headers.get('set-cookie')!.split(';', 1)[0]!;
    const csrf = initialBody.data.csrfToken as string;

    const created = await runtime.handleApiRequest(stateRequest('/api/ai-connections/byok', cookie, csrf, {
      apiKey: 'sk-never-return-this',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-luna',
      reviewModel: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
    }), '127.0.0.1', 64_000);
    const text = await created!.text();
    expect(created!.status).toBe(200);
    expect(text).not.toContain('sk-never-return-this');
    expect(text).toContain('...this');

    const listed = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections', {
      headers: { cookie },
    }), '127.0.0.1', 64_000);
    const listedBody = await listed!.json();
    expect(listedBody.data.connections).toHaveLength(1);
    expect(listedBody.data.connections[0].kind).toBe('user-api-key');
  });

  it('tests BYOK with redirects disabled and never exposes Authorization', async () => {
    let redirect: RequestRedirect | undefined;
    let authorization = '';
    const config = getWebSecurityConfig({});
    const runtime = createAiConnectionsRuntime(config.aiConnections, {
      fetcher: async (_url, init) => {
        redirect = init.redirect;
        authorization = new Headers(init.headers).get('authorization') ?? '';
        return new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }] }), { status: 200 });
      },
    });
    const initial = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections'), '127.0.0.1', 64_000);
    const body = await initial!.clone().json();
    const cookie = initial!.headers.get('set-cookie')!.split(';', 1)[0]!;
    const csrf = body.data.csrfToken as string;
    const created = await runtime.handleApiRequest(stateRequest('/api/ai-connections/byok', cookie, csrf, {
      apiKey: 'sk-provider-secret', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', reviewModel: 'gpt-5.6-luna', reasoningEffort: 'xhigh',
    }), '127.0.0.1', 64_000);
    const connection = (await created!.json()).data;

    const tested = await runtime.handleApiRequest(stateRequest(`/api/ai-connections/${connection.id}/test`, cookie, csrf, {}), '127.0.0.1', 64_000);
    const testedText = await tested!.text();
    expect(tested!.status).toBe(200);
    expect(redirect).toBe('error');
    expect(authorization).toBe('Bearer sk-provider-secret');
    expect(testedText).not.toContain('sk-provider-secret');
  });

  it('rejects a BYOK connection when the selected model is not advertised', async () => {
    const config = getWebSecurityConfig({});
    const runtime = createAiConnectionsRuntime(config.aiConnections, {
      fetcher: async () => new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 }),
    });
    const initial = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections'), '127.0.0.1', 64_000);
    const body = await initial!.clone().json();
    const cookie = initial!.headers.get('set-cookie')!.split(';', 1)[0]!;
    const csrf = body.data.csrfToken as string;
    const created = await runtime.handleApiRequest(stateRequest('/api/ai-connections/byok', cookie, csrf, {
      apiKey: 'sk-provider-secret', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', reviewModel: 'gpt-5.6-luna', reasoningEffort: 'xhigh',
    }), '127.0.0.1', 64_000);
    const connection = (await created!.json()).data;
    const tested = await runtime.handleApiRequest(stateRequest(`/api/ai-connections/${connection.id}/test`, cookie, csrf, {}), '127.0.0.1', 64_000);
    expect(tested!.status).toBe(502);
    expect((await tested!.json()).error.code).toBe('AI_CONNECTION_MODEL_UNAVAILABLE');
  });

  it('blocks cross-session deletion and invalid CSRF or Origin', async () => {
    const config = getWebSecurityConfig({});
    const runtime = createAiConnectionsRuntime(config.aiConnections);
    const owner = await bootstrap(runtime);
    const created = await runtime.handleApiRequest(stateRequest('/api/ai-connections/byok', owner.cookie, owner.csrf, {
      apiKey: 'sk-owner-secret', baseUrl: 'https://api.openai.com/v1', model: 'model', reviewModel: 'model', reasoningEffort: 'high',
    }), '127.0.0.1', 64_000);
    const connection = (await created!.json()).data;
    const attacker = await bootstrap(runtime);

    const crossSession = await runtime.handleApiRequest(stateRequest(`/api/ai-connections/${connection.id}`, attacker.cookie, attacker.csrf, undefined, 'DELETE'), '127.0.0.2', 64_000);
    expect(crossSession!.status).toBe(404);

    const badCsrf = await runtime.handleApiRequest(stateRequest(`/api/ai-connections/${connection.id}`, owner.cookie, 'wrong', undefined, 'DELETE'), '127.0.0.1', 64_000);
    expect(badCsrf!.status).toBe(403);

    const badOrigin = await runtime.handleApiRequest(stateRequest(`/api/ai-connections/${connection.id}`, owner.cookie, owner.csrf, undefined, 'DELETE', 'http://evil.test'), '127.0.0.1', 64_000);
    expect(badOrigin!.status).toBe(403);
  });

  it('keeps site AI unavailable until explicitly enabled with quota', async () => {
    const runtime = createAiConnectionsRuntime(getWebSecurityConfig({}).aiConnections);
    const owner = await bootstrap(runtime);
    const response = await runtime.handleApiRequest(stateRequest('/api/ai-connections/site', owner.cookie, owner.csrf, {}), '127.0.0.1', 64_000);
    expect(response!.status).toBe(403);
  });

  it('reports a clear site-provider configuration error after quota opt-in', async () => {
    const security = getWebSecurityConfig({
      FVTT_WEB_SITE_AI_ENABLED: '1',
      FVTT_WEB_SITE_AI_SESSION_DAILY_LIMIT: '2',
      FVTT_WEB_SITE_AI_IP_DAILY_LIMIT: '4',
      FVTT_WEB_SITE_AI_GLOBAL_DAILY_LIMIT: '20',
    });
    const runtime = createAiConnectionsRuntime(security.aiConnections, { env: {} });
    const owner = await bootstrap(runtime);
    const response = await runtime.handleApiRequest(stateRequest('/api/ai-connections/site', owner.cookie, owner.csrf, {}), '127.0.0.1', 64_000);
    expect(response!.status).toBe(503);
    expect((await response!.json()).error.code).toBe('SITE_AI_MISCONFIGURED');
  });

  it('keeps Companion pairing blocked until the zero-tool gate is explicitly enabled', async () => {
    const runtime = createAiConnectionsRuntime(getWebSecurityConfig({}).aiConnections);
    const owner = await bootstrap(runtime);
    const response = await runtime.handleApiRequest(stateRequest('/api/ai-connections/codex/pairings', owner.cookie, owner.csrf, {}), '127.0.0.1', 64_000);
    expect(response!.status).toBe(503);
    expect((await response!.json()).error.code).toBe('COMPANION_BLOCKED');
  });

  it('accepts same-origin state changes through a trusted HTTPS reverse proxy', async () => {
    const security = getWebSecurityConfig({
      FVTT_WEB_PUBLIC_MODE: '1',
      FVTT_WEB_HOST: '127.0.0.1',
      FVTT_WEB_AUTH_TOKEN: '0123456789abcdef0123456789abcdef',
      FVTT_WEB_SESSION_SECRET: 'abcdef0123456789abcdef0123456789',
    });
    const runtime = createAiConnectionsRuntime(security.aiConnections);
    const initial = await runtime.handleApiRequest(new Request('http://127.0.0.1:5174/api/ai-connections', {
      headers: {
        authorization: 'Bearer 0123456789abcdef0123456789abcdef',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'example.test',
      },
    }), '127.0.0.1', 64_000);
    const body = await initial!.clone().json();
    const cookie = initial!.headers.get('set-cookie')!.split(';', 1)[0]!;
    const response = await runtime.handleApiRequest(new Request('http://127.0.0.1:5174/api/ai-connections/byok', {
      method: 'POST',
      headers: {
        authorization: 'Bearer 0123456789abcdef0123456789abcdef',
        cookie,
        origin: 'https://example.test',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'example.test',
        'x-fvtt-csrf': body.data.csrfToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiKey: 'sk-proxy', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.5', reasoningEffort: 'high' }),
    }), '127.0.0.1', 64_000);
    expect(response!.status).toBe(200);
  });
});

async function bootstrap(runtime: ReturnType<typeof createAiConnectionsRuntime>) {
  const response = await runtime.handleApiRequest(new Request('http://localhost/api/ai-connections'), '127.0.0.1', 64_000);
  const body = await response!.clone().json();
  return {
    cookie: response!.headers.get('set-cookie')!.split(';', 1)[0]!,
    csrf: body.data.csrfToken as string,
  };
}

function stateRequest(path: string, cookie: string, csrf: string, body?: unknown, method = 'POST', origin = 'http://localhost'): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { cookie, origin, 'x-fvtt-csrf': csrf, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

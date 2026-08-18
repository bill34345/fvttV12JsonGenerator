import { describe, expect, it } from 'bun:test';

import { assertAllowedProviderBaseUrl, assertStateChangingRequest, createProviderHttpClient, requestOrigin } from '../security';

describe('AI connection security', () => {
  it('allows only exact HTTPS provider origins and rejects credentials or private hosts', () => {
    const allow = ['https://api.openai.com', 'https://gateway.example.com'];
    expect(assertAllowedProviderBaseUrl('https://api.openai.com/v1', allow)).toBe('https://api.openai.com/v1');
    expect(() => assertAllowedProviderBaseUrl('https://api.openai.com/other', allow)).toThrow('/v1');
    expect(() => assertAllowedProviderBaseUrl('http://api.openai.com/v1', allow)).toThrow('HTTPS');
    expect(() => assertAllowedProviderBaseUrl('https://user:pass@api.openai.com/v1', allow)).toThrow('credentials');
    expect(() => assertAllowedProviderBaseUrl('https://127.0.0.1/v1', [...allow, 'https://127.0.0.1'])).toThrow('public');
    expect(() => assertAllowedProviderBaseUrl('https://[::ffff:127.0.0.1]/v1', [...allow, 'https://[::ffff:7f00:1]'])).toThrow('public');
    expect(() => assertAllowedProviderBaseUrl('https://api.openai.com.evil.test/v1', allow)).toThrow('allowlist');
  });

  it('validates same-origin and CSRF for state changes', () => {
    const request = new Request('https://app.example.com/api/ai-connections/byok', {
      method: 'POST',
      headers: { origin: 'https://app.example.com', 'x-fvtt-csrf': 'csrf-token' },
    });
    expect(() => assertStateChangingRequest(request, 'csrf-token')).not.toThrow();
    expect(() => assertStateChangingRequest(new Request(request, { headers: { origin: 'https://evil.example', 'x-fvtt-csrf': 'csrf-token' } }), 'csrf-token')).toThrow('Origin');
    expect(() => assertStateChangingRequest(new Request(request, { headers: { origin: 'https://app.example.com', 'x-fvtt-csrf': 'wrong' } }), 'csrf-token')).toThrow('CSRF');
  });

  it('derives the HTTPS origin from trusted reverse-proxy forwarding headers', () => {
    const request = new Request('http://127.0.0.1:5174/api/ai-connections/byok', {
      headers: {
        host: '127.0.0.1:5174',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'example.test',
      },
    });
    expect(requestOrigin(request, true)).toBe('https://example.test');
    expect(requestOrigin(request, false)).toBe('http://127.0.0.1:5174');
  });

  it('forbids redirects in provider calls', async () => {
    let seenRedirect: RequestRedirect | undefined;
    const client = createProviderHttpClient(async (_url, init) => {
      seenRedirect = init.redirect;
      return new Response('{}', { status: 200 });
    });
    await client('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: {}, body: '{}',
    });
    expect(seenRedirect).toBe('error');
  });
});

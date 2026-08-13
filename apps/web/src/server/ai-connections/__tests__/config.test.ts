import { describe, expect, it } from 'bun:test';

import { getWebSecurityConfig } from '../../security/config';

describe('Web AI connection configuration', () => {
  it('uses an in-process local secret but keeps site AI disabled by default', () => {
    const first = getWebSecurityConfig({});
    const second = getWebSecurityConfig({});
    expect(first.aiConnections.sessionSecret).toBe(second.aiConnections.sessionSecret);
    expect(Buffer.byteLength(first.aiConnections.sessionSecret, 'utf8')).toBeGreaterThanOrEqual(32);
    expect(first.aiConnections.secureCookies).toBe(false);
    expect(first.aiConnections.companionEnabled).toBe(false);
    expect(first.aiConnections.site.enabled).toBe(false);
    expect(first.aiConnections.allowedProviderOrigins).toEqual(['https://api.openai.com']);
  });

  it('requires an explicit 32-byte session secret in public mode', () => {
    const base = {
      FVTT_WEB_PUBLIC_MODE: '1',
      FVTT_WEB_HOST: '0.0.0.0',
      FVTT_WEB_AUTH_TOKEN: '0123456789abcdef0123456789abcdef',
    };
    expect(() => getWebSecurityConfig(base)).toThrow('FVTT_WEB_SESSION_SECRET');
    expect(() => getWebSecurityConfig({ ...base, FVTT_WEB_SESSION_SECRET: 'too-short' })).toThrow('32 bytes');

    const config = getWebSecurityConfig({
      ...base,
      FVTT_WEB_SESSION_SECRET: 'abcdef0123456789abcdef0123456789',
    });
    expect(config.aiConnections.secureCookies).toBe(true);
  });

  it('accepts only exact HTTPS provider allowlist origins', () => {
    const config = getWebSecurityConfig({
      FVTT_WEB_AI_PROVIDER_ALLOWLIST: 'https://gateway.example.com,https://api.openai.com',
    });
    expect(config.aiConnections.allowedProviderOrigins).toEqual([
      'https://api.openai.com',
      'https://gateway.example.com',
    ]);
    expect(() => getWebSecurityConfig({ FVTT_WEB_AI_PROVIDER_ALLOWLIST: 'http://gateway.example.com' })).toThrow('HTTPS origins');
    expect(() => getWebSecurityConfig({ FVTT_WEB_AI_PROVIDER_ALLOWLIST: 'https://gateway.example.com/v1' })).toThrow('exact HTTPS origins');
  });

  it('requires all site quotas when site AI is enabled', () => {
    expect(() => getWebSecurityConfig({ FVTT_WEB_SITE_AI_ENABLED: '1' })).toThrow('quota');
    const config = getWebSecurityConfig({
      FVTT_WEB_SITE_AI_ENABLED: '1',
      FVTT_WEB_SITE_AI_SESSION_DAILY_LIMIT: '2',
      FVTT_WEB_SITE_AI_IP_DAILY_LIMIT: '4',
      FVTT_WEB_SITE_AI_GLOBAL_DAILY_LIMIT: '20',
    });
    expect(config.aiConnections.site).toEqual(expect.objectContaining({
      enabled: true,
      perSessionDaily: 2,
      perIpDaily: 4,
      globalDaily: 20,
    }));
  });

  it('requires an explicit environment opt-in before exposing the Companion pairing endpoint', () => {
    expect(getWebSecurityConfig({ FVTT_WEB_CODEX_COMPANION_ENABLED: '1' }).aiConnections.companionEnabled).toBe(true);
  });
});

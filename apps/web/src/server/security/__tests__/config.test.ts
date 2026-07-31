import { describe, expect, it } from 'bun:test';
import { getWebSecurityConfig } from '../config';

describe('Web security configuration', () => {
  it('defaults to a loopback-only unauthenticated local service', () => {
    const config = getWebSecurityConfig({});

    expect(config).toEqual(expect.objectContaining({
      hostname: '127.0.0.1',
      publicMode: false,
      authToken: null,
      trustedProxies: [],
      maxRequestBodyBytes: 25 * 1024 * 1024,
      longJobsPerClient: 1,
      globalLongJobs: 4,
      retentionMs: 24 * 60 * 60 * 1000,
      maxRetainedJobs: 100,
    }));
  });

  it('rejects implicit non-loopback exposure', () => {
    expect(() => getWebSecurityConfig({ FVTT_WEB_HOST: '0.0.0.0' })).toThrow(
      'FVTT_WEB_PUBLIC_MODE=1',
    );
  });

  it('requires a strong server-side token for explicit public mode', () => {
    expect(() => getWebSecurityConfig({ FVTT_WEB_PUBLIC_MODE: '1' })).toThrow(
      'FVTT_WEB_AUTH_TOKEN',
    );
    expect(() => getWebSecurityConfig({
      FVTT_WEB_PUBLIC_MODE: '1',
      FVTT_WEB_AUTH_TOKEN: 'too-short',
    })).toThrow('at least 32');
  });

  it('accepts explicit authenticated public/proxied configuration', () => {
    const config = getWebSecurityConfig({
      FVTT_WEB_PUBLIC_MODE: '1',
      FVTT_WEB_HOST: '0.0.0.0',
      FVTT_WEB_AUTH_TOKEN: '0123456789abcdef0123456789abcdef',
      FVTT_WEB_TRUSTED_PROXIES: '127.0.0.1, 10.0.0.2,127.0.0.1',
    });

    expect(config.hostname).toBe('0.0.0.0');
    expect(config.publicMode).toBe(true);
    expect(config.authToken).toBe('0123456789abcdef0123456789abcdef');
    expect(config.trustedProxies).toEqual(['127.0.0.1', '10.0.0.2']);
  });
});

import { beforeEach, describe, expect, it } from 'bun:test';
import { checkShortRateLimit, getClientIp, resetRateLimitForTests } from '../rateLimit';

beforeEach(() => {
  resetRateLimitForTests();
});

describe('Web client identity', () => {
  it('uses the direct socket peer and ignores forged forwarding headers', () => {
    const request = new Request('http://localhost/api/jobs', {
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-real-ip': '198.51.100.11',
      },
    });

    expect(getClientIp(request, { remoteAddress: '203.0.113.8' })).toBe('203.0.113.8');
  });

  it('walks a configured trusted proxy chain from right to left', () => {
    const request = new Request('http://localhost/api/jobs', {
      headers: { 'x-forwarded-for': '198.51.100.10, 10.0.0.1' },
    });

    expect(getClientIp(request, {
      remoteAddress: '10.0.0.2',
      trustedProxies: ['10.0.0.1', '10.0.0.2'],
    })).toBe('198.51.100.10');
  });

  it('uses x-real-ip only as a trusted-proxy fallback', () => {
    const request = new Request('http://localhost/api/jobs', {
      headers: { 'x-real-ip': '198.51.100.12' },
    });

    expect(getClientIp(request, {
      remoteAddress: '10.0.0.2',
      trustedProxies: ['10.0.0.2'],
    })).toBe('198.51.100.12');
  });

  it('falls back conservatively for malformed chains or missing socket identity', () => {
    const malformed = new Request('http://localhost/api/jobs', {
      headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.1' },
    });

    expect(getClientIp(malformed, {
      remoteAddress: '10.0.0.2',
      trustedProxies: ['10.0.0.1', '10.0.0.2'],
    })).toBe('10.0.0.2');
    expect(getClientIp(new Request('http://localhost/api/jobs'))).toBe('shared-unknown');
  });
});

describe('Web short-request rate limits', () => {
  it('enforces a per-client window', () => {
    expect(checkShortRateLimit('client-a', { clientLimit: 2, globalLimit: 10, now: 1_000 })).toBe(true);
    expect(checkShortRateLimit('client-a', { clientLimit: 2, globalLimit: 10, now: 1_001 })).toBe(true);
    expect(checkShortRateLimit('client-a', { clientLimit: 2, globalLimit: 10, now: 1_002 })).toBe(false);
  });

  it('enforces a global window across distributed identities', () => {
    expect(checkShortRateLimit('client-a', { clientLimit: 10, globalLimit: 2, now: 2_000 })).toBe(true);
    expect(checkShortRateLimit('client-b', { clientLimit: 10, globalLimit: 2, now: 2_001 })).toBe(true);
    expect(checkShortRateLimit('client-c', { clientLimit: 10, globalLimit: 2, now: 2_002 })).toBe(false);
  });

  it('allows traffic again after the window expires', () => {
    expect(checkShortRateLimit('client-a', { clientLimit: 1, globalLimit: 1, now: 3_000 })).toBe(true);
    expect(checkShortRateLimit('client-a', { clientLimit: 1, globalLimit: 1, now: 63_001 })).toBe(true);
  });
});

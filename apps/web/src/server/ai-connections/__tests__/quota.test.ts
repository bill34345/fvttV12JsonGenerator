import { describe, expect, it } from 'bun:test';

import { SiteAiQuota } from '../quota';

describe('site AI quotas', () => {
  it('enforces per-session, per-IP, global daily and concurrent limits', () => {
    const quota = new SiteAiQuota({ perSessionDaily: 1, perIpDaily: 2, globalDaily: 3, perSessionConcurrent: 1, globalConcurrent: 2 }, () => Date.UTC(2026, 7, 13));
    const first = quota.acquire('session-a', '203.0.113.1');
    expect(() => quota.acquire('session-a', '203.0.113.1')).toThrow('concurrent');
    first.release();
    expect(() => quota.acquire('session-a', '203.0.113.1')).toThrow('session quota');
    const second = quota.acquire('session-b', '203.0.113.1');
    second.release();
    expect(() => quota.acquire('session-c', '203.0.113.1')).toThrow('IP quota');
  });
});

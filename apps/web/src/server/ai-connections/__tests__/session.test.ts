import { describe, expect, it } from 'bun:test';

import { createAnonymousSessionManager, type AnonymousSessionConfig } from '../session';

const config: AnonymousSessionConfig = {
  secret: '0123456789abcdef0123456789abcdef',
  secure: false,
  idleTtlMs: 8 * 60 * 60 * 1000,
  absoluteTtlMs: 24 * 60 * 60 * 1000,
};

describe('anonymous AI connection sessions', () => {
  it('issues an HttpOnly Strict browser-session cookie and reuses it', () => {
    let now = 1_000;
    const sessions = createAnonymousSessionManager({ ...config, now: () => now });
    const created = sessions.resolve(new Request('http://localhost/api/ai-connections'));

    expect(created.setCookie).toContain('HttpOnly');
    expect(created.setCookie).toContain('SameSite=Strict');
    expect(created.setCookie).not.toContain('Max-Age');
    expect(created.setCookie).not.toContain('Secure');

    now += 1_000;
    const reused = sessions.resolve(new Request('http://localhost/api/ai-connections', {
      headers: { cookie: created.setCookie!.split(';', 1)[0]! },
    }));
    expect(reused.session.id).toBe(created.session.id);
    expect(reused.setCookie).toBeUndefined();
  });

  it('rejects tampered cookies and expires idle or absolute sessions', () => {
    let now = 1_000;
    const sessions = createAnonymousSessionManager({ ...config, now: () => now });
    const created = sessions.resolve(new Request('http://localhost/'));
    const cookie = created.setCookie!.split(';', 1)[0]!;

    const tampered = sessions.resolve(new Request('http://localhost/', { headers: { cookie: `${cookie}x` } }));
    expect(tampered.session.id).not.toBe(created.session.id);

    now += config.idleTtlMs + 1;
    const idleExpired = sessions.resolve(new Request('http://localhost/', { headers: { cookie } }));
    expect(idleExpired.session.id).not.toBe(created.session.id);

    now = 1_000;
    const absoluteSessions = createAnonymousSessionManager({ ...config, idleTtlMs: config.absoluteTtlMs * 2, now: () => now });
    const absoluteCreated = absoluteSessions.resolve(new Request('http://localhost/'));
    now += config.absoluteTtlMs + 1;
    const absoluteExpired = absoluteSessions.resolve(new Request('http://localhost/', {
      headers: { cookie: absoluteCreated.setCookie!.split(';', 1)[0]! },
    }));
    expect(absoluteExpired.session.id).not.toBe(absoluteCreated.session.id);
  });

  it('requires Secure cookies for public mode', () => {
    expect(() => createAnonymousSessionManager({ ...config, secure: false, publicMode: true })).toThrow('Secure');
  });
});

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const AI_SESSION_COOKIE = 'fvtt_ai_session';

export interface AnonymousSessionConfig {
  secret: string;
  secure: boolean;
  publicMode?: boolean;
  idleTtlMs: number;
  absoluteTtlMs: number;
  now?: () => number;
}

export interface AnonymousSession {
  id: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
}

export interface ResolvedAnonymousSession {
  session: AnonymousSession;
  setCookie?: string;
}

export interface AnonymousSessionManager {
  resolve(request: Request): ResolvedAnonymousSession;
  get(id: string): AnonymousSession | undefined;
  delete(id: string): boolean;
  cleanup(): number;
}

export function createAnonymousSessionManager(config: AnonymousSessionConfig): AnonymousSessionManager {
  if (Buffer.byteLength(config.secret, 'utf8') < 32) {
    throw new Error('FVTT_WEB_SESSION_SECRET must contain at least 32 bytes.');
  }
  if (config.publicMode && !config.secure) {
    throw new Error('Public anonymous sessions require Secure cookies.');
  }
  const now = config.now ?? Date.now;
  const sessions = new Map<string, AnonymousSession>();

  return {
    resolve(request) {
      const currentTime = now();
      const signed = parseCookie(request.headers.get('cookie'), AI_SESSION_COOKIE);
      const id = signed ? verifySignedId(signed, config.secret) : undefined;
      const existing = id ? sessions.get(id) : undefined;
      if (existing && !isExpired(existing, currentTime, config.idleTtlMs)) {
        existing.lastSeenAt = currentTime;
        return { session: existing };
      }
      if (id) sessions.delete(id);

      const session: AnonymousSession = {
        id: randomToken(32),
        csrfToken: randomToken(32),
        createdAt: currentTime,
        lastSeenAt: currentTime,
        absoluteExpiresAt: currentTime + config.absoluteTtlMs,
      };
      sessions.set(session.id, session);
      return {
        session,
        setCookie: serializeSessionCookie(signId(session.id, config.secret), config.secure),
      };
    },
    get(id) {
      const session = sessions.get(id);
      if (!session) return undefined;
      if (isExpired(session, now(), config.idleTtlMs)) {
        sessions.delete(id);
        return undefined;
      }
      return session;
    },
    delete(id) {
      return sessions.delete(id);
    },
    cleanup() {
      const currentTime = now();
      let removed = 0;
      for (const [id, session] of sessions) {
        if (!isExpired(session, currentTime, config.idleTtlMs)) continue;
        sessions.delete(id);
        removed += 1;
      }
      return removed;
    },
  };
}

function isExpired(session: AnonymousSession, now: number, idleTtlMs: number): boolean {
  return now > session.absoluteExpiresAt || now - session.lastSeenAt > idleTtlMs;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function signId(id: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${signature}`;
}

function verifySignedId(value: string, secret: string): string | undefined {
  const separator = value.lastIndexOf('.');
  if (separator < 1) return undefined;
  const id = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), 'utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(id).digest('base64url'), 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return undefined;
  return id;
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function serializeSessionCookie(value: string, secure: boolean): string {
  return `${AI_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

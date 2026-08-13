import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

import type { HttpClient, HttpRequest } from '../../../../../packages/intake-ai/src/http';

export const DEFAULT_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_PROVIDER_ORIGIN_ALLOWLIST = ['https://api.openai.com'];

export function parseProviderOriginAllowlist(value: string | undefined): string[] {
  const configured = value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  return [...new Set([...DEFAULT_PROVIDER_ORIGIN_ALLOWLIST, ...configured].map(normalizeAllowedOrigin))];
}

export function assertAllowedProviderBaseUrl(value: string, allowedOrigins: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Provider Base URL must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Provider Base URL must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Provider Base URL cannot contain embedded credentials.');
  if (parsed.search || parsed.hash) throw new Error('Provider Base URL cannot contain a query or fragment.');
  if (isPrivateOrLocalHost(parsed.hostname)) throw new Error('Provider Base URL must use a public host.');
  const allowlist = allowedOrigins.map(normalizeAllowedOrigin);
  if (!allowlist.includes(parsed.origin)) throw new Error('Provider Base URL origin is not on the server allowlist.');
  if (parsed.origin === 'https://api.openai.com' && !['/v1', '/v1/'].includes(parsed.pathname)) {
    throw new Error('The default OpenAI provider must use the /v1 path.');
  }
  return parsed.href.replace(/\/+$/, '');
}

export function assertStateChangingRequest(request: Request, expectedToken: string, expectedOrigin = requestOrigin(request, false)): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedOrigin) throw new Error('Origin validation failed.');
  const provided = Buffer.from(request.headers.get('x-fvtt-csrf') ?? '', 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('CSRF validation failed.');
  }
}

export function requestOrigin(request: Request, trustForwardedHeaders: boolean): string {
  const direct = new URL(request.url).origin;
  if (!trustForwardedHeaders) return direct;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))?.split(',')[0]?.trim();
  if ((protocol !== 'http' && protocol !== 'https') || !host || /[\s\\/@]/u.test(host)) return direct;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return direct;
  }
}

export function createProviderHttpClient(
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): HttpClient {
  return async (url: string, init: HttpRequest) => {
    const response = await fetcher(url, {
      ...init,
      redirect: 'error',
    });
    return response;
  };
}

function normalizeAllowedOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid provider allowlist origin.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Provider allowlist entries must be exact HTTPS origins.');
  }
  if (isPrivateOrLocalHost(parsed.hostname)) throw new Error('Provider allowlist origin must use a public host.');
  return parsed.origin;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    return first === 10
      || first === 127
      || first === 0
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || first >= 224;
  }
  if (version === 6) {
    const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
    if (mapped) {
      const high = Number.parseInt(mapped[1]!, 16);
      const low = Number.parseInt(mapped[2]!, 16);
      return isPrivateIpv4([high >>> 8, high & 0xff, low >>> 8, low & 0xff]);
    }
    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized);
  }
  return false;
}

function isPrivateIpv4(parts: number[]): boolean {
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  return first === 10
    || first === 127
    || first === 0
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224;
}

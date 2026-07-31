import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

export interface WebSecurityConfig {
  hostname: string;
  port: number;
  publicMode: boolean;
  authToken: string | null;
  trustedProxies: string[];
  maxRequestBodyBytes: number;
  shortRequestsPerMinute: number;
  globalShortRequestsPerMinute: number;
  longJobsPerClient: number;
  globalLongJobs: number;
  retentionMs: number;
  maxRetainedJobs: number;
}

export type WebSecurityEnvironment = Record<string, string | undefined>;

export function getWebSecurityConfig(
  env: WebSecurityEnvironment = Bun.env,
): WebSecurityConfig {
  const hostname = env.FVTT_WEB_HOST?.trim() || '127.0.0.1';
  const publicMode = env.FVTT_WEB_PUBLIC_MODE === '1';

  if (!publicMode && !isLoopbackHostname(hostname)) {
    throw new Error(
      `Refusing non-loopback FVTT_WEB_HOST=${hostname} without FVTT_WEB_PUBLIC_MODE=1.`,
    );
  }

  const authToken = publicMode ? requirePublicAuthToken(env.FVTT_WEB_AUTH_TOKEN) : null;

  return {
    hostname,
    port: boundedInteger(env.FVTT_WEB_API_PORT, 5174, 1, 65_535, 'FVTT_WEB_API_PORT'),
    publicMode,
    authToken,
    trustedProxies: parseTrustedProxies(env.FVTT_WEB_TRUSTED_PROXIES),
    maxRequestBodyBytes: DEFAULT_MAX_REQUEST_BODY_BYTES,
    shortRequestsPerMinute: boundedInteger(
      env.FVTT_WEB_SHORT_REQUEST_LIMIT,
      10,
      1,
      10_000,
      'FVTT_WEB_SHORT_REQUEST_LIMIT',
    ),
    globalShortRequestsPerMinute: boundedInteger(
      env.FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT,
      100,
      1,
      100_000,
      'FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT',
    ),
    longJobsPerClient: boundedInteger(
      env.FVTT_WEB_LONG_JOBS_PER_CLIENT,
      1,
      1,
      100,
      'FVTT_WEB_LONG_JOBS_PER_CLIENT',
    ),
    globalLongJobs: boundedInteger(
      env.FVTT_WEB_GLOBAL_LONG_JOBS,
      4,
      1,
      1_000,
      'FVTT_WEB_GLOBAL_LONG_JOBS',
    ),
    retentionMs: boundedInteger(
      env.FVTT_WEB_JOB_RETENTION_HOURS,
      24,
      1,
      24 * 365,
      'FVTT_WEB_JOB_RETENTION_HOURS',
    ) * 60 * 60 * 1000,
    maxRetainedJobs: boundedInteger(
      env.FVTT_WEB_MAX_RETAINED_JOBS,
      100,
      1,
      100_000,
      'FVTT_WEB_MAX_RETAINED_JOBS',
    ),
  };
}

export function isAuthorizedApiRequest(request: Request, config: WebSecurityConfig): boolean {
  if (!config.publicMode) return true;
  if (!config.authToken) return false;

  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const provided = Buffer.from(header.slice(prefix.length), 'utf8');
  const expected = Buffer.from(config.authToken, 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function requirePublicAuthToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token) {
    throw new Error('FVTT_WEB_PUBLIC_MODE=1 requires FVTT_WEB_AUTH_TOKEN.');
  }
  if (token.length < 32) {
    throw new Error('FVTT_WEB_AUTH_TOKEN must contain at least 32 characters.');
  }
  return token;
}

function parseTrustedProxies(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const proxies = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const proxy of proxies) {
    if (isIP(proxy) === 0) {
      throw new Error(`FVTT_WEB_TRUSTED_PROXIES contains a non-literal IP: ${proxy}`);
    }
  }
  return [...new Set(proxies)];
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === undefined || !value.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

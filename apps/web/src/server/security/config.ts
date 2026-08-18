import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { parseProviderOriginAllowlist } from '../ai-connections/security';
import type { SiteAiQuotaConfig } from '../ai-connections/quota';

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;
const localSessionSecret = randomBytes(32).toString('base64url');

export interface WebAiConnectionsConfig {
  sessionSecret: string;
  secureCookies: boolean;
  companionEnabled: boolean;
  idleTtlMs: number;
  absoluteTtlMs: number;
  allowedProviderOrigins: string[];
  site: SiteAiQuotaConfig & { enabled: boolean };
}

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
  aiConnections: WebAiConnectionsConfig;
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
  const siteAiEnabled = env.FVTT_WEB_SITE_AI_ENABLED === '1';
  const sessionSecret = resolveSessionSecret(env.FVTT_WEB_SESSION_SECRET, publicMode);

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
    aiConnections: {
      sessionSecret,
      secureCookies: publicMode,
      companionEnabled: env.FVTT_WEB_CODEX_COMPANION_ENABLED === '1',
      idleTtlMs: 8 * 60 * 60 * 1000,
      absoluteTtlMs: 24 * 60 * 60 * 1000,
      allowedProviderOrigins: parseProviderOriginAllowlist(env.FVTT_WEB_AI_PROVIDER_ALLOWLIST),
      site: {
        enabled: siteAiEnabled,
        perSessionDaily: siteQuota(env, 'FVTT_WEB_SITE_AI_SESSION_DAILY_LIMIT', siteAiEnabled),
        perIpDaily: siteQuota(env, 'FVTT_WEB_SITE_AI_IP_DAILY_LIMIT', siteAiEnabled),
        globalDaily: siteQuota(env, 'FVTT_WEB_SITE_AI_GLOBAL_DAILY_LIMIT', siteAiEnabled),
        perSessionConcurrent: boundedInteger(
          env.FVTT_WEB_SITE_AI_SESSION_CONCURRENT_LIMIT, 1, 1, 20, 'FVTT_WEB_SITE_AI_SESSION_CONCURRENT_LIMIT',
        ),
        globalConcurrent: boundedInteger(
          env.FVTT_WEB_SITE_AI_GLOBAL_CONCURRENT_LIMIT, 4, 1, 100, 'FVTT_WEB_SITE_AI_GLOBAL_CONCURRENT_LIMIT',
        ),
      },
    },
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

function resolveSessionSecret(value: string | undefined, publicMode: boolean): string {
  const secret = value?.trim();
  if (!secret) {
    if (publicMode) throw new Error('FVTT_WEB_PUBLIC_MODE=1 requires FVTT_WEB_SESSION_SECRET.');
    return localSessionSecret;
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('FVTT_WEB_SESSION_SECRET must contain at least 32 bytes.');
  }
  return secret;
}

function siteQuota(
  env: WebSecurityEnvironment,
  name: 'FVTT_WEB_SITE_AI_SESSION_DAILY_LIMIT' | 'FVTT_WEB_SITE_AI_IP_DAILY_LIMIT' | 'FVTT_WEB_SITE_AI_GLOBAL_DAILY_LIMIT',
  required: boolean,
): number {
  const value = env[name];
  if (required && !value?.trim()) {
    throw new Error(`Site AI quota ${name} is required when FVTT_WEB_SITE_AI_ENABLED=1.`);
  }
  return boundedInteger(value, 1, 1, 1_000_000, name);
}

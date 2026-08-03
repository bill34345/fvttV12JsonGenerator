export interface MonsterIntakeConfig {
  authMode: MonsterIntakeAuthMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  reviewModel: string;
  timeoutMs: number;
  repairTimeoutMs: number;
  reasoningEffort?: MonsterIntakeReasoningEffort;
}

export type MonsterIntakeAuthMode = 'api-key' | 'codex-oauth';
export type MonsterIntakeReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The OAuth mode deliberately points at a loopback OpenAI-compatible bridge.
 * The bridge owns the Codex credentials; this package never reads or forwards
 * the OAuth token itself.
 */
export const DEFAULT_CODEX_OAUTH_BASE_URL = 'http://127.0.0.1:8787/v1';
export const DEFAULT_CODEX_OAUTH_BRIDGE_TOKEN = 'codex-oauth-local';
export const DEFAULT_CODEX_OAUTH_MODEL = 'gpt-5.6-luna';
export const DEFAULT_CODEX_OAUTH_REASONING_EFFORT: MonsterIntakeReasoningEffort = 'xhigh';
export const DEFAULT_CODEX_OAUTH_TIMEOUT_MS = 300_000;
export const DEFAULT_CODEX_OAUTH_REPAIR_TIMEOUT_MS = 300_000;

export class MonsterIntakeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MonsterIntakeConfigurationError';
  }
}

export function loadMonsterIntakeConfig(
  env: Record<string, string | undefined> = process.env,
): MonsterIntakeConfig {
  const authMode = parseAuthMode(env.MONSTER_INTAKE_AUTH_MODE);
  const apiKey = authMode === 'codex-oauth'
    ? env.MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN?.trim() || DEFAULT_CODEX_OAUTH_BRIDGE_TOKEN
    : env.MONSTER_INTAKE_API_KEY?.trim() ?? '';
  const baseUrl = authMode === 'codex-oauth'
    ? env.MONSTER_INTAKE_CODEX_OAUTH_BASE_URL?.trim() || DEFAULT_CODEX_OAUTH_BASE_URL
    : env.MONSTER_INTAKE_BASE_URL?.trim() ?? '';
  const model = env.MONSTER_INTAKE_MODEL?.trim()
    || (authMode === 'codex-oauth' ? DEFAULT_CODEX_OAUTH_MODEL : '');
  const reviewModel = env.MONSTER_INTAKE_REVIEW_MODEL?.trim() || model;
  const reasoningEffort = parseReasoningEffort(
    env.MONSTER_INTAKE_CODEX_OAUTH_REASONING_EFFORT?.trim()
      || env.MONSTER_INTAKE_REASONING_EFFORT?.trim()
      || (authMode === 'codex-oauth' ? DEFAULT_CODEX_OAUTH_REASONING_EFFORT : undefined),
  );
  const timeoutText = env.MONSTER_INTAKE_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutText
    ? Number.parseInt(timeoutText, 10)
    : authMode === 'codex-oauth' ? DEFAULT_CODEX_OAUTH_TIMEOUT_MS : 60_000;
  const repairTimeoutText = env.MONSTER_INTAKE_REPAIR_TIMEOUT_MS?.trim();
  const repairTimeoutMs = repairTimeoutText
    ? Number.parseInt(repairTimeoutText, 10)
    : authMode === 'codex-oauth'
      ? Math.max(timeoutMs, DEFAULT_CODEX_OAUTH_REPAIR_TIMEOUT_MS)
      : Math.max(timeoutMs, 180_000);

  const required = authMode === 'codex-oauth'
    ? [
      ['MONSTER_INTAKE_CODEX_OAUTH_BASE_URL', baseUrl],
    ]
    : [
      ['MONSTER_INTAKE_API_KEY', apiKey],
      ['MONSTER_INTAKE_BASE_URL', baseUrl],
      ['MONSTER_INTAKE_MODEL', model],
    ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new MonsterIntakeConfigurationError(
      `AI monster intake (${authMode}) is not configured. Missing: ${missing.join(', ')}.`,
    );
  }
  if (authMode === 'codex-oauth') assertLoopbackBaseUrl(baseUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new MonsterIntakeConfigurationError(
      'MONSTER_INTAKE_TIMEOUT_MS must be an integer from 1000 to 600000.',
    );
  }
  if (!Number.isInteger(repairTimeoutMs) || repairTimeoutMs < 1_000 || repairTimeoutMs > 600_000) {
    throw new MonsterIntakeConfigurationError(
      'MONSTER_INTAKE_REPAIR_TIMEOUT_MS must be an integer from 1000 to 600000.',
    );
  }

  return {
    authMode,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    reviewModel,
    timeoutMs,
    repairTimeoutMs,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

export function monsterIntakeConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    loadMonsterIntakeConfig(env);
    return true;
  } catch {
    return false;
  }
}

export function monsterIntakeAuthMode(
  env: Record<string, string | undefined> = process.env,
): MonsterIntakeAuthMode | undefined {
  try {
    return loadMonsterIntakeConfig(env).authMode;
  } catch {
    return undefined;
  }
}

function parseAuthMode(value: string | undefined): MonsterIntakeAuthMode {
  const normalized = value?.trim() || 'api-key';
  if (normalized === 'api-key' || normalized === 'codex-oauth') return normalized;
  throw new MonsterIntakeConfigurationError(
    `MONSTER_INTAKE_AUTH_MODE must be api-key or codex-oauth, not ${normalized}.`,
  );
}

function parseReasoningEffort(value: string | undefined): MonsterIntakeReasoningEffort | undefined {
  if (!value) return undefined;
  if (value === 'ultra') return 'xhigh';
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max') {
    return value;
  }
  throw new MonsterIntakeConfigurationError(
    `MONSTER_INTAKE reasoning effort must be low, medium, high, xhigh, max, or ultra, not ${value}.`,
  );
}

function assertLoopbackBaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MonsterIntakeConfigurationError(
      'MONSTER_INTAKE_CODEX_OAUTH_BASE_URL must be a valid http(s) URL on localhost or a loopback address.',
    );
  }

  const loopback = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
    || parsed.hostname === '::1';
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !loopback || parsed.username || parsed.password) {
    throw new MonsterIntakeConfigurationError(
      'Codex OAuth Intake must use an http(s) loopback URL without embedded credentials.',
    );
  }
}

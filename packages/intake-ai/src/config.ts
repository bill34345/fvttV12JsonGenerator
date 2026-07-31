export interface MonsterIntakeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  reviewModel: string;
  timeoutMs: number;
}

export class MonsterIntakeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MonsterIntakeConfigurationError';
  }
}

export function loadMonsterIntakeConfig(
  env: Record<string, string | undefined> = process.env,
): MonsterIntakeConfig {
  const apiKey = env.MONSTER_INTAKE_API_KEY?.trim() ?? '';
  const baseUrl = env.MONSTER_INTAKE_BASE_URL?.trim() ?? '';
  const model = env.MONSTER_INTAKE_MODEL?.trim() ?? '';
  const reviewModel = env.MONSTER_INTAKE_REVIEW_MODEL?.trim() || model;
  const timeoutText = env.MONSTER_INTAKE_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutText ? Number.parseInt(timeoutText, 10) : 60_000;

  const missing = [
    ['MONSTER_INTAKE_API_KEY', apiKey],
    ['MONSTER_INTAKE_BASE_URL', baseUrl],
    ['MONSTER_INTAKE_MODEL', model],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new MonsterIntakeConfigurationError(
      `AI monster intake is not configured. Missing: ${missing.join(', ')}.`,
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new MonsterIntakeConfigurationError(
      'MONSTER_INTAKE_TIMEOUT_MS must be an integer from 1000 to 600000.',
    );
  }

  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ''), model, reviewModel, timeoutMs };
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

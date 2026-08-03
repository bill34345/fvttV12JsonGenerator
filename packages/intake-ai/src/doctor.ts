import {
  loadMonsterIntakeConfig,
  type MonsterIntakeAuthMode,
  type MonsterIntakeConfig,
} from './config';

export interface MonsterIntakeDoctorReport {
  configured: boolean;
  authMode?: MonsterIntakeAuthMode;
  model?: string;
  baseUrl?: string;
  bridge?: {
    healthUrl: string;
    modelsUrl: string;
    reachable: boolean;
    modelAdvertised?: boolean;
    status?: number;
    message: string;
  };
  error?: string;
}

export type IntakeDoctorFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function runMonsterIntakeDoctor(
  env: Record<string, string | undefined> = process.env,
  fetcher: IntakeDoctorFetcher = fetch,
): Promise<MonsterIntakeDoctorReport> {
  let config: MonsterIntakeConfig;
  try {
    config = loadMonsterIntakeConfig(env);
  } catch (error: unknown) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const base = {
    configured: true,
    authMode: config.authMode,
    model: config.model,
    baseUrl: config.baseUrl,
  } satisfies Omit<MonsterIntakeDoctorReport, 'bridge' | 'error'>;

  if (config.authMode !== 'codex-oauth') return base;

  const healthUrl = new URL('/health', config.baseUrl).toString();
  const modelsUrl = new URL('/v1/models', config.baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 10_000));
  try {
    const response = await fetcher(healthUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ...base,
        bridge: {
          healthUrl,
          modelsUrl,
          reachable: false,
          modelAdvertised: false,
          status: response.status,
          message: `Bridge returned HTTP ${response.status}.`,
        },
      };
    }

    const modelsResponse = await fetcher(modelsUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!modelsResponse.ok) {
      return {
        ...base,
        bridge: {
          healthUrl,
          modelsUrl,
          reachable: true,
          modelAdvertised: false,
          status: modelsResponse.status,
          message: `Bridge model list returned HTTP ${modelsResponse.status}.`,
        },
      };
    }
    const modelsPayload = await modelsResponse.json() as { data?: unknown };
    const modelAdvertised = Array.isArray(modelsPayload.data)
      && modelsPayload.data.some((item) => typeof item === 'object' && item !== null && 'id' in item && item.id === config.model);
    return {
      ...base,
      bridge: {
        healthUrl,
        modelsUrl,
        reachable: true,
        modelAdvertised,
        status: modelsResponse.status,
        message: modelAdvertised
          ? 'Codex OAuth bridge is reachable and exposes the configured model.'
          : `Bridge is reachable but does not advertise configured model ${config.model}; the first Intake request will verify the alias.`,
      },
    };
  } catch (error: unknown) {
    return {
      ...base,
      bridge: {
        healthUrl,
        modelsUrl,
        reachable: false,
        modelAdvertised: false,
        message: error instanceof Error && error.name === 'AbortError'
          ? 'Codex OAuth bridge health check timed out.'
          : 'Codex OAuth bridge is not reachable.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

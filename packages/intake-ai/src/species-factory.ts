import { loadMonsterIntakeConfig, type MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import type { IntakeProviderAuditEvent } from './provider';
import { OpenAICompatibleSpeciesIntakeProvider } from './species-provider';

export interface SpeciesIntakeProviderFactoryOptions {
  env?: Record<string, string | undefined>;
  config?: MonsterIntakeConfig;
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
}
export function createSpeciesIntakeProvider(options: SpeciesIntakeProviderFactoryOptions = {}): OpenAICompatibleSpeciesIntakeProvider {
  const config = options.config ?? loadMonsterIntakeConfig(options.env);
  return new OpenAICompatibleSpeciesIntakeProvider({ ...config, ...(options.httpClient ? { httpClient: options.httpClient } : {}), ...(options.audit ? { audit: options.audit } : {}), ...(options.now ? { now: options.now } : {}) });
}

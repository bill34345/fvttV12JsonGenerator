import { loadMonsterIntakeConfig, type MonsterIntakeConfig } from './config';
import {
  OpenAICompatibleMonsterIntakeProvider,
  type IntakeProviderAuditEvent,
} from './provider';
import type { HttpClient } from './http';

export interface MonsterIntakeProviderFactoryOptions {
  env?: Record<string, string | undefined>;
  config?: MonsterIntakeConfig;
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
}

/**
 * Build the one provider used by CLI, Web, and document conversion.
 * Authentication selection belongs in config so delivery apps cannot drift.
 */
export function createMonsterIntakeProvider(
  options: MonsterIntakeProviderFactoryOptions = {},
): OpenAICompatibleMonsterIntakeProvider {
  const config = options.config ?? loadMonsterIntakeConfig(options.env);
  return new OpenAICompatibleMonsterIntakeProvider({
    ...config,
    ...(options.httpClient ? { httpClient: options.httpClient } : {}),
    ...(options.audit ? { audit: options.audit } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}

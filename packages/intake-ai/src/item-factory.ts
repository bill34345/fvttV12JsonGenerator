import { loadMonsterIntakeConfig, type MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import type { IntakeProviderAuditEvent } from './provider';
import { OpenAICompatibleItemIntakeProvider } from './item-provider';

export interface ItemIntakeProviderFactoryOptions {
  env?: Record<string, string | undefined>;
  config?: MonsterIntakeConfig;
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
}

/** Item Intake shares the existing vetted provider configuration and audit boundary. */
export function createItemIntakeProvider(options: ItemIntakeProviderFactoryOptions = {}): OpenAICompatibleItemIntakeProvider {
  const config = options.config ?? loadMonsterIntakeConfig(options.env);
  return new OpenAICompatibleItemIntakeProvider({
    ...config,
    ...(options.httpClient ? { httpClient: options.httpClient } : {}),
    ...(options.audit ? { audit: options.audit } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}

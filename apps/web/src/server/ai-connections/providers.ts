import {
  createItemIntakeProvider,
  createMonsterIntakeProvider,
  loadMonsterIntakeConfig,
  type IntakeProviderAuditEvent,
  type ItemIntakeAiProvider,
  type MonsterIntakeAiProvider,
  type MonsterIntakeConfig,
} from '@fvtt-json-generator/intake-ai';
import type { HttpClient } from '../../../../../packages/intake-ai/src/http';

import { createProviderHttpClient } from './security';
import type { ResolvedAiConnection } from './types';

export interface IntakeProviders {
  monsterIntakeProvider: MonsterIntakeAiProvider;
  itemIntakeProvider: ItemIntakeAiProvider;
}

export function createIntakeProvidersForConnection(
  connection: ResolvedAiConnection,
  options: {
    env?: Record<string, string | undefined>;
    audit?: (event: IntakeProviderAuditEvent) => void;
    fetcher?: (url: string, init: RequestInit) => Promise<Response>;
    companion?: HttpClient;
  } = {},
): IntakeProviders {
  const config = connection.kind === 'site'
    ? siteConfig(options.env ?? Bun.env, connection)
    : connection.kind === 'user-api-key'
      ? byokConfig(connection)
      : localCodexConfig(connection);
  const httpClient = connection.kind === 'local-codex'
    ? options.companion ?? (() => { throw new Error(connection.diagnostic ?? 'Local Codex Companion is offline.'); })()
    : createProviderHttpClient(options.fetcher);
  return {
    monsterIntakeProvider: createMonsterIntakeProvider({ config, httpClient, audit: options.audit }),
    itemIntakeProvider: createItemIntakeProvider({ config, httpClient, audit: options.audit }),
  };
}

function siteConfig(env: Record<string, string | undefined>, connection: ResolvedAiConnection): MonsterIntakeConfig {
  const config = loadMonsterIntakeConfig(env);
  if (config.authMode !== 'api-key') throw new Error('Site AI must use a server-side API key provider.');
  return {
    ...config,
    model: connection.model,
    reviewModel: connection.reviewModel,
    reasoningEffort: connection.reasoningEffort,
  };
}

function byokConfig(connection: ResolvedAiConnection): MonsterIntakeConfig {
  if (!connection.apiKey || !connection.baseUrl) throw new Error('BYOK connection secret is unavailable.');
  return {
    authMode: 'api-key',
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    model: connection.model,
    reviewModel: connection.reviewModel,
    reasoningEffort: connection.reasoningEffort,
    timeoutMs: 60_000,
    repairTimeoutMs: 180_000,
  };
}

function localCodexConfig(connection: ResolvedAiConnection): MonsterIntakeConfig {
  if (!connection.companionId) throw new Error(connection.diagnostic ?? 'Local Codex Companion is offline.');
  return {
    authMode: 'api-key',
    apiKey: 'companion-local',
    baseUrl: 'https://companion.invalid/v1',
    model: connection.model,
    reviewModel: connection.reviewModel,
    reasoningEffort: connection.reasoningEffort,
    timeoutMs: 300_000,
    repairTimeoutMs: 300_000,
  };
}

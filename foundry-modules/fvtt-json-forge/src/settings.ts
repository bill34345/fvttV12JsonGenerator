import {
  getForgeProviderPreset,
  inferForgeProviderId,
  normalizeBaseUrlIdentity,
  type ForgeProviderAuthScheme,
  type ForgeProviderId,
  type ForgeProviderProtocol,
  type ForgeProviderReasoning,
  type ForgeStructuredOutputMode,
} from '@fvtt-json-generator/forge-browser-runtime/provider-connections';

export const CLIENT_STORAGE_KEY = 'fvtt-json-forge.client-settings';

export interface ForgeClientSettings {
  providerId: ForgeProviderId;
  protocol: ForgeProviderProtocol;
  authScheme: ForgeProviderAuthScheme;
  region: string;
  reasoning: ForgeProviderReasoning;
  structuredOutput: ForgeStructuredOutputMode;
  useSeparateReviewModel: boolean;
  endpoint: string;
  model: string;
  reviewModel: string;
  apiKey: string;
  persistApiKey: boolean;
  savedApiKeys: Record<string, string>;
}

export const DEFAULT_CLIENT_SETTINGS: Readonly<ForgeClientSettings> = Object.freeze({
  providerId: 'openai',
  protocol: 'openai-responses',
  authScheme: 'bearer',
  region: '',
  reasoning: 'auto',
  structuredOutput: 'json_schema',
  useSeparateReviewModel: false,
  endpoint: '',
  model: '',
  reviewModel: '',
  apiKey: '',
  persistApiKey: false,
  savedApiKeys: {},
});

export function readClientSettings(storage: Storage | undefined = browserStorage()): ForgeClientSettings {
  if (!storage) return { ...DEFAULT_CLIENT_SETTINGS };
  try {
    const raw = storage.getItem(CLIENT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CLIENT_SETTINGS };
    const value = JSON.parse(raw) as Record<string, unknown>;
    return normalizeSettings(value);
  } catch {
    return { ...DEFAULT_CLIENT_SETTINGS };
  }
}

export function saveClientSettings(
  value: Partial<ForgeClientSettings>,
  storage: Storage | undefined = browserStorage(),
): ForgeClientSettings {
  const current = storage ? readClientSettings(storage) : { ...DEFAULT_CLIENT_SETTINGS };
  const normalized = normalizeSettings({ ...current, ...value, savedApiKeys: current.savedApiKeys });
  if (value.persistApiKey === false) {
    normalized.persistApiKey = false;
    normalized.apiKey = typeof value.apiKey === 'string' ? value.apiKey : '';
  }
  const result: ForgeClientSettings = {
    ...normalized,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : normalized.apiKey,
  };
  const profileId = clientSettingsProfileId(result);
  const savedApiKeys = { ...normalized.savedApiKeys };
  if (result.persistApiKey && result.apiKey) savedApiKeys[profileId] = result.apiKey;
  else delete savedApiKeys[profileId];
  result.savedApiKeys = savedApiKeys;
  if (storage) {
    storage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({
      ...result,
      apiKey: result.persistApiKey ? result.apiKey : '',
      savedApiKeys,
    }));
  }
  return result;
}

export function clearApiKey(storage: Storage | undefined = browserStorage()): ForgeClientSettings {
  const current = readClientSettings(storage);
  return saveClientSettings({ ...current, apiKey: '', persistApiKey: false }, storage);
}

export function clearAllApiKeys(storage: Storage | undefined = browserStorage()): ForgeClientSettings {
  const current = readClientSettings(storage);
  const cleared = { ...current, apiKey: '', persistApiKey: false, savedApiKeys: {} };
  if (storage) storage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({ ...cleared, apiKey: '' }));
  return cleared;
}

export function clientSettingsProfileId(value: Pick<ForgeClientSettings, 'providerId' | 'region' | 'endpoint' | 'protocol'>): string {
  return [value.providerId, value.region, normalizeBaseUrlIdentity(value.endpoint), value.protocol].join('|');
}

export function normalizeSettings(value: unknown): ForgeClientSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim() : DEFAULT_CLIENT_SETTINGS.endpoint;
  const providerId = isProviderId(record.providerId)
    ? record.providerId
    : endpoint ? inferForgeProviderId(endpoint) : DEFAULT_CLIENT_SETTINGS.providerId;
  const preset = getForgeProviderPreset(providerId);
  const protocol = isProviderProtocol(record.protocol) && preset.protocols.includes(record.protocol)
    ? record.protocol
    : preset.defaultProtocol;
  const savedApiKeys = asStringRecord(record.savedApiKeys);
  const profileId = clientSettingsProfileId({ providerId, region: typeof record.region === 'string' ? record.region.trim() : '', endpoint, protocol });
  const persistedKey = typeof savedApiKeys[profileId] === 'string' ? savedApiKeys[profileId] : undefined;
  const persistApiKey = record.persistApiKey === true || persistedKey !== undefined;
  return {
    providerId,
    protocol,
    authScheme: isAuthScheme(record.authScheme) && preset.authSchemes.includes(record.authScheme) ? record.authScheme : (preset.authSchemes[0] ?? 'bearer'),
    region: typeof record.region === 'string' ? record.region.trim() : DEFAULT_CLIENT_SETTINGS.region,
    reasoning: isReasoning(record.reasoning) ? record.reasoning : DEFAULT_CLIENT_SETTINGS.reasoning,
    structuredOutput: isStructuredOutput(record.structuredOutput) ? record.structuredOutput : DEFAULT_CLIENT_SETTINGS.structuredOutput,
    useSeparateReviewModel: record.useSeparateReviewModel === true,
    endpoint,
    model: typeof record.model === 'string' ? record.model.trim() : DEFAULT_CLIENT_SETTINGS.model,
    reviewModel: typeof record.reviewModel === 'string' ? record.reviewModel.trim() : DEFAULT_CLIENT_SETTINGS.reviewModel,
    apiKey: record.persistApiKey === true && typeof record.apiKey === 'string'
      ? record.apiKey
      : persistedKey ?? DEFAULT_CLIENT_SETTINGS.apiKey,
    persistApiKey,
    savedApiKeys,
  };
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => typeof entry === 'string')) as Record<string, string>;
}

function isProviderId(value: unknown): value is ForgeProviderId {
  return typeof value === 'string' && ['openai', 'anthropic', 'google-gemini', 'deepseek', 'xai', 'mistral', 'openrouter', 'alibaba-qwen', 'moonshot-kimi', 'zhipu-glm', 'custom'].includes(value);
}
function isProviderProtocol(value: unknown): value is ForgeProviderProtocol {
  return value === 'openai-chat' || value === 'openai-responses' || value === 'anthropic-messages';
}
function isAuthScheme(value: unknown): value is ForgeProviderAuthScheme {
  return value === 'bearer' || value === 'x-api-key' || value === 'api-key' || value === 'none';
}
function isReasoning(value: unknown): value is ForgeProviderReasoning {
  return value === 'auto' || value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max' || value === 'adaptive';
}
function isStructuredOutput(value: unknown): value is ForgeStructuredOutputMode {
  return value === 'json_schema' || value === 'json_object' || value === 'provider_schema' || value === 'prompt_fallback';
}

function browserStorage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

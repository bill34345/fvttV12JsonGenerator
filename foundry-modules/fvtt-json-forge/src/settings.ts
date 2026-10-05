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

/**
 * The settings window and the Actor/Item/Intake windows share one in-page
 * session.  This is deliberately separate from client storage: a key that
 * the user did not explicitly persist must remain usable while this Foundry
 * page is open, but must disappear after a refresh.
 */
let forgeSessionSettings: ForgeClientSettings | undefined;
let forgeSessionStorage: Storage | undefined;
let forgeSessionTestedIdentity: string | undefined;
const forgeSessionListeners = new Set<() => void>();

export function readForgeSessionSettings(): ForgeClientSettings {
  const storage = browserStorage();
  if (!forgeSessionSettings || forgeSessionStorage !== storage) {
    forgeSessionSettings = cloneSettings(readClientSettings(storage));
    forgeSessionStorage = storage;
    forgeSessionTestedIdentity = undefined;
  }
  return cloneSettings(forgeSessionSettings);
}

/**
 * Save the current page configuration and update the shared in-memory
 * session.  The existing client-storage writer still owns persistence and
 * therefore keeps the API key out of storage unless persistApiKey is true.
 * A profile change clears the old transient key and loads only the matching
 * explicitly-saved profile key, if one exists.
 */
export function saveForgeSessionSettings(value: Partial<ForgeClientSettings>): ForgeClientSettings {
  const current = readForgeSessionSettings();
  const nextInput = buildSessionSettingsInput(current, value);
  const next = saveClientSettings(nextInput, forgeSessionStorage);
  const previousIdentity = forgeConnectionIdentity(current);
  const nextIdentity = forgeConnectionIdentity(next);
  forgeSessionSettings = cloneSettings(next);
  if (previousIdentity !== nextIdentity) forgeSessionTestedIdentity = undefined;
  notifyForgeSessionListeners();
  return cloneSettings(next);
}

export function subscribeForgeSessionSettings(listener: () => void): () => void {
  forgeSessionListeners.add(listener);
  return () => { forgeSessionListeners.delete(listener); };
}

export function isForgeSessionConnectionReady(): boolean {
  const current = readForgeSessionSettings();
  return forgeSessionTestedIdentity === forgeConnectionIdentity(current);
}

/** Mark the exact current session connection as having passed its probe. */
export function markForgeSessionConnectionTested(): void {
  forgeSessionTestedIdentity = forgeConnectionIdentity(readForgeSessionSettings());
  notifyForgeSessionListeners();
}

/** Clear a previous probe before retrying the same connection. */
export function invalidateForgeSessionConnectionTest(): void {
  forgeSessionTestedIdentity = undefined;
  notifyForgeSessionListeners();
}

/** Clear every persisted profile key while keeping the current page session in sync. */
export function clearAllForgeSessionApiKeys(): ForgeClientSettings {
  const current = readForgeSessionSettings();
  const cleared = clearAllApiKeys(forgeSessionStorage);
  forgeSessionSettings = cloneSettings({ ...current, ...cleared, savedApiKeys: {} });
  forgeSessionTestedIdentity = undefined;
  notifyForgeSessionListeners();
  return cloneSettings(forgeSessionSettings);
}

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

/** Local Lab uses DS Flash; never carry another provider's credential to its endpoint. */
export function readLocalIntakeSettings(hostname:string,storage:Storage|undefined=browserStorage()):ForgeClientSettings{
  const existing=readClientSettings(storage);
  if(!['127.0.0.1','localhost','[::1]'].includes(hostname))return existing;
  let isDeepSeek=false;try{isDeepSeek=new URL(existing.endpoint).origin==='https://api.deepseek.com';}catch{}
  return {...existing,providerId:'deepseek',endpoint:'https://api.deepseek.com',model:'deepseek-flash',reviewModel:'deepseek-flash',
    protocol:'openai-responses',authScheme:'bearer',structuredOutput:'json_object',reasoning:'low',useSeparateReviewModel:false,
    apiKey:isDeepSeek?existing.apiKey:'',persistApiKey:false};
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

function buildSessionSettingsInput(
  current: ForgeClientSettings,
  value: Partial<ForgeClientSettings>,
): Partial<ForgeClientSettings> {
  const providerChanged = typeof value.providerId === 'string' && value.providerId !== current.providerId;
  const providerId = value.providerId ?? current.providerId;
  const preset = getForgeProviderPreset(providerId);
  const profileChanged = providerChanged
    || (typeof value.endpoint === 'string' && value.endpoint.trim() !== current.endpoint.trim())
    || (typeof value.protocol === 'string' && value.protocol !== current.protocol)
    || (typeof value.region === 'string' && value.region.trim() !== current.region.trim());

  const next: Partial<ForgeClientSettings> = {
    ...current,
    ...value,
    // savedApiKeys is an append-only profile map owned by saveClientSettings;
    // callers cannot replace the map through the session facade.
    savedApiKeys: current.savedApiKeys,
  };

  // Changing Provider in the UI should select that provider's endpoint and
  // protocol unless the caller explicitly supplied a custom value. Keeping a
  // previous provider's endpoint would produce a misleading mixed profile.
  if (providerChanged && value.endpoint === undefined) next.endpoint = preset.defaultBaseUrl;
  if (providerChanged && value.protocol === undefined) next.protocol = preset.defaultProtocol;
  if (providerChanged && value.authScheme === undefined) next.authScheme = preset.authSchemes[0] ?? 'bearer';
  if (providerChanged && value.region === undefined) next.region = preset.regions?.[0]?.id ?? '';

  if (profileChanged && (value.apiKey === undefined || value.apiKey === current.apiKey)) {
    const targetProfile = clientSettingsProfileId({
      providerId: next.providerId as ForgeProviderId,
      region: String(next.region ?? ''),
      endpoint: String(next.endpoint ?? ''),
      protocol: next.protocol as ForgeProviderProtocol,
    });
    const savedKey = current.savedApiKeys[targetProfile] ?? '';
    next.apiKey = savedKey;
    // A key loaded from an explicit profile is persisted by definition. If no
    // matching profile exists, keep the current opt-in state but with an empty
    // key so it can never leak across connections.
    if (savedKey) next.persistApiKey = true;
    else next.persistApiKey = value.persistApiKey === true || current.persistApiKey === true;
  }

  return next;
}

function forgeConnectionIdentity(value: ForgeClientSettings): string {
  return JSON.stringify({
    providerId: value.providerId,
    protocol: value.protocol,
    authScheme: value.authScheme,
    region: value.region,
    reasoning: value.reasoning,
    structuredOutput: value.structuredOutput,
    useSeparateReviewModel: value.useSeparateReviewModel,
    endpoint: normalizeBaseUrlIdentity(value.endpoint),
    model: value.model,
    reviewModel: value.reviewModel,
    apiKey: value.apiKey,
  });
}

function cloneSettings(value: ForgeClientSettings): ForgeClientSettings {
  return { ...value, savedApiKeys: { ...value.savedApiKeys } };
}

function notifyForgeSessionListeners(): void {
  for (const listener of [...forgeSessionListeners]) {
    try { listener(); } catch { /* one stale UI subscriber must not break saving */ }
  }
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

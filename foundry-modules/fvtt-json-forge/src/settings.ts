export const CLIENT_STORAGE_KEY = 'fvtt-json-forge.client-settings';

export interface ForgeClientSettings {
  endpoint: string;
  model: string;
  reviewModel: string;
  apiKey: string;
  persistApiKey: boolean;
}

export const DEFAULT_CLIENT_SETTINGS: Readonly<ForgeClientSettings> = Object.freeze({
  endpoint: '',
  model: '',
  reviewModel: '',
  apiKey: '',
  persistApiKey: false,
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
  const normalized = normalizeSettings(value);
  const result: ForgeClientSettings = {
    ...normalized,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : normalized.apiKey,
  };
  if (storage) {
    storage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({
      ...result,
      apiKey: result.persistApiKey ? result.apiKey : '',
    }));
  }
  return result;
}

export function clearApiKey(storage: Storage | undefined = browserStorage()): ForgeClientSettings {
  const current = readClientSettings(storage);
  return saveClientSettings({ ...current, apiKey: '', persistApiKey: false }, storage);
}

export function normalizeSettings(value: unknown): ForgeClientSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    endpoint: typeof record.endpoint === 'string' ? record.endpoint.trim() : DEFAULT_CLIENT_SETTINGS.endpoint,
    model: typeof record.model === 'string' ? record.model.trim() : DEFAULT_CLIENT_SETTINGS.model,
    reviewModel: typeof record.reviewModel === 'string' ? record.reviewModel.trim() : DEFAULT_CLIENT_SETTINGS.reviewModel,
    apiKey: record.persistApiKey === true && typeof record.apiKey === 'string' ? record.apiKey : DEFAULT_CLIENT_SETTINGS.apiKey,
    persistApiKey: record.persistApiKey === true,
  };
}

function browserStorage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

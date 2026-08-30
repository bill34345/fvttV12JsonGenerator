import {
  buildEndpointUrl,
  buildHeaders,
  requestIntakeProvider,
  type IntakeAuthScheme,
  type IntakeReasoning,
  type IntakeStructuredOutputMode,
  type IntakeTransportProtocol,
  type IntakeTransportRequest,
  type NormalizedIntakeProviderResult,
} from '@fvtt-json-generator/intake-ai/transport';

export type ForgeProviderId =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'deepseek'
  | 'xai'
  | 'mistral'
  | 'openrouter'
  | 'alibaba-qwen'
  | 'moonshot-kimi'
  | 'zhipu-glm'
  | 'custom';

export type ForgeProviderProtocol = IntakeTransportProtocol;
export type ForgeProviderAuthScheme = IntakeAuthScheme;
export type ForgeProviderReasoning = IntakeReasoning;
export type ForgeStructuredOutputMode = IntakeStructuredOutputMode;

export interface ForgeProviderPreset {
  id: ForgeProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultProtocol: ForgeProviderProtocol;
  protocols: readonly ForgeProviderProtocol[];
  authSchemes: readonly ForgeProviderAuthScheme[];
  modelDiscoveryPath?: string;
  docsUrl?: string;
  recommendedModels: readonly string[];
  regions?: readonly { id: string; label: string; baseUrl: string }[];
}

export interface ForgeProviderCapabilities {
  providerId: ForgeProviderId;
  protocol: ForgeProviderProtocol;
  model: string;
  structuredOutput: readonly ForgeStructuredOutputMode[];
  reasoning: readonly ForgeProviderReasoning[];
  supportsIndependentReviewModel: boolean;
}

export interface ForgeProviderConnectionInput {
  providerId?: ForgeProviderId;
  baseUrl?: string;
  protocol?: ForgeProviderProtocol;
  authScheme?: ForgeProviderAuthScheme;
  region?: string;
  model?: string;
  reviewModel?: string;
  useSeparateReviewModel?: boolean;
  reasoning?: ForgeProviderReasoning;
  structuredOutput?: ForgeStructuredOutputMode;
  apiKey?: string;
}

export interface ForgeProviderConnection {
  providerId: ForgeProviderId;
  baseUrl: string;
  protocol: ForgeProviderProtocol;
  authScheme: ForgeProviderAuthScheme;
  region: string;
  model: string;
  reviewModel: string;
  useSeparateReviewModel: boolean;
  reasoning: ForgeProviderReasoning;
  structuredOutput: ForgeStructuredOutputMode;
  apiKey: string;
  customized: boolean;
  endpointIdentity: string;
  capabilities: ForgeProviderCapabilities;
}

export const FORGE_PROVIDER_PRESETS: readonly ForgeProviderPreset[] = [
  {
    id: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultProtocol: 'openai-responses',
    protocols: ['openai-responses', 'openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://platform.openai.com/docs', recommendedModels: ['gpt-4.1-mini', 'gpt-4.1'],
  },
  {
    id: 'anthropic', label: 'Anthropic (Claude)', defaultBaseUrl: 'https://api.anthropic.com', defaultProtocol: 'anthropic-messages',
    protocols: ['anthropic-messages'], authSchemes: ['x-api-key'], modelDiscoveryPath: 'v1/models',
    docsUrl: 'https://docs.anthropic.com/en/docs', recommendedModels: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  {
    id: 'google-gemini', label: 'Google Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai', recommendedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com', defaultProtocol: 'openai-responses',
    protocols: ['openai-responses', 'openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://api-docs.deepseek.com', recommendedModels: ['deepseek-v4-flash'],
  },
  {
    id: 'xai', label: 'xAI (Grok)', defaultBaseUrl: 'https://api.x.ai/v1', defaultProtocol: 'openai-responses',
    protocols: ['openai-responses', 'openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://docs.x.ai', recommendedModels: ['grok-4', 'grok-3-mini'],
  },
  {
    id: 'mistral', label: 'Mistral', defaultBaseUrl: 'https://api.mistral.ai/v1', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://docs.mistral.ai', recommendedModels: ['mistral-small-latest', 'mistral-large-latest'],
  },
  {
    id: 'openrouter', label: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat', 'openai-responses'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://openrouter.ai/docs', recommendedModels: ['openai/gpt-4.1-mini', 'google/gemini-2.5-flash'],
  },
  {
    id: 'alibaba-qwen', label: 'Alibaba Qwen', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat', 'openai-responses'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio', recommendedModels: ['qwen-plus', 'qwen-turbo'],
    regions: [
      { id: 'cn', label: 'China (Beijing)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { id: 'intl', label: 'International (Singapore)', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
    ],
  },
  {
    id: 'moonshot-kimi', label: 'Moonshot / Kimi', defaultBaseUrl: 'https://api.moonshot.ai/v1', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://platform.moonshot.ai/docs', recommendedModels: ['kimi-k2-0905-preview', 'moonshot-v1-8k'],
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.moonshot.ai/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.moonshot.cn/v1' },
    ],
  },
  {
    id: 'zhipu-glm', label: 'Zhipu GLM', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat'], authSchemes: ['bearer'], modelDiscoveryPath: 'models',
    docsUrl: 'https://open.bigmodel.cn/dev/api', recommendedModels: ['glm-4.5-flash', 'glm-4.5'],
  },
  {
    id: 'custom', label: 'Custom Provider', defaultBaseUrl: '', defaultProtocol: 'openai-chat',
    protocols: ['openai-chat', 'openai-responses', 'anthropic-messages'], authSchemes: ['bearer', 'x-api-key', 'api-key', 'none'],
    modelDiscoveryPath: 'models', recommendedModels: [],
  },
];

export const FORGE_PROVIDER_CAPABILITY_REGISTRY: readonly {
  providerId: ForgeProviderId;
  protocol: ForgeProviderProtocol;
  model: RegExp;
  reasoning: readonly ForgeProviderReasoning[];
  structuredOutput: readonly ForgeStructuredOutputMode[];
}[] = [
  { providerId: 'openai', protocol: 'openai-responses', model: /^.+$/u, reasoning: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'], structuredOutput: ['json_schema', 'json_object', 'prompt_fallback'] },
  { providerId: 'openai', protocol: 'openai-chat', model: /^o[1345]/iu, reasoning: ['auto', 'low', 'medium', 'high'], structuredOutput: ['json_schema', 'json_object', 'prompt_fallback'] },
  { providerId: 'xai', protocol: 'openai-responses', model: /^grok-/iu, reasoning: ['auto', 'low', 'medium', 'high'], structuredOutput: ['json_schema', 'json_object', 'prompt_fallback'] },
  { providerId: 'openrouter', protocol: 'openai-responses', model: /^openai\//iu, reasoning: ['auto', 'low', 'medium', 'high'], structuredOutput: ['json_schema', 'json_object', 'prompt_fallback'] },
  { providerId: 'deepseek', protocol: 'openai-responses', model: /^deepseek-v4-flash$/iu, reasoning: ['auto', 'low', 'high', 'max'], structuredOutput: ['json_object', 'prompt_fallback'] },
  { providerId: 'deepseek', protocol: 'openai-chat', model: /^deepseek-v4-flash$/iu, reasoning: ['auto', 'low', 'high', 'max'], structuredOutput: ['json_object', 'prompt_fallback'] },
  { providerId: 'anthropic', protocol: 'anthropic-messages', model: /^claude-/iu, reasoning: ['auto', 'adaptive', 'low', 'medium', 'high'], structuredOutput: ['prompt_fallback'] },
];

export type ForgeProviderConnectionStatus =
  | 'connected'
  | 'configuration'
  | 'authentication'
  | 'model_list'
  | 'protocol'
  | 'structured_output'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'browser_transport';

export interface ForgeProviderModelDiscoveryResult {
  status: 'connected' | Exclude<ForgeProviderConnectionStatus, 'connected' | 'structured_output'>;
  models: string[];
  message: string;
}

export interface ForgeProviderProbeResult {
  status: ForgeProviderConnectionStatus;
  providerId: ForgeProviderId;
  protocol: ForgeProviderProtocol;
  model: string;
  models: string[];
  capabilities: ForgeProviderCapabilities;
  message: string;
}

export interface ForgeProviderFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type ForgeProviderFetch = (url: string, init: {
  method: 'GET';
  headers: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<ForgeProviderFetchResponse>;

export function listForgeProviderPresets(): readonly ForgeProviderPreset[] {
  return FORGE_PROVIDER_PRESETS;
}

export function getForgeProviderPreset(id: ForgeProviderId): ForgeProviderPreset {
  return FORGE_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? FORGE_PROVIDER_PRESETS.at(-1)!;
}

export function inferForgeProviderId(baseUrl: string): ForgeProviderId {
  const normalized = normalizeBaseUrlIdentity(baseUrl);
  return FORGE_PROVIDER_PRESETS.find((preset) => preset.id !== 'custom' && normalizeBaseUrlIdentity(preset.defaultBaseUrl) === normalized)?.id ?? 'custom';
}

export function resolveForgeProviderCapabilities(
  providerId: ForgeProviderId,
  protocol: ForgeProviderProtocol,
  model: string,
): ForgeProviderCapabilities {
  const preset = getForgeProviderPreset(providerId);
  const registry = FORGE_PROVIDER_CAPABILITY_REGISTRY.find((entry) => (
    entry.providerId === providerId && entry.protocol === protocol && entry.model.test(model)
  ));
  if (registry) {
    return {
      providerId,
      protocol,
      model,
      structuredOutput: registry.structuredOutput,
      reasoning: registry.reasoning,
      supportsIndependentReviewModel: true,
    };
  }
  if (protocol === 'anthropic-messages') {
    return {
      providerId,
      protocol,
      model,
      structuredOutput: ['prompt_fallback'],
      reasoning: providerId === 'custom' ? ['auto'] : ['auto', 'adaptive', 'low', 'medium', 'high'],
      supportsIndependentReviewModel: true,
    };
  }
  return {
    providerId,
    protocol,
    model,
    structuredOutput: protocol === 'openai-responses' && providerId === 'custom'
      ? ['prompt_fallback']
      : ['json_schema', 'json_object', 'prompt_fallback'],
    // `auto` is a UI-safe no-op for unknown models. Other values are hidden
    // until a registry entry explicitly proves support.
    reasoning: ['auto'],
    supportsIndependentReviewModel: preset.protocols.length > 0,
  };
}

export function normalizeForgeProviderConnection(input: ForgeProviderConnectionInput): ForgeProviderConnection {
  const providerId = input.providerId ?? (input.baseUrl ? inferForgeProviderId(input.baseUrl) : 'openai');
  const preset = getForgeProviderPreset(providerId);
  const requestedBaseUrl = (input.baseUrl?.trim() || preset.defaultBaseUrl).replace(/\/+$/u, '');
  assertSecureProviderUrl(requestedBaseUrl);
  // Query strings and fragments are not part of a provider base URL. Drop
  // them before a request so a pasted URL secret can never be forwarded or
  // appear in a review projection; URL credentials remain a hard error.
  const baseUrl = stripProviderUrlSecretComponents(requestedBaseUrl);
  const protocol = input.protocol ?? preset.defaultProtocol;
  if (!preset.protocols.includes(protocol)) throw new Error(`Provider ${preset.label} does not support ${protocol}.`);
  const authScheme = input.authScheme ?? preset.authSchemes[0] ?? 'bearer';
  if (!preset.authSchemes.includes(authScheme)) throw new Error(`Provider ${preset.label} does not support the selected authentication scheme.`);
  const region = input.region?.trim() || preset.regions?.[0]?.id || '';
  const regionEntry = preset.regions?.find((entry) => entry.id === region);
  const regionalBaseUrl = regionEntry && !input.baseUrl ? regionEntry.baseUrl : baseUrl;
  const model = input.model?.trim() || preset.recommendedModels[0] || '';
  const capabilities = resolveForgeProviderCapabilities(providerId, protocol, model);
  const reasoning = input.reasoning ?? 'auto';
  if (!capabilities.reasoning.includes(reasoning)) throw new Error('The selected reasoning option is not supported by this provider/model combination.');
  const structuredOutput = input.structuredOutput ?? capabilities.structuredOutput[0] ?? 'prompt_fallback';
  if (!capabilities.structuredOutput.includes(structuredOutput)) throw new Error('The selected structured-output mode is not supported by this provider/model combination.');
  const useSeparateReviewModel = input.useSeparateReviewModel === true;
  const reviewModel = useSeparateReviewModel ? (input.reviewModel?.trim() || model) : model;
  return {
    providerId,
    baseUrl: regionalBaseUrl.replace(/\/+$/u, ''),
    protocol,
    authScheme,
    region,
    model,
    reviewModel,
    useSeparateReviewModel,
    reasoning,
    structuredOutput,
    apiKey: input.apiKey ?? '',
    customized: providerId === 'custom' || normalizeBaseUrlIdentity(regionalBaseUrl) !== normalizeBaseUrlIdentity(preset.defaultBaseUrl),
    endpointIdentity: normalizeBaseUrlIdentity(regionalBaseUrl),
    capabilities,
  };
}

export function providerConnectionTransportOptions(connection: ForgeProviderConnection): Pick<IntakeTransportRequest, 'protocol' | 'authScheme' | 'reasoning' | 'structuredOutput' | 'stream'> {
  return {
    protocol: connection.protocol,
    authScheme: connection.authScheme,
    reasoning: connection.reasoning,
    structuredOutput: { mode: connection.structuredOutput, name: 'forge_intake_v1' },
    ...(connection.protocol === 'openai-responses' ? { stream: true } : {}),
  };
}

export async function discoverForgeProviderModels(
  connection: ForgeProviderConnection,
  options: { fetch?: ForgeProviderFetch; signal?: AbortSignal } = {},
): Promise<ForgeProviderModelDiscoveryResult> {
  const fetcher = options.fetch ?? defaultProviderFetch;
  const path = getForgeProviderPreset(connection.providerId).modelDiscoveryPath;
  if (!path) return { status: 'model_list', models: [], message: '该 Provider 未声明模型发现接口；仍可手动输入精确 model ID。' };
  const endpointPath = connection.protocol === 'anthropic-messages' && !path.startsWith('v1/') ? `v1/${path}` : path;
  let response: ForgeProviderFetchResponse;
  try {
    response = await fetcher(buildEndpointUrl(connection.baseUrl, endpointPath), {
      method: 'GET',
      headers: buildHeaders(connection.apiKey, connection.authScheme, connection.protocol),
      signal: options.signal,
    });
  } catch (error) {
    return { status: isAbortError(error) ? 'timeout' : 'browser_transport', models: [], message: isAbortError(error) ? '模型列表请求超时。' : '浏览器无法访问 Provider，可能被网络或 CORS 阻断。' };
  }
  if (response.status === 401 || response.status === 403) return { status: 'authentication', models: [], message: 'Provider 认证失败；请检查 API Key 和认证方式。' };
  if (response.status === 429) return { status: 'rate_limited', models: [], message: 'Provider 限流；请稍后重试。' };
  if (response.status === 404 || response.status === 405) return { status: 'protocol', models: [], message: 'Provider 不支持当前模型列表协议；可继续手动输入精确 model ID。' };
  if (!response.ok) return { status: 'model_list', models: [], message: `模型列表请求失败（HTTP ${response.status}）。` };
  let envelope: unknown;
  try { envelope = await response.json(); } catch { return { status: 'invalid_response', models: [], message: 'Provider 返回的模型列表不是有效 JSON。' }; }
  const models = extractModelIds(envelope);
  if (models.length === 0) return { status: 'model_list', models: [], message: 'Provider 未返回可用模型列表；仍可手动输入精确 model ID。' };
  return { status: 'connected', models, message: `已加载 ${models.length} 个模型候选。` };
}

export async function testForgeProviderConnection(
  input: ForgeProviderConnectionInput,
  options: { fetch?: ForgeProviderFetch; httpClient?: IntakeTransportRequest['httpClient']; signal?: AbortSignal; loadModels?: boolean } = {},
): Promise<ForgeProviderProbeResult> {
  let connection: ForgeProviderConnection;
  try { connection = normalizeForgeProviderConnection(input); } catch (error) {
    return failedProbe(input, 'configuration', error instanceof Error ? error.message : 'Provider 配置无效。');
  }
  if (!connection.model) return failedProbe(connection, 'configuration', '请先输入精确 model ID。');
  if (!connection.apiKey && connection.authScheme !== 'none') return failedProbe(connection, 'authentication', '请先输入 API Key。');
  const discovered = options.loadModels === false
    ? { status: 'connected' as const, models: [], message: '' }
    : await discoverForgeProviderModels(connection, options);
  if (discovered.status !== 'connected' && discovered.status !== 'model_list') {
    return { status: discovered.status, providerId: connection.providerId, protocol: connection.protocol, model: connection.model, models: [], capabilities: connection.capabilities, message: discovered.message };
  }
  try {
    const normalized = await requestIntakeProvider({
      ...providerConnectionTransportOptions(connection),
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
      systemPrompt: 'Return one JSON object with exactly one boolean field named ok.',
      userContent: '{"probe":true}',
      httpClient: options.httpClient,
      signal: options.signal,
    });
    if (!isJsonObject(normalized)) {
      return { status: 'structured_output', providerId: connection.providerId, protocol: connection.protocol, model: connection.model, models: discovered.models, capabilities: connection.capabilities, message: 'Provider 响应无法解析为结构化 JSON。' };
    }
    return { status: 'connected', providerId: connection.providerId, protocol: connection.protocol, model: connection.model, models: discovered.models, capabilities: connection.capabilities, message: '连接、协议和结构化输出测试通过。' };
  } catch (error) {
    const status = classifyProbeError(error);
    return { status, providerId: connection.providerId, protocol: connection.protocol, model: connection.model, models: discovered.models, capabilities: connection.capabilities, message: probeMessage(status, error) };
  }
}

export function normalizeBaseUrlIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return value.trim().replace(/\/+$/u, '');
  }
}

export function assertSecureProviderUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Provider endpoint must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:') throw new Error('Provider endpoint must use HTTPS.');
  if (url.username || url.password) throw new Error('Provider endpoint must not contain URL credentials.');
}

function stripProviderUrlSecretComponents(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}

function extractModelIds(value: unknown): string[] {
  const record = asRecord(value);
  const data = Array.isArray(record?.data) ? record.data : Array.isArray(record?.models) ? record.models : [];
  return [...new Set(data.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    const item = asRecord(entry);
    return typeof item?.id === 'string' ? [item.id] : typeof item?.name === 'string' ? [item.name] : [];
  }))].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function isJsonObject(result: NormalizedIntakeProviderResult): boolean {
  try {
    const value = JSON.parse(result.content) as unknown;
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  } catch { return false; }
}

function classifyProbeError(error: unknown): ForgeProviderConnectionStatus {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'rate_limited') return 'rate_limited';
    if (code === 'timeout') return 'timeout';
    if (code === 'invalid_response') return 'structured_output';
    if (code === 'configuration') return 'configuration';
    if (code === 'http_error') {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) return 'authentication';
      if (status === 404 || status === 405) return 'protocol';
      return 'protocol';
    }
  }
  return 'browser_transport';
}

function probeMessage(status: ForgeProviderConnectionStatus, error: unknown): string {
  if (status === 'authentication') return 'Provider 认证失败；请检查 API Key 和认证方式。';
  if (status === 'rate_limited') return 'Provider 限流；请稍后重试。';
  if (status === 'timeout') return 'Provider 请求超时。';
  if (status === 'protocol') return 'Provider 不接受当前协议或 endpoint。';
  if (status === 'structured_output') return 'Provider 未返回可验证的结构化 JSON。';
  if (status === 'configuration') return error instanceof Error ? error.message : 'Provider 配置无效。';
  return '浏览器无法访问 Provider，可能被网络或 CORS 阻断。';
}

function failedProbe(input: ForgeProviderConnectionInput | ForgeProviderConnection, status: ForgeProviderConnectionStatus, message: string): ForgeProviderProbeResult {
  const providerId = input.providerId ?? 'custom';
  const protocol = input.protocol ?? getForgeProviderPreset(providerId).defaultProtocol;
  const model = input.model ?? '';
  return { status, providerId, protocol, model, models: [], capabilities: resolveForgeProviderCapabilities(providerId, protocol, model), message };
}

const defaultProviderFetch: ForgeProviderFetch = (url, init) => fetch(url, init as RequestInit);

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
}

import { describe, expect, test } from 'bun:test';
import {
  FORGE_PROVIDER_PRESETS,
  discoverForgeProviderModels,
  normalizeForgeProviderConnection,
  resolveForgeProviderCapabilities,
  testForgeProviderConnection,
} from '../packages/forge-browser-runtime/src/providerConnections';
import { requestIntakeProvider } from '../packages/intake-ai/src/transport';
import { createBrowserAiProvider } from '../packages/forge-browser-runtime/src/ai';
import { createBrowserItemAiProvider } from '../packages/forge-browser-runtime/src/itemIntake';
import { createEncounterIntakeProviders } from '../packages/forge-browser-runtime/src/encounterIntake';
import { localizationRequest, localizationText } from '@fvtt-json-generator/contracts/localization';
import type { HttpResponse } from '../packages/intake-ai/src/http';

function response(status: number, body: unknown): HttpResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('Forge provider-first connections', () => {
  test('keeps browser-safe presets and protocol allowlists centralized', () => {
    const ids = FORGE_PROVIDER_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(expect.arrayContaining([
      'openai', 'anthropic', 'google-gemini', 'deepseek', 'xai', 'mistral', 'openrouter',
      'alibaba-qwen', 'moonshot-kimi', 'zhipu-glm', 'custom',
    ]));
    expect(JSON.stringify(FORGE_PROVIDER_PRESETS)).not.toMatch(/"apiKey"|authorization|deepseek-v4-pro/iu);
    expect(FORGE_PROVIDER_PRESETS.find((preset) => preset.id === 'anthropic')?.protocols).toEqual(['anthropic-messages']);
    expect(FORGE_PROVIDER_PRESETS.find((preset) => preset.id === 'openai')?.defaultProtocol).toBe('openai-responses');
    expect(FORGE_PROVIDER_PRESETS.find((preset) => preset.id === 'deepseek')?.recommendedModels).toEqual(['deepseek-flash']);
    expect(FORGE_PROVIDER_PRESETS.find((preset) => preset.id === 'custom')?.protocols).toHaveLength(3);
  });

  test('normalizes connection identity without including a key and exposes only valid reasoning', () => {
    const connection = normalizeForgeProviderConnection({
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'secret-key',
    });
    expect(connection.baseUrl).toBe('https://api.deepseek.com');
    expect(connection.protocol).toBe('openai-responses');
    expect(connection.reasoning).toBe('auto');
    expect(JSON.stringify({ ...connection, apiKey: undefined })).not.toContain('secret-key');
    expect(() => normalizeForgeProviderConnection({ providerId: 'custom', baseUrl: 'https://custom.example/v1', model: 'custom-model', reasoning: 'high' })).toThrow(/reasoning/u);
    expect(resolveForgeProviderCapabilities('deepseek', 'openai-responses', 'deepseek-v4-flash').reasoning).toEqual(['auto', 'low', 'high', 'max']);
  });

  test('probes only the selected model when legacy separate-review fields are supplied', async () => {
    const connection = normalizeForgeProviderConnection({
      providerId: 'custom', baseUrl: 'https://provider.example/v1', protocol: 'openai-chat',
      model: 'generator', reviewModel: 'old-reviewer', useSeparateReviewModel: true, apiKey: 'test-key',
    });
    expect(connection).toMatchObject({ model: 'generator', reviewModel: 'generator', useSeparateReviewModel: false });
    const requestedModels: string[] = [];
    const result = await testForgeProviderConnection(connection, {
      loadModels: false,
      httpClient: async (_url, init) => {
        requestedModels.push(JSON.parse(init.body).model);
        return response(200, { choices: [{ message: { content: '{"ok":true}' } }] });
      },
    });
    expect(result.status).toBe('connected');
    expect(requestedModels).toEqual(['generator']);
  });

  test('Forge Actor review remains disabled and sends zero model requests', () => {
    const provider = createBrowserAiProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'generator',reviewModel:'old-reviewer',protocol:'openai-chat'});
    expect(provider.reviewModel).toBe('generator');
    expect(()=>provider.review({source:'Source limit',ir:{},markdown:'',actorProjection:{},deterministicFindings:[]} as any)).toThrow('AI 内容复核已暂时关闭');
  });

  test('Forge Item review retains its existing disabled contract', () => {
    const provider = createBrowserItemAiProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'generator',reviewModel:'old-reviewer',protocol:'openai-chat'});
    expect(provider.reviewModel).toBe('generator');
    expect(()=>provider.review({source:'No charges',candidate:{},ir:{},markdown:'',itemProjection:{},deterministicFindings:[]} as any)).toThrow('AI 内容复核已暂时关闭');
  });

  test('Forge localization review remains disabled alongside its selected model identity', () => {
    const {provider,translationService}=createEncounterIntakeProviders({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'generator',reviewModel:'old-reviewer',protocol:'openai-chat'});
    expect(provider.reviewModel).toBe('generator');expect(translationService.reviewModel).toBe('generator');
    const request=localizationRequest('source',[localizationText('title','Goblin')]);
    expect(()=>translationService.review(request,{texts:[{id:request.texts[0]!.id,text:'地精'}]})).toThrow('AI 内容复核已暂时关闭');
  });

  test('builds normalized OpenAI Chat, Responses, and Anthropic Messages envelopes', async () => {
    const requests: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const client = async (url: string, init: any) => {
      requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
      if (url.endsWith('/responses')) return response(200, { id: 'resp-1', output_text: '{"ok":true}' });
      if (url.endsWith('/v1/messages')) return response(200, { id: 'msg-1', content: [{ type: 'text', text: '{"ok":true}' }] });
      return response(200, { id: 'chat-1', choices: [{ message: { content: '{"ok":true}' } }] });
    };
    const common = { baseUrl: 'https://provider.example/v1', apiKey: 'secret-key', model: 'model', systemPrompt: 'system', userContent: '{}' , httpClient: client };
    const chat = await requestIntakeProvider({ ...common, protocol: 'openai-chat', structuredOutput: { mode: 'json_object' } });
    const responses = await requestIntakeProvider({ ...common, protocol: 'openai-responses', structuredOutput: { mode: 'json_schema', name: 'probe', schema: { type: 'object' } }, reasoning: 'high' });
    const anthropic = await requestIntakeProvider({ ...common, baseUrl: 'https://api.anthropic.com', protocol: 'anthropic-messages', authScheme: 'x-api-key', structuredOutput: { mode: 'prompt_fallback' }, reasoning: 'adaptive' });
    expect(chat.content).toBe('{"ok":true}');
    expect(responses.protocol).toBe('openai-responses');
    expect(anthropic.protocol).toBe('anthropic-messages');
    expect(requests[0]).toMatchObject({ url: 'https://provider.example/v1/chat/completions', body: { response_format: { type: 'json_object' } } });
    expect(requests[1]).toMatchObject({ url: 'https://provider.example/v1/responses', body: { reasoning: { effort: 'high' } } });
    expect(requests[2]).toMatchObject({ url: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': 'secret-key', 'anthropic-version': '2023-06-01' }, body: { thinking: { type: 'adaptive' } } });
    expect(JSON.stringify(chat)).not.toContain('secret-key');
  });

  test('parses chunked Responses SSE, exposes semantic activity, and never exposes reasoning text', async () => {
    const requests: Array<{ url: string; body: any }> = [];
    const activity: any[] = [];
    const source = [
      'event: response.created\r\ndata: {"type":"response.created","sequence_number":0,"response":{"id":"resp-stream"}}\r\n\r\n',
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","sequence_number":2,"output_index":0,"item":{"type":"reasoning"}}\n\n',
      'event: response.reasoning_text.delta\ndata: {"type":"response.reasoning_text.delta","sequence_number":4,"delta":"PRIVATE_REASONING"}\n\n',
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","sequence_number":9,"output_index":1,"item":{"type":"message"}}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":11,"delta":"{\\"ok\\":true}"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","sequence_number":20,\ndata: "response":{"id":"resp-stream","status":"completed","output":[{"type":"reasoning","content":[{"type":"reasoning_text","text":"PRIVATE_REASONING"}]},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"{\\"ok\\":true}"}]}]}}\n\n',
    ].join('');
    const client = async (url: string, init: any): Promise<HttpResponse> => {
      requests.push({ url, body: JSON.parse(init.body) });
      async function* chunks() {
        const bytes = new TextEncoder().encode(source);
        for (let index = 0; index < bytes.length; index += 7) yield bytes.slice(index, index + 7);
      }
      return { ok: true, status: 200, json: async () => ({}), body: chunks() };
    };
    const result = await requestIntakeProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'secret-key',
      model: 'deepseek-v4-flash',
      protocol: 'openai-responses',
      stream: true,
      structuredOutput: { mode: 'json_object' },
      systemPrompt: 'system',
      userContent: '{}',
      httpClient: client,
      onActivity: (entry) => activity.push(entry),
    });
    expect(result).toMatchObject({ protocol: 'openai-responses', model: 'deepseek-v4-flash', responseId: 'resp-stream', content: '{"ok":true}' });
    expect(requests[0]).toMatchObject({ url: 'https://api.deepseek.com/responses', body: { stream: true, model: 'deepseek-v4-flash', text: { format: { type: 'json_object' } } } });
    expect(requests[0]?.body.reasoning).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
    expect(JSON.stringify(activity)).not.toContain('PRIVATE_REASONING');
    expect(activity.map((entry) => entry.phase)).toEqual(expect.arrayContaining(['streaming_reasoning', 'streaming_output', 'completed']));
  });

  test('fails closed on a Responses incomplete terminal event', async () => {
    async function* chunks() {
      yield new TextEncoder().encode('event: response.incomplete\ndata: {"type":"response.incomplete","sequence_number":0}\n\n');
    }
    await expect(requestIntakeProvider({
      baseUrl: 'https://api.deepseek.com', apiKey: 'secret-key', model: 'deepseek-v4-flash',
      protocol: 'openai-responses', stream: true, structuredOutput: { mode: 'json_object' },
      systemPrompt: 'system', userContent: '{}',
      httpClient: async () => ({ ok: true, status: 200, json: async () => ({}), body: chunks() }),
    })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  test('uses DeepSeek Responses as the default connection probe and omits auto reasoning effort', async () => {
    let requestBody: any;
    const result = await testForgeProviderConnection({ providerId: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'secret-key' }, {
      fetch: async () => response(200, { data: [{ id: 'deepseek-v4-flash' }] }),
      httpClient: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        async function* chunks() {
          yield new TextEncoder().encode('event: response.completed\ndata: {"type":"response.completed","sequence_number":0,"response":{"id":"probe","output_text":"{\\"ok\\":true}"}}\n\n');
        }
        return { ok: true, status: 200, json: async () => ({}), body: chunks() };
      },
    });
    expect(result.status).toBe('connected');
    expect(requestBody).toMatchObject({ model: 'deepseek-v4-flash', stream: true, text: { format: { type: 'json_object' } } });
    expect(requestBody.reasoning).toBeUndefined();
  });

  test('classifies model discovery and probe failures without returning raw bodies', async () => {
    const connection = normalizeForgeProviderConnection({ providerId: 'openai', model: 'gpt-4.1-mini', apiKey: 'secret-key' });
    const models = await discoverForgeProviderModels(connection, {
      fetch: async () => response(200, { data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4.1' }] }),
    });
    expect(models).toMatchObject({ status: 'connected', models: ['gpt-4.1', 'gpt-4.1-mini'] });
    const auth = await testForgeProviderConnection(connection, {
      fetch: async () => response(200, { data: [{ id: 'gpt-4.1-mini' }] }),
      httpClient: async () => response(401, { error: 'secret raw response' }),
    });
    expect(auth.status).toBe('authentication');
    expect(JSON.stringify(auth)).not.toContain('secret raw response');
    const transport = await testForgeProviderConnection(connection, {
      loadModels: false,
      httpClient: async () => { throw new Error('CORS blocked'); },
    });
    expect(transport.status).toBe('browser_transport');
  });

  test('classifies probe HTTP failures without guessing the cause or exposing raw errors', async () => {
    const cases = [
      { http: 400, status: 'request_rejected', message: /模型 ID 或探测请求参数.*HTTP 400/u },
      { http: 404, status: 'request_rejected', message: /模型或请求端点.*HTTP 404/u },
      { http: 405, status: 'protocol', message: /协议或 endpoint/u },
      { http: 422, status: 'request_rejected', message: /模型 ID 或探测请求参数.*HTTP 422/u },
      { http: 500, status: 'provider_error', message: /服务端暂时出错/u },
      { http: 503, status: 'provider_error', message: /服务端暂时出错/u },
      { http: 401, status: 'authentication', message: /认证失败/u },
      { http: 429, status: 'rate_limited', message: /限流/u },
    ] as const;
    for (const entry of cases) {
      const requests: string[] = [];
      const result = await testForgeProviderConnection({
        providerId: 'custom', baseUrl: 'https://provider.example/v1', protocol: 'openai-chat',
        model: 'selected-model', apiKey: 'secret-key',
      }, {
        loadModels: false,
        httpClient: async (_url, init) => {
          requests.push(JSON.parse(init.body).model);
          return response(entry.http, { error: 'secret raw response and secret-key' });
        },
      });
      expect(requests, `HTTP ${entry.http}`).toEqual(['selected-model']);
      expect(result.status, `HTTP ${entry.http}`).toBe(entry.status);
      expect(result.message, `HTTP ${entry.http}`).toMatch(entry.message);
      expect(JSON.stringify(result)).not.toMatch(/secret raw response|secret-key/u);
      if (entry.http === 400 || entry.http === 404) expect(result.message).not.toContain('模型不存在');
    }
  });

  test('allows an explicitly selected Custom no-auth connection without inventing a key', async () => {
    const connection = normalizeForgeProviderConnection({
      providerId: 'custom',
      baseUrl: 'https://custom.example/v1',
      protocol: 'openai-chat',
      authScheme: 'none',
      model: 'local-compatible-model',
    });
    expect(connection.apiKey).toBe('');
    const result = await testForgeProviderConnection(connection, {
      loadModels: false,
      httpClient: async (_url, init) => {
        expect(init.headers.Authorization).toBeUndefined();
        return response(200, { choices: [{ message: { content: '{"ok":true}' } }] });
      },
    });
    expect(result.status).toBe('connected');
  });

  test('keeps one pending request across four-cycle human decisions and never auto-reposts', async () => {
    let requests = 0;
    let bodyAborted = false;
    const decisions: Array<Record<string, any>> = [];
    const pending = requestIntakeProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret-key',
      model: 'slow-model',
      systemPrompt: 'system',
      userContent: '{}',
      httpClient: async (_url, init) => {
        requests += 1;
        return {
          ok: true,
          status: 200,
          json: () => new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              bodyAborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            }, { once: true });
          }),
        };
      },
      waitPolicy: {
        cycleMs: 2,
        cyclesBeforeDecision: 4,
        onDecision: async (status) => {
          decisions.push(status);
          return decisions.length === 1 ? 'continue' : 'stop';
        },
      },
    });

    await expect(pending).rejects.toMatchObject({
      code: 'network',
      retryable: false,
      message: 'AI provider request was stopped by the user.',
    });
    expect(requests).toBe(1);
    expect(bodyAborted).toBe(true);
    expect(decisions).toHaveLength(2);
    expect(decisions.map((entry) => entry.completedCycles)).toEqual([4, 8]);
    expect(decisions.map((entry) => entry.decisionRound)).toEqual([1, 2]);
    expect(decisions[0]).toMatchObject({
      phase: 'reading_response_body',
      responseHeadersReceived: true,
      httpStatus: 200,
      requestPending: true,
      browserReportedConnectionError: false,
      aiActivity: 'unknown',
    });
  });
});

import { describe, it, expect } from 'bun:test';
import { ItemAiNormalizer, type ItemAiNormalizerHttpClient } from '../../../src/core/ingest/item-ai-normalizer';

function createChatResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

describe('ItemAiNormalizer', () => {
  describe('constructor', () => {
    it('creates instance without API key', () => {
      const normalizer = new ItemAiNormalizer({});
      expect(normalizer).toBeDefined();
    });

    it('creates instance with API key', () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1',
        model: 'test-model',
        timeoutMs: 10000,
      });
      expect(normalizer).toBeDefined();
    });
  });

  describe('normalizeItem', () => {
    it('returns undefined when no API key configured and does not call httpClient', async () => {
      let called = false;
      const httpClient: ItemAiNormalizerHttpClient = async () => {
        called = true;
        return createChatResponse('unused');
      };

      const normalizer = new ItemAiNormalizer({ httpClient });
      const result = await normalizer.normalizeItem('Some item description');

      expect(result).toBeUndefined();
      expect(called).toBe(false);
    });

    it('sends an OpenAI-compatible request and returns cleaned YAML from a markdown fence', async () => {
      const mockBodyText = 'This armor grants its wearer +2 AC.';
      const expectedYaml = 'acBonus: +2';
      let requestUrl = '';
      let requestInit: RequestInit | undefined;

      const httpClient: ItemAiNormalizerHttpClient = async (url, init) => {
        requestUrl = url;
        requestInit = init;
        return createChatResponse(`\`\`\`yaml\n${expectedYaml}\n\`\`\``);
      };

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1/',
        model: 'test-model',
        timeoutMs: 10000,
        httpClient,
      });

      const result = await normalizer.normalizeItem(mockBodyText);
      const requestBody = JSON.parse(String(requestInit?.body ?? '{}')) as {
        model?: string;
        temperature?: number;
        messages?: Array<{ role?: string; content?: string }>;
      };

      expect(result).toBe(expectedYaml);
      expect(requestUrl).toBe('https://api.test.com/v1/chat/completions');
      expect(requestInit?.method).toBe('POST');
      expect((requestInit?.headers as Record<string, string>)?.Authorization).toBe('Bearer test-key');
      expect(requestBody.model).toBe('test-model');
      expect(requestBody.temperature).toBe(0);
      expect(requestBody.messages?.[0]?.role).toBe('user');
      expect(requestBody.messages?.[0]?.content).toContain(mockBodyText);
    });

    it('returns cleaned response when the model returns plain text', async () => {
      const expectedYaml = 'fireResistance: true';
      const httpClient: ItemAiNormalizerHttpClient = async () => createChatResponse(expectedYaml);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Cloak of the Phoenix');
      expect(result).toBe(expectedYaml);
    });

    it('strips think tags from response before extracting YAML', async () => {
      const expectedYaml = 'swimSpeed: 30';
      const httpClient: ItemAiNormalizerHttpClient = async () =>
        createChatResponse(`<think> Some thinking here </think>\`\`\`yaml\n${expectedYaml}\n\`\`\``);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Ring of swimming');
      expect(result).toBe(expectedYaml);
    });

    it('returns undefined when the HTTP request throws', async () => {
      const httpClient: ItemAiNormalizerHttpClient = async () => {
        throw new Error('Network error');
      };

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBeUndefined();
    });

    it('clears the abort timer when the HTTP request throws', async () => {
      const originalClearTimeout = globalThis.clearTimeout;
      let clearTimeoutCalls = 0;

      globalThis.clearTimeout = ((timeoutId: Parameters<typeof clearTimeout>[0]) => {
        clearTimeoutCalls += 1;
        return originalClearTimeout(timeoutId);
      }) as typeof clearTimeout;

      try {
        const httpClient: ItemAiNormalizerHttpClient = async () => {
          throw new Error('Network error');
        };

        const normalizer = new ItemAiNormalizer({
          apiKey: 'test-key',
          timeoutMs: 1,
          httpClient,
        });

        const result = await normalizer.normalizeItem('Some item description');
        expect(result).toBeUndefined();
        expect(clearTimeoutCalls).toBe(1);
      } finally {
        globalThis.clearTimeout = originalClearTimeout;
      }
    });

    it('returns undefined when the HTTP response is not successful', async () => {
      const httpClient: ItemAiNormalizerHttpClient = async () => createChatResponse('ignored', 401);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBeUndefined();
    });
  });
});

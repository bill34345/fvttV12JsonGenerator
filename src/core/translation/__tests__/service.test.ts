import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTranslationCache } from '../cache';
import { createTranslationConfigFromEnv } from '../config';
import { OpenAICompatibleTranslator } from '../openaiCompatible';
import { TranslationService } from '../service';
import type { HttpClient } from '../types';

function createResponse(status: number, payload: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    },
  };
}

describe('TranslationService', () => {
  const tempRoots: string[] = [];
  let root: string;
  let cachePath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fvtt-translation-'));
    tempRoots.push(root);
    cachePath = join(root, 'translation-cache.json');
  });

  afterAll(() => {
    for (const path of tempRoots) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('translates via openai-compatible endpoint and persists cache', async () => {
    let requestUrl = '';
    let requestBody = '';
    let callCount = 0;
    const httpClient: HttpClient = async (url, init) => {
      callCount += 1;
      requestUrl = url;
      requestBody = String(init.body ?? '');
      return createResponse(200, {
        choices: [{ message: { content: '成年红龙' } }],
      });
    };

    const translator = new OpenAICompatibleTranslator({
      apiKey: 'sk-test',
      baseUrl: 'https://middleman.example.com/v1/',
      model: 'gpt-4o-mini',
      timeoutMs: 500,
      httpClient,
    });

    const service = new TranslationService({
      translator,
      cache: new FileTranslationCache(cachePath),
      providerName: 'middleman',
      model: 'gpt-4o-mini',
    });

    const result = await service.translate('Adult Red Dragon', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'details.biography',
    });

    expect(result.text).toBe('成年红龙');
    expect(result.cached).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(callCount).toBe(1);
    expect(requestUrl).toBe('https://middleman.example.com/v1/chat/completions');
    expect(requestBody).toContain('Adult Red Dragon');
    expect(requestBody).toContain('zh-CN');
    expect(existsSync(cachePath)).toBe(true);
    expect(readFileSync(cachePath, 'utf-8')).toContain('成年红龙');
  });

  it('returns cache hit for identical request without extra network call', async () => {
    let callCount = 0;
    const httpClient: HttpClient = async () => {
      callCount += 1;
      return createResponse(200, {
        choices: [{ message: { content: '龙巢' } }],
      });
    };

    const translator = new OpenAICompatibleTranslator({
      apiKey: 'sk-test',
      baseUrl: 'https://middleman.example.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 500,
      httpClient,
    });

    const service = new TranslationService({
      translator,
      cache: new FileTranslationCache(cachePath),
      providerName: 'middleman',
      model: 'gpt-4o-mini',
    });

    const first = await service.translate('dragon lair', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'details.biography',
    });
    const second = await service.translate('dragon lair', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'details.biography',
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.text).toBe('龙巢');
    expect(callCount).toBe(1);
  });

  it('fails soft with source text and warning metadata on rate limit', async () => {
    const httpClient: HttpClient = async () => {
      return createResponse(429, {
        error: {
          message: 'Too many requests',
        },
      });
    };

    const translator = new OpenAICompatibleTranslator({
      apiKey: 'sk-test',
      baseUrl: 'https://middleman.example.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 500,
      httpClient,
    });

    const service = new TranslationService({
      translator,
      cache: new FileTranslationCache(cachePath),
      providerName: 'middleman',
      model: 'gpt-4o-mini',
    });

    const result = await service.translate('regional effects', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'regional_effects',
    });

    expect(result.text).toBe('regional effects');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('rate_limited');
    expect(result.warnings[0]?.retryable).toBe(true);
  });

  it('fails soft with timeout warning when upstream call aborts', async () => {
    const httpClient: HttpClient = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const translator = new OpenAICompatibleTranslator({
      apiKey: 'sk-test',
      baseUrl: 'https://middleman.example.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 1,
      httpClient,
    });

    const service = new TranslationService({
      translator,
      cache: new FileTranslationCache(cachePath),
      providerName: 'middleman',
      model: 'gpt-4o-mini',
    });

    const result = await service.translate('legendary resistance', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'traits',
    });

    expect(result.text).toBe('legendary resistance');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('timeout');
    expect(result.warnings[0]?.retryable).toBe(true);
  });

  it('handles corrupted cache file without crashing and rewrites it', async () => {
    writeFileSync(cachePath, '{ bad json');
    const httpClient: HttpClient = async () => {
      return createResponse(200, {
        choices: [{ message: { content: '酸液喷吐' } }],
      });
    };

    const translator = new OpenAICompatibleTranslator({
      apiKey: 'sk-test',
      baseUrl: 'https://middleman.example.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 500,
      httpClient,
    });

    const service = new TranslationService({
      translator,
      cache: new FileTranslationCache(cachePath),
      providerName: 'middleman',
      model: 'gpt-4o-mini',
    });

    const result = await service.translate('acid breath', {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace: 'actions',
    });

    expect(result.text).toBe('酸液喷吐');
    expect(() => JSON.parse(readFileSync(cachePath, 'utf-8'))).not.toThrow();
  });
});

describe('createTranslationConfigFromEnv', () => {
  it('loads api key, base url, and model from env values', () => {
    const config = createTranslationConfigFromEnv({
      TRANSLATION_API_KEY: 'sk-demo',
      TRANSLATION_BASE_URL: 'https://proxy.example.com/v1',
      TRANSLATION_MODEL: 'gpt-proxy-mini',
      TRANSLATION_CACHE_FILE: './tmp/cache.json',
      TRANSLATION_TIMEOUT_MS: '1234',
    });

    expect(config.apiKey).toBe('sk-demo');
    expect(config.baseUrl).toBe('https://proxy.example.com/v1');
    expect(config.model).toBe('gpt-proxy-mini');
    expect(config.cacheFilePath).toBe('./tmp/cache.json');
    expect(config.timeoutMs).toBe(1234);
  });
});

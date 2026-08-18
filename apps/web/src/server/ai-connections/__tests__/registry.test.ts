import { describe, expect, it } from 'bun:test';

import { AiConnectionRegistry } from '../registry';

describe('AI connection registry', () => {
  it('keeps BYOK secrets private and binds opaque connections to one session', () => {
    const registry = new AiConnectionRegistry({ now: () => 1_000 });
    const created = registry.createByok('session-a', {
      apiKey: 'sk-secret-value',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-luna',
      reviewModel: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
    });

    expect(JSON.stringify(created)).not.toContain('sk-secret-value');
    expect(created.keyHint).toBe('...alue');
    expect(registry.resolveForProvider('session-a', created.id).apiKey).toBe('sk-secret-value');
    expect(() => registry.resolveForProvider('session-b', created.id)).toThrow('not found');

    const short = registry.createByok('session-a', {
      apiKey: 'tiny',
      baseUrl: 'https://api.openai.com/v1',
      model: 'model',
      reviewModel: 'model',
      reasoningEffort: 'high',
    });
    expect(short.keyHint).toBe('...[set]');
  });

  it('expires connections and clears secrets on disconnect', () => {
    let now = 1_000;
    const registry = new AiConnectionRegistry({ now: () => now, idleTtlMs: 100, absoluteTtlMs: 200 });
    const created = registry.createByok('session-a', {
      apiKey: 'sk-secret-value',
      baseUrl: 'https://api.openai.com/v1',
      model: 'model-a',
      reviewModel: 'model-b',
      reasoningEffort: 'high',
    });

    now += 101;
    expect(() => registry.resolveForProvider('session-a', created.id)).toThrow('expired');

    now = 1_000;
    const second = registry.createByok('session-a', {
      apiKey: 'sk-another-secret',
      baseUrl: 'https://api.openai.com/v1',
      model: 'model-a',
      reviewModel: 'model-a',
      reasoningEffort: 'medium',
    });
    expect(registry.delete('session-a', second.id)).toBe(true);
    expect(() => registry.resolveForProvider('session-a', second.id)).toThrow('not found');
  });

  it('does not silently replace an expired pinned connection with site AI', () => {
    let now = 1_000;
    const registry = new AiConnectionRegistry({ now: () => now, idleTtlMs: 50, absoluteTtlMs: 100 });
    registry.createSite('session-a', {
      model: 'site-model', reviewModel: 'site-review', reasoningEffort: 'high',
    });
    const byok = registry.createByok('session-a', {
      apiKey: 'sk-secret-value', baseUrl: 'https://api.openai.com/v1', model: 'byok', reviewModel: 'byok', reasoningEffort: 'high',
    });
    now += 51;
    expect(() => registry.resolveForProvider('session-a', byok.id)).toThrow('expired');
  });
});

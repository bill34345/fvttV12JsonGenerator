import { describe, it, expect } from 'bun:test';
import { ItemAiNormalizer } from '../../../src/core/ingest/item-ai-normalizer';

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
    it('returns abilities: [] when no API key configured', async () => {
      const normalizer = new ItemAiNormalizer({});
      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBe('abilities: []');
    });

    it('returns cleaned YAML when translator returns markdown-wrapped YAML', async () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
      });
      const mockBodyText = 'This armor grants its wearer +2 AC.';
      const expectedYaml = 'acBonus: +2';
      
      const mockTranslate = async () => {
        return `\`\`\`yaml\n${expectedYaml}\n\`\`\``;
      };
      
      (normalizer as any).translator = {
        translate: mockTranslate,
      };

      const result = await normalizer.normalizeItem(mockBodyText);
      expect(result).toBe(expectedYaml);
    });

    it('returns cleaned response when translator returns plain text', async () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
      });
      const mockBodyText = 'Cloak of the Phoenix';
      const expectedYaml = 'fireResistance: true';
      
      const mockTranslate = async () => {
        return expectedYaml;
      };
      
      (normalizer as any).translator = {
        translate: mockTranslate,
      };

      const result = await normalizer.normalizeItem(mockBodyText);
      expect(result).toBe(expectedYaml);
    });

    it('strips think tags from response', async () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
      });
      const mockBodyText = 'Ring of swimming';
      const expectedYaml = 'swimSpeed: 30';
      
      const mockTranslate = async () => {
        return `<think> Some thinking here </think>\`\`\`yaml\n${expectedYaml}\n\`\`\``;
      };
      
      (normalizer as any).translator = {
        translate: mockTranslate,
      };

      const result = await normalizer.normalizeItem(mockBodyText);
      expect(result).toBe(expectedYaml);
    });

    it('returns abilities: [] when translator throws error', async () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
      });
      
      const mockTranslate = async () => {
        throw new Error('Network error');
      };
      
      (normalizer as any).translator = {
        translate: mockTranslate,
      };

      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBe('abilities: []');
    });
  });
});

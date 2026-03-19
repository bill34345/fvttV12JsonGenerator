import { describe, it, expect } from 'bun:test';
import { i18n } from '../i18n';

describe('I18nMapper', () => {
  it('should normalize Traditional Chinese to Simplified', () => {
    // "體質" -> "体质"
    expect(i18n.normalize('體質')).toBe('体质');
    // "智力" -> "智力"
    expect(i18n.normalize('智力')).toBe('智力');
  });

  it('should find DND5E keys for simplified terms', () => {
    expect(i18n.getKey('力量')).toBe('DND5E.AbilityStr');
    expect(i18n.getKey('敏捷')).toBe('DND5E.AbilityDex');
  });

  it('should find DND5E keys for traditional terms', () => {
    // "體質" -> "体质" -> "DND5E.AbilityCon"
    expect(i18n.getKey('體質')).toBe('DND5E.AbilityCon');
  });

  it('should handle whitespace', () => {
    expect(i18n.getKey(' 魅力 ')).toBe('DND5E.AbilityCha');
  });

  it('should return undefined for unknown terms', () => {
    expect(i18n.getKey('未知属性')).toBeUndefined();
  });
});

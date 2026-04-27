import { describe, expect, it } from 'bun:test';
import { detectItemRoute, extractFrontmatter } from '../item-router';

describe('item-router', () => {
  describe('extractFrontmatter', () => {
    it('extracts frontmatter with leading --- format', () => {
      const content = ['---', 'name: Test', 'type: item', '---', '# Body'].join('\n');
      const frontmatter = extractFrontmatter(content);
      expect(frontmatter).toBe('name: Test\ntype: item');
    });

    it('extracts frontmatter with separator --- format', () => {
      const content = ['name: Test', 'type: item', '---', '# Body'].join('\n');
      const frontmatter = extractFrontmatter(content);
      expect(frontmatter).toBe('name: Test\ntype: item');
    });

    it('returns full content when no frontmatter found', () => {
      const content = 'No frontmatter here';
      const frontmatter = extractFrontmatter(content);
      expect(frontmatter).toBe('No frontmatter here');
    });
  });

  describe('detectItemRoute', () => {
    it('returns true when frontmatter contains layout: item', () => {
      const content = ['---', 'layout: item', 'name: Test Sword', '---', '# Body'].join('\n');
      expect(detectItemRoute(content)).toBe(true);
    });

    it('returns true with double-quoted layout: item', () => {
      const content = ['---', 'layout: "item"', 'name: Test Sword', '---', '# Body'].join('\n');
      expect(detectItemRoute(content)).toBe(true);
    });

    it('returns true with single-quoted layout: item', () => {
      const content = ["---", "layout: 'item'", "name: Test Sword", "---", "# Body"].join('\n');
      expect(detectItemRoute(content)).toBe(true);
    });

    it('returns false when layout is creature', () => {
      const content = ['---', 'layout: creature', 'name: Test Creature', '---', '# Body'].join('\n');
      expect(detectItemRoute(content)).toBe(false);
    });

    it('returns false when no layout marker present', () => {
      const content = ['---', 'name: Test Item', 'type: treasure', '---', '# Body'].join('\n');
      expect(detectItemRoute(content)).toBe(false);
    });

    it('returns false when content has no frontmatter', () => {
      const content = '# Just a regular item\nSome content here';
      expect(detectItemRoute(content)).toBe(false);
    });

    it('returns true with layout: item and trailing whitespace', () => {
      const content = ['---', 'layout: item  ', 'name: Test', '---', '# Body'].join('\n');
      expect(detectItemRoute(content)).toBe(true);
    });
  });
});

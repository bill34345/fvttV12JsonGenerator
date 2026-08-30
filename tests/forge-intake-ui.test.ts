import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const template = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-intake.hbs', 'utf8');
const styles = readFileSync('foundry-modules/fvtt-json-forge/src/styles/fvtt-json-forge.css', 'utf8');

describe('Forge Intake human workflow surface', () => {
  test('keeps API Key in the first connection step, outside advanced settings', () => {
    const keyIndex = template.indexOf('name="apiKey"');
    const advancedIndex = template.indexOf('forge-advanced-settings');
    expect(keyIndex).toBeGreaterThan(template.indexOf('data-step="connection"'));
    expect(keyIndex).toBeLessThan(advancedIndex);
    expect(template).toContain('仅保留在当前窗口');
    expect(template).toContain('data-action="toggle-key"');
    expect(template).toContain('data-action="clear-key"');
    expect(template).toContain('data-provider-docs');
  });

  test('exposes the three human-readable steps and safe live activity', () => {
    expect(template).toContain('data-step="connection"');
    expect(template).toContain('data-step="input"');
    expect(template).toContain('data-step="review"');
    expect(template).toContain('data-activity-card');
    expect(template).toContain('aria-live="polite"');
    expect(template).toContain('data-action-group="primary"');
    expect(template).toContain('data-action-group="repair"');
    expect(template).toContain('data-action-group="decision"');
    expect(template).toContain('data-action-group="tools"');
    expect(template).toContain('forge-technical-details');
  });

  test('makes the window and long evidence regions independently scrollable', () => {
    expect(styles).toMatch(/\.forge-intake-window \.window-content\s*\{[^}]*overflow-y:\s*auto/iu);
    expect(styles).toMatch(/\.forge-intake-window \.window-content\s*\{[^}]*min-height:\s*0/iu);
    expect(styles).toMatch(/\.forge-review-grid pre\s*\{[^}]*overflow:\s*auto/iu);
    expect(styles).toMatch(/\.forge-findings ul\s*\{[^}]*overflow:\s*auto/iu);
  });
});

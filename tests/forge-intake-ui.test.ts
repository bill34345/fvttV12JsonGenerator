import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const template = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-intake.hbs', 'utf8');
const connection = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-connection.hbs', 'utf8');
const workspace = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-workspace.hbs', 'utf8');
const styles = readFileSync('foundry-modules/fvtt-json-forge/src/styles/fvtt-json-forge.css', 'utf8');

describe('Forge Intake human workflow surface', () => {
  test('keeps API Key in the independent shared connection dialog, outside advanced settings', () => {
    const keyIndex = connection.indexOf('name="apiKey"');
    const advancedIndex = connection.indexOf('forge-advanced-settings');
    expect(keyIndex).toBeGreaterThan(0);
    expect(keyIndex).toBeLessThan(advancedIndex);
    expect(template).not.toContain('name="apiKey"');
    expect(connection).toContain('name="apiKey" type="password"');
    expect(connection).toContain('data-action="toggle-key"');
    expect(connection).toContain('data-action="clear-key"');
    expect(connection).toContain('name="persistApiKey" type="checkbox"');
    expect(connection).toContain('data-provider-docs');
    expect(workspace).toContain('data-workspace-connection');
  });

  test('exposes the three human-readable steps and safe live activity', () => {
    expect(template).toContain('data-step="input"');
    expect(template).toContain('data-step="review"');
    expect(template).toContain('data-step="created"');
    for (const step of ['input', 'review', 'created']) expect(workspace).toContain(`data-workspace-stage="${step}"`);
    expect(template).toContain('data-activity-card');
    expect(template).toContain('aria-live="polite"');
    for (const action of ['analyze', 'generate', 'create', 'repair', 'reject', 'cancel']) expect(template).toContain(`data-action="${action}"`);
    expect(template).toContain('forge-technical-details');
  });

  test('makes the window and long evidence regions independently scrollable', () => {
    expect(styles).toMatch(/\.forge-unified-window \.window-content\s*\{[^}]*overflow:\s*hidden/iu);
    expect(styles).toMatch(/\.forge-workspace-scroll\s*\{[^}]*overflow(?:-y)?:\s*auto/iu);
    expect(styles).toMatch(/\.forge-unified-window \.window-content\s*\{[^}]*min-height:\s*0/iu);
    expect(styles).toMatch(/\.forge-review-grid pre\s*\{[^}]*overflow:\s*auto/iu);
    expect(styles).toMatch(/\.forge-findings ul\s*\{[^}]*overflow:\s*auto/iu);
  });
});

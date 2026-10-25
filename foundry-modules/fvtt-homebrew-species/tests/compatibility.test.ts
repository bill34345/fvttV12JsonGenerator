import { describe, expect, test } from 'bun:test';
import { moduleManifest } from '../build';

describe('ServerNext Species compatibility projection', () => {
  test('opens only the explicit 6.0.6 runtime candidate without relabeling content provenance', () => {
    const source = { id: 'fvtt-homebrew-species', version: '1.0.0' };
    const previous = moduleManifest(source, '14.368', '6.0.5');
    const candidate = moduleManifest(source, '14.368', '6.0.6');
    expect(candidate.relationships.systems[0].compatibility).toEqual({ minimum: '6.0.2', verified: '6.0.2', maximum: '6.0.6' });
    expect(previous.relationships.systems[0].compatibility.maximum).toBe('6.0.5');
    expect(candidate.packs).toEqual(previous.packs);
    expect(candidate.esmodules).toBeUndefined();
    expect(candidate.scripts).toBeUndefined();
    expect(candidate.description).toContain('Static candidate');
    expect(candidate.description).toContain('projected for dnd5e 6.0.2');
    expect(moduleManifest(source, '14')).toBe(source);
  });
});

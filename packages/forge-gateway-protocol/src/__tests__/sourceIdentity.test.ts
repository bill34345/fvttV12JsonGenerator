import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  attachForgeSourceId,
  createForgeSourceId,
  isForgeSourceId,
  isForgeSourceRef,
  readForgeSourceId,
  type ForgeSourceId,
  type Sha256,
} from '..';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const SOURCE_ID = `actor:v1:${UUID}` as ForgeSourceId;

describe('Forge source identity', () => {
  test('generates and validates canonical actor IDs without accepting names or paths', () => {
    expect(createForgeSourceId(() => UUID)).toBe(SOURCE_ID);
    expect(isForgeSourceId(SOURCE_ID)).toBe(true);
    expect(isForgeSourceId('actor:v1:123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(isForgeSourceId('actor:v1:Actor Name')).toBe(false);
    expect(isForgeSourceId('C:\\sources\\actor.md')).toBe(false);
  });

  test('inserts an ID into a source without rewriting its existing body', () => {
    const source = '# Actor\n\n中文和 emoji 🐉\n';
    const result = attachForgeSourceId(source, SOURCE_ID);
    expect(result.sourceId).toBe(SOURCE_ID);
    expect(result.changed).toBe(true);
    expect(result.content).toContain(source);
    expect(readForgeSourceId(result.content)).toEqual({ status: 'valid', sourceId: SOURCE_ID });
    expect(String(result.sourceHash)).toBe(sha256(result.content));
  });

  test('preserves a BOM and CRLF when adding frontmatter', () => {
    const source = '\uFEFF---\r\nname: Test\r\n---\r\nBody\r\n';
    const result = attachForgeSourceId(source, SOURCE_ID);
    expect(result.content).toBe('\uFEFF---\r\nforge-source-id: actor:v1:123e4567-e89b-42d3-a456-426614174000\r\nname: Test\r\n---\r\nBody\r\n');
    expect(result.content.includes('\n')).toBe(true);
    expect(result.content.replaceAll('\r\n', '')).not.toContain('\r');
  });

  test('keeps an existing valid ID byte-for-byte stable', () => {
    const source = `---\nforge-source-id: ${SOURCE_ID}\nname: Test\n---\nBody`;
    expect(attachForgeSourceId(source)).toMatchObject({ sourceId: SOURCE_ID, changed: false });
    expect(attachForgeSourceId(source, SOURCE_ID)).toEqual({
      content: source,
      sourceId: SOURCE_ID,
      sourceHash: sha256(source) as Sha256,
      changed: false,
    });
  });

  test('rejects malformed or duplicate IDs instead of silently repairing identity', () => {
    expect(() => attachForgeSourceId('---\nforge-source-id: actor:v1:bad\n---\nBody', SOURCE_ID)).toThrow();
    expect(readForgeSourceId('---\nforge-source-id: actor:v1:bad\n---\nBody').status).toBe('invalid');
    expect(readForgeSourceId('---\nforge-source-id: ' + SOURCE_ID + '\nforge-source-id: ' + SOURCE_ID + '\n---\nBody').status).toBe('invalid');
  });

  test('keeps sourceRef opaque and rejects filesystem or URL-shaped values', () => {
    expect(isForgeSourceRef('source:v1:x')).toBe(false);
    expect(isForgeSourceRef('source:v1:WA')).toBe(true);
    expect(isForgeSourceRef('source:v1:WB')).toBe(false);
    expect(isForgeSourceRef('source:v1:YWJj')).toBe(true);
    expect(isForgeSourceRef('C:\\managed\\actor.md')).toBe(false);
    expect(isForgeSourceRef('../managed/actor.md')).toBe(false);
    expect(isForgeSourceRef('https://example.test/source')).toBe(false);
  });
});

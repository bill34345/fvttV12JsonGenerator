import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { CANONICAL_HASH_FIXTURES, canonicalJsonStringify, hashArtifact, hashSource } from '..';

describe('Forge canonical hashes', () => {
  test('matches the published source and artifact fixtures', () => {
    for (const fixture of CANONICAL_HASH_FIXTURES.sources) {
      expect(hashSource(fixture.content)).toBe(fixture.sha256);
      expect(String(fixture.sha256)).toBe(createHash('sha256').update(new TextEncoder().encode(fixture.content)).digest('hex'));
    }
    for (const fixture of CANONICAL_HASH_FIXTURES.artifacts) {
      expect(hashArtifact(fixture.value)).toBe(fixture.sha256);
      expect(String(fixture.sha256)).toBe(createHash('sha256').update(canonicalJsonStringify(fixture.value), 'utf8').digest('hex'));
    }
    for (const fixture of CANONICAL_HASH_FIXTURES.artifactRelations) {
      expect(hashArtifact(fixture.left)).toBe(fixture.leftSha256);
      expect(hashArtifact(fixture.right)).toBe(fixture.rightSha256);
      if (fixture.relation === 'same-hash') {
        expect(hashArtifact(fixture.left)).toBe(hashArtifact(fixture.right));
      } else {
        expect(hashArtifact(fixture.left)).not.toBe(hashArtifact(fixture.right));
      }
    }
  });

  test('keeps object key insertion order out of the artifact hash', () => {
    expect(hashArtifact({ a: 1, b: { c: true, d: null } })).toBe(
      hashArtifact({ b: { d: null, c: true }, a: 1 }),
    );
    expect(canonicalJsonStringify({ '2': 'second', '10': 'tenth' })).toBe('{"10":"tenth","2":"second"}');
  });

  test('preserves array order and rejects non-JSON values', () => {
    expect(hashArtifact({ values: [1, 2] })).not.toBe(hashArtifact({ values: [2, 1] }));
    expect(() => hashArtifact({ value: undefined } as never)).toThrow();
    expect(() => hashArtifact({ value: Number.NaN } as never)).toThrow();
    expect(() => hashArtifact({ value: 1n } as never)).toThrow();
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => hashArtifact({ value: sparse } as never)).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashArtifact(cyclic as never)).toThrow();
  });

  test('preserves prototype-named own keys in canonical hashes', () => {
    const withPrototypeKeys = JSON.parse('{"__proto__":{"nested":true},"constructor":"own","prototype":[1]}');
    const withoutProtoKey = JSON.parse('{"constructor":"own","prototype":[1]}');
    const nestedPrototypeKey = JSON.parse('{"nested":{"__proto__":{"value":1}}}');

    expect(canonicalJsonStringify(withPrototypeKeys)).toContain('"__proto__"');
    expect(hashArtifact(withPrototypeKeys)).not.toBe(hashArtifact(withoutProtoKey));
    expect(canonicalJsonStringify(nestedPrototypeKey)).toContain('"__proto__"');
  });
});

import { sha256 } from '@fvtt-json-generator/contracts/hash';
import type { ForgeSourceId, JsonObject, JsonValue, Sha256 } from './types';

export interface CanonicalSourceHashFixture {
  name: string;
  content: string;
  sha256: Sha256;
}

export interface CanonicalArtifactHashFixture {
  name: string;
  value: JsonObject;
  sha256: Sha256;
}

export interface CanonicalArtifactHashRelationFixture {
  name: string;
  left: JsonObject;
  right: JsonObject;
  relation: 'same-hash' | 'different-hash';
  leftSha256: Sha256;
  rightSha256: Sha256;
}

export const CANONICAL_HASH_FIXTURES: {
  readonly sources: readonly CanonicalSourceHashFixture[];
  readonly artifacts: readonly CanonicalArtifactHashFixture[];
  readonly artifactRelations: readonly CanonicalArtifactHashRelationFixture[];
} = {
  sources: [
    {
      name: 'ascii-lf',
      content: 'Forge source\n',
      sha256: '15dbea7def8a6324dccb630326df29eca8986c1a80e914ec5c455a7623feb5c1' as Sha256,
    },
    {
      name: 'unicode-emoji',
      content: '名字：龙 🐉\n',
      sha256: '3faf025e5f34d6468d6a41baab6c89d591d972f3087540e443dd1de09057de29' as Sha256,
    },
    {
      name: 'bom-crlf',
      content: '\uFEFF---\r\nforge-source-id: actor:v1:123e4567-e89b-42d3-a456-426614174000\r\n---\r\nBody\r\n',
      sha256: '83884c823069cbc197deb32bb5b19d3be94d12074983b98c1a03e86dd11271c9' as Sha256,
    },
  ],
  artifacts: [
    {
      name: 'nested-actor',
      value: {
        name: 'Test Actor',
        system: {
          attributes: { ac: { value: 14 }, hp: { value: 12 } },
          tags: ['forge', 'actor'],
        },
      },
      sha256: '59aa27d4e9eb1f4787d147abc3da4195006179c6446073f107b5838b38cec4a3' as Sha256,
    },
    {
      name: 'array-order',
      value: { values: [1, 2, 3], sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId },
      sha256: '17de3ceeafc288cbad15ab93d701839601c396568e994daa43e3558e59abe84b' as Sha256,
    },
  ],
  artifactRelations: [
    {
      name: 'object-key-insertion-order',
      left: { a: 1, b: { c: true, d: null } },
      right: { b: { d: null, c: true }, a: 1 },
      relation: 'same-hash',
      leftSha256: 'f75feffe021fb4eebb17815c1644b03d79a71553943973f0f99d70d8782113c5' as Sha256,
      rightSha256: 'f75feffe021fb4eebb17815c1644b03d79a71553943973f0f99d70d8782113c5' as Sha256,
    },
    {
      name: 'array-order',
      left: { values: [1, 2] },
      right: { values: [2, 1] },
      relation: 'different-hash',
      leftSha256: '54fc94706765042e92a6c74fefd93f0134252a9a9ff81fea085dbd55b8227037' as Sha256,
      rightSha256: 'bff720f7ade3c6880454bb05885db9d3d67bbf43973fe6e008fb25bf5d740d3f' as Sha256,
    },
    {
      name: 'semantic-change',
      left: { name: 'Test Actor', system: { hp: 12 } },
      right: { name: 'Test Actor', system: { hp: 13 } },
      relation: 'different-hash',
      leftSha256: 'e3f390faa123554e46e760f8f01d7deb2ed1db109e05cf258187ffc676508cfd' as Sha256,
      rightSha256: '7916e4580986156a7d8be7927529b796c8b64821b9406b982380b3e4d8864146' as Sha256,
    },
  ],
} as const;

export function hashSource(content: string): Sha256 {
  if (typeof content !== 'string') throw new TypeError('Source content must be a string.');
  return sha256(content) as Sha256;
}

export function canonicalJsonStringify(value: unknown): string {
  return stringifyCanonical(canonicalize(value, '$', new Set<object>()));
}

export function hashArtifact(value: JsonObject): Sha256 {
  if (!isPlainObject(value)) throw new TypeError('Artifact must be a plain JSON object.');
  return sha256(canonicalJsonStringify(value)) as Sha256;
}

function canonicalize(value: unknown, path: string, stack: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Cannot hash non-finite number at ' + path + '.');
    return value;
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError('Cannot hash non-JSON value at ' + path + '.');
  }
  if (stack.has(value)) throw new TypeError('Cannot hash cyclic JSON at ' + path + '.');
  stack.add(value);

  let normalized: JsonValue;
  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new TypeError('Cannot hash sparse JSON array at ' + path + '/' + index + '.');
      }
      output.push(canonicalize(value[index], path + '/' + index, stack));
    }
    normalized = output;
  } else {
    if (!isPlainObject(value)) throw new TypeError('Cannot hash non-plain object at ' + path + '.');
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = canonicalize((value as Record<string, unknown>)[key], path + '/' + key, stack);
    }
    normalized = output;
  }

  stack.delete(value);
  return normalized;
}

function stringifyCanonical(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(stringifyCanonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stringifyCanonical(value[key]!)).join(',') + '}';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

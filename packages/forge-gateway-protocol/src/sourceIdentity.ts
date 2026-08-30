import { load } from 'js-yaml';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  FORGE_ITEM_SOURCE_ID_PREFIX,
  FORGE_SOURCE_ID_FIELD,
  FORGE_SOURCE_ID_PREFIX,
  isForgeItemSourceId,
  isForgeSourceId,
} from '@fvtt-json-generator/contracts';
import type { ForgeItemSourceId } from '@fvtt-json-generator/contracts';
import type { ForgeSourceId, ForgeSourceRef, Sha256 } from './types';

export const FORGE_SOURCE_REF_PREFIX = 'source:v1:' as const;

const SOURCE_REF_PATTERN = /^source:v1:([A-Za-z0-9_-]{1,256})$/u;

export {
  FORGE_ITEM_SOURCE_ID_PREFIX,
  FORGE_SOURCE_ID_FIELD,
  FORGE_SOURCE_ID_PREFIX,
  isForgeItemSourceId,
  isForgeSourceId,
} from '@fvtt-json-generator/contracts';
export type { ForgeItemSourceId } from '@fvtt-json-generator/contracts';

type ManagedSourceIdentityRead<T extends string> =
  | { status: 'missing'; reason: 'frontmatter-missing' | 'field-missing' }
  | { status: 'valid'; sourceId: T }
  | { status: 'invalid'; reason: string };

export type ForgeSourceIdentityRead = ManagedSourceIdentityRead<ForgeSourceId>;

export interface ForgeSourceIdentityAttachment {
  content: string;
  sourceId: ForgeSourceId;
  sourceHash: Sha256;
  changed: boolean;
}

export type ForgeItemSourceIdentityRead = ManagedSourceIdentityRead<ForgeItemSourceId>;

export interface ForgeItemSourceIdentityAttachment {
  content: string;
  sourceId: ForgeItemSourceId;
  sourceHash: Sha256;
  changed: boolean;
}

interface FrontmatterRegion {
  contentStart: number;
  lineEnding: '\n' | '\r\n';
  frontmatter: string;
}

export function createForgeSourceId(randomUuid: () => string = () => globalThis.crypto.randomUUID()): ForgeSourceId {
  const uuid = randomUuid().toLowerCase();
  if (!isForgeSourceId(FORGE_SOURCE_ID_PREFIX + uuid)) {
    throw new TypeError('Forge source UUID must be a canonical lowercase UUID v4.');
  }
  return (FORGE_SOURCE_ID_PREFIX + uuid) as ForgeSourceId;
}

export function createForgeItemSourceId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): ForgeItemSourceId {
  const uuid = randomUuid().toLowerCase();
  if (!isForgeItemSourceId(FORGE_ITEM_SOURCE_ID_PREFIX + uuid)) {
    throw new TypeError('Forge Item source UUID must be a canonical lowercase UUID v4.');
  }
  return (FORGE_ITEM_SOURCE_ID_PREFIX + uuid) as ForgeItemSourceId;
}

export function isForgeSourceRef(value: unknown): value is ForgeSourceRef {
  if (typeof value !== 'string') return false;
  const match = SOURCE_REF_PATTERN.exec(value);
  return match !== null && isCanonicalBase64UrlToken(match[1]!);
}

export function readForgeSourceId(markdown: string): ForgeSourceIdentityRead {
  return readManagedSourceId(markdown, isForgeSourceId);
}

export function readForgeItemSourceId(markdown: string): ForgeItemSourceIdentityRead {
  return readManagedSourceId(markdown, isForgeItemSourceId);
}

function readManagedSourceId<T extends string>(
  markdown: string,
  validate: (value: unknown) => value is T,
): ManagedSourceIdentityRead<T> {
  const region = findFrontmatter(markdown);
  if (region === null) return { status: 'missing', reason: 'frontmatter-missing' };
  if (region === 'malformed') return { status: 'invalid', reason: 'frontmatter-malformed' };

  let parsed: unknown;
  try {
    parsed = load(region.frontmatter);
  } catch {
    return { status: 'invalid', reason: 'frontmatter-invalid-yaml' };
  }
  if (!isRecord(parsed)) return { status: 'missing', reason: 'field-missing' };
  if (!Object.prototype.hasOwnProperty.call(parsed, FORGE_SOURCE_ID_FIELD)) {
    return { status: 'missing', reason: 'field-missing' };
  }
  const value = parsed[FORGE_SOURCE_ID_FIELD];
  if (!validate(value)) return { status: 'invalid', reason: 'source-id-invalid' };
  return { status: 'valid', sourceId: value };
}

export function attachForgeSourceId(
  markdown: string,
  sourceId?: ForgeSourceId,
): ForgeSourceIdentityAttachment {
  const current = readForgeSourceId(markdown);
  if (current.status === 'invalid') {
    throw new TypeError('Cannot repair an invalid Forge source identity: ' + current.reason);
  }
  if (current.status === 'valid') {
    if (sourceId !== undefined && (!isForgeSourceId(sourceId) || current.sourceId !== sourceId)) {
      throw new TypeError('Cannot replace an existing Forge source ID with a different identity.');
    }
    return {
      content: markdown,
      sourceId: current.sourceId,
      sourceHash: sha256(markdown) as Sha256,
      changed: false,
    };
  }

  const resolvedSourceId = sourceId ?? createForgeSourceId();
  if (!isForgeSourceId(resolvedSourceId)) {
    throw new TypeError('Cannot attach an invalid Forge source ID.');
  }

  const region = findFrontmatter(markdown);
  if (region === 'malformed') {
    throw new TypeError('Cannot attach a Forge source ID to malformed frontmatter.');
  }
  const content = region === null
    ? prependFrontmatter(markdown, resolvedSourceId)
    : insertIntoFrontmatter(markdown, region, resolvedSourceId);
  return {
    content,
    sourceId: resolvedSourceId,
    sourceHash: sha256(content) as Sha256,
    changed: true,
  };
}

export function attachForgeItemSourceId(
  markdown: string,
  sourceId?: ForgeItemSourceId,
  maxUtf8Bytes = 200_000,
): ForgeItemSourceIdentityAttachment {
  // Fail before YAML identity parsing or hashing when the supplied bytes are
  // already impossible to fit in the final request.
  assertUtf8Limit(markdown, maxUtf8Bytes);
  const current = readForgeItemSourceId(markdown);
  if (current.status === 'invalid') {
    throw new TypeError('Cannot repair an invalid Forge Item source identity: ' + current.reason);
  }
  if (current.status === 'valid') {
    if (sourceId !== undefined && (!isForgeItemSourceId(sourceId) || current.sourceId !== sourceId)) {
      throw new TypeError('Cannot replace an existing Forge Item source ID with a different identity.');
    }
    assertUtf8Limit(markdown, maxUtf8Bytes);
    return {
      content: markdown,
      sourceId: current.sourceId,
      sourceHash: sha256(markdown) as Sha256,
      changed: false,
    };
  }

  const resolvedSourceId = sourceId ?? createForgeItemSourceId();
  if (!isForgeItemSourceId(resolvedSourceId)) {
    throw new TypeError('Cannot attach an invalid Forge Item source ID.');
  }
  const region = findFrontmatter(markdown);
  if (region === 'malformed') {
    throw new TypeError('Cannot attach a Forge Item source ID to malformed frontmatter.');
  }
  const content = region === null
    ? prependFrontmatter(markdown, resolvedSourceId)
    : insertIntoFrontmatter(markdown, region, resolvedSourceId);
  assertUtf8Limit(content, maxUtf8Bytes);
  return {
    content,
    sourceId: resolvedSourceId,
    sourceHash: sha256(content) as Sha256,
    changed: true,
  };
}

function findFrontmatter(markdown: string): FrontmatterRegion | 'malformed' | null {
  const bomLength = markdown.startsWith('\uFEFF') ? 1 : 0;
  const firstLineEnd = markdown.indexOf('\n', bomLength);
  const firstLine = firstLineEnd === -1
    ? markdown.slice(bomLength)
    : markdown.slice(bomLength, firstLineEnd).replace(/\r$/u, '');
  if (firstLine !== '---') return null;
  if (firstLineEnd === -1) return 'malformed';

  const contentStart = firstLineEnd + 1;
  const lineEnding: '\n' | '\r\n' = markdown[firstLineEnd - 1] === '\r' ? '\r\n' : '\n';
  const rest = markdown.slice(contentStart);
  const closing = /^---[ \t]*(?:\r\n|\n|$)/mu.exec(rest);
  if (!closing) return 'malformed';

  return {
    contentStart,
    lineEnding,
    frontmatter: rest.slice(0, closing.index),
  };
}

function prependFrontmatter(markdown: string, sourceId: string): string {
  const bom = markdown.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? markdown.slice(1) : markdown;
  const lineEnding: '\n' | '\r\n' = body.includes('\r\n') ? '\r\n' : '\n';
  return bom
    + '---' + lineEnding
    + FORGE_SOURCE_ID_FIELD + ': ' + sourceId + lineEnding
    + '---' + lineEnding
    + body;
}

function insertIntoFrontmatter(markdown: string, region: FrontmatterRegion, sourceId: string): string {
  return markdown.slice(0, region.contentStart)
    + FORGE_SOURCE_ID_FIELD + ': ' + sourceId + region.lineEnding
    + markdown.slice(region.contentStart);
}

function assertUtf8Limit(content: string, maxUtf8Bytes: number): void {
  if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes <= 0) {
    throw new TypeError('Forge source byte limit must be a positive safe integer.');
  }
  if (new TextEncoder().encode(content).byteLength > maxUtf8Bytes) {
    throw new TypeError(`Source content must be at most ${maxUtf8Bytes} UTF-8 bytes.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalBase64UrlToken(value: string): boolean {
  const remainder = value.length % 4;
  if (remainder === 1) return false;
  if (remainder === 0) return true;
  const lastValue = base64UrlValue(value.charCodeAt(value.length - 1));
  if (lastValue < 0) return false;
  return remainder === 2 ? (lastValue & 0b1111) === 0 : (lastValue & 0b0011) === 0;
}

function base64UrlValue(codePoint: number): number {
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61 + 26;
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x30 + 52;
  if (codePoint === 0x2d) return 62;
  if (codePoint === 0x5f) return 63;
  return -1;
}

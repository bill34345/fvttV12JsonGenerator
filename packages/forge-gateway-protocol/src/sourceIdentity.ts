import { load } from 'js-yaml';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import type { ForgeSourceId, ForgeSourceRef, Sha256 } from './types';

export const FORGE_SOURCE_ID_FIELD = 'forge-source-id' as const;
export const FORGE_SOURCE_ID_PREFIX = 'actor:v1:' as const;
export const FORGE_SOURCE_REF_PREFIX = 'source:v1:' as const;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SOURCE_REF_PATTERN = /^source:v1:([A-Za-z0-9_-]{1,256})$/u;

export type ForgeSourceIdentityRead =
  | { status: 'missing'; reason: 'frontmatter-missing' | 'field-missing' }
  | { status: 'valid'; sourceId: ForgeSourceId }
  | { status: 'invalid'; reason: string };

export interface ForgeSourceIdentityAttachment {
  content: string;
  sourceId: ForgeSourceId;
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
  if (!UUID_V4_PATTERN.test(uuid)) {
    throw new TypeError('Forge source UUID must be a canonical lowercase UUID v4.');
  }
  return (FORGE_SOURCE_ID_PREFIX + uuid) as ForgeSourceId;
}

export function isForgeSourceId(value: unknown): value is ForgeSourceId {
  return typeof value === 'string'
    && value.startsWith(FORGE_SOURCE_ID_PREFIX)
    && UUID_V4_PATTERN.test(value.slice(FORGE_SOURCE_ID_PREFIX.length));
}

export function isForgeSourceRef(value: unknown): value is ForgeSourceRef {
  if (typeof value !== 'string') return false;
  const match = SOURCE_REF_PATTERN.exec(value);
  return match !== null && isCanonicalBase64UrlToken(match[1]!);
}

export function readForgeSourceId(markdown: string): ForgeSourceIdentityRead {
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
  if (!isForgeSourceId(value)) return { status: 'invalid', reason: 'source-id-invalid' };
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

function prependFrontmatter(markdown: string, sourceId: ForgeSourceId): string {
  const bom = markdown.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? markdown.slice(1) : markdown;
  const lineEnding: '\n' | '\r\n' = body.includes('\r\n') ? '\r\n' : '\n';
  return bom
    + '---' + lineEnding
    + FORGE_SOURCE_ID_FIELD + ': ' + sourceId + lineEnding
    + '---' + lineEnding
    + body;
}

function insertIntoFrontmatter(markdown: string, region: FrontmatterRegion, sourceId: ForgeSourceId): string {
  return markdown.slice(0, region.contentStart)
    + FORGE_SOURCE_ID_FIELD + ': ' + sourceId + region.lineEnding
    + markdown.slice(region.contentStart);
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

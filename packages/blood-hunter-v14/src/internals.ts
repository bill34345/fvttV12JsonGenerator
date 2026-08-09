import { createHash } from 'node:crypto';

import type { JsonObject } from './types';

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '-');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableId(prefix: string, ...parts: string[]): string {
  // Foundry document identifiers are exactly sixteen ASCII alphanumeric
  // characters. Keep the caller-provided kind in the digest input so that
  // document and advancement namespaces cannot collide, but never put that
  // kind into the persisted identifier itself.
  return sha256([prefix, ...parts].join('\u0000')).slice(0, 16);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function htmlFromEntries(entries: unknown[] | undefined): string {
  const chunks: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      chunks.push(render5etoolsInlineText(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const name = stringValue(value.name);
    if (name) chunks.push(`<strong>${escapeHtml(name)}</strong>`);
    if (Array.isArray(value.entries)) value.entries.forEach(visit);
    else if (typeof value.entry === 'string') visit(value.entry);
  };
  entries?.forEach(visit);
  return chunks.length > 0 ? chunks.map((chunk) => `<p>${chunk}</p>`).join('') : '';
}

const SUPPORTED_5ETOOLS_INLINE_TAGS = new Set([
  'filter', 'dice', 'item', 'i', 'variantrule', 'condition', 'action', 'spell', 'sense', 'feat', '5etools', 'book', 'classfeature',
]);
const SAFE_HTML_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'code', 'span', 'div', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'sup', 'sub',
]);

function render5etoolsInlineText(value: string): string {
  const pattern = /\{@([^\s}]+)(?:\s+([^}]*))?\}/g;
  const chunks: string[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    chunks.push(renderTextPreservingSafeHtml(value.slice(cursor, index)));
    chunks.push(render5etoolsInlineTag(match[1]!, match[2] ?? ''));
    cursor = index + match[0].length;
  }
  chunks.push(renderTextPreservingSafeHtml(value.slice(cursor)));
  const rendered = chunks.join('');
  if (rendered.includes('{@')) throw new Error(`MALFORMED_5ETOOLS_INLINE_TAG: ${value}`);
  return rendered;
}

function render5etoolsInlineTag(rawTag: string, rawBody: string): string {
  const tag = rawTag.toLocaleLowerCase('en-US');
  if (!SUPPORTED_5ETOOLS_INLINE_TAGS.has(tag)) throw new Error(`UNSUPPORTED_5ETOOLS_INLINE_TAG: ${rawTag}`);
  const parts = rawBody.split('|').map((part) => part.trim());
  const primary = parts[0] ?? '';
  if (!primary) throw new Error(`EMPTY_5ETOOLS_INLINE_TAG: ${rawTag}`);
  if (tag === 'i') return `<em>${escapeHtml(primary)}</em>`;
  if (tag === 'dice') {
    const formula = escapeHtml(primary);
    const alias = parts[1] && parts[1] !== primary ? ` ${escapeHtml(parts[1])}` : '';
    return `<span data-5etools-tag="dice"><code>${formula}</code>${alias}</span>`;
  }
  const display = displayTextFor5etoolsTag(tag, parts);
  return `<span data-5etools-tag="${escapeHtml(tag)}">${escapeHtml(display)}</span>`;
}

function displayTextFor5etoolsTag(tag: string, parts: string[]): string {
  if (['item', 'variantrule', 'condition', 'action', 'spell', 'sense', 'feat'].includes(tag)) return parts[2] || parts[0]!;
  if (tag === 'book') return parts[3] || parts[0]!;
  if (tag === 'classfeature') return parts[4] || parts[0]!;
  return parts[0]!;
}

function renderTextPreservingSafeHtml(value: string): string {
  const pattern = /<\/?[A-Za-z][^>]*>/g;
  const chunks: string[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    chunks.push(escapeHtml(value.slice(cursor, index)));
    chunks.push(sanitizeSafeHtmlTag(match[0]));
    cursor = index + match[0].length;
  }
  chunks.push(escapeHtml(value.slice(cursor)));
  return chunks.join('');
}

function sanitizeSafeHtmlTag(rawTag: string): string {
  const parsed = /^<(\/)?([A-Za-z][A-Za-z0-9-]*)([^>]*)>$/.exec(rawTag);
  if (!parsed) return escapeHtml(rawTag);
  const closing = parsed[1] === '/';
  const tag = parsed[2]!.toLocaleLowerCase('en-US');
  if (!SAFE_HTML_TAGS.has(tag)) return escapeHtml(rawTag);
  if (closing) return `</${tag}>`;
  const rawAttributes = parsed[3] ?? '';
  const selfClosing = /\/\s*$/.test(rawAttributes);
  const attributes = rawAttributes.replace(/\/\s*$/, '').trim();
  if (!attributes) return `<${tag}${selfClosing ? ' /' : ''}>`;
  const sanitized: string[] = [];
  const attributePattern = /([A-Za-z_:][A-Za-z0-9:_.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let consumed = 0;
  for (const match of attributes.matchAll(attributePattern)) {
    const index = match.index ?? 0;
    if (attributes.slice(consumed, index).trim()) return escapeHtml(rawTag);
    consumed = index + match[0].length;
    const name = match[1]!.toLocaleLowerCase('en-US');
    if (!['class', 'title', 'colspan', 'rowspan'].includes(name) && !name.startsWith('data-')) continue;
    const rawValue = match[2] ?? match[3] ?? match[4];
    sanitized.push(rawValue === undefined ? name : `${name}="${escapeHtml(rawValue)}"`);
  }
  if (attributes.slice(consumed).trim()) return escapeHtml(rawTag);
  return `<${tag}${sanitized.length > 0 ? ` ${sanitized.join(' ')}` : ''}${selfClosing ? ' /' : ''}>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export function findForbiddenKey(value: unknown, forbidden: ReadonlySet<string>, path = ''): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], forbidden, `${path}/${index}`);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (forbidden.has(key)) return childPath;
    const found = findForbiddenKey(child, forbidden, childPath);
    if (found) return found;
  }
  return undefined;
}

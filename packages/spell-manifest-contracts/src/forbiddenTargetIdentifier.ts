/** Portable manifests must never retain identifiers from a destination world. */
export const FORBIDDEN_TARGET_WORLD_IDENTIFIER = 'FORBIDDEN_TARGET_WORLD_IDENTIFIER' as const;

export interface ForbiddenTargetWorldIdentifierMatch {
  code: typeof FORBIDDEN_TARGET_WORLD_IDENTIFIER;
  path: string;
  match: string;
}

// Foundry document IDs are 16 alphanumeric characters. Match only UUID syntax,
// not ordinary prose that happens to mention an item or a compendium.
const TARGET_IDENTIFIER_PATTERN = /\b(?:Compendium\.(?:[A-Za-z0-9_-]+\.){2,4}[A-Za-z0-9]{16}|Actor\.[A-Za-z0-9]{16}(?:\.Item\.[A-Za-z0-9]{16})?|Item\.[A-Za-z0-9]{16})\b/g;

export function findForbiddenTargetWorldIdentifiers(value: unknown): ForbiddenTargetWorldIdentifierMatch[] {
  const findings: ForbiddenTargetWorldIdentifierMatch[] = [];
  const visited = new WeakSet<object>();

  const visit = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      for (const match of node.matchAll(TARGET_IDENTIFIER_PATTERN)) {
        findings.push({
          code: FORBIDDEN_TARGET_WORLD_IDENTIFIER,
          path: path || '/',
          match: match[0],
        });
      }
      return;
    }
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
      visit(entry, `${path}/${escapePointerSegment(key)}`);
    }
  };

  visit(value, '');
  return findings;
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

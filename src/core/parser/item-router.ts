/**
 * Item route detection - standalone function for detecting layout: item in frontmatter
 */

/**
 * Extract frontmatter content from markdown string
 */
export function extractFrontmatter(content: string): string {
  const normalized = content.trim();
  const leadingMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (leadingMatch?.[1] !== undefined) {
    return leadingMatch[1];
  }

  const separatorIndex = normalized.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return normalized.substring(0, separatorIndex);
  }

  return normalized;
}

/**
 * Detect if content has layout: item in frontmatter
 */
export function detectItemRoute(content: string): boolean {
  const frontmatter = extractFrontmatter(content);
  return /^layout\s*:\s*['"]?item['"]?\s*$/im.test(frontmatter);
}

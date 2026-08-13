import { extractFrontmatter } from './itemRouter';

export function detectSpeciesRoute(content: string): boolean {
  return /^layout\s*:\s*['"]?species['"]?\s*$/im.test(extractFrontmatter(content));
}

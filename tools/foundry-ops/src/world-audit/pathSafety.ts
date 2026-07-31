// Foundry Ops world-audit path boundary.
import { realpath } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";

export async function resolveFuturePhysicalPath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const physicalAncestor = await realpath(ancestor);
      return resolve(physicalAncestor, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missingSegments.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

export function physicalPathsOverlap(left: string, right: string): boolean {
  const leftNormalized = normalizePhysicalPathForComparison(left);
  const rightNormalized = normalizePhysicalPathForComparison(right);
  return leftNormalized === rightNormalized
    || rightNormalized.startsWith(`${leftNormalized}/`)
    || leftNormalized.startsWith(`${rightNormalized}/`);
}

export function normalizePhysicalPathForComparison(path: string): string {
  const normalized = resolve(path).split(sep).join("/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

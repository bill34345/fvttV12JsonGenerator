import { isAbsolute, relative, resolve } from 'node:path';

export const WORKSPACE_ROOT = resolve(process.cwd());
export const TEMP_WEB_DIR = resolve(WORKSPACE_ROOT, 'temp/web');

export function resolveWorkspacePath(path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(WORKSPACE_ROOT, path);
}

export function assertWorkspacePath(path: string): void {
  const resolved = resolveWorkspacePath(path);
  const rel = relative(WORKSPACE_ROOT, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path is outside workspace: ${path}`);
  }
}

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export const COMPANION_ARTIFACT_FILE_NAME = 'fvtt-ai-companion.exe';
export const COMPANION_ARTIFACT_DOWNLOAD_URL = '/api/ai-companion/download';

let hashCache: { size: number; mtimeMs: number; sha256: string } | undefined;

export function companionArtifactPath(): string {
  return resolve(process.cwd(), 'dist/web', COMPANION_ARTIFACT_FILE_NAME);
}

export function getCompanionArtifactInfo(): {
  available: boolean;
  fileName: string;
  downloadUrl: string | null;
  sha256: string | null;
} {
  const path = companionArtifactPath();
  const available = existsSync(path);
  const sha256 = available ? artifactSha256(path) : null;
  return {
    available,
    fileName: COMPANION_ARTIFACT_FILE_NAME,
    downloadUrl: available ? COMPANION_ARTIFACT_DOWNLOAD_URL : null,
    sha256,
  };
}

function artifactSha256(path: string): string | null {
  try {
    const stat = statSync(path);
    if (hashCache?.size === stat.size && hashCache.mtimeMs === stat.mtimeMs) return hashCache.sha256;
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    hashCache = { size: stat.size, mtimeMs: stat.mtimeMs, sha256 };
    return sha256;
  } catch {
    return null;
  }
}

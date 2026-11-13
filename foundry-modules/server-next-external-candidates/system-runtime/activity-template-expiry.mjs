import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const expiryUpstream = JSON.parse(await readFile(new URL('./activity-template-expiry-lock.json', import.meta.url), 'utf8'));

export async function readPinnedExpirySource(sourceRoot) {
  return readFile(join(sourceRoot, expiryUpstream.sourcePath), 'utf8');
}

export function patchActivityTemplateExpiry(source) {
  source = source.replaceAll('\r\n', '\n');
  if (createHash('sha256').update(source).digest('hex') !== expiryUpstream.sourceSha256Lf) {
    throw new Error('ActiveEffect source does not match the pinned dnd5e 6.0.6 source');
  }
  return source.replace(
    '    return super.isExpiryTrackable && !this.getFlag("dnd5e", "isTemporary");',
    '    return super.isExpiryTrackable && !this.getFlag("dnd5e", "isTemporary") && !this.system.isOnActivity;'
  );
}

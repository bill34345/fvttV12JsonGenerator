import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const dsnContextUpstream = JSON.parse(await readFile(new URL('./upstream-lock.json', import.meta.url), 'utf8'));
export const disposalStatement = '        this.dice3dRenderers.board.dispose();';
export const releaseStatement = '        this.dice3dRenderers.board.forceContextLoss();';

export function patchDsnContextLifecycle(source) {
  if (createHash('sha256').update(source).digest('hex') !== dsnContextUpstream.sourceSha256) {
    throw new Error('Dice3D source does not match the pinned official 6.4.4 source');
  }
  if (source.split(disposalStatement).length !== 2) throw new Error('Expected one board renderer disposal');
  return source.replace(disposalStatement, `${disposalStatement}\n${releaseStatement}`);
}

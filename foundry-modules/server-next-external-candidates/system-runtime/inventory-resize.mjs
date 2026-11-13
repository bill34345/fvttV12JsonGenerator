import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const inventoryUpstream = JSON.parse(await readFile(new URL('./inventory-resize-lock.json', import.meta.url), 'utf8'));

export async function readPinnedInventorySource(sourceRoot) {
  return readFile(join(sourceRoot, inventoryUpstream.sourcePath), 'utf8');
}

export function patchInventoryResize(source) {
  source = source.replaceAll('\r\n', '\n');
  if (createHash('sha256').update(source).digest('hex') !== inventoryUpstream.sourceSha256Lf) {
    throw new Error('Inventory source does not match the pinned dnd5e 6.0.6 source');
  }
  return source.replace(
    '    const observer = new ResizeObserver(this._onResize.bind(this));',
    '    const observer = new ResizeObserver(entries => requestAnimationFrame(() => this._onResize(entries)));'
  );
}

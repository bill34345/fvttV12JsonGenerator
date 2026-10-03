import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PINNED_DND5E_SHA256 = 'e9570927a215948fb3a3923a322c7bbf1455009565f48813168edd8c6df4890f';
export const PINNED_DND5E_SOURCE_PATH = fileURLToPath(new URL(
  '../../../../.local/midi-qol/test-sources/dnd5e-6.0.2/dnd5e.mjs', import.meta.url,
));

export function readPinnedDnd5eSource() {
  let bytes;
  try {
    bytes = readFileSync(PINNED_DND5E_SOURCE_PATH);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    throw new Error(`Missing pinned dnd5e 6.0.2 test source: ${PINNED_DND5E_SOURCE_PATH}. Extract only dnd5e.mjs from the official release-6.0.2 ZIP (see midi-qol/README.md).`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== PINNED_DND5E_SHA256) {
    throw new Error(`Pinned dnd5e 6.0.2 source changed: expected ${PINNED_DND5E_SHA256}; found ${actual} at ${PINNED_DND5E_SOURCE_PATH}.`);
  }
  return bytes;
}

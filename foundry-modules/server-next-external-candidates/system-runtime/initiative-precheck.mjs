import { createHash } from 'node:crypto';

export const initiativeSourcePath = 'module/documents/combat.mjs';
const sourceSha256 = '3fc3f559b911b71b08622405482c90cfb0d677649633885252ee43d5c9fd5a23';
const original = '(c.getInitiativeGroupingKey() === rollGroupingKey) && (Number.isFinite(c.initiative))';
const candidate = 'Number.isFinite(c.initiative) && (c.getInitiativeGroupingKey() === rollGroupingKey)';

export function patchInitiativePrecheck(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (createHash('sha256').update(normalized).digest('hex') !== sourceSha256) {
    throw new Error('Combat source does not match the pinned dnd5e 6.0.6 source');
  }
  return normalized.replace(original, candidate);
}

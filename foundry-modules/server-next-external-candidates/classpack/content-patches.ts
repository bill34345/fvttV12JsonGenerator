import { createHash } from 'node:crypto';

const helmSourceSha256 = 'fa7592b11c67c520bd642f64af6b99e449f1714aab26282758ff1b44a2ba57e0';
const enduranceSourceSha256 = '702b3d5a2b7462d6d302c8ccf3826fc48e617149a293c507fba3ec05e1e1cccc';
const oldUuid = 'Compendium.dnd5e_classpack.new-icon.Item.neAO6rDgsBeQ8bWb';
const newUuid = 'Compendium.dnd5e_classpack.new-icon.Item.7wAk7D98B8gAgKzX';
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function patchApprovedClasspackContent(pack: string, document: Record<string, unknown>) {
  if (pack === 'racial-traits' && document._id === 'BAX4NWZ6iTLGgf31') {
    if (sha256(document) !== enduranceSourceSha256) throw new Error('MPMM Stone’s Endurance upstream preimage differs');
    const next = structuredClone(document);
    const uses = (next.system as Record<string, unknown>).uses as Record<string, unknown>;
    if (uses?.max !== '1') throw new Error('MPMM Stone’s Endurance original uses differ');
    uses.max = '@prof';
    const restored = structuredClone(next);
    ((restored.system as Record<string, unknown>).uses as Record<string, unknown>).max = '1';
    if (sha256(restored) !== enduranceSourceSha256) throw new Error('MPMM Stone’s Endurance patch changed another field');
    return { document: next, report: { pack, id: document._id, name: document.name,
      field: 'system.uses.max', oldValue: '1', newValue: '@prof',
      sourceSha256: enduranceSourceSha256, candidateSha256: sha256(next) } };
  }
  if (pack !== 'itempack' || document._id !== 'BC04F7BE90F193C0') {
    return { document, report: null };
  }
  if (sha256(document) !== helmSourceSha256) throw new Error('Helm of Teleportation upstream preimage differs');
  const next = structuredClone(document);
  const system = next.system as Record<string, unknown>;
  const activities = system.activities as Record<string, Record<string, unknown>>;
  const activity = activities?.['8xeSfAR1Fa7nQv4c'];
  const spell = activity?.spell as Record<string, unknown> | undefined;
  if (spell?.uuid !== oldUuid) throw new Error('Helm of Teleportation cast activity target differs');
  spell.uuid = newUuid;
  const restored = structuredClone(next);
  (((restored.system as Record<string, unknown>).activities as Record<string, Record<string, unknown>>)
    ['8xeSfAR1Fa7nQv4c'].spell as Record<string, unknown>).uuid = oldUuid;
  if (sha256(restored) !== helmSourceSha256) throw new Error('Helm of Teleportation patch changed another field');
  return { document: next, report: { pack, id: document._id, name: document.name,
    field: 'system.activities.8xeSfAR1Fa7nQv4c.spell.uuid', oldUuid, newUuid,
    sourceSha256: helmSourceSha256, candidateSha256: sha256(next) } };
}

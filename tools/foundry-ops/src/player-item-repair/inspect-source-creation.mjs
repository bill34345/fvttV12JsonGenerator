// Read immutable, stopped-world SST files without opening a database engine.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readTable } from './inspect-sea-elf-storage.mjs';
import { stable, libraryIdentity } from './core.mjs';
const root = 'F:/FoundryLab/foundry-v14/data/server-next/Data/worlds/cor-cotn/data/items';
const evidence = 'F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928';
const receipt = JSON.parse(await readFile(join(evidence, 'library-apply-v8.json'), 'utf8'));
const allowed = new Set(receipt.sources.map(s => s.to.slice(5)));
const records = new Map(), files = [];
for (const name of (await readdir(root)).filter(n => n.endsWith('.ldb')).sort()) {
  const bytes = await readFile(join(root, name));
  files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const [internalKey, value] of readTable(bytes)) {
    const key = internalKey.subarray(0, -8).toString('utf8');
    if (!Array.from(allowed).some(id => key.includes(id))) continue;
    const seqType = internalKey.readBigUInt64LE(internalKey.length - 8), sequence = Number(seqType >> 8n);
    if ((records.get(key)?.sequence ?? -1) >= sequence) continue;
    records.set(key, { sequence, data: Number(seqType & 255n) === 1 ? JSON.parse(value.toString('utf8')) : null });
  }
  if (!bytes.equals(await readFile(join(root, name)))) throw new Error('SST changed during diagnosis');
}
const hash = data => createHash('sha256').update(stable(libraryIdentity(data))).digest('hex');
const rows = [];
for (const s of receipt.sources) {
  const id = s.to.slice(5), raw = structuredClone(records.get(`!items!${id}`)?.data);
  if (!raw) throw new Error(`Missing created source ${id}`);
  raw.effects = (raw.effects ?? []).map(e => typeof e === 'string' ? structuredClone(records.get(`!items.effects!${id}.${e}`)?.data) : e);
  if (raw.effects.some(e => !e)) throw new Error('Missing embedded effect');
  const actualHash = hash(raw);
  const expectedOwnership = structuredClone(raw); expectedOwnership.ownership = { default: 0 };
  const withoutCreatorOwnershipHash = hash(expectedOwnership);
  rows.push({ id, name: raw.name, ownership: raw.ownership, identifier: raw.system?.identifier, actualHash,
    agreesWithRuntimeActual: actualHash === s.actualHash, expectedHash: s.expectedHash,
    withoutCreatorOwnershipHash, matchesExpectedWithOnlyOwnershipRestored: withoutCreatorOwnershipHash === s.expectedHash,
    effectCount: raw.effects.length, marker: raw.flags?.world?.nextItemRepairSource });
}
const report = { mode: 'READ_ONLY_STORED_SOURCE_AUDIT', files, rows };
await writeFile(join(evidence, 'source-creation-storage-audit-v8.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ count: rows.length, runtimeMatches: rows.filter(r => r.agreesWithRuntimeActual).length,
  onlyOwnershipDiffers: rows.filter(r => r.matchesExpectedWithOnlyOwnershipRestored).length, examples: rows.slice(0, 2),
  otherDifferences: rows.filter(r => !r.matchesExpectedWithOnlyOwnershipRestored) }, null, 2));

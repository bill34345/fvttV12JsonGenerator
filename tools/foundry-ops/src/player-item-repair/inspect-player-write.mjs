// Stopped-world read-only persistence check after a client-side response error.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTable } from './inspect-sea-elf-storage.mjs';
import { APPROVAL } from './approval.mjs';
const root = 'F:/FoundryLab/foundry-v14/data/server-next/Data/worlds/cor-cotn/data/actors';
const evidence = 'F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928';
const keys = new Set(APPROVAL.actors.flatMap(a => a.items.map(i => `!actors.items!${a.actorId}.${i.itemId}`)));
const records = new Map();
for (const name of (await readdir(root)).filter(n => n.endsWith('.ldb'))) {
  const bytes = await readFile(join(root, name));
  for (const [key, value] of readTable(bytes)) {
    const userKey = key.subarray(0, -8).toString('utf8');
    if (!keys.has(userKey)) continue;
    const seqType = key.readBigUInt64LE(key.length - 8), sequence = Number(seqType >> 8n);
    if ((records.get(userKey)?.sequence ?? -1) >= sequence) continue;
    records.set(userKey, { sequence, data: Number(seqType & 255n) === 1 ? JSON.parse(value.toString('utf8')) : null });
  }
  if (!bytes.equals(await readFile(join(root, name)))) throw new Error('SST changed while reading');
}
const items = APPROVAL.actors.flatMap(a => a.items.map(i => {
  const record = records.get(`!actors.items!${a.actorId}.${i.itemId}`);
  if (!record?.data) throw new Error('Stored target missing');
  const d = record.data;
  const grants = i.mappings.map(m => {
    const adv = Array.isArray(d.system.advancement) ? d.system.advancement.find(x => x._id === m.advancementId) : d.system.advancement[m.advancementId];
    const actual = adv?.configuration?.items?.[m.index]?.uuid;
    return { advancementId: m.advancementId, index: m.index, before: m.from, expected: m.to, actual,
      status: actual === m.to ? 'PERSISTED_REPAIRED_REFERENCE' : actual === m.from ? 'UNCHANGED_REFERENCE' : 'UNEXPECTED_REFERENCE' };
  });
  return { actorId: a.actorId, itemId: i.itemId, name: d.name, sequence: record.sequence, stats: d._stats, grants };
}));
const batch = process.argv[2] ?? 'v9';
if (!/^v(?:9|10|11|12)$/.test(batch)) throw new Error('Unsupported evidence batch');
const report = { mode: 'READ_ONLY_STORED_PLAYER_REFERENCE_AUDIT', batch, items };
await writeFile(join(evidence, `player-write-storage-audit-${batch}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(items.map(i => ({ actorId: i.actorId, itemId: i.itemId, name: i.name,
  statuses: i.grants.map(g => g.status), stats: i.stats })), null, 2));

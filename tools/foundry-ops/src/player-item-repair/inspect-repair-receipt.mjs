import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTable } from './inspect-sea-elf-storage.mjs';
const root = 'F:/FoundryLab/foundry-v14/data/server-next/Data/worlds/cor-cotn/data/macros';
let found;
for (const name of await readdir(root)) {
  if (name.endsWith('.log') && (await readFile(join(root, name))).length) throw new Error('Pending WAL; SST-only receipt inspection refused');
  if (!name.endsWith('.ldb')) continue;
  const bytes = await readFile(join(root, name));
  for (const [key, value] of readTable(bytes)) {
    if (key.subarray(0, -8).toString('utf8') !== '!macros!iVGta3mQEvac49mo') continue;
    const seqType = key.readBigUInt64LE(key.length - 8), sequence = Number(seqType >> 8n);
    if ((found?.sequence ?? -1) >= sequence) continue;
    const data = Number(seqType & 255n) === 1 ? JSON.parse(value.toString('utf8')) : null;
    found = { sequence, receipt: data?.flags?.world?.nextItemRepairReceipt };
  }
  if (!bytes.equals(await readFile(join(root, name)))) throw new Error('Macro table changed');
}
if (!found?.receipt) throw new Error('Task receipt missing');
await writeFile('F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/stored-macro-receipt-v10.json', JSON.stringify(found, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ build: found.receipt.build, phase: found.receipt.phase,
  actors: found.receipt.actors.map(a => ({ actorId: a.actorId, status: a.status, beforeHash: a.beforeHash, expectedHash: a.expectedHash })) }, null, 2));

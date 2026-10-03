// One-off stopped-world diagnosis: parse immutable SST files with ordinary reads.
// Does not load/open a LevelDB engine, create a database copy, or write world data.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable, canonical } from './core.mjs';

function variable(bytes, position) {
  let value = 0, factor = 1;
  for (let count = 0; count < 10; count++) {
    if (position >= bytes.length) throw new Error('Truncated varint');
    const byte = bytes[position++]; value += (byte & 127) * factor;
    if (!(byte & 128)) return [value, position];
    factor *= 128;
  }
  throw new Error('Invalid varint');
}
function snappy(bytes) {
  let [size, p] = variable(bytes, 0);
  if (size > 64 * 1024 * 1024) throw new Error('Unexpected block size');
  const out = Buffer.alloc(size); let o = 0;
  while (p < bytes.length) {
    const tag = bytes[p++], kind = tag & 3;
    let n, offset;
    if (kind === 0) {
      n = tag >> 2;
      if (n < 60) n++;
      else { const width = n - 59; n = 0; for (let k = 0; k < width; k++) n += bytes[p++] * 2 ** (8 * k); n++; }
      if (p + n > bytes.length || o + n > size) throw new Error('Invalid literal');
      bytes.copy(out, o, p, p + n); p += n; o += n;
    } else {
      if (kind === 1) { n = 4 + ((tag >> 2) & 7); offset = ((tag & 224) << 3) + bytes[p++]; }
      else { n = 1 + (tag >> 2); const width = kind === 2 ? 2 : 4; offset = 0; for (let k = 0; k < width; k++) offset += bytes[p++] * 2 ** (8 * k); }
      if (!offset || offset > o || o + n > size) throw new Error('Invalid copy');
      for (let k = 0; k < n; k++) { out[o] = out[o - offset]; o++; }
    }
  }
  if (o !== size) throw new Error('Snappy size mismatch');
  return out;
}
function block(file, offset, size) {
  if (offset + size + 5 > file.length) throw new Error('Invalid block handle');
  const payload = file.subarray(offset, offset + size), compression = file[offset + size];
  if (compression === 0) return payload;
  if (compression === 1) return snappy(payload);
  throw new Error(`Unsupported compression ${compression}`);
}
function* entries(bytes) {
  const restarts = bytes.readUInt32LE(bytes.length - 4), end = bytes.length - 4 * (restarts + 1);
  if (end < 0) throw new Error('Invalid restart table');
  let p = 0, previous = Buffer.alloc(0);
  while (p < end) {
    let shared, suffix, valueSize;
    [shared, p] = variable(bytes, p); [suffix, p] = variable(bytes, p); [valueSize, p] = variable(bytes, p);
    if (shared > previous.length || p + suffix + valueSize > end) throw new Error('Invalid block entry');
    const key = Buffer.concat([previous.subarray(0, shared), bytes.subarray(p, p + suffix)]); p += suffix;
    const value = bytes.subarray(p, p + valueSize); p += valueSize; previous = key;
    yield [key, value];
  }
  if (p !== end) throw new Error('Entry boundary mismatch');
}
export function* readTable(file) {
  if (file.readBigUInt64LE(file.length - 8) !== 0xdb4775248b80fb57n) throw new Error('Unexpected table magic');
  let p = file.length - 48, ignored;
  [ignored, p] = variable(file, p); [ignored, p] = variable(file, p);
  let indexOffset, indexSize; [indexOffset, p] = variable(file, p); [indexSize, p] = variable(file, p);
  for (const [, handle] of entries(block(file, indexOffset, indexSize))) {
    let offset, size, h; [offset, h] = variable(handle, 0); [size, h] = variable(handle, h);
    yield* entries(block(file, offset, size));
  }
}
async function main() {
const root = process.argv[2], output = process.argv[3];
if (root !== 'F:/FoundryLab/foundry-v14/data/server-next/Data/worlds/cor-cotn/data/actors'
    || output !== 'F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/sea-elf-stored-shape.json') throw new Error('Exact authorized paths required');
const names = (await readdir(root)).filter(n => n.endsWith('.ldb')).sort();
const records = new Map(), files = [];
for (const name of names) {
  const bytes = await readFile(join(root, name));
  files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const [key, value] of readTable(bytes)) {
    const userKey = key.subarray(0, -8).toString('utf8');
    if (!userKey.includes('aMZwC9ORkpZpdlkc') || !userKey.includes('Oqs0HDVs0QOmvzb9')) continue;
    const sequenceType = key.readBigUInt64LE(key.length - 8), sequence = Number(sequenceType >> 8n), type = Number(sequenceType & 255n);
    if ((records.get(userKey)?.sequence ?? -1) >= sequence) continue;
    records.set(userKey, { sequence, type, data: type === 1 ? JSON.parse(value.toString('utf8')) : null });
  }
  const reread = await readFile(join(root, name));
  if (!bytes.equals(reread)) throw new Error('File changed during read');
}
const hash = data => createHash('sha256').update(stable(canonical(data))).digest('hex');
const rows = [];
for (const [key, entry] of records) {
  const d = entry.data;
  if (!d) { rows.push({ key, sequence: entry.sequence, deleted: true }); continue; }
  rows.push({ key, sequence: entry.sequence, id: d._id, name: d.name, type: d.type, stats: d._stats,
    topLevelFields: Object.keys(d), fieldHashes: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, hash({ [k]: v })])),
    systemFields: Object.keys(d.system ?? {}), effects: d.effects,
    effectChanges: d.type === 'base' ? d.system?.changes : undefined,
    advancementSummary: Object.entries(d.system?.advancement ?? {}).map(([id, a]) => ({ key: id, id: a._id, type: a.type, title: a.title, level: a.level, value: a.value })),
    flagNamespaces: Object.keys(d.flags ?? {}), storedHash: hash(d) });
}
await writeFile(output, JSON.stringify({ mode: 'READ_ONLY_SST_NO_DATABASE_ENGINE', files, rows }, null, 2));
console.log(JSON.stringify({ output, rows }, null, 2));

}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

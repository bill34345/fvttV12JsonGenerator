import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(here, 'dist/dnd5e_classpack');
const output = join(here, 'sun-soul-source-contexts.json');
if (existsSync(output)) throw new Error('Sun Soul source context already exists; refusing overwrite');
const index = JSON.parse(readFileSync(join(here, 'reference-source-index.json'), 'utf8'));
const ids = ['Y3yZcHJQTw2VMf0R', '8fO6', '5xnWV6pqjvB7lgls'];
const selected = index.entries.filter((entry: { id: string }) => ids.some(id => entry.id.startsWith(id)));
const { ClassicLevel } = await import(pathToFileURL('F:/FoundryLab/foundry-v14/app/14.368/node_modules/classic-level/index.js').href);
const documents = [];
for (const entry of selected) {
  const db = new ClassicLevel(join(sourceRoot, 'packs', entry.pack), {
    createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json', readOnly: true,
  });
  await db.open();
  let source;
  try { source = await db.get(`!items!${entry.id}`); }
  finally { await db.close(); }
  const system = source.system ?? {};
  documents.push({ pack: entry.pack, id: entry.id, name: entry.name,
    sourceSha256: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    description: system.description,
    advancement: system.advancement,
    activities: system.activities,
    flags: { dnd5e: source.flags?.dnd5e, midiQol: source.flags?.['midi-qol'] },
  });
}
writeFileSync(output, `${JSON.stringify({ upstreamVersion: '4.3.4', requestedIds: ids,
  matchedDocuments: documents.length, documents }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ file: output, matchedDocuments: documents.length,
  names: documents.map(entry => entry.name) }));

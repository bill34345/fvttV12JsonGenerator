// Offline source recovery only: never connects to Foundry and never authorizes apply.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
// Public package contract; bind this checkout without assuming workspace links.
import { assertBloodHunterSourceBytes, collectBloodHunterFeatures, validateBloodHunterEnrichedSource } from '../../../../packages/blood-hunter-v14/src/source-metadata.ts';
import { createLabConfig } from '../config.ts';
import { stable } from './core.mjs';

const config = createLabConfig();
const evidence = resolve(config.evidenceRoot, 'server-next-migration/player-item-repair-20260928');
const sourcePath = resolve(config.labRoot, 'data/server-mirror/Data/assets/homebrew/blood-hunter-2024.activities.json');
const packagePath = resolve(config.labRoot, 'data/server-next/Data/modules/fvtt-blood-hunter-2024/data/canonical-package.json');
const manifestPath = resolve(config.labRoot, 'data/server-next/Data/modules/fvtt-blood-hunter-2024/data/identity-manifest.json');
const bytes = await readFile(sourcePath);
assertBloodHunterSourceBytes(bytes);
const original = JSON.parse(bytes.toString('utf8'));
const validation = validateBloodHunterEnrichedSource(original);
if (!validation.ok) throw new Error('Locked source schema invalid');
const collected = collectBloodHunterFeatures(original);
const canonical = JSON.parse(await readFile(packagePath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourceHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
if (canonical.sourceSha256.toUpperCase() !== sourceHash || manifest.sourceSha256.toUpperCase() !== sourceHash) throw new Error('Installed package provenance differs from locked source');
const report = JSON.parse(await readFile(resolve(evidence, 'cn-source-inspection-readback.json'), 'utf8'));
const actor = report.actors.find(a => a.actorId === 'D90ARiSHc6gQix80');
const item = actor?.items.find(i => i.id === 'JKYf8f2QRtTInPTg');
if (!item || item.grants.length !== 7) throw new Error('Unexpected inspected Blood Hunter scope');
const sha = value => createHash('sha256').update(stable(value)).digest('hex');
function importerHash(feature) {
  const e = feature.entry;
  const values = feature.group === 'classFeature'
    ? [e.name, e.className, e.classSource, e.level, e.source]
    : feature.group === 'optionalfeature' ? [e.name, e.source] : [];
  return values.map(v => encodeURIComponent(String(v)).toLowerCase()).join('_');
}
const rows = item.grants.map(grant => {
  const imported = grant.referenced?.sourceHints?.plutoniumCN;
  const group = imported?.page === 'classFeature' ? 'classFeature' : imported?.page === 'optionalfeatures.html' ? 'optionalfeature' : null;
  const sources = collected.filter(f => group === f.group && imported.source === f.entry.source && imported.hash === importerHash(f));
  const base = { advancementId: grant.advancementId, index: grant.index, from: grant.uuid, name: grant.referenced?.name, importer: imported, referencedHash: grant.referencedHash, sourceMatches: sources.length };
  if (sources.length !== 1) return { ...base, status: 'UNRESOLVED_SOURCE' };
  const source = sources[0];
  const docs = canonical.features.filter(d => d.flags?.fvttJsonGenerator?.bloodHunter2024?.sourceKey === source.sourceKey);
  if (docs.length !== 1) return { ...base, sourceKey: source.sourceKey, canonicalMatches: docs.length, status: 'UNRESOLVED_CANONICAL_DOCUMENT' };
  const doc = docs[0];
  const identities = manifest.documents.filter(d => d.id === doc._id && d.pack === 'features');
  if (identities.length !== 1 || doc.type !== 'feat') throw new Error('Installed identity manifest is ambiguous');
  return { ...base, status: 'SOURCE_IDENTITY_RECOVERED_NOT_APPLIED', sourceKey: source.sourceKey, sourceIdentity: source.sourceIdentity, sourceTextHash: source.textHash, to: identities[0].uuid, canonicalId: doc._id, canonicalName: doc.name, logicalHash: doc.flags.fvttJsonGenerator.bloodHunter2024.logicalHash, canonicalDescriptionHash: sha(doc.system.description ?? {}), inspectedDescriptionHash: grant.referenced.descriptionHash, canonicalSystemHash: sha(doc.system), inspectedSystemHash: grant.referenced.systemHash };
});
const result = { status: 'OFFLINE_SOURCE_RECOVERY_ONLY', sourceSha256: sourceHash, actorId: actor.actorId, actorBeforeHash: actor.beforeHash, itemId: item.id, itemBeforeHash: item.beforeHash, rows, recovered: rows.filter(r => r.to).length, approvalWritten: false, worldWrites: 0, remainingGate: 'Runtime source document readback, content review, exact candidate schema and invariant preview before any apply.' };
await writeFile(resolve(evidence, 'blood-hunter-source-recovery-20260929.json'), JSON.stringify(result, null, 2), { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ recovered: result.recovered, total: rows.length, rows: rows.map(r => ({ name: r.name, status: r.status, to: r.to })) }));

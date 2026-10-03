import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCandidateReport } from './candidate-report.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(here, 'dist/dnd5e_classpack');
const auditFile = join(sourceRoot, 'source-reference-audit.json');
const output = join(here, 'reference-contexts.json');
if (!existsSync(auditFile)) throw new Error('Build the pinned classpack candidate before source-context audit');
if (existsSync(output)) throw new Error('Source-context report already exists; refusing overwrite');
const { ClassicLevel } = await import(pathToFileURL('F:/FoundryLab/foundry-v14/app/14.368/node_modules/classic-level/index.js').href);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const audit = JSON.parse(readFileSync(auditFile, 'utf8'));
const buildReport = readCandidateReport(here);
const result: Array<Record<string, unknown>> = [];
for (const issue of audit.upstreamUnresolved as Array<{ reference: string; reason: string; firstLocation: string }>) {
  const location = issue.firstLocation;
  if (!/\.system\.(?:advancement|activities|spells)\./.test(location)) continue;
  const [pack, rest] = location.split(':', 2);
  const fieldOffset = rest.indexOf('.system.');
  if (fieldOffset < 0) continue;
  const key = rest.slice(0, fieldOffset);
  const fieldPath = rest.slice(fieldOffset + 1);
  const db = new ClassicLevel(join(sourceRoot, 'packs', pack), {
    createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json', readOnly: true,
  });
  await db.open();
  let document: Record<string, unknown>;
  try { document = await db.get(key); }
  finally { await db.close(); }
  const approvedPatches = buildReport.contentPatches.filter((patch: { pack: string; id: string }) =>
    patch.pack === pack && patch.id === document._id);
  if (approvedPatches.length) {
    document = structuredClone(document);
    for (const patch of approvedPatches) {
      let holder: Record<string, unknown> = document;
      const patchPath = String(patch.field).split('.');
      for (const segment of patchPath.slice(0, -1)) holder = holder[segment] as Record<string, unknown>;
      holder[patchPath.at(-1)!] = patch.oldUuid;
    }
    if (sha256(JSON.stringify(document)) !== approvedPatches[0].sourceSha256) {
      throw new Error(`Approved patch cannot reconstruct source preimage: ${pack}:${key}`);
    }
  }
  const parts = fieldPath.split('.');
  let owner: unknown = document;
  for (const part of parts.slice(0, -1)) owner = (owner as Record<string, unknown> | undefined)?.[part];
  const fieldValue = (owner as Record<string, unknown> | undefined)?.[parts.at(-1)!];
  const system = document.system as Record<string, unknown>;
  const advancementIndex = parts[0] === 'system' && parts[1] === 'advancement' ? Number(parts[2]) : null;
  const advancement = advancementIndex !== null ? (system.advancement as unknown[])?.[advancementIndex] : null;
  const activityKey = parts[0] === 'system' && parts[1] === 'activities' ? parts[2] : null;
  const activity = activityKey ? (system.activities as Record<string, unknown>)?.[activityKey] : null;
  const description = system.description;
  const descriptionText = typeof description === 'string' ? description
    : typeof description === 'object' && description ? String((description as Record<string, unknown>).value ?? '') : '';
  result.push({
    reference: issue.reference, reason: issue.reason, location, fieldValue,
    parent: { pack, key, id: document._id, name: document.name, type: document.type,
      sourceDataSha256: sha256(JSON.stringify(document)) },
    advancement, activity,
    sourceDescriptionExcerpt: descriptionText.slice(0, 6000),
    sourceDescriptionTruncated: descriptionText.length > 6000,
  });
}
writeFileSync(output, `${JSON.stringify({ release: 'v4.3.4', candidate: '4.3.4-next.1',
  sourceAudit: auditFile, activeReferenceCount: result.length, entries: result }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ file: output, activeReferenceCount: result.length, references: result.map(entry => entry.reference) }));

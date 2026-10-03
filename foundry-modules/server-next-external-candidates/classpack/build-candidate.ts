import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

import {
  CLASSPACK_PACK_IDENTITIES,
  patchClasspackMacroDocument,
  patchClasspackManifest,
} from '../../../tools/foundry-ops/src/lab/classpackV14.ts';
import { expectedEmbeddedMacroPatchCount, patchEmbeddedMacroDocument } from './embedded-macro-patches.ts';
import { patchApprovedClasspackContent } from './content-patches.ts';
import { patchSourceEstablishedReferences, sourceReferenceRepairs } from './source-reference-patches.ts';
import { projectTcoeInitializations, TCOE_OVERLAY_SOURCE } from './tcoe-overlay-projection.ts';
import { composeClasspackRuntime } from './compose-runtime.ts';
import { assertNewCandidateOutputsAbsent, candidatePaths } from './candidate-report.ts';

const here = dirname(fileURLToPath(import.meta.url));
const archive = join(here, 'upstream/dnd5e_classpack-v4.3.4.zip');
const { candidate: output, generatedReport: reportFile } = candidatePaths(here);
const expectedArchiveSha256 = '8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1';
const target = { core: '14.368', dnd5e: '6.0.5', dae: '14.0.14+servernext.1', midi: '14.6.0-beta.4338eeab.local.10' };
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new Error(message); };

if (!existsSync(archive)) fail(`Pinned release archive missing: ${archive}`);
if (sha256(readFileSync(archive)) !== expectedArchiveSha256) fail('Pinned release SHA-256 differs');
assertNewCandidateOutputsAbsent(here);
execFileSync('python', [join(here, 'extract-release.py'), archive, output], { stdio: 'inherit' });

const manifestFile = join(output, 'module.json');
const sourceManifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const v14Checked = patchClasspackManifest(sourceManifest);
const packNames = v14Checked.packs.map((pack: { name: string }) => pack.name);
if (JSON.stringify(packNames) !== JSON.stringify(CLASSPACK_PACK_IDENTITIES.map(pack => pack.name))) {
  fail('Release pack names differ from protected identity baseline');
}
const runtimeFile = join(output, 'scripts/next-migration.mjs');
const runtimeSource = composeClasspackRuntime(here);
if (!runtimeSource.includes('DND5E_CLASSPACK_SERVER_NEXT_RUNTIME_1')) fail('Candidate runtime sentinel missing');
const projectionContext = vm.createContext({ Hooks: { once() {}, on() {} } });
vm.runInContext(`${runtimeSource}\nglobalThis.canonicalFields = canonicalSourceTextFields;`, projectionContext);
const canonicalFields = (value: unknown, kind: string): Array<[string, string]> => projectionContext.canonicalFields(value, kind);

const relationships = structuredClone(v14Checked.relationships);
relationships.systems = relationships.systems.map((entry: Record<string, unknown>) => entry.id === 'dnd5e'
  ? { ...entry, compatibility: { minimum: target.dnd5e, verified: target.dnd5e, maximum: target.dnd5e } }
  : entry);
relationships.recommends = relationships.recommends
  .filter((entry: Record<string, unknown>) => entry.id !== 'dnd5e_DMTools')
  .map((entry: Record<string, unknown>) => {
    const version = entry.id === 'dae' ? target.dae : entry.id === 'midi-qol' ? target.midi : null;
    return version ? { ...entry, compatibility: { minimum: version, verified: version, maximum: version } } : entry;
  });
const flags = structuredClone(sourceManifest.flags ?? {});
flags.classpackNext = {
  upstreamVersion: '4.3.4',
  upstreamArchiveSha256: expectedArchiveSha256,
  target,
  migrationRevision: 4,
  sourceProjectionRevision: 7,
  migration: 'explicit-runtime-api',
  acceptance: 'offline-candidate',
};
const candidateManifest = {
  ...v14Checked,
  version: '4.3.4-next.1',
  compatibility: { minimum: target.core, verified: target.core, maximum: target.core },
  relationships,
  esmodules: ['scripts/next-migration.mjs'],
  flags,
};
delete candidateManifest.manifest;
delete candidateManifest.download;

const classicLevelEntry = 'F:/FoundryLab/foundry-v14/app/14.368/node_modules/classic-level/index.js';
if (!existsSync(classicLevelEntry)) fail(`Exact Core classic-level unavailable: ${classicLevelEntry}`);
const { ClassicLevel } = await import(pathToFileURL(classicLevelEntry).href);
if (typeof ClassicLevel !== 'function') fail('Exact Core classic-level export unavailable');

type Row = { key: string; value: Record<string, unknown> };
const reports: Array<Record<string, unknown>> = [];
const allIdentities: string[] = [];
const allSourceRefs = new Map<string, number>();
const sourceReferenceLocations = new Map<string, string>();
const candidateRefs = new Map<string, number>();
const candidateReferenceLocations = new Map<string, string>();
const knownTopLevelIds = new Map<string, Set<string>>();
const knownEmbeddedIds = new Map<string, Set<string>>();
const allImageRefs = new Map<string, number>();
const missingImageRefs = new Map<string, number>();
const macroReports: Array<Record<string, unknown>> = [];
const embeddedMacroCommands: Array<Record<string, unknown>> = [];
const candidateEmbeddedMacroCommands: Array<Record<string, unknown>> = [];
const embeddedMacroPatches: Array<Record<string, unknown>> = [];
const contentPatches: Array<Record<string, unknown>> = [];
const referencePatches: Array<Record<string, unknown>> = [];
const baselinePacks: Array<{ name: string; type: string; records: Array<Record<string, unknown>> }> = [];
const sourceDocumentHashes: Array<Record<string, unknown>> = [];
const itemTypes = new Map<string, number>();
const missingActivitiesByType = new Map<string, number>();
let totalRows = 0;
let totalDocuments = 0;

const topPrefix = { Actor: '!actors!', Item: '!items!', JournalEntry: '!journal!', RollTable: '!tables!', Macro: '!macros!' };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const legacyMacroPatterns: Array<[RegExp, string]> = [
  [/\.rollAbilitySave\(/, 'removed rollAbilitySave'],
  [/\.rollSavingThrow\("[a-z]+"/, 'legacy positional rollSavingThrow'],
  [/\.data\.getLocalPosition\(/, 'legacy PIXI pointer data'],
  [/foundry\.utils\.duplicate\(|(?<![\w.])duplicate\(/, 'removed duplicate helper'],
  [/await MidiQOL\.moveToken\([^\n]*,\s*(?:false|true|Boolean\(animate\))\s*\)/, 'legacy Midi moveToken option'],
  [/\bitemCardId\s*:/, 'legacy Midi DamageOnlyWorkflow itemCardId'],
];

function count(map: Map<string, number>, key: string) { map.set(key, (map.get(key) ?? 0) + 1); }
function collectIdentity(value: unknown, prefix: string): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((entry, index) => collectIdentity(entry, `${prefix}[${index}]`)); return; }
  const record = value as Record<string, unknown>;
  if (typeof record._id === 'string') allIdentities.push(`${prefix}\0${record._id}`);
  for (const [key, entry] of Object.entries(record)) collectIdentity(entry, `${prefix}.${key}`);
}
function advancementById(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const entries = Array.isArray(value)
    ? value.map(entry => [entry?._id ?? entry?.id, entry])
    : Object.entries(value);
  return Object.fromEntries(entries.map(([key, raw]) => {
    const entry = raw as Record<string, unknown>;
    const id = entry?._id ?? entry?.id ?? key;
    if (typeof id !== 'string' || !id) fail('Classpack Advancement has no source ID');
    if (!Array.isArray(value) && key !== id) fail('Classpack Advancement storage key differs from source ID');
    return [id, entry];
  }));
}
function sourceTextFields(value: unknown, path = ''): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    if (['items', 'effects', 'pages', 'results'].includes(key)) continue;
    const next = path ? `${path}.${key}` : key;
    if (typeof child === 'string' && /(?:description|biography|text|content)(?:\.|$)/i.test(next)) {
      result.push([next, child]);
    } else if (child && typeof child === 'object') {
      result.push(...sourceTextFields(key === 'advancement' ? advancementById(child) : child, next));
    }
  }
  return result.sort(([left], [right]) => left.localeCompare(right));
}
function advancementIds(value: Record<string, unknown>): string[] {
  const system = value.system as Record<string, unknown> | undefined;
  const advancement = system?.advancement;
  return Object.keys(advancementById(advancement)).sort();
}
function activeUuids(value: Record<string, unknown>): Array<[string, string]> {
  const system = value.system as Record<string, unknown> | undefined;
  const found: Array<[string, string]> = [];
  const walk = (entry: unknown, path: string): void => {
    if (!entry || typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      const next = path ? `${path}.${key}` : key;
      if (key === 'uuid' && typeof child === 'string' && child !== '') found.push([next, child]);
      else walk(child, next);
    }
  };
  for (const key of ['advancement', 'activities', 'spells']) {
    walk(key === 'advancement' ? advancementById(system?.[key]) : system?.[key], `system.${key}`);
  }
  return found.sort(([left], [right]) => left.localeCompare(right));
}
function mechanicalValue(value: unknown, path = ''): unknown {
  if (typeof value === 'string' && /(?:description|biography|text|content)(?:\.|$)/i.test(path)) return '<source-text>';
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry, index) => mechanicalValue(entry, `${path}.${index}`));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    mechanicalValue(child, path ? `${path}.${key}` : key)]));
}
function auditCommands(value: unknown, location: string, packType: string, isPackMacro: boolean,
  sink: Array<Record<string, unknown>> = embeddedMacroCommands): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => auditCommands(entry, `${location}[${index}]`, packType, false, sink));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = `${location}.${key}`;
    if (key === 'command' && typeof child === 'string' && child.trim()) {
      if (isPackMacro && next.endsWith('.command')) continue; // The established 12-Macro patch checks these.
      const issues: string[] = [];
      try { new AsyncFunction('args', 'actor', 'token', child); }
      catch (error) { issues.push(`syntax: ${error instanceof Error ? error.message : String(error)}`); }
      for (const [pattern, label] of legacyMacroPatterns) if (pattern.test(child)) issues.push(label);
      sink.push({ location: next, packType, sha256: sha256(child), issues });
    }
    auditCommands(child, next, packType, false, sink);
  }
}
function auditText(value: unknown, location: string, candidate = false): void {
  if (typeof value === 'string') {
    const refs = candidate ? candidateRefs : allSourceRefs;
    const locations = candidate ? candidateReferenceLocations : sourceReferenceLocations;
    for (const match of value.matchAll(/Compendium\.dnd5e_classpack\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g)) {
      count(refs, match[0]);
      if (!locations.has(match[0])) locations.set(match[0], location);
    }
    if (candidate) return;
    for (const match of value.matchAll(/modules\/dnd5e_classpack\/[^"'<>\r\n\t\\]*?\.(?:png|jpe?g|webp|svg|gif|webm)/gi)) {
      const reference = match[0];
      count(allImageRefs, reference);
      const relative = decodeURIComponent(reference.slice('modules/dnd5e_classpack/'.length));
      const candidateAsset = resolve(output, relative);
      const osPath = process.platform === 'win32' ? `\\\\?\\${candidateAsset}` : candidateAsset;
      if (!existsSync(osPath)) count(missingImageRefs, reference);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) auditText(entry, `${location}.${key}`, candidate);
}

for (const pack of CLASSPACK_PACK_IDENTITIES) {
  const dbPath = join(output, pack.path);
  const db = new ClassicLevel(dbPath, { createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json' });
  await db.open();
  const rows: Row[] = [];
  const pending: Row[] = [];
  const baselineRecords: Array<Record<string, unknown>> = [];
  const packTopIds = new Set<string>();
  const packEmbeddedIds = new Set<string>();
  let documentCount = 0;
  try {
    for await (const [key, raw] of db.iterator()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`Invalid ${pack.name} record ${key}`);
      const value = raw as Record<string, unknown>;
      rows.push({ key, value });
      const id = typeof value._id === 'string' ? value._id : fail(`Missing _id in ${pack.name}:${key}`);
      const kind = key.match(/^![^!]+!/)?.[0] ?? '<other>';
      const suffix = key.slice(kind.length);
      const rootId = suffix.split('.')[0];
      const isTopLevel = kind === topPrefix[pack.type];
      if (isTopLevel) {
        if (packTopIds.has(id)) fail(`Duplicate ${pack.name} top-level document ID ${id}`);
        packTopIds.add(id);
        documentCount += 1;
        const textSha256 = sha256(JSON.stringify(sourceTextFields(value)));
        const mechanicalSha256 = sha256(JSON.stringify(mechanicalValue(value)));
        sourceDocumentHashes.push({ pack: pack.name, id, name: value.name ?? null,
          sourceDataSha256: sha256(JSON.stringify(value)), sourceTextSha256: textSha256,
          sourceMechanicalSha256: mechanicalSha256 });
      } else if (kind !== '!folders!') packEmbeddedIds.add(id);
      if (kind !== '!folders!') {
        baselineRecords.push({ key, kind, rootId, id, name: value.name ?? null,
          textSha256: sha256(JSON.stringify(sourceTextFields(value))),
          textFieldPaths: sourceTextFields(value).map(([path]) => path),
          advancementIds: advancementIds(value), activeUuids: activeUuids(value) });
      }
      allIdentities.push(`${pack.name}\0${key}\0${id}`);
      collectIdentity(value, `${pack.name}:${key}`);
      auditText(value, `${pack.name}:${key}`);
      auditCommands(value, `${pack.name}:${key}`, pack.type, pack.type === 'Macro' && kind === '!macros!');
      let candidateDocument = value;
      if (pack.type === 'Item' && isTopLevel) {
        const patched = patchEmbeddedMacroDocument(pack.name, value);
        embeddedMacroPatches.push(...patched.reports);
        const approved = patchApprovedClasspackContent(pack.name, patched.document);
        if (approved.report) contentPatches.push(approved.report);
        candidateDocument = approved.document;
      }
      if (pack.type === 'Item' && isTopLevel) {
        const type = String(value.type ?? '<missing>');
        count(itemTypes, type);
        const system = value.system as Record<string, unknown> | undefined;
        if (!system?.activities || Object.keys(system.activities as object).length === 0) count(missingActivitiesByType, type);
      }
      if (pack.type === 'Macro') {
        if (key.startsWith('!macros!')) {
          const patched = patchClasspackMacroDocument(value);
          macroReports.push(patched.report);
          candidateDocument = patched.document as Record<string, unknown>;
        }
      }
      const references = patchSourceEstablishedReferences(pack.name, key, candidateDocument);
      referencePatches.push(...references.reports);
      candidateDocument = references.document;
      if (candidateDocument !== value) pending.push({ key, value: candidateDocument });
      if (kind !== '!folders!') {
        baselineRecords.at(-1)!.activeUuids = activeUuids(candidateDocument);
        baselineRecords.at(-1)!.textSha256 = sha256(JSON.stringify(sourceTextFields(candidateDocument)));
        baselineRecords.at(-1)!.textFieldPaths = sourceTextFields(candidateDocument).map(([path]) => path);
        const canonical = canonicalFields(candidateDocument, kind);
        baselineRecords.at(-1)!.canonicalTextSha256 = sha256(JSON.stringify(canonical));
        baselineRecords.at(-1)!.canonicalTextFieldPaths = canonical.map(([path]) => path);
        baselineRecords.at(-1)!.sourceRules = (candidateDocument.system as { source?: { rules?: string } } | undefined)?.source?.rules ?? null;
        if (['class', 'subclass'].includes(String(candidateDocument.type))) {
          const projected = projectTcoeInitializations(candidateDocument);
          if (JSON.stringify(advancementIds(projected)) !== JSON.stringify(advancementIds(candidateDocument))
            || JSON.stringify(activeUuids(projected)) !== JSON.stringify(activeUuids(candidateDocument))) {
            baselineRecords.at(-1)!.tcoeProjection = { advancementIds: advancementIds(projected), activeUuids: activeUuids(projected) };
          }
        }
      }
      auditText(candidateDocument, `${pack.name}:${key}`, true);
      if (pack.type === 'Item' && isTopLevel) {
        auditCommands(candidateDocument, `${pack.name}:${key}`, pack.type, false, candidateEmbeddedMacroCommands);
      }
    }
    if (pack.type === 'Macro' && macroReports.length !== 12) fail(`Expected 12 Macro records; found ${macroReports.length}`);
    for (const row of pending) await db.put(row.key, row.value);
  } finally { await db.close(); }
  const expectedRows = new Map(rows.map(row => [row.key, pending.find(update => update.key === row.key)?.value ?? row.value]));
  const check = new ClassicLevel(dbPath, { createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json', readOnly: true });
  await check.open();
  let checked = 0;
  try {
    for await (const [key, value] of check.iterator()) {
      const expected = expectedRows.get(key);
      if (!expected || sha256(JSON.stringify(value)) !== sha256(JSON.stringify(expected))) {
        fail(`Candidate record changed unexpectedly: ${pack.name}:${key}`);
      }
      checked += 1;
    }
  } finally { await check.close(); }
  if (checked !== rows.length) fail(`Candidate ${pack.name} record count changed`);
  for (const record of baselineRecords) {
    const kind = String(record.kind);
    const parts = String(record.key).slice(kind.length).split('.');
    if (kind === '!items.effects!') {
      const parent = expectedRows.get(`!items!${parts[0]}`);
      const declared = (parent?.effects ?? []) as Array<string | { _id: string }>;
      record.detachedFromParent = !declared.some(id => (typeof id === 'string' ? id : id._id) === record.id);
      if (record.detachedFromParent) record.parentDeclaredChildIds = declared;
    }
  }
  baselinePacks.push({ name: pack.name, type: pack.type, records: baselineRecords });
  knownTopLevelIds.set(pack.name, packTopIds);
  knownEmbeddedIds.set(pack.name, packEmbeddedIds);
  reports.push({ name: pack.name, type: pack.type, databaseRecords: rows.length,
    documents: documentCount, embeddedOrFolderRecords: rows.length - documentCount, patchedMacros: pending.length,
    sourceContentSha256: sha256(rows.map(row => `${row.key}\0${JSON.stringify(row.value)}`).sort().join('\n')) });
  totalRows += rows.length;
  totalDocuments += documentCount;
}

if (embeddedMacroPatches.length !== expectedEmbeddedMacroPatchCount) {
  fail(`Expected ${expectedEmbeddedMacroPatchCount} embedded Macro patches; found ${embeddedMacroPatches.length}`);
}
if (contentPatches.length !== 2) fail(`Expected two specifically approved content repairs; found ${contentPatches.length}`);
for (const repair of sourceReferenceRepairs) {
  const target = sourceDocumentHashes.find(entry => entry.pack === repair.pack && entry.id === repair.id);
  if (!target || target.name !== repair.name) fail(`Source-established counterpart missing or renamed: ${repair.name}`);
  if (!referencePatches.some(entry => String(entry.oldUuid).endsWith(repair.oldId))) {
    fail(`Source-established repair did not match its original input: ${repair.oldId}`);
  }
}
const remainingEmbeddedIssues = candidateEmbeddedMacroCommands.filter(entry => (entry.issues as string[]).length);
if (remainingEmbeddedIssues.length) fail(`Candidate retains ${remainingEmbeddedIssues.length} flagged embedded Macro commands`);

allIdentities.sort();
const unresolvedReferences: Array<Record<string, unknown>> = [];
const packOnlyReferences: Array<Record<string, unknown>> = [];
function unresolved(refs: Map<string, number>, locations: Map<string, string>) {
  const result: Array<Record<string, unknown>> = [];
for (const [reference, occurrences] of refs) {
  const parts = reference.slice('Compendium.dnd5e_classpack.'.length).split('.');
  const packName = parts[0];
  const declared = CLASSPACK_PACK_IDENTITIES.find(pack => pack.name === packName);
  if (declared && parts.length === 1) {
    if (refs === allSourceRefs) packOnlyReferences.push({ reference, occurrences, firstLocation: locations.get(reference) });
    continue;
  }
  const typed = declared && parts[1] === declared.type;
  const documentType = declared?.type;
  const documentId = parts[typed ? 2 : 1];
  const embeddedType = parts[typed ? 3 : 2], embeddedId = parts[typed ? 4 : 3];
  let reason = '';
  if (!declared) reason = 'pack-not-declared';
  else if (!typed && ['Actor', 'Item', 'JournalEntry', 'Macro', 'RollTable'].includes(parts[1])) reason = 'document-type-mismatch';
  else if (!documentId || !knownTopLevelIds.get(packName)?.has(documentId)) reason = 'top-level-document-id-missing';
  else if (embeddedType && (!embeddedId || !knownEmbeddedIds.get(packName)?.has(embeddedId))) {
    reason = 'embedded-document-id-missing';
  }
  if (reason) result.push({ reference, occurrences, reason, firstLocation: locations.get(reference) });
}
return result;
}
unresolvedReferences.push(...unresolved(allSourceRefs, sourceReferenceLocations));
const candidateUnresolvedReferences = unresolved(candidateRefs, candidateReferenceLocations);
const activeReference = (entry: Record<string, unknown>) =>
  /\.system\.(?:advancement|activities|spells)\./.test(String(entry.firstLocation));
const sourceBaseline = { moduleId: 'dnd5e_classpack', upstreamVersion: '4.3.4',
  archiveSha256: expectedArchiveSha256, packs: baselinePacks,
  nativeMigrationPolicy: { bypassVersionCheck: false, explicitRulesPreserved: true,
    mode: 'source-preserving-normal-api', newEffectIdsAllowed: false,
    legacyAdvancementArrayWireUuids: [], tcoeSourceInterop: 'public-pre-and-setup-post-hooks',
    daeCompendiumGuardSha256: '3411dfc47e44255ead045c621402791697c5d0f70b329e708e3c6a06f87defac' },
  runtimeOverlays: { tcoe: { version: TCOE_OVERLAY_SOURCE.version, scriptSha256: TCOE_OVERLAY_SOURCE.sha256 } } };
const sourceBaselineText = `${JSON.stringify(sourceBaseline)}\n`;
const sourceBaselineSha256 = sha256(sourceBaselineText);
flags.classpackNext.sourceBaselineSha256 = sourceBaselineSha256;
flags.classpackNext.runtimeSha256 = sha256(runtimeSource);
writeFileSync(join(output, 'source-baseline.json'), sourceBaselineText, { flag: 'wx' });
writeFileSync(join(output, 'source-document-hashes.json'), `${JSON.stringify(sourceDocumentHashes, null, 2)}\n`, { flag: 'wx' });
writeFileSync(join(output, 'source-reference-audit.json'), `${JSON.stringify({ uniqueReferences: allSourceRefs.size,
  validPackOnlyReferences: packOnlyReferences,
  upstreamUnresolved: unresolvedReferences,
  candidateUnresolved: candidateUnresolvedReferences }, null, 2)}\n`, { flag: 'wx' });
writeFileSync(join(output, 'embedded-macro-audit.json'), `${JSON.stringify({ upstreamCommands: embeddedMacroCommands,
  candidateCommands: candidateEmbeddedMacroCommands, patched: embeddedMacroPatches }, null, 2)}\n`, { flag: 'wx' });
mkdirSync(dirname(runtimeFile), { recursive: true });
writeFileSync(runtimeFile, runtimeSource, { flag: 'wx' });
writeFileSync(manifestFile, `${JSON.stringify(candidateManifest, null, 2)}\n`);
const report = {
  source: { release: 'v4.3.4', archiveSha256: expectedArchiveSha256, url: 'https://api.github.com/repos/HJSmile/classpack/releases/tags/v4.3.4' },
  candidate: { path: output, version: candidateManifest.version, manifestSha256: sha256(readFileSync(manifestFile)), runtimeSha256: sha256(runtimeSource) },
  target, packCount: reports.length, databaseRecords: totalRows, topLevelDocuments: totalDocuments,
  sourceBaselineSha256, sourceDocumentHashCount: sourceDocumentHashes.length,
  identityCount: allIdentities.length,
  identitySha256: sha256(allIdentities.join('\n')), packs: reports, macros: macroReports,
  embeddedMacroPatches, contentPatches, referencePatches,
  contentSignals: {
    itemTypes: Object.fromEntries([...itemTypes].sort()),
    itemsWithoutActivitiesByType: Object.fromEntries([...missingActivitiesByType].sort()),
    uniqueClasspackReferences: allSourceRefs.size,
    uniqueLocalAssetsReferenced: allImageRefs.size,
    missingLocalAssets: Object.fromEntries([...missingImageRefs].sort().slice(0, 50)),
    missingLocalAssetUniqueCount: missingImageRefs.size,
    embeddedMacroCommandCount: embeddedMacroCommands.length,
    upstreamEmbeddedMacroIssueCount: embeddedMacroCommands.filter(entry => (entry.issues as string[]).length).length,
    upstreamEmbeddedMacroIssues: embeddedMacroCommands.filter(entry => (entry.issues as string[]).length).slice(0, 40),
    candidateEmbeddedMacroIssueCount: remainingEmbeddedIssues.length,
    validPackOnlyReferenceCount: packOnlyReferences.length,
    upstreamUnresolvedInternalReferenceCount: unresolvedReferences.length,
    candidateUnresolvedInternalReferenceCount: candidateUnresolvedReferences.length,
    candidateActiveUnresolvedReferenceCount: candidateUnresolvedReferences.filter(activeReference).length,
    candidateUnresolvedInternalReferences: candidateUnresolvedReferences.slice(0, 40),
  },
  acceptance: { offlineBuild: 'DONE', FoundryRuntime: 'NOT_EXECUTED', characterCreation: 'NOT_EXECUTED', gameplay: 'NOT_EXECUTED' },
};
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ candidate: output, packCount: reports.length, topLevelRecords: totalRows,
  topLevelDocuments: totalDocuments, identitySha256: report.identitySha256,
  changedMacros: macroReports.filter(entry => entry.changed).length,
  embeddedMacroPatches: embeddedMacroPatches.length,
  approvedContentPatches: contentPatches.length,
  remainingEmbeddedMacroIssues: remainingEmbeddedIssues.length,
  candidateUnresolvedInternalReferences: candidateUnresolvedReferences.length,
  candidateActiveUnresolvedReferences: candidateUnresolvedReferences.filter(activeReference).length,
  missingLocalAssetUniqueCount: missingImageRefs.size }));

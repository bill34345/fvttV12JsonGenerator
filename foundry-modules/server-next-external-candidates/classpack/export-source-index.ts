import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCandidateReport } from './candidate-report.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(here, 'dist/dnd5e_classpack');
const report = readCandidateReport(here);
const sourceDocuments = JSON.parse(readFileSync(join(sourceRoot, 'source-document-hashes.json'), 'utf8'));
const output = join(here, 'reference-source-index.json');
const refreshOwned = process.argv.includes('--refresh-owned');
if (existsSync(output) && !refreshOwned) throw new Error('Source index already exists; refusing overwrite');
if (existsSync(output) && refreshOwned) {
  const previous = JSON.parse(readFileSync(output, 'utf8'));
  if (previous.upstreamArchiveSha256 !== report.source.archiveSha256
    || previous.sourceBaselineSha256 !== report.sourceBaselineSha256
    || previous.documentCount !== report.topLevelDocuments) {
    throw new Error('Existing owned source index has a different source identity');
  }
}
const packTypes = new Map(report.packs.map((pack: { name: string; type: string }) => [pack.name, pack.type]));
const entries = sourceDocuments.map((entry: Record<string, unknown>) => ({
  ...entry,
  documentType: packTypes.get(entry.pack),
  upstreamVersion: '4.3.4',
}));
if (entries.length !== report.topLevelDocuments) throw new Error('Source document count differs from full audit');
const content = `${JSON.stringify({ upstreamArchiveSha256: report.source.archiveSha256,
  sourceBaselineSha256: report.sourceBaselineSha256,
  documentCount: entries.length, entries }, null, 2)}\n`;
if (refreshOwned && existsSync(output)) {
  const temporary = join(here, '.reference-source-index.json.tmp');
  writeFileSync(temporary, content, { flag: 'wx' });
  renameSync(temporary, output);
} else writeFileSync(output, content, { flag: 'wx' });
console.log(JSON.stringify({ file: output, documentCount: entries.length }));

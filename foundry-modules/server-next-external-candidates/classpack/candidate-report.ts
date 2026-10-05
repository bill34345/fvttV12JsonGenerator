import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ClasspackContentPatchReport {
  pack: string;
  id: string;
  field: string;
  sourceSha256: string;
  candidateSha256: string;
  oldUuid?: string;
  newUuid?: string;
  oldValue?: string;
  newValue?: string;
  [key: string]: unknown;
}

export interface ClasspackCandidateReport {
  source: { release: string; archiveSha256: string; url: string };
  candidate: {
    path: string;
    version: string;
    manifestSha256: string;
    runtimeSha256: string;
  };
  sourceBaselineSha256: string;
  topLevelDocuments: number;
  databaseRecords: number;
  identitySha256: string;
  packs: Array<{ name: string; type: string; patchedMacros: number; [key: string]: unknown }>;
  macros: Array<{ changed: boolean; [key: string]: unknown }>;
  embeddedMacroPatches: unknown[];
  contentPatches: ClasspackContentPatchReport[];
  referencePatches: unknown[];
  contentSignals: {
    candidateEmbeddedMacroIssueCount: number;
    missingLocalAssetUniqueCount: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const candidatePaths = (here: string) => ({
  candidate: join(here, 'dist/dnd5e_classpack'),
  generatedReport: join(here, 'dist/candidate-report.json'),
  historicalReport: join(here, 'candidate-report.json'),
});

export function assertNewCandidateOutputsAbsent(here: string, exists: (path: string) => boolean = path => existsSync(path)): void {
  const { candidate, generatedReport } = candidatePaths(here);
  if (exists(candidate) || exists(generatedReport)) {
    throw new Error('Candidate or generated report already exists; refusing overwrite');
  }
}

export function candidateReportPath(here: string, exists: (path: string) => boolean = path => existsSync(path)): string {
  const { generatedReport, historicalReport } = candidatePaths(here);
  if (exists(generatedReport)) return generatedReport;
  if (exists(historicalReport)) return historicalReport;
  throw new Error('Candidate report missing');
}

export function readCandidateReport(here: string): ClasspackCandidateReport {
  const { candidate } = candidatePaths(here);
  const report = JSON.parse(readFileSync(candidateReportPath(here), 'utf8')) as ClasspackCandidateReport;
  const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const identities: Array<[string, string]> = [
    ['module.json', report.candidate?.manifestSha256],
    ['scripts/next-migration.mjs', report.candidate?.runtimeSha256],
    ['source-baseline.json', report.sourceBaselineSha256],
  ];
  for (const [file, expected] of identities) {
    if (typeof expected !== 'string' || sha256(join(candidate, file)) !== expected) {
      throw new Error(`Candidate report identity differs from ${file}`);
    }
  }
  return report;
}

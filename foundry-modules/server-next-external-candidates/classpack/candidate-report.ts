import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const candidatePaths = (here: string) => ({
  candidate: join(here, 'dist/dnd5e_classpack'),
  generatedReport: join(here, 'dist/candidate-report.json'),
  historicalReport: join(here, 'candidate-report.json'),
});

export function assertNewCandidateOutputsAbsent(here: string, exists = existsSync): void {
  const { candidate, generatedReport } = candidatePaths(here);
  if (exists(candidate) || exists(generatedReport)) {
    throw new Error('Candidate or generated report already exists; refusing overwrite');
  }
}

export function candidateReportPath(here: string, exists = existsSync): string {
  const { generatedReport, historicalReport } = candidatePaths(here);
  if (exists(generatedReport)) return generatedReport;
  if (exists(historicalReport)) return historicalReport;
  throw new Error('Candidate report missing');
}

export function readCandidateReport(here: string): Record<string, any> {
  const { candidate } = candidatePaths(here);
  const report = JSON.parse(readFileSync(candidateReportPath(here), 'utf8'));
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

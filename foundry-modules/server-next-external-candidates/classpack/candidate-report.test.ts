import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { candidatePaths, readCandidateReport, type ClasspackCandidateReport } from './candidate-report.ts';

const candidateFiles = [
  { path: 'module.json', content: '{"id":"dnd5e_classpack"}' },
  { path: 'scripts/next-migration.mjs', content: 'export const revision = 4;\n' },
  { path: 'source-baseline.json', content: '{"source":"fixture"}\n' },
] as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function withCandidateFixture<T>(
  run: (reportRoot: string, candidateDirectory: string) => T,
  options: { separateCandidate?: boolean } = {},
): T {
  const root = mkdtempSync(join(tmpdir(), 'classpack-candidate-report-'));
  const reportRoot = join(root, 'checkout', 'classpack');
  const candidateDirectory = options.separateCandidate
    ? join(root, 'inputs', 'classpack', 'dist', 'dnd5e_classpack')
    : join(reportRoot, 'dist', 'dnd5e_classpack');
  mkdirSync(candidateDirectory, { recursive: true });

  const contents = new Map<string, string>();
  for (const { path, content } of candidateFiles) {
    contents.set(path, content);
    const target = join(candidateDirectory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const report: ClasspackCandidateReport = {
    source: { release: 'fixture', archiveSha256: '0'.repeat(64), url: 'https://example.invalid/fixture.zip' },
    candidate: {
      path: candidateDirectory,
      version: 'fixture',
      manifestSha256: sha256(contents.get('module.json')!),
      runtimeSha256: sha256(contents.get('scripts/next-migration.mjs')!),
    },
    sourceBaselineSha256: sha256(contents.get('source-baseline.json')!),
    topLevelDocuments: 0,
    databaseRecords: 0,
    identitySha256: 'fixture',
    packs: [],
    macros: [],
    embeddedMacroPatches: [],
    contentPatches: [],
    referencePatches: [],
    contentSignals: { candidateEmbeddedMacroIssueCount: 0, missingLocalAssetUniqueCount: 0 },
  };
  const { historicalReport } = candidatePaths(reportRoot);
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(historicalReport, JSON.stringify(report));

  try {
    return run(reportRoot, candidateDirectory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('readCandidateReport keeps the default candidate directory relative to the report root', () => {
  withCandidateFixture(reportRoot => {
    const report = readCandidateReport(reportRoot);
    expect(report.candidate.version).toBe('fixture');
  });
});

test('readCandidateReport can use a tracked report with candidate data in a separate input root', () => {
  withCandidateFixture((reportRoot, candidateDirectory) => {
    expect(candidateDirectory).not.toBe(join(reportRoot, 'dist/dnd5e_classpack'));
    const report = readCandidateReport(reportRoot, candidateDirectory);
    expect(report.candidate.version).toBe('fixture');
  }, { separateCandidate: true });
});

for (const { path, content } of candidateFiles) {
  test(`readCandidateReport rejects a changed ${path}`, () => {
    withCandidateFixture((reportRoot, candidateDirectory) => {
      writeFileSync(join(candidateDirectory, path), `${content}changed`);
      expect(() => readCandidateReport(reportRoot, candidateDirectory))
        .toThrow(`Candidate report identity differs from ${path}`);
    });
  });
}

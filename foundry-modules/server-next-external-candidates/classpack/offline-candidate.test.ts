import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeClasspackRuntime } from './compose-runtime.ts';
import { patchApprovedClasspackContent } from './content-patches.ts';
import { assertNewCandidateOutputsAbsent, candidatePaths, candidateReportPath, readCandidateReport } from './candidate-report.ts';

const here = import.meta.dir;
const candidate = join(here, 'dist/dnd5e_classpack');
const report = readCandidateReport(here);
const manifest = JSON.parse(readFileSync(join(candidate, 'module.json'), 'utf8'));
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const { ClassicLevel } = await import(pathToFileURL('F:/FoundryLab/foundry-v14/app/14.368/node_modules/classic-level/index.js').href);

test('historical report remains evidence while new builds require free generated outputs', () => {
  const { candidate, generatedReport, historicalReport } = candidatePaths(here);
  const historicalOnly = (path: string) => path === historicalReport;
  expect(candidateReportPath(here, historicalOnly)).toBe(historicalReport);
  expect(() => assertNewCandidateOutputsAbsent(here, historicalOnly)).not.toThrow();
  expect(candidateReportPath(here, path => path === historicalReport || path === generatedReport))
    .toBe(generatedReport);
  expect(() => assertNewCandidateOutputsAbsent(here, path => path === candidate)).toThrow('refusing overwrite');
  expect(() => assertNewCandidateOutputsAbsent(here, path => path === generatedReport)).toThrow('refusing overwrite');
});

test('pinned release identity, exact target and source-baseline bytes bind the candidate', () => {
  expect(hash(readFileSync(join(here, 'upstream/dnd5e_classpack-v4.3.4.zip'))))
    .toBe('8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1');
  expect(manifest.id).toBe('dnd5e_classpack');
  expect(manifest.version).toBe('4.3.4-next.1');
  expect(manifest.compatibility).toEqual({ minimum: '14.368', verified: '14.368', maximum: '14.368' });
  expect(manifest.relationships.systems.find((entry: { id: string }) => entry.id === 'dnd5e').compatibility)
    .toEqual({ minimum: '6.0.5', verified: '6.0.5', maximum: '6.0.5' });
  expect(manifest.relationships.recommends.some((entry: { id: string }) => entry.id === 'dnd5e_DMTools')).toBe(false);
  expect(manifest.manifest).toBeUndefined();
  expect(manifest.download).toBeUndefined();
  expect(manifest.packs).toHaveLength(21);
  expect(manifest.packs.map((pack: { name: string }) => pack.name)).toContain('new-icon');
  expect(report.topLevelDocuments).toBe(5655);
  expect(report.databaseRecords).toBe(13559);
  expect(report.identitySha256).toBe('19dc85310c69137b159945ac50f00b76e7cdba49e7b43b131592fa3bfda48b21');
  expect(hash(readFileSync(join(candidate, 'source-baseline.json')))).toBe(manifest.flags.classpackNext.sourceBaselineSha256);
  expect(hash(readFileSync(join(candidate, 'scripts/next-migration.mjs')))).toBe(manifest.flags.classpackNext.runtimeSha256);
  expect(hash(composeClasspackRuntime(here))).toBe(manifest.flags.classpackNext.runtimeSha256);
  expect(report.macros.filter((entry: { changed: boolean }) => entry.changed)).toHaveLength(12);
  expect(report.embeddedMacroPatches).toHaveLength(15);
  expect(report.contentPatches).toHaveLength(2);
  expect(report.contentPatches.map((entry: { pack: string; id: string }) => `${entry.pack}:${entry.id}`).sort())
    .toEqual(['itempack:BC04F7BE90F193C0', 'racial-traits:BAX4NWZ6iTLGgf31']);
  expect(report.packs.find((pack: { name: string }) => pack.name === 'racial-traits').patchedMacros).toBe(1);
  expect(report.referencePatches.length).toBeGreaterThan(0);
  expect(report.contentSignals.candidateEmbeddedMacroIssueCount).toBe(0);
  expect(report.contentSignals.missingLocalAssetUniqueCount).toBe(0);
});

test('MPMM Stone’s Endurance uses proficiency bonus with exact original preimage and no other changed field', async () => {
  const db = new ClassicLevel(join(candidate, 'packs/racial-traits'), {
    createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json', readOnly: true,
  });
  await db.open();
  try {
    const document = await db.get('!items!BAX4NWZ6iTLGgf31');
    const patch = report.contentPatches.find((entry: { id: string }) => entry.id === 'BAX4NWZ6iTLGgf31');
    expect(patch).toBeDefined();
    expect(document.system.uses.max).toBe('@prof');
    expect(document.system.uses.spent).toBe(0);
    expect(document.system.uses.recovery).toEqual([{ period: 'lr', type: 'recoverAll' }]);
    expect(document.system.activities.dnd5eactivity000.roll.formula).toBe('1d12+ @abilities.con.mod');
    expect(document.system.description.value).toContain('次数等于你的熟练加值');
    expect(hash(JSON.stringify(document))).toBe(patch.candidateSha256);
    const original = structuredClone(document);
    original.system.uses.max = '1';
    expect(hash(JSON.stringify(original))).toBe(patch.sourceSha256);
    expect(patch.sourceSha256).toBe('702b3d5a2b7462d6d302c8ccf3826fc48e617149a293c507fba3ec05e1e1cccc');
    expect(patchApprovedClasspackContent('racial-traits', original).document).toEqual(document);
    original.system.description.value += ' changed';
    expect(() => patchApprovedClasspackContent('racial-traits', original)).toThrow('upstream preimage differs');
  } finally { await db.close(); }
});

test('the single approved Helm of Teleportation link is persisted with its original activity identity', async () => {
  const db = new ClassicLevel(join(candidate, 'packs/itempack'), {
    createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json', readOnly: true,
  });
  await db.open();
  try {
    const document = await db.get('!items!BC04F7BE90F193C0');
    const patch = report.contentPatches.find((entry: { pack: string; id: string }) =>
      entry.pack === 'itempack' && entry.id === 'BC04F7BE90F193C0');
    expect(patch).toBeDefined();
    const activity = document.system.activities['8xeSfAR1Fa7nQv4c'];
    expect(activity.spell.uuid).toBe('Compendium.dnd5e_classpack.new-icon.Item.7wAk7D98B8gAgKzX');
    expect(hash(JSON.stringify(document))).toBe(patch.candidateSha256);
    expect(patch.sourceSha256)
      .toBe('fa7592b11c67c520bd642f64af6b99e449f1714aab26282758ff1b44a2ba57e0');
  } finally { await db.close(); }
});

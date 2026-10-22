import { expect, test } from 'bun:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { prepareCategoryMdExtraction } from '@fvtt-json-generator/intake-ai/category-md-extraction';
import { validateStagedBaseFacts } from '@fvtt-json-generator/intake-ai/staged-extraction';
import { assembleStagedLinePartition, splitStagedMonsterSource } from '@fvtt-json-generator/intake-ai/staged-source';
import angelPartition from './fixtures/forge-category-md-angel-partition.json';
import { request } from './helpers/forge-semantic-chain';

// Optional original pilot inputs are deliberately NOT copied into the source
// tree. This checks only frozen source/base preconditions, never model quality.
const sourceRoot = process.env.FORGE_CATEGORY_MD_PILOT_ROOT;
const cases = [
  { id: 'giant-boar', source: '.local/forge-staged-manual-20261013/v4-srd-source/Giant-Boar-source.txt',
    sourceHash: '5469c971d591c04da7a1e8f6e566708de9cb28d3bb527dc56bc64da66dafa7b0',
    base: '.local/forge-staged-manual-20261013/fresh-srd-v4/v4-srd-control-1/latest-report.json',
    baseHash: 'bc75f71be13747ca72bae10ec243613f8336a4f62feda500f740dc4d8350186e', count: 3, categories: 2 },
  { id: 'company', source: '.local/forge-mezzoloth-company-20261017/source/Mezzoloth-Company-layout-v2.md',
    sourceHash: '4468a368378447825b92b44f583ab7acb631f79fcae17ababa77abc374f07761',
    base: '.local/forge-mezzoloth-company-20261017/normal-deepseek-run-3/intake-ir.json',
    baseHash: 'b309cbaff8597ab42991c8ece7fa18ad50a68acdfa3d56c8cecc775bdc417fd4', count: 7, categories: 3 },
  { id: 'angel-obsession', source: '.local/forge-common-contract-repair-20261017/unseen-chm-1/source.md',
    sourceHash: 'afc142b63f09c2ba0fcd52525bd4bbae3a909dc5305d16a56db7bc86a89441e2',
    base: '.local/forge-common-contract-repair-20261017/normal-run-8/actor-1-intake-ir.json',
    baseHash: 'b376905b903b88c67ec177b60d90b29ed7a981381242e41903021a37d4d72451', count: 8, categories: 4 },
];
for (const c of cases) (sourceRoot ? test : test.skip)(`original pilot source/base only, zero callbacks: ${c.id}`, () => {
  const sourceBytes = readFileSync(resolve(sourceRoot!, c.source)), baseBytes = readFileSync(resolve(sourceRoot!, c.base));
  // Contracts.sha256 hashes text; the originals are plain UTF-8 with no BOM.
  const source = sourceBytes.toString('utf8'), baseText = baseBytes.toString('utf8');
  expect(sha256(source)).toBe(c.sourceHash); expect(sha256(baseText)).toBe(c.baseHash);
  const stored = JSON.parse(baseText), ir = c.id === 'giant-boar' ? stored.actors[0].analysis.ir : stored;
  const keys = ['identity', 'abilities', 'attributes', 'saves', 'skills', 'defenses', 'senses', 'languages'];
  const facts = { schemaVersion: 1, creature: Object.fromEntries(keys.map(key => [key, structuredClone(ir.creature[key])])), uncertainties: [] };
  const before = JSON.stringify(facts), req = request(source);
  const linePartition = c.id === 'angel-obsession' ? angelPartition.partition : undefined;
  if (linePartition) {
    expect(angelPartition.sourceSha256).toBe(c.sourceHash);
    // Preserve the baseline limitation, then reuse the EXISTING saved reply
    // at its supported line-partition boundary for both arms. No source fix.
    expect(() => splitStagedMonsterSource(req)).toThrow('UNLABELLED_MECHANICS');
  }
  const a = validateStagedBaseFacts(linePartition ? assembleStagedLinePartition(req, linePartition) : splitStagedMonsterSource(req), facts);
  const b = prepareCategoryMdExtraction(req, facts, linePartition);
  expect(JSON.stringify(facts)).toBe(before); expect(b.base).toEqual(a);
  expect(b.plan.features).toHaveLength(c.count); expect(b.batches).toHaveLength(c.categories);
  expect(b.batches.flatMap(batch => batch.units)).toHaveLength(c.count);
  if (process.env.FORGE_CATEGORY_MD_EVIDENCE_DIR) {
    const folder = resolve('.local/forge-ab-fixed-replies/pilot-preflight'); mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, `${c.id}.json`), JSON.stringify({ id: c.id, sourceHash: c.sourceHash, baseFileHash: c.baseHash,
      status: 'PASS_SOURCE_BASE_ONLY', sourceFeatures: c.count, categories: b.batches.map(batch => ({ category: batch.category, units: batch.units.length })),
      partition: linePartition ? 'existing-frozen-source-line-reply' : 'deterministic',
      deterministicPartitionKnownFailure: linePartition ? 'UNLABELLED_MECHANICS' : null,
      modelCalls: 0, featureRepliesTested: false, fullGenerationTested: false }, null, 2));
  }
});

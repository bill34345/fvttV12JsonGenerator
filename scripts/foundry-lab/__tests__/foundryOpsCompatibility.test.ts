import { describe, expect, it } from 'bun:test';

describe('Foundry Ops compatibility adapters', () => {
  it('keeps legacy world-audit and offline-migration imports on the product implementations', async () => {
    const [legacyAudit, productAudit, legacyCandidate, productCandidate, legacyDiff, productDiff] = await Promise.all([
      import('../../../src/tools/worldFootprintAudit'),
      import('../../../tools/foundry-ops/src/worldFootprintAudit'),
      import('../../../src/tools/productionMigrationBuildCandidate'),
      import('../../../tools/foundry-ops/src/productionMigrationBuildCandidate'),
      import('../../../src/tools/productionMigrationThreeWayAudit'),
      import('../../../tools/foundry-ops/src/productionMigrationThreeWayAudit'),
    ]);

    expect(legacyAudit.runWorldFootprintAudit).toBe(productAudit.runWorldFootprintAudit);
    expect(legacyCandidate.runProductionMigrationBuildCandidate).toBe(productCandidate.runProductionMigrationBuildCandidate);
    expect(legacyDiff.runProductionMigrationThreeWayAudit).toBe(productDiff.runProductionMigrationThreeWayAudit);
  });
});

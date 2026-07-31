// Compatibility adapter. The implementation lives in the Foundry Ops product.
export * from '../../tools/foundry-ops/src/productionMigrationThreeWayAudit';

if (import.meta.main) {
  const { main } = await import('../../tools/foundry-ops/src/productionMigrationThreeWayAudit');
  await main();
}

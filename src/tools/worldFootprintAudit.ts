// Compatibility adapter. The implementation lives in the Foundry Ops product.
export * from '../../tools/foundry-ops/src/worldFootprintAudit';

if (import.meta.main) {
  const { main } = await import('../../tools/foundry-ops/src/worldFootprintAudit');
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

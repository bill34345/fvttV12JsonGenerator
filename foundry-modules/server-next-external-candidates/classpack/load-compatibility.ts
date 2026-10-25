/** A metadata-only load candidate. The 6.0.5 migration API remains closed on 6.0.6. */
export function projectClasspack606LoadManifest(input: Record<string, any>): Record<string, any> {
  const core = input.compatibility;
  const next = input.flags?.classpackNext;
  const systems = input.relationships?.systems;
  if (input.id !== 'dnd5e_classpack' || input.version !== '4.3.4-next.1'
    || core?.minimum !== '14.368' || core.verified !== '14.368' || core.maximum !== '14.368'
    || JSON.stringify(input.esmodules) !== JSON.stringify(['scripts/next-migration.mjs'])
    || input.packs?.length !== 21 || next?.upstreamVersion !== '4.3.4'
    || next.upstreamArchiveSha256 !== '8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1'
    || next.target?.core !== '14.368' || next.target?.dnd5e !== '6.0.5'
    || next.migration !== 'explicit-runtime-api' || next.migrationRevision !== 4 || next.sourceProjectionRevision !== 7
    || !Array.isArray(systems)) throw new Error('Classpack load candidate requires the exact existing 6.0.5 source identity');
  const dnd = systems.filter(entry => entry.id === 'dnd5e');
  if (dnd.length !== 1 || dnd[0].compatibility?.minimum !== '6.0.5'
    || dnd[0].compatibility?.verified !== '6.0.5' || dnd[0].compatibility?.maximum !== '6.0.5') {
    throw new Error('Classpack existing dnd5e load bounds differ');
  }
  const result = structuredClone(input);
  result.relationships.systems.find((entry: { id: string }) => entry.id === 'dnd5e').compatibility.maximum = '6.0.6';
  return result;
}

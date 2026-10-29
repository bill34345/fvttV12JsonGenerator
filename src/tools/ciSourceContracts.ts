export interface LocalSourceContract {
  id: string;
  files: readonly string[];
  testNames?: readonly string[];
  reason: string;
}

// File scope includes shared source-loading setup. Mixed suites name only the
// callbacks that read historical inputs, leaving their portable companions in CI.
export const LOCAL_SOURCE_CONTRACTS: readonly LocalSourceContract[] = [
  {
    id: 'midi-workflow-sources',
    files: [
      'foundry-modules/midi-qol/tests/bundle-identity.test.ts',
      'foundry-modules/midi-qol/tests/damage-target-render.test.ts',
      'foundry-modules/midi-qol/tests/manual-isdamaged.test.ts',
      'foundry-modules/midi-qol/tests/real-workflow-source.test.ts',
      'foundry-modules/midi-qol/tests/restored-workflow-item.test.ts',
    ],
    reason: 'Locked Midi Git blobs, patched Workflow/component sources, TypeScript 5.7.3 and historical dnd5e 6.0.2 inputs are local-only.',
  },
  {
    id: 'midi-core-source-probes',
    files: [
      'foundry-modules/midi-qol/tests/effect-create-id.test.ts',
      'foundry-modules/midi-qol/tests/effect-model-source.test.ts',
      'foundry-modules/midi-qol/tests/enchantment-clone.test.ts',
    ],
    reason: 'The existing probes execute licensed Foundry Core 14.368 with local Node 24.17 and pinned Midi/dnd5e historical sources.',
  },
  {
    id: 'classpack-historical-sources',
    files: [
      'foundry-modules/server-next-external-candidates/classpack/offline-candidate.test.ts',
      'foundry-modules/server-next-external-candidates/classpack/tcoe-overlay-projection.test.ts',
      'foundry-modules/server-next-external-candidates/classpack/tcoe-source-interop.test.ts',
    ],
    reason: 'Shared setup loads the private Classpack 4.3.4 candidate/source analyses; regressions also require local Core, exact TCoE 4.0.0 source and retained native receipts.',
  },
  {
    id: 'classpack-core-migration',
    files: ['foundry-modules/server-next-external-candidates/classpack/source-safe-native-migration.test.ts'],
    reason: 'Every migration case uses the exact licensed Core 14.368 merge helpers and data operators imported by suite setup.',
  },
  {
    id: 'dae-release-source',
    files: [
      'foundry-modules/server-next-external-candidates/dae/compendium-status-guard.test.mjs',
      'foundry-modules/server-next-external-candidates/dae/should-apply-change.test.mjs',
    ],
    reason: 'Shared setup verifies the retained DAE 14.0.14 archive; phase cases additionally extract the actual local Core and dnd5e methods.',
  },
  {
    id: 'item-piles-core-and-receipts',
    files: [
      'foundry-modules/server-next-external-candidates/item-piles/registration.test.mjs',
      'foundry-modules/server-next-external-candidates/item-piles/reset.test.mjs',
      'foundry-modules/server-next-external-candidates/item-piles/currency-metadata.test.mjs',
    ],
    reason: 'Suite setup imports licensed Core 14.368 helpers or retained private migration receipts; registration and currency cases also use actual retained Item Piles source.',
  },
  {
    id: 'item-piles-adapter-sources',
    files: ['foundry-modules/server-next-external-candidates/item-piles/tests.mjs'],
    reason: 'The existing explicit package suite evaluates retained Item Piles adapter and base bundles in shared setup.',
  },
  {
    id: 'vision-and-item-macro-sources',
    files: ['foundry-modules/server-next-external-candidates/vision-macro/tests.mjs'],
    reason: 'The existing explicit package suite imports and evaluates retained Vision and Item Macro source in shared setup.',
  },
  {
    id: 'external-candidate-bundles',
    files: ['foundry-modules/server-next-external-candidates/tests.mjs'],
    testNames: [
      'built Droppables registers real string namespaces and round-trips all settings',
      'Clocks native fade only animates newly rendered clocks without persistent opacity',
    ],
    reason: 'Only these callbacks read retained third-party Droppables and Clocks bundles; the fixture-tool companion cases are portable.',
  },
  {
    id: 'classpack-goliath-source',
    files: ['foundry-modules/server-next-external-candidates/classpack/source-reference-patches.test.ts'],
    testNames: ['MPMM Goliath reuses the existing PB-per-long-rest trait with two exact guarded links'],
    reason: 'This callback reads the retained private last-world-grant-and-trance source JSON.',
  },
  {
    id: 'item-piles-api-source',
    files: ['foundry-modules/server-next-external-candidates/item-piles/tool.test.mjs'],
    testNames: ['actual Item Piles API mapper rejects string IDs before socket but accepts object payload on Foundry14'],
    reason: 'This callback extracts the actual retained Item Piles API mapper and licensed Core 14.368 helpers.',
  },
  {
    id: 'eladrin-dnd5e-6-0-5-source',
    files: ['tools/foundry-ops/src/player-item-repair/eladrin-adoption.test.js'],
    testNames: ['the exact 6.0.5 ItemGrant method skips all seven sources instead of duplicating owned features'],
    reason: 'This historical regression reads the exact locally retained dnd5e 6.0.5 ItemGrant method; current official reference-cache tests remain portable.',
  },
];

export function selectSourceContractScope(
  files: readonly string[],
  profile: 'complete' | 'portable',
  basePattern: string,
): { files: string[]; testNamePattern: string; deferred: readonly LocalSourceContract[] } {
  if (profile !== 'complete' && profile !== 'portable') throw new Error(`Unknown source-contract profile: ${profile}`);
  const normalized = files.map(repositoryPath);
  new RegExp(basePattern);
  if (profile === 'complete') return { files: [...files], testNamePattern: basePattern, deferred: [] };

  const wholeFiles = new Set(LOCAL_SOURCE_CONTRACTS.filter(contract => !contract.testNames).flatMap(contract => contract.files));
  const mixedNames = LOCAL_SOURCE_CONTRACTS
    .filter(contract => contract.files.some(file => normalized.includes(file)))
    .flatMap(contract => contract.testNames ?? []);
  const exclusion = mixedNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return {
    files: files.filter((_file, index) => !wholeFiles.has(normalized[index]!)),
    // The lookahead preserves even an unanchored caller pattern's search semantics.
    testNamePattern: exclusion ? `^(?!(?:${exclusion})$)(?=[\\s\\S]*(?:${basePattern}))` : basePattern,
    deferred: LOCAL_SOURCE_CONTRACTS,
  };
}

function repositoryPath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized || /^[A-Za-z]:|^\//.test(normalized) || /[\0\r\n:]/.test(normalized)
    || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid repository test path: ${path}`);
  }
  return normalized;
}

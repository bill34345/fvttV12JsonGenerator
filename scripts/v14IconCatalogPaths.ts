import { resolve } from 'node:path';
import { DND5E_V14_SYSTEM_VERSION, FOUNDRY_V14_CORE_VERSION } from '@fvtt-json-generator/contracts/target';

type IconCatalogEnvironment = Readonly<Record<string, string | undefined>>;

export interface V14IconCatalogPaths {
  inputPath: string;
  outputPath: string;
  coreIconRoot: string;
  dnd5eIconRoot: string;
}

export function resolveV14IconCatalogPaths(
  workspaceRoot: string,
  environment: IconCatalogEnvironment = {},
): V14IconCatalogPaths {
  const root = resolve(workspaceRoot);
  const labRoot = resolve(environment.FVTT_OPS_LAB_ROOT || resolve(root, '.local/foundry-v14'));
  const evidenceRoot = resolve(environment.FVTT_OPS_EVIDENCE_ROOT || resolve(labRoot, 'evidence'));
  return {
    inputPath: resolve(evidenceRoot, 'icon-catalog', `compendium-index-core${FOUNDRY_V14_CORE_VERSION}-dnd5e${DND5E_V14_SYSTEM_VERSION}.json`),
    outputPath: resolve(root, 'references/foundry-v14-icons/catalog.json'),
    coreIconRoot: resolve(labRoot, `app/${FOUNDRY_V14_CORE_VERSION}/public/icons`),
    dnd5eIconRoot: resolve(labRoot, 'data/server-mirror/Data/systems/dnd5e/icons'),
  };
}

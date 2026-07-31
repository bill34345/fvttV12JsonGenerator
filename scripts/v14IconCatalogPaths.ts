import { resolve } from 'node:path';

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
    inputPath: resolve(evidenceRoot, 'icon-catalog/compendium-index.json'),
    outputPath: resolve(root, 'references/foundry-v14-icons/catalog.json'),
    coreIconRoot: resolve(labRoot, 'app/14.364/public/icons'),
    dnd5eIconRoot: resolve(labRoot, 'data/server-mirror/Data/systems/dnd5e/icons'),
  };
}

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { resolveV14IconCatalogPaths } from './v14IconCatalogPaths';

describe('v14 icon catalog paths', () => {
  test('preserves the repository-local defaults', () => {
    const workspaceRoot = resolve(import.meta.dir, '..');
    const paths = resolveV14IconCatalogPaths(workspaceRoot);

    expect(paths.inputPath).toBe(resolve(workspaceRoot, '.local/foundry-v14/evidence/icon-catalog/compendium-index.json'));
    expect(paths.outputPath).toBe(resolve(workspaceRoot, 'references/foundry-v14-icons/catalog.json'));
    expect(paths.coreIconRoot).toBe(resolve(workspaceRoot, '.local/foundry-v14/app/14.364/public/icons'));
    expect(paths.dnd5eIconRoot).toBe(resolve(workspaceRoot, '.local/foundry-v14/data/server-mirror/Data/systems/dnd5e/icons'));
  });

  test('moves only runtime and evidence inputs to configured external roots', () => {
    const workspaceRoot = resolve(import.meta.dir, '..');
    const labRoot = resolve(workspaceRoot, '../external-foundry-lab');
    const evidenceRoot = resolve(workspaceRoot, '../external-foundry-evidence');
    const paths = resolveV14IconCatalogPaths(workspaceRoot, {
      FVTT_OPS_LAB_ROOT: labRoot,
      FVTT_OPS_EVIDENCE_ROOT: evidenceRoot,
    });

    expect(paths.inputPath).toBe(resolve(evidenceRoot, 'icon-catalog/compendium-index.json'));
    expect(paths.coreIconRoot).toBe(resolve(labRoot, 'app/14.364/public/icons'));
    expect(paths.dnd5eIconRoot).toBe(resolve(labRoot, 'data/server-mirror/Data/systems/dnd5e/icons'));
    expect(paths.outputPath).toBe(resolve(workspaceRoot, 'references/foundry-v14-icons/catalog.json'));
  });
});

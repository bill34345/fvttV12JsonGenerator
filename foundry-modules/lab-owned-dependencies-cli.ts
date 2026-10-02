import { resolve } from 'node:path';
import { assertExactLabPath, createLabConfig, type FoundryLabConfig } from '../tools/foundry-ops/src/config.ts';
import { buildModule as buildTrigger, MODULE_ID as TRIGGER_ID, MODULE_VERSION as TRIGGER_VERSION } from './fvtt-trigger-engine/build.ts';
import { buildModule as buildConditions, MODULE_ID as CONDITIONS_ID, MODULE_VERSION as CONDITIONS_VERSION } from './fvtt-custom-conditions/build.ts';
import { applyOwnedUpgrades, exactOwnedModulePaths, previewOwnedUpgrades, type OwnedUpgradeSpec } from './lab-owned-upgrade.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const APPROVED_LAB = resolve('F:/FoundryLab/foundry-v14');

export function dependencyUpgradeSpecs(config: FoundryLabConfig, triggerOldHash: string, conditionsOldHash: string): OwnedUpgradeSpec[] {
  if (resolve(config.labRoot).toLocaleLowerCase('en') !== APPROVED_LAB.toLocaleLowerCase('en')) {
    throw new Error(`Refusing dependency upgrade outside ${APPROVED_LAB}`);
  }
  const modulesRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/modules');
  const triggerDestination = resolve(modulesRoot, TRIGGER_ID);
  const conditionsDestination = resolve(modulesRoot, CONDITIONS_ID);
  assertExactLabPath(config, triggerDestination, ['data', 'server-mirror', 'Data', 'modules', TRIGGER_ID], 'Trigger Engine upgrade target');
  assertExactLabPath(config, conditionsDestination, ['data', 'server-mirror', 'Data', 'modules', CONDITIONS_ID], 'Custom Conditions upgrade target');
  if (TRIGGER_VERSION !== '0.2.0' || CONDITIONS_VERSION !== '0.2.0') throw new Error('Expected dependency build version 0.2.0.');
  return [
    { id: TRIGGER_ID, destination: triggerDestination, buildRoot: resolve(config.repoRoot, 'foundry-modules', TRIGGER_ID, 'dist/module'), expectedOldHash: triggerOldHash,
      expectedPaths: exactOwnedModulePaths(TRIGGER_ID), expectedNewPaths: exactOwnedModulePaths(TRIGGER_ID, '0.2.0'),
      oldVersion: '0.1.1', newVersion: '0.2.0' },
    { id: CONDITIONS_ID, destination: conditionsDestination, buildRoot: resolve(config.repoRoot, 'foundry-modules', CONDITIONS_ID, 'dist/module'), expectedOldHash: conditionsOldHash,
      expectedPaths: exactOwnedModulePaths(CONDITIONS_ID), expectedNewPaths: exactOwnedModulePaths(CONDITIONS_ID, '0.2.0'),
      oldVersion: '0.1.1', newVersion: '0.2.0' },
  ];
}

export async function upgradeOwnedDependencies(triggerOldHash: string, conditionsOldHash: string, apply = false): Promise<Record<string, unknown>> {
  const config = createLabConfig(REPO_ROOT);
  const specs = dependencyUpgradeSpecs(config, triggerOldHash, conditionsOldHash);
  await buildTrigger();
  await buildConditions();
  const modules = apply ? await applyOwnedUpgrades(specs) : await previewOwnedUpgrades(specs);
  return { apply, production: false, backup: false, runtimeVerified: false, modules };
}

function argument(name: string): string {
  const positions = process.argv.map((part, index) => part === name ? index : -1).filter((index) => index >= 0);
  if (positions.length !== 1 || !process.argv[positions[0]! + 1] || process.argv[positions[0]! + 1]!.startsWith('--')) {
    throw new Error(`Exactly one ${name} <complete-tree-sha256> is required.`);
  }
  return process.argv[positions[0]! + 1]!;
}

if (import.meta.main) {
  const triggerOldHash = argument('--trigger-old-hash');
  const conditionsOldHash = argument('--conditions-old-hash');
  console.log(JSON.stringify(await upgradeOwnedDependencies(triggerOldHash, conditionsOldHash, process.argv.includes('--apply')), null, 2));
}

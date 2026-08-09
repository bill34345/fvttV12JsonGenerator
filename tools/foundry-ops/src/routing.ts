import { findFoundryOpsCommand, type FoundryOpsCommand } from './commandCatalog';

export interface FoundryOpsRoute {
  command: FoundryOpsCommand;
  entrypoint: string;
  forwardedArgs: string[];
}

const LAB_ENTRYPOINT = 'tools/foundry-ops/src/lab/cli.ts';
const SPELL_RESOLVER_ENTRYPOINT = 'foundry-modules/monster-spell-resolver/labCli.ts';
const ASSET_INVENTORY_ENTRYPOINT = 'tools/foundry-ops/src/assetInventory.ts';
const LOCAL_SCOPE_ENTRYPOINT = 'tools/foundry-ops/src/localScope.ts';
const LAB_MIGRATION_PLAN_ENTRYPOINT = 'tools/foundry-ops/src/labMigrationPlan.ts';

export function resolveFoundryOpsRoute(args: string[]): FoundryOpsRoute {
  const [area, action, ...rest] = args;
  if (area === 'production' && action === 'inventory') {
    return route('production.inventory', LAB_ENTRYPOINT, ['inventory', ...rest]);
  }
  if (area === 'production' && action === 'acquire') {
    return route('production.acquire', LAB_ENTRYPOINT, ['acquire', ...rest]);
  }
  if (area === 'world' && action === 'audit') {
    return route('world.audit', 'tools/foundry-ops/src/worldFootprintAudit.ts', rest);
  }
  if (area === 'migration' && action === 'build-candidate') {
    return route('migration.build-candidate', 'tools/foundry-ops/src/productionMigrationBuildCandidate.ts', rest);
  }
  if (area === 'migration' && action === 'three-way-audit') {
    return route('migration.three-way-audit', 'tools/foundry-ops/src/productionMigrationThreeWayAudit.ts', rest);
  }
  if (area === 'assets' && action === 'inventory') {
    return route('assets.inventory', ASSET_INVENTORY_ENTRYPOINT, rest);
  }
  if (area === 'assets' && action === 'scope') {
    return route('assets.scope', LOCAL_SCOPE_ENTRYPOINT, rest);
  }
  if (area === 'assets' && action === 'migration-plan') {
    return route('assets.migration-plan', LAB_MIGRATION_PLAN_ENTRYPOINT, rest);
  }
  if (area === 'lab' && action) {
    if (action === 'inventory') return route('production.inventory', LAB_ENTRYPOINT, [action, ...rest]);
    if (action === 'acquire') return route('production.acquire', LAB_ENTRYPOINT, [action, ...rest]);
    if (action === 'spell-resolver') return route('lab.spell-resolver', SPELL_RESOLVER_ENTRYPOINT, rest);
    const id = labCommandId(action);
    return route(id, LAB_ENTRYPOINT, [action, ...rest]);
  }
  throw new Error(`Unsupported Foundry Ops command: ${args.join(' ') || '<missing>'}`);
}

function labCommandId(action: string): string {
  const known = new Set([
    'bootstrap',
    'classpack-v14',
    'patch-sequencer-spritesheet-workers',
    'patch-plutonium-quick-insert',
    'build-blood-hunter-homebrew',
    'blood-hunter-v14',
    'spell-resolver',
    'diagnose',
    'classify',
    'acquire-local',
    'parity',
    'launch',
    'stop',
  ]);
  if (!known.has(action)) throw new Error(`Unsupported Foundry Lab command: ${action}`);
  return `lab.${action}`;
}

function route(id: string, entrypoint: string, forwardedArgs: string[]): FoundryOpsRoute {
  const command = findFoundryOpsCommand(id);
  if (!command) throw new Error(`Foundry Ops command is missing from the permission catalog: ${id}`);
  return { command, entrypoint, forwardedArgs };
}

import { findFoundryOpsCommand, type FoundryOpsCommand } from './commandCatalog';

export interface FoundryOpsRoute {
  command: FoundryOpsCommand;
  entrypoint: string;
  forwardedArgs: string[];
}

const LEGACY_LAB_ENTRYPOINT = 'scripts/foundry-lab/cli.ts';

export function resolveFoundryOpsRoute(args: string[]): FoundryOpsRoute {
  const [area, action, ...rest] = args;
  if (area === 'production' && action === 'inventory') {
    return route('production.inventory', LEGACY_LAB_ENTRYPOINT, ['inventory', ...rest]);
  }
  if (area === 'production' && action === 'acquire') {
    return route('production.acquire', LEGACY_LAB_ENTRYPOINT, ['acquire', ...rest]);
  }
  if (area === 'world' && action === 'audit') {
    return route('world.audit', 'src/tools/worldFootprintAudit.ts', rest);
  }
  if (area === 'migration' && action === 'build-candidate') {
    return route('migration.build-candidate', 'src/tools/productionMigrationBuildCandidate.ts', rest);
  }
  if (area === 'migration' && action === 'three-way-audit') {
    return route('migration.three-way-audit', 'src/tools/productionMigrationThreeWayAudit.ts', rest);
  }
  if (area === 'lab' && action) {
    if (action === 'inventory') return route('production.inventory', LEGACY_LAB_ENTRYPOINT, [action, ...rest]);
    if (action === 'acquire') return route('production.acquire', LEGACY_LAB_ENTRYPOINT, [action, ...rest]);
    const id = labCommandId(action);
    return route(id, LEGACY_LAB_ENTRYPOINT, [action, ...rest]);
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

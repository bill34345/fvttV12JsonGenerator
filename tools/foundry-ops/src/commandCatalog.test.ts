import { describe, expect, it } from 'bun:test';
import { listFoundryOpsCommands } from './commandCatalog';
import { resolveFoundryOpsRoute } from './routing';

describe('Foundry Ops command catalog', () => {
  it('gives every command an explicit target, effect, owner, and Chinese explanation', () => {
    const commands = listFoundryOpsCommands();
    expect(commands.length).toBeGreaterThanOrEqual(18);
    expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
    for (const command of commands) {
      expect(['local', 'production']).toContain(command.target);
      expect(['read-only', 'local-mutation', 'production-mutation']).toContain(command.effect);
      expect(['available', 'runbook-only']).toContain(command.availability);
      expect(command.summary.length).toBeGreaterThan(8);
      expect(command.owner.length).toBeGreaterThan(0);
    }
  });

  it('records production mutation as runbook-only instead of exposing an executable route', () => {
    const mutation = listFoundryOpsCommands().find((command) => command.id === 'production.mutation');
    expect(mutation).toMatchObject({
      target: 'production',
      effect: 'production-mutation',
      availability: 'runbook-only',
    });
    expect(() => resolveFoundryOpsRoute(['production', 'mutation'])).toThrow('Unsupported');
  });

  it('distinguishes production reads from offline migration writes', () => {
    const production = resolveFoundryOpsRoute(['production', 'inventory', '--apply']);
    expect(production.command).toMatchObject({ target: 'production', effect: 'read-only' });

    const migration = resolveFoundryOpsRoute(['migration', 'build-candidate', '--execution-id', 'fixture']);
    expect(migration.command).toMatchObject({ target: 'local', effect: 'local-mutation' });
  });

  it('keeps the old Foundry Lab inventory spelling as a classified compatibility route', () => {
    const route = resolveFoundryOpsRoute(['lab', 'inventory', '--apply']);
    expect(route.command.id).toBe('production.inventory');
    expect(route.entrypoint).toBe('tools/foundry-ops/src/lab/cli.ts');
    expect(route.forwardedArgs).toEqual(['inventory', '--apply']);
  });

  it('keeps the deferred spell resolver behind a dedicated compatibility entrypoint', () => {
    const route = resolveFoundryOpsRoute(['lab', 'spell-resolver', 'verify-install']);
    expect(route.command.id).toBe('lab.spell-resolver');
    expect(route.entrypoint).toBe('scripts/foundry-lab/spellResolverCli.ts');
    expect(route.forwardedArgs).toEqual(['verify-install']);
  });

  it('routes local asset inventory to the report-only implementation', () => {
    const route = resolveFoundryOpsRoute(['assets', 'inventory', '--hash-concurrency=2']);
    expect(route.command).toMatchObject({
      id: 'assets.inventory',
      target: 'local',
      effect: 'local-mutation',
    });
    expect(route.entrypoint).toBe('tools/foundry-ops/src/assetInventory.ts');
    expect(route.forwardedArgs).toEqual(['--hash-concurrency=2']);
  });

  it('routes local scope coverage to the privacy-aware report implementation', () => {
    const route = resolveFoundryOpsRoute(['assets', 'scope']);
    expect(route.command).toMatchObject({
      id: 'assets.scope',
      target: 'local',
      effect: 'local-mutation',
    });
    expect(route.entrypoint).toBe('tools/foundry-ops/src/localScope.ts');
    expect(route.forwardedArgs).toEqual([]);
  });
});

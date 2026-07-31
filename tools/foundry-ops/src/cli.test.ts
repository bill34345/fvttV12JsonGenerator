import { describe, expect, it } from 'bun:test';
import { runFoundryOpsCli } from './cli';

describe('Foundry Ops CLI authority boundary', () => {
  it('shows the permission catalog without running another entrypoint', async () => {
    const output: string[] = [];
    let executed = false;
    const code = await runFoundryOpsCli(['catalog'], {
      stdout: (message) => output.push(message),
      runEntrypoint: async () => {
        executed = true;
        return 0;
      },
    }, {});

    expect(code).toBe(0);
    expect(executed).toBe(false);
    const parsed = JSON.parse(output.join('\n')) as { commands: Array<{ id: string }> };
    expect(parsed.commands.some((command) => command.id === 'production.inventory')).toBe(true);
  });

  it('routes a local dry run without requiring production configuration', async () => {
    const calls: Array<{ entrypoint: string; args: string[] }> = [];
    const code = await runFoundryOpsCli(['lab', 'bootstrap'], {
      runEntrypoint: async (entrypoint, args) => {
        calls.push({ entrypoint, args });
        return 0;
      },
    }, {});

    expect(code).toBe(0);
    expect(calls).toEqual([{ entrypoint: 'tools/foundry-ops/src/lab/cli.ts', args: ['bootstrap'] }]);
  });

  it('refuses an effective production read without a separate authorization flag', async () => {
    await expect(runFoundryOpsCli(['production', 'inventory', '--apply'], {
      runEntrypoint: async () => 0,
    }, {})).rejects.toThrow('--allow-production-read');
  });

  it('refuses production authorization when host and data path are not externally configured', async () => {
    await expect(runFoundryOpsCli([
      'production', 'inventory', '--apply', '--allow-production-read',
    ], {
      runEntrypoint: async () => 0,
    }, {})).rejects.toThrow('FVTT_OPS_PRODUCTION_SSH_TARGET');
  });

  it('passes an authorized production read to the guarded compatibility implementation', async () => {
    const calls: Array<{ entrypoint: string; args: string[] }> = [];
    const code = await runFoundryOpsCli([
      'production', 'inventory', '--apply', '--allow-production-read',
    ], {
      runEntrypoint: async (entrypoint, args) => {
        calls.push({ entrypoint, args });
        return 0;
      },
    }, {
      FVTT_OPS_PRODUCTION_SSH_TARGET: 'fixture-production',
      FVTT_OPS_PRODUCTION_DATA_PATH: 'E:/fixture/data',
      FVTT_OPS_PRODUCTION_SSH_IDENTITY: 'C:/fixture/id_ed25519',
    });

    expect(code).toBe(0);
    expect(calls).toEqual([{
      entrypoint: 'tools/foundry-ops/src/lab/cli.ts',
      args: ['inventory', '--apply', '--allow-production-read'],
    }]);
  });
});

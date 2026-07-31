// Compatibility entrypoint. Every legacy command now crosses the Foundry Ops permission boundary.
import { resolve } from 'node:path';
import { runFoundryOpsCli } from '../../tools/foundry-ops/src/cli';

const repoRoot = resolve(import.meta.dir, '../..');
process.exitCode = await runFoundryOpsCli(['lab', ...process.argv.slice(2)], {
  runEntrypoint: async (entrypoint, args, environment) => {
    const child = Bun.spawn([process.execPath, 'run', resolve(repoRoot, entrypoint), ...args], {
      cwd: process.cwd(),
      env: environment,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    return child.exited;
  },
});

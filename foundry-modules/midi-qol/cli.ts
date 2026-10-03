import { resolve } from 'node:path';
import {
  distRoot,
  installCandidate,
  loadLock,
  prepareAndBuild,
  upstreamCheck,
} from './tooling';

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const command = process.argv[2] ?? 'help';
if (command === 'upstream-check') {
  console.log(JSON.stringify(await upstreamCheck(), null, 2));
} else if (command === 'build') {
  console.log(JSON.stringify(await prepareAndBuild(), null, 2));
} else if (command === 'install') {
  const lock = await loadLock();
  const zipPath = resolve(valueAfter('--zip') ?? resolve(distRoot, `midi-qol-v${lock.candidateVersion}.zip`));
  const dataRoot = resolve(valueAfter('--data-root') ?? lock.target.dataRoot);
  console.log(JSON.stringify(await installCandidate(zipPath, dataRoot, process.argv.includes('--apply')), null, 2));
} else {
  console.log('Usage: bun run foundry-modules/midi-qol/cli.ts <upstream-check|build|install> [--zip PATH] [--data-root PATH] [--apply]');
  if (command !== 'help') process.exitCode = 2;
}

import { buildBloodHunterForLab, dryRunBloodHunterInstall, installBloodHunterModule, parseBloodHunterLabCliArgs, verifyBloodHunterInstall } from './lab.ts';
import { createLabConfig } from './labConfig.ts';

const request = parseBloodHunterLabCliArgs(process.argv.slice(2));
const config = createLabConfig();

if (request.action === 'build') {
  const result = await buildBloodHunterForLab(config, request.sourcePath!);
  console.log(JSON.stringify({ ok: true, action: request.action, ...result }, null, 2));
} else if (request.action === 'dry-run') {
  const result = await dryRunBloodHunterInstall(config);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} else if (request.action === 'install') {
  const result = await installBloodHunterModule(config, { apply: request.apply });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} else {
  const result = await verifyBloodHunterInstall(config);
  console.log(JSON.stringify({ ok: true, runtimeVerified: false, ...result, action: request.action }, null, 2));
}

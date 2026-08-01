import { createLabConfig } from './labConfig';
import {
  buildSpellResolverForLab,
  installSpellResolver,
  parseSpellResolverCliArgs,
  prepareSpellResolverWorld,
  uninstallSpellResolver,
  verifySpellResolverInstall,
} from './lab';

const request = parseSpellResolverCliArgs(process.argv.slice(2));
const { action } = request;
const config = createLabConfig();

if (action === 'build') {
  const result = await buildSpellResolverForLab(config);
  console.log(JSON.stringify({ ok: true, action, output: result.root, hash: result.hash, files: result.files.length }, null, 2));
} else if (action === 'install') {
  const result = await installSpellResolver(config, { apply: request.apply });
  console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
} else if (action === 'verify-install') {
  console.log(JSON.stringify({ action, ...(await verifySpellResolverInstall(config)) }, null, 2));
} else if (action === 'prepare-world') {
  const result = await prepareSpellResolverWorld(config, request.world, { apply: request.apply });
  console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
} else if (action === 'uninstall') {
  const result = await uninstallSpellResolver(config, { apply: request.apply });
  console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
}

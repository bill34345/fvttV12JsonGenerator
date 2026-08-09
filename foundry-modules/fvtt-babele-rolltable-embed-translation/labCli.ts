import { createLabConfig } from '../../tools/foundry-ops/src/config';
import { installLocal, verifyInstall } from './lab';

const action = process.argv[2] ?? 'verify-install';
if (action === 'install') {
  console.log(JSON.stringify(await installLocal(createLabConfig(), process.argv.includes('--apply')), null, 2));
} else if (action === 'verify-install') {
  console.log(JSON.stringify(await verifyInstall(), null, 2));
} else {
  throw new Error(`Unsupported action: ${action}`);
}

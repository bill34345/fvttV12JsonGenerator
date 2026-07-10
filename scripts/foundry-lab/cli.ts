import { bootstrapLab } from './bootstrap';
import { createLabConfig } from './config';

const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
if (command === 'bootstrap') {
  const report = await bootstrapLab(createLabConfig(), { apply });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
throw new Error(`Unsupported foundry:lab command: ${command ?? '<missing>'}`);

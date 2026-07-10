import { bootstrapLab } from './bootstrap';
import { acquirePackages, readClassifiedPlan } from './acquire';
import { acquireLocalSources, readLocalSourceMappings } from './localSources';
import { writePackagePlan } from './classify';
import { createLabConfig } from './config';
import { captureRemoteInventory, REMOTE_INVENTORY_EXPECTED_COUNT } from './remoteInventory';
import type { PackageClass } from './types';

const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
if (command === 'bootstrap') {
  const report = await bootstrapLab(createLabConfig(), { apply });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
if (command === 'inventory') {
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      apply: false,
      expectedCount: REMOTE_INVENTORY_EXPECTED_COUNT,
      actions: ['Read production module manifests over SSH', 'Write production-disk.json after validation'],
    }, null, 2));
    process.exit(0);
  }
  const inventory = await captureRemoteInventory(createLabConfig());
  console.log(JSON.stringify({
    ok: true,
    apply: true,
    count: inventory.length,
    parseErrorCount: inventory.filter((entry) => entry.parseError !== null).length,
  }, null, 2));
  process.exit(0);
}
if (command === 'classify') {
  const config = createLabConfig();
  const plan = await writePackagePlan(config);
  const classCounts: Record<PackageClass, number> = {
    'upstream-exact': 0,
    'account-protected': 0,
    'server-only': 0,
    'manual-review': 0,
  };
  for (const entry of plan) classCounts[entry.packageClass] += 1;
  console.log(JSON.stringify({
    ok: true,
    count: plan.length,
    classCounts,
    output: `${config.inventoryRoot}/package-plan.json`,
  }, null, 2));
  process.exit(0);
}
if (command === 'acquire') {
  const config = createLabConfig();
  const plan = await readClassifiedPlan(config);
  const report = await acquirePackages(config, plan, {
    apply,
    onProgress: (message) => console.error(`[foundry-lab] ${message}`),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(!apply || report.complete ? 0 : 1);
}
if (command === 'acquire-local') {
  const config = createLabConfig();
  const sources = await readLocalSourceMappings(config);
  const report = await acquireLocalSources(config, sources, {
    apply,
    onProgress: (message) => console.error(`[foundry-lab] ${message}`),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(!apply || report.complete ? 0 : 1);
}
throw new Error(`Unsupported foundry:lab command: ${command ?? '<missing>'}`);

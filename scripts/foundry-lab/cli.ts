import { bootstrapLab } from './bootstrap';
import { acquirePackages, readClassifiedPlan } from './acquire';
import { acquireLocalSources, readLocalSourceMappings } from './localSources';
import { writePackagePlan } from './classify';
import { createLabConfig } from './config';
import { captureRemoteInventory, REMOTE_INVENTORY_EXPECTED_COUNT } from './remoteInventory';
import type { PackageClass } from './types';
import { generateRealParity, writeParityAcceptance } from './parity';
import { launchProfile, stopProfile, type ProfileId } from './launch';
import { runCumulativeReport, runDiagnosticReport, runInventoryDiagnosis, runPerformanceBaseline } from './diagnose';
import {
  buildSpellResolverForLab,
  installSpellResolver,
  parseSpellResolverCliArgs,
  prepareSpellResolverWorld,
  uninstallSpellResolver,
  verifySpellResolverInstall,
} from './spellResolver';
import { patchPlutoniumQuickInsertInstall } from './patchPlutoniumQuickInsert';
import { buildBloodHunterHomebrew } from './bloodHunterHomebrew';
import { patchSequencerSpritesheetWorkerInstall } from './patchSequencerSpritesheetWorkers';

const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
if (command === 'patch-sequencer-spritesheet-workers') {
  const result = await patchSequencerSpritesheetWorkerInstall(createLabConfig(), {
    apply,
    restore: args.includes('--restore'),
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
}
if (command === 'patch-plutonium-quick-insert') {
  const result = await patchPlutoniumQuickInsertInstall(createLabConfig(), { apply });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
}
if (command === 'build-blood-hunter-homebrew') {
  const sourceFile = args.find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  const result = await buildBloodHunterHomebrew(createLabConfig(), { apply, sourceFile });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
}
if (command === 'spell-resolver') {
  const request = parseSpellResolverCliArgs(args);
  const { action } = request;
  const config = createLabConfig();
  if (action === 'build') {
    const result = await buildSpellResolverForLab(config);
    console.log(JSON.stringify({ ok: true, action, output: result.root, hash: result.hash, files: result.files.length }, null, 2));
    process.exit(0);
  }
  if (action === 'install') {
    const result = await installSpellResolver(config, { apply: request.apply });
    console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
    process.exit(0);
  }
  if (action === 'verify-install') {
    console.log(JSON.stringify({ action, ...(await verifySpellResolverInstall(config)) }, null, 2));
    process.exit(0);
  }
  if (action === 'prepare-world') {
    const result = await prepareSpellResolverWorld(config, request.world, { apply: request.apply });
    console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
    process.exit(0);
  }
  if (action === 'uninstall') {
    const result = await uninstallSpellResolver(config, { apply: request.apply });
    console.log(JSON.stringify({ ok: true, action, ...result }, null, 2));
    process.exit(0);
  }
}
if (command === 'diagnose') {
  const [action, ...diagnoseArgs] = args;
  const config = createLabConfig();
  if (action === 'inventory') {
    const result = await runInventoryDiagnosis(config);
    console.log(JSON.stringify({ ok: result.ok, count: result.count, output: result.output }, null, 2));
    process.exit(0);
  }
  if (action === 'baseline') {
    const profile = diagnoseArgs.find((arg) => !arg.startsWith('--'));
    const input = diagnoseArgs.find((arg) => arg.startsWith('--input='))?.slice('--input='.length);
    if (!profile || !input) throw new Error('diagnose baseline requires <profile> and --input=<ignored evidence JSON>');
    console.log(JSON.stringify(await runPerformanceBaseline(config, profile, input), null, 2));
    process.exit(0);
  }
  if (action === 'report') {
    const evidence = diagnoseArgs.find((arg) => arg.startsWith('--evidence='))?.slice('--evidence='.length);
    if (!evidence) throw new Error('diagnose report requires --evidence=<ignored runtime evidence JSON>');
    const result = await runDiagnosticReport(config, evidence);
    console.log(JSON.stringify({ ok: result.ok, output: result.output, count: result.report.modules.length }, null, 2));
    process.exit(0);
  }
  if (action === 'cumulative-report') {
    const input = diagnoseArgs.find((arg) => arg.startsWith('--input='))?.slice('--input='.length);
    if (!input) throw new Error('diagnose cumulative-report requires --input=<ignored JSONL evidence>');
    const result = await runCumulativeReport(config, input);
    console.log(JSON.stringify({ ok: result.ok, report: result.reportPath, chart: result.chartPath, verdict: result.analysis.verdict }, null, 2));
    process.exit(result.ok ? 0 : 2);
  }
  throw new Error(`Unsupported diagnose action: ${action ?? '<missing>'}`);
}
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
if (command === 'parity') {
  const config = createLabConfig(); const report = await generateRealParity(config); await writeParityAcceptance(config, report);
  console.log(JSON.stringify(report, null, 2)); process.exit(report.effectivePass ? 0 : 1);
}
if (command === 'launch' || command === 'stop') {
  const profile = args.find((arg) => !arg.startsWith('--')) as ProfileId | undefined;
  if (profile !== 'core-test' && profile !== 'server-mirror') throw new Error('Profile must be core-test or server-mirror');
  if (command === 'stop') { await stopProfile(createLabConfig(), profile); console.log(JSON.stringify({ ok: true, profile, stopped: true })); }
  else console.log(JSON.stringify({ ok: true, profile, ...(await launchProfile(createLabConfig(), profile)) }, null, 2));
  process.exit(0);
}
throw new Error(`Unsupported foundry:lab command: ${command ?? '<missing>'}`);

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { parse, resolve } from 'node:path';
import {
  assertNoReparsePathComponents,
  assertInsideLabRoot,
  createLabConfig,
  resolveThroughExistingAncestor,
  type FoundryLabConfig,
} from './config';
import {
  assertExternalMigrationTarget,
  buildLabMigrationPlan,
  type AssetInventorySummary,
  type LabMigrationPlan,
} from './asset-inventory/migrationPlanModel';
import { writeMigrationPlanReports, type WrittenMigrationPlan } from './asset-inventory/migrationPlanReport';

export interface RunLabMigrationPlanOptions {
  generatedAt?: string;
  inventorySummaryPath?: string;
  outputRoot?: string;
  targetLabRoot?: string;
}

export interface LabMigrationPlanRun {
  plan: LabMigrationPlan;
  written: WrittenMigrationPlan;
}

export async function runLabMigrationPlan(
  config: FoundryLabConfig,
  options: RunLabMigrationPlanOptions = {},
): Promise<LabMigrationPlanRun> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const inventorySummaryPath = resolve(options.inventorySummaryPath ?? findLatestCompleteInventory(config));
  const inventory = JSON.parse(readFileSync(inventorySummaryPath, 'utf8')) as AssetInventorySummary;
  const targetLabRoot = options.targetLabRoot
    ? validateTarget(config, options.targetLabRoot)
    : undefined;
  const targetState = targetLabRoot ? inspectTargetState(targetLabRoot) : undefined;
  const plan = buildLabMigrationPlan({
    generatedAt,
    sourceLabRoot: config.labRoot,
    inventorySummaryPath,
    inventory,
    targetLabRoot,
    targetState,
  });
  const outputRoot = resolve(options.outputRoot ?? resolve(
    config.inventoryRoot,
    'migration-plans',
    generatedAt.replaceAll(':', '-').replaceAll('.', '-'),
  ));
  assertInsideLabRoot(config, outputRoot);
  const written = await writeMigrationPlanReports(plan, outputRoot);
  return { plan, written };
}

export async function runLabMigrationPlanCli(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  if (args.includes('--help')) {
    console.log([
      'Foundry 本地实验环境迁移方案（只生成报告）',
      '',
      '用法：bun run foundry:ops assets migration-plan [--target-lab-root=<外部空目录>] [--inventory-summary=<summary.json>] [--output-root=<当前 lab 内目录>]',
      '此命令不会复制、切换、移动、删除、启动 Foundry 或访问生产环境。',
      '没有目标目录时会生成“等待选择目标”的正式方案；即使目标就绪，也仍需用户另行授权才能复制。',
    ].join('\n'));
    return 0;
  }
  const config = createLabConfig(process.cwd(), environment);
  const run = await runLabMigrationPlan(config, {
    targetLabRoot: optionValue(args, '--target-lab-root='),
    inventorySummaryPath: optionValue(args, '--inventory-summary='),
    outputRoot: optionValue(args, '--output-root='),
  });
  console.log(JSON.stringify({
    ok: true,
    planOnly: true,
    status: run.plan.status,
    output: run.written.outputRoot,
    sourceFileCount: run.plan.source.fileCount,
    sourceTotalBytes: run.plan.source.totalBytes,
    copyAuthorized: false,
    deletionAuthorized: false,
  }, null, 2));
  return 0;
}

function findLatestCompleteInventory(config: FoundryLabConfig): string {
  const parent = resolve(config.inventoryRoot, 'asset-inventory');
  const candidates = existsSync(parent)
    ? readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(parent, entry.name, 'summary.json'))
      .filter((path) => existsSync(path))
      .sort((left, right) => right.localeCompare(left, 'en'))
    : [];
  const complete = candidates.find((path) => {
    try {
      return (JSON.parse(readFileSync(path, 'utf8')) as { complete?: boolean }).complete === true;
    } catch {
      return false;
    }
  });
  if (!complete) throw new Error(`No complete asset inventory summary found under ${parent}`);
  return complete;
}

function validateTarget(config: FoundryLabConfig, target: string): string {
  const candidate = assertExternalMigrationTarget(config.repoRoot, config.labRoot, target);
  resolveThroughExistingAncestor(candidate);
  assertNoReparsePathComponents(parse(candidate).root, candidate, 'Migration target');
  return candidate;
}

function inspectTargetState(target: string): 'missing' | 'empty' | 'non-empty' {
  if (!existsSync(target)) return 'missing';
  if (!statSync(target).isDirectory()) throw new Error(`Migration target is not a directory: ${target}`);
  return readdirSync(target).length === 0 ? 'empty' : 'non-empty';
}

function optionValue(args: readonly string[], prefix: string): string | undefined {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) process.exit(await runLabMigrationPlanCli(process.argv.slice(2)));

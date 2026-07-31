import { resolve } from 'node:path';
import { assertInsideLabRoot, createLabConfig, type FoundryLabConfig } from './config';
import type { LocalScopeCoverageResult, LocalScopePolicy } from './asset-inventory/scopeModel';
import { buildLocalScopePolicy } from './asset-inventory/scopePolicy';
import { writeLocalScopeCoverageReports, type WrittenLocalScopeCoverage } from './asset-inventory/scopeReport';
import { scanLocalScopeCoverage } from './asset-inventory/scopeScanner';

export interface RunLocalScopeCoverageOptions {
  generatedAt?: string;
  outputRoot?: string;
  policy?: LocalScopePolicy;
}

export interface LocalScopeCoverageRun {
  result: LocalScopeCoverageResult;
  written: WrittenLocalScopeCoverage;
}

export async function runLocalScopeCoverage(
  config: FoundryLabConfig,
  options: RunLocalScopeCoverageOptions = {},
): Promise<LocalScopeCoverageRun> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const policy = options.policy ?? buildLocalScopePolicy(config);
  const outputRoot = resolve(options.outputRoot ?? resolve(
    policy.defaultOutputParent,
    generatedAt.replaceAll(':', '-').replaceAll('.', '-'),
  ));
  assertInsideLabRoot(config, outputRoot);
  const result = await scanLocalScopeCoverage(policy, generatedAt);
  const written = await writeLocalScopeCoverageReports(result, outputRoot);
  return { result, written };
}

export async function runLocalScopeCoverageCli(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  if (args.includes('--help')) {
    console.log([
      '`.local` 顶层范围覆盖检查',
      '',
      '用法：bun run foundry:ops assets scope [--output-root=<lab 内目录>]',
      '登记每个顶层条目为已分类、隐私排除或待人工判断，并写入本地报告。',
      '不会连接生产，不会读取隐私目录内容，也不会复制、移动或删除资产。',
    ].join('\n'));
    return 0;
  }
  const config = createLabConfig(process.cwd(), environment);
  const outputRoot = args.find((argument) => argument.startsWith('--output-root='))?.slice('--output-root='.length);
  const run = await runLocalScopeCoverage(config, { outputRoot });
  const ok = run.result.coverageComplete && run.result.measurementComplete;
  console.log(JSON.stringify({
    ok,
    output: run.written.outputRoot,
    coverageComplete: run.result.coverageComplete,
    measurementComplete: run.result.measurementComplete,
    classificationComplete: run.result.classificationComplete,
    presentEntryCount: run.result.presentEntryCount,
    classifiedCount: run.result.classifiedCount,
    privacyExcludedCount: run.result.privacyExcludedCount,
    pendingReviewCount: run.result.pendingReviewCount,
    unexpectedEntryCount: run.result.unexpectedEntries.length,
  }, null, 2));
  return ok ? 0 : 1;
}

if (import.meta.main) process.exit(await runLocalScopeCoverageCli(process.argv.slice(2)));

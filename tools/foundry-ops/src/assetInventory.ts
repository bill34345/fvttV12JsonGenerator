import { resolve } from 'node:path';
import { assertInsideLabRoot, createLabConfig, type FoundryLabConfig } from './config';
import {
  ASSET_CATEGORIES,
  findExactDuplicates,
  type AssetCategoryManifest,
  type AssetInventoryResult,
  type AssetRootManifest,
} from './asset-inventory/model';
import { buildAssetInventoryPolicy, type AssetInventoryPolicy } from './asset-inventory/policy';
import { writeAssetInventoryReports, type WrittenAssetInventory } from './asset-inventory/report';
import { scanAssetRoot } from './asset-inventory/scanner';

export interface RunLocalAssetInventoryOptions {
  outputRoot?: string;
  generatedAt?: string;
  hashConcurrency?: number;
  onProgress?: (message: string) => void;
  policy?: AssetInventoryPolicy;
}

export interface LocalAssetInventoryRun {
  result: AssetInventoryResult;
  written: WrittenAssetInventory;
}

export async function runLocalAssetInventory(
  config: FoundryLabConfig,
  options: RunLocalAssetInventoryOptions = {},
): Promise<LocalAssetInventoryRun> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const policy = options.policy ?? buildAssetInventoryPolicy(config);
  const outputRoot = resolve(options.outputRoot ?? resolve(
    policy.defaultOutputParent,
    generatedAt.replaceAll(':', '-').replaceAll('.', '-'),
  ));
  assertInsideLabRoot(config, outputRoot);

  const manifests: AssetRootManifest[] = [];
  for (const root of policy.roots) {
    options.onProgress?.(`scanning ${root.id} (${root.displayPath})`);
    manifests.push(await scanAssetRoot(root, {
      generatedAt,
      hashConcurrency: options.hashConcurrency,
      onProgress: options.onProgress,
    }));
  }
  const categories: AssetCategoryManifest[] = ASSET_CATEGORIES.map((category) => {
    const roots = manifests.filter((manifest) => manifest.root.category === category);
    return {
      schemaVersion: 1,
      generatedAt,
      category,
      fileCount: roots.reduce((total, root) => total + root.fileCount, 0),
      totalBytes: roots.reduce((total, root) => total + root.totalBytes, 0),
      roots,
    };
  });
  const duplicates = findExactDuplicates(categories, generatedAt);
  const complete = manifests.every((manifest) => manifest.issues.length === 0);
  const result: AssetInventoryResult = {
    schemaVersion: 1,
    generatedAt,
    complete,
    outputRoot,
    categories,
    duplicates,
    exclusions: policy.exclusions,
  };
  const written = await writeAssetInventoryReports({
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt,
    complete: result.complete,
    categories: result.categories,
    duplicates: result.duplicates,
    exclusions: result.exclusions,
  }, outputRoot);
  return { result, written };
}

export async function runAssetInventoryCli(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  if (args.includes('--help')) {
    console.log([
      'Foundry 本地资产只读盘点',
      '',
      '用法：bun run foundry:ops assets inventory [--output-root=<lab 内目录>] [--hash-concurrency=4]',
      '只读取注册资产并写本地 manifest/重复项报告；不复制、移动、删除或访问生产。',
    ].join('\n'));
    return 0;
  }
  const config = createLabConfig(process.cwd(), environment);
  const outputRoot = optionValue(args, '--output-root=');
  const concurrencyValue = optionValue(args, '--hash-concurrency=');
  const hashConcurrency = concurrencyValue === undefined ? 4 : Number.parseInt(concurrencyValue, 10);
  if (!Number.isInteger(hashConcurrency) || hashConcurrency < 1 || hashConcurrency > 16) {
    throw new Error('--hash-concurrency must be an integer from 1 to 16');
  }
  const run = await runLocalAssetInventory(config, {
    outputRoot,
    hashConcurrency,
    onProgress: (message) => console.error(`[asset-inventory] ${message}`),
  });
  console.log(JSON.stringify({
    ok: run.result.complete,
    output: run.written.outputRoot,
    fileCount: run.result.categories.reduce((total, category) => total + category.fileCount, 0),
    totalBytes: run.result.categories.reduce((total, category) => total + category.totalBytes, 0),
    duplicateGroups: run.result.duplicates.duplicateGroupCount,
    issueCount: run.result.categories.reduce(
      (total, category) => total + category.roots.reduce((rootTotal, root) => rootTotal + root.issues.length, 0),
      0,
    ),
  }, null, 2));
  return run.result.complete ? 0 : 1;
}

function optionValue(args: readonly string[], prefix: string): string | undefined {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  process.exit(await runAssetInventoryCli(process.argv.slice(2)));
}

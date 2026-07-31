import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  AssetCategoryManifest,
  AssetDuplicateReport,
  AssetInventoryExclusion,
  AssetInventoryResult,
} from './model';

export interface WrittenAssetInventory {
  outputRoot: string;
  summaryJson: string;
  summaryMarkdown: string;
  duplicateJson: string;
  duplicateMarkdown: string;
  categoryManifests: string[];
}

export async function writeAssetInventoryReports(
  result: Omit<AssetInventoryResult, 'outputRoot'>,
  outputRoot: string,
): Promise<WrittenAssetInventory> {
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const summaryJson = resolve(outputRoot, 'summary.json');
  const summaryMarkdown = resolve(outputRoot, 'summary.md');
  const duplicateJson = resolve(outputRoot, 'duplicates.json');
  const duplicateMarkdown = resolve(outputRoot, 'duplicates.md');
  const categoryManifests: string[] = [];

  for (const category of result.categories) {
    const target = resolve(outputRoot, `manifest.${category.category}.json`);
    await writeJsonExclusive(target, category);
    categoryManifests.push(target);
  }
  await writeJsonExclusive(duplicateJson, result.duplicates);
  await writeTextExclusive(duplicateMarkdown, renderDuplicateMarkdown(result.duplicates));
  await writeJsonExclusive(summaryJson, {
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt,
    complete: result.complete,
    categories: result.categories.map((category) => ({
      category: category.category,
      fileCount: category.fileCount,
      totalBytes: category.totalBytes,
      roots: category.roots.map((root) => ({
        ...root.root,
        fileCount: root.fileCount,
        directoryCount: root.directoryCount,
        totalBytes: root.totalBytes,
        rootSha256: root.rootSha256,
        issueCount: root.issues.length,
        packageCount: root.packages.length,
      })),
    })),
    duplicates: {
      duplicateGroupCount: result.duplicates.duplicateGroupCount,
      duplicateFileCount: result.duplicates.duplicateFileCount,
      theoreticalDuplicateBytes: result.duplicates.theoreticalDuplicateBytes,
    },
    exclusions: result.exclusions,
  });
  await writeTextExclusive(summaryMarkdown, renderSummaryMarkdown(
    result.categories,
    result.duplicates,
    result.exclusions,
    result.complete,
    result.generatedAt,
  ));
  return { outputRoot, summaryJson, summaryMarkdown, duplicateJson, duplicateMarkdown, categoryManifests };
}

function renderSummaryMarkdown(
  categories: readonly AssetCategoryManifest[],
  duplicates: AssetDuplicateReport,
  exclusions: readonly AssetInventoryExclusion[],
  complete: boolean,
  generatedAt: string,
): string {
  const lines = [
    '# Foundry 本地资产只读清单',
    '',
    `- 生成时间：${generatedAt}`,
    `- 扫描完整性：${complete ? '完整（所有注册文件均成功读取）' : '不完整（存在读取错误、扫描中变化或跳过的链接）'}`,
    '- 本报告只记录事实，不是删除建议，也没有复制、移动或删除任何运行资产。',
    '- `accessedAt` 是文件系统 atime 的尽力记录；Windows 可能延迟或关闭 atime 更新，不能单独证明“最后实际使用时间”。',
    '',
    '## 分类汇总',
    '',
    '| 分类 | 文件数 | 体积 | 注册根数量 |',
    '|---|---:|---:|---:|',
    ...categories.map((category) =>
      `| ${category.category} | ${category.fileCount} | ${formatBytes(category.totalBytes)} | ${category.roots.length} |`),
    '',
    '## 精确重复项',
    '',
    `- 重复组：${duplicates.duplicateGroupCount}`,
    `- 涉及文件：${duplicates.duplicateFileCount}`,
    `- 理论重复体积：${formatBytes(duplicates.theoreticalDuplicateBytes)}`,
    '- “理论重复体积”只表示完全相同的字节副本；world、backup、evidence、archive 仍可能分别承担恢复和证据职责。',
    '',
    '## 隐私和范围排除',
    '',
    ...exclusions.map((exclusion) => `- \`${exclusion.displayPath}\`：${exclusion.reason}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function renderDuplicateMarkdown(report: AssetDuplicateReport): string {
  const lines = [
    '# Foundry 本地资产精确重复项报告',
    '',
    report.note,
    '',
    `- 重复组：${report.duplicateGroupCount}`,
    `- 理论重复体积：${formatBytes(report.theoreticalDuplicateBytes)}`,
    '',
  ];
  for (const [index, group] of report.groups.entries()) {
    lines.push(
      `## ${index + 1}. ${formatBytes(group.bytesPerCopy)} × ${group.copies}`,
      '',
      `- SHA-256：\`${group.sha256}\``,
      `- 分类：${group.categories.join(', ')}`,
      `- 理论重复体积：${formatBytes(group.theoreticalDuplicateBytes)}`,
      '',
      ...group.locations.map((location) => `- \`${location.rootId}/${location.path}\``),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1_024;
    unit += 1;
  } while (value >= 1_024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

async function writeJsonExclusive(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function writeTextExclusive(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: 'utf8', flag: 'wx' });
}

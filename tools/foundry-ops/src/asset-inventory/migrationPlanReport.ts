import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { LabMigrationPlan } from './migrationPlanModel';

export interface WrittenMigrationPlan {
  outputRoot: string;
  json: string;
  markdown: string;
}

export async function writeMigrationPlanReports(
  plan: LabMigrationPlan,
  outputRoot: string,
): Promise<WrittenMigrationPlan> {
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const json = resolve(outputRoot, 'migration-plan.json');
  const markdown = resolve(outputRoot, 'migration-plan.zh-CN.md');
  await writeFile(json, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(markdown, renderMigrationPlanMarkdown(plan), { encoding: 'utf8', flag: 'wx' });
  return { outputRoot, json, markdown };
}

export function renderMigrationPlanMarkdown(plan: LabMigrationPlan): string {
  const status = {
    'target-required': '尚未选择目标目录，不能进入复制审批',
    'target-not-empty': '目标目录不是空目录，不能进入复制审批',
    'ready-for-copy-authorization': '方案条件就绪，但仍未获得复制授权',
  }[plan.status];
  const batchNames: Record<LabMigrationPlan['batches'][number]['id'], string> = {
    'recovery-critical': '第 1 批：世界与备份',
    'retained-evidence': '第 2 批：证据与归档',
    runtime: '第 3 批：程序、模组与系统',
    'rebuildable-last': '第 4 批：可重建缓存与临时材料',
  };
  const lines = [
    '# Foundry 本地实验环境外置迁移方案',
    '',
    '> 这是只读盘点生成的方案，不是迁移执行器。生成报告、填写目标目录都不代表授权复制、切换、移动或删除。',
    '',
    `- 状态：${status}`,
    `- 当前根目录：\`${plan.source.labRoot}\``,
    `- 目标根目录：${plan.target.labRoot ? `\`${plan.target.labRoot}\`` : '未选择'}`,
    `- 已登记根：${plan.source.rootCount}`,
    `- 文件数：${plan.source.fileCount}`,
    `- 总体积：${formatBytes(plan.source.totalBytes)}`,
    `- 来源清单：\`${plan.source.inventorySummary}\``,
    '- 复制授权：否',
    '- 删除授权：否',
    '',
    '## 分批顺序',
    '',
    '| 批次 | 用途 | 根数 | 文件数 | 体积 |',
    '|---|---|---:|---:|---:|',
    ...plan.batches.map((batch) =>
      `| ${batchNames[batch.id]} | ${batch.purpose} | ${batch.roots.length} | ${batch.fileCount} | ${formatBytes(batch.totalBytes)} |`),
    '',
  ];
  for (const batch of plan.batches) {
    lines.push(
      `### ${batchNames[batch.id]}`,
      '',
      ...batch.roots.map((root) =>
        `- \`${root.source}\` → ${root.destination ? `\`${root.destination}\`` : '目标待选择'}；${root.fileCount} 文件；${formatBytes(root.totalBytes)}；内容指纹（SHA-256）\`${root.rootSha256}\``),
      '',
    );
  }
  lines.push(
    '## 必须逐项通过的门槛',
    '',
    ...plan.gates.map((gate) => `- ${gate}`),
    '',
    '## 旧路径兼容窗口',
    '',
    ...plan.compatibilityWindow.map((item) => `- ${item}`),
    '',
    '## 回滚',
    '',
    ...plan.rollback.map((item) => `- ${item}`),
    '',
    '## 恢复抽样（以后单独授权）',
    '',
    ...plan.recoverySampling.map((item) => `- ${item}`),
    '',
    '## 不在本方案内',
    '',
    ...plan.exclusions.map((item) => `- ${item}`),
    '',
  );
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

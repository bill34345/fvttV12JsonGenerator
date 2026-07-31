import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { LocalScopeCoverageResult } from './scopeModel';

export interface WrittenLocalScopeCoverage {
  outputRoot: string;
  reportJson: string;
  reportMarkdown: string;
}

export async function writeLocalScopeCoverageReports(
  result: LocalScopeCoverageResult,
  outputRoot: string,
): Promise<WrittenLocalScopeCoverage> {
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const reportJson = resolve(outputRoot, 'scope-coverage.json');
  const reportMarkdown = resolve(outputRoot, 'scope-coverage.md');
  await writeFile(reportJson, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(reportMarkdown, renderLocalScopeCoverageMarkdown(result), { encoding: 'utf8', flag: 'wx' });
  return { outputRoot, reportJson, reportMarkdown };
}

export function renderLocalScopeCoverageMarkdown(result: LocalScopeCoverageResult): string {
  const lines = [
    '# `.local` 顶层范围覆盖报告',
    '',
    `- 生成时间：${result.generatedAt}`,
    `- 顶层条目：${result.presentEntryCount}`,
    `- 范围是否完整：${result.coverageComplete ? '是' : '否'}`,
    `- 元数据计量是否完整：${result.measurementComplete ? '是' : '否'}`,
    `- 所有权分类是否全部解决：${result.classificationComplete ? '是' : '否'}`,
    `- 已分类：${result.classifiedCount}`,
    `- 隐私排除：${result.privacyExcludedCount}`,
    `- 待人工判断：${result.pendingReviewCount}`,
    '',
    '> “范围完整”只表示当前每个 `.local` 顶层条目都有明确登记。它不表示待判断项已经解决、隐私内容已被读取，也不表示任何文件可以删除。',
    '',
    '## 条目',
    '',
    '| 路径 | 状态 | 类别 | 文件数 | 体积 | 保留级别 | 可重建性 |',
    '|---|---|---|---:|---:|---|---|',
    ...result.entries.map((entry) => {
      const measured = entry.measurementResult;
      return `| \`.local/${entry.name}\` | ${statusLabel(entry.status)} | ${scopeClassLabel(entry.scopeClass)} | ${valueOrDash(measured.fileCount)} | ${formatBytes(measured.totalBytes)} | ${retentionLabel(entry.retention)} | ${rebuildabilityLabel(entry.rebuildability)} |`;
    }),
    '',
    '## 计量口径',
    '',
    '- 普通目录只读取文件系统元数据来统计文件数和体积，不读取文件正文，也不计算 hash。',
    '- 普通递归目录只要遇到链接或 Windows junction，就会把元数据计量判为不完整；已知含链接的恢复演练根只登记顶层，并引用既有恢复报告。',
    '- `.local/foundry-v14` 只汇总 Stage 5A 清单中位于 `$FVTT_OPS_LAB_ROOT` 内的注册根；不会把单独登记的顶层压缩包重复算入，也不是本轮重新遍历隐私或未注册子目录。',
    '- 隐私排除目录只登记顶层存在性；目录内部文件数和体积故意显示为 `—`。',
    '- 顶层普通文件只读取大小等元数据；截图像素、cookie 和 OAuth 内容均未读取。',
    '',
  ];
  const pending = result.entries.filter((entry) => entry.status === 'pending-review');
  if (pending.length > 0) {
    lines.push('## 待人工判断', '');
    for (const entry of pending) {
      lines.push(
        `### \`.local/${entry.name}\``,
        '',
        `- 当前事实：${entry.rationale}`,
        `- 生产者：${entry.producer}`,
        `- 敏感性：${entry.sensitivity}`,
        `- 当前保护：${retentionLabel(entry.retention)}；本报告不授权移动或删除。`,
        '',
      );
    }
  }
  const privacy = result.entries.filter((entry) => entry.status === 'privacy-excluded');
  if (privacy.length > 0) {
    lines.push('## 隐私排除', '');
    for (const entry of privacy) {
      lines.push(`- \`.local/${entry.name}\`：${entry.sensitivity}；仅登记顶层元数据，未遍历内容。`);
    }
    lines.push('');
  }
  if (result.unexpectedEntries.length > 0) {
    lines.push('## 未登记条目（范围失败）', '');
    for (const entry of result.unexpectedEntries) lines.push(`- \`.local/${entry.name}\`（${entry.kind}）`);
    lines.push('');
  }
  if (result.entries.some((entry) => entry.measurementResult.issues.length > 0)) {
    lines.push('## 计量问题', '');
    for (const entry of result.entries) {
      for (const issue of entry.measurementResult.issues) lines.push(`- \`.local/${entry.name}\`：${issue}`);
    }
    lines.push('');
  }
  lines.push(
    '## 本报告没有做什么',
    '',
    '- 没有连接生产环境。',
    '- 没有启动 Foundry、Chrome 或 Session Monitor。',
    '- 没有复制、移动、删除或改写任何已登记资产。',
    '- 没有读取 cookie、OAuth、浏览器 profile、桥接服务私有状态或截图像素。',
    '- 没有把“字节重复”转换成删除建议。',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function statusLabel(status: LocalScopeCoverageResult['entries'][number]['status']): string {
  if (status === 'classified') return '已分类';
  if (status === 'privacy-excluded') return '隐私排除';
  return '待人工判断';
}

function scopeClassLabel(scopeClass: LocalScopeCoverageResult['entries'][number]['scopeClass']): string {
  const labels = {
    'registered-asset-root': '已注册资产根',
    'recovery-copy': '恢复副本',
    'acceptance-evidence': '验收证据',
    'reference-cache': '版本参考缓存',
    'external-tool-cache': '外部工具缓存',
    'task-scratch': '任务临时工件',
    'private-session-state': '私有会话状态',
    'pending-owner': '所有权待确认',
  } as const;
  return labels[scopeClass];
}

function retentionLabel(retention: LocalScopeCoverageResult['entries'][number]['retention']): string {
  if (retention === 'critical') return '关键保留';
  if (retention === 'preserve') return '保留';
  return '删除前复核';
}

function rebuildabilityLabel(rebuildability: LocalScopeCoverageResult['entries'][number]['rebuildability']): string {
  if (rebuildability === 'reacquirable') return '可重新获取';
  if (rebuildability === 'workflow-rebuildable') return '可由流程重建';
  if (rebuildability === 'not-assumed-rebuildable') return '不得假定可重建';
  return '未知';
}

function valueOrDash(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
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

import yaml from 'js-yaml';
import type { IngestedCreatureFile } from './plaintext';

export interface AuditIssue {
  creature: string;
  severity: 'error' | 'warning' | 'info';
  field: string;
  originalValue: string;
  expectedValue: string;
  reason: string;
}

export interface PlainTextAuditCoreFile {
  fileName: string;
  content: string;
}

export interface PlainTextAuditCoreResult {
  creatureCount: number;
  issues: AuditIssue[];
}

export interface AuditReport {
  date: string;
  sourceFile: string;
  creatureCount: number;
  issues: AuditIssue[];
  summary: { error: number; warning: number; info: number };
}

const VALID_ACTION_TYPES = ['attack', 'save', 'utility'];
const VALID_ATTACK_TYPES = ['mwak', 'rwak', 'msak', 'rsak'];
const VALID_TARGET_TYPES = ['creature', 'object', 'creatureOrObject'];
const VALID_DAMAGE_TYPES = [
  '钝击', '穿刺', '挥砍', '毒素', '火焰', '寒冷', '闪电', '雷鸣', '光耀', '暗蚀', '力场', '心灵', '强酸', '死灵',
];

/** Deterministic audit rule shared by the Node and browser paths. */
export function validateAction(action: any, creatureName: string, section: string, index: number): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const fieldPrefix = `${section}[${index}]`;

  if (!action.名称) {
    issues.push({
      creature: creatureName,
      severity: 'error',
      field: `${fieldPrefix}.名称`,
      originalValue: '',
      expectedValue: '<string>',
      reason: '动作缺少名称',
    });
  }

  if (!VALID_ACTION_TYPES.includes(action.类型)) {
    issues.push({
      creature: creatureName,
      severity: 'error',
      field: `${fieldPrefix}.类型`,
      originalValue: String(action.类型),
      expectedValue: VALID_ACTION_TYPES.join('|'),
      reason: '无效的动作类型',
    });
  }

  if (action.类型 === 'attack' && !VALID_ATTACK_TYPES.includes(action.攻击类型)) {
    issues.push({
      creature: creatureName,
      severity: 'error',
      field: `${fieldPrefix}.攻击类型`,
      originalValue: String(action.攻击类型),
      expectedValue: VALID_ATTACK_TYPES.join('|'),
      reason: '攻击动作缺少有效的攻击类型 (mwak|rwak|msak|rsak)',
    });
  }

  if (action.目标?.类型 && !VALID_TARGET_TYPES.includes(action.目标.类型)) {
    issues.push({
      creature: creatureName,
      severity: 'warning',
      field: `${fieldPrefix}.目标.类型`,
      originalValue: String(action.目标.类型),
      expectedValue: VALID_TARGET_TYPES.join('|'),
      reason: '目标类型不符合 FVTT 标准 (creature|object|creatureOrObject)',
    });
  }

  if (Array.isArray(action.伤害)) {
    action.伤害.forEach((dmg: any, dmgIdx: number) => {
      if (!dmg.公式) {
        issues.push({
          creature: creatureName,
          severity: 'warning',
          field: `${fieldPrefix}.伤害[${dmgIdx}].公式`,
          originalValue: '',
          expectedValue: '<string>',
          reason: '伤害条目缺少公式',
        });
      }
      if (dmg.类型 && !VALID_DAMAGE_TYPES.includes(dmg.类型)) {
        issues.push({
          creature: creatureName,
          severity: 'info',
          field: `${fieldPrefix}.伤害[${dmgIdx}].类型`,
          originalValue: String(dmg.类型),
          expectedValue: VALID_DAMAGE_TYPES.join('|'),
          reason: '伤害类型不在标准列表中',
        });
      }
    });
  }

  return issues;
}

/** Audit a parsed creature without reading files or mutating its projection. */
export function auditIngestedCreature(creature: Pick<IngestedCreatureFile, 'chineseName' | 'englishName' | 'frontmatter'>): AuditIssue[] {
  const creatureName = String(creature.frontmatter.名称 || creature.chineseName || creature.englishName || 'creature');
  const issues: AuditIssue[] = [];
  const sections = ['动作', '附赠动作', '反应', '传奇动作'];
  for (const section of sections) {
    const actions = creature.frontmatter[section];
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      issues.push(...validateAction(action, creatureName, section, index));
    });
  }
  return issues;
}

/** Audit canonical Markdown files using the same rules as the legacy workflow. */
export function auditPlainTextMarkdownFiles(files: readonly PlainTextAuditCoreFile[]): PlainTextAuditCoreResult {
  const allIssues: AuditIssue[] = [];
  let creatureCount = 0;

  for (const file of files) {
    const { frontmatter } = parseYamlMarkdown(file.content);
    if (!frontmatter) continue;
    creatureCount += 1;
    allIssues.push(...auditFrontmatter(frontmatter, file.fileName));
  }

  return { creatureCount, issues: allIssues };
}

export function auditPlainTextMarkdown(content: string, fallbackName = 'creature'): AuditIssue[] {
  const { frontmatter } = parseYamlMarkdown(content);
  return frontmatter ? auditFrontmatter(frontmatter, fallbackName) : [];
}

export function parseYamlMarkdown(content: string): { frontmatter: Record<string, any> | null; markdown: string } {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, markdown: content };
  try {
    const parsed = yaml.load(match[1]!);
    return {
      frontmatter: isRecord(parsed) ? parsed : null,
      markdown: match[2]!,
    };
  } catch {
    return { frontmatter: null, markdown: content };
  }
}

function auditFrontmatter(frontmatter: Record<string, any>, fallbackName: string): AuditIssue[] {
  const creatureName = String(frontmatter.名称 || fallbackName);
  const issues: AuditIssue[] = [];
  const sections = ['动作', '附赠动作', '反应', '传奇动作'];
  for (const section of sections) {
    const actions = frontmatter[section];
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      issues.push(...validateAction(action, creatureName, section, index));
    });
  }
  return issues;
}

export function emitAuditMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('# PlainText → Chinese Template Audit Report');
  lines.push('');
  lines.push(`**Date**: ${report.date}`);
  lines.push(`**Source**: ${report.sourceFile}`);
  lines.push(`**Creatures**: ${report.creatureCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 Error | ${report.summary.error} |`);
  lines.push(`| 🟡 Warning | ${report.summary.warning} |`);
  lines.push(`| ℹ️ Info | ${report.summary.info} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Issues');
  lines.push('');

  if (report.issues.length === 0) {
    lines.push('No issues found. 🎉');
  } else {
    for (const issue of report.issues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️';
      const severityLabel = issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1);
      lines.push(`### ${icon} ${severityLabel}: ${issue.creature} - ${issue.field}`);
      lines.push('');
      lines.push(`**Field**: ${issue.field}`);
      lines.push(`**Original Value**: \`${issue.originalValue || '(empty)'}\``);
      lines.push(`**Expected Value**: \`${issue.expectedValue}\``);
      lines.push(`**Reason**: ${issue.reason}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. 检查 AI normalization prompt 是否正确引导输出结构化 YAML');
  lines.push('2. 验证 AI model 对格式转换的遵循程度');
  lines.push('3. 考虑添加 fallback 规则解析作为补充');

  return lines.join('\n');
}

export function summarizeAuditIssues(issues: readonly AuditIssue[]): AuditReport['summary'] {
  return {
    error: issues.filter((issue) => issue.severity === 'error').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

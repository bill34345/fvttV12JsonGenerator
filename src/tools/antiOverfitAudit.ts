import { existsSync, readFileSync } from 'node:fs';
import { requireGitText } from './gitCommand';

export type AntiOverfitRule =
  | 'action-name-predicate'
  | 'named-mechanics-branch'
  | 'fixed-save-dc'
  | 'fixed-damage-roll'
  | 'fixed-save-ability'
  | 'fixed-temp-hp'
  | 'fixed-ac-effect'
  | 'fixed-on-fail'
  | 'fixed-overtime-flag'
  | 'named-rider-marker'
  | 'named-mechanics-key-branch';

export interface AntiOverfitFinding {
  filePath: string;
  line: number;
  column: number;
  rule: AntiOverfitRule;
  evidence: string;
  message: string;
  requiredAction: string;
}

interface RuleCheck {
  rule: AntiOverfitRule;
  regex: RegExp;
  message: string;
}

interface AntiOverfitSource {
  filePath: string;
  text: string;
}

export const ANTI_OVERFIT_SOURCE_ROOTS = ['src', 'packages', 'scripts'] as const;

export interface AntiOverfitAuditExecutionResult {
  exitCode: 0 | 1;
  stdout: string[];
  stderr: string[];
}

export interface AntiOverfitAuditDependencies {
  collectDefaultSources?: () => AntiOverfitSource[];
  collectAllProductionSources?: () => AntiOverfitSource[];
  auditFiles?: (filePaths: string[]) => AntiOverfitFinding[];
  auditSources?: (sources: AntiOverfitSource[]) => AntiOverfitFinding[];
}

const ALLOW_COMMENT =
  /anti-overfit:\s*allow\s+(schema-derived|source-derived|corpus-derived|explicit-exception)\s+-\s+\S/i;

const RULES: RuleCheck[] = [
  {
    rule: 'action-name-predicate',
    regex: /\b(?:function\s+|const\s+|let\s+|var\s+)?is[A-Z][A-Za-z0-9_]*Action\b/,
    message: 'Action-name predicates often hide sample-specific mechanics.',
  },
  {
    rule: 'fixed-save-dc',
    regex: /(?:\bsaveDC\s*=\s*\d+\b|\bdc\s*:\s*\d+\b)/i,
    message: 'Fixed save DCs must come from source text, schema, corpus rule, or an explicit exception.',
  },
  {
    rule: 'fixed-damage-roll',
    regex: /\bdamageRoll\s*(?:=|:)\s*['"]?\d+d\d+(?:\s*[+-]\s*\d+)?/i,
    message: 'Fixed damage rolls must be parsed from source text or explicitly documented.',
  },
  {
    rule: 'fixed-save-ability',
    regex: /(?:\bsaveAbility\s*=\s*(?:str|dex|con|int|wis|cha)\b|\b(?:const|let|var)\s+ability\s*=\s*['"](?:str|dex|con|int|wis|cha)['"])/i,
    message: 'Fixed save abilities must be parsed or documented as a schema/config mapping.',
  },
  {
    rule: 'fixed-temp-hp',
    regex: /\bgrantsTempHp\s*:\s*\d+\b/i,
    message: 'Fixed temporary HP grants must be parsed from source text or explicitly documented.',
  },
  {
    rule: 'fixed-on-fail',
    regex: /\bonFail\s*:\s*['"][^'"]+['"]/i,
    message: 'Fixed failed-save outcomes must be parsed from source text or explicitly documented.',
  },
  {
    rule: 'fixed-overtime-flag',
    regex: /['"]midi-qol\.OverTime['"]\s*:\s*['"][^'"]*(?:damageRoll=\d+d\d+|saveDC=\d+|saveAbility=(?:str|dex|con|int|wis|cha))/i,
    message: 'Fixed module over-time flags must be built from parsed source mechanics.',
  },
];

const NAMED_REGEX = /\/[^/\n]*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[\u4e00-\u9fff]{2,})[^/\n]*\/[a-z]*/;
const MECHANICS_REGEX =
  /(?:\bsave\s*:\s*{[^}\n]*\bdc\s*:\s*\d+|\bsaveDC\s*=\s*\d+|\bdamageRoll\s*=\s*\d+d\d+|\bgrantsTempHp\s*:\s*\d+|\bsaveAbility\s*=\s*(?:str|dex|con|int|wis|cha)\b)/i;
const FIXED_AC_EFFECT_REGEX = /key\s*:\s*['"]system\.attributes\.ac\.(?:flat|bonus)['"][\s\S]{0,180}value\s*:\s*['"]\d+['"]/i;
const RIDER_MARKER_CONTEXT_REGEX = /RIDER_MARKERS|rider/i;
const NAMED_RIDER_MARKER_SHAPE_REGEX =
  /key\s*:\s*['"][a-z0-9]+-[a-z0-9-]+['"][\s\S]{0,260}pattern\s*:\s*\/[^/\n]*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[\u4e00-\u9fff]{2,})[^/\n]*\//i;
const NAMED_MECHANICS_KEY_BRANCH_REGEX = /\b[A-Za-z0-9_]*Key\s*={2,3}\s*['"][a-z0-9]+-[a-z0-9-]+['"]/;

export function auditAntiOverfitText(filePath: string, text: string): AntiOverfitFinding[] {
  const lines = text.split(/\r?\n/);
  const findings: AntiOverfitFinding[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isAllowed(lines, index)) {
      continue;
    }

    for (const rule of RULES) {
      const match = line.match(rule.regex);
      if (!match) continue;
      findings.push(createFinding(filePath, index, line, rule.rule, rule.message, match.index ?? 0));
    }

    if (NAMED_REGEX.test(line)) {
      const windowText = lines.slice(index, index + 4).join('\n');
      if (MECHANICS_REGEX.test(windowText)) {
        findings.push(createFinding(
          filePath,
          index,
          line,
          'named-mechanics-branch',
          'A named action or creature branch is assigning mechanics. Generalize it or document an explicit exception.',
          0,
        ));
      }
    }

    const namedMarkerWindow = lines.slice(index, index + 8).join('\n');
    if (RIDER_MARKER_CONTEXT_REGEX.test(namedMarkerWindow) && NAMED_RIDER_MARKER_SHAPE_REGEX.test(namedMarkerWindow)) {
      findings.push(createFinding(
        filePath,
        index,
        line,
        'named-rider-marker',
        'Named rider marker tables hard-code sample-specific action segments. Use source-structure parsing instead.',
        0,
      ));
    }

    const keyBranchMatch = line.match(NAMED_MECHANICS_KEY_BRANCH_REGEX);
    if (keyBranchMatch) {
      findings.push(createFinding(
        filePath,
        index,
        line,
        'named-mechanics-key-branch',
        'Mechanics must not branch on generated rider/action keys. Parse the source text instead.',
        keyBranchMatch.index ?? 0,
      ));
    }

    const acWindowText = lines.slice(index, index + 8).join('\n');
    if (FIXED_AC_EFFECT_REGEX.test(acWindowText)) {
      findings.push(createFinding(
        filePath,
        index,
        line,
        'fixed-ac-effect',
        'Fixed AC effects must be parsed from source text or explicitly documented.',
        0,
      ));
    }
  }

  return findings;
}

export function auditAntiOverfitFiles(filePaths: string[]): AntiOverfitFinding[] {
  return filePaths.flatMap((filePath) => {
    if (!existsSync(filePath) || !isAuditableFile(filePath)) return [];
    return auditAntiOverfitText(filePath, readFileSync(filePath, 'utf-8'));
  });
}

function auditAntiOverfitSources(sources: AntiOverfitSource[]): AntiOverfitFinding[] {
  return sources.flatMap((source) => auditAntiOverfitText(source.filePath, source.text));
}

function createFinding(
  filePath: string,
  lineIndex: number,
  line: string,
  rule: AntiOverfitRule,
  message: string,
  columnIndex: number,
): AntiOverfitFinding {
  return {
    filePath,
    line: lineIndex + 1,
    column: columnIndex + 1,
    rule,
    evidence: line.trim(),
    message,
    requiredAction:
      'Classify this as schema-derived, source-derived, corpus-derived, or explicit-exception; otherwise remove the hard-coded rule.',
  };
}

function isAllowed(lines: string[], index: number): boolean {
  const current = lines[index] ?? '';
  const previous = index > 0 ? lines[index - 1] ?? '' : '';
  return ALLOW_COMMENT.test(current) || ALLOW_COMMENT.test(previous);
}

function isAuditableFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

function isProductionAuditableFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return isAuditableFile(normalized)
    && !normalized.includes('/__tests__/')
    && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

function collectDefaultSources(): AntiOverfitSource[] {
  const tracked = collectAddedLineSources();
  const trackedPaths = new Set(tracked.map((source) => source.filePath));
  const untracked = runGitLines(['ls-files', '--others', '--exclude-standard', '--', ...ANTI_OVERFIT_SOURCE_ROOTS])
    .filter(isProductionAuditableFile)
    .filter((filePath) => !trackedPaths.has(filePath))
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({ filePath, text: readFileSync(filePath, 'utf-8') }));
  return [...tracked, ...untracked];
}

function collectAllProductionSources(): AntiOverfitSource[] {
  const paths = new Set([
    ...runGitLines(['ls-files', '--', ...ANTI_OVERFIT_SOURCE_ROOTS]),
    ...runGitLines(['ls-files', '--others', '--exclude-standard', '--', ...ANTI_OVERFIT_SOURCE_ROOTS]),
  ]);
  return [...paths]
    .filter(isProductionAuditableFile)
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({ filePath, text: readFileSync(filePath, 'utf-8') }));
}

function collectAddedLineSources(): AntiOverfitSource[] {
  const diff = runGitText([
    'diff',
    '--unified=0',
    '--diff-filter=ACMRT',
    'HEAD',
    '--',
    ...ANTI_OVERFIT_SOURCE_ROOTS,
  ]);
  const sources = new Map<string, string[]>();
  let currentPath = '';
  let newLineNumber = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      const filePath = line.slice('+++ b/'.length);
      currentPath = isProductionAuditableFile(filePath) ? filePath : '';
      if (currentPath && !sources.has(currentPath)) sources.set(currentPath, []);
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk?.[1]) {
      newLineNumber = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (!currentPath || newLineNumber <= 0) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const lines = sources.get(currentPath) ?? [];
      lines[newLineNumber - 1] = line.slice(1);
      sources.set(currentPath, lines);
      newLineNumber += 1;
      continue;
    }
    if (!line.startsWith('-')) {
      newLineNumber += 1;
    }
  }

  return [...sources.entries()]
    .map(([filePath, lines]) => ({ filePath, text: lines.map((line) => line ?? '').join('\n') }))
    .filter((source) => source.text.trim().length > 0);
}

function runGitLines(args: string[]): string[] {
  return runGitText(args).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runGitText(args: string[]): string {
  return requireGitText(args);
}

export function executeAntiOverfitAudit(
  args: string[],
  dependencies: AntiOverfitAuditDependencies = {},
): AntiOverfitAuditExecutionResult {
  const collectDefault = dependencies.collectDefaultSources ?? collectDefaultSources;
  const collectAll = dependencies.collectAllProductionSources ?? collectAllProductionSources;
  const auditFiles = dependencies.auditFiles ?? auditAntiOverfitFiles;
  const auditSources = dependencies.auditSources ?? auditAntiOverfitSources;

  try {
    const checkAll = args.includes('--all');
    const explicitFiles = args.filter((arg) => !arg.startsWith('-'));
    const sources = explicitFiles.length > 0
      ? []
      : checkAll
        ? collectAll()
        : collectDefault();

    if (checkAll && explicitFiles.length === 0 && sources.length === 0) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: ['anti-overfit audit failed: zero auditable production sources were discovered for --all'],
      };
    }

    const findings = explicitFiles.length > 0
      ? auditFiles(explicitFiles)
      : auditSources(sources);

    if (findings.length === 0) {
      const checkedCount = explicitFiles.length > 0 ? explicitFiles.length : sources.length;
      return {
        exitCode: 0,
        stdout: [`anti-overfit audit passed (${checkedCount} source${checkedCount === 1 ? '' : 's'} checked)`],
        stderr: [],
      };
    }

    const stderr = [
      `anti-overfit audit failed (${findings.length} finding${findings.length === 1 ? '' : 's'})`,
    ];
    for (const finding of findings) {
      stderr.push(`${finding.filePath}:${finding.line}:${finding.column} ${finding.rule}`);
      stderr.push(`  ${finding.message}`);
      stderr.push(`  evidence: ${finding.evidence}`);
      stderr.push(`  required: ${finding.requiredAction}`);
    }
    return { exitCode: 1, stdout: [], stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`anti-overfit audit failed: ${message}`],
    };
  }
}

function runCli(): void {
  const result = executeAntiOverfitAudit(process.argv.slice(2));
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  runCli();
}

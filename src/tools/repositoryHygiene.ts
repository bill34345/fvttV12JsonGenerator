export type RepositoryHygieneRule =
  | 'disposable-generated-output'
  | 'generated-backup'
  | 'runtime-manifest'
  | 'local-workspace-state'
  | 'credential-or-session-path'
  | 'local-runtime-state'
  | 'unclassified-root-scratch';

export interface RepositoryHygieneFinding {
  path: string;
  rule: RepositoryHygieneRule;
  message: string;
}

export interface RepositoryHygieneExecutionResult {
  exitCode: 0 | 1;
  stdout: string[];
  stderr: string[];
  findings: RepositoryHygieneFinding[];
}

export interface RepositoryHygieneDependencies {
  collectTrackedPaths?: () => string[];
}

const RULE_MESSAGES: Record<RepositoryHygieneRule, string> = {
  'disposable-generated-output': 'Generated vault output belongs in the ignored output tree, not Git history.',
  'generated-backup': 'Workflow backup generations are local recovery state and must not be tracked.',
  'runtime-manifest': 'The sync manifest is machine-local workflow state and must be regenerated locally.',
  'local-workspace-state': 'Obsidian workspace layout is user-local state and must not be tracked.',
  'credential-or-session-path': 'Credential, cookie, or session material must never be tracked.',
  'local-runtime-state': 'Project-local Foundry/runtime state is machine-local and must not be tracked.',
  'unclassified-root-scratch': 'Root scratch/output paths must be promoted to a named source, fixture, tool, or documentation path.',
};

// anti-overfit: allow explicit-exception - Task 11 requires this CLI-generated Actor to remain tracked as the audited acceptance artifact.
const TRACKED_GENERATED_ACCEPTANCE_ARTIFACTS = new Set([
  'obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json',
]);

export function inspectTrackedArtifactPaths(paths: string[]): RepositoryHygieneFinding[] {
  const findings: RepositoryHygieneFinding[] = [];
  for (const rawPath of paths) {
    const path = normalizePath(rawPath);
    const rule = classifyProhibitedPath(path);
    if (!rule) continue;
    findings.push({ path, rule, message: RULE_MESSAGES[rule] });
  }
  return findings;
}

export function executeRepositoryHygiene(
  dependencies: RepositoryHygieneDependencies = {},
): RepositoryHygieneExecutionResult {
  try {
    const paths = (dependencies.collectTrackedPaths ?? collectTrackedPaths)();
    if (paths.length === 0) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: ['repository hygiene failed: zero tracked paths were discovered'],
        findings: [],
      };
    }

    const findings = inspectTrackedArtifactPaths(paths);
    if (findings.length === 0) {
      return {
        exitCode: 0,
        stdout: [`repository hygiene passed (${paths.length} tracked paths checked)`],
        stderr: [],
        findings,
      };
    }

    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `repository hygiene failed (${findings.length} finding${findings.length === 1 ? '' : 's'})`,
        ...findings.flatMap((finding) => [
          `${finding.path} ${finding.rule}`,
          `  ${finding.message}`,
        ]),
      ],
      findings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`repository hygiene failed: ${message}`],
      findings: [],
    };
  }
}

function classifyProhibitedPath(path: string): RepositoryHygieneRule | null {
  if (/^obsidian\/[^/]+\/output_backup\//i.test(path)) return 'generated-backup';
  if (TRACKED_GENERATED_ACCEPTANCE_ARTIFACTS.has(path)) return null;
  if (/^obsidian\/[^/]+\/output\//i.test(path)) return 'disposable-generated-output';
  if (/(?:^|\/)\.fvtt-sync-manifest\.json$/i.test(path)) return 'runtime-manifest';
  if (/(?:^|\/)\.obsidian\/workspace(?:-mobile)?\.json$/i.test(path)) return 'local-workspace-state';
  if (/^\.local(?:\/|$)/i.test(path)) return 'local-runtime-state';
  if (isCredentialOrSessionPath(path)) return 'credential-or-session-path';
  if (isUnclassifiedRootScratch(path)) return 'unclassified-root-scratch';
  return null;
}

function isCredentialOrSessionPath(path: string): boolean {
  const basename = path.split('/').at(-1) ?? path;
  if (/^\.env(?:\.|$)/i.test(basename) && !/\.(?:example|sample|template)$/i.test(basename)) return true;
  if (/\.(?:cookies?|pem|key)$/i.test(basename)) return true;
  if (/^(?:id_rsa|id_ed25519)$/i.test(basename)) return true;
  return /(?:^|\/)(?:secrets?|credentials?)(?:\/|$)/i.test(path)
    || /(?:^|\/)[^/]*cookie-header[^/]*$/i.test(path);
}

function isUnclassifiedRootScratch(path: string): boolean {
  return /^(?:debug-[^/]+|temp-items(?:\/|$)|temp(?:\/|-[^/]+)|output(?:\/|\.json$)|test_[^/]+\.js$|verify\.ts$)/i.test(path);
}

function collectTrackedPaths(): string[] {
  return requireGitText(['-c', 'core.quotepath=false', 'ls-files'])
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function runCli(): void {
  const result = executeRepositoryHygiene();
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  runCli();
}
import { requireGitText } from './gitCommand';

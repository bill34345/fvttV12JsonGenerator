import { spawnSync } from 'node:child_process';

export interface GitSpawnResultLike {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
}

export type GitCommandExecutor = (
  command: string,
  args: readonly string[],
  options: { encoding: 'utf8'; windowsHide: true; cwd?: string },
) => GitSpawnResultLike;

interface GitCommandBase {
  command: string;
  args: string[];
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface GitCommandSuccess extends GitCommandBase {
  ok: true;
  status: 0;
}

export interface GitCommandFailure extends GitCommandBase {
  ok: false;
  errorCode?: string;
  errorMessage?: string;
}

export type GitCommandResult = GitCommandSuccess | GitCommandFailure;

export interface GitCommandOptions {
  cwd?: string;
  executor?: GitCommandExecutor;
}

export class GitCommandError extends Error {
  readonly result: GitCommandFailure;

  constructor(result: GitCommandFailure) {
    super(formatGitCommandFailure(result));
    this.name = 'GitCommandError';
    this.result = result;
  }
}

export function runGitCommand(args: readonly string[], options: GitCommandOptions = {}): GitCommandResult {
  const executor = options.executor ?? defaultGitExecutor;
  const raw = executor('git', args, {
    encoding: 'utf8',
    windowsHide: true,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  const base: GitCommandBase = {
    command: renderCommand(args),
    args: [...args],
    status: raw.status,
    stdout: sanitizeDiagnostic(raw.stdout),
    stderr: sanitizeDiagnostic(raw.stderr),
  };

  if (raw.status === 0 && !raw.error) {
    return { ...base, ok: true, status: 0 };
  }

  return {
    ...base,
    ok: false,
    ...(raw.error?.code ? { errorCode: raw.error.code } : {}),
    ...(raw.error?.message ? { errorMessage: sanitizeDiagnostic(raw.error.message) } : {}),
  };
}

export function requireGitText(args: readonly string[], options: GitCommandOptions = {}): string {
  const result = runGitCommand(args, options);
  if (!result.ok) throw new GitCommandError(result);
  return result.stdout;
}

export function formatGitCommandFailure(result: GitCommandFailure): string {
  const reason = result.errorCode
    ? `spawn error ${result.errorCode}`
    : `exit ${result.status ?? 'unknown'}`;
  const diagnostic = result.stderr || result.errorMessage || 'no diagnostic output';
  return `${result.command} failed (${reason}): ${diagnostic}`;
}

function defaultGitExecutor(
  command: string,
  args: readonly string[],
  options: { encoding: 'utf8'; windowsHide: true; cwd?: string },
): GitSpawnResultLike {
  const result = spawnSync(command, [...args], options);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error
      ? {
          error: {
            code: (result.error as NodeJS.ErrnoException).code,
            message: result.error.message,
          },
        }
      : {}),
  };
}

function renderCommand(args: readonly string[]): string {
  return ['git', ...args.map(renderArgument)].join(' ');
}

function renderArgument(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function sanitizeDiagnostic(value: string | null | undefined): string {
  return (value ?? '').replace(/\0/g, '').trim();
}

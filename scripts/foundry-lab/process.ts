import { spawn } from 'node:child_process';
import type { CommandResult } from './types';

export interface RunCommandOptions {
  cwd: string;
  timeoutMs?: number;
  dryRun?: boolean;
  redact?: string[];
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions,
): Promise<CommandResult> {
  const redacted = (value: string) =>
    (options.redact ?? []).reduce(
      (text, secret) => (secret ? text.replaceAll(secret, '<redacted>') : text),
      value,
    );
  const commandLine = redacted([command, ...args].join(' '));
  if (options.dryRun) return { exitCode: 0, stdout: '', stderr: '', commandLine };

  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveResult({
        exitCode: code ?? 1,
        stdout: redacted(stdout),
        stderr: redacted(stderr),
        commandLine,
      });
    });
  });
}

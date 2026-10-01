import { spawn } from 'node:child_process';

export interface TestProcessOptions {
  cmd: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdout?: 'pipe';
  stderr?: 'pipe';
}

/** Own one direct CLI child: drain both pipes, enforce a deadline, and reap it. */
export async function runTestProcess(options: TestProcessOptions, timeoutMs = 15_000): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive subprocess deadline is required.');
  const [command, ...args] = options.cmd;
  if (!command) throw new Error('A subprocess command is required.');
  // Match the repository's coverage runner: observe close after both streams
  // drain, instead of combining Bun.exited with Response(WebStream).text().
  return await new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false, stdout = '', stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => { stdout += chunk; });
    proc.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, timeoutMs);
    proc.once('error', (error) => { clearTimeout(timer); reject(error); });
    proc.once('close', (exitCode) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Test process ${proc.pid} exceeded ${timeoutMs}ms and was reaped. stdoutBytes=${stdout.length}; stderrBytes=${stderr.length}; lastOutput=${stdout.slice(-160)}`));
      else if (exitCode === null) reject(new Error(`Test process ${proc.pid} closed without an exit status.`));
      else resolve({exitCode,stdout,stderr});
    });
  });
}

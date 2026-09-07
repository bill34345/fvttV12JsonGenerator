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
  const proc = Bun.spawn({ ...options, stdout: 'pipe', stderr: 'pipe' });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, timeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
    ]);
    if (timedOut) throw new Error(`Test process ${proc.pid} exceeded ${timeoutMs}ms and was reaped. stdoutBytes=${stdout.length}; stderrBytes=${stderr.length}; lastOutput=${stdout.slice(-160)}`);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
    if (proc.exitCode === null) proc.kill();
    await proc.exited;
  }
}

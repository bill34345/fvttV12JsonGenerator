import { describe, expect, it } from 'bun:test';
import { runCommand } from '../process';

describe('Foundry lab process wrapper', () => {
  it('redacts secrets from the complete dry-run result', async () => {
    const secret = 'dry-run-secret-value';
    const result = await runCommand('example-command', [`--token=${secret}`], {
      cwd: process.cwd(),
      dryRun: true,
      redact: [secret],
    });

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.commandLine).toContain('<redacted>');
  });

  it('redacts secrets from command line and child output', async () => {
    const secret = 'child-process-secret-value';
    const script = `process.stdout.write(${JSON.stringify(secret)}); process.stderr.write(${JSON.stringify(secret)});`;
    const result = await runCommand(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      redact: [secret],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('<redacted>');
    expect(result.stderr).toBe('<redacted>');
    expect(result.commandLine).toContain('<redacted>');
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

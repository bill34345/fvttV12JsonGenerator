import { expect, test } from 'bun:test';
import { runTestProcess } from './subprocess';

test('CLI subprocess drains stdout and stderr concurrently and preserves failure status', async () => {
  const result = await runTestProcess({ cmd: ['bun', '-e', "process.stdout.write('x'.repeat(100000)); process.stderr.write('y'.repeat(100000)); process.exitCode=7"] });
  expect(result.exitCode).toBe(7);
  expect(result.stdout).toBe('x'.repeat(100000));
  expect(result.stderr).toBe('y'.repeat(100000));
});

test('CLI subprocess deadline reaps a child before reporting its timeout', async () => {
  let failure: Error | undefined;
  try { await runTestProcess({ cmd: ['bun', '-e', 'setInterval(() => {}, 1000)'] }, 100); }
  catch (error) { failure = error as Error; }
  expect(failure?.message).toContain('exceeded 100ms and was reaped');
  const childId = Number(failure!.message.match(/process (\d+)/)![1]);
  expect(() => process.kill(childId, 0)).toThrow();
});

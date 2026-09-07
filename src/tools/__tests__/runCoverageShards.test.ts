import { describe, expect, test } from 'bun:test';
import { partitionCoverageTests, runCoverageProcess } from '../runCoverageShards';

describe('bounded coverage execution', () => {
  test('partitions every eligible file exactly once with deterministic owner boundaries', () => {
    const files = ['tests/c.test.ts', 'packages/a/b.spec.ts', 'tests/a.test.ts', 'tests/b.test.ts', 'tests/a.test.ts', 'dist/generated.test.js', 'src/core_test.ts', 'src/foo.ts'];
    const result = partitionCoverageTests(files, 2);
    expect(result).toEqual([['packages/a/b.spec.ts'], ['src/core_test.ts'], ['tests/a.test.ts', 'tests/b.test.ts'], ['tests/c.test.ts']]);
    expect(result).toEqual(partitionCoverageTests([...files].reverse(), 2));
    expect(() => partitionCoverageTests(['../outside.test.ts'])).toThrow('escapes');
    expect(() => partitionCoverageTests([])).toThrow('No tests');
    expect(() => partitionCoverageTests(files, 0)).toThrow('size');
  });
  test('owns success, failure and a hanging direct child without retrying it', async () => {
    await runCoverageProcess(process.execPath, ['-e', 'process.exit(0)']);
    await expect(runCoverageProcess(process.execPath, ['-e', 'process.exit(7)'])).rejects.toThrow('exit 7');
    await expect(runCoverageProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 100)).rejects.toThrow('was reaped');
    await expect(runCoverageProcess(process.execPath, [], 0)).rejects.toThrow('deadline');
  });
});

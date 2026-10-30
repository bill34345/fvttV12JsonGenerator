import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COVERAGE_TEST_PATTERN, DEFERRED_BROWSER_TEST, partitionCoverageTests, runCoverageInventory, runCoverageProcess } from '../runCoverageShards';

describe('bounded coverage execution', () => {
  test('isolates only the named external browser case while retaining companion unit checks', () => {
    const included = new RegExp(COVERAGE_TEST_PATTERN);
    expect(included.test(DEFERRED_BROWSER_TEST)).toBeFalse();
    for (const name of [
      'process memory keeps renderer, GPU, browser, and utility memory separate',
      'session correlation joins only the matching session and states coverage',
      'report rendering renders an SVG',
      'full Chrome restart recovery another unit assertion',
      'bounded coverage execution partitions every eligible file exactly once',
    ]) expect(included.test(name)).toBeTrue();
    expect(included.test(`${DEFERRED_BROWSER_TEST} additional assertion`)).toBeTrue();
  });
  test('Bun applies the exact external-case exclusion before invoking its callback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-coverage-filter-'));
    try {
      const file = join(root, 'filter.test.ts');
      await writeFile(file, `import {describe,test,expect} from 'bun:test';
describe('full Chrome restart recovery',()=>{
  test('relaunches a real dedicated Chrome and resumes the same active session',()=>{throw new Error('EXTERNAL_CALLBACK_EXECUTED')});
  test('another unit assertion',()=>expect(true).toBe(true));
});`);
      const result = Bun.spawn([process.execPath, 'test', file, '--test-name-pattern', COVERAGE_TEST_PATTERN], { stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(result.stdout).text(), new Response(result.stderr).text(), result.exited]);
      expect(exitCode).toBe(0);
      expect(stdout + stderr).not.toContain('EXTERNAL_CALLBACK_EXECUTED');
      expect(stdout + stderr).toContain('1 pass');
      expect(stdout + stderr).toContain('1 filtered out');
    } finally {
      await rm(root, { recursive: true });
    }
  });
  test('partitions every eligible file exactly once with deterministic owner boundaries', () => {
    const files = ['tests/c.test.ts', 'packages/a/b.spec.ts', 'tests/a.test.ts', 'tests/b.test.ts', 'tests/a.test.ts', 'dist/generated.test.js', 'src/core_test.ts', 'src/foo.ts', 'foundry-modules/external/tests.mjs', 'node_modules/external/tests.mjs', '.local/external/tests.mjs', 'coverage/tests.mjs', 'dist/tests.mjs', '.git/tests.mjs', 'tools/contest.mjs'];
    const result = partitionCoverageTests(files, 2);
    expect(result).toEqual([['foundry-modules/external/tests.mjs'], ['packages/a/b.spec.ts'], ['src/core_test.ts'], ['tests/a.test.ts', 'tests/b.test.ts'], ['tests/c.test.ts']]);
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
  test('runs an overlong inventory with original paths, file hooks, order and coverage', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'fvtt-coverage-argv-')));
    try {
      const directory = join(root, 'original-source-directory-'.repeat(5));
      await mkdir(directory);
      const marker = join(root, 'order.jsonl');
      await writeFile(join(directory, 'helper.ts'), 'export const originalHelper = 7;');
      const files: string[] = [];
      for (let index = 0; index < 160; index++) {
        const file = join(directory, index === 159 ? 'tests.mjs' : `${index}-original-test-source-${'x'.repeat(50)}.test.ts`);
        files.push(file);
        await writeFile(file, `import {test,expect,beforeAll,afterAll} from 'bun:test';
import {appendFileSync} from 'node:fs';
import {originalHelper} from './helper.ts';
if (globalThis.coverageOwner !== undefined) throw new Error('PREVIOUS_FILE_NOT_FINISHED');
beforeAll(()=>{globalThis.coverageOwner=${index}});
test('original source ${index}',()=>{
  expect(globalThis.coverageOwner).toBe(${index});
  expect(import.meta.path).toBe(${JSON.stringify(file)});
  expect(originalHelper).toBe(7);
  appendFileSync(${JSON.stringify(marker)},JSON.stringify(${index})+'\\n');
});
test('filtered source ${index}',()=>{throw new Error('FILTER_IGNORED')});
afterAll(()=>{delete globalThis.coverageOwner});`);
      }
      expect(files.join(' ').length).toBeGreaterThan(32_767);
      const report = join(root, 'report');
      await runCoverageInventory(files, report, '^original source ');
      expect((await readFile(marker, 'utf8')).trim().split('\n').map(Number)).toEqual(files.map((_, index) => index));
      const lcov = (await readFile(join(report, 'lcov.info'), 'utf8')).replaceAll('\\', '/');
      expect(lcov).toContain('helper.ts');
      expect(lcov).not.toContain('coverage/argv-');
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

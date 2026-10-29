import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LOCAL_SOURCE_CONTRACTS, selectSourceContractScope } from '../ciSourceContracts';
import { createLocalSourceContractPlan } from '../runLocalSourceContracts';

const repositoryRoot = resolve(import.meta.dir, '../../..');
const wholeFiles = LOCAL_SOURCE_CONTRACTS.filter(contract => !contract.testNames).flatMap(contract => contract.files);
const mixed = LOCAL_SOURCE_CONTRACTS.filter(contract => contract.testNames);
const mixedFiles = mixed.flatMap(contract => contract.files);
const mixedNames = mixed.flatMap(contract => contract.testNames!);

describe('audited local source contracts', () => {
  test('complete scope retains every input and its original pattern', () => {
    const files = [...wholeFiles, ...mixedFiles, 'tests/forge-browser-runtime.test.ts'];
    expect(selectSourceContractScope(files, 'complete', 'unit|source')).toEqual({
      files, testNamePattern: 'unit|source', deferred: [],
    });
  });

  test('portable scope removes only exact whole-source files and reports every mandatory local group', () => {
    const portable = [
      'foundry-modules/midi-qol/tests/browser-update.test.ts',
      'foundry-modules/server-next-external-candidates/classpack/next-migration.test.ts',
      'tests/legacy-next-inputs.test.ts',
      'tools/legacy-next-inputs/index.test.mjs',
      'tests/forge-browser-runtime.test.ts',
      'src/core/spell-resolution/__tests__/spell-cache.test.ts',
      `${wholeFiles[0]}.companion.test.ts`,
    ];
    const result = selectSourceContractScope([...wholeFiles, ...mixedFiles, ...portable], 'portable', '^(?!separate gate$)');
    expect(result.files).toEqual([...mixedFiles, ...portable]);
    expect(result.deferred).toEqual(LOCAL_SOURCE_CONTRACTS);
    expect(selectSourceContractScope(portable, 'portable', '.*').deferred).toEqual(LOCAL_SOURCE_CONTRACTS);
    expect(selectSourceContractScope([wholeFiles[0]!.replaceAll('/', '\\')], 'portable', '.*').files).toEqual([]);
    const selected = new RegExp(result.testNamePattern);
    for (const name of mixedNames) {
      expect(selected.test(name)).toBeFalse();
      expect(selected.test(`${name} additional assertion`)).toBeTrue();
      expect(selected.test(`prefix ${name}`)).toBeTrue();
    }
    expect(selected.test('separate gate')).toBeFalse();
    expect(selected.test('the exact 6x0x5 ItemGrant method skips all seven sources instead of duplicating owned features')).toBeTrue();
    expect(selected.test('persistent fixture tool resumes partial creation without duplicating objects and preserves historical clocks')).toBeTrue();
    expect(new RegExp(selectSourceContractScope(mixedFiles, 'portable', 'portable').testNamePattern).test('suite portable assertion')).toBeTrue();
  });

  test('invalid profiles, repository paths and patterns fail before scope selection', () => {
    expect(() => selectSourceContractScope([], 'typo' as 'portable', '.*')).toThrow('Unknown');
    for (const file of ['', '../outside.test.ts', 'src/../outside.test.ts', '/outside.test.ts', 'F:/outside.test.ts', '\\\\host\\share.test.ts', './tests/a.test.ts', 'tests//a.test.ts', 'tests/a.test.ts\0']) {
      expect(() => selectSourceContractScope([file], 'portable', '.*')).toThrow('Invalid repository');
    }
    expect(() => selectSourceContractScope([], 'complete', '[')).toThrow();
  });

  test('the catalog resolves current tests and the exact mixed names have not drifted', async () => {
    expect(new Set(LOCAL_SOURCE_CONTRACTS.map(contract => contract.id)).size).toBe(LOCAL_SOURCE_CONTRACTS.length);
    for (const contract of LOCAL_SOURCE_CONTRACTS) {
      for (const file of contract.files) {
        expect((await stat(resolve(repositoryRoot, file))).isFile()).toBeTrue();
        for (const name of contract.testNames ?? []) expect(await readFile(resolve(repositoryRoot, file), 'utf8')).toContain(name);
      }
    }
  });

  test('the local plan runs whole-source files once, then exact mixed cases without coverage', () => {
    const plan = createLocalSourceContractPlan();
    expect(plan.commands[0]!.files).toEqual(wholeFiles);
    expect(plan.commands[0]!.testNamePattern).toBeUndefined();
    expect(plan.commands).toHaveLength(1 + mixed.length);
    for (const [index, contract] of mixed.entries()) {
      const command = plan.commands[index + 1]!;
      expect(command.files).toEqual([...contract.files]);
      const included = new RegExp(command.testNamePattern!);
      for (const name of contract.testNames!) {
        expect(included.test(name)).toBeTrue();
        expect(included.test(`${name} additional assertion`)).toBeFalse();
      }
    }
    expect(() => createLocalSourceContractPlan([])).toThrow('At least one');
    expect(() => createLocalSourceContractPlan(['unknown'])).toThrow('Unknown');
  });

  test('Bun excludes exact full names before callbacks and retains portable and near-match companions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-source-filter-'));
    try {
      const sourceName = mixedNames[0]!;
      const [suite, ...rest] = sourceName.split(' ');
      const file = join(root, 'filter.test.ts');
      await writeFile(file, `import {describe,test,expect} from 'bun:test';
describe(${JSON.stringify(suite)},()=>{
test(${JSON.stringify(rest.join(' '))},()=>{throw new Error('LOCAL_SOURCE_CALLBACK_EXECUTED')});
test(${JSON.stringify(`${rest.join(' ')} additional assertion`)},()=>expect(true).toBe(true));
});
test('portable companion',()=>expect(true).toBe(true));`);
      const scope = selectSourceContractScope(mixedFiles, 'portable', '.*');
      const child = Bun.spawn([process.execPath, 'test', file, '--test-name-pattern', scope.testNamePattern], { stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(exitCode).toBe(0);
      expect(stdout + stderr).not.toContain('LOCAL_SOURCE_CALLBACK_EXECUTED');
      expect(stdout + stderr).toContain('2 pass');
      expect(stdout + stderr).toContain('1 filtered out');
    } finally { await rm(root, { recursive: true }); }
  });

  test('a real strict source guard fails the local CLI and its report when source input is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-missing-source-'));
    try {
      const reportPath = join(root, 'report.json');
      const child = Bun.spawn([
        process.execPath, 'run', resolve(repositoryRoot, 'src/tools/runLocalSourceContracts.ts'),
        '--contract=midi-workflow-sources', `--report=${reportPath}`,
      ], { env: { ...process.env, FVTT_LEGACY_NEXT_INPUT_ROOT: join(root, 'absent-inputs') }, stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(exitCode).not.toBe(0);
      expect(stdout + stderr).toContain('missing source is never skipped');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      expect(report.status).toBe('FAIL');
      expect(report.commands[0].status).toBe('FAIL');
      expect(report.commands[0].exitCode).not.toBe(0);
      expect(report.sourceScope.map((contract: { id: string }) => contract.id)).toEqual(['midi-workflow-sources']);
      expect(report.codeScope.revision).toMatch(/^[a-f0-9]{40}$/);
    } finally { await rm(root, { recursive: true }); }
  });
});

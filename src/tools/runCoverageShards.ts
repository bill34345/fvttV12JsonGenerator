import { spawn, spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectSourceContractScope } from './ciSourceContracts';

// CLI integration and the Session Monitor build run in their own public CI steps.
// This real-browser case requires the separate Chrome execution protocol.
export const DEFERRED_BROWSER_TEST = 'full Chrome restart recovery relaunches a real dedicated Chrome and resumes the same active session';
export const COVERAGE_TEST_PATTERN = `^(?!AI Item Intake CLI|Species Intake CLI|CLI document input|AI monster intake CLI|CLI v14 safe icon mode|CLI item import|CLI plaintext actor import|Session Monitor subprocess build gate|${DEFERRED_BROWSER_TEST}$)`;

export function partitionCoverageTests(paths: string[], maximumFiles = 30): string[][] {
  if (!Number.isSafeInteger(maximumFiles) || maximumFiles < 1) throw new Error('Invalid shard size.');
  const files = [...new Set(paths.map(path => path.replaceAll('\\', '/')))]
    .filter(path => /(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || /(?:^|\/)tests\.[cm]?[jt]sx?$/.test(path))
    .filter(path => !path.split('/').some(part => ['node_modules', 'dist', 'coverage', '.git', '.local'].includes(part)))
    .sort();
  if (files.some(path => path.startsWith('/') || path.includes('..') || /^[A-Za-z]:/.test(path))) throw new Error('Test path escapes the repository.');
  if (!files.length) throw new Error('No tests discovered for coverage.');
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split('/');
    const owner = parts[0] === 'tests' ? 'tests' : parts.slice(0, 2).join('/');
    const group = groups.get(owner) ?? [];
    group.push(file);
    groups.set(owner, group);
  }
  return [...groups.values()].flatMap(group => {
    const result: string[][] = [];
    for (let offset = 0; offset < group.length; offset += maximumFiles) result.push(group.slice(offset, offset + maximumFiles));
    return result;
  });
}

/** The watchdog runs outside the test process, including when Bun's event loop stalls. */
export async function runCoverageProcess(command: string, args: string[], timeoutMs = 90_000): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid subprocess deadline.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true, stdio: 'inherit' });
    let expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (expired) reject(new Error(`Coverage subprocess ${child.pid} exceeded ${timeoutMs}ms and was reaped.`));
      else if (code !== 0) reject(new Error(`Coverage subprocess failed with exit ${code}.`));
      else resolve();
    });
  });
}

export async function runCoverageInventory(files: string[], directory: string, testNamePattern: string): Promise<void> {
  const args = [
    'test', '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${directory}`, '--max-concurrency=1',
    '--test-name-pattern', testNamePattern,
  ];
  let paths = files.map(file => resolve(file));
  let argumentRoot: string | undefined;
  try {
    // Windows limits the whole command line to 32767 characters. Bun resolves
    // file symlinks before loading, preserving imports, per-file hooks and LCOV paths.
    if ([process.execPath, ...args, ...paths].join(' ').length > 30_000) {
      await mkdir('coverage', { recursive: true });
      const aliases = await mkdtemp(join('coverage', 'argv-'));
      argumentRoot = aliases;
      paths = await Promise.all(paths.map(async (file, index) => {
        const alias = join(aliases, `${index}.test.ts`);
        await symlink(file, alias, 'file');
        return `./${alias.replaceAll('\\', '/')}`;
      }));
    }
    // The hosted Windows inventory reached its final cases at the former 600s
    // deadline. Allow bounded report finalization on that runner as well.
    await runCoverageProcess(process.execPath, [...args, ...paths], 720_000);
  } finally {
    if (argumentRoot) await rm(argumentRoot, { recursive: true });
  }
}

export async function runCoverageShards(): Promise<void> {
  const discovered = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (discovered.error || discovered.status !== 0) throw discovered.error ?? new Error(discovered.stderr);
  // Bun's aggregate-only function counts cannot be merged across processes.
  // Use the deterministic inventory in ONE process after fixing leaking test state.
  const profile = process.env.FVTT_CI_TEST_PROFILE || 'complete';
  if (profile !== 'complete' && profile !== 'portable') throw new Error(`Unknown CI test profile: ${profile}`);
  const scope = selectSourceContractScope(partitionCoverageTests(discovered.stdout.split('\0').filter(Boolean)).flat(), profile, COVERAGE_TEST_PATTERN);
  const shards = [scope.files];
  const evidenceRoot = await mkdtemp(join(tmpdir(), 'fvtt-coverage-shards-'));
  const manifest = {
    status: 'running', profile, evidenceRoot, functionCoverage: 'single-process Bun report; no aggregate merging', shards,
    deferredBrowserTests: [{ name: DEFERRED_BROWSER_TEST, reason: 'Separate real-Chrome acceptance; not executed by non-browser integration CI.' }],
    localSourceContracts: scope.deferred.map(contract => ({ ...contract, status: 'NOT_EXECUTED', requiredCommand: 'bun run test:local-source-contracts' })),
  };
  await mkdir('coverage', { recursive: true });
  await writeFile('coverage/run.json', JSON.stringify(manifest, null, 2));
  console.log(`Coverage profile: ${profile}; ${scope.deferred.length} historical source-contract groups require the strict local gate.`);
  for (const contract of scope.deferred) console.log(`Historical source contract ${contract.id}: NOT_EXECUTED; run bun run test:local-source-contracts locally.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Test acceptance scope', `- Portable coverage profile: **${profile}**.`,
      '- Dedicated real-Chrome restart acceptance: **NOT_EXECUTED** by this non-browser job.',
      ...scope.deferred.map(contract => `- Historical source contract \`${contract.id}\`: **NOT_EXECUTED** here. ${contract.reason}`),
      ...(scope.deferred.length ? ['- Required local command: `bun run test:local-source-contracts`. Missing or mismatched local inputs fail that gate; these are not counted as cloud passes.'] : []),
      '',
    ].join('\n'));
  }
  try {
    let report = '';
    for (const [index, files] of shards.entries()) {
      const directory = join(evidenceRoot, String(index + 1));
      console.log(`Coverage shard ${index + 1}/${shards.length}: ${files.length} files, starting ${files[0]}`);
      await runCoverageInventory(files, directory, scope.testNamePattern);
      report = await readFile(join(directory, 'lcov.info'), 'utf8');
    }
    await writeFile('coverage/lcov.info', report);
    manifest.status = 'passed';
    console.log('Completed the selected non-browser inventory in one bounded process; the manifest records every separate acceptance gate.');
  } catch (error) {
    manifest.status = 'failed';
    throw error;
  } finally {
    await writeFile('coverage/run.json', JSON.stringify(manifest, null, 2));
  }
}

if (import.meta.main) await runCoverageShards();

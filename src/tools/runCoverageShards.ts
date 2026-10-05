import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CLI integration and the Session Monitor build run in their own public CI steps.
export const COVERAGE_TEST_PATTERN = '^(?!AI Item Intake CLI|Species Intake CLI|CLI document input|AI monster intake CLI|CLI v14 safe icon mode|CLI item import|CLI plaintext actor import|Session Monitor subprocess build gate)';

export function partitionCoverageTests(paths: string[], maximumFiles = 30): string[][] {
  if (!Number.isSafeInteger(maximumFiles) || maximumFiles < 1) throw new Error('Invalid shard size.');
  const files = [...new Set(paths.map(path => path.replaceAll('\\', '/')))]
    .filter(path => /(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?$/.test(path))
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

export async function runCoverageShards(): Promise<void> {
  const discovered = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (discovered.error || discovered.status !== 0) throw discovered.error ?? new Error(discovered.stderr);
  // Bun's aggregate-only function counts cannot be merged across processes.
  // Use the deterministic inventory in ONE process after fixing leaking test state.
  const shards = [partitionCoverageTests(discovered.stdout.split('\0').filter(Boolean)).flat()];
  const evidenceRoot = await mkdtemp(join(tmpdir(), 'fvtt-coverage-shards-'));
  const manifest = { status: 'running', evidenceRoot, functionCoverage: 'single-process Bun report; no aggregate merging', shards };
  await mkdir('coverage', { recursive: true });
  await writeFile('coverage/run.json', JSON.stringify(manifest, null, 2));
  try {
    let report = '';
    for (const [index, files] of shards.entries()) {
      const directory = join(evidenceRoot, String(index + 1));
      console.log(`Coverage shard ${index + 1}/${shards.length}: ${files.length} files, starting ${files[0]}`);
      await runCoverageProcess(process.execPath, [
        'test', '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${directory}`, '--max-concurrency=1',
        '--test-name-pattern', COVERAGE_TEST_PATTERN, ...files.map(file => `./${file}`),
      // The 368-file inventory took over 300s while making steady progress.
      // Keep the single-process report and a bounded margin for the final files.
      ], 450_000);
      report = await readFile(join(directory, 'lcov.info'), 'utf8');
    }
    await writeFile('coverage/lcov.info', report);
    manifest.status = 'passed';
    console.log('Completed the complete test inventory in one bounded process; coverage report requires no merging.');
  } catch (error) {
    manifest.status = 'failed';
    throw error;
  } finally {
    await writeFile('coverage/run.json', JSON.stringify(manifest, null, 2));
  }
}

if (import.meta.main) await runCoverageShards();

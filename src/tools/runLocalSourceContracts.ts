import { spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { LOCAL_SOURCE_CONTRACTS } from './ciSourceContracts';
import type { LocalSourceContract } from './ciSourceContracts';

const repositoryRoot = resolve(import.meta.dir, '../..');

export interface LocalSourceContractCommand {
  contractIds: string[];
  files: string[];
  testNamePattern?: string;
}

export function createLocalSourceContractPlan(
  contractIds: readonly string[] = LOCAL_SOURCE_CONTRACTS.map(contract => contract.id),
): { contracts: readonly LocalSourceContract[]; commands: LocalSourceContractCommand[] } {
  if (!contractIds.length) throw new Error('At least one local source contract is required.');
  for (const id of contractIds) {
    if (!LOCAL_SOURCE_CONTRACTS.some(contract => contract.id === id)) throw new Error(`Unknown local source contract: ${id}`);
  }
  const contracts = LOCAL_SOURCE_CONTRACTS.filter(contract => contractIds.includes(contract.id));
  const whole = contracts.filter(contract => !contract.testNames);
  const commands: LocalSourceContractCommand[] = [];
  if (whole.length) commands.push({
    contractIds: whole.map(contract => contract.id),
    files: [...new Set(whole.flatMap(contract => contract.files))],
  });
  for (const contract of contracts.filter(contract => contract.testNames)) {
    commands.push({
      contractIds: [contract.id],
      files: [...contract.files],
      testNamePattern: `^(?:${contract.testNames!.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
    });
  }
  return { contracts, commands };
}

export async function runLocalSourceContracts(options: {
  contractIds?: readonly string[];
  reportPath?: string;
  environment?: Record<string, string | undefined>;
} = {}): Promise<void> {
  const plan = createLocalSourceContractPlan(options.contractIds);
  const reportPath = resolve(options.reportPath ?? resolve(repositoryRoot, 'coverage/local-source-contracts.json'));
  const report = {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    codeScope: { revision: null as string | null, files: [...new Set(plan.contracts.flatMap(contract => contract.files))] },
    sourceScope: plan.contracts,
    coverage: 'Not a coverage run; original source guards and assertions execute unchanged.',
    commands: plan.commands.map(command => ({ ...command, status: 'NOT_EXECUTED', exitCode: null as number | null })),
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  try {
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
    if (revision.error || revision.status !== 0) throw new Error('Could not identify the checkout for local source contracts.');
    report.codeScope.revision = revision.stdout.trim();
    for (const command of report.commands) {
      command.status = 'RUNNING';
      for (const file of command.files) {
        if (!(await stat(resolve(repositoryRoot, file))).isFile()) throw new Error(`Local source test is not a file: ${file}`);
      }
      console.log(`Local source contracts: ${command.contractIds.join(', ')}`);
      const child = Bun.spawn([
        process.execPath, 'test', '--max-concurrency=1',
        ...(command.testNamePattern ? ['--test-name-pattern', command.testNamePattern] : []),
        ...command.files.map(file => `./${file}`),
      ], { cwd: repositoryRoot, env: options.environment ?? process.env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
      command.exitCode = await child.exited;
      command.status = command.exitCode === 0 ? 'PASS' : 'FAIL';
      if (command.exitCode !== 0) throw new Error(`Local source contract command failed with exit ${command.exitCode}.`);
    }
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    for (const command of report.commands) if (command.status === 'RUNNING') command.status = 'FAIL';
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`Local source contracts ${report.status}: ${reportPath}`);
  }
}

if (import.meta.main) {
  try {
    const contractIds: string[] = [];
    let reportPath: string | undefined;
    for (const argument of Bun.argv.slice(2)) {
      if (argument.startsWith('--contract=')) contractIds.push(argument.slice('--contract='.length));
      else if (argument.startsWith('--report=')) reportPath = argument.slice('--report='.length);
      else throw new Error(`Unknown local source contract argument: ${argument}`);
    }
    await runLocalSourceContracts({ contractIds: contractIds.length ? contractIds : undefined, reportPath });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

import { resolve } from 'node:path';
import { listFoundryOpsCommands } from './commandCatalog';
import { createLabConfig, requireProductionConnection } from './config';
import { resolveFoundryOpsRoute } from './routing';

export interface FoundryOpsCliDependencies {
  runEntrypoint(entrypoint: string, args: string[], environment: Record<string, string | undefined>): Promise<number>;
  stdout(message: string): void;
}

export async function runFoundryOpsCli(
  args: string[],
  dependencies: Partial<FoundryOpsCliDependencies> = {},
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  const stdout = dependencies.stdout ?? ((message: string) => console.log(message));
  if (args.length === 0 || args.includes('--help') || args[0] === 'help') {
    stdout(renderHelp());
    return 0;
  }
  if (args[0] === 'catalog') {
    stdout(JSON.stringify({ ok: true, commands: listFoundryOpsCommands() }, null, 2));
    return 0;
  }

  const route = resolveFoundryOpsRoute(args);
  const apply = route.forwardedArgs.includes('--apply');
  const productionReadAuthorized = route.forwardedArgs.includes('--allow-production-read');
  if (route.command.target === 'production' && apply) {
    if (!productionReadAuthorized) {
      throw new Error('Production read requires the explicit --allow-production-read flag. No production mutation command is exposed.');
    }
    requireProductionConnection(createLabConfig(process.cwd(), environment));
  }
  if (route.command.effect === 'production-mutation') {
    throw new Error('Production mutation is not available from this CLI. It requires a separately authorized runbook.');
  }

  const runEntrypoint = dependencies.runEntrypoint ?? defaultRunEntrypoint;
  return runEntrypoint(route.entrypoint, route.forwardedArgs, { ...environment });
}

function renderHelp(): string {
  const lines = [
    'Foundry Ops：Foundry 本地测试、离线审计和生产只读盘点的统一入口',
    '',
    '先运行 `bun run foundry:ops catalog` 查看每条命令会接触哪里、是否会写入。',
    '生产只读命令必须同时提供 --apply、--allow-production-read 和外部环境配置。',
    '本入口不提供任何生产修改命令，也不会把离线迁移误称为线上修改。',
    '',
    ...listFoundryOpsCommands()
      .filter((command) => command.availability === 'available')
      .map((command) => `  ${command.syntax}`),
  ];
  return lines.join('\n');
}

async function defaultRunEntrypoint(
  entrypoint: string,
  args: string[],
  environment: Record<string, string | undefined>,
): Promise<number> {
  const subprocess = Bun.spawn([process.execPath, 'run', resolve(process.cwd(), entrypoint), ...args], {
    cwd: process.cwd(),
    env: environment,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return subprocess.exited;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && resolve(entry!) === resolve(import.meta.filename);
}

if (isDirectExecution()) {
  process.exitCode = await runFoundryOpsCli(process.argv.slice(2));
}

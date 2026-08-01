import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FOUNDRY_OPS_RUNTIME_ROOT_VARIABLES = [
  'FVTT_OPS_LAB_ROOT',
  'FVTT_OPS_EVIDENCE_ROOT',
  'FVTT_OPS_BACKUP_ROOT',
] as const;

export const FOUNDRY_CI_SANDBOX_ROOT_VARIABLE = 'FVTT_OPS_CI_SANDBOX_ROOT';

export function configuredFoundryOpsRuntimeRoots(
  environment: Record<string, string | undefined>,
): Array<{ name: string; value: string }> {
  return FOUNDRY_OPS_RUNTIME_ROOT_VARIABLES.flatMap((name) => {
    const value = environment[name]?.trim();
    return value ? [{ name, value }] : [];
  });
}

export function assertHermeticCiEnvironment(
  environment: Record<string, string | undefined>,
): void {
  const configured = configuredFoundryOpsRuntimeRoots(environment);
  if (configured.length === 0) return;

  const sandboxValue = environment[FOUNDRY_CI_SANDBOX_ROOT_VARIABLE]?.trim();
  if (sandboxValue && isAbsolute(sandboxValue)) {
    const sandboxRoot = resolve(sandboxValue);
    const unsafe = configured.filter(({ value }) => {
      if (!isAbsolute(value)) return true;
      const rel = relative(sandboxRoot, resolve(value));
      return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    });
    if (unsafe.length === 0) return;
  }

  const details = configured.map(({ name, value }) => `${name}=${value}`).join(', ');
  throw new Error(
    'ci:verify 拒绝继承持久 Foundry Ops 运行根。测试只能使用由 CI 包装器声明的临时沙箱子目录。' +
    `当前配置：${details}。` +
    '不要删除 Windows 用户级配置；请通过 bun run ci:verify 启动受控测试。',
  );
}

if (import.meta.main) {
  try {
    assertHermeticCiEnvironment(process.env);
    console.log('CI 环境预检通过：没有持久 Lab 根，或所有可写根均位于受控临时沙箱。');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export type FoundryOpsEffect = 'read-only' | 'local-mutation' | 'production-mutation';
export type FoundryOpsTarget = 'local' | 'production';

export interface FoundryOpsCommand {
  id: string;
  syntax: string;
  target: FoundryOpsTarget;
  effect: FoundryOpsEffect;
  summary: string;
  owner: 'foundry-ops' | 'session-monitor' | 'monster-spell-resolver';
  availability: 'available' | 'runbook-only';
  applyMakesEffective?: boolean;
}

const COMMANDS: readonly FoundryOpsCommand[] = [
  { id: 'catalog', syntax: 'catalog', target: 'local', effect: 'read-only', summary: '列出全部命令及其权限，不执行项目操作。', owner: 'foundry-ops', availability: 'available' },
  { id: 'assets.inventory', syntax: 'assets inventory [--output-root=...] [--hash-concurrency=4]', target: 'local', effect: 'local-mutation', summary: '只读扫描本地 Foundry 资产并写入 manifest 与精确重复项报告；不复制、移动或删除资产。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.bootstrap', syntax: 'lab bootstrap [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '准备隔离的本地 Foundry 测试环境。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.classpack-v14', syntax: 'lab classpack-v14 [选项] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '准备或切换本地 classpack 测试矩阵。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.patch-sequencer-spritesheet-workers', syntax: 'lab patch-sequencer-spritesheet-workers [--restore] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '检查或修改本地镜像中的 Sequencer 补丁。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.patch-plutonium-quick-insert', syntax: 'lab patch-plutonium-quick-insert [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '检查或修改本地镜像中的 Plutonium/Quick Insert 补丁。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.build-blood-hunter-homebrew', syntax: 'lab build-blood-hunter-homebrew [--source=...] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '生成本地 Blood Hunter 测试内容。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.spell-resolver', syntax: 'lab spell-resolver <动作> [选项]', target: 'local', effect: 'local-mutation', summary: '构建、安装、核验或卸载本地法术解析模块。', owner: 'monster-spell-resolver', availability: 'available' },
  { id: 'lab.diagnose', syntax: 'lab diagnose <动作> [选项]', target: 'local', effect: 'local-mutation', summary: '从已有短时证据生成本地诊断清单或报告。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.classify', syntax: 'lab classify', target: 'local', effect: 'local-mutation', summary: '根据已有清单生成模块获取计划。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.acquire-local', syntax: 'lab acquire-local [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '从本机已配置来源复制模块到本地缓存。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.parity', syntax: 'lab parity', target: 'local', effect: 'local-mutation', summary: '比较本地镜像与已保存清单并写验收报告。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.launch', syntax: 'lab launch <core-test|server-mirror>', target: 'local', effect: 'local-mutation', summary: '启动一个明确的本地 Foundry 测试配置。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.stop', syntax: 'lab stop <core-test|server-mirror>', target: 'local', effect: 'local-mutation', summary: '停止一个明确的本地 Foundry 测试配置。', owner: 'foundry-ops', availability: 'available' },
  { id: 'production.inventory', syntax: 'production inventory --apply --allow-production-read', target: 'production', effect: 'read-only', applyMakesEffective: true, summary: '通过 SSH 只读盘点生产服务器模块，并把结果写到本地。', owner: 'foundry-ops', availability: 'available' },
  { id: 'production.acquire', syntax: 'production acquire --apply --allow-production-read', target: 'production', effect: 'read-only', applyMakesEffective: true, summary: '按已审核计划从生产服务器读取模块副本，写入本地缓存；不修改服务器。', owner: 'foundry-ops', availability: 'available' },
  { id: 'world.audit', syntax: 'world audit <原 worldFootprintAudit 参数>', target: 'local', effect: 'local-mutation', summary: '快照并分析本地世界副本，输出本地证据；不连接生产。', owner: 'foundry-ops', availability: 'available' },
  { id: 'migration.build-candidate', syntax: 'migration build-candidate <参数>', target: 'local', effect: 'local-mutation', summary: '从离线副本生成迁移候选世界；不会直接修改生产服务器。', owner: 'foundry-ops', availability: 'available' },
  { id: 'migration.three-way-audit', syntax: 'migration three-way-audit <参数>', target: 'local', effect: 'local-mutation', summary: '比较三个离线世界快照并写审计报告；不会直接修改生产服务器。', owner: 'foundry-ops', availability: 'available' },
  { id: 'production.mutation', syntax: '[不提供执行] 生产部署、启停、迁移或世界修改', target: 'production', effect: 'production-mutation', summary: '仅保留在单独批准的操作手册中；统一 CLI 故意不提供生产修改入口。', owner: 'foundry-ops', availability: 'runbook-only' },
];

export function listFoundryOpsCommands(): FoundryOpsCommand[] {
  return COMMANDS.map((command) => ({ ...command }));
}

export function findFoundryOpsCommand(id: string): FoundryOpsCommand | undefined {
  const command = COMMANDS.find((candidate) => candidate.id === id);
  return command ? { ...command } : undefined;
}

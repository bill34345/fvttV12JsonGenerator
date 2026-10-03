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
  { id: 'acceptance.prepare', syntax: 'acceptance prepare --input=<absolute-request.json>', target: 'local', effect: 'local-mutation', summary: '执行已审核的本地文件预检，固定合同、候选及指令身份；失败阻止派发。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.ready', syntax: 'acceptance ready --contract=<absolute-contract.json>', target: 'local', effect: 'read-only', summary: '只读核对预检、绝对路径及当前身份，给出可派发状态。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.execute', syntax: 'acceptance execute --contract=<absolute-contract.json>', target: 'local', effect: 'local-mutation', summary: '领取一次执行并运行合同内已审核的本地文件检查，保存原始输出及收据。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.collect', syntax: 'acceptance collect --contract=<absolute-contract.json> --receipt=<absolute-receipt.json>', target: 'local', effect: 'local-mutation', summary: '拒绝陈旧或错误收据，读回原件并写独立的文件检查摘要；不判断玩法。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.resume', syntax: 'acceptance resume --contract=<absolute-contract.json>', target: 'local', effect: 'local-mutation', summary: '恢复当前合同和证据状态，必要时写摘要；不会自动重放已领取操作。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.inspect-batch', syntax: 'acceptance inspect-batch --source=<absolute-source-contract.json>', target: 'local', effect: 'read-only', summary: '只读核对既有Vision5e/Item Macro合同、候选资源与宏序列化；不接触服务。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.prepare-batch', syntax: 'acceptance prepare-batch --input=<absolute-request.json>', target: 'local', effect: 'local-mutation', summary: '生成共用离线合同，固定原业务树只读来源、批次和回调归属，不授予运行权限。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.ready-batch', syntax: 'acceptance ready-batch --contract=<absolute-contract.json>', target: 'local', effect: 'read-only', summary: '报告离线准备及运行派发门禁；本版保留NONE运行授权，拒绝自动派发。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.capture-receipt', syntax: 'acceptance capture-receipt --contract=<absolute-contract.json> --input=<native.json> --context=<context.json>', target: 'local', effect: 'local-mutation', summary: '封装已保存原生读回与独立目标上下文，自动绑定已知ID及指纹；仅写本任务产物。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.import-receipt', syntax: 'acceptance import-receipt --contract=<absolute-contract.json> --input=<envelope.json>', target: 'local', effect: 'local-mutation', summary: '拒绝错批次/目标/候选和陈旧回执，幂等保存原件并独立判断参考数据；不升格为实机通过。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.prepare-runtime', syntax: 'acceptance prepare-runtime --input=<absolute-runtime-request.json>', target: 'local', effect: 'local-mutation', summary: '绑定已明确恢复的Next Vision/Macro批次、实际执行聊天配置及服务身份；只生成运行合同。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.ready-runtime', syntax: 'acceptance ready-runtime --contract=<absolute-runtime-contract.json>', target: 'local', effect: 'read-only', summary: '重新核对执行聊天、现存服务及安装候选字节；没有明确恢复授权则拒绝派发。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.claim-runtime', syntax: 'acceptance claim-runtime --contract=<absolute-runtime-contract.json>', target: 'local', effect: 'local-mutation', summary: '原子领取一次获准宿主派发；自身不发消息、不操作浏览器或启停服务，失败后不自动重放。', owner: 'foundry-ops', availability: 'available' },
  { id: 'acceptance.collect-runtime', syntax: 'acceptance collect-runtime --contract=<absolute-runtime-contract.json> --input=<absolute-runtime-evidence.json>', target: 'local', effect: 'local-mutation', summary: '核对本轮回调及原生证据，幂等保存观察收据；界面、角色、刷新与清理保持父审待完成。', owner: 'foundry-ops', availability: 'available' },
  { id: 'assets.inventory', syntax: 'assets inventory [--output-root=...] [--hash-concurrency=4]', target: 'local', effect: 'local-mutation', summary: '只读扫描本地 Foundry 资产并写入 manifest 与精确重复项报告；不复制、移动或删除资产。', owner: 'foundry-ops', availability: 'available' },
  { id: 'assets.scope', syntax: 'assets scope [--output-root=...]', target: 'local', effect: 'local-mutation', summary: '登记 `.local` 顶层全部内容的所有权、隐私边界和待判断项；只写报告，不读取隐私内容或迁移资产。', owner: 'foundry-ops', availability: 'available' },
  { id: 'assets.migration-plan', syntax: 'assets migration-plan [--target-lab-root=...] [--inventory-summary=...]', target: 'local', effect: 'local-mutation', summary: '根据已验收资产清单生成外置迁移、逐批对账、兼容窗口和回滚方案；只写报告，绝不复制、切换、移动或删除资产。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.bootstrap', syntax: 'lab bootstrap [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '准备隔离的本地 Foundry 测试环境。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.classpack-v14', syntax: 'lab classpack-v14 [选项] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '准备或切换本地 classpack 测试矩阵。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.patch-sequencer-spritesheet-workers', syntax: 'lab patch-sequencer-spritesheet-workers [--restore] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '检查或修改本地镜像中的 Sequencer 补丁。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.patch-plutonium-quick-insert', syntax: 'lab patch-plutonium-quick-insert [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '检查或修改本地镜像中的 Plutonium/Quick Insert 补丁。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.build-blood-hunter-homebrew', syntax: 'lab build-blood-hunter-homebrew [--source=...] [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '生成旧 Plutonium side-data；它不是原生模块合集。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.blood-hunter-v14', syntax: 'lab blood-hunter-v14 <inspect|plan|verify-actor|verify-migration|evidence-manifest> --input=<absolute-json>', target: 'local', effect: 'read-only', summary: '只读验证血猎手 v14 Lab、Actor、迁移快照和 E2E 证据契约。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.spell-resolver', syntax: 'lab spell-resolver <动作> [选项]', target: 'local', effect: 'local-mutation', summary: '构建、安装、核验或卸载本地法术解析模块。', owner: 'monster-spell-resolver', availability: 'available' },
  { id: 'lab.diagnose', syntax: 'lab diagnose <动作> [选项]', target: 'local', effect: 'local-mutation', summary: '从已有短时证据生成本地诊断清单或报告。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.classify', syntax: 'lab classify', target: 'local', effect: 'local-mutation', summary: '根据已有清单生成模块获取计划。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.acquire-local', syntax: 'lab acquire-local [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '从本机已配置来源复制模块到本地缓存。', owner: 'foundry-ops', availability: 'available' },
  { id: 'lab.install-server-next-owned-module', syntax: 'lab install-server-next-owned-module --module-id=<id> --version=<version> [--apply]', target: 'local', effect: 'local-mutation', applyMakesEffective: true, summary: '预览或仅首次安装仓库自有模块到明确配置的本地 ServerNext；拒绝已有目标，不备份、不替换。', owner: 'foundry-ops', availability: 'available' },
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

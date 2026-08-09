# Foundry Ops / Foundry 运维工具规则

## 这个功能是做什么的

本目录统一管理项目本地 Foundry 测试环境、资产范围盘点、离线世界审计/候选迁移，以及经明确授权的生产只读盘点。它不生成 Actor JSON，也不是 Foundry 浏览器模块。`F:\FoundryLab\foundry-v14` 是本地 v14 集成测试环境；唯一生产环境是远程服务器的 8080 Foundry 实例。

## 权限分类

- `read-only`：只读取目标；生产读取仍需 `--allow-production-read`、外部 `FVTT_OPS_PRODUCTION_*` 配置和当前任务授权。
- `local-mutation`：只在精确本地目标生成报告、缓存、快照或修改测试镜像。
- `offline-world mutation`：只处理停止状态、已备份的离线世界副本，不代表修改生产。
- `production-mutation`：统一 CLI 故意不提供执行入口；必须有另行批准的 runbook 和当次授权。

## 路径与数据安全

- 配置入口是 `tools/foundry-ops/src/config.ts`；使用 `FVTT_OPS_LAB_ROOT`、`FVTT_OPS_EVIDENCE_ROOT`、`FVTT_OPS_BACKUP_ROOT`，不得重新写死仓库旧 `.local/foundry-v14`。
- 当前持久本地测试 Lab 是 `F:\FoundryLab\foundry-v14`；原 I 盘副本已退役并删除，不得尝试回退、重建旧路径或制作 junction 伪装旧布局。
- F 盘 Lab 用于真实 Foundry 14.364/dnd5e 5.3.3 集成、短时启动和明确的一次性测试世界。它不是生产，但也是跨测试保留的共享基线；普通自动测试不得删除、损坏或替换其 app/data/world 目录。
- `F:\\FoundryLab\\foundry-v14\\data\\server-mirror` 是默认可复用、已授权的 Foundry v14 测试数据目录；真实模块 E2E 默认复用它和 `fvtt-v14-module-matrix`，不为每个功能复制一套新的 Foundry。若它被其他参与者使用，先等待或协调释放；只有用户明确授权新的隔离入口时才创建额外数据目录。
- 破坏性 fixture 的可变 app、data、world、backup 和 evidence 必须全部位于该测试创建的随机临时根。测试可以通过 `resolveConfiguredClassicLevelEntry()` 只读加载 F 盘 Foundry 的 `classic-level`，但数据库位置必须留在临时根；不得复制整套 Foundry 充当 fixture。
- 拒绝磁盘根、仓库根、链接/junction/reparse point、路径逃逸和身份不明的非空目标。
- inventory、scope 和 migration-plan 报告不构成复制、移动、切换或删除授权；理论重复体积也不是删除建议。
- 不扫描或导出浏览器 profile、Cookie、credentials、私钥和 Foundry `Config` 中的敏感内容；允许的配置迁移必须单独盘点和逐文件核对。
- 世界写操作要求 Foundry 停止、精确世界身份、相邻或指定备份、失败回滚和恢复证据。

## 命令与验证

- 测试配置使用 `createHermeticLabConfig()`，默认不继承 Windows 用户级 `FVTT_OPS_*`。`bun run test:foundry-ops`、`bun run test:foundry-lab` 和 `bun run ci:verify` 都会先创建随机 Windows 临时沙箱，把所有可写根限制在沙箱内，清除 `FVTT_OPS_PRODUCTION_*`，只把 F 盘 `classic-level` 作为只读依赖传入，并在结束时严格校验后清理沙箱。
- `bun run test-isolation:check` 静态检查 Foundry 测试是否显式使用隔离配置；`*:raw` 仅供安全包装器内部调用，不得直接作为人工测试入口。
- 查看权限目录：`bun run foundry:ops catalog`
- 工具测试：`bun run test:foundry-ops`
- Foundry Lab 聚焦测试：`bun run test:foundry-lab`
- 类型与依赖：`bun run typecheck:tools`、`bun run architecture:verify`
- 涉及真实目标时，先运行对应 catalog/dry-run/plan；报告实际目标、读写范围和未执行动作。

## 长时间与生产边界

- 不得自主运行超过 30 分钟的 Foundry、Chrome、Session Monitor、性能或内存监测。
- “生产”只指远程服务器 8080 Foundry；F 盘 Lab 验收属于本地集成测试，不能替代远程 8080 的生产接受，也不得因此自动连接远端。
- 生产只读返回与基线不同（当前已知 234 vs 249）必须视为独立漂移调查；不得为了让检查变绿直接改 expected count。
- 本地迁移、短时启动或资产 hash 对账不能证明生产清单正确，也不能关闭“四小时 Session Monitor 真实会话验收”（内部记录号 `MON-001`）或其他真实会话验收。

## 完成标准

- 命令分类、目标、权限和 fail-closed 行为有聚焦测试。
- 真实操作有精确路径、授权、备份/恢复和事后状态证据。
- 明确区分“生成计划”“完成复制”“完成切换”“删除旧副本”“生产验收”，不得用前一步替代后一步。

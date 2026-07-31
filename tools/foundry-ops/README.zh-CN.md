# Foundry Ops（Foundry 运维工具）

这个目录是项目内所有 Foundry 本地测试、离线世界检查和生产只读盘点的统一边界。它不是生成角色 JSON 的功能，也不是 Foundry 浏览器模块。

## 这个目录现在包含什么

以前，相关工具散落在 `scripts/foundry-lab` 和 `src/tools`，仅看命令名很难判断它会不会写文件、会不会连接生产服务器。现在它们已经收进一个产品目录，并共用一个入口：

```powershell
bun run foundry:ops --help
bun run foundry:ops catalog
```

`catalog` 会用中文列出每条命令的目标和最大权限：

- `read-only`：只读取目标；如果目标是生产服务器，仍需单独授权；
- `local-mutation`：会在本机生成报告、缓存、快照，或修改明确的本地测试镜像；
- `production-mutation`：会修改、启停或迁移生产环境。统一 CLI 故意不提供这种入口，只能走另行批准的操作手册。

“生产迁移”相关的两个现有脚本只处理离线世界副本，因此被正确归类为“修改本地”；它们不会直接修改线上服务器。

目录中的模块可以这样理解：

| 模块 | 用途 |
|---|---|
| `src/cli.ts`、`src/routing.ts`、`src/commandCatalog.ts` | 统一命令入口、命令分类和权限检查 |
| `src/config.ts` | 本地路径、生产连接配置和防止路径逃逸的安全检查 |
| `src/process.ts` | 启动外部程序，并从命令、输出和错误中隐藏敏感值 |
| `src/asset-inventory/`、`src/assetInventory.ts`、`src/localScope.ts` | 只读扫描本地 Foundry 资产，并登记整个 `.local` 顶层的所有权、隐私排除和待判断项 |
| `src/lab/` | 本地 Foundry 实验环境、模组获取、诊断、补丁、启动和停止工具 |
| `src/world-audit/`、`src/worldFootprintAudit.ts` | 对停止状态的本地世界建立只读快照并生成隐私安全的审计报告 |
| `src/production-migration/`、两个 `productionMigration*.ts` | 比较三个本地世界副本并构建离线迁移候选；不会连接或修改生产服务器 |

`spell-resolver` 的本地安装生命周期暂时保留在兼容目录，因为它和 Monster Spell Resolver 的构建流程仍有直接依赖。它会经过同一权限入口，但其物理迁移属于后续的 Monster Spell Resolver 阶段，不能为了清空旧目录而错误归入 Foundry Ops。

## 本地资产只读盘点

运行：

```powershell
bun run foundry:ops assets inventory --hash-concurrency=4
```

它会读取已经注册的本地 Foundry Lab 资产，分别生成以下八类 manifest：

- Foundry 程序和 Node 运行时；
- 模块；
- 游戏系统；
- 世界；
- 备份；
- 验收、诊断和审计证据；
- 历史归档；
- 临时工作区和可重建缓存。

每个普通文件都会记录相对路径、体积、SHA-256、修改时间和文件系统访问时间。访问时间只是 Windows 文件系统提供的尽力信息，可能被延迟或关闭，不能单独证明“最后一次实际使用”。模块、系统和世界还会读取顶层 manifest 中的 ID、版本和公开来源 URL；本地文件 URL 不会写入报告。

报告默认写入忽略目录：

```text
.local/foundry-v14/inventory/asset-inventory/<timestamp>/
```

其中 `summary.md` 是短摘要，`manifest.<category>.json` 是分类型实物清单，`duplicates.json` 和 `duplicates.md` 是完整的字节级重复项报告。“理论重复体积”不是删除建议；同一文件出现在 world、backup、evidence 和 archive 中，可能分别承担运行、恢复和审计职责。

扫描器不会跟随符号链接或 Windows junction，也不会扫描凭据目录、认证 cookie 或 Foundry profile 的 `Config`。遇到未授权链接、扫描期间变化或读取失败时，报告会标记为不完整并返回非零退出码。生成报告本身是唯一写入行为；命令不会复制、移动、删除资产，也不会访问生产环境。

## `.local` 全范围登记

Stage 5A 的 hash 清单只覆盖已经确认 owner 的 Foundry Lab 资产。要检查仓库里是否又出现未登记的本地目录或文件，运行：

```powershell
bun run foundry:ops assets scope
```

该命令只枚举 `.local` 顶层，并把每一项标成：

- `已分类`：已经确认生产者、使用者、可重建性和保留级别；
- `隐私排除`：知道它是什么，但不会递归读取浏览器 profile、OAuth、cookie、桥接状态或截图内容；
- `待人工判断`：实物存在，但现有仓库证据不足以证明 owner 或 canonical copy，必须保留并等待单独决定。

报告默认写到 `.local/foundry-v14/inventory/scope-coverage/<timestamp>/`。其中“范围完整”只表示当前每个顶层条目都已登记；只要仍有“待人工判断”，所有权分类就仍然不是完整状态。无论两者为何值，报告都不构成迁移或删除授权。

## 外置迁移方案（只生成报告）

```powershell
bun run foundry:ops assets migration-plan
```

该命令读取最近一份完整资产清单，按“世界与备份 → 证据与归档 → 程序/模组/系统 → 可重建缓存”生成逐批复制、精确对账、旧路径兼容窗口、回滚和恢复抽样方案。没有选定目标目录时，报告会明确停在“等待选择目标”；即使指定了专用空目录，也只会标记“可以申请复制授权”，不会创建目标、复制、切换、移动或删除任何资产。

目标目录以后由用户单独决定：

```powershell
bun run foundry:ops assets migration-plan --target-lab-root=J:\fvtt-lab
```

报告默认写到 `FVTT_OPS_LAB_ROOT/inventory/migration-plans/<timestamp>/`。目标必须在仓库和当前实验环境之外，不能是磁盘根目录、链接/联接路径或混有其他内容的目录。选择目标不等于授权复制；实际复制、短时 Foundry 验收和旧目录退役分别需要后续授权。

## 生产只读盘点

生产只读命令必须同时满足三件事：

1. 命令带 `--apply`，表示不再只是查看计划；
2. 命令带 `--allow-production-read`，表示本次明确允许连接生产服务器读取；
3. 主机、数据路径和 SSH 身份文件通过外部环境变量提供。

例如：

```powershell
$env:FVTT_OPS_PRODUCTION_SSH_TARGET = '你本机 SSH 配置中的别名'
$env:FVTT_OPS_PRODUCTION_DATA_PATH = '生产 Foundry 数据目录'
$env:FVTT_OPS_PRODUCTION_SSH_IDENTITY = '本机私钥路径'
bun run foundry:ops production inventory --apply --allow-production-read
```

仓库不再保存具体生产主机或生产数据路径。缺少配置时，命令会在建立连接前失败。

## 本地路径配置

这些变量都是可选的；未设置时继续使用现有 `.local/foundry-v14` 结构：

| 环境变量 | 用途 |
|---|---|
| `FVTT_OPS_LAB_ROOT` | 本地 Foundry 测试根目录 |
| `FVTT_OPS_EVIDENCE_ROOT` | 本地证据和报告根目录 |
| `FVTT_OPS_BACKUP_ROOT` | 本地备份根目录；默认是 `FVTT_OPS_LAB_ROOT/backups` |
| `FVTT_OPS_FOUNDRY_ZIP` | Foundry 安装包路径 |
| `FVTT_OPS_WORLD_ID` | 默认世界标识；有精确安全限制的命令仍会校验自己的固定测试世界 |
| `FVTT_REFERENCE_CACHE_ROOT` | 独立的大型参考资料缓存；默认仍为仓库内 `.local/references`，不会跟随 Foundry Lab 一起迁移 |

所有可写根目录仍经过路径逃逸、符号链接和 Windows junction 检查。配置成磁盘根目录或仓库根目录会被拒绝。

## 旧命令兼容

旧的 `bun run foundry:lab ...` 仍然可用，但 `scripts/foundry-lab/cli.ts` 现在只是一个兼容入口：它先进入 Foundry Ops 权限检查，再执行这里的正式实现。旧的实现文件也只保留简短转发层，避免已有导入路径突然失效。

`src/tools/world-audit`、`src/tools/production-migration` 和三个历史工具入口同样只保留兼容转发。正式测试已经和实现一起迁入本目录。

## 长时间验证边界

代理不得启动、等待、轮询或用短测试拼接任何超过 30 分钟的 Chrome、Foundry、Session Monitor、性能或内存持续监测。四小时真实跑团验收由用户在真实使用时亲自运行；代理只做事前检查和事后证据分析。

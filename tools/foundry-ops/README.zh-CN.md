# Foundry Ops（Foundry 运维工具）

这个目录是项目内所有 Foundry 本地测试、离线世界检查和生产只读盘点的统一边界。它不是生成角色 JSON 的功能，也不是 Foundry 浏览器模块。

## 这批整理解决了什么

以前，相关工具散落在 `scripts/foundry-lab` 和 `src/tools`，仅看命令名很难判断它会不会写文件、会不会连接生产服务器。现在先建立统一入口：

```powershell
bun run foundry:ops --help
bun run foundry:ops catalog
```

`catalog` 会用中文列出每条命令的目标和最大权限：

- `read-only`：只读取目标；如果目标是生产服务器，仍需单独授权；
- `local-mutation`：会在本机生成报告、缓存、快照，或修改明确的本地测试镜像；
- `production-mutation`：会修改、启停或迁移生产环境。统一 CLI 故意不提供这种入口，只能走另行批准的操作手册。

“生产迁移”相关的两个现有脚本只处理离线世界副本，因此被正确归类为“修改本地”；它们不会直接修改线上服务器。

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
| `FVTT_OPS_BACKUP_ROOT` | 本地备份根目录 |
| `FVTT_OPS_FOUNDRY_ZIP` | Foundry 安装包路径 |
| `FVTT_OPS_WORLD_ID` | 默认世界标识；有精确安全限制的命令仍会校验自己的固定测试世界 |

所有可写根目录仍经过路径逃逸、符号链接和 Windows junction 检查。配置成磁盘根目录或仓库根目录会被拒绝。

## 旧命令兼容

旧的 `bun run foundry:lab ...` 仍然可用，但现在先经过 Foundry Ops 的权限检查，再转给原实现。`scripts/foundry-lab/config.ts` 也只是指向本目录配置实现的兼容层。

本批没有搬动 `scripts/foundry-lab`、world audit 或离线迁移的上万行实现。下一批才会在保持命令行为和测试不变的前提下，分组迁入这个产品目录。

## 长时间验证边界

代理不得启动、等待、轮询或用短测试拼接任何超过 30 分钟的 Chrome、Foundry、Session Monitor、性能或内存持续监测。四小时真实跑团验收由用户在真实使用时亲自运行；代理只做事前检查和事后证据分析。

# 操作手册索引

本目录只放“实际要怎么操作、怎么恢复、怎么交接”的步骤。功能是否已经通过验收，请看
[验收索引](../acceptance/README.md)；仍未完成的问题，请看[整改索引](../remediation/README.md)。

## 生产服务器和远程操作

机器专属的生产地址、目录、交接记录、维护报告和可执行脚本只保存在操作者本机，已从公开仓库排除。公开文档只说明权限和产品边界，不保存可直接定位或修改真实服务器的资料。新任务需要生产操作时，必须从本机私有运维记录重新确认目标，不能从 GitHub 文档猜测。

生产 inventory/acquire 等只读操作无需逐次对话授权，但仍必须通过目标身份核对、外部配置、`--apply` 和
`--allow-production-read`。生产安装、重启、world hydration、迁移、LevelDB 或任何其他写入仍须在写入前再次取得明确授权。本地 `F:\FoundryLab\foundry-v14` 是可自主使用的测试环境，远程 8080 才是唯一生产环境。完整授权边界见 [ADR-0005](../decisions/0005-production-read-autonomy-and-write-authorization.md)。本机私有 handoff 只保留历史操作证据，未来授权以该 ADR 和当前 tracked runbook 为准。

## 仓库开发

- [短寿命 Worktree 开发与发布](worktree-development.md)：所有仓库修改、生成、测试、commit 与发布闭环。

## Foundry 内容传输和 Adventure

- [不使用系统文件对话框传输 JSON](foundry-json-transfer-without-file-dialog.md)；
- [Foundry v14 原生 Adventure 制作与恢复](foundry-v14-native-adventure-workflow.md)。

## 相关入口

- Actor JSON 的正式验证方法：[Generated Actor / Item Verification](../generated-actor-verification.md)
- 当前支持边界：[Current Support Matrix](../acceptance/current-support-matrix.md)
- 架构和功能归属：[项目架构总览](../architecture/README.md)

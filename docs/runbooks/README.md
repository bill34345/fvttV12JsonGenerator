# 操作手册索引

本目录只放“实际要怎么操作、怎么恢复、怎么交接”的步骤。功能是否已经通过验收，请看
[验收索引](../acceptance/README.md)；仍未完成的问题，请看[整改索引](../remediation/README.md)。

## 生产服务器和远程操作

- [FVTT 远程运维交接](FVTT-REMOTE-OPERATIONS-HANDOFF.zh-CN.md)：新任务接手远程运维时从这里开始；
- [8080 生产维护计划](2026-07-22-fvtt-8080-maintenance-plan.md)：生产维护前的步骤和安全边界；
- [8080 生产维护报告](2026-07-22-fvtt-8080-maintenance-report.md)：对应维护实际做了什么；
- [`cor-cotn` 生产迁移报告](2026-07-28-cor-cotn-production-migration-report.md)：世界迁移经过和证据。

生产读取和生产修改都必须由当前任务单独授权。本地 `F:\FoundryLab\foundry-v14` 是测试环境，远程
8080 才是唯一生产环境。

## Foundry 内容传输和 Adventure

- [不使用系统文件对话框传输 JSON](foundry-json-transfer-without-file-dialog.md)；
- [Foundry v14 原生 Adventure 制作与恢复](foundry-v14-native-adventure-workflow.md)。

## 相关入口

- Actor JSON 的正式验证方法：[Generated Actor / Item Verification](../generated-actor-verification.md)
- 当前支持边界：[Current Support Matrix](../acceptance/current-support-matrix.md)
- 架构和功能归属：[项目架构总览](../architecture/README.md)

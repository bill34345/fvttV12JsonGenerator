# fvtt-house-rules 模块说明

## 范围

本目录是独立的 Foundry VTT 村规模块，只支持 Foundry `14.364` 与 dnd5e `5.3.3`。不得导入同级模块私有代码、根项目业务代码或 Node/Bun API 到浏览器入口。

## 安全规则

- 所有长期世界/Actor/Item 写入必须由确定性的活动 GM 执行，并通过模块事务账本去重。
- 玩家、socket 与聊天数据都不可信；GM 必须重新解析 UUID、所有权、结构化标签和事件 ID。
- 只读取明确的 `flags.fvtt-house-rules` 标签；不得根据中文或英文名称猜测药水、弹药、武器或特性。
- 未验证的版本、模糊的来源、多目标不唯一或未知 schema 必须失败关闭。
- 不得复制 blind roll 原始骰值到模块 flags、聊天卡或审计摘要。
- 安装器只允许配置的本地 Lab mirror，并默认拒绝覆盖已有模块目录。完成 PID、端口、路径和运行者预检后可自主安装和短时 E2E；若 `server-mirror` 被其他参与者占用则等待，不擅自停止或复制 Lab。

## 验证

在本目录执行：

```powershell
bun run typecheck
bun run test
bun run build
bun run verify:artifact
```

测试是规则语义和构建层验证；真实 Foundry 行为仍须由 Lab E2E 单独验证并与生产接受分开报告。

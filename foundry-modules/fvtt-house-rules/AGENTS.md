# fvtt-house-rules 模块说明

## 范围

本目录是独立的村规模块。原目标14.364/5.3.3及下述Mirror配对保留；历史Next14.368/6.0.2的0.1.3药水预览/应用/保护/恢复/重载有指定接受，其余功能及Midi暴击联动仍按原范围。精确14.368/6.0.5及6.0.6属于各自候选，606新增native6路由，药水Apply/完整schema2快照/三Activity/手改保护/Restore/重载代表链已接受；其他村规及可选组合不推广。运行门按src/constants.ts的精确配对拒绝交叉/未来版本；605/606的可选Midi/DAE/Dice So Nice组合未确认时保持失败关闭。浏览器入口继续只用公开browser API。

## 安全规则

- 所有长期世界/Actor/Item 写入必须由确定性的活动 GM 执行，并通过模块事务账本去重。
- 玩家、socket 与聊天数据都不可信；GM 必须重新解析 UUID、所有权、结构化标签和事件 ID。
- 只读取明确的 `flags.fvtt-house-rules` 标签；不得根据中文或英文名称猜测药水、弹药、武器或特性。
- 未验证的版本、模糊的来源、多目标不唯一或未知 schema 必须失败关闭。
- 治疗药水 apply 先确认原始 Activity 快照已保存，再记录 Foundry 实际规范化的应用后映射；restore 只有在当前完整映射与该基线一致时才能替换原图。GM 后改/新增 Activity、生成 ID 冲突或旧 schema1 快照缺少基线时必须保留快照并失败关闭，不能为让恢复测试通过而删除未知内容。
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

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

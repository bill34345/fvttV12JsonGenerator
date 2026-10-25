# 伤势与消逝的灵魂模块规则

## 范围

本目录是 `fvtt-injury-fading-spirits` 复活仪式的唯一实现 owner。模块运行时仅接受 Foundry VTT `14.364` / dnd5e `5.3.3`、Mirror `14.368` / `5.3.3`、历史候选 `14.368` / `6.0.2`、已有部分实机证据的 `14.368` / `6.0.5`，或已有WithCC/NoCC普通复活、未来schema保护、盲骰/贡献、旧卡重放、重载/下一episode及清理限定接受的 `14.368` / `6.0.6` 精确配对。多客户端复活语义仍需本地验收。伤势规则、死亡豁免扩展与管理界面现由 `fvtt-custom-conditions` 负责，旧伤势 API 只经该模块的公开 API 转发。

## 硬边界

- Actor 的 `fadingSpirits` flag 是本模块长期事实；旧 `injury` flag 原值保留而不再写入。ChatMessage 只是交互与审计投影。
- 只有确定性的活动 GM 可以写长期状态。玩家提案必须在 GM 端重验权限、UUID 和事务。
- blind 最终骰的原始面值不得复制到本模块 flags、普通消息或审计历史。
- 任何直接死亡、环境例外、灵魂意愿和贡献成败都保留 GM 确认。
- 不导入其他 Foundry 模块的私有实现，不 patch Foundry/dnd5e prototype，不直接改 LevelDB 或 Compendium。
- 本地安装只允许 `F:\FoundryLab\foundry-v14\data\server-mirror`；生产 8080 环境不在模块工具授权范围。

## 验证

- `bun run test`
- `bun run typecheck`
- `bun run build`
- 机械测试不能代替本地 Foundry 的 GM/玩家多客户端语义回放。

## 完成标准

复活事务在重复操作、双 GM、断线和 GM 切换下只写一次；复活历史完整但不泄露 blind 骰；本地 Lab 回放与自动测试都通过后才可称本地完成。伤势三层裁定属于 Custom Conditions 的验收范围。

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

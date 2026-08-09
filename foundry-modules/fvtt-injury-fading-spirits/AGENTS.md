# 伤势与消逝的灵魂模块规则

## 范围

本目录是 `fvtt-injury-fading-spirits` 的唯一实现 owner。模块只支持 Foundry VTT `14.364` 与 dnd5e `5.3.3`，负责伤势、死亡豁免扩展和消逝的灵魂复活状态机。

## 硬边界

- Actor flags 是长期事实；Active Effect 和 ChatMessage 只是投影/交互。
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

同一事件在重复 hook、双 GM、断线和 GM 切换下只写一次；三层伤势决定前不预写死亡；复活历史完整但不泄露 blind 骰；本地 Lab 回放与自动测试都通过后才可称本地完成。

# Selected Token Sync 模块规则

## 范围

本目录是 `fvtt-selected-token-sync` 的唯一实现 owner。模块只支持 Foundry VTT `14.364` 与 dnd5e `5.3.3`，负责把 Token HUD 发起的核心状态和 v14 `movementAction` 同步到当前框选 Token。

## 硬边界

- 只处理 Token HUD 的核心状态按钮；物品、法术、DAE、MIDI-QOL 或其他程序化 ActiveEffect 不触发同步。
- 移动同步只更新 TokenDocument 的 `movementAction`，不得修改 Actor 移动速度或 Actor system 字段。
- 不 patch Foundry/dnd5e prototype，不直接修改世界 LevelDB，不依赖 `libWrapper`，不导入其他模块私有实现。
- 模式状态是每位用户独立的 client setting；同步只由发起操作的客户端执行，Document 更新由 Foundry 正常广播。
- 本地安装只允许 `F:\FoundryLab\foundry-v14\data\server-mirror`，不连接生产 8080，不创建备份，不覆盖未知模块目录。

## 验证

- `bun run test`
- `bun run typecheck`
- `bun run build`
- `bun run labCli.ts install`（预览）与 `bun run labCli.ts verify-install`
- 在本地 v14.364 / dnd5e 5.3.3 Lab 做状态、overlay、movementAction、权限和多客户端语义回放。

机械测试通过不能代替真实 HUD/Document 语义验收；最终报告必须分别列出两类证据和尚未覆盖的生产/长时层级。

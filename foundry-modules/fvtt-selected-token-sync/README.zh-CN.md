# 框选 Token 同步 / Selected Token Sync

这是一个针对 Foundry VTT `14.364` / dnd5e `5.3.3` 的本地模块。

开启 Token 控制栏里的“框选 Token 同步”后，在一个 Token 的 HUD 中执行下列操作，会同步到当前框选的其他 Token：

- Token HUD 核心状态的添加、删除和 overlay 操作；
- Foundry v14 Token HUD 的移动方式，例如 walk、fly、swim、burrow、crawl、climb，以及“默认”。

“默认”会同步为 `movementAction: null`，不会强制所有 Token 使用 walk。模块也不会修改 `system.attributes.movement.walk` 等 Actor 移动速度字段。

## 使用方式

1. 在 Token 控制栏打开“框选 Token 同步”。
2. 框选需要同步的 Token。
3. 打开其中一个 Token 的 HUD，点击状态或移动方式。
4. 再次关闭工具栏开关即可恢复单 Token 行为。

开关是每位用户独立保存的，默认关闭。同步集合以点击 HUD 时的选择为准；同一个 linked Actor 的多个 Token 只写入一次状态。

模块只处理 Token HUD 的核心状态。由物品、法术、DAE、MIDI-QOL 或其他模块直接创建/删除的 ActiveEffect 不会被本模块批量复制。

## 来源与兼容性

本模块借鉴 Alan Davies 的 [Multi Token Status](https://codeberg.org/cs96and/FoundryVTT-multistatus) 的 MIT 授权实现思路，特别是明确 active 状态、Actor 去重、HUD 来源识别和递归保护。历史 v10-v12 实现使用 `libWrapper`；v14 实现使用公开 hooks，本模块沿用后者，不声明 `libWrapper` 硬依赖。

如果原版 `multistatus` 模块处于启用状态，本模块会拒绝启用同步模式，避免同一操作被复制两次。

## 构建与本地 Lab

```powershell
bun run build.ts
bun run test
bun run typecheck
bun run labCli.ts install
bun run labCli.ts install --apply
bun run labCli.ts verify-install
```

安装器只接受 `F:\FoundryLab\foundry-v14`，只写入其 `data/server-mirror/Data/modules/fvtt-selected-token-sync`，拒绝未知既有目录、链接和非本地目标；它不会创建备份或覆盖现有模块。

本地安装和测试不代表生产环境已经部署或通过长时会话验收。

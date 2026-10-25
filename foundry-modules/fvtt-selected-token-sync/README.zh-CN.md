# 框选 Token 同步 / Selected Token Sync

`0.2.0` 保留 ServerNext Foundry VTT `14.368` / dnd5e `6.0.5` 的既有候选范围，并接受精确配对 `14.368/6.0.6` 的限定 GM HUD/帮助与角色权限边界切片。6.0.6 实际核对了普通/分级状态、linked 去重、overlay、fly、default-null movementAction、GM帮助路由、同GM第二客户端 Poisoned 状态读回，以及玩家回退帮助可见和外来Token不可更新/无HUD边界；玩家同步写入和长时会话仍未接受。37c/37d回退窗口沿用的旧 bundle 文本仍写“606实际语义待验”，这里只把它作为可见/可读证据，不能当作已同步部署证据。Calendaria 位置的原A坐标缺失，用户已选择本轮保留已核当前B并记录缺口继续，原raw12 REVIEW保留，不能说已恢复。该选择只涉及侧栏/窗口尺寸/日历位置等纯界面偏好，不涉及角色数据、功能设置、权限或Hotbar。其它 Core/系统配对未获支持。角色验收环境的额外消息已准确删除并确认原生缺席，作者和唯一whisper均为本轮TempPlayer，别名Dice So Nice!，Atlas归因假设已否证并符合已实装DSN6.3.1欢迎源；native terminal 的 Task 宏、原92宏行 hash、原7 User `_id` 读回、safeMLD/尺寸/viewport/UI、Core 与 Inspector 限定恢复均已闭合，但不等于旧A或完整User/所有Setting恢复。

开启 Token 控制栏里的“框选 Token 同步”后，在一个 Token 的 HUD 中执行下列操作，会同步到当前框选的其他 Token：

- Token HUD 核心状态的添加、删除和 overlay 操作；
- dnd5e 分级状态（例如疲乏）：左键使每个不同角色各自增加一级，右键各自减少一级。原有等级差异保留，等级限制在 0 到系统设定的上限；一个 linked Actor 的多个 Token 只改一次。
- Foundry v14 Token HUD 的移动方式，例如 walk、fly、swim、burrow、crawl、climb，以及“默认”。

“默认”会同步为 `movementAction: null`，不会强制所有 Token 使用 walk。模块也不会修改 Actor 的移动速度；dnd5e 6.x 的各移动速度位于 `system.attributes.movement.speeds`。

## 使用方式

1. 在 Token 控制栏打开“框选 Token 同步”。
2. 框选需要同步的 Token。
3. 打开其中一个 Token 的 HUD，点击状态或移动方式。
4. 再次关闭工具栏开关即可恢复单 Token 行为。

开关是每位用户独立保存的，默认关闭。同步集合以点击 HUD 时的选择为准；同一个 linked Actor 的多个 Token 只写入一次状态。已到 0 级的角色不会因右键重新获得状态，已到最高级的角色也不会阻止其他角色继续升级。

Token 控制栏另有“框选 Token 同步帮助”问号按钮。GM 在统一操作手册合集已启用且接口可用时，会直接打开本模块条目；玩家或合集不可用时，会打开模块随包的只读说明。同步开关关闭、或 multistatus 冲突阻断同步时，仍可查阅说明；阅读不会切换开关或修改角色/Token。

模块内说明和完整离线手册共用本模块的 `docs/manual.json` 正文。6.0.6 的 GM 帮助窗口、同GM第二客户端状态读回和玩家/合集不可用时的随包回退可见性已在限定入口中读回；37c/37d中的随包旧文本仍保留“606实际语义待验”，不作为同步部署证明。玩家同步写入和完整角色矩阵仍不由此放行。

本轮本地候选会在首次创建力竭效果时，等待 dnd5e 完成原生旧字段同步后再处理排队的下一次加级，避免快速连续点击丢失一级。若提示原生同步未完成，当前客户端会暂停后续分级同步；请先核对角色当前状态，再关闭并重新打开同步开关。该修复已通过局部测试，并已在6.0.6限定 GM HUD/同GM第二客户端切片中读回；玩家回退帮助和无权限边界已观察，玩家同步写入仍待。

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

安装器只接受 `F:\FoundryLab\foundry-v14`，只写入其 `data/server-next/Data/modules/fvtt-selected-token-sync`，拒绝已有模块目录、链接和非本地目标；它不会创建备份或覆盖现有模块。安装使用仓库现有的 ServerNext 自有模块安装入口。

本地安装和测试不代表生产环境已经部署或通过长时会话验收。

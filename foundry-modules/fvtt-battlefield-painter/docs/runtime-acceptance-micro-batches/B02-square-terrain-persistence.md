# B02 — Square 六种地形阶段与刷新持久化

只关闭 `SQ-008` 与 `REC-003`。创建 `BP-ACCEPT-20260815-B02-<HHmmss>-Square`，每种组合使用分开的 stroke，避免历史互相污染。

1. 对 fire/frost/brambles 的 stage I、stage II 共六种组合，各画一个三格 connected stroke 和一个单格 disconnected stroke。玩家逐组看到 Tile；GM 导出 terrain、stage、stroke/bundle、cell offsets 和 owned 文档类型。
2. 对每种组合确认同一 stroke 的 connected cells 共用一个 Region；成熟荆棘按已有规则生成 Wall，其他组合不额外引入 Wall。不要把此前 PASS 的完整几何矩阵重跑为本批目标。
3. 任选 frost 多格 stroke 擦除中格，任选 fire stroke 阶段切换；保存操作后的 flags/offsets。刷新 Chrome GM 与内置 Browser 玩家并重新进入 Scene，再证明剩余 offsets、stage、flags 和 `auditScene()` 与刷新前一致。
4. 刷新后再通过 Painter UI 对这两个 stroke 各执行一次合法 erase/stage 操作，证明 flags 不只是存在，而且仍能驱动行为。

证据前缀 `BP-E2E-B02-`。刷新后行为任一失败即冻结并停，不修代码。全部完成才把两个 Case ID 改为 PASS；不要执行移动、媒体或清理测试。

# B04 — Hex Rows 完整 P1 核心

本批只完成 `HEX-007` 的 Hex Rows 半边，不重跑已 PASS 的三地形、六顶点和共享边静态证明。创建 `BP-ACCEPT-20260815-B04-<HHmmss>-HexRows`。

在同一 orientation 逐项保存 preview offsets 与 committed offsets：radius 0 和 4 的 duplicate skip；line A→B/B→A 与 `canvas.grid.getDirectPath`；fill 四端点方向；canvas leave/面板关闭后的 preview 消失。随后用独立 strokes 完成 paint、erase、stage 的 undo/redo，以及 undo 后新操作清空 redo。每步导出排序后的 hex offsets、history 可用状态和 `auditScene()`，玩家保存可见 Tile/墙变化并证明没有 GM 控件。

本批只把报告的 Hex Rows 子结果写为 PASS；`HEX-007` 总 Case 在 B05 完成前仍为 PARTIAL。任一核心行为失败，冻结 `BP-E2E-B04-*` 并停，不修改源码、不转去 Hex Columns。

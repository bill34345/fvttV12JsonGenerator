# B05 — Hex Columns P1 与 offset 生命周期

只关闭 `HEX-006`、`HEX-007` 的剩余部分。创建 `BP-ACCEPT-20260815-B05-<HHmmss>-HexColumns`。

1. 按 B04 的同一证据格式完成 radius 0/4 duplicate、双向 line/directPath、四向 fill、preview 消失、paint/erase/stage undo/redo、新操作清 redo。
2. 对一个多格 mature bramble stroke 保存初始排序 offsets；stage 切换、擦除中格、undo、redo，每一步保存 offsets、Wall canonical endpoints 和 owned counts。最终恢复到对应历史状态时 offsets 必须与该状态首次导出完全相同，且无重复共享边。
3. 玩家保存每个生命周期关键节点的可见 Tile/Wall 结果；玩家不得出现 Painter 控件。

若 B04 已 PASS 且本批全部通过，可把 `HEX-006`、`HEX-007` 更新为 PASS；否则只记录 Columns 子结果。证据前缀 `BP-E2E-B05-*`。失败后停，不进入 P2。
